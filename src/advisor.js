// Plan my Trip: the advice half.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: the model is never asked what has been biting. It has no
// feed of local fishing reports, and asked for one it writes fluent, specific, invented intel —
// which is indistinguishable from the real thing and far worse than saying nothing, in an app whose
// whole claim is that it does not guess.
//
// So the prompt carries the facts and asks only for reasoning over them:
//   - the species the regulations actually allow on those dates, with slots and limits
//   - the tide highs and lows for each day
//   - moon phase and the solunar windows
//   - the forecast where one exists, and explicitly "no forecast" where it does not
//   - the angler's own logged catches, when they have any
//
// Then every species it names is checked back against the regulations for those dates. Anything
// closed is dropped, not shown with a warning: a closed fish has no business in a target list.
import Anthropic from '@anthropic-ai/sdk';
import { MODEL_CHAIN } from './identify.js';
import { statusOn } from './season.js';

export const MAX_SPECIES = 6;

const fmtT = (ms, tz) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz || 'UTC' });

/** The grounded brief. Everything the model is allowed to reason from, and nothing else. */
export function buildBrief({ place, state, days, species, tides, moon, weather, coverage, log, target, tz }) {
  const L = [];
  L.push(`TRIP: ${place || 'the selected location'}${state ? `, ${state.toUpperCase()}` : ''}`);
  L.push(`DATES: ${days[0]} to ${days[days.length - 1]} (${days.length} day${days.length > 1 ? 's' : ''})`);
  L.push('');
  L.push('LEGAL TO HARVEST ON THESE DATES (from the state regulations; this list is exhaustive):');
  for (const s of species.slice(0, 60)) {
    L.push(`  - ${s.name}${s.allWindow ? '' : ` [open only ${s.openDays.join(', ')}]`} — size ${s.size}; limit ${s.bag}${s.needsReview ? ' [rule under review]' : ''}`);
  }
  if (species.length > 60) L.push(`  ... and ${species.length - 60} more`);
  L.push('');
  L.push('TIDES (station predictions, local time):');
  for (const d of tides) {
    L.push(`  ${d.date}: ${d.hilo.length ? d.hilo.map((p) => `${p.type === 'H' ? 'high' : 'low'} ${fmtT(p.ms, tz)} ${p.v}ft`).join(', ') : '(no predictions published)'}`);
  }
  L.push('');
  L.push('MOON AND SOLUNAR WINDOWS (solunar theory is folklore, not forecast — treat as weak evidence):');
  for (const m of moon) {
    L.push(`  ${m.date}: ${m.phase.name} ${Math.round(m.phase.fraction * 100)}% lit, rating ${m.ratingLabel}; windows ${m.windows.map((w) => `${w.label} ${fmtT(w.start, tz)}-${fmtT(w.end, tz)}`).join(', ')}`);
  }
  L.push('');
  if (coverage.none) {
    L.push('WEATHER: no forecast exists this far ahead. Do not speculate about conditions; say planning should be rechecked nearer the date.');
  } else {
    L.push(`WEATHER (National Weather Service${coverage.partial ? `; covers only ${coverage.days} of ${coverage.of} days` : ''}):`);
    for (const w of weather) {
      if (w.outOfRange) { L.push(`  ${w.date}: beyond the forecast range`); continue; }
      const d = w.day || w.night;
      L.push(`  ${w.date}: ${d.text}, ${d.tempF}F, wind ${d.windDir || ''} ${d.wind || ''}${d.pop ? `, ${d.pop}% precip` : ''}`);
    }
  }
  if (log && log.total) {
    L.push('');
    L.push(`THE ANGLER'S OWN LOG (${log.total} catches; their actual history, the strongest evidence here):`);
    if (log.bySpecies?.length) L.push(`  most caught: ${log.bySpecies.slice(0, 6).map((s) => `${s.name} x${s.n}`).join(', ')}`);
    if (log.tide?.best?.length) L.push(`  catches most often on: ${log.tide.best.join(', ')} tide`);
    if (log.timeOfDay?.best?.length) L.push(`  most productive time of day: ${log.timeOfDay.best.join(', ')}`);
    if (log.moon?.best?.length) L.push(`  most productive moon phase: ${log.moon.best.join(', ')}`);
    if (!log.enough) L.push(`  (only ${log.total} catches — too few to be a pattern; mention it as thin, do not lean on it)`);
  }
  if (target) L.push(`\nTHE ANGLER WANTS TO TARGET: ${target}. Focus entirely on that species; ignore the others unless one matters as a bycatch or bait note.`);
  return L.join('\n');
}

