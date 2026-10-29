// Species background information from Wikipedia.
//
// Two layers:
//  1. data/wiki-titles.json — curated map "regulation name" → Wikipedia article title, so every
//     species page and the per-state species directory can link to the right article even before
//     anything has been fetched. Names that are not mapped fall back to the cleaned common name.
//  2. data/species-info.json — ingested summaries (first paragraph, short description, thumbnail,
//     canonical URL) fetched from the Wikipedia REST API by `npm run species-info` (GitHub Actions
//     runs it weekly and commits the result). The server also fills gaps at request time and keeps
//     them in memory, so a species page never has to wait for the next workflow run.
//
// Text is reused under CC BY-SA 4.0 and attributed on every page that shows it.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
export const TITLES_FILE = path.join(DATA_DIR, 'wiki-titles.json');
export const INFO_FILE = path.join(DATA_DIR, 'species-info.json');
export const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
export const WIKI_SEARCH = 'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=';
export const USER_AGENT = 'SlotGauge/1.0 (https://slotgauge.com; species background pages)';
export const LICENSE = { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' };

const loadJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
let TITLES = null;
const titles = () => (TITLES ||= loadJson(TITLES_FILE, {}));

/** Strip regulation qualifiers so "Walleye (nontidal)" and "Walleye" share one article. */
export function cleanName(name) {
  return String(name || '').replace(/\s*\((?:nontidal|tidal|inland|freshwater|saltwater|lakes and ponds|rivers|other)\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** Wikipedia article title for a regulation species name (curated map first, then the cleaned name). */
export function wikiTitle(name) {
  const key = String(name || '').toLowerCase().trim();
  const map = titles();
  if (map[key]) return map[key];
  const cleaned = cleanName(name);
  if (map[cleaned.toLowerCase()]) return map[cleaned.toLowerCase()];
  return cleaned;
}

export const wikiUrl = (name) => `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle(name).replace(/ /g, '_'))}`;

/** Ingested summaries keyed by Wikipedia title. */
export function loadSpeciesInfo() { return loadJson(INFO_FILE, {}); }
export function saveSpeciesInfo(info) {
  const sorted = Object.fromEntries(Object.keys(info).sort().map((k) => [k, info[k]]));
  writeFileSync(INFO_FILE, JSON.stringify(sorted, null, 1) + '\n');
}

function normalizeSummary(j) {
  if (!j || j.type !== 'standard' || !j.extract) return null;
  return {
    title: j.title,
    description: j.description || '',
    extract: j.extract,
    thumbnail: j.thumbnail?.source || null,
    url: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(j.title).replace(/ /g, '_'))}`,
    fetched: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Fetch one article summary. Disambiguation pages retry with "(fish)", then fall back to the top
 * full-text search hit. Returns null when nothing usable is found (the page then shows a plain link).
 */
export async function fetchSummary(title, { fetchImpl = fetch, lang = 'en' } = {}) {
  const base = lang === 'en' ? WIKI_API : WIKI_API.replace('en.wikipedia', `${lang}.wikipedia`);
  const get = async (t) => {
    const r = await fetchImpl(base + encodeURIComponent(t.replace(/ /g, '_')), { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
    if (r.status === 404) return { type: 'missing' };
    if (!r.ok) throw new Error(`wikipedia ${r.status} for ${t}`);
    return r.json();
  };
  let j = await get(title);
  if (j.type === 'disambiguation' || j.type === 'missing') {
    const alt = await get(`${title} (fish)`);
    if (alt.type === 'standard') j = alt;
  }
  if (j.type !== 'standard') {
    const s = await fetchImpl(WIKI_SEARCH + encodeURIComponent(`${title} fish`), { headers: { 'user-agent': USER_AGENT } });
    if (s.ok) {
      const hits = (await s.json()).query?.search || [];
      for (const h of hits) { const t = await get(h.title); if (t.type === 'standard') { j = t; break; } }
    }
  }
  return normalizeSummary(j);
}

/**
 * Fetch summaries for every species in `regsByState` that is missing from `info` or older than
 * `maxAgeDays`. Mutates and returns `info`; `log` receives one line per fetch.
 */
export async function refreshSpeciesInfo(regsByState, { info = loadSpeciesInfo(), fetchImpl = fetch, maxAgeDays = 90, log = () => {}, concurrency = 4 } = {}) {
  const wanted = new Set();
  for (const regs of Object.values(regsByState)) for (const sp of regs.species) wanted.add(wikiTitle(sp.name));
  const cutoff = new Date(Date.now() - maxAgeDays * 86400e3).toISOString().slice(0, 10);
  const todo = [...wanted].filter((t) => !info[t] || (info[t].fetched || '') < cutoff);
  let ok = 0, miss = 0;
  const queue = todo.slice();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const t = queue.shift();
      try {
        const s = await fetchSummary(t, { fetchImpl });
        if (s) { info[t] = s; ok++; log(`ok   ${t} → ${s.title}`); }
        else { info[t] = { title: t, missing: true, fetched: new Date().toISOString().slice(0, 10) }; miss++; log(`miss ${t}`); }
      } catch (e) { log(`err  ${t}: ${e.message}`); }
    }
  }));
  return { info, wanted: wanted.size, fetched: todo.length, ok, miss };
}

/** Request-time lookup with an in-memory cache, used by the server for anything the workflow hasn't ingested yet. */
export function makeInfoLookup({ info = loadSpeciesInfo(), fetchImpl = fetch, live = true } = {}) {
  const mem = new Map(Object.entries(info));
  const pending = new Map();
  return async function infoFor(name) {
    const t = wikiTitle(name);
    const hit = mem.get(t);
    if (hit) return hit.missing ? null : hit;
    if (!live) return null;
    if (!pending.has(t)) {
      pending.set(t, fetchSummary(t, { fetchImpl }).then((s) => { mem.set(t, s || { title: t, missing: true }); return s; }).catch(() => null).finally(() => pending.delete(t)));
    }
    return pending.get(t);
  };
}
