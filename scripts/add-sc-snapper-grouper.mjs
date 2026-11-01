// One-off: add the SCDNR "Snapper Grouper Complex" digest page to South Carolina.
// Source: https://www.eregulations.com/southcarolina/fishing/snapper-grouper-complex-size-catch-limits (SCDNR digest, 2026)
// State waters (0-3 mi) have no closed seasons; federal seasons/closures from the same page are recorded as a second zone.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const rawHash = (d) => createHash('sha1').update(`${d.season}|${d.size}|${d.limit}`).digest('hex').slice(0, 12);
const SRC = 'sc-snapper-grouper';
const REVIEWED = '2026-10-31';
const STATE = { zone: 'state', label: 'SC state waters (to 3 mi)', seasons: null, closed: false };
const FED = { zone: 'federal', label: 'Federal waters (3–200 mi)' };
const HEAD = 'Land with head and tail intact. Dehooking tool and a rigged descending device required when fishing for or possessing snapper-grouper species; non-stainless, non-offset circle hooks required with natural bait.';
const SNAP10 = 'Counts toward the 10-fish snapper aggregate (all snappers except red and vermilion)';
const GRP3 = 'Counts toward the 3-fish grouper/tilefish aggregate';

// [name, aliases, sizeText, min, measure, bagText, bag, federalSeasonText, federalSeasons([[open,close]]) | null, federalClosed, notes[]]
const ROWS = [
  ['Red Snapper', ['american red snapper', 'genuine red'], '20 inch total length', 20, 'TL', '2 per person per day (state waters only)', 2, 'Possession prohibited in federal waters except during the announced federal mini-season', null, true, ['Federal waters: possession prohibited outside the short NOAA/SAFMC season announced each year — see safmc.net.']],
  ['Vermilion Snapper', ['beeliner', 'b-liner', 'mingo'], '12 inch total length', 12, 'TL', '5 per person per day', 5, 'Open year-round', null, false, ['Not part of the 10-snapper aggregate.']],
  ['Lane Snapper', [], '8 inch total length', 8, 'TL', '10 per person per day (snapper aggregate)', 10, 'Open year-round', null, false, [SNAP10 + '.']],
  ['Mutton Snapper', [], '18 inch total length', 18, 'TL', '5 per person per day, within the 10-snapper aggregate', 5, 'Open year-round', null, false, [SNAP10 + '.']],
  ['Gray Snapper', ['mangrove snapper', 'mango snapper', 'black snapper'], '12 inch total length', 12, 'TL', '10 per person per day (snapper aggregate)', 10, 'Open year-round', null, false, [SNAP10 + '.']],
  ['Yellowtail Snapper', ['flag'], '12 inch total length', 12, 'TL', '10 per person per day (snapper aggregate)', 10, 'Open year-round', null, false, [SNAP10 + '.']],
  ['Cubera Snapper', [], '12 inch total length', 12, 'TL', '10 per person per day (snapper aggregate)', 10, 'Open year-round', null, false, [SNAP10 + '.']],
  ['Blackfin Snapper', [], 'None', null, null, '10 per person per day (snapper aggregate)', 10, 'Open year-round', null, false, [SNAP10 + '.']],
  ['Silk Snapper', [], 'None', null, null, '10 per person per day (snapper aggregate)', 10, 'Open year-round', null, false, [SNAP10 + '.']],
  ['Queen Snapper', [], 'None', null, null, '10 per person per day (snapper aggregate)', 10, 'Open year-round', null, false, [SNAP10 + '.']],
  ['Red Porgy', ['pink snapper', 'silver snapper'], '14 inch total length', 14, 'TL', '1 per person per day', 1, 'Federal waters open May 1 – June 30 only', [['05-01', '06-30']], false, []],
  ['Gag Grouper', ['gag', 'gray grouper'], '24 inch total length', 24, 'TL', '1 per person per day (gag or black grouper, not both), within the 3-grouper aggregate; 2 per vessel in federal waters', 1, 'Federal waters closed Aug 2, 2026 – Apr 30, 2027', [['05-01', '08-01']], false, [GRP3 + '.', 'For-hire captains and crew have a zero bag limit.']],
  ['Black Grouper', [], '24 inch total length', 24, 'TL', '1 per person per day (gag or black grouper, not both), within the 3-grouper aggregate', 1, 'Federal waters closed Jan 1 – Apr 30', [['05-01', '12-31']], false, [GRP3 + '.']],
  ['Red Grouper', [], '20 inch total length', 20, 'TL', '3 per person per day (grouper aggregate)', 3, 'Federal waters closed Jan 1 – May 31', [['06-01', '12-31']], false, [GRP3 + '.']],
  ['Scamp', ['scamp grouper'], 'None', null, null, '3 per person per day in state waters; federal: 1 scamp or yellowmouth (not both), within the 3-grouper aggregate', 3, 'Federal waters closed Jan 1 – Apr 30', [['05-01', '12-31']], false, [GRP3 + '.']],
  ['Yellowmouth Grouper', [], 'None', null, null, '3 per person per day in state waters; federal: 1 scamp or yellowmouth (not both), within the 3-grouper aggregate', 3, 'Federal waters closed Jan 1 – Apr 30', [['05-01', '12-31']], false, [GRP3 + '.']],
  ['Yellowfin Grouper', [], 'None', null, null, '3 per person per day (grouper aggregate)', 3, 'Federal waters closed Jan 1 – Apr 30', [['05-01', '12-31']], false, [GRP3 + '.']],
  ['Snowy Grouper', [], 'None', null, null, '1 per vessel per day, within the 3-grouper aggregate', 1, 'Federal waters closed Jun 7, 2026 – Apr 30, 2027', [['05-01', '06-06']], false, [GRP3 + '.']],
  ['Misty Grouper', [], 'None', null, null, '3 per person per day (grouper aggregate)', 3, 'Open year-round', null, false, [GRP3 + '.']],
  ['Yellowedge Grouper', [], 'None', null, null, '3 per person per day (grouper aggregate)', 3, 'Open year-round', null, false, [GRP3 + '.']],
  ['Coney', [], 'None', null, null, '3 per person per day (grouper aggregate)', 3, 'Federal waters closed Jan 1 – Apr 30', [['05-01', '12-31']], false, [GRP3 + '.']],
  ['Graysby', [], 'None', null, null, '3 per person per day (grouper aggregate)', 3, 'Federal waters closed Jan 1 – Apr 30', [['05-01', '12-31']], false, [GRP3 + '.']],
  ['Red Hind', ['strawberry grouper'], 'None', null, null, '3 per person per day (grouper aggregate)', 3, 'Federal waters closed Jan 1 – Apr 30', [['05-01', '12-31']], false, [GRP3 + '.']],
  ['Rock Hind', [], 'None', null, null, '3 per person per day (grouper aggregate)', 3, 'Federal waters closed Jan 1 – Apr 30', [['05-01', '12-31']], false, [GRP3 + '.']],
  ['Golden Tilefish', ['tilefish'], 'None', null, null, '1 per person per day, within the 3-grouper aggregate', 1, 'Federal waters closed Mar 21 – Dec 31, 2026', [['01-01', '03-20']], false, [GRP3 + '.']],
  ['Blueline Tilefish', ['gray tilefish'], 'None', null, null, '3 per person per day in state waters (2 in federal waters), within the 3-grouper aggregate', 3, 'Federal waters closed Sep 1, 2026 – Apr 30, 2027', [['05-01', '08-31']], false, [GRP3 + '.']],
  ['Sand Tilefish', [], 'None', null, null, '3 per person per day (grouper aggregate)', 3, 'Open year-round', null, false, [GRP3 + '.']],
  ['Greater Amberjack', ['amberjack', 'aj', 'reef donkey'], '28 inch fork length', 28, 'FL', '1 per person per day', 1, 'Federal waters closed Apr 1 – 30', [['05-01', '03-31']], false, []],
  ['Hogfish', ['hog snapper'], '17 inch fork length', 17, 'FL', '2 per person per day', 2, 'Open year-round', null, false, []],
  ['Wreckfish', [], 'None', null, null, '1 per vessel per day', 1, 'Federal waters open Jul 1 – Aug 31 only', [['07-01', '08-31']], false, []],
  ['Black Sea Bass', ['sea bass', 'blackfish'], '13 inch total length', 13, 'TL', '7 per person per day', 7, 'Open year-round', null, false, []],
  ['Gray Triggerfish', ['triggerfish', 'trigger'], '12 inch fork length', 12, 'FL', '20 aggregate per person per day with other complex species, no more than 10 of any one species', 10, 'Open year-round', null, false, ['Part of the 20-fish "other snapper-grouper species" aggregate.']],
  ['White Grunt', ['grunt'], 'None', null, null, '20 aggregate per person per day with other complex species, no more than 10 of any one species', 10, 'Open year-round', null, false, ['Part of the 20-fish "other snapper-grouper species" aggregate (also scup, margate, sailors choice, lesser amberjack, almaco jack, banded rudderfish).']],
  ['Atlantic Spadefish', ['spadefish', 'spade'], '14 inch total length (state waters)', 14, 'TL', '30 per boat per day (state waters)', 30, 'Open year-round', null, false, []],
  ['Warsaw Grouper', [], 'Possession prohibited', null, null, 'Possession prohibited', 0, 'Possession prohibited', null, true, ['Release without removing from the water.']],
  ['Speckled Hind', ['kitty mitchell'], 'Possession prohibited', null, null, 'Possession prohibited', 0, 'Possession prohibited', null, true, ['Release without removing from the water.']],
  ['Nassau Grouper', [], 'Possession prohibited', null, null, 'Possession prohibited', 0, 'Possession prohibited', null, true, ['If hooked, cut the line and release without removing from the water.']],
  ['Goliath Grouper', ['jewfish'], 'Possession prohibited', null, null, 'Possession prohibited', 0, 'Possession prohibited', null, true, ['If hooked, cut the line and release without removing from the water.']],
];

