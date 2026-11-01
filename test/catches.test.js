import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCatch, tideStage, stampConditions, makeMemoryCatches } from '../src/catches.js';
import { summarize, rankWindows, stagesDuring, MIN_CATCHES } from '../src/insights.js';
import * as moon from '../src/moon.js';

test('cleanCatch requires a species and rejects nonsense measurements', () => {
  assert.throws(() => cleanCatch({}), /species/i);
  assert.throws(() => cleanCatch({ species: 'Striped Bass', lengthIn: -4 }), /length/i);
  assert.throws(() => cleanCatch({ species: 'Striped Bass', weightLb: 99999 }), /weight/i);
  assert.throws(() => cleanCatch({ species: 'Striped Bass', lat: 200 }), /latitude/i);
  assert.throws(() => cleanCatch({ species: 'Striped Bass', at: '2099-01-01' }), /future/i);
});

test('cleanCatch normalizes and truncates', () => {
  const c = cleanCatch({ species: '  Striped Bass  ', note: 'x'.repeat(900), kept: 'true', state: 'DE', lengthIn: '28' });
  assert.equal(c.species, 'Striped Bass');
  assert.equal(c.note.length, 500);
  assert.equal(c.kept, true);
  assert.equal(c.state, 'de');
  assert.equal(c.lengthIn, 28);
});

test('tideStage judges the catch moment, not the current clock', () => {
  const at = Date.parse('2026-06-15T12:00:00Z');
  const nearHigh = { minutesToNext: 20, next: { type: 'H', ms: at + 20 * 60e3 }, prev: { type: 'L', ms: at - 300 * 60e3 }, rising: true };
  assert.equal(tideStage(nearHigh, at), 'high slack');
  const justAfterHigh = { minutesToNext: 340, next: { type: 'L', ms: at + 340 * 60e3 }, prev: { type: 'H', ms: at - 30 * 60e3 }, rising: false };
  assert.equal(tideStage(justAfterHigh, at), 'high slack');
  const mid = { minutesToNext: 200, next: { type: 'H', ms: at + 200 * 60e3 }, prev: { type: 'L', ms: at - 170 * 60e3 }, rising: true };
  assert.equal(tideStage(mid, at), 'incoming');
  assert.equal(tideStage(null, at), null);
});

test('stampConditions never loses the catch when a service fails', async () => {
  const rec = cleanCatch({ species: 'Red Drum', lat: 38.6, lon: -75.07, at: '2026-06-15T12:00:00Z' });
  const boom = { predictions: async () => { throw new Error('NOAA down'); }, phase: () => null };
  const out = await stampConditions(rec, { tides: boom, weather: { at: async () => { throw new Error('NWS down'); } }, moon, stations: () => [{ id: '8557380', name: 'Lewes' }] });
  assert.equal(out.species, 'Red Drum');
  assert.equal(out.conditions.tide, null);
  assert.equal(out.conditions.weather, null);
  assert.ok(out.conditions.moon.name, 'moon is local arithmetic and should still be stamped');
});

test('stampConditions records tide, moon and weather when services answer', async () => {
  const at = Date.parse('2026-06-15T12:00:00Z');
  const rec = cleanCatch({ species: 'Flounder', lat: 38.6, lon: -75.07, at: new Date(at).toISOString() });
  const tides = {
    predictions: async (id, opts) => { assert.equal(id, '8557380'); assert.equal(opts.days, 1); return { hilo: [{ ms: at + 60 * 60e3, type: 'H', v: 4.2 }] }; },
    phase: (_d, when) => ({ rising: true, height: 3.1, next: { type: 'H', ms: at + 60 * 60e3 }, prev: { type: 'L', ms: at - 300 * 60e3 }, minutesToNext: 60, when }),
  };
  const weather = { at: async () => ({ current: { sky: 'partly', text: 'Partly Cloudy', tempF: 74, windMph: 8, windDir: 'SW', pressureInHg: 30.1 }, sky: 'partly' }) };
  const out = await stampConditions(rec, { tides, weather, moon, stations: () => [{ id: '8557380', name: 'Lewes' }] });
  assert.equal(out.conditions.tide.stage, 'incoming');
  assert.equal(out.conditions.weather.windMph, 8);
  assert.equal(out.conditions.station.name, 'Lewes');
  assert.ok(out.conditions.solunar);
});

test('memory store keeps catches per user and deletes only your own', async () => {
  const store = makeMemoryCatches();
  const a = await store.add('u1', cleanCatch({ species: 'Tautog' }));
  await store.add('u2', cleanCatch({ species: 'Scup' }));
  assert.equal((await store.list('u1')).length, 1);
  assert.equal(await store.remove('u2', a.id), false, 'must not delete another user\'s catch');
  assert.equal(await store.remove('u1', a.id), true);
  assert.equal(await store.count('u1'), 0);
});

