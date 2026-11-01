// Merge a state audit (data/<st>/audit/additions.json) into that state's raw.json + overlay.json.
//
//   node scripts/merge-audit.mjs            # all states that have an audit
//   node scripts/merge-audit.mjs SC NJ      # named states only
//
// Additions become new raw rows + reviewed overlay entries (every value carried a verbatim quote and
// source URL from the auditor). Corrections are NOT applied automatically: they record a disagreement
// between our data and the official page — sometimes between two official pages — so each one is written
// to data/<st>/audit/corrections-pending.json and flags the affected species for review, which makes the
// checker answer "check the rule" instead of a confident verdict until a human resolves it.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const rawHash = (d) => createHash('sha1').update(`${d.season}|${d.size}|${d.limit}`).digest('hex').slice(0, 12);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const write = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n');

const ALL = ['de', 'nj', 'md', 'va', 'nc', 'sc', 'ga', 'fl', 'ny', 'ct'];
const states = (process.argv.slice(2).length ? process.argv.slice(2) : ALL).map((s) => s.toLowerCase())
  .filter((st) => existsSync(`data/${st}/audit/additions.json`));

const registryFile = 'data/sources.json';
const registry = JSON.parse(readFileSync(registryFile, 'utf8'));
const reg = Object.values(registry).find((v) => v && typeof v === 'object' && !Array.isArray(v));
const totals = { added: 0, skipped: 0, flagged: 0, sources: 0 };

for (const st of states) {
  const ST = st.toUpperCase();
  const rawFile = `data/${st}/raw.json`, ovFile = `data/${st}/overlay.json`;
  const raw = JSON.parse(readFileSync(rawFile, 'utf8'));
  const overlay = JSON.parse(readFileSync(ovFile, 'utf8'));
  const audit = JSON.parse(readFileSync(`data/${st}/audit/additions.json`, 'utf8'));
  const reviewed = audit.auditedOn || new Date().toISOString().slice(0, 10);

  // 1. sources: into raw.json (for per-row attribution) and the official registry (for the watcher)
  raw.sources = raw.sources || [];
  for (const s of audit.sources || []) {
    if (!raw.sources.some((x) => x.id === s.id)) { raw.sources.push({ id: s.id, url: s.url, title: s.title }); totals.sources++; }
    const rs = reg[ST].sources;
    if (!rs.some((x) => x.id === s.id || x.url === s.url)) rs.push({ id: s.id, title: s.title, url: s.url, type: s.type || 'html', role: s.role || 'primary' });
  }

  // 2. additions: new raw rows + reviewed overlay entries, skipping names we already carry
  const have = new Map(raw.species.map((r) => [norm(r.n), r.id]));
  let id = Math.max(0, ...raw.species.map((r) => r.id)) + 1;
  const added = [], skipped = [];
  for (const sp of audit.species || []) {
    if (have.has(norm(sp.name))) { skipped.push(sp.name); continue; }
    const row = {
      id, n: sp.name, sci: '', h: sp.habitat || 'saltwater', f: sp.family || '',
      zone: (sp.zones?.[0]?.label) || 'statewide',
      season: sp.season || '', size: sp.size || 'None', limit: sp.limit || '',
      quote: sp.quote || '', notes: sp.notes || '', sourceId: sp.sourceId,
    };
    raw.species.push(row);
    const prohibited = sp.zones?.length ? sp.zones.every((z) => z.closed) : false;
    overlay[String(id)] = {
      name: sp.name, reviewed, rawHash: rawHash(row), aliases: sp.aliases || [],
      status: prohibited ? 'closed' : 'open',
      zones: (sp.zones || []).map((z) => ({ zone: z.zone, label: z.label, seasons: z.seasons ?? null, size: z.size || [], bag: z.bag ?? null, bagNote: z.bagNote || '', closed: !!z.closed, sizeNote: z.sizeNote || '' })),
      notes: sp.userNotes || [],
      sourceId: sp.sourceId, sourceUrl: sp.sourceUrl, auditQuote: sp.quote || '',
    };
    have.set(norm(sp.name), id);
    added.push(sp.name); id++;
  }

  // 3. corrections: flag the species so the app stops asserting a verdict, and park the detail for review
  const pending = [], unmatched = [];
  for (const c of audit.corrections || []) {
    const hit = raw.species.find((r) => norm(r.n) === norm(c.existingName));
    if (!hit) { unmatched.push(c.existingName); pending.push({ ...c, status: 'unmatched' }); continue; }
    const ov = (overlay[String(hit.id)] ||= { name: hit.n, reviewed: null, aliases: [], status: 'open', zones: [], notes: [] });
    (ov.review ||= []).push({ field: c.field, current: c.current, shouldBe: c.shouldBe, quote: c.quote, sourceUrl: c.sourceUrl, found: reviewed });
    pending.push({ ...c, id: hit.id, status: 'pending' });
  }
  const flagged = new Set(pending.filter((p) => p.status === 'pending').map((p) => p.id)).size;

  write(rawFile, raw); write(ovFile, overlay);
  write(`data/${st}/audit/corrections-pending.json`, { state: ST, auditedOn: reviewed, pending });
  totals.added += added.length; totals.skipped += skipped.length; totals.flagged += flagged;
  console.log(`${ST}: +${added.length} species (${raw.species.length} rows total), ${skipped.length} already present, ${flagged} flagged for review${unmatched.length ? `, ${unmatched.length} corrections matched no row` : ''}`);
  if (added.length) console.log(`   added: ${added.join(', ')}`);
  if (unmatched.length) console.log(`   unmatched corrections: ${unmatched.join(', ')}`);
}

write(registryFile, registry);
console.log(`\nTotal: +${totals.added} species, ${totals.sources} new sources, ${totals.flagged} species flagged for review, ${totals.skipped} skipped as already present`);
