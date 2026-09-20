import express from 'express';
import compression from 'compression';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegs, rawHash } from './src/regs.js';
import { normalizeImage } from './src/identify.js';
import { newScanRecord, groupBySpecies, makeMemoryStore } from './src/scans.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

/**
 * createApp({ verifyToken, identifier, store, firebaseConfig })
 *  verifyToken(idToken) -> {uid, email, name, picture}   (Firebase Admin in prod)
 *  identifier(jpegBuffer) -> identification result        (Claude vision in prod)
 *  store -> see src/scans.js                                (Firestore + GCS in prod)
 */
export function createApp({ verifyToken, identifier, store, firebaseConfig = {} } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(compression());
  app.use(express.json({ limit: '64kb' }));

  const regs = buildRegs();
  const etag = `"${rawHash({ season: regs.scraped, size: String(regs.species.length), limit: process.env.K_REVISION || 'local' })}"`;
  const speciesById = new Map(regs.species.map((s) => [s.id, s]));

  app.get('/api/health', (_req, res) => res.json({ ok: true, scraped: regs.scraped, species: regs.species.length, scans: !!store, identify: !!identifier }));

  app.get('/api/config', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ firebase: firebaseConfig, features: { scans: !!(store && identifier && verifyToken) } });
  });

  app.get('/api/regs', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('ETag', etag);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.json(regs);
  });

  app.get('/api/regs/review', (_req, res) => {
    res.json(regs.species.filter((s) => s.needsReview).map(({ id, name, habitat, raw, url, reviewed }) => ({ id, name, habitat, raw, url, reviewed })));
  });

  // ---- authenticated scan features ----
  const requireAuth = async (req, res, next) => {
    if (!verifyToken) return res.status(503).json({ error: 'Sign-in is not configured on this server.' });
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return res.status(401).json({ error: 'Sign in to use this feature.' });
    try { req.user = await verifyToken(m[1]); next(); }
    catch (e) { res.status(401).json({ error: 'Your session expired. Sign in again.' }); }
  };

  app.get('/api/me', requireAuth, async (req, res) => {
    const scans = store ? await store.list(req.user.uid) : [];
    res.json({ user: req.user, scanCount: scans.length, speciesCount: new Set(scans.map((s) => s.speciesId).filter((x) => x != null)).size });
  });

  app.post('/api/identify', requireAuth, upload.single('image'), async (req, res) => {
    if (!identifier || !store) return res.status(503).json({ error: 'Photo identification is not configured on this server.' });
    if (!req.file) return res.status(400).json({ error: 'Attach an image as the "image" field.' });
    let images;
    try { images = await normalizeImage(req.file.buffer); }
    catch (e) { return res.status(400).json({ error: 'That file is not an image we can read.' }); }
    let ident;
    try { ident = await identifier(images.full); }
    catch (e) { console.error('identify failed', e); return res.status(502).json({ error: 'The fish identifier is unavailable right now. Try again in a minute.' }); }
    const rec = newScanRecord({ uid: req.user.uid, ident, source: req.body?.source });
    Object.assign(rec, await store.putImages(req.user.uid, rec.id, images));
    await store.create(req.user.uid, rec);
    const [withUrl] = await store.withUrls([rec]);
    res.status(201).json({ scan: withUrl, species: rec.speciesId != null ? speciesById.get(rec.speciesId) : null });
  });

  app.get('/api/scans', requireAuth, async (req, res) => {
    if (!store) return res.status(503).json({ error: 'Scan storage is not configured.' });
    const scans = await store.withUrls(await store.list(req.user.uid));
    res.json({ scans, groups: groupBySpecies(scans) });
  });

  app.patch('/api/scans/:id', requireAuth, async (req, res) => {
    if (!store) return res.status(503).json({ error: 'Scan storage is not configured.' });
    const cur = await store.get(req.user.uid, req.params.id);
    if (!cur) return res.status(404).json({ error: 'Scan not found.' });
    const patch = {};
    const b = req.body || {};
    if ('speciesId' in b) {
      if (b.speciesId != null && !speciesById.has(Number(b.speciesId))) return res.status(400).json({ error: 'Unknown species.' });
      patch.speciesId = b.speciesId == null ? null : Number(b.speciesId);
      patch.speciesName = patch.speciesId == null ? null : speciesById.get(patch.speciesId).name;
      if (patch.speciesId !== cur.speciesId) {
        patch.userCorrected = true;
        // keep the model's original guess reachable as an alternate, drop the one just chosen
        const alts = (cur.alternates || []).filter((a) => a.speciesId !== patch.speciesId);
        if (cur.speciesId != null && !alts.some((a) => a.speciesId === cur.speciesId)) alts.unshift({ speciesId: cur.speciesId, name: cur.speciesName, confidence: cur.confidence });
        patch.alternates = alts.slice(0, 3);
      }
    }
    if ('lengthIn' in b) patch.lengthIn = b.lengthIn == null ? null : Math.max(0, Math.min(200, Number(b.lengthIn) || 0));
    if ('verdict' in b) patch.verdict = ['keep', 'release', 'closed', 'check', 'kill'].includes(b.verdict) ? b.verdict : null;
    if ('verdictText' in b) patch.verdictText = String(b.verdictText || '').slice(0, 300);
    if ('note' in b) patch.note = String(b.note || '').slice(0, 500);
    if ('zone' in b) patch.zone = String(b.zone || '').slice(0, 20);
    const rec = await store.update(req.user.uid, req.params.id, patch);
    const [withUrl] = await store.withUrls([rec]);
    res.json({ scan: withUrl });
  });

  app.delete('/api/scans/:id', requireAuth, async (req, res) => {
    if (!store) return res.status(503).json({ error: 'Scan storage is not configured.' });
    const ok = await store.remove(req.user.uid, req.params.id);
    res.status(ok ? 204 : 404).end();
  });

  // Firebase Auth helper pages served from our own domain (avoids third-party cookie/ITP problems on iOS).
  if (firebaseConfig.projectId) app.use('/__/auth', async (req, res) => {
    try {
      const up = await fetch(`https://${firebaseConfig.projectId}.firebaseapp.com/__/auth${req.url}`, { headers: { accept: req.headers.accept || '*/*' } });
      res.status(up.status);
      for (const h of ['content-type', 'cache-control']) if (up.headers.get(h)) res.set(h, up.headers.get(h));
      res.send(Buffer.from(await up.arrayBuffer()));
    } catch (e) { res.status(502).send('auth helper unavailable'); }
  });

  // dev-only blob serving for the in-memory store
  if (store?.blobs) app.get('/dev-blob/*', (req, res) => {
    const b = store.blobs.get(req.params[0]);
    if (!b) return res.status(404).end();
    res.type('image/jpeg').send(b);
  });

  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    setHeaders(res, file) {
      if (file.endsWith('sw.js') || file.endsWith('index.html')) res.set('Cache-Control', 'no-cache');
    },
  }));
  return app;
}

