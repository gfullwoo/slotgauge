package com.slotgauge.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.google.androidbrowserhelper.trusted.LauncherActivity

/**
 * Launcher and link handler. On first run it asks for location (so the widgets can pick the nearest
 * tide station), then hands the URL to the Trusted Web Activity which shows slotgauge.com full-screen.
 */
class MainActivity : ComponentActivity() {
    private val askLocation = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        TideWidget.refreshNow(this)
        launchSite()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val crash = getSharedPreferences("crash", MODE_PRIVATE)
        val last = crash.getString("last", null)
        if (last != null) { // show the previous crash once, with a copy button, then carry on
            crash.edit().remove("last").apply()
            android.app.AlertDialog.Builder(this).setTitle("SlotGauge crashed last time")
                .setMessage(last.take(4000))
                .setPositiveButton("Copy") { _, _ -> (getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager).setPrimaryClip(android.content.ClipData.newPlainText("crash", last)); start() }
                .setNegativeButton("Continue") { _, _ -> start() }
                .setOnCancelListener { start() }.show()
            return
        }
        start()
    }

    private fun start() {
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        // Ask whenever we don't have it. This used to fire once ever, so anyone who dismissed the very
        // first prompt could never be asked again and the app looked permanently stuck on one state.
        // Android stops showing the dialog itself after two refusals, so this cannot become nagging:
        // shouldShowRequestPermissionRationale() going false while still ungranted means the user has
        // settled on "no", and we leave them to the in-app state picker.
        val settled = !shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_COARSE_LOCATION) &&
            TideData.prefs(this).getBoolean("askedLocation", false)
        if (!granted && !settled) {
            TideData.prefs(this).edit().putBoolean("askedLocation", true).apply()
            askLocation.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
        } else launchSite()
    }

    /**
     * Resolve the state natively and pass it to the web layer, then launch. Chrome's geolocation
     * delegation does not reliably reach a TWA, but this app has the location permission already, so it
     * answers the question itself. Capped at ~2s on a background thread; if it is slow or fails we launch
     * without it and the page falls back to browser geolocation or the user's own pick.
     */
    private fun launchSite() {
        val base: Uri = intent?.data?.takeIf { it.host == getString(R.string.host) } ?: Uri.parse("${TideData.SITE}/?source=android")
        val done = java.util.concurrent.atomic.AtomicBoolean(false)
        val go = { st: String? ->
            if (done.compareAndSet(false, true)) {
                val u = if (st != null && base.getQueryParameter("state") == null) base.buildUpon().appendQueryParameter("state", st).build() else base
                runOnUiThread { openTwa(u) }
            }
        }
        Thread { go(try { TideData.stateHere(this) } catch (e: Exception) { null }) }.start()
        android.os.Handler(mainLooper).postDelayed({ go(null) }, 2200)   // never let the lookup hold the splash
    }

    private fun openTwa(url: Uri) {
        try {
            startActivity(Intent(this, LauncherActivity::class.java).setAction(Intent.ACTION_VIEW).setData(url))
        } catch (e: Exception) {
            // Trusted Web Activity unavailable (no compatible browser?) — open in the default browser instead
            startActivity(Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE))
        }
        finish()
    }
}
