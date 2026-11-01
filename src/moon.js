// Moon phase, illumination, rise/set and solunar feeding windows.
//
// Everything here is pure arithmetic — no network, no keys. The astronomy is the standard low-precision
// series from Meeus, "Astronomical Algorithms" (ch. 47 & 25), good to roughly a minute for rise/set and
// well under a degree for phase, which is far beyond what a fishing app needs.
//
// Solunar theory (John Alden Knight, 1926) holds that fish feed hardest when the moon is overhead
// (upper transit) or underfoot (lower transit) — the "major" periods — and at moonrise and moonset, the
// "minors". It is folklore, not science, and the app says so; what the catch log does with it is let an
// angler test it against their own fish.

const RAD = Math.PI / 180;
const DAY = 86400e3;
const J1970 = 2440588, J2000 = 2451545;
const toJulian = (ms) => ms / DAY - 0.5 + J1970;
const fromJulian = (j) => (j + 0.5 - J1970) * DAY;
const days = (ms) => toJulian(ms) - J2000;

const e = RAD * 23.4397; // obliquity of the ecliptic

const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const siderealTime = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));

function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { dec: declination(L, 0), ra: rightAscension(L, 0), M, L };
}

function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d);  // ecliptic longitude
  const M = RAD * (134.963 + 13.064993 * d);  // mean anomaly
  const F = RAD * (93.272 + 13.229350 * d);   // mean distance
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  const dt = 385001 - 20905 * Math.cos(M);    // distance, km
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt, l };
}

/** Phase (0 = new, 0.5 = full), illuminated fraction, and the phase's common name. */
export function moonPhase(at = new Date()) {
  const d = days(+at);
  const s = sunCoords(d), m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  const phase = 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI;
  const fraction = (1 + Math.cos(inc)) / 2;
  return { phase, fraction, name: phaseName(phase), emoji: phaseEmoji(phase), age: phase * 29.530588853 };
}

// Named phases get a band of roughly a day either side of the exact moment, the way an almanac labels
// them — "Full Moon" on the calendar means the whole night, not the instant of syzygy.
const PHASES = [
  [0.02, 'New Moon', '🌑'], [0.23, 'Waxing Crescent', '🌒'], [0.27, 'First Quarter', '🌓'],
  [0.48, 'Waxing Gibbous', '🌔'], [0.52, 'Full Moon', '🌕'], [0.73, 'Waning Gibbous', '🌖'],
  [0.77, 'Last Quarter', '🌗'], [0.98, 'Waning Crescent', '🌘'], [1.01, 'New Moon', '🌑'],
];
export const phaseName = (p) => PHASES.find(([t]) => p < t)[1];
export const phaseEmoji = (p) => PHASES.find(([t]) => p < t)[2];

/** Moon position for an observer: altitude in radians, plus the hour angle used for transits. */
export function moonPosition(at, lat, lon) {
  const lw = RAD * -lon, phi = RAD * lat, d = days(+at);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitude(H, phi, c.dec);
  h += RAD * 0.017 / Math.tan(h + RAD * 10.26 / (h + RAD * 5.10)); // refraction
  return { altitude: h, H, dec: c.dec, dist: c.dist };
}

// Rise/set by the hour-angle method: sample altitude hourly over the day and bisect each crossing.
function crossings(startMs, lat, lon, hours = 26) {
  const alt = (ms) => moonPosition(new Date(ms), lat, lon).altitude;
  const out = { rise: null, set: null };
  let prev = alt(startMs);
  for (let i = 1; i <= hours; i++) {
    const t = startMs + i * 3600e3, cur = alt(t);
    if (prev < 0 !== cur < 0) {
      let lo = t - 3600e3, hi = t;
      for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; (alt(mid) < 0 === prev < 0) ? (lo = mid) : (hi = mid); }
      const when = (lo + hi) / 2;
      if (prev < 0 && out.rise === null) out.rise = when;
      if (prev >= 0 && out.set === null) out.set = when;
    }
    prev = cur;
  }
  return out;
}

// Upper transit = moon due south (highest); lower transit = underfoot, ~12h25m away.
function transits(startMs, lat, lon, hours = 26) {
  const alt = (ms) => moonPosition(new Date(ms), lat, lon).altitude;
  const out = [];
  let a = alt(startMs - 3600e3), b = alt(startMs);
  for (let i = 1; i <= hours; i++) {
    const t = startMs + i * 3600e3, c = alt(t);
    if (b > a && b > c) { // local maximum: upper transit
      let lo = t - 2 * 3600e3, hi = t;
      for (let k = 0; k < 20; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; alt(m1) < alt(m2) ? (lo = m1) : (hi = m2); }
      out.push({ type: 'upper', at: (lo + hi) / 2 });
    }
    if (b < a && b < c) { // local minimum: lower transit (underfoot)
      let lo = t - 2 * 3600e3, hi = t;
      for (let k = 0; k < 20; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; alt(m1) > alt(m2) ? (lo = m1) : (hi = m2); }
      out.push({ type: 'lower', at: (lo + hi) / 2 });
    }
    a = b; b = c;
  }
  return out;
}

const MAJOR_MS = 2 * 3600e3;  // majors run about two hours
const MINOR_MS = 60 * 60e3;   // minors about one

/**
 * Solunar windows for one local day, plus a 0-100 "day rating" that peaks at new and full moon.
 * `dayStartMs` should be local midnight for the location (use zonedToEpoch from tides.js).
 */
export function solunar(dayStartMs, lat, lon, tz = 'UTC') {
  const rs = crossings(dayStartMs, lat, lon);
  const tr = transits(dayStartMs, lat, lon);
  const end = dayStartMs + DAY;
  const within = (ms) => ms >= dayStartMs && ms < end;
  const windows = [];
  for (const t of tr) {
    if (!within(t.at)) continue;
    windows.push({ kind: 'major', label: t.type === 'upper' ? 'Moon overhead' : 'Moon underfoot', start: t.at - MAJOR_MS / 2, peak: t.at, end: t.at + MAJOR_MS / 2 });
  }
  if (rs.rise !== null && within(rs.rise)) windows.push({ kind: 'minor', label: 'Moonrise', start: rs.rise - MINOR_MS / 2, peak: rs.rise, end: rs.rise + MINOR_MS / 2 });
  if (rs.set !== null && within(rs.set)) windows.push({ kind: 'minor', label: 'Moonset', start: rs.set - MINOR_MS / 2, peak: rs.set, end: rs.set + MINOR_MS / 2 });
  windows.sort((a, b) => a.start - b.start);

  const ph = moonPhase(new Date(dayStartMs + DAY / 2));
  // Folklore favours the new and full moon; score 0 at the quarters, 100 at syzygy.
  const rating = Math.round(100 * Math.abs(Math.cos(2 * Math.PI * ph.phase)) ** 0.8);
  return { date: new Date(dayStartMs).toISOString().slice(0, 10), tz, moonrise: rs.rise, moonset: rs.set, phase: ph, windows, rating, ratingLabel: ratingLabel(rating) };
}

export const ratingLabel = (r) => (r >= 80 ? 'Excellent' : r >= 60 ? 'Good' : r >= 40 ? 'Fair' : 'Slow');

/** Which solunar window (if any) a moment falls in — used to stamp a logged catch. */
export function windowAt(sol, ms) {
  const w = sol.windows.find((x) => ms >= x.start && ms <= x.end);
  return w ? { kind: w.kind, label: w.label } : null;
}
