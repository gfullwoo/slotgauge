// Insights: what the angler's own catch log says about when they catch fish, and which upcoming
// windows match those conditions.
//
// Honesty rules baked in here, because a confident-sounding pattern drawn from four fish is a lie:
//   - nothing is reported as a pattern below MIN_CATCHES entries;
//   - every bucket carries its sample size, and the UI shows it;
//   - a bucket is only called a "best" if it beats an even split by a clear margin (LIFT), so a log
//     that is 25/25/25/25 across the tide stages correctly reports "no pattern yet".
// This is description, not prediction. The copy says so.

export const MIN_CATCHES = 12;      // below this, report counts only, no claims
export const MIN_BUCKET = 3;        // a bucket needs this many fish before it can be a "best"
export const LIFT = 1.4;            // ... and this much more than an even split

const pct = (n, total) => (total ? Math.round((100 * n) / total) : 0);

function tally(rows, pick) {
  const counts = new Map();
  for (const r of rows) {
    const k = pick(r);
    if (k == null || k === '') continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const buckets = [...counts.entries()]
    .map(([key, n]) => ({ key, n, pct: pct(n, total) }))
    .sort((a, b) => b.n - a.n);
  const even = buckets.length ? total / buckets.length : 0;
  // "Best" = enough fish in the bucket, and clearly above an even spread across the buckets seen.
  const best = buckets.filter((b) => b.n >= MIN_BUCKET && even > 0 && b.n >= even * LIFT).map((b) => b.key);
  // One bucket is not a preference, it is a blind spot: there is nothing to compare against yet.
  const only = buckets.length === 1;
  return { total, buckets, best: only ? [] : best, decisive: !only && best.length > 0, only };
}

const moonBucket = (r) => r.conditions?.moon?.name || null;
const tideBucket = (r) => r.conditions?.tide?.stage || null;
const solunarBucket = (r) => (r.conditions?.solunar?.window ? r.conditions.solunar.window.label : (r.conditions?.solunar ? 'Outside a solunar window' : null));
const skyBucket = (r) => r.conditions?.weather?.sky || null;
const windBucket = (r) => {
  const w = r.conditions?.weather?.windMph;
  if (w == null) return null;
  return w < 5 ? 'Calm (under 5 mph)' : w < 12 ? 'Light (5–12 mph)' : w < 20 ? 'Breezy (12–20 mph)' : 'Windy (20+ mph)';
};
const hourBucket = (r) => {
  const h = new Date(r.at).getHours();
  return h < 5 ? 'Night (before 5am)' : h < 9 ? 'Early morning (5–9am)' : h < 13 ? 'Late morning (9am–1pm)' : h < 17 ? 'Afternoon (1–5pm)' : h < 21 ? 'Evening (5–9pm)' : 'Night (after 9pm)';
};

/**
 * Summarize a catch log. `species` optionally narrows to one species, which is where the interesting
 * patterns usually are — "when do I catch stripers" beats "when do I catch fish".
 */
export function summarize(rows, { species = null } = {}) {
  const all = species ? rows.filter((r) => r.species.toLowerCase() === species.toLowerCase()) : rows;
  const bySpecies = [...all.reduce((m, r) => m.set(r.species, (m.get(r.species) || 0) + 1), new Map())]
    .map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  const enough = all.length >= MIN_CATCHES;
  return {
    species, catches: all.length, enough, minCatches: MIN_CATCHES,
    bySpecies,
    tide: tally(all, tideBucket),
    moon: tally(all, moonBucket),
    solunar: tally(all, solunarBucket),
    sky: tally(all, skyBucket),
    wind: tally(all, windBucket),
    timeOfDay: tally(all, hourBucket),
    kept: all.filter((r) => r.kept).length,
    released: all.filter((r) => r.released).length,
    firstAt: all.length ? all.map((r) => r.at).sort()[0] : null,
    lastAt: all.length ? all.map((r) => r.at).sort().slice(-1)[0] : null,
  };
}

/**
 * Score upcoming solunar/tide windows against what the log says works. Returns windows ranked by how
 * many of the angler's own favourable conditions they line up with, each with the reasons spelled out
 * so the user can judge it rather than trust a number.
 */
export function rankWindows({ summary, days, hilo = [], now = Date.now() }) {
  const out = [];
  const likes = {
    tide: new Set(summary.tide.best), solunar: new Set(summary.solunar.best), moon: new Set(summary.moon.best),
  };
  for (const day of days) {
    for (const w of day.windows) {
      if (w.end < now) continue;
      const reasons = [];
      let score = w.kind === 'major' ? 2 : 1;
      if (likes.solunar.has(w.label)) { score += 3; reasons.push(`${w.label} is your best solunar window (${summary.solunar.buckets.find((b) => b.key === w.label)?.n ?? 0} fish)`); }
      if (likes.moon.has(day.phase.name)) { score += 2; reasons.push(`${day.phase.name} is a phase you do well on`); }
      // Does a tide stage the angler likes overlap this window?
      const stages = stagesDuring(hilo, w.start, w.end);
      const liked = stages.filter((s) => likes.tide.has(s));
      if (liked.length) { score += 2; reasons.push(`${liked.join(' and ')} tide during the window`); }
      out.push({ start: w.start, peak: w.peak, end: w.end, kind: w.kind, label: w.label, date: day.date, moon: day.phase.name, moonEmoji: day.phase.emoji, dayRating: day.rating, score, reasons, stages });
    }
  }
  out.sort((a, b) => b.score - a.score || a.start - b.start);
  return out;
}

/** Which tide stages occur between two moments, given the high/low list. */
export function stagesDuring(hilo, start, end) {
  if (!hilo?.length) return [];
  const seen = new Set();
  for (let t = start; t <= end; t += 15 * 60e3) {
    const next = hilo.find((p) => p.ms > t);
    const prev = [...hilo].reverse().find((p) => p.ms <= t);
    if (!next && !prev) continue;
    const toNext = next ? (next.ms - t) / 60000 : Infinity;
    const sincePrev = prev ? (t - prev.ms) / 60000 : Infinity;
    if (toNext <= 45) seen.add(next.type === 'H' ? 'high slack' : 'low slack');
    else if (sincePrev <= 45) seen.add(prev.type === 'H' ? 'high slack' : 'low slack');
    else if (next) seen.add(next.type === 'H' ? 'incoming' : 'outgoing');
  }
  return [...seen];
}
