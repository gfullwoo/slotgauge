// Official-source watcher. Fetches every URL in data/sources.json, reduces it to plain text,
// hashes it, and reports what changed since the last run (data/source-state.json).
// Also flags states whose captured season is behind the calendar ("annual review due").
// Runs in GitHub Actions weekly; safe to run by hand: `npm run watch-sources`.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { DATA_DIR } from './regs.js';

export const SOURCES_FILE = path.join(DATA_DIR, 'sources.json');
export const STATE_FILE = path.join(DATA_DIR, 'source-state.json');
const UA = 'SlotGauge regulation watcher (+https://slotgauge.com; greg.fullwood@gmail.com)';

export const loadSources = () => JSON.parse(readFileSync(SOURCES_FILE, 'utf8'));
export const loadState = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { sources: {} });
export const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Strip nav/boilerplate and collapse whitespace so cosmetic site changes don't trigger alerts. */
export function htmlToText(html) {
  // keep block boundaries as newlines so rows/paragraphs stay separate lines (diffs are line-based)
  const $ = cheerio.load(String(html).replace(/<\/(p|div|h[1-6]|li|tr|section|article|table|ul|ol|dt|dd|blockquote|pre)>|<br\s*\/?>/gi, '$&\n').replace(/<\/t[dh]>/gi, '$& '));
  $('script,style,noscript,nav,header,footer,iframe,svg,form,[role="navigation"],[aria-hidden="true"],.cookie,.cookies,#cookie-banner').remove();
  const root = $('main').length ? $('main') : $('article').length ? $('article') : $('body');
  return normalize(root.text());
}
export async function pdfToText(buf) {
  const { PDFParse } = await import('pdf-parse');
  const p = new PDFParse({ data: buf });
  try { const r = await p.getText(); return normalize(r.text.replace(/-- \d+ of \d+ --/g, '')); } finally { await p.destroy(); }
}
export const normalize = (t) => t.replace(/\r/g, '').replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

