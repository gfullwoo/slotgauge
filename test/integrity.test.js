// index.html is one 1,000-line file that every feature hangs off, and a careless whole-file
// overwrite silently deleted ~215 lines of it once: the location override system, the theme picker,
// the moon and catch-log styles, and the script tags for log.js and species.js. Nothing failed —
// the tests passed, the deploy went green, and the features were simply gone in production.
//
// These checks exist so that cannot happen quietly again. They are deliberately crude: they assert
// that each front-end file is actually loaded and that a marker from each feature is still in the
// page. If you remove a feature on purpose, delete its line here in the same commit — that edit is
// the point, it makes the removal a decision someone wrote down rather than an accident.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('every front-end script is actually loaded by index.html', () => {
  const scripts = readdirSync(new URL('../public/', import.meta.url))
    .filter((f) => f.endsWith('.js') && f !== 'sw.js');   // sw.js registers itself
  assert.ok(scripts.length >= 5, `expected the usual front-end files, found ${scripts.join(', ')}`);
  for (const f of scripts) {
    assert.ok(html.includes(`src="/${f}"`), `public/${f} exists but index.html never loads it — the feature is dead in the browser`);
  }
});

test('index.html still contains every feature it is meant to', () => {
  // marker -> what disappears from the app if it goes
  const features = {
    'OVERRIDE_HOURS': 'state override expiry',
    'function readOverride': 'remembering a hand-picked state',
    'function locHelp': 'the "where are you fishing?" help panel',
    'GEO_ERR': 'location failure diagnostics',
    "sessionStorage.getItem('sg.appState')": 'the Android ?state= handoff',
    'function setTheme': 'the theme picker',
    'function setHero': 'the hero banner',
    'function lastGoodHero': 'hero fallback when an image fails',
    'function licenceHtml': 'licence guidance in the state picker',
    'function findSpecies': 'species name matching',
    'function parseLength': 'reading a length out of the text',
    '.tide-badge': 'the tide badge styles',
    '.moon-win': 'the moon and solunar card styles',
    '.ins-bars': 'the Best Windows styles',
    '.log-form': 'the catch log styles',
    "rel='preload'": 'early hero image load',
  };
  const missing = Object.entries(features)
    .filter(([marker]) => !html.includes(marker) && !html.includes(marker.replace(/'/g, '"')))
    .map(([marker, what]) => `${what} (${marker})`);
  assert.deepEqual(missing, [], `index.html lost: ${missing.join('; ')}`);
});

test('index.html has not been truncated', () => {
  // A whole-file overwrite from a stale copy shows up here long before anyone notices a feature.
  const lines = html.split('\n').length;
  assert.ok(lines > 900, `index.html is ${lines} lines — it should be well over 900; something replaced it wholesale`);
});
