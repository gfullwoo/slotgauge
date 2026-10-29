import test from 'node:test';
import assert from 'node:assert/strict';
import { wikiTitle, wikiUrl, cleanName, fetchSummary, refreshSpeciesInfo, makeInfoLookup } from '../src/wiki.js';
import { buildAllRegs } from '../src/regs.js';

test('curated titles and fallbacks', () => {
  assert.equal(wikiTitle('Spot'), 'Spot (fish)');
  assert.equal(wikiTitle('Walleye (nontidal)'), 'Walleye');
  assert.equal(wikiTitle('Blue Crab'), 'Callinectes sapidus');
  assert.equal(wikiTitle('Some Unknown Fish (inland)'), 'Some Unknown Fish');
  assert.equal(cleanName('Striped Bass (lakes and ponds)'), 'Striped Bass');
  assert.equal(wikiUrl('Sheepshead'), 'https://en.wikipedia.org/wiki/Sheepshead_(fish)');
});

test('every regulated species resolves to a title', () => {
  for (const regs of Object.values(buildAllRegs())) for (const sp of regs.species) assert.ok(wikiTitle(sp.name).length > 1, sp.name);
});

const fake = (pages) => async (url) => {
  const title = decodeURIComponent(url.split('/summary/')[1] || '').replace(/_/g, ' ');
  if (url.includes('list=search')) return { ok: true, status: 200, json: async () => ({ query: { search: [{ title: 'Spot (fish)' }] } }) };
  const p = pages[title];
  if (!p) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => p };
};

test('fetchSummary handles disambiguation and search fallback', async () => {
  const pages = {
    'Spot': { type: 'disambiguation', title: 'Spot' },
    'Spot (fish)': { type: 'standard', title: 'Spot (fish)', description: 'Species of fish', extract: 'The spot is a small saltwater fish.', thumbnail: { source: 'https://x/spot.jpg' }, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Spot_(fish)' } } },
  };
  const s = await fetchSummary('Spot', { fetchImpl: fake(pages) });
  assert.equal(s.title, 'Spot (fish)'); assert.equal(s.thumbnail, 'https://x/spot.jpg');
  assert.equal(await fetchSummary('Nothing Here', { fetchImpl: fake({}) }), null);
});

test('refreshSpeciesInfo only fetches missing or stale titles', async () => {
  const regs = { XX: { species: [{ name: 'Tautog' }, { name: 'Spot' }] } };
  const info = { Tautog: { title: 'Tautog', extract: 'old', fetched: '2026-01-01' } };
  const calls = [];
  const f = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ type: 'standard', title: 'Spot (fish)', extract: 'x' }) }; };
  const r = await refreshSpeciesInfo(regs, { info, fetchImpl: f, maxAgeDays: 3650 });
  assert.equal(r.fetched, 1); assert.ok(calls[0].includes('Spot'));
  assert.equal(r.info['Spot (fish)'].title, 'Spot (fish)');
});

test('makeInfoLookup serves the file, fetches once when live, never when offline', async () => {
  let n = 0;
  const f = async () => { n++; return { ok: true, status: 200, json: async () => ({ type: 'standard', title: 'Tautog', extract: 'A wrasse.' }) }; };
  const live = makeInfoLookup({ info: { Scup: { title: 'Scup', extract: 'porgy' } }, fetchImpl: f });
  assert.equal((await live('Scup')).extract, 'porgy');
  assert.equal((await live('Tautog')).extract, 'A wrasse.'); await live('Tautog'); assert.equal(n, 1);
  const off = makeInfoLookup({ info: {}, fetchImpl: f, live: false });
  assert.equal(await off('Bluefish'), null); assert.equal(n, 1);
});
