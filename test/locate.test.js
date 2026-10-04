import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeLocator, nearestState } from '../src/locate.js';
import { createApp } from '../server.js';

const census = (state) => async () => ({ ok: true, json: async () => ({ result: { geographies: { States: state ? [{ STUSAB: state }] : [] } } }) });
const down = async () => { throw new Error('offline'); };

test('locator: census state wins; offshore falls back to nearest live state as federal', async () => {
  const live = ['DE', 'VA'];
  const l1 = makeLocator({ live, names: { DE: 'Delaware', VA: 'Virginia' }, fetchImpl: census('VA') });
  assert.deepEqual(await l1(36.9, -76.0), { state: 'VA', method: 'census', offshore: false, supported: true, detected: 'VA', name: 'Virginia' });
  const l2 = makeLocator({ live, fetchImpl: census(null) });           // 15 nm off Rehoboth
  const r2 = await l2(38.7, -74.7); assert.equal(r2.state, 'DE'); assert.equal(r2.offshore, true); assert.equal(r2.method, 'nearest');
  const l3 = makeLocator({ live, fetchImpl: census('MD') });           // Maryland: no data yet -> nearest live, on land
  const r3 = await l3(38.3, -75.6); assert.equal(r3.detected, 'MD'); assert.equal(r3.offshore, false); assert.equal(r3.supported, false); assert.equal(r3.state, null); assert.ok(['DE', 'VA'].includes(r3.nearest));
  const l4 = makeLocator({ live, fetchImpl: down });                    // geocoder down: box fallback, never claims offshore
  const r4 = await l4(39.2, -75.5); assert.equal(r4.state, 'DE'); assert.equal(r4.method, 'fallback'); assert.equal(r4.offshore, false);
  const l5 = makeLocator({ live, fetchImpl: census('CA') });
  assert.equal((await l5(34.0, -118.2)).state, null);
  assert.equal(nearestState(38.7, -74.7, ['DE', 'VA']).code, 'DE');
});

test('routes: /api/regs?state, /api/states, /api/locate', async () => {
  const app = createApp({ locateFetch: census(null) });
  const de = await request(app).get('/api/regs'); assert.equal(de.body.state, 'DE'); assert.ok(de.body.zoneLabels.delriver);
  const va = await request(app).get('/api/regs?state=va'); assert.equal(va.body.state, 'VA'); assert.equal(va.body.name, 'Virginia');
  const sb = va.body.species.find((s) => s.name === 'Striped Bass'); assert.equal(sb.deId, 203); assert.equal(sb.photo, '/img/species/203.jpg'); assert.ok(sb.id >= 10000);
  assert.ok(va.body.zoneLabels.chesapeakebay);
  for (const [code, n, zone] of [['NC', 'ocean'], ['SC', 'savannah'], ['GA', 'savannah'], ['FL', 'tampa']].map(([c, z]) => [c, 0, z])) { const r = await request(app).get('/api/regs?state=' + code); assert.equal(r.status, 200); assert.ok(r.body.zoneLabels[zone], `${code} zone ${zone}`); assert.ok(r.body.species.length > 15); }
  const fl = (await request(app).get('/api/regs?state=FL')).body; const rd = fl.species.find((s) => s.name === 'Red Drum'); assert.equal(rd.zones.length, 9); assert.equal(rd.deId, 150); assert.ok(fl.species.find((s) => s.name === 'Snook'));
  assert.equal((await request(app).get('/api/regs?state=XX')).status, 404);
  const st = await request(app).get('/api/states'); assert.ok(st.body.states.find((s) => s.code === 'VA').live); assert.ok(st.body.states.find((s) => s.code === 'NJ').live); assert.ok(st.body.states.every((s) => s.live));
  const loc = await request(app).get('/api/locate?lat=38.7&lon=-74.7'); assert.equal(loc.body.state, 'DE'); assert.equal(loc.body.offshore, true);
  assert.equal((await request(app).get('/api/locate?lat=x')).status, 400);
});
