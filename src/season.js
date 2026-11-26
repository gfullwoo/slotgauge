// Season, slot and zone evaluation for a given date — the server-side twin of the helpers in
// public/index.html (mmdd, firstSat, resolve, inWindow, seasonOpen, sizeRules, pickZone).
//
// It lives here because Plan my Trip has to answer "is this species open on 14 March?" on the
// server, to vet what the advisor suggests. The browser copy stays where it is: that file's
// functions are closed over initApp's state and cannot be imported from Node.
//
// The duplication is deliberate but it is a real risk: if one copy changes and the other does not,
// the app and the trip planner will disagree about what is open. test/season.test.js pins both to
// the same table of cases, so a drift fails the build rather than reaching an angler.

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

export const mmdd = (d) => String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/** First Saturday of a month, as mm-dd. Some states open a season on one rather than a fixed date. */
export function firstSat(year, month) {
  const d = new Date(year, month, 1);
  d.setDate(1 + ((6 - d.getDay() + 7) % 7));
  return mmdd(d);
}
export function resolve(tok, year) {
  if (tok === 'FIRST_SAT_APR') return firstSat(year, 3);
  if (tok === 'FIRST_SAT_MAR') return firstSat(year, 2);
  return tok;
}
/** Windows wrap the new year: Nov–Feb is a>b, so the test flips. */
export const inWindow = (md, a, b) => (a <= b ? md >= a && md <= b : md >= a || md <= b);

const fmtMd = (s) => { const [m, d] = s.split('-'); return MONTHS[+m - 1].slice(0, 3).replace(/^./, (c) => c.toUpperCase()) + ' ' + +d; };

export function seasonOpen(zone, date) {
  if (!zone.seasons) return { open: true, text: 'Open year-round' };
  const md = mmdd(date), y = date.getFullYear();
  const wins = zone.seasons.map(([a, b]) => [resolve(a, y), resolve(b, y)]);
  return { open: wins.some(([a, b]) => inWindow(md, a, b)), text: wins.map(([a, b]) => `${fmtMd(a)} – ${fmtMd(b)}`).join(', ') };
}

export function sizeRules(zone, date) {
  const md = mmdd(date);
  return (zone.size || []).filter((r) => !r.from || inWindow(md, r.from, r.to));
}

const fmtIn = (n) => (Number.isInteger(n) ? String(n) : String(n).replace(/\.?0+$/, ''));
export function sizeText(rules) {
  if (!rules.length) return 'No size limit';
  return rules.map((r) => (r.min != null && r.max != null ? `${fmtIn(r.min)}–${fmtIn(r.max)} in slot`
    : r.min != null ? `${fmtIn(r.min)} in minimum` : `under ${fmtIn(r.max)} in`)).join(' or ');
}

export const ZONE_PARENT = { inland:'state', chesapeake:'state', hudson:'state', nybight:'state', lisound:'state', delbay:'state', ibsp:'state', delriver:'state', delriverupper:'delriver', ctriver:'state', tampa:'gulf', sarasota:'gulf', charlotte:'gulf', swfl:'gulf', bigbend:'gulf', panhandle:'gulf', suwannee:'gulf', gulfcounty:'gulf', pasco:'gulf', baiting:'state', bait:'state', nefl:'atlantic', irl:'atlantic', sefl:'atlantic', spz:'atlantic', southedisto:'state', northedisto:'state', ocean:'state', internal:'state', northhatteras:'state', southhatteras:'state', coastal:'state', chesapeakebay:'state', savannah:'state' };

export function pickZone(sp, want) {
  const zs = sp.zones;
  return zs.find((z) => z.zone === want)
    || (want && zs.find((z) => ZONE_PARENT[z.zone] === want))
    || (want && ZONE_PARENT[want] && zs.find((z) => z.zone === ZONE_PARENT[want]))
    || zs.find((z) => z.zone === 'state') || zs[0];
}

/**
 * What the rules say about one species on one date. Never a KEEP/RELEASE verdict — there is no
 * length here — just whether harvest is open and what the limits are.
 */
export function statusOn(sp, date, want = 'state') {
  const zone = pickZone(sp, want);
  if (sp.status === 'closed' || zone.closed) return { open: false, reason: 'Harvest closed', zone: zone.zone, season: 'Closed', size: null, bag: null };
  if (sp.status === 'invasive') return { open: true, invasive: true, reason: 'Invasive — no limits', zone: zone.zone, season: 'Open year-round', size: 'No size limit', bag: 'No daily limit' };
  const season = seasonOpen(zone, date);
  const rules = sizeRules(zone, date);
  return {
    open: season.open,
    reason: season.open ? null : `Season closed on this date (open ${season.text})`,
    zone: zone.zone,
    season: season.text,
    size: sizeText(rules),
    bag: zone.bagNote || (zone.bag == null ? 'No daily limit' : `${zone.bag} per person per day`),
    needsReview: !!sp.needsReview,
  };
}

/** Species open for at least one day of the window, with the days they are open. */
export function openAcross(species, days, want = 'state') {
  const out = [];
  for (const sp of species) {
    const perDay = days.map((d) => ({ date: d, ...statusOn(sp, new Date(d + 'T12:00:00'), want) }));
    const openDays = perDay.filter((p) => p.open);
    if (!openDays.length) continue;
    const first = openDays[0];
    out.push({
      id: sp.id, name: sp.name, habitat: sp.habitat, family: sp.family || null,
      openDays: openDays.map((p) => p.date), allWindow: openDays.length === days.length,
      season: first.season, size: first.size, bag: first.bag, zone: first.zone,
      invasive: !!first.invasive, needsReview: !!sp.needsReview, url: sp.url || null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
