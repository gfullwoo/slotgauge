import test from 'node:test';
import assert from 'node:assert/strict';
import { tripDays, moonAcross, weatherAcross, forecastCoverage, MAX_DAYS } from '../src/trip.js';
import { statusOn, openAcross, inWindow, firstSat, seasonOpen } from '../src/season.js';
import { buildBrief, advise } from '../src/advisor.js';
import { buildAllRegs } from '../src/regs.js';

const SC = buildAllRegs().SC;

test('season windows that wrap the new year are handled', () => {
  assert.equal(inWindow('01-15', '11-01', '02-28'), true, 'January is inside Nov–Feb');
  assert.equal(inWindow('06-15', '11-01', '02-28'), false);
  assert.equal(inWindow('06-15', '05-01', '08-31'), true);
  assert.match(firstSat(2027, 3), /^04-0[1-7]$/);
  assert.equal(seasonOpen({ seasons: null }, new Date()).open, true);
  assert.equal(seasonOpen({ seasons: [['05-01', '08-31']] }, new Date('2027-01-10T12:00:00Z')).open, false);
});

test('a closed species never reaches the legal list, and zones are not confused', () => {
  const days = tripDays('2027-03-12', '2027-03-15');

  // Closed in the zone being asked about: must be absent entirely.
  const shut = { id: 90001, name: 'Test Closed Fish', habitat: 'saltwater', status: 'closed',
                 zones: [{ zone: 'state', seasons: null, size: [], bag: null, bagNote: '', closed: true }] };
  assert.equal(statusOn(shut, new Date('2027-03-14T12:00:00Z')).open, false);
  assert.equal(openAcross([shut], days).length, 0);

  // Out of season on these dates: also absent, though it is open at other times of year.
  const summer = { id: 90002, name: 'Test Summer Fish', habitat: 'saltwater', status: 'open',
                   zones: [{ zone: 'state', seasons: [['05-01', '08-31']], size: [], bag: 2, bagNote: '', closed: false }] };
  assert.equal(openAcross([summer], days).length, 0, 'March trip, May-August season');
  assert.equal(openAcross([summer], tripDays('2027-06-01', '2027-06-03')).length, 1);

  // Closed in one zone but open in another is NOT a closed species: Red Drum is shut in federal
  // waters and fine in state waters, and the zone asked for decides.
  const rd = SC.species.find((s) => /^red drum$/i.test(s.name));
  if (rd && rd.zones.some((z) => z.zone === 'federal' && z.closed)) {
    assert.equal(statusOn(rd, new Date('2027-03-14T12:00:00Z'), 'state').open, true);
    assert.equal(statusOn(rd, new Date('2027-03-14T12:00:00Z'), 'federal').open, false);
  }
});

test('trip windows are validated and bounded', () => {
  assert.equal(tripDays('2027-03-12', '2027-03-14').length, 3);
  assert.throws(() => tripDays('2027-03-12', '2027-03-01'), /end date is before/i);
  assert.throws(() => tripDays('nope', '2027-03-01'), /YYYY-MM-DD/);
  assert.throws(() => tripDays('2027-03-01', '2027-04-30'), new RegExp(`${MAX_DAYS} days`));
});

test('moon and solunar resolve for any date, however far ahead', () => {
  const days = tripDays('2029-07-01', '2029-07-03');
  const m = moonAcross(days, 33.69, -78.89, 'America/New_York');
  assert.equal(m.length, 3);
  for (const d of m) {
    assert.ok(d.phase.name, 'phase named');
    assert.equal(d.windows.length, 4, 'four solunar windows a day');
    assert.ok(d.ratingLabel);
  }
});

test('weather past the forecast horizon is reported as missing, never filled in', () => {
  const days = tripDays('2027-03-12', '2027-03-15');
  const w = weatherAcross([], days);
  assert.ok(w.every((d) => d.outOfRange), 'every day out of range when there is no forecast');
  const cov = forecastCoverage(w);
  assert.deepEqual({ days: cov.days, none: cov.none, partial: cov.partial }, { days: 0, none: true, partial: false });

  // a forecast covering only the first day must report partial coverage, not pretend to cover all
  const daily = [{ t: '2027-03-12T12:00:00Z', name: 'Friday', day: true, tempF: 62, text: 'Sunny', sky: 'clear', pop: 0, wind: '10 mph', windDir: 'SW' }];
  const w2 = weatherAcross(daily, days);
  const c2 = forecastCoverage(w2);
  assert.equal(c2.days, 1); assert.equal(c2.partial, true); assert.equal(c2.none, false);
  assert.ok(w2[1].outOfRange);
});

test('the brief states plainly when there is no forecast, and never asks for a fishing report', () => {
  const days = tripDays('2027-03-12', '2027-03-14');
  const legal = openAcross(SC.species, days).slice(0, 5);
  const w = weatherAcross([], days);
  const brief = buildBrief({
    place: 'Springmaid Pier', state: 'sc', days, species: legal,
    tides: days.map((d) => ({ date: d, hilo: [] })), moon: moonAcross(days, 33.69, -78.89, 'America/New_York'),
    weather: w, coverage: forecastCoverage(w), log: null, target: null, tz: 'America/New_York',
  });
  assert.match(brief, /no forecast exists this far ahead/i);
  assert.match(brief, /Do not speculate/i);
  assert.match(brief, /folklore, not forecast/i);
  assert.doesNotMatch(brief, /fishing report/i, 'the brief must never invite a report the model cannot have');
  for (const s of legal) assert.ok(brief.includes(s.name));
});

test('advice is vetted: a species the rules do not allow is dropped, not warned about', async () => {
  const days = tripDays('2027-03-12', '2027-03-14');
  const legal = openAcross(SC.species, days).slice(0, 4);
  const real = legal[0].name;
  const fakeClient = {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: JSON.stringify({
          overview: 'ok',
          species: [
            { name: real, why: 'grounded', bestTimes: ['dawn'], bait: ['shrimp'], style: 'bottom', confidence: 'medium', basis: 'tides' },
            { name: 'Atlantic Unicornfish', why: 'invented', bait: [], style: '', confidence: 'high', basis: 'nothing' },
          ],
          caveats: [],
        }) }],
      }),
    },
  };
  const { advice, dropped } = await advise({ brief: 'x', legal, days, client: fakeClient });
  assert.equal(advice.species.length, 1, 'only the legal species survives');
  assert.equal(advice.species[0].name, real);
  assert.equal(advice.species[0].speciesId, legal[0].id, 'vetting attaches the real species id');
  assert.equal(advice.species[0].size, legal[0].size, '... and the real size rule');
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].name, 'Atlantic Unicornfish');
  assert.match(dropped[0].reason, /not legal/i);
});

test('advice fails loudly rather than returning nothing when the model is unreachable', async () => {
  const boom = { messages: { create: async () => { throw new Error('upstream down'); } } };
  await assert.rejects(() => advise({ brief: 'x', legal: [{ id: 1, name: 'X' }], days: ['2027-03-12'], client: boom }), /Could not reach the advice model/);
});
