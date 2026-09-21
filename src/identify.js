// Fish identification from a photo using Claude vision.
// Pass 1: rank the top candidates from the DNREC catalog with visible-feature reasoning.
// Pass 2 (when not confident): head-to-head comparison of the top candidates using look-alike notes.
// Returns {speciesId, name, confidence, alternates:[{speciesId,name,confidence,why}], lengthIn, lengthBasis, notes, model, verified}.
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { lookalikeText, notesFor } from './lookalikes.js';

// Preferred model first; the rest are fallbacks used only if the API says a name is unknown.
export const MODEL_CHAIN = [process.env.ANTHROPIC_MODEL, 'claude-opus-4-5', 'claude-opus-4-1', 'claude-sonnet-4-5'].filter(Boolean).filter((m, i, a) => a.indexOf(m) === i);
export const MODEL = MODEL_CHAIN[0];
const VERIFY_BELOW = Number(process.env.IDENTIFY_VERIFY_BELOW || 0.9);

/** Downscale + re-encode as JPEG so we never send a 12MP HEIC to the model. */
export async function normalizeImage(buffer, { max = 1280, thumb = 320 } = {}) {
  const base = sharp(buffer, { failOn: 'none' }).rotate();
  const full = await base.clone().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const small = await base.clone().resize({ width: thumb, height: thumb, fit: 'cover' }).jpeg({ quality: 75 }).toBuffer();
  return { full, thumb: small };
}

export function speciesCatalog(species) {
  return species.map((s) => `${s.id}|${s.name}|${s.habitat}${s.sci ? '|' + s.sci : ''}`).join('\n');
}

const RANK_SYSTEM = `You are an expert ichthyologist identifying fish in anglers' photos from Delaware, USA, for a fishing-regulations checker. A wrong species means a wrong legal verdict, so be rigorous and honest about uncertainty.

Method:
1. Describe to yourself the diagnostic features actually visible: head/mouth shape and size, lip thickness, jaw length relative to the eye, dorsal fin shape and any filaments, tail shape and filaments, spots/stripes/bars and where they are (body only vs also on fins), body depth, color, barbels, eye side (flatfish).
2. Compare against the catalog AND the look-alike notes. Look-alikes are the main source of error; treat color alone as weak evidence (dead or stressed fish change color).
3. Rank the 3 most likely catalog species. Confidence values must be calibrated and sum to at most 1.0. If two species are plausible, say so with split confidence rather than inventing certainty.

Rules:
- Choose only from the catalog (id|common name|habitat|scientific). If no catalog species fits or there is no fish, return an empty candidates list and explain in notes.
- Estimate total length in inches ONLY if a ruler, measuring board, tape, or object of known size is clearly visible along the fish; otherwise lengthIn is null.
- Output JSON only:
{"candidates":[{"speciesId":number,"name":string,"confidence":0-1,"why":string}], "lengthIn":number|null, "lengthBasis":string|null, "notes":string}
"why" is one sentence naming the visible features that support (or undercut) that candidate.`;

const VERIFY_SYSTEM = `You are an expert ichthyologist doing a head-to-head comparison between a few candidate species for the fish in this photo. Use ONLY the diagnostic features listed and what is actually visible. Re-rank the candidates and give calibrated confidences (sum at most 1.0). Output JSON only:
{"candidates":[{"speciesId":number,"confidence":0-1,"why":string}], "notes":string}`;

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('model returned no JSON');
  return JSON.parse(m[0]);
}
const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));

