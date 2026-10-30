package com.slotgauge.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.PI
import kotlin.math.cos

/** Tide data for the widgets: station choice, fetch from slotgauge.com, cache, and phase math (same rules as the web app). */
object TideData {
    const val SITE = "https://slotgauge.com"
    private const val PREFS = "tides"

    data class Event(val ms: Long, val v: Double, val high: Boolean)
    data class Station(val id: String, val name: String, val state: String, val tz: String, val miles: Double?, val reference: Boolean)
    data class Tide(val station: Station, val events: List<Event>, val fetched: Long)
    data class Phase(val rising: Boolean, val height: Double?, val next: Event?, val prev: Event?)

    fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Station the user picked in the widget settings (null = follow the phone's location). */
    fun manualStation(ctx: Context): Station? = prefs(ctx).getString("manual", null)?.let { parseStation(JSONObject(it)) }
    fun setManualStation(ctx: Context, s: Station?) {
        prefs(ctx).edit().apply { if (s == null) remove("manual") else putString("manual", stationJson(s)) }.apply()
    }

    fun load(ctx: Context): Tide? = try {
        prefs(ctx).getString("tide", null)?.let { parseTide(JSONObject(it)) }
    } catch (e: Exception) { null }

    fun isStale(t: Tide?, maxAgeMs: Long = 3 * 3600_000L) = t == null || System.currentTimeMillis() - t.fetched > maxAgeMs

    /** Blocking network refresh; call from a worker thread. Returns the new tide or null on failure. */
    fun refresh(ctx: Context): Tide? {
        val station = manualStation(ctx) ?: nearestStation(ctx) ?: load(ctx)?.station ?: Station("8557380", "Lewes (Breakwater Harbor)", "DE", "America/New_York", null, true)
        val j = try { getJson("$SITE/api/tides?station=${station.id}&days=2") } catch (e: Exception) { return null }
        val around = j.optJSONArray("around") ?: j.optJSONArray("hilo") ?: return null
        val events = (0 until around.length()).map { i -> val p = around.getJSONObject(i); Event(p.getLong("ms"), p.getDouble("v"), p.getString("type") == "H") }
        val st = j.optJSONObject("station")?.let { parseStation(it) } ?: station
        val tide = Tide(st.copy(miles = station.miles), events, System.currentTimeMillis())
        prefs(ctx).edit().putString("tide", tideJson(tide)).apply()
        return tide
    }

    /** Nearest NOAA station to the phone's last known location; prefers a reference station within 6 miles of the closest one. */
    fun nearestStation(ctx: Context): Station? {
        val loc = lastLocation(ctx) ?: return null
        return try {
            val j = getJson("$SITE/api/tides/stations?lat=%.4f&lon=%.4f&n=10".format(java.util.Locale.US, loc.latitude, loc.longitude))
            val list = j.getJSONArray("stations").let { a -> (0 until a.length()).map { parseStation(a.getJSONObject(it)) } }
            if (list.isEmpty()) return null
            val ref = list.firstOrNull { it.reference }
            if (ref != null && (ref.miles ?: 1e9) <= (list[0].miles ?: 0.0) + 6) ref else list[0]
        } catch (e: Exception) { null }
    }

    fun search(q: String): List<Station> = try {
        val j = getJson("$SITE/api/tides/stations?q=${URLEncoder.encode(q, "UTF-8")}&n=25")
        j.getJSONArray("stations").let { a -> (0 until a.length()).map { parseStation(a.getJSONObject(it)) } }
    } catch (e: Exception) { emptyList() }

    fun lastLocation(ctx: Context): Location? {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        var best: Location? = null
        for (p in lm.allProviders) {
            val l = try { lm.getLastKnownLocation(p) } catch (e: SecurityException) { null } ?: continue
            if (best == null || l.time > best.time) best = l
        }
        return best
    }

    fun phase(t: Tide, now: Long = System.currentTimeMillis()): Phase? {
        val next = t.events.firstOrNull { it.ms > now }
        val prev = t.events.lastOrNull { it.ms <= now }
        val rising = when { next != null -> next.high; prev != null -> !prev.high; else -> return null }
        val height = if (prev != null && next != null) {
            val f = (now - prev.ms).toDouble() / (next.ms - prev.ms)
            prev.v + (next.v - prev.v) * (1 - cos(PI * f)) / 2
        } else null
        return Phase(rising, height, next, prev)
    }

    fun fmtTime(ms: Long, tz: String): String = try {
        Instant.ofEpochMilli(ms).atZone(ZoneId.of(tz)).format(DateTimeFormatter.ofPattern("h:mma", java.util.Locale.US)).replace("AM", "a").replace("PM", "p")
    } catch (e: Exception) { "" }

    // ---- helpers ----
    private fun getJson(url: String): JSONObject {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 10_000; c.readTimeout = 15_000
        c.setRequestProperty("User-Agent", "SlotGauge-Android/1.0")
        try {
            if (c.responseCode !in 200..299) throw IllegalStateException("HTTP ${c.responseCode}")
            return JSONObject(c.inputStream.bufferedReader().readText())
        } finally { c.disconnect() }
    }
    private fun parseStation(o: JSONObject) = Station(o.getString("id"), o.optString("name"), o.optString("state"), o.optString("tz", "America/New_York"), if (o.has("miles")) o.optDouble("miles") else null, o.optString("type") == "reference")
    private fun stationJson(s: Station) = JSONObject().put("id", s.id).put("name", s.name).put("state", s.state).put("tz", s.tz).put("miles", s.miles ?: JSONObject.NULL).put("type", if (s.reference) "reference" else "subordinate").toString()
    private fun tideJson(t: Tide) = JSONObject().put("station", JSONObject(stationJson(t.station))).put("fetched", t.fetched)
        .put("events", JSONArray().apply { t.events.forEach { put(JSONObject().put("ms", it.ms).put("v", it.v).put("type", if (it.high) "H" else "L")) } }).toString()
    private fun parseTide(o: JSONObject): Tide {
        val ev = o.getJSONArray("events").let { a -> (0 until a.length()).map { val p = a.getJSONObject(it); Event(p.getLong("ms"), p.getDouble("v"), p.getString("type") == "H") } }
        return Tide(parseStation(o.getJSONObject("station")), ev, o.getLong("fetched"))
    }

    /** Title-case the all-caps names NOAA uses for some stations. */
    fun niceName(n: String) = n.split(" ").joinToString(" ") { w -> if (w.length > 3 && w == w.uppercase()) w.lowercase().replaceFirstChar { it.uppercase() } else w }
}
