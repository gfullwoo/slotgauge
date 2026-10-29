// Tide predictions from NOAA CO-OPS (free, no key): nearest-station lookup, station search and
// cached daily predictions (high/low list + 30-minute curve) for the app's tide badge and tide view.
//
// Station list: data/tide-stations.json (compact rows [id,name,state,lat,lng,type,tzOffset,referenceId])
// bundled from the NOAA metadata API; the server refreshes it from NOAA in the background once a day.
// Predictions: https://api.tidesandcurrents.noaa.gov/api/prod/datagetter (station local time, feet above MLLW).

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STATIONS_FILE = path.join(__dirname, '..', 'data', 'tide-stations.json');
export const NOAA_STATIONS = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions&units=english';
export const NOAA_DATA = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const UA = 'SlotGauge/1.0 (https://slotgauge.com)';

// NOAA gives the standard-time UTC offset; map it to a zone that also knows about daylight saving.
const TZ_BY_OFFSET = { '-4': 'America/Puerto_Rico', '-5': 'America/New_York', '-6': 'America/Chicago', '-7': 'America/Denver', '-8': 'America/Los_Angeles', '-9': 'America/Anchorage', '-10': 'Pacific/Honolulu', '-11': 'Pacific/Pago_Pago', '10': 'Pacific/Guam', '12': 'Pacific/Majuro', '13': 'Pacific/Tongatapu', '9': 'Pacific/Palau', '6': 'Asia/Dhaka', '7': 'Asia/Bangkok' };
export const tzFor = (offset) => TZ_BY_OFFSET[String(offset)] || 'Etc/UTC';

export function rowToStation([id, name, state, lat, lng, type, tz, ref]) {
  return { id, name, state, lat, lng, type: type === 'R' ? 'reference' : 'subordinate', tz: tzFor(tz), ref: ref || null };
}

export function loadStations(file = STATIONS_FILE) {
  if (!existsSync(file)) return { fetched: null, stations: [] };
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return { fetched: j.fetched, stations: j.stations.map(rowToStation) };
}

/** Convert NOAA metadata JSON into the compact bundled shape. */
export function compactStations(meta) {
  return (meta.stations || []).filter((s) => s.id && Number.isFinite(+s.lat)).map((s) => [s.id, s.name, s.state || '', +(+s.lat).toFixed(4), +(+s.lng).toFixed(4), s.type || '', s.timezonecorr ?? -5, s.reference_id || '']);
}

const R = 3958.8;
export function milesBetween(lat1, lon1, lat2, lon2) {
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestStations(stations, lat, lon, n = 8) {
  return stations.map((s) => ({ ...s, miles: +milesBetween(lat, lon, s.lat, s.lng).toFixed(1) })).sort((a, b) => a.miles - b.miles).slice(0, n);
}

export function searchStations(stations, q, n = 20) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const score = (s) => { const hay = `${s.name} ${s.state} ${s.id}`.toLowerCase(); let sc = 0; for (const w of words) { if (!hay.includes(w)) return -1; sc += hay.startsWith(w) ? 2 : 1; } return sc + (s.type === 'reference' ? 0.5 : 0); };
  return stations.map((s) => [score(s), s]).filter(([sc]) => sc >= 0).sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).slice(0, n).map(([, s]) => s);
}

/** Local date (YYYY-MM-DD) for a zone. */
export function localDate(tz, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Parse NOAA's "YYYY-MM-DD HH:MM" in a zone to epoch ms (DST-aware). */
export function zonedToEpoch(t, tz) {
  const [d, hm] = t.split(' '); const [y, m, day] = d.split('-').map(Number); const [h, mi] = hm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, day, h, mi);
  const off = (ms) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ms; };
  let ms = guess - off(guess); ms = guess - off(ms);
  return ms;
}

/**
 * Tide predictions for a station: highs/lows and a 30-minute curve for `days` days starting on the
 * station's local date `date` (default today). Results cached in memory for 6 hours.
 */
