// Scrapes the Delaware DNREC "Fish Facts" species pages into data/dnrec_raw.json.
// Official state source only: https://fishspecies.dnrec.delaware.gov/
import * as cheerio from 'cheerio';

export const BASE = 'https://fishspecies.dnrec.delaware.gov';
export const HABITATS = { 1: 'freshwater', 2: 'saltwater', 3: 'shellfish' };

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

async function get(url, fetchImpl) {
  const r = await fetchImpl(url, { headers: { 'user-agent': 'fishkeepr-scraper (+github.com/gfullwoo/fishkeepr)' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

/** Parse a FishFamilies.aspx page into [{href, family}] */
export function parseFamilies(html) {
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();
  let family = '';
  $('h2, h3, h4, a[href*="FishSpecies.aspx"]').each((_, el) => {
    if (el.tagName !== 'a') { family = clean($(el).text()); return; }
    const href = $(el).attr('href');
    if (!href || seen.has(href)) return;
    seen.add(href);
    out.push({ href, family });
  });
  return out;
}

/** Parse a FishSpecies.aspx page into the raw record used by the app. */
export function parseSpecies(html, { id, habitat, family }) {
  const $ = cheerio.load(html);
  const rec = { id, h: habitat, n: clean($('h1').first().text()), f: family, sci: '', season: '', size: '', limit: '' };
  $('tr.table-row').each((_, tr) => {
    const k = clean($(tr).find('.table-field-name').text());
    const v = clean($(tr).find('.table-field-value').text());
    if (k === 'Season') rec.season = v;
    else if (k === 'Size Limit') rec.size = v;
    else if (k === 'Daily Limit / Person') rec.limit = v;
  });
  const sci = $('i, em').map((_, e) => clean($(e).text())).get().find((t) => /^[A-Z][a-z]+ [a-z]+/.test(t));
  if (sci) rec.sci = sci;
  return rec;
}

export async function scrapeAll({ fetchImpl = fetch, delayMs = 150, log = () => {} } = {}) {
  const species = [];
  for (const [h, habitat] of Object.entries(HABITATS)) {
    const fams = parseFamilies(await get(`${BASE}/FishFamilies.aspx?habitat=${h}`, fetchImpl));
    log(`habitat ${habitat}: ${fams.length} species`);
    for (const { href, family } of fams) {
      const id = +href.match(/species=(\d+)/)[1];
      const html = await get(`${BASE}/${href.replace(/^\//, '')}`, fetchImpl);
      species.push(parseSpecies(html, { id, habitat, family }));
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  species.sort((a, b) => a.h.localeCompare(b.h) || a.id - b.id);
  return { scraped: new Date().toISOString().slice(0, 10), source: `${BASE}/`, species };
}
