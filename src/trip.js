// Plan my Trip: the facts half. Everything here is computed or fetched — nothing is generated.
//
// Three things behave differently over a planning horizon and the UI has to say so rather than
// quietly show less:
//   tides    NOAA publishes predictions years ahead, so these always resolve.
//   moon     pure arithmetic (src/moon.js), so these always resolve.
//   weather  the National Weather Service forecast runs about seven days. Beyond that there is
//            no forecast, and we return weather: null with a reason instead of inventing one.
import { solunar } from './moon.js';

export const MAX_DAYS = 14;          // a fortnight is the longest trip worth planning at this detail
const DAY = 86400e3;

export const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const dayMs = (s) => Date.parse(s + 'T12:00:00Z');

/** Validate and expand a date range into ISO days. Throws with a readable message. */
export function tripDays(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) throw new Error('Give a start and end date as YYYY-MM-DD.');
  const a = dayMs(start), b = dayMs(end);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new Error('Those dates are not valid.');
  if (b < a) throw new Error('The end date is before the start date.');
  const n = Math.round((b - a) / DAY) + 1;
  if (n > MAX_DAYS) throw new Error(`Trips are planned up to ${MAX_DAYS} days at a time; this one is ${n}.`);
  return Array.from({ length: n }, (_, i) => ymd(a + i * DAY));
}

/** Moon phase, rise/set and the four solunar windows for each day. Always available: arithmetic. */
export function moonAcross(days, lat, lon, tz) {
  return days.map((d) => solunar(Date.parse(d + 'T00:00:00Z'), lat, lon, tz));
}

/** Highs and lows for each day at one station. Beyond NOAA's published range a day comes back empty. */
export async function tidesAcross(tides, stationId, days) {
  const out = [];
  for (const d of days) {
    try {
      const data = await tides.predictions(stationId, { date: d, days: 1 });
      out.push({ date: d, hilo: (data.hilo || []).map((p) => ({ t: p.t, ms: p.ms, type: p.type, v: p.v })) });
    } catch (e) {
      out.push({ date: d, hilo: [], error: 'No predictions published for this day.' });
    }
  }
  return out;
}

/**
 * Forecast per day where one exists. The NWS daily product is day/night periods for about a week;
 * anything past its last period is reported as out of range rather than guessed at.
 */
export function weatherAcross(daily, days) {
  const byDay = new Map();
  for (const p of daily || []) {
    const d = ymd(p.t);
    if (!byDay.has(d)) byDay.set(d, { date: d, day: null, night: null });
    byDay.get(d)[p.day ? 'day' : 'night'] = { name: p.name, tempF: p.tempF, text: p.text, sky: p.sky, pop: p.pop, wind: p.wind, windDir: p.windDir };
  }
  const last = (daily || []).length ? ymd(daily[daily.length - 1].t) : null;
  return days.map((d) => byDay.get(d) || { date: d, day: null, night: null, outOfRange: true, lastForecast: last });
}

/** How much of the window the forecast actually covers — the UI says this out loud. */
export function forecastCoverage(weather) {
  const have = weather.filter((w) => w.day || w.night).length;
  return { days: have, of: weather.length, partial: have > 0 && have < weather.length, none: have === 0 };
}
