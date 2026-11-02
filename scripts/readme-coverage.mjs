// Regenerates the coverage table in README.md from the live data, so the numbers in the README can
// never drift from what the app actually serves.
//
//   node scripts/readme-coverage.mjs           # rewrite README.md in place
//   node scripts/readme-coverage.mjs --check   # exit 1 if it is stale (used by the test suite)
import { readFileSync, writeFileSync } from 'node:fs';
import { buildAllRegs } from '../src/regs.js';
import { loadSources } from '../src/sources.js';

export const START = '<!-- coverage:start -->';
export const END = '<!-- coverage:end -->';

export function coverageTable() {
  const all = buildAllRegs();
  const reg = loadSources().states;
  const rows = Object.entries(all).map(([code, r]) => {
    const audited = reg[code]?.audited;
    return { code, name: r.name, species: r.species.length, review: r.species.filter((s) => s.needsReview).length, season: r.season, sources: reg[code]?.sources.length || 0, audited };
  });
  const total = rows.reduce((a, b) => a + b.species, 0);
  const review = rows.reduce((a, b) => a + b.review, 0);
  const head = '| State | Species | Official sources | Season | Full audit | Flagged for review |\n|---|--:|--:|--:|---|--:|';
  const body = rows.map((r) => `| ${r.name} | ${r.species} | ${r.sources} | ${r.season} | ${r.audited ? r.audited : '—'} | ${r.review || '—'} |`).join('\n');
  const foot = `| **Total** | **${total}** | | | | **${review}** |`;
  return [
    `${rows.length} states, ${total} species.`,
    '',
    head, body, foot,
    '',
    `A species is *flagged for review* when an audit found our rule disagreeing with the official page, or two`,
    `official pages disagreeing with each other. A flagged species never gets a confident verdict: the checker`,
    `says "check the rule" and links the source. States without a full audit date have not yet been read`,
    `page-by-page against their official regulations, so they may still be missing species.`,
  ].join('\n');
}

const file = new URL('../README.md', import.meta.url);
const md = readFileSync(file, 'utf8');
const i = md.indexOf(START), j = md.indexOf(END);
if (i < 0 || j < 0) { console.error(`README.md is missing the ${START} / ${END} markers`); process.exit(2); }
const next = `${md.slice(0, i + START.length)}\n${coverageTable()}\n${md.slice(j)}`;
if (process.argv.includes('--check')) {
  if (next !== md) { console.error('README.md coverage table is stale — run: npm run readme'); process.exit(1); }
  console.log('README.md coverage table is current');
} else if (next !== md) { writeFileSync(file, next); console.log('README.md coverage table updated'); }
else console.log('README.md coverage table already current');