const raw = JSON.parse(readFileSync('data/sc/raw.json', 'utf8'));
const overlay = JSON.parse(readFileSync('data/sc/overlay.json', 'utf8'));
if (!raw.sources.some((s) => s.id === SRC)) raw.sources.push({ id: SRC, url: 'https://www.eregulations.com/southcarolina/fishing/snapper-grouper-complex-size-catch-limits', title: 'SCDNR snapper grouper complex size & catch limits' });
raw.species = raw.species.filter((s) => s.sourceId !== SRC);
for (const k of Object.keys(overlay)) if (overlay[k].sourceId === SRC) delete overlay[k];
let id = Math.max(...raw.species.map((s) => s.id)) + 1;
for (const [n, aliases, size, min, measure, limit, bag, fedSeason, fedSeasons, fedClosed, notes] of ROWS) {
  const prohibited = bag === 0;
  const season = prohibited ? 'Possession prohibited' : 'Open year-round in state waters';
  const row = { id, n, sci: '', h: 'saltwater', f: '', zone: 'statewide', season, size, limit, quote: `${n} | ${fedSeason} | ${limit} | ${size}`, notes: prohibited ? '' : HEAD, sourceId: SRC };
  raw.species.push(row);
  const sz = min ? [{ min, max: null }] : [];
  const sizeNote = min ? `${min} inch ${measure === 'FL' ? 'fork' : 'total'} length` : (prohibited ? '' : 'No minimum size');
  const zones = prohibited
    ? [{ ...STATE, closed: true, size: [], bag: null, bagNote: 'Possession prohibited', sizeNote: '' }]
    : [
      { ...STATE, size: sz, bag, bagNote: limit, sizeNote },
      { ...FED, seasons: fedSeasons, size: sz, bag: fedClosed ? null : bag, bagNote: fedClosed ? fedSeason : limit, closed: fedClosed, sizeNote },
    ];
  overlay[id] = { name: n, reviewed: REVIEWED, rawHash: rawHash(row), aliases, status: prohibited ? 'closed' : 'open', zones, notes: prohibited ? notes : [...notes, 'State waters (0–3 mi) have no closed season; federal closures from SAFMC apply beyond 3 mi and can change mid-year when catch limits are met — check safmc.net before an offshore trip.'], sourceId: SRC };
  id++;
}
writeFileSync('data/sc/raw.json', JSON.stringify(raw, null, 2) + '\n');
writeFileSync('data/sc/overlay.json', JSON.stringify(overlay, null, 2) + '\n');
console.log(`SC: ${ROWS.length} snapper-grouper rows added; ${raw.species.length} species total`);