const SYSTEM = `You help plan a fishing trip. You are given facts: which species the regulations allow on those dates, tide predictions, moon and solunar windows, the forecast where one exists, and sometimes the angler's own catch log.

Hard rules:
- You have NO fishing reports, no recent catch data for this place, and no knowledge of what has been biting. Never imply you do. Never invent a report, a hot bite, a guide's name, or a specific spot.
- Only ever name species from the legal list you are given. Never suggest one that is not on it.
- Base timing on the tides, the solunar windows, the forecast and the angler's own log — and say which of those a recommendation rests on.
- Where the evidence is thin, say so plainly. "Nothing here says much about X" is a good answer.
- Bait and fishing style come from general angling knowledge for the species and conditions. That is fine; it is not a claim about this week.
- Be concrete and brief. An angler reads this on a phone on the way to the water.

Return ONLY JSON matching:
{"overview": "2-3 sentences on the window as a whole",
 "species": [{"name":"exact name from the legal list","why":"why this one, grounded in the facts given","bestTimes":["2027-03-12 06:00-09:00 incoming + moon overhead"],"bait":["..."],"style":"how to fish it","confidence":"high|medium|low","basis":"what this rests on"}],
 "caveats": ["anything the angler should not read too much into"]}`;

/**
 * Ask the model, then vet. Returns { advice, dropped } — dropped names anything the model suggested
 * that the regulations do not actually allow, which is kept so the UI can be honest about it.
 */
export async function advise({ brief, legal, days, zone = 'state', apiKey = process.env.ANTHROPIC_API_KEY, client = null, maxSpecies = MAX_SPECIES }) {
  if (!apiKey && !client) throw Object.assign(new Error('Trip advice is not configured.'), { status: 503 });
  const anthropic = client || new Anthropic({ apiKey });
  let text = '';
  let lastErr = null;
  for (const model of MODEL_CHAIN) {
    try {
      const r = await anthropic.messages.create({
        model, max_tokens: 2000, system: SYSTEM,
        messages: [{ role: 'user', content: `${brief}\n\nGive at most ${maxSpecies} species, best first.` }],
      });
      text = (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      if (text) break;
    } catch (e) { lastErr = e; }
  }
  if (!text) throw Object.assign(new Error(`Could not reach the advice model${lastErr ? `: ${lastErr.message}` : ''}`), { status: 502 });

  let advice;
  try {
    advice = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch (e) { throw Object.assign(new Error('The advice model returned something unreadable.'), { status: 502 }); }

  // Vet: the model may only name species the regulations allow across this window.
  const byName = new Map(legal.map((s) => [s.name.toLowerCase(), s]));
  const dropped = [];
  advice.species = (advice.species || []).filter((s) => {
    const hit = byName.get(String(s.name || '').toLowerCase().trim());
    if (!hit) { dropped.push({ name: s.name, reason: 'not legal to harvest here on these dates' }); return false; }
    s.speciesId = hit.id; s.size = hit.size; s.bag = hit.bag; s.url = hit.url;
    s.openDays = hit.allWindow ? null : hit.openDays;
    if (hit.needsReview) s.needsReview = true;
    return true;
  }).slice(0, maxSpecies);
  return { advice, dropped };
}
