import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server.js';
import { merge, rawHash, buildRegs } from '../src/regs.js';
import { parseSpecies, parseFamilies } from '../src/scraper.js';

const SPECIES_HTML = `<html><body><h1>Black Sea Bass</h1><i>Centropristis striata</i><table>
<tr class="table-row"><td class="table-field-name">Season</td><td class="table-field-value">May 1 through December 31. </td></tr>
<tr class="table-row"><td class="table-field-name">Size Limit</td><td class="table-field-value">12.5 inch minimum</td></tr>
<tr class="table-row"><td class="table-field-name">Daily Limit / Person</td><td class="table-field-value">
   15
</td></tr></table></body></html>`;

test('parseSpecies pulls the three regulation fields', () => {
  const r = parseSpecies(SPECIES_HTML, { id: 93, habitat: 'saltwater', family: 'Basses (Sea)' });
  assert.equal(r.n, 'Black Sea Bass');
  assert.equal(r.season, 'May 1 through December 31.');
  assert.equal(r.size, '12.5 inch minimum');
  assert.equal(r.limit, '15');
  assert.equal(r.sci, 'Centropristis striata');
});

test('parseFamilies attaches the nearest heading as family', () => {
  const html = `<h3>Drums</h3><a href="FishSpecies.aspx?habitat=2&species=92">x</a><a href="FishSpecies.aspx?habitat=2&species=92">More</a><h3>Flounders</h3><a href="FishSpecies.aspx?habitat=2&species=185"></a>`;
  const f = parseFamilies(html);
  assert.deepEqual(f.map((x) => [x.href, x.family]), [['FishSpecies.aspx?habitat=2&species=92', 'Drums'], ['FishSpecies.aspx?habitat=2&species=185', 'Flounders']]);
});

test('merge flags overlay entries whose DNREC text changed', () => {
  const raw = { scraped: '2026-01-01', source: 'https://x/', species: [{ id: 1, h: 'saltwater', n: 'Tautog', f: 'X', season: 'Jan 1 to May 15', size: '16 inch minimum', limit: '4' }] };
  const ov = { 1: { aliases: ['tog'], status: 'open', zones: [], notes: [], reviewed: '2026-01-01', rawHash: rawHash(raw.species[0]) } };
  assert.equal(merge(raw, ov).species[0].needsReview, false);
  raw.species[0].limit = '2';
  const m = merge(raw, ov).species[0];
  assert.equal(m.needsReview, true);
  assert.match(m.notes[0], /changed the wording/);
});

test('merge flags unreviewed species that carry a real rule', () => {
  const raw = { scraped: '2026-01-01', source: 'https://x/', species: [
    { id: 2, h: 'saltwater', n: 'Nothing Fish', f: 'X', season: 'Open Year-Round', size: 'No Size Limit', limit: 'No Limit' },
    { id: 3, h: 'saltwater', n: 'Rule Fish', f: 'X', season: 'Open Year-Round', size: '10 inch minimum', limit: 'No Limit' }] };
  const m = merge(raw, {}).species;
  assert.equal(m[0].needsReview, false);
  assert.equal(m[1].needsReview, true);
});

test('bundled data: every overlay entry still matches the DNREC text it was reviewed against', () => {
  const stale = buildRegs().species.filter((s) => s.needsReview && s.reviewed);
  assert.deepEqual(stale.map((s) => s.name), [], 'run `npm run review` and update overlay.json');
});

test('bundled data: no species with a rule is missing an overlay', () => {
  const missing = buildRegs().species.filter((s) => s.needsReview && !s.reviewed);
  assert.deepEqual(missing.map((s) => s.name), []);
});

test('GET /api/regs and /healthz', async () => {
  const app = createApp();
  const h = await request(app).get('/healthz');
  assert.equal(h.status, 200);
  assert.ok(h.body.species > 150);
  const r = await request(app).get('/api/regs');
  assert.equal(r.status, 200);
  const tog = r.body.species.find((s) => s.name === 'Tautog');
  assert.deepEqual(tog.zones[0].seasons, [['01-01', '05-15'], ['07-01', '12-31']]);
  const again = await request(app).get('/api/regs').set('If-None-Match', r.headers.etag);
  assert.equal(again.status, 304);
  const idx = await request(app).get('/');
  assert.equal(idx.status, 200);
  assert.match(idx.text, /KeepGauge/);
});
