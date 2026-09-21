// Server-rendered, crawlable regulation pages: one per species per state, plus hub tables and a sitemap.
// These exist so search engines have real text to index ("striped bass size limit delaware");
// the app itself (public/index.html) stays a client-side PWA.
//
// Multi-state ready: every route is /<state-slug>/..., resolved through STATES. Adding a state means
// adding an entry here and a regs dataset with the same shape (see src/regs.js).
import { LOOKALIKES } from './lookalikes.js';

export const SITE = 'https://slotgauge.com';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './regs.js';

/** State metadata comes from the official-source registry, keyed by 2-letter code. */
const REGISTRY = JSON.parse(readFileSync(path.join(DATA_DIR, 'sources.json'), 'utf8')).states;
export const STATES = Object.fromEntries(Object.entries(REGISTRY).map(([code, st]) => [code, { code, slug: st.slug, name: st.name, agency: code === 'DE' ? 'DNREC' : st.agency, agencyLong: st.agency, sources: st.sources, season: st.season }]));

export const ZONES = {
  state: 'State waters', federal: 'Federal waters (3–200 mi)', delriver: 'Delaware River / Bay', nanticoke: 'Nanticoke River',
  becks: 'Becks Pond', tidal: 'Tidal waters', nontidal: 'Non-tidal waters', streams: 'Trout streams', ponds: 'Ponds / lakes', flyonly: 'Fly-fishing-only water', vessel: 'For-hire vessels',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HAB = { saltwater: 'Saltwater', freshwater: 'Freshwater', shellfish: 'Shellfish & crabs' };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtIn = (n) => (Number.isInteger(n) ? String(n) : String(n).replace(/\.?0+$/, ''));
const slugify = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Stable slug per species. Names that exist in two habitats: saltwater keeps the plain slug. */
export function speciesSlugs(species) {
  const byName = new Map();
  for (const s of species) byName.set(s.name, [...(byName.get(s.name) || []), s]);
  const slugOf = new Map();
  for (const [name, list] of byName) {
    const base = slugify(name);
    if (list.length === 1) { slugOf.set(list[0].id, base); continue; }
    const sorted = [...list].sort((a, b) => (a.habitat === 'saltwater' ? -1 : 1) - (b.habitat === 'saltwater' ? -1 : 1));
    sorted.forEach((s, i) => slugOf.set(s.id, i === 0 ? base : `${base}-${s.habitat}`));
  }
  return slugOf;
}

// ---- rule text (whole-year view, not just today) ----
function fmtMd(tok) {
  if (tok === 'FIRST_SAT_APR') return 'first Saturday in April';
  if (tok === 'FIRST_SAT_MAR') return 'first Saturday in March';
  const [m, d] = tok.split('-'); return `${MONTHS[+m - 1]} ${+d}`;
}
export function seasonText(zone) {
  if (!zone.seasons) return 'Open year-round';
  return zone.seasons.map(([a, b]) => `${fmtMd(a)} – ${fmtMd(b)}`).join(', ');
}
function oneSize(r) {
  const core = r.min != null && r.max != null ? `${fmtIn(r.min)}–${fmtIn(r.max)} inch slot` : r.min != null ? `${fmtIn(r.min)} inch minimum` : `under ${fmtIn(r.max)} inches`;
  return r.from ? `${core} (${fmtMd(r.from)} – ${fmtMd(r.to)})` : core;
}
export function sizeText(zone, sp) {
  if (!zone.size?.length) return zone.sizeNote || (sp?.needsReview && sp.raw?.size ? sp.raw.size : 'No size limit');
  return zone.size.map(oneSize).join('; ');
}
export function bagText(zone, sp) {
  return zone.bagNote || (zone.bag == null ? (sp?.needsReview && sp.raw?.limit ? sp.raw.limit : 'No daily limit') : `${zone.bag} per person per day`);
}
function mmdd(d) { return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function inWindow(md, a, b) { return a <= b ? md >= a && md <= b : md >= a || md <= b; }
function resolveTok(tok, y) {
  const firstSat = (m) => { const d = new Date(y, m, 1); d.setDate(1 + ((6 - d.getDay() + 7) % 7)); return mmdd(d); };
  if (tok === 'FIRST_SAT_APR') return firstSat(3); if (tok === 'FIRST_SAT_MAR') return firstSat(2); return tok;
}
/** Plain-English "today" summary for the state-waters zone. */
export function todaySummary(sp, date = new Date()) {
  const zone = sp.zones.find((z) => z.zone === 'state') || sp.zones[0];
  const md = mmdd(date), y = date.getFullYear();
  if (sp.needsReview && !zone.size?.length && !zone.seasons && zone.bag == null && !zone.closed && sp.status === 'open') {
    return `Not yet converted to a keeper check. As printed: season ${sp.raw.season || 'not stated'}; size ${sp.raw.size || 'not stated'}; limit ${sp.raw.limit || 'not stated'}. Read the exact wording below.`;
  }
  if (sp.status === 'invasive') return `${sp.name} is an invasive species: keep it, no size or daily limit, and do not return it to the water.`;
  if (sp.status === 'closed' || zone.closed) return `${sp.name} is closed to harvest. Release it.`;
  const open = !zone.seasons || zone.seasons.some(([a, b]) => inWindow(md, resolveTok(a, y), resolveTok(b, y)));
  if (!open) return `The ${sp.name.toLowerCase()} season is closed today. It is open ${seasonText(zone)}.`;
  const rules = (zone.size || []).filter((r) => !r.from || inWindow(md, r.from, r.to));
  const size = rules.length ? rules.map((r) => (r.min != null && r.max != null ? `between ${fmtIn(r.min)} and ${fmtIn(r.max)} inches` : r.min != null ? `at least ${fmtIn(r.min)} inches` : `under ${fmtIn(r.max)} inches`)).join(' or ') : null;
  const bag = zone.bag == null ? (zone.bagNote ? zone.bagNote : 'no daily limit') : `a daily limit of ${zone.bag}`;
  return size ? `A ${sp.name.toLowerCase()} is a keeper today if it measures ${size}, with ${bag}.` : `${sp.name} has no size limit today, with ${bag}.`;
}

// ---- layout ----
const CSS = `:root{--bg:#eef3f4;--surface:#fff;--surface-2:#e3ebed;--ink:#14232a;--ink-2:#4d6169;--ink-3:#7f939a;--line:#cfdadd;--accent:#0f6f8c;--keep:#1f7a4d;--keep-bg:#dcf2e5;--release:#b3361f;--release-bg:#fbe3dc}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font-family:"IBM Plex Sans",system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.5;padding:0 16px 40px}
.wrap{max-width:760px;margin:0 auto}h1,h2,h3{font-family:"Barlow Condensed","Arial Narrow",sans-serif;letter-spacing:.01em;line-height:1.05;margin:0}
h1{font-size:40px;font-weight:700}h2{font-size:26px;margin-top:28px}h3{font-size:20px;margin-top:18px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0 12px}header a.logo{display:flex;align-items:center;font-family:"Barlow Condensed",sans-serif;font-weight:700;font-size:26px;color:var(--ink);text-decoration:none}header a.logo span{color:var(--accent)}header a.logo img{margin-right:8px}
.cta{background:var(--accent);color:#fff;border-radius:10px;padding:9px 14px;font-weight:600;text-decoration:none;white-space:nowrap}
.crumbs{font-size:13px;color:var(--ink-3);margin:6px 0 14px}.crumbs a{color:var(--ink-2);text-decoration:none}
.hero{border-radius:16px;overflow:hidden;background:var(--surface-2);border:1px solid var(--line);margin:14px 0;height:220px;position:relative}.hero img{width:100%;height:100%;object-fit:cover;display:block}
.summary{background:var(--surface);border:1px solid var(--line);border-left:8px solid var(--accent);border-radius:14px;padding:16px 18px;font-size:18px;margin:14px 0}
.summary.keep{border-left-color:var(--keep)}.summary.closed{border-left-color:var(--release)}
table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:15px;margin-top:10px}th,td{text-align:left;padding:9px 12px;border-top:1px solid var(--line);vertical-align:top}th{background:var(--surface-2);font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-2)}tr:first-child td{border-top:0}
td a{color:var(--accent);text-decoration:none;font-weight:600}
.notes{padding-left:20px;color:var(--ink-2);font-size:14.5px}.raw{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;margin-top:10px}.raw dt{font-weight:600;margin-top:6px}.raw dd{margin:0;color:var(--ink-2)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.chips a{font-size:13px;background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:4px 10px;color:var(--ink);text-decoration:none}
.app{margin-top:28px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px}.app p{margin:6px 0 12px;color:var(--ink-2)}
footer{margin-top:32px;font-size:12.5px;color:var(--ink-3);line-height:1.5}footer a{color:var(--accent);text-decoration:none}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-top:10px}.grid a{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:var(--ink);text-decoration:none;font-weight:600;font-size:15px}.grid a small{display:block;font-weight:400;color:var(--ink-3);font-size:12.5px}
@media(max-width:480px){h1{font-size:32px}.hero{height:170px}table{font-size:14px}th,td{padding:8px}}`;

function layout({ title, description, canonical, body, jsonld = [], ogImage }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="SlotGauge"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(ogImage || SITE + '/og.png')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#0f6f8c">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>${CSS}</style>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head><body><div class="wrap">
<header><a class="logo" href="/"><img src="/icon.svg" alt="" width="26" height="26">Slot<span>Gauge</span></a><a class="cta" href="/">Check a catch</a></header>
${body}
<footer>Regulations are simplified for quick reference from the official state source pages and rechecked nightly. The state agency's current fishing guide governs; gear, license, and area rules also apply. Not legal advice.<br>© ${new Date().getFullYear()} SlotGauge · <a href="/">App</a> · ${Object.values(STATES).map((s) => `<a href="/${s.slug}/">${s.name}</a>`).join(' · ')}</footer>
</div></body></html>`;
}

const speciesImage = (st, sp) => (st.code === 'DE' ? `${SITE}/img/species/${sp.id}.jpg` : null);

export function makePages(regs) {
  const st = STATES[regs.state] || STATES.DE;
  const species = regs.species;
  const stateZoneOf = (sp) => sp.zones.find((z) => z.zone === 'state') || sp.zones[0];
  const zoneLabel = (z) => z.label || ZONES[z.zone] || z.zone;
  const slugOf = speciesSlugs(species);
  const bySlug = new Map(species.map((s) => [slugOf.get(s.id), s]));
  const urlOf = (sp) => `/${st.slug}/${slugOf.get(sp.id)}/`;
  const year = new Date().getFullYear();

  function speciesPage(slug, date = new Date()) {
    const sp = bySlug.get(slug); if (!sp) return null;
    const canonical = `${SITE}${urlOf(sp)}`;
    const stateZone = stateZoneOf(sp);
    const img = speciesImage(st, sp);
    const summary = todaySummary(sp, date);
    const kind = sp.status === 'closed' || stateZone.closed ? 'closed' : sp.status === 'invasive' ? 'keep' : 'keep';
    const title = `${sp.name} Size Limit, Season & Daily Limit in ${st.name} (${year})`;
    const description = `${sp.name} regulations in ${st.name}: ${sizeText(stateZone, sp)}; ${bagText(stateZone, sp).toLowerCase()}; season ${seasonText(stateZone).toLowerCase()}. ${summary}`.slice(0, 300);
    const related = LOOKALIKES.filter((g) => g.ids.includes(sp.id)).flatMap((g) => g.ids).filter((id) => id !== sp.id).map((id) => species.find((s) => s.id === id)).filter(Boolean);
    const sameFamily = species.filter((s) => s.family === sp.family && s.id !== sp.id && !related.includes(s)).slice(0, 8);
    const faq = [
      { q: `What is the size limit for ${sp.name} in ${st.name}?`, a: `${sizeText(stateZone, sp)} in ${st.name} state waters.` },
      { q: `How many ${sp.name} can you keep per day in ${st.name}?`, a: bagText(stateZone, sp) + '.' },
      { q: `When is ${sp.name} season in ${st.name}?`, a: seasonText(stateZone) + '.' },
      { q: `Is my ${sp.name} a keeper today?`, a: summary },
    ];
    const jsonld = [
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'SlotGauge', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: `${st.name} fishing regulations`, item: `${SITE}/${st.slug}/` },
        { '@type': 'ListItem', position: 3, name: sp.name, item: canonical }] },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
      { '@context': 'https://schema.org', '@type': 'Article', headline: title, description, image: img || SITE + '/og.png', dateModified: regs.scraped, author: { '@type': 'Organization', name: 'SlotGauge' }, publisher: { '@type': 'Organization', name: 'SlotGauge', logo: { '@type': 'ImageObject', url: SITE + '/icon-192.png' } }, mainEntityOfPage: canonical },
    ];
    const body = `
<nav class="crumbs"><a href="/">SlotGauge</a> › <a href="/${st.slug}/">${st.name}</a> › <a href="/${st.slug}/${sp.habitat}/">${HAB[sp.habitat] || sp.habitat}</a> › ${esc(sp.name)}</nav>
<h1>${esc(sp.name)} regulations in ${st.name}</h1>
<p style="color:var(--ink-2);margin:6px 0 0">${esc(sp.family)}${sp.sci ? ` · <em>${esc(sp.sci)}</em>` : ''} · ${HAB[sp.habitat] || sp.habitat} · ${year} season</p>
${img ? `<div class="hero"><img src="${img}" alt="${esc(sp.name)}" loading="eager"></div>` : ''}
<div class="summary ${kind}"><strong>Is it a keeper?</strong> ${esc(summary)}</div>
<h2>${esc(sp.name)} size limit, season and daily limit</h2>
<table><thead><tr><th>Where</th><th>Season</th><th>Size limit</th><th>Daily limit</th></tr></thead><tbody>
${sp.zones.map((z) => `<tr><td><strong>${esc(zoneLabel(z))}</strong></td><td>${z.closed ? 'Closed to harvest' : esc(z.rawSeason || seasonText(z))}</td><td>${z.closed ? '—' : esc(sizeText(z, sp))}</td><td>${z.closed ? '—' : esc(bagText(z, sp))}</td></tr>`).join('\n')}
</tbody></table>
${sp.notes.length ? `<h3>Notes</h3><ul class="notes">${sp.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
<h3>Exact ${st.agency} wording</h3>
<dl class="raw"><dt>Season</dt><dd>${esc(sp.raw.season)}</dd><dt>Size</dt><dd>${esc(sp.raw.size)}</dd><dt>Limit</dt><dd>${esc(sp.raw.limit)}</dd>${(sp.quotes || []).map((q) => `<dt>${esc(q.zone)} — as printed</dt><dd>“${esc(q.quote)}”</dd>`).join('')}</dl>
<p style="font-size:14px;color:var(--ink-2)">Source: <a href="${esc(sp.url)}" rel="noopener" target="_blank" style="color:var(--accent)">${esc(st.agencyLong)}</a>, captured ${esc(regs.scraped)}${regs.season ? ` (${regs.season} season)` : ''}.</p>
<div class="app"><h2 style="margin-top:0">Check your ${esc(sp.name.toLowerCase())} in seconds</h2><p>Say it, snap a photo, or type the length. SlotGauge answers KEEP or RELEASE using today's ${st.name} rules.</p><a class="cta" href="/?q=${encodeURIComponent(sp.name)}">Open SlotGauge for ${esc(sp.name)}</a></div>
${related.length ? `<h2>Often confused with</h2><div class="chips">${related.map((s) => `<a href="${urlOf(s)}">${esc(s.name)}</a>`).join('')}</div>` : ''}
${sameFamily.length ? `<h2>More ${esc(sp.family.toLowerCase())}</h2><div class="chips">${sameFamily.map((s) => `<a href="${urlOf(s)}">${esc(s.name)}</a>`).join('')}</div>` : ''}
<h2>Frequently asked</h2>${faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}`;
    return layout({ title, description, canonical, body, jsonld, ogImage: img });
  }

  function hubPage(habitat) {
    const list = species.filter((s) => s.habitat === habitat).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) return null;
    const label = HAB[habitat] || habitat;
    const title = `${st.name} ${label} Fishing Size Limits, Seasons & Daily Limits (${year})`;
    const description = `Every ${label.toLowerCase()} species regulated in ${st.name} with its ${year} size limit, season and daily limit, from ${st.agency} and rechecked nightly.`;
    const canonical = `${SITE}/${st.slug}/${habitat}/`;
    const body = `
<nav class="crumbs"><a href="/">SlotGauge</a> › <a href="/${st.slug}/">${st.name}</a> › ${label}</nav>
<h1>${st.name} ${label.toLowerCase()} size limits and seasons</h1>
<p style="color:var(--ink-2)">${list.length} species, ${year} rules for state waters. Tap a species for every zone, the exact ${st.agency} wording and a keeper check. Updated ${esc(regs.scraped)}.</p>
<table><thead><tr><th>Species</th><th>Season</th><th>Size limit</th><th>Daily limit</th></tr></thead><tbody>
${list.map((s) => { const z = stateZoneOf(s); const closed = s.status === 'closed' || z.closed; return `<tr><td><a href="${urlOf(s)}">${esc(s.name)}</a>${s.status === 'invasive' ? ' <small>(invasive)</small>' : ''}</td><td>${closed ? 'Closed' : esc(z.rawSeason || seasonText(z))}</td><td>${closed ? '—' : esc(sizeText(z, s))}</td><td>${closed ? '—' : esc(bagText(z, s))}</td></tr>`; }).join('\n')}
</tbody></table>
<div class="app"><h2 style="margin-top:0">Not sure what you caught?</h2><p>Snap a photo and SlotGauge identifies the species and applies these rules.</p><a class="cta" href="/">Open SlotGauge</a></div>`;
    const jsonld = [{ '@context': 'https://schema.org', '@type': 'ItemList', name: title, itemListElement: list.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: SITE + urlOf(s) })) }];
    return layout({ title, description, canonical, body, jsonld });
  }

  function statePage() {
    const title = `${st.name} Fishing Regulations ${year}: Size Limits, Seasons, Daily Limits`;
    const description = `Plain-English ${st.name} fishing regulations for ${species.length} species, from ${st.agencyLong}. Look up any fish or check your catch with a photo.`;
    const canonical = `${SITE}/${st.slug}/`;
    const groups = ['saltwater', 'freshwater', 'shellfish'].filter((h) => species.some((s) => s.habitat === h));
    const popular = ['Striped Bass', 'Summer Flounder', 'Black Sea Bass', 'Tautog', 'Bluefish', 'Weakfish', 'Largemouth Bass', 'Blue Crab', 'Red Drum', 'Scup'].map((n) => species.find((s) => s.name === n && s.habitat !== 'freshwater') || species.find((s) => s.name === n)).filter(Boolean);
    const body = `
<nav class="crumbs"><a href="/">SlotGauge</a> › ${st.name}</nav>
<h1>${st.name} fishing regulations, ${year}</h1>
<p style="color:var(--ink-2)">Size limits, seasons and daily limits for every species ${st.agency} regulates, rewritten in plain English and rechecked against the official pages automatically. Last captured ${esc(regs.scraped)}.</p>
<h2>Most searched</h2><div class="chips">${popular.map((s) => `<a href="${urlOf(s)}">${esc(s.name)}</a>`).join('')}</div>
${groups.map((h) => `<h2><a href="/${st.slug}/${h}/" style="color:inherit;text-decoration:none">${HAB[h]} →</a></h2><div class="grid">${species.filter((s) => s.habitat === h).sort((a, b) => a.name.localeCompare(b.name)).map((s) => `<a href="${urlOf(s)}">${esc(s.name)}<small>${esc(sizeText(stateZoneOf(s), s))}</small></a>`).join('')}</div>`).join('')}
<div class="app"><h2 style="margin-top:0">Is it a keeper?</h2><p>Say what you caught, snap a photo, or type it. SlotGauge checks today's rules and answers KEEP or RELEASE.</p><a class="cta" href="/">Open SlotGauge</a></div>`;
    return layout({ title, description, canonical, body });
  }

  function sitemap() {
    const urls = [{ loc: SITE + '/', p: '1.0' }, { loc: `${SITE}/${st.slug}/`, p: '0.9' },
      ...['saltwater', 'freshwater', 'shellfish'].filter((h) => species.some((s) => s.habitat === h)).map((h) => ({ loc: `${SITE}/${st.slug}/${h}/`, p: '0.8' })),
      ...species.map((s) => ({ loc: SITE + urlOf(s), p: '0.7' }))];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${u.loc}</loc><lastmod>${regs.scraped}</lastmod><changefreq>weekly</changefreq><priority>${u.p}</priority></url>`).join('\n')}\n</urlset>\n`;
  }

  return { speciesPage, hubPage, statePage, sitemap, slugOf, urlOf, bySlug, state: st, species };
}

/** One sitemap for every loaded state. */
export function sitemapAll(pagesByState) {
  const bodies = Object.values(pagesByState).map((p) => p.sitemap().replace(/^[\s\S]*?<urlset[^>]*>\n?/, '').replace(/<\/urlset>\s*$/, ''));
  const seen = new Set();
  const lines = bodies.join('\n').split('\n').filter((l) => l && !seen.has(l) && seen.add(l));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lines.join('\n')}\n</urlset>\n`;
}
