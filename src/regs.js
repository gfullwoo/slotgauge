// Merges the raw DNREC scrape with the hand-reviewed rules overlay into the
// dataset the app consumes (GET /api/regs).
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');

const HAB_ID = { freshwater: 1, saltwater: 2, shellfish: 3 };
const HMS = 'Atlantic HMS Angling Permit required for private vessels in federal waters; non-retained HMS must be released without removing from the water. hmspermits.noaa.gov / (888) 872-8862.';

export const rawHash = (d) => createHash('sha1').update(`${d.season}|${d.size}|${d.limit}`).digest('hex').slice(0, 12);
const defaultZone = () => ({ zone: 'state', seasons: null, size: [], bag: null, bagNote: '', closed: false, sizeNote: '' });

export function loadJson(name) {
  return JSON.parse(readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

/**
 * @param raw     {scraped, source, species:[{id,h,n,f,sci,season,size,limit}]}
 * @param overlay {[id]: {aliases,status,zones,notes,rawHash,reviewed}}
 */
export function merge(raw, overlay) {
  const species = raw.species.map((d) => {
    const ov = overlay[String(d.id)];
    const rec = {
      id: d.id, name: d.n, habitat: d.h, family: d.f, sci: d.sci || '',
      url: `${raw.source}FishSpecies.aspx?habitat=${HAB_ID[d.h]}&species=${d.id}`,
      raw: { season: d.season, size: d.size, limit: d.limit },
      aliases: [], status: 'open', zones: [defaultZone()], notes: [], reviewed: null, needsReview: false,
    };
    if (ov) {
      Object.assign(rec, { aliases: ov.aliases, status: ov.status, zones: ov.zones, notes: [...ov.notes], reviewed: ov.reviewed });
      if (ov.rawHash && ov.rawHash !== rawHash(d)) {
        rec.needsReview = true;
        rec.notes.unshift(`DNREC changed the wording for this species after the rules were last reviewed (${ov.reviewed}). Check the exact DNREC wording below.`);
      }
    } else {
      const s = d.season.toLowerCase().trim();
      const unparsed = [];
      if (!/^open (year|all)[- ]?(round|year)$/.test(s)) unparsed.push('season');
      if (!/no size/.test(d.size.toLowerCase()) && !['', 'no limit', 'none'].includes(d.size.trim().toLowerCase())) unparsed.push('size');
      if (d.limit.trim().toLowerCase() !== 'no limit') unparsed.push('limit');
      if (unparsed.length) {
        rec.needsReview = true;
        rec.notes.push(`Not yet reviewed: DNREC lists a ${unparsed.join(', ')} rule for this species. Read the exact wording below.`);
      }
      if (s.includes('highly migratory')) rec.notes.push(HMS);
    }
    return rec;
  });
  return { scraped: raw.scraped, source: raw.source, state: 'DE', generated: new Date().toISOString(), species };
}

export function buildRegs() {
  return merge(loadJson('dnrec_raw.json'), loadJson('overlay.json'));
}

/**
 * Datasets produced by the AI extractor (data/<st>/raw.json): one row per species per zone, with the
 * source quote. Grouped into the same species shape as Delaware. Without an overlay entry a zone keeps
 * the printed text in sizeNote/bagNote and is flagged needsReview, so the checker answers "check the
 * rule" rather than inventing a verdict.
 */
export function mergeExtracted(raw, overlay = {}) {
  const groups = new Map();
  for (const r of raw.species) {
    const key = r.n.toLowerCase();
    if (!groups.has(key)) groups.set(key, { id: r.id, name: r.n, habitat: r.h, family: r.f || '', sci: r.sci || '', url: raw.sources?.find((s) => s.id === r.sourceId)?.url || raw.source, raw: { season: r.season, size: r.size, limit: r.limit }, quotes: [], aliases: [], status: 'open', zones: [], notes: [], reviewed: null, needsReview: true });
    const g = groups.get(key);
    const zoneKey = zoneKeyFor(r.zone);
    g.zones.push({ zone: zoneKey, label: r.zone, seasons: null, size: [], bag: null, bagNote: r.limit || '', closed: /closed|prohibited|no (harvest|possession)/i.test(`${r.season} ${r.limit}`), sizeNote: r.size || '' , rawSeason: r.season });
    if (r.quote) g.quotes.push({ zone: r.zone, quote: r.quote });
    if (r.notes) g.notes.push(r.notes);
  }
  const species = [...groups.values()].map((rec) => {
    const ov = overlay[String(rec.id)];
    if (ov) {
      Object.assign(rec, { aliases: ov.aliases || [], status: ov.status || 'open', zones: ov.zones, notes: [...(ov.notes || [])], reviewed: ov.reviewed, needsReview: false });
      if (ov.rawHash && ov.rawHash !== rawHash(rec.raw)) { rec.needsReview = true; rec.notes.unshift(`The official text for this species changed after it was last reviewed (${ov.reviewed}). Check the exact wording below.`); }
    } else rec.notes.unshift('Not yet reviewed: shown exactly as the state prints it. Read the wording before keeping the fish.');
    return rec;
  });
  return { scraped: raw.scraped, source: raw.source, sources: raw.sources || [], state: raw.state, season: raw.season, generated: new Date().toISOString(), species };
}
const zoneKeyFor = (label) => String(label || 'state').toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^statewide$|^allwaters$|^state$/, 'state') || 'state';

/** Every state with data on disk, keyed by 2-letter code. Delaware always; others once data/<st>/raw.json exists. */
export function buildAllRegs() {
  const out = { DE: buildRegs() };
  const reg = JSON.parse(readFileSync(path.join(DATA_DIR, 'sources.json'), 'utf8'));
  for (const [code, st] of Object.entries(reg.states)) {
    if (code === 'DE') continue;
    const rawFile = path.join(DATA_DIR, code.toLowerCase(), 'raw.json');
    if (!existsSync(rawFile)) continue;
    const ovFile = path.join(DATA_DIR, code.toLowerCase(), 'overlay.json');
    out[code] = mergeExtracted(JSON.parse(readFileSync(rawFile, 'utf8')), existsSync(ovFile) ? JSON.parse(readFileSync(ovFile, 'utf8')) : {});
  }
  return out;
}
