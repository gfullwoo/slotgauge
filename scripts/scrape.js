// Re-scrape DNREC into data/dnrec_raw.json. Run by the nightly workflow (and by hand).
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { scrapeAll } from '../src/scraper.js';
import { DATA_DIR, rawHash } from '../src/regs.js';

const file = path.join(DATA_DIR, 'dnrec_raw.json');
const before = JSON.parse(readFileSync(file, 'utf8'));
const after = await scrapeAll({ log: console.log });

const prev = new Map(before.species.map((s) => [s.id, s]));
const changed = after.species.filter((s) => !prev.has(s.id) || rawHash(prev.get(s.id)) !== rawHash(s));
const removed = before.species.filter((s) => !after.species.some((t) => t.id === s.id));

if (!changed.length && !removed.length) {
  console.log('No regulation text changes.');
  process.exit(0);
}
// keep the original scrape date unless something changed
writeFileSync(file, JSON.stringify(after, null, 0) + '\n');
const lines = [
  ...changed.map((s) => `- ${s.n} (${s.h} #${s.id}): ${prev.has(s.id) ? 'text changed' : 'new species'}`),
  ...removed.map((s) => `- ${s.n} (${s.h} #${s.id}): removed from DNREC site`),
];
writeFileSync(path.join(DATA_DIR, 'CHANGES.md'), `## DNREC changes detected ${after.scraped}\n\n${lines.join('\n')}\n`);
console.log(lines.join('\n'));