/** Normalise a model reply into the record shape. Exported for tests. */
export function parseModelJson(text) {
  const j = extractJson(text);
  let cands = Array.isArray(j.candidates) ? j.candidates : [];
  if (!cands.length && j.speciesId != null) cands = [{ speciesId: j.speciesId, name: j.name, confidence: j.confidence, why: '' }, ...(j.alternates || [])];
  cands = cands.map((c) => ({ speciesId: c.speciesId == null ? null : Number(c.speciesId), name: String(c.name || ''), confidence: clamp01(c.confidence), why: String(c.why || '') }))
    .filter((c) => c.speciesId != null && !Number.isNaN(c.speciesId)).sort((a, b) => b.confidence - a.confidence).slice(0, 4);
  const top = cands[0];
  return {
    speciesId: top ? top.speciesId : null,
    name: top ? top.name : '',
    confidence: top ? top.confidence : 0,
    why: top ? top.why : '',
    alternates: cands.slice(1),
    lengthIn: j.lengthIn == null || Number.isNaN(Number(j.lengthIn)) ? null : Math.round(Number(j.lengthIn) * 4) / 4,
    lengthBasis: j.lengthBasis ? String(j.lengthBasis) : null,
    notes: String(j.notes || ''),
  };
}

/**
 * makeIdentifier({species}) -> async (jpegBuffer) => result
 * Injected into the app so tests can swap in a fake.
 */
export function makeIdentifier({ species, client = new Anthropic(), model = MODEL, models = MODEL_CHAIN, verifyBelow = VERIFY_BELOW }) {
  let active = model;
  const catalog = speciesCatalog(species);
  const lookalikes = lookalikeText(species);
  const byId = new Map(species.map((s) => [s.id, s]));

  async function ask(system, text, jpeg, maxTokens) {
    const order = [active, ...models.filter((m) => m !== active)];
    let lastErr;
    for (const m of order) {
      try {
        const msg = await client.messages.create({
          model: m, max_tokens: maxTokens, system,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
            { type: 'text', text },
          ] }],
        });
        if (m !== active) { console.warn(`identify: model ${active} unavailable, using ${m}`); active = m; }
        return msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
      } catch (e) {
        lastErr = e;
        const notFound = e?.status === 404 || /not_found|model.*not (found|exist)/i.test(e?.message || '');
        if (!notFound) throw e;
      }
    }
    throw lastErr;
  }

  return async function identify(jpeg) {
    const r = parseModelJson(await ask(RANK_SYSTEM, `Species catalog:\n${catalog}\n\nLook-alike notes:\n${lookalikes}\n\nIdentify the fish. JSON only.`, jpeg, 900));
    // snap to catalog; drop ids the model invented
    const snap = (c) => (byId.has(c.speciesId) ? { ...c, name: byId.get(c.speciesId).name } : null);
    let ranked = [snap({ speciesId: r.speciesId, name: r.name, confidence: r.confidence, why: r.why }), ...r.alternates.map(snap)].filter(Boolean);
    let verified = false;

    if (ranked.length >= 2 && ranked[0].confidence < verifyBelow) {
      const ids = ranked.slice(0, 3).map((c) => c.speciesId);
      const list = ranked.slice(0, 3).map((c) => `${c.speciesId}|${c.name}: ${c.why}`).join('\n');
      try {
        const v = extractJson(await ask(VERIFY_SYSTEM, `Candidates from a first look:\n${list}\n\nDiagnostic features:\n${notesFor(ids) || '(none on file; use standard field marks)'}\n\nWhich is it? JSON only.`, jpeg, 500));
        const re = (Array.isArray(v.candidates) ? v.candidates : []).map((c) => ({ speciesId: Number(c.speciesId), confidence: clamp01(c.confidence), why: String(c.why || '') })).filter((c) => byId.has(c.speciesId));
        if (re.length) {
          ranked = re.sort((a, b) => b.confidence - a.confidence).map((c) => ({ ...c, name: byId.get(c.speciesId).name }));
          if (v.notes) r.notes = String(v.notes);
          verified = true;
        }
      } catch (e) { /* keep first-pass ranking */ }
    }

    const top = ranked[0];
    return {
      speciesId: top ? top.speciesId : null,
      name: top ? top.name : '',
      confidence: top ? top.confidence : 0,
      why: top ? top.why : '',
      alternates: ranked.slice(1, 4),
      lengthIn: r.lengthIn, lengthBasis: r.lengthBasis,
      notes: r.notes, model: active, verified,
    };
  };
}
