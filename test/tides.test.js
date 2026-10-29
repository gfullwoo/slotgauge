import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTides, loadStations, nearestStations, searchStations, zonedToEpoch, synthCurve, phaseAt, addDays } from '../src/tides.js';
import { createApp } from '../server.js';

const stations = loadStations().stations;

test('bundled station list loads and finds Myrtle Beach', () => {
  assert.ok(stations.length > 3000);
  const near = nearestStations(stations, 33.69, -78.89, 5);
  assert.ok(near.slice(0, 3).some((s) => s.id === '8661070')); assert.equal(near[0].tz, 'America/New_York'); assert.ok(near[0].miles < 5);
  assert.ok(searchStations(stations, 'myrtle').some((s) => s.id === '8661070'));
  assert.equal(searchStations(stations, 'zzzz').length, 0);
});

test('zoned time parsing is DST-aware', () => {
  assert.equal(zonedToEpoch('2026-07-04 12:00', 'America/New_York'), Date.UTC(2026, 6, 4, 16, 0));
  assert.equal(zonedToEpoch('2026-01-04 12:00', 'America/New_York'), Date.UTC(2026, 0, 4, 17, 0));
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
});

const hiloJson = (t0) => ({ predictions: [
  { t: `${t0} 03:14`, v: '-0.098', type: 'L' }, { t: `${t0} 09:24`, v: '6.854', type: 'H' }, { t: `${t0} 16:07`, v: '0.299', type: 'L' }, { t: `${t0} 21:54`, v: '5.369', type: 'H' },
] });
function fakeNoaa() {
  const calls = [];
  return { calls, fetch: async (url) => { calls.push(url); const u = new URL(url); const begin = u.searchParams.get('begin_date'); const d = `${begin.slice(0, 4)}-${begin.slice(4, 6)}-${begin.slice(6, 8)}`;
    if (u.searchParams.get('interval') === 'hilo') { const days = +u.searchParams.get('range') / 24; const preds = []; for (let i = 0; i < days; i++) preds.push(...hiloJson(addDays(d, i)).predictions); return { ok: true, json: async () => ({ predictions: preds }) }; }
    return { ok: true, json: async () => ({ predictions: [{ t: `${d} 00:00`, v: '2.9' }, { t: `${d} 00:30`, v: '2.3' }] }) }; } };
}

test('predictions: reference station gets NOAA curve, subordinate gets a synthesized one; cache hits', async () => {
  const f = fakeNoaa();
  const now = () => new Date(Date.UTC(2026, 9, 28, 16, 0)); // 12:00 EDT
  const tides = makeTides({ stations, fetchImpl: f.fetch, now });
  const d = await tides.predictions('8661070');
  assert.equal(d.begin, '2026-10-28'); assert.equal(d.hilo.length, 8); assert.equal(d.curve.length, 2); assert.equal(d.around.length, 16);
  const ph = tides.phase(d); assert.equal(ph.rising, false); assert.equal(ph.next.type, 'L'); assert.equal(ph.next.t, '2026-10-28 16:07');
  const n = f.calls.length; await tides.predictions('8661070'); assert.equal(f.calls.length, n);
  const sub = stations.find((s) => s.type === 'subordinate' && s.tz === 'America/New_York');
  const d2 = await tides.predictions(sub.id);
  assert.ok(d2.curve.length > 90); assert.ok(f.calls.filter((u) => u.includes(`station=${sub.id}`)).every((u) => u.includes('interval=hilo')));
});

test('synthCurve interpolates between highs and lows', () => {
  const hl = [{ ms: 0, v: 0, type: 'L' }, { ms: 6 * 3600e3, v: 6, type: 'H' }, { ms: 12 * 3600e3, v: 0, type: 'L' }];
  const c = synthCurve(hl, 0, 12 * 3600e3, 'Etc/UTC');
  assert.equal(c.length, 24); assert.equal(c[6].v, 3); assert.equal(phaseAt({ hilo: hl, curve: c }, 3 * 3600e3).rising, true);
});

test('tide API routes', async () => {
  const f = fakeNoaa();
  const app = createApp({ wikiLive: false, tidesRefresh: false, tides: makeTides({ stations, fetchImpl: f.fetch }) });
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const near = await (await fetch(`${base}/api/tides/stations?lat=33.69&lon=-78.89`)).json(); assert.ok(near.stations.slice(0, 3).some((s) => s.id === '8661070'));
    const q = await (await fetch(`${base}/api/tides/stations?q=lewes`)).json(); assert.ok(q.stations.some((s) => s.id === '8557380'));
    const st = await (await fetch(`${base}/api/tides/stations?state=DE`)).json(); assert.ok(st.stations.length > 10 && st.stations.every((s) => s.state === 'DE'));
    assert.equal((await fetch(`${base}/api/tides/stations`)).status, 400);
    assert.equal((await fetch(`${base}/api/tides?station=0`)).status, 404);
    const t = await (await fetch(`${base}/api/tides?station=8661070&date=2026-10-28`)).json();
    assert.equal(t.station.id, '8661070'); assert.equal(t.hilo.length, 8); assert.ok(t.now); assert.equal(t.units, 'ft');
  } finally { srv.close(); }
});