/** Fetch one source → { text, hash, status, bytes }. Never throws; errors are reported as status. */
export async function fetchSource(src, { fetchImpl = fetch, year = new Date().getFullYear() } = {}) {
  const url = src.urlPattern && src.annual ? src.urlPattern.replace('{year}', String(year)) : src.url;
  try {
    const r = await fetchImpl(url, { headers: { 'user-agent': UA, accept: src.type === 'pdf' ? 'application/pdf' : 'text/html' }, redirect: 'follow' });
    if (!r.ok) {
      // Annual PDFs: this year's edition may not exist yet — fall back to the registered URL and say so.
      if (src.urlPattern && url !== src.url) { const alt = await fetchSource({ ...src, urlPattern: undefined }, { fetchImpl, year }); return { ...alt, url, note: `${year} edition not published yet (HTTP ${r.status}); watching ${src.url}` }; }
      return { url, status: r.status, text: '', hash: null, bytes: 0 };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || '';
    const text = src.type === 'pdf' || /pdf/.test(ct) ? await pdfToText(buf) : htmlToText(buf.toString('utf8'));
    return { url, status: r.status, text, hash: sha(text), bytes: buf.length };
  } catch (e) {
    return { url, status: 0, text: '', hash: null, bytes: 0, error: e.message };
  }
}

/** Line-level diff summary (added / removed lines), capped for issue bodies. */
export function diffLines(before, after, cap = 40) {
  const a = new Set(before.split('\n')), b = new Set(after.split('\n'));
  const added = [...b].filter((l) => !a.has(l) && l.length > 3), removed = [...a].filter((l) => !b.has(l) && l.length > 3);
  return { added: added.slice(0, cap), removed: removed.slice(0, cap), addedCount: added.length, removedCount: removed.length };
}

/**
 * Run the watcher. Returns { report, state } and (unless dryRun) writes source-state.json and
 * data/source-changes.md when something needs a human.
 */
export async function watchAll({ sources = loadSources(), state = loadState(), fetchImpl = fetch, now = new Date(), dryRun = false, log = () => {} } = {}) {
  const year = now.getFullYear();
  const report = { checked: [], changed: [], failed: [], annualDue: [] };
  const textDir = path.join(DATA_DIR, 'source-text');
  for (const [code, st] of Object.entries(sources.states)) {
    if (st.season != null && st.season < year) report.annualDue.push({ state: code, name: st.name, season: st.season, year });
    for (const src of st.sources) {
      const prev = state.sources[src.id] || {};
      const cur = await fetchSource(src, { fetchImpl, year });
      log(`${code} ${src.id}: HTTP ${cur.status} ${cur.bytes}b ${cur.hash || ''}${cur.note ? ' – ' + cur.note : ''}`);
      const entry = { state: code, id: src.id, title: src.title, url: cur.url, status: cur.status, hash: cur.hash, bytes: cur.bytes, checked: now.toISOString().slice(0, 10), changed: prev.changed || null, note: cur.note };
      if (!cur.hash) { report.failed.push({ ...entry, error: cur.error }); state.sources[src.id] = { ...prev, ...entry, hash: prev.hash, changed: prev.changed }; continue; }
      const prevText = existsSync(path.join(textDir, `${src.id}.txt`)) ? readFileSync(path.join(textDir, `${src.id}.txt`), 'utf8') : '';
      if (prev.hash && prev.hash !== cur.hash) {
        entry.changed = entry.checked;
        report.changed.push({ ...entry, diff: diffLines(prevText, cur.text), previousHash: prev.hash });
      } else if (!prev.hash) entry.firstSeen = true;
      report.checked.push(entry);
      state.sources[src.id] = entry;
      if (!dryRun) { const { mkdirSync } = await import('node:fs'); mkdirSync(textDir, { recursive: true }); writeFileSync(path.join(textDir, `${src.id}.txt`), cur.text + '\n'); }
    }
  }
  state.lastRun = now.toISOString();
  if (!dryRun) writeFileSync(STATE_FILE, JSON.stringify(state, null, 1) + '\n');
  const md = renderReport(report, now);
  if (!dryRun && md) writeFileSync(path.join(DATA_DIR, 'source-changes.md'), md);
  return { report, state, markdown: md };
}

/** Markdown for the GitHub issue; null when nothing needs attention. */
export function renderReport(report, now = new Date()) {
  if (!report.changed.length && !report.failed.length && !report.annualDue.length) return null;
  const out = [`## Regulation source check — ${now.toISOString().slice(0, 10)}`, ''];
  if (report.annualDue.length) {
    out.push('### Annual review due', '', ...report.annualDue.map((a) => `- **${a.name}**: site data is for the ${a.season} season but it is now ${a.year}. Re-run \`npm run extract -- ${a.state}\` against the ${a.year} source, review, and bump \`season\` in data/sources.json.`), '');
  }
  if (report.changed.length) {
    out.push('### Official source text changed', '');
    for (const c of report.changed) {
      out.push(`#### ${c.state} · ${c.title}`, `${c.url}`, '', `${c.diff.removedCount} lines removed, ${c.diff.addedCount} lines added.`, '');
      if (c.diff.removed.length) out.push('<details><summary>Removed</summary>', '', '```', ...c.diff.removed, '```', '</details>', '');
      if (c.diff.added.length) out.push('<details><summary>Added</summary>', '', '```', ...c.diff.added, '```', '</details>', '');
      out.push(`Next: re-extract with \`npm run extract -- ${c.state}\`, review the diff of data/${c.state.toLowerCase()}/raw.json, update the overlay, merge.`, '');
    }
  }
  if (report.failed.length) out.push('### Could not fetch', '', ...report.failed.map((f) => `- ${f.state} · ${f.title} — HTTP ${f.status}${f.error ? ' ' + f.error : ''} (${f.url})`), '');
  return out.join('\n');
}
