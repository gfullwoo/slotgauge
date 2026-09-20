// Fish identification from a photo using Claude vision.
// The model is constrained to the DNREC species list so the answer maps straight
// onto a regulation record. Returns {speciesId, name, confidence, alternates, lengthIn, lengthBasis, notes}.
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

/** Downscale + re-encode as JPEG so we never send a 12MP HEIC to the model. */
export async function normalizeImage(buffer, { max = 1280, thumb = 320 } = {}) {
  const base = sharp(buffer, { failOn: 'none' }).rotate();
  const full = await base.clone().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const small = await base.clone().resize({ width: thumb, height: thumb, fit: 'cover' }).jpeg({ quality: 75 }).toBuffer();
  return { full, thumb: small };
}

export function speciesCatalog(species) {
  // compact one-line-per-species list the model picks from
  return species.map((s) => `${s.id}|${s.name}|${s.habitat}${s.sci ? '|' + s.sci : ''}`).join('\n');
}

const SYSTEM = `You identify fish in photos taken by recreational anglers in Delaware, USA, for a regulations checker.
You must choose from the provided species catalog (id|common name|habitat|scientific name). Consider both saltwater and freshwater entries.
If the fish is not in the catalog, or there is no fish, set speciesId to null and explain in notes.
Estimate total length in inches ONLY if a ruler, measuring board, tape, or other object of known size is clearly visible and the fish lies along it; otherwise lengthIn must be null. Never guess length from the fish alone.
Respond with JSON only, no prose, matching:
{"speciesId": number|null, "name": string, "confidence": 0-1, "alternates": [{"speciesId": number, "name": string, "confidence": 0-1}], "lengthIn": number|null, "lengthBasis": string|null, "notes": string}`;

export function parseModelJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('model returned no JSON');
  const j = JSON.parse(m[0]);
  return {
    speciesId: j.speciesId == null ? null : Number(j.speciesId),
    name: String(j.name || ''),
    confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)),
    alternates: Array.isArray(j.alternates) ? j.alternates.slice(0, 3).map((a) => ({ speciesId: Number(a.speciesId), name: String(a.name || ''), confidence: Math.max(0, Math.min(1, Number(a.confidence) || 0)) })) : [],
    lengthIn: j.lengthIn == null || Number.isNaN(Number(j.lengthIn)) ? null : Math.round(Number(j.lengthIn) * 4) / 4,
    lengthBasis: j.lengthBasis ? String(j.lengthBasis) : null,
    notes: String(j.notes || ''),
  };
}

/**
 * makeIdentifier({species}) -> async (jpegBuffer) => result
 * Injected into the app so tests can swap in a fake.
 */
export function makeIdentifier({ species, client = new Anthropic(), model = MODEL }) {
  const catalog = speciesCatalog(species);
  const byId = new Map(species.map((s) => [s.id, s]));
  return async function identify(jpeg) {
    const msg = await client.messages.create({
      model,
      max_tokens: 600,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
          { type: 'text', text: `Species catalog:\n${catalog}\n\nIdentify the fish. JSON only.` },
        ],
      }],
    });
    const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
    const r = parseModelJson(text);
    // snap names to the catalog so the UI never shows a made-up label
    if (r.speciesId != null && byId.has(r.speciesId)) r.name = byId.get(r.speciesId).name;
    else if (r.speciesId != null) { r.notes = `Model chose unknown id ${r.speciesId}. ${r.notes}`; r.speciesId = null; }
    r.alternates = r.alternates.filter((a) => byId.has(a.speciesId) && a.speciesId !== r.speciesId).map((a) => ({ ...a, name: byId.get(a.speciesId).name }));
    r.model = model;
    return r;
  };
}
