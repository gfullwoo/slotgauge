// Catch log: what was caught, where, and the conditions at that moment.
//
// The point of the log is not record-keeping — it is that every entry is automatically stamped with the
// tide phase, moon phase, solunar window and weather, so that after a season the angler can ask "when do
// I actually catch fish?" and get an answer from their own water rather than from folklore.
//
// Storage mirrors billing.js: an in-memory implementation for dev/tests and a Firestore one for Cloud Run.

export const MAX_NOTE = 500;
export const SPECIES_MAX = 80;

/**
 * Tide phase in the four buckets anglers actually talk about. `at` is the moment being described — a
 * fish logged yesterday must be judged against yesterday's tide, never the clock on the wall.
 * Slack is the 45 minutes either side of a high or low.
 */
export const SLACK_MIN = 45;
export function tideStage(phase, at) {
  if (!phase) return null;
  const mins = phase.minutesToNext;
  if (mins !== null && mins <= SLACK_MIN) return phase.next?.type === 'H' ? 'high slack' : 'low slack';
  if (phase.prev && at != null) {
    const sincePrev = Math.round((at - phase.prev.ms) / 60000);
    if (sincePrev >= 0 && sincePrev <= SLACK_MIN) return phase.prev.type === 'H' ? 'high slack' : 'low slack';
  }
  return phase.rising ? 'incoming' : 'outgoing';
}

/** Normalize and validate what the client sent. Throws Error with a user-safe message. */
export function cleanCatch(body = {}) {
  const species = String(body.species || '').trim().slice(0, SPECIES_MAX);
  if (!species) throw new Error('Which species did you catch?');
  const at = body.at ? new Date(body.at) : new Date();
  if (Number.isNaN(+at)) throw new Error('That date and time could not be read.');
  if (+at > Date.now() + 3600e3) throw new Error('That is in the future.');
  const lengthIn = body.lengthIn == null || body.lengthIn === '' ? null : Number(body.lengthIn);
  if (lengthIn !== null && (!Number.isFinite(lengthIn) || lengthIn <= 0 || lengthIn > 300)) throw new Error('Length should be in inches.');
  const weightLb = body.weightLb == null || body.weightLb === '' ? null : Number(body.weightLb);
  if (weightLb !== null && (!Number.isFinite(weightLb) || weightLb <= 0 || weightLb > 3000)) throw new Error('Weight should be in pounds.');
  const lat = body.lat == null ? null : Number(body.lat);
  const lon = body.lon == null ? null : Number(body.lon);
  if (lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) throw new Error('That latitude is not valid.');
  if (lon !== null && (!Number.isFinite(lon) || Math.abs(lon) > 180)) throw new Error('That longitude is not valid.');
  return {
    species, at: at.toISOString(), lengthIn, weightLb, lat, lon,
    kept: body.kept === true || body.kept === 'true',
    released: body.released === true || body.released === 'true',
    place: String(body.place || '').trim().slice(0, 120) || null,
    state: String(body.state || '').trim().slice(0, 2).toLowerCase() || null,
    note: String(body.note || '').trim().slice(0, MAX_NOTE) || null,
    scanId: body.scanId ? String(body.scanId).slice(0, 64) : null,
  };
}

/**
 * Stamp a catch with the conditions at the moment it happened. Every lookup is best-effort: a logged
 * fish must never be lost because NOAA or the weather service was briefly down.
 */
export async function stampConditions(rec, { tides, weather, moon, stations }) {
  const stamp = { tide: null, moon: null, solunar: null, weather: null, station: null };
  const at = +new Date(rec.at);
  if (rec.lat != null && rec.lon != null) {
    try {
      const day = new Date(at).toISOString().slice(0, 10);
      const near = stations ? stations(rec.lat, rec.lon, 1)[0] : null;
      if (near && tides) {
        const data = await tides.predictions(near.id, { date: day, days: 1 });
        const phase = tides.phase(data, at);
        if (phase) stamp.tide = { stage: tideStage(phase, at), heightFt: phase.height, rising: phase.rising, minutesToNext: phase.minutesToNext, nextType: phase.next?.type ?? null };
        stamp.station = { id: near.id, name: near.name };
      }
    } catch { /* conditions are a bonus, not a requirement */ }
    try {
      if (moon) {
        const dayStart = Date.parse(`${new Date(at).toISOString().slice(0, 10)}T00:00:00Z`);
        const sol = moon.solunar(dayStart, rec.lat, rec.lon);
        stamp.solunar = { window: moon.windowAt(sol, at), rating: sol.rating, ratingLabel: sol.ratingLabel };
        const ph = moon.moonPhase(new Date(at));
        stamp.moon = { phase: +ph.phase.toFixed(4), fraction: +ph.fraction.toFixed(3), name: ph.name, emoji: ph.emoji };
      }
    } catch { /* ignore */ }
    try {
      if (weather) {
        const w = await weather.at(rec.lat, rec.lon);
        const c = w.current;
        if (c) stamp.weather = { sky: c.sky, text: c.text, tempF: c.tempF, windMph: c.windMph, windDir: c.windDir, pressureInHg: c.pressureInHg };
        else stamp.weather = { sky: w.sky, text: '', tempF: null, windMph: null, windDir: null, pressureInHg: null };
      }
    } catch { /* ignore */ }
  } else if (moon) {
    const ph = moon.moonPhase(new Date(at));
    stamp.moon = { phase: +ph.phase.toFixed(4), fraction: +ph.fraction.toFixed(3), name: ph.name, emoji: ph.emoji };
  }
  return { ...rec, conditions: stamp };
}

export function makeMemoryCatches() {
  const byUser = new Map();
  let seq = 0;
  return {
    async add(uid, rec) { const id = `c${++seq}`; const row = { id, uid, created: new Date().toISOString(), ...rec }; byUser.set(uid, [row, ...(byUser.get(uid) || [])]); return row; },
    async list(uid, { limit = 200 } = {}) { return (byUser.get(uid) || []).slice(0, limit); },
    async get(uid, id) { return (byUser.get(uid) || []).find((r) => r.id === id) || null; },
    async remove(uid, id) { const rows = byUser.get(uid) || []; const i = rows.findIndex((r) => r.id === id); if (i < 0) return false; rows.splice(i, 1); return true; },
    async count(uid) { return (byUser.get(uid) || []).length; },
  };
}

/** Firestore: catches/{uid}/log/{id}, newest first by `at`. */
export function makeCloudCatches(firestore) {
  const col = (uid) => firestore.collection('catches').doc(uid).collection('log');
  return {
    async add(uid, rec) { const ref = col(uid).doc(); const row = { id: ref.id, uid, created: new Date().toISOString(), ...rec }; await ref.set(row); return row; },
    async list(uid, { limit = 200 } = {}) { const q = await col(uid).orderBy('at', 'desc').limit(limit).get(); return q.docs.map((d) => d.data()); },
    async get(uid, id) { const d = await col(uid).doc(id).get(); return d.exists ? d.data() : null; },
    async remove(uid, id) { const ref = col(uid).doc(id); const d = await ref.get(); if (!d.exists) return false; await ref.delete(); return true; },
    async count(uid) { const q = await col(uid).count().get(); return q.data().count; },
  };
}
