import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { htmlToText, fetchSource, watchAll, renderReport, diffLines, loadSources } from '../src/sources.js';
import { chunk, parseSpeciesJson, assembleRaw, EXTRACT_SYSTEM } from '../src/extract.js';
import { mergeExtracted } from '../src/regs.js';
import { makePages } from '../src/pages.js';

const sources = { states: {
  VA: { name: 'Virginia', slug: 'virginia', agency: 'VMRC', season: 2025, sources: [
    { id: 'va-rules', title: 'VMRC rules', url: 'https://example.test/va', type: 'html', role: 'primary' }] },
  NJ: { name: 'New Jersey', slug: 'new-jersey', agency: 'NJDEP', season: null, sources: [
    { id: 'nj-digest', title: 'NJ digest', url: 'https://example.test/digest-2025.pdf', type: 'pdf', role: 'primary', annual: true, urlPattern: 'https://example.test/digest-{year}.pdf' }] },
} };
const page = (body) => `<html><head><title>x</title><script>junk()</script></head><body><nav>Home Menu</nav><main>${body}</main><footer>© state</footer></body></html>`;
const fakeFetch = (routes) => async (url) => {
  const r = routes[url];
  if (!r) return { ok: false, status: 404, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) };
  return { ok: true, status: 200, headers: new Headers({ 'content-type': r.type || 'text/html' }), arrayBuffer: async () => Buffer.from(r.body) };
};

test('htmlToText drops navigation and scripts, keeps the rules', () => {
  const t = htmlToText(page('<h2>Striped Bass</h2><p>Minimum Size Limit: 28 inches</p>'));
  assert.equal(t, 'Striped Bass\nMinimum Size Limit: 28 inches');
});

test('annual PDF falls back to the registered edition when this year is not published', async () => {
  const src = sources.states.NJ.sources[0];
  const f = fakeFetch({ 'https://example.test/digest-2025.pdf': { body: 'not really a pdf', type: 'application/pdf' } });
  const r = await fetchSource({ ...src, type: 'html' }, { fetchImpl: f, year: 2026 });
  assert.match(r.note, /2026 edition not published yet/);
  assert.equal(r.url, 'https://example.test/digest-2026.pdf');
});

test('watcher: first run records hashes, second run reports changes and annual review due', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sg-'));
  const stateFile = path.join(dir, 'state.json');
  const routes = { 'https://example.test/va': { body: page('<p>Striped Bass Minimum Size Limit: 28 inches Possession Limit: 1 per person</p>') } };
  const state = { sources: {} };
  const s1 = { states: { VA: sources.states.VA } };
  const r1 = await watchAll({ sources: s1, state, fetchImpl: fakeFetch(routes), now: new Date('2026-09-21'), dryRun: true });
  assert.equal(r1.report.changed.length, 0);
  assert.equal(r1.report.checked[0].firstSeen, true);
  assert.deepEqual(r1.report.annualDue.map((a) => a.state), ['VA']); // season 2025 < 2026
  routes['https://example.test/va'] = { body: page('<p>Striped Bass Minimum Size Limit: 28 inches Possession Limit: 2 per person</p>') };
  const r2 = await watchAll({ sources: s1, state: r1.state, fetchImpl: fakeFetch(routes), now: new Date('2026-09-28'), dryRun: true });
  assert.equal(r2.report.changed.length, 1);
  assert.equal(r2.report.changed[0].id, 'va-rules');
  const md = renderReport(r2.report, new Date('2026-09-28'));
  assert.match(md, /Annual review due/); assert.match(md, /Official source text changed/); assert.match(md, /npm run extract -- VA/);
  const d = diffLines('a\nStriped Bass 1 per person\n', 'a\nStriped Bass 2 per person\n');
  assert.deepEqual(d.added, ['Striped Bass 2 per person']);
  rmSync(dir, { recursive: true, force: true });
});

test('watcher: fetch failure is reported, never counted as a change', async () => {
  const r = await watchAll({ sources: { states: { VA: sources.states.VA } }, state: { sources: { 'va-rules': { hash: 'abc' } } }, fetchImpl: fakeFetch({}), now: new Date('2026-09-21'), dryRun: true });
  assert.equal(r.report.failed.length, 1); assert.equal(r.report.changed.length, 0);
  assert.equal(r.state.sources['va-rules'].hash, 'abc');
});

