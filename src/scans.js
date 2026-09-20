// User scan storage: photos in Cloud Storage, records in Firestore.
// Both are behind small interfaces so the app can run with in-memory fakes in tests.
import { randomUUID } from 'node:crypto';

export function makeCloudStore({ firestore, bucket, signedUrlTtlMs = 60 * 60 * 1000 }) {
  const col = (uid) => firestore.collection('users').doc(uid).collection('scans');
  async function url(path) {
    const [u] = await bucket.file(path).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + signedUrlTtlMs });
    return u;
  }
  return {
    async putImages(uid, id, { full, thumb }) {
      const base = `users/${uid}/${id}`;
      await Promise.all([
        bucket.file(`${base}/full.jpg`).save(full, { contentType: 'image/jpeg', resumable: false }),
        bucket.file(`${base}/thumb.jpg`).save(thumb, { contentType: 'image/jpeg', resumable: false }),
      ]);
      return { fullPath: `${base}/full.jpg`, thumbPath: `${base}/thumb.jpg` };
    },
    async create(uid, rec) { await col(uid).doc(rec.id).set(rec); return rec; },
    async get(uid, id) { const d = await col(uid).doc(id).get(); return d.exists ? d.data() : null; },
    async update(uid, id, patch) { await col(uid).doc(id).set(patch, { merge: true }); return this.get(uid, id); },
    async remove(uid, id) {
      const rec = await this.get(uid, id);
      if (!rec) return false;
      await Promise.allSettled([bucket.file(rec.fullPath).delete(), bucket.file(rec.thumbPath).delete()]);
      await col(uid).doc(id).delete();
      return true;
    },
    async list(uid) {
      const snap = await col(uid).orderBy('createdAt', 'desc').limit(500).get();
      return snap.docs.map((d) => d.data());
    },
    async withUrls(recs) {
      return Promise.all(recs.map(async (r) => ({ ...r, fullUrl: await url(r.fullPath), thumbUrl: await url(r.thumbPath) })));
    },
  };
}

/** In-memory store with the same shape (tests, local dev without GCP). */
export function makeMemoryStore() {
  const recs = new Map();
  const blobs = new Map();
  const key = (uid, id) => `${uid}/${id}`;
  return {
    blobs,
    async putImages(uid, id, { full, thumb }) {
      blobs.set(`users/${uid}/${id}/full.jpg`, full); blobs.set(`users/${uid}/${id}/thumb.jpg`, thumb);
      return { fullPath: `users/${uid}/${id}/full.jpg`, thumbPath: `users/${uid}/${id}/thumb.jpg` };
    },
    async create(uid, rec) { recs.set(key(uid, rec.id), rec); return rec; },
    async get(uid, id) { return recs.get(key(uid, id)) || null; },
    async update(uid, id, patch) { const r = recs.get(key(uid, id)); if (!r) return null; Object.assign(r, patch); return r; },
    async remove(uid, id) { const r = recs.get(key(uid, id)); if (!r) return false; recs.delete(key(uid, id)); blobs.delete(r.fullPath); blobs.delete(r.thumbPath); return true; },
    async list(uid) { return [...recs.values()].filter((r) => r.uid === uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    async withUrls(list) { return list.map((r) => ({ ...r, fullUrl: `/dev-blob/${r.fullPath}`, thumbUrl: `/dev-blob/${r.thumbPath}` })); },
  };
}

export function newScanRecord({ uid, ident, source }) {
  return {
    id: randomUUID(),
    uid,
    createdAt: new Date().toISOString(),
    source: source === 'camera' ? 'camera' : 'upload',
    speciesId: ident.speciesId,
    speciesName: ident.name || null,
    confidence: ident.confidence,
    alternates: ident.alternates,
    lengthIn: ident.lengthIn,
    lengthBasis: ident.lengthBasis,
    notes: ident.notes,
    model: ident.model || null,
    verdict: null,        // filled in by the client after evaluation: keep|release|closed|check|kill
    verdictText: null,
    userCorrected: false,
  };
}

/** Group a flat list for the gallery: [{speciesId, speciesName, count, scans:[...]}] sorted by count desc. */
export function groupBySpecies(scans) {
  const groups = new Map();
  for (const s of scans) {
    const k = s.speciesId ?? 'unknown';
    if (!groups.has(k)) groups.set(k, { speciesId: s.speciesId ?? null, speciesName: s.speciesName || 'Unidentified', count: 0, latest: s.createdAt, scans: [] });
    const g = groups.get(k); g.count++; g.scans.push(s); if (s.createdAt > g.latest) g.latest = s.createdAt;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));
}