export function makeTides({ stations = loadStations().stations, fetchImpl = fetch, now = () => new Date(), cacheMs = 6 * 3600e3 } = {}) {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const cache = new Map();
  let list = stations;

  async function get(url) {
    const r = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!r.ok) throw new Error(`NOAA ${r.status}`);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || 'NOAA error');
    return j;
  }

  async function predictions(stationId, { date, days = 2 } = {}) {
    const st = byId.get(String(stationId)); if (!st) return null;
    const begin = date || localDate(st.tz, now());
    const key = `${st.id}|${begin}|${days}`;
    const hit = cache.get(key); if (hit && hit.until > Date.now()) return hit.data;
    const base = `station=${st.id}&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&format=json&application=slotgauge`;
    const startMs = zonedToEpoch(`${begin} 00:00`, st.tz), endMs = zonedToEpoch(`${addDays(begin, days)} 00:00`, st.tz);
    // Highs/lows one day either side of the window so the curve and "previous/next" are always complete.
    const hiloAll = (await get(`${NOAA_DATA}?${base}&interval=hilo&begin_date=${addDays(begin, -1).replace(/-/g, '')}&range=${(days + 2) * 24}`)).predictions || [];
    const hiloX = hiloAll.map((p) => ({ t: p.t, ms: zonedToEpoch(p.t, st.tz), v: +(+p.v).toFixed(2), type: p.type }));
    let curve;
    if (st.type === 'reference') {
      // Reference (harmonic) stations publish a real curve; subordinate stations only publish highs and lows.
      try { curve = ((await get(`${NOAA_DATA}?${base}&interval=30&begin_date=${begin.replace(/-/g, '')}&range=${days * 24}`)).predictions || []).map((p) => ({ t: p.t, ms: zonedToEpoch(p.t, st.tz), v: +(+p.v).toFixed(2) })); } catch { curve = null; }
    }
    if (!curve || !curve.length) curve = synthCurve(hiloX, startMs, endMs, st.tz);
    const data = {
      station: st, datum: 'MLLW', units: 'ft', begin, days, start: startMs, end: endMs,
      hilo: hiloX.filter((p) => p.ms >= startMs && p.ms < endMs), around: hiloX, curve,
      fetched: new Date().toISOString(),
    };
    cache.set(key, { until: Date.now() + cacheMs, data });
    return data;
  }

  /** Refresh the station list from NOAA (used by the daily background refresh and the bundling script). */
  async function refreshStations() {
    const meta = await get(NOAA_STATIONS);
    const rows = compactStations(meta);
    if (rows.length > 1000) { list = rows.map(rowToStation); byId.clear(); for (const s of list) byId.set(s.id, s); }
    return rows;
  }

  return {
    get stations() { return list; },
    station: (id) => byId.get(String(id)) || null,
    nearest: (lat, lon, n) => nearestStations(list, lat, lon, n),
    search: (q, n) => searchStations(list, q, n),
    byState: (code) => list.filter((s) => s.state === String(code).toUpperCase()).sort((a, b) => a.name.localeCompare(b.name)),
    predictions, refreshStations,
    /** Current phase from a prediction set: rising/falling plus the next high/low. */
    phase: (data, at = now().getTime()) => phaseAt(data, at),
  };
}

export function addDays(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + n)); return dt.toISOString().slice(0, 10); }

/** Cosine interpolation between successive highs/lows at 30-minute steps (what NOAA's own tide tables assume). */
export function synthCurve(hilo, startMs, endMs, tz) {
  const pts = [];
  if (hilo.length < 2) return pts;
  for (let ms = startMs; ms < endMs; ms += 1800e3) {
    let i = hilo.findIndex((p) => p.ms > ms); if (i <= 0) continue;
    const a = hilo[i - 1], b = hilo[i]; const f = (ms - a.ms) / (b.ms - a.ms);
    pts.push({ t: fmtZoned(ms, tz), ms, v: +(a.v + (b.v - a.v) * (1 - Math.cos(Math.PI * f)) / 2).toFixed(2) });
  }
  return pts;
}
export function fmtZoned(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export function phaseAt(data, at) {
  const hilo = data.around || data.hilo; if (!hilo?.length) return null;
  const next = hilo.find((p) => p.ms > at) || null;
  const prev = [...hilo].reverse().find((p) => p.ms <= at) || null;
  const rising = next ? next.type === 'H' : prev ? prev.type === 'L' : null;
  let height = null;
  if (data.curve?.length) { const c = data.curve; let best = c[0]; for (const p of c) if (Math.abs(p.ms - at) < Math.abs(best.ms - at)) best = p; height = best.v; }
  else if (prev && next) { const f = (at - prev.ms) / (next.ms - prev.ms); height = +(prev.v + (next.v - prev.v) * (1 - Math.cos(Math.PI * f)) / 2).toFixed(2); }
  return { rising, height, next, prev, minutesToNext: next ? Math.round((next.ms - at) / 60000) : null };
}