test('extractor: chunking, JSON parsing, assembly into the raw schema', () => {
  const parts = chunk('a\n'.repeat(10) + 'b\n'.repeat(10), 12);
  assert.ok(parts.length > 1 && parts.join('') === 'a\n'.repeat(10) + 'b\n'.repeat(10));
  const rows = parseSpeciesJson('Here you go: {"species":[{"n":"Striped Bass","h":"saltwater","zone":"Coastal","season":"Jan 1–Mar 31, May 16–Dec 31","size":"28 to 31 inches","limit":"1 per person","quote":"Minimum Size Limit: 28 inches"},{"n":"","h":"x"}]}');
  assert.equal(rows.length, 1); assert.equal(rows[0].zone, 'Coastal');
  const raw = assembleRaw({ code: 'VA', name: 'Virginia', season: 2026, sources: sources.states.VA.sources, rows: [...rows, { ...rows[0], limit: '2' }], ask: 'fake' });
  assert.equal(raw.species.length, 1); assert.equal(raw.species[0].limit, '2'); // later chunk wins
  assert.match(EXTRACT_SYSTEM, /never guess/);
});

test('extracted state merges, serves pages and shows printed text until reviewed', () => {
  const raw = { state: 'VA', name: 'Virginia', season: 2026, scraped: '2026-09-21', source: 'https://example.test/va', sources: [{ id: 'va-rules', url: 'https://example.test/va', title: 'VMRC' }],
    species: [
      { id: 1, n: 'Striped Bass', sci: 'Morone saxatilis', h: 'saltwater', f: '', zone: 'Coastal', season: 'January 1 through March 31; May 16 through December 31', size: 'Minimum 28 inches, maximum 31 inches', limit: '1 per person', quote: 'Minimum Size Limit: 28 inches', notes: 'Circle hooks required with bait.', sourceId: 'va-rules' },
      { id: 2, n: 'Striped Bass', sci: '', h: 'saltwater', f: '', zone: 'Chesapeake Bay', season: 'May 16 through June 15; October 4 through December 31', size: '19 to 24 inches', limit: '1 per person', quote: 'Bay: 19-24 inch slot', notes: '', sourceId: 'va-rules' },
      { id: 3, n: 'Cobia', sci: '', h: 'saltwater', f: '', zone: 'statewide', season: 'June 15 through September 15', size: '40 inch minimum', limit: '1 per person', quote: 'Cobia 40 inches', notes: '', sourceId: 'va-rules' },
    ] };
  const regs = mergeExtracted(raw, { 3: { aliases: ['cobia'], status: 'open', reviewed: '2026-09-21', zones: [{ zone: 'state', seasons: [['06-15', '09-15']], size: [{ min: 40, max: null }], bag: 1, bagNote: '', closed: false, sizeNote: '' }], notes: [] } });
  assert.equal(regs.species.length, 2);
  const sb = regs.species.find((s) => s.name === 'Striped Bass');
  assert.equal(sb.zones.length, 2); assert.equal(sb.needsReview, true); assert.equal(sb.zones[0].zone, 'coastal');
  const cobia = regs.species.find((s) => s.name === 'Cobia'); assert.equal(cobia.needsReview, false);
  const pages = makePages(regs);
  assert.equal(pages.state.slug, 'virginia');
  const html = pages.speciesPage('striped-bass', new Date(2026, 8, 21));
  assert.match(html, /Striped Bass regulations in Virginia/);
  assert.match(html, /Not yet converted to a keeper check/);
  assert.match(html, /Minimum 28 inches, maximum 31 inches/); // printed text, not "No size limit"
  assert.match(html, /Chesapeake Bay/); assert.match(html, /as printed/);
  assert.doesNotMatch(html, /fishspecies\.dnrec/); // no Delaware image on a Virginia page
  const cob = pages.speciesPage('cobia', new Date(2026, 6, 1));
  assert.match(cob, /keeper today if it measures at least 40 inches, with a daily limit of 1/);
  assert.match(pages.sitemap(), /slotgauge\.com\/virginia\/cobia\//);
});

test('registry lists only official sources and every state has a primary', () => {
  const reg = loadSources();
  for (const [code, st] of Object.entries(reg.states)) {
    assert.ok(st.sources.some((s) => s.role === 'primary'), `${code} needs a primary source`);
    for (const s of st.sources) assert.ok(/\.gov$|eregulations\.com$|^myfwc\.com$/.test(new URL(s.url).host), `${code} ${s.url} is not an official host`);
  }
});