// --- insights ---

const mk = (n, { stage = 'incoming', moonName = 'Full Moon', label = 'Moon overhead', species = 'Striped Bass', hour = 6 } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`, species, at: new Date(Date.UTC(2026, 5, 1 + (i % 20), hour)).toISOString(), kept: true, released: false,
    conditions: { tide: { stage }, moon: { name: moonName }, solunar: { window: label ? { label, kind: 'major' } : null }, weather: { sky: 'clear', windMph: 6 } },
  }));

test('a thin log reports counts but claims no pattern', () => {
  const s = summarize(mk(5));
  assert.equal(s.enough, false);
  assert.equal(s.catches, 5);
  assert.equal(s.minCatches, MIN_CATCHES);
});

test('an evenly spread log finds no "best" tide stage', () => {
  const rows = [...mk(5, { stage: 'incoming' }), ...mk(5, { stage: 'outgoing' }), ...mk(5, { stage: 'high slack' }), ...mk(5, { stage: 'low slack' })];
  const s = summarize(rows);
  assert.equal(s.enough, true);
  assert.deepEqual(s.tide.best, [], 'an even split is not a pattern');
  assert.equal(s.tide.decisive, false);
});

test('a lopsided log names the winning bucket with its sample size', () => {
  const rows = [...mk(14, { stage: 'outgoing' }), ...mk(3, { stage: 'incoming' })];
  const s = summarize(rows);
  assert.deepEqual(s.tide.best, ['outgoing']);
  assert.equal(s.tide.buckets[0].key, 'outgoing');
  assert.equal(s.tide.buckets[0].n, 14);
  assert.ok(s.tide.buckets[0].pct > 70);
});

test('summarize can narrow to one species', () => {
  const rows = [...mk(13, { species: 'Striped Bass' }), ...mk(4, { species: 'Bluefish' })];
  assert.equal(summarize(rows, { species: 'Bluefish' }).catches, 4);
  assert.equal(summarize(rows).bySpecies[0].name, 'Striped Bass');
});

test('rankWindows explains itself and puts matching windows on top', () => {
  const summary = summarize([...mk(14, { stage: 'outgoing', label: 'Moon overhead', moonName: 'Full Moon' }), ...mk(3, { stage: 'incoming', label: 'Moonrise', moonName: 'New Moon' })]);
  const now = Date.parse('2026-06-15T00:00:00Z');
  const days = [{
    date: '2026-06-15', phase: { name: 'Full Moon', emoji: '🌕' }, rating: 95,
    windows: [
      { kind: 'major', label: 'Moon overhead', start: now + 3600e3, peak: now + 2 * 3600e3, end: now + 3 * 3600e3 },
      { kind: 'minor', label: 'Moonset', start: now + 8 * 3600e3, peak: now + 8.5 * 3600e3, end: now + 9 * 3600e3 },
    ],
  }];
  const ranked = rankWindows({ summary, days, hilo: [], now });
  assert.equal(ranked[0].label, 'Moon overhead');
  assert.ok(ranked[0].score > ranked[1].score);
  assert.ok(ranked[0].reasons.some((r) => /solunar window/.test(r)), 'must say why');
  assert.ok(ranked[0].reasons.some((r) => /Full Moon/.test(r)));
});

test('rankWindows drops windows that already passed', () => {
  const summary = summarize(mk(14));
  const now = Date.parse('2026-06-15T12:00:00Z');
  const days = [{ date: '2026-06-15', phase: { name: 'Full Moon', emoji: '🌕' }, rating: 90, windows: [{ kind: 'major', label: 'Moon overhead', start: now - 5 * 3600e3, peak: now - 4 * 3600e3, end: now - 3 * 3600e3 }] }];
  assert.equal(rankWindows({ summary, days, now }).length, 0);
});

test('stagesDuring reports the tide stages inside a window', () => {
  const t = Date.parse('2026-06-15T12:00:00Z');
  const hilo = [{ ms: t + 60 * 60e3, type: 'H', v: 4 }, { ms: t + 7 * 3600e3, type: 'L', v: 0.5 }];
  const stages = stagesDuring(hilo, t, t + 2 * 3600e3);
  assert.ok(stages.includes('high slack'), `got ${stages.join(',')}`);
});

test('a single bucket is a blind spot, not a preference', () => {
  const s = summarize(mk(14, { stage: 'outgoing' })); // every fish on the same tide
  assert.equal(s.tide.only, true);
  assert.deepEqual(s.tide.best, [], 'with nothing to compare against there is no "best"');
  assert.equal(s.tide.decisive, false);
});
