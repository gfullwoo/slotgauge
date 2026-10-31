// Local weather from the National Weather Service (api.weather.gov — free, no key, US only).
// points → nearest observation station (current conditions) + hourly + 7-day forecast.
// Results cached in memory by rounded lat/lon: observations 10 min, forecasts 30 min, point lookups 1 day.

const UA = 'SlotGauge/1.0 (https://slotgauge.com; greg.fullwood@gmail.com)';
export const NWS = 'https://api.weather.gov';

const cToF = (c) => (c == null ? null : Math.round(c * 9 / 5 + 32));
const kmhToMph = (k) => (k == null ? null : Math.round(k / 1.609344));
const paToInHg = (p) => (p == null ? null : +(p / 3386.389).toFixed(2));
const mToMi = (m) => (m == null ? null : +(m / 1609.344).toFixed(1));
const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const degToDir = (d) => (d == null ? null : DIRS[Math.round(((d % 360) + 360) % 360 / 22.5) % 16]);

/**
 * Normalize an NWS description / icon into one of a few sky states the UI can draw:
 * clear, partly, cloudy, fog, rain, storm, snow, wind.
 */
export function skyFrom(text = '', icon = '') {
  const t = `${text} ${icon}`.toLowerCase();
  if (/thunder|tsra|storm/.test(t)) return 'storm';
  if (/snow|sleet|flurr|blizzard|ice|freezing|\bsn\b|fzra/.test(t)) return 'snow';
  if (/rain|shower|drizzle|\bra\b|tsra|precip/.test(t)) return 'rain';
  if (/fog|mist|haze|smoke|\bfg\b/.test(t)) return 'fog';
  if (/overcast|cloudy|\bovc\b|\bbkn\b/.test(t) && !/partly|mostly sunny|mostly clear/.test(t)) return 'cloudy';
  if (/partly|mostly sunny|mostly clear|\bsct\b|few clouds|\bfew\b/.test(t)) return 'partly';
  if (/wind|breezy|blustery/.test(t)) return 'wind';
  if (/clear|sunny|fair|\bskc\b/.test(t)) return 'clear';
  return 'partly';
}

export function makeWeather({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  const cache = new Map();
  const remember = (k, ttl, v) => { cache.set(k, { until: now() + ttl, v }); return v; };
  const hit = (k) => { const e = cache.get(k); return e && e.until > now() ? e.v : null; };
  async function get(url) {
    const r = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/geo+json, application/json' } });
    if (!r.ok) throw new Error(`NWS ${r.status} for ${url}`);
    return r.json();
  }

  async function point(lat, lon) {
    const k = `pt|${lat.toFixed(2)},${lon.toFixed(2)}`;
    const c = hit(k); if (c) return c;
    const p = (await get(`${NWS}/points/${lat.toFixed(4)},${lon.toFixed(4)}`)).properties;
    const stations = (await get(p.observationStations)).features || [];
    const st = stations[0]?.properties;
    return remember(k, 86400e3, {
      forecast: p.forecast, hourly: p.forecastHourly, tz: p.timeZone,
      place: p.relativeLocation?.properties ? `${p.relativeLocation.properties.city}, ${p.relativeLocation.properties.state}` : null,
      station: st ? { id: st.stationIdentifier, name: st.name } : null,
    });
  }

  async function current(pt) {
    if (!pt.station) return null;
    const k = `obs|${pt.station.id}`; const c = hit(k); if (c) return c;
    let o;
    try { o = (await get(`${NWS}/stations/${pt.station.id}/observations/latest`)).properties; } catch { return remember(k, 300e3, null); }
    const v = (x) => (x && x.value != null ? x.value : null);
    return remember(k, 600e3, {
      at: o.timestamp, text: o.textDescription || '', icon: o.icon || '', sky: skyFrom(o.textDescription, o.icon),
      tempF: cToF(v(o.temperature)), feelsF: cToF(v(o.heatIndex) ?? v(o.windChill) ?? v(o.temperature)),
      windMph: kmhToMph(v(o.windSpeed)), gustMph: kmhToMph(v(o.windGust)), windDir: degToDir(v(o.windDirection)),
      humidity: v(o.relativeHumidity) != null ? Math.round(v(o.relativeHumidity)) : null,
      pressureInHg: paToInHg(v(o.barometricPressure)), visibilityMi: mToMi(v(o.visibility)),
      station: pt.station,
    });
  }

  async function forecasts(pt) {
    const k = `fc|${pt.hourly}`; const c = hit(k); if (c) return c;
    const [h, d] = await Promise.all([get(pt.hourly).catch(() => null), get(pt.forecast).catch(() => null)]);
    const hourly = (h?.properties?.periods || []).slice(0, 36).map((p) => ({ t: p.startTime, tempF: p.temperature, text: p.shortForecast, sky: skyFrom(p.shortForecast, p.icon), day: p.isDaytime, pop: p.probabilityOfPrecipitation?.value ?? 0, windMph: parseInt(p.windSpeed, 10) || 0, windDir: p.windDirection, humidity: p.relativeHumidity?.value ?? null }));
    const daily = (d?.properties?.periods || []).slice(0, 14).map((p) => ({ name: p.name, t: p.startTime, day: p.isDaytime, tempF: p.temperature, text: p.shortForecast, detail: p.detailedForecast, sky: skyFrom(p.shortForecast, p.icon), pop: p.probabilityOfPrecipitation?.value ?? 0, wind: p.windSpeed, windDir: p.windDirection }));
    return remember(k, 1800e3, { hourly, daily, updated: h?.properties?.updateTime || d?.properties?.updateTime || null });
  }

  /** Everything the app needs for a location, in one call. */
  async function at(lat, lon) {
    const pt = await point(lat, lon);
    const [cur, fc] = await Promise.all([current(pt), forecasts(pt)]);
    // Fall back to the first hourly period when the station has no fresh observation.
    const nowHour = fc.hourly[0] || null;
    const sky = cur?.sky || nowHour?.sky || 'partly';
    const isNight = nowHour ? !nowHour.day : false;
    return { place: pt.place, tz: pt.tz, current: cur, hourly: fc.hourly, daily: fc.daily, updated: fc.updated, sky, night: isNight, source: 'National Weather Service' };
  }

  return { at, point, current, forecasts };
}