/** Wire real cloud services from the environment (Cloud Run). */
export async function createProductionApp() {
  const { buildRegs: br } = await import('./src/regs.js');
  const regs = br();
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || '',
  };
  let verifyToken, identifier, store;
  if (process.env.DEV_FAKE === '1' && process.env.NODE_ENV !== 'production') {
    // Local end-to-end mode: no Google, no Anthropic. `npm run dev:fake`
    firebaseConfig.apiKey = 'dev';
    verifyToken = async () => ({ uid: 'dev-user', email: 'dev@example.com', name: 'Dev Angler', picture: null });
    const pick = regs.species.find((s) => s.name === 'Black Sea Bass');
    identifier = async () => ({ speciesId: pick.id, name: pick.name, confidence: 0.86, alternates: [{ speciesId: 187, name: 'Tautog', confidence: 0.1 }], lengthIn: null, lengthBasis: null, notes: 'Fake identification (DEV_FAKE=1).', model: 'fake' });
    store = makeMemoryStore();
    return createApp({ verifyToken, identifier, store, firebaseConfig });
  }
  if (firebaseConfig.apiKey) {
    const admin = await import('firebase-admin');
    const fb = admin.default.initializeApp({ projectId: firebaseConfig.projectId });
    verifyToken = async (t) => { const d = await fb.auth().verifyIdToken(t); return { uid: d.uid, email: d.email || null, name: d.name || null, picture: d.picture || null }; };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const { makeIdentifier } = await import('./src/identify.js');
    identifier = makeIdentifier({ species: regs.species });
  }
  if (process.env.SCANS_BUCKET) {
    const { Storage } = await import('@google-cloud/storage');
    const { Firestore } = await import('@google-cloud/firestore');
    const { makeCloudStore } = await import('./src/scans.js');
    store = makeCloudStore({ firestore: new Firestore(), bucket: new Storage().bucket(process.env.SCANS_BUCKET) });
  } else if (process.env.NODE_ENV !== 'production') {
    store = makeMemoryStore();
  }
  console.log(`features: auth=${!!verifyToken} identify=${!!identifier} store=${store ? (store.blobs ? 'memory' : 'cloud') : 'off'}`);
  return createApp({ verifyToken, identifier, store, firebaseConfig });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createProductionApp().then((app) => app.listen(PORT, () => console.log(`slotgauge listening on :${PORT}`)));
}
