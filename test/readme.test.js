import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAllRegs } from '../src/regs.js';
import { coverageTable, START, END } from '../scripts/readme-coverage.mjs';

const md = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('README has the generated coverage block', () => {
  assert.ok(md.includes(START) && md.includes(END), 'coverage markers missing');
});

test('README coverage table matches the live data (run: npm run readme)', () => {
  const i = md.indexOf(START) + START.length, j = md.indexOf(END);
  assert.equal(md.slice(i, j).trim(), coverageTable().trim(),
    'README.md is stale — regenerate it with `npm run readme` and commit the result');
});

test('README names every state the app serves', () => {
  for (const r of Object.values(buildAllRegs())) assert.ok(md.includes(r.name), `README never mentions ${r.name}`);
});

test('README documents every public API route the server exposes', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const routes = new Set();
  for (const m of server.matchAll(/app\.(get|post|patch|delete)\(\s*(?:\[)?['"`](\/api\/[^'"`?]+)/g)) routes.add(m[2]);
  const undocumented = [...routes].filter((r) => {
    const base = r.replace(/:[^/]+/g, '').replace(/\/+$/, '');   // /api/scans/:id -> /api/scans
    return !md.includes(r) && !md.includes(base);
  });
  assert.deepEqual(undocumented, [], `these routes are missing from the README API section: ${undocumented.join(', ')}`);
});
