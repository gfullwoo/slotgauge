// Which state's rules apply at a lat/lon. Primary: the U.S. Census Bureau geocoder (official, free, no key).
// Anglers are often offshore where no state polygon matches, so we fall back to the nearest supported
// state's coastline box and flag it as offshore (federal-waters zone).
const CENSUS = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';

// Rough lon/lat boxes for supported states' waters; used only for the offshore fallback and for a
// sanity check when the geocoder is unreachable. [west, south, east, north]
export const STATE_BOXES = {
  DE: [-75.79, 38.45, -74.5, 39.84],
  NJ: [-75.56, 38.85, -73.5, 41.36],
  MD: [-79.49, 37.9, -74.8, 39.72],
  VA: [-83.68, 36.54, -74.9, 39.47],
  NY: [-79.76, 40.45, -71.6, 45.02],
  CT: [-73.73, 40.95, -71.6, 42.05],
  NC: [-84.32, 33.84, -75.0, 36.59],
  FL: [-87.63, 24.4, -79.5, 31.0],
};

export function nearestState(lat, lon, codes = Object.keys(STATE_BOXES)) {
  let best = null;
  for (const code of codes) {
    const [w, s, e, n] = STATE_BOXES[code]; if (!STATE_BOXES[code]) continue;
    const dx = lon < w ? w - lon : lon > e ? lon - e : 0, dy = lat < s ? s - lat : lat > n ? lat - n : 0;
    const d = Math.hypot(dx * Math.cos((lat * Math.PI) / 180), dy);
    if (!best || d < best.d) best = { code, d };
  }
  return best;
}

/**
 * locate(lat, lon, {live}) -> { state, name, method, offshore, supported }
 * live = codes we have data for; result.state is always one of them (or null if nothing is close).
 */
export function makeLocator({ live, names = {}, fetchImpl = fetch, cache = new Map() } = {}) {
  return async function locate(lat, lon) {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    if (cache.has(key)) return cache.get(key);
    let found = null, answered = false;
    try {
      const u = `${CENSUS}?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=States&format=json`;
      const r = await fetchImpl(u, { signal: AbortSignal.timeout(4000) });
      if (r.ok) { const j = await r.json(); answered = true; found = j?.result?.geographies?.States?.[0]?.STUSAB || null; }
    } catch (e) { /* geocoder unreachable: box fallback below */ }
    let out;
    if (found && live.includes(found)) out = { state: found, method: 'census', offshore: false, supported: true, detected: found };
    else {
      const near = nearestState(lat, lon, live);
      const offshore = answered && !found;               // geocoder answered "no state" => on the water
      if (found) out = { state: null, method: 'census', offshore: false, supported: false, nearest: near?.code || null, detected: found };   // on land, state not covered
      else if (!near || near.d > 1.5) out = { state: null, method: answered ? 'census' : 'fallback', offshore, supported: false, nearest: near?.code || null, detected: null };
      else out = { state: near.code, method: answered ? 'nearest' : 'fallback', offshore, supported: true, detected: null };
    }
    out.name = out.state ? names[out.state] || out.state : null;
    if (cache.size > 5000) cache.clear();
    cache.set(key, out);
    return out;
  };
}
