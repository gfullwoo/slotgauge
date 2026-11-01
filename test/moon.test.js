import test from 'node:test';
import assert from 'node:assert/strict';
import { moonPhase, phaseName, solunar, windowAt, ratingLabel } from '../src/moon.js';

// Known lunations (NASA/USNO): these are the reference points the series is checked against.
test('new moon is near phase 0 and nearly dark', () => {
  const p = moonPhase(new Date('2026-01-18T19:52:00Z')); // new moon
  assert.ok(p.fraction < 0.02, `fraction ${p.fraction}`);
  assert.ok(p.phase < 0.02 || p.phase > 0.98, `phase ${p.phase}`);
  assert.equal(p.name, 'New Moon');
});

test('full moon is near phase 0.5 and fully lit', () => {
  const p = moonPhase(new Date('2026-01-03T10:03:00Z')); // full moon
  assert.ok(p.fraction > 0.98, `fraction ${p.fraction}`);
  assert.ok(Math.abs(p.phase - 0.5) < 0.02, `phase ${p.phase}`);
  assert.equal(p.name, 'Full Moon');
});

test('first quarter is half lit', () => {
  const p = moonPhase(new Date('2026-01-26T04:48:00Z'));
  assert.ok(Math.abs(p.fraction - 0.5) < 0.06, `fraction ${p.fraction}`);
});

test('phase names cover the whole cycle without a gap', () => {
  for (let i = 0; i <= 100; i++) assert.ok(phaseName(i / 100), `no name at ${i / 100}`);
});

test('moon age stays inside one synodic month', () => {
  const p = moonPhase(new Date('2026-06-15T12:00:00Z'));
  assert.ok(p.age >= 0 && p.age <= 29.54, `age ${p.age}`);
});

// Indian River Inlet, Delaware — Greg's home water.
const LAT = 38.61, LON = -75.07;
const dayStart = (ymd) => Date.parse(`${ymd}T05:00:00Z`); // EST local midnight

test('a day has solunar windows, ordered, with majors longer than minors', () => {
  const s = solunar(dayStart('2026-06-15'), LAT, LON, 'America/New_York');
  assert.ok(s.windows.length >= 2, `only ${s.windows.length} windows`);
  for (let i = 1; i < s.windows.length; i++) assert.ok(s.windows[i].start >= s.windows[i - 1].start, 'windows out of order');
  for (const w of s.windows) {
    assert.ok(w.start < w.peak && w.peak < w.end, 'window peak not inside window');
    const mins = (w.end - w.start) / 60000;
    assert.ok(w.kind === 'major' ? Math.abs(mins - 120) < 1 : Math.abs(mins - 60) < 1, `${w.kind} ${mins}min`);
  }
  assert.ok(s.windows.every((w) => w.start >= dayStart('2026-06-15') - 2 * 3600e3), 'window far outside the day');
});

test('majors are moon overhead / underfoot, minors are moonrise / moonset', () => {
  const s = solunar(dayStart('2026-06-15'), LAT, LON);
  const majors = s.windows.filter((w) => w.kind === 'major');
  const minors = s.windows.filter((w) => w.kind === 'minor');
  assert.ok(majors.every((w) => ['Moon overhead', 'Moon underfoot'].includes(w.label)));
  assert.ok(minors.every((w) => ['Moonrise', 'Moonset'].includes(w.label)));
});

test('rating peaks at new and full moon, bottoms at the quarters', () => {
  const full = solunar(dayStart('2026-01-03'), LAT, LON).rating;
  const quarter = solunar(dayStart('2026-01-26'), LAT, LON).rating;
  assert.ok(full > 90, `full ${full}`);
  assert.ok(quarter < 25, `quarter ${quarter}`);
  assert.equal(ratingLabel(full), 'Excellent');
});

test('windowAt finds the window a moment sits in, and nothing outside one', () => {
  const s = solunar(dayStart('2026-06-15'), LAT, LON);
  const w = s.windows[0];
  assert.equal(windowAt(s, w.peak).label, w.label);
  assert.equal(windowAt(s, w.start - 60e3 * 10), null);
});

test('moonrise and moonset land within the requested day when they occur', () => {
  const start = dayStart('2026-06-15');
  const s = solunar(start, LAT, LON);
  for (const t of [s.moonrise, s.moonset]) {
    if (t === null) continue;
    assert.ok(t >= start - 3600e3 && t <= start + 27 * 3600e3, `out of range ${new Date(t).toISOString()}`);
  }
});

test('high latitudes do not throw even when the moon never sets', () => {
  const s = solunar(Date.parse('2026-06-15T00:00:00Z'), 71.3, -156.8, 'America/Anchorage'); // Utqiagvik
  assert.ok(Array.isArray(s.windows));
  assert.ok(s.rating >= 0 && s.rating <= 100);
});
