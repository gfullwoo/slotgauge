// AI-assisted extraction of a state's regulations from official source text into the
// common raw schema used by src/regs.js ({id,h,n,f,sci,season,size,limit} + zone/quote fields).
// The model is only allowed to quote the source; every row carries the sentence it came from so a
// human can verify it (every extracted species is needsReview until an overlay entry exists).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './regs.js';

export const EXTRACT_SYSTEM = `You convert official U.S. state recreational fishing regulations into JSON for a keep-or-release checker. Accuracy matters more than completeness: never guess. Use ONLY the supplied source text.

Output JSON only, of this shape:
{"species":[{"n":"Common name as printed","sci":"scientific name or empty","h":"saltwater|freshwater|shellfish","f":"family or group heading if the source has one, else empty",
  "zone":"zone label exactly as the source scopes the rule (e.g. Atlantic, Chesapeake Bay, Coastal, statewide)",
  "season":"season text as printed (or 'Open Year-Round' if the source says no closed season)",
  "size":"size limit text as printed (or 'No size limit')",
  "limit":"daily/possession limit text as printed (or 'No limit')",
  "quote":"the exact source sentence(s) or table row these three fields came from",
  "notes":"gear, closure, permit or special-area rules for this species, as printed, else empty"}]}

Rules:
- One entry per species per zone when the source gives different rules for different zones (e.g. Maryland Atlantic vs Chesapeake). Repeat the species with a different zone.
- Keep numbers, units and dates exactly as printed. Do not convert or round. Do not merge species.
- If a species appears only in a list with no rule, omit it.
- Do not include license, gear-only, or commercial rules as species entries.`;

/** Text-only model call. Provider: Vertex Gemini when GEMINI_ENABLED=1 (Cloud Run / gcloud ADC), else Anthropic. */
export function textBackend({ fetchImpl = fetch } = {}) {
  const gemini = process.env.GEMINI_ENABLED === '1' || process.env.EXTRACT_PROVIDER === 'gemini';
  if (gemini) {
    const project = process.env.GOOGLE_CLOUD_PROJECT || 'slotgauge';
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
    return async (system, text) => {
      const { GoogleAuth } = await import('google-auth-library');
      const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
      const { token } = await client.getAccessToken();
      const r = await fetchImpl(`https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { temperature: 0, maxOutputTokens: 65536, responseMimeType: 'application/json' } }),
      });
      if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = await r.json();
      return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    };
  }
  return async (system, text) => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic();
    const msg = await client.messages.create({ model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-5', max_tokens: 32000, system, messages: [{ role: 'user', content: text }] });
    return msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
  };
}

/** Split long source text into chunks the model can hold, on paragraph boundaries. */
export function chunk(text, max = 60000) {
  const out = []; let cur = '';
  const lines = text.split('\n'); if (lines.at(-1) === '') lines.pop();
  for (const para of lines) {
    if (cur.length + para.length + 1 > max && cur) { out.push(cur); cur = ''; }
    cur += para + '\n';
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export function parseSpeciesJson(text) {
  const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in model reply');
  const j = JSON.parse(m[0]);
  return (Array.isArray(j.species) ? j.species : []).filter((s) => s && s.n).map((s) => ({
    n: String(s.n).trim(), sci: String(s.sci || '').trim(), h: ['saltwater', 'freshwater', 'shellfish'].includes(s.h) ? s.h : 'saltwater', f: String(s.f || '').trim(),
    zone: String(s.zone || 'statewide').trim(), season: String(s.season || '').trim(), size: String(s.size || '').trim(), limit: String(s.limit || '').trim(),
    quote: String(s.quote || '').trim(), notes: String(s.notes || '').trim(),
  }));
}

/** Merge chunk results: same species+zone from a later chunk replaces an earlier one; assign stable ids by name+zone order. */
export function assembleRaw({ code, name, season, sources, rows, ask, extracted = new Date().toISOString().slice(0, 10) }) {
  const seen = new Map();
  for (const r of rows) seen.set(`${r.n.toLowerCase()}|${r.zone.toLowerCase()}`, r);
  const list = [...seen.values()].sort((a, b) => a.n.localeCompare(b.n) || a.zone.localeCompare(b.zone));
  return {
    state: code, name, season, scraped: extracted, extractor: `ai:${ask}`,
    source: sources[0]?.url || '', sources: sources.map((s) => ({ id: s.id, url: s.url, title: s.title })),
    species: list.map((r, i) => ({ id: i + 1, ...r })),
  };
}

/**
 * extractState(code) — reads data/source-text/<id>.txt for the state's primary sources (fetched by the
 * watcher) and writes data/<code-lower>/raw.json. Returns the dataset.
 */
export async function extractState(code, { sources, backend = textBackend(), log = console.log } = {}) {
  const st = sources.states[code]; if (!st) throw new Error(`unknown state ${code}`);
  if (st.extractor !== 'ai') throw new Error(`${code} uses the ${st.extractor} extractor; run that instead`);
  const primaries = st.sources.filter((s) => s.role === 'primary');
  const rows = [];
  for (const src of primaries) {
    const file = path.join(DATA_DIR, 'source-text', `${src.id}.txt`);
    if (!existsSync(file)) { log(`${src.id}: no cached text; run npm run watch-sources first`); continue; }
    const text = readFileSync(file, 'utf8');
    const parts = chunk(text);
    log(`${src.id}: ${text.length} chars in ${parts.length} chunk(s)`);
    for (const [i, part] of parts.entries()) {
      const reply = await backend(EXTRACT_SYSTEM, `State: ${st.name}. Source: ${src.title} (${src.url})${src.zone ? `. All rules in this source apply to zone "${src.zone}" unless the text says otherwise.` : ''}\nPart ${i + 1} of ${parts.length}.\n\n${part}`);
      const got = parseSpeciesJson(reply).map((r) => ({ ...r, zone: src.zone && r.zone === 'statewide' ? src.zone : r.zone, sourceId: src.id }));
      log(`  chunk ${i + 1}: ${got.length} rows`);
      rows.push(...got);
    }
  }
  const season = st.season || new Date().getFullYear();
  const data = assembleRaw({ code, name: st.name, season, sources: primaries, rows, ask: process.env.GEMINI_ENABLED === '1' ? 'gemini' : 'claude' });
  const dir = path.join(DATA_DIR, code.toLowerCase());
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'raw.json'), JSON.stringify(data, null, 1) + '\n');
  log(`wrote ${path.relative(process.cwd(), path.join(dir, 'raw.json'))}: ${data.species.length} species/zone rows (all needsReview until overlay.json entries exist)`);
  return data;
}
