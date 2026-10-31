import express from 'express';
import compression from 'compression';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegs, rawHash } from './src/regs.js';
import { makePages, sitemapAll, SITE, privacyPage, proPage, termsPage, deleteAccountPage } from './src/pages.js';
import { buildAllRegs } from './src/regs.js';
import { loadSources, loadState as loadSourceState } from './src/sources.js';
import { makeLocator } from './src/locate.js';
import { makeInfoLookup, loadSpeciesInfo } from './src/wiki.js';
import { makeTides } from './src/tides.js';
import { makeMemoryAccounts, makeBilling, isPro, isTestPro, FREE_IDENTIFY_PER_MONTH, PLANS } from './src/billing.js';
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
export function createApp({ verifyToken, identifier, store, firebaseConfig = {}, locateFetch, wikiFetch, wikiLive = process.env.NODE_ENV !== 'test', tides = makeTides(), tidesRefresh = process.env.NODE_ENV !== 'test', accounts = makeMemoryAccounts(), billing = null } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);   // Cloud Run sits behind Google's load balancer; req.ip must be the client
  app.use(compression());
  // Stripe webhook needs the raw body for signature verification, so it is mounted before the JSON parser.
  app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    if (!billing?.enabled) return res.status(503).json({ error: 'billing not configured' });
    let event;
    try { event = billing.verify(req.body, req.headers['stripe-signature']); } catch (e) { return res.status(400).json({ error: `webhook signature: ${e.message}` }); }
    try { const what = await billing.handleEvent(event); console.log(`billing: ${event.type}: ${what}`); res.json({ received: true }); }
    catch (e) { console.error('billing webhook failed', e); res.status(500).json({ error: 'webhook failed' }); }
  });
  app.use(express.json({ limit: '64kb' }));

  const allRegs = buildAllRegs();
  const regs = allRegs.DE;
  const etagOf = (r) => `"${rawHash({ season: r.scraped + r.state, size: String(r.species.length), limit: process.env.K_REVISION || 'local' })}"`;
  const etag = etagOf(regs);
  const registry = loadSources();
  const states = Object.entries(registry.states).map(([code, x]) => ({ code, slug: x.slug, name: x.name, live: !!allRegs[code], species: allRegs[code]?.species.length || 0, season: x.season }));
  const locator = makeLocator({ live: states.filter((s) => s.live).map((s) => s.code), names: Object.fromEntries(states.map((s) => [s.code, s.name])), fetchImpl: locateFetch || fetch });
  const speciesById = new Map(regs.species.map((s) => [s.id, s]));

  app.get('/api/health', (_req, res) => res.json({ ok: true, scraped: regs.scraped, species: regs.species.length, scans: !!store, identify: !!identifier }));

  app.get('/api/config', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ firebase: firebaseConfig, features: { scans: !!(store && identifier && verifyToken), identify: !!identifier, anonIdentify: !!identifier, billing: !!billing?.enabled }, pro: { freeIdentify: FREE_IDENTIFY_PER_MONTH, plans: PLANS } });
  });

  app.get('/api/regs', (req, res) => {
    const code = String(req.query.state || 'DE').toUpperCase();
    const r = allRegs[code]; if (!r) return res.status(404).json({ error: `no regulations for ${code}`, states: states.filter((s) => s.live).map((s) => s.code) });
    const tag = etagOf(r);
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('ETag', tag);
    if (req.headers['if-none-match'] === tag) return res.status(304).end();
    res.json(r);
  });
  app.get('/api/states', (_req, res) => { res.set('Cache-Control', 'public, max-age=3600'); res.json({ states }); });
  app.get('/api/locate', async (req, res) => {
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({ error: 'lat and lon required' });
    res.set('Cache-Control', 'private, max-age=600');
    res.json(await locator(lat, lon));
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
    catch (e) {
      let claims = {};
      try { claims = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString()); } catch (_) {}
      console.warn(`auth: token rejected: ${e.code || ''} ${e.message} (aud=${claims.aud} iss=${claims.iss} exp=${claims.exp})`);
      res.status(401).json({ error: 'Your session expired. Sign in again.' });
    }
  };

  // Optional auth: sets req.user when a valid token is present, otherwise continues anonymously.
  const optionalAuth = async (req, _res, next) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (verifyToken && m) { try { req.user = await verifyToken(m[1]); } catch (e) { /* treat as anonymous */ } }
    next();
  };
  // Anonymous identifications cost money; cap them per IP per hour.
  const anonBudget = new Map();
  const ANON_PER_HOUR = Number(process.env.ANON_IDENTIFY_PER_HOUR || 12);
  function anonAllowed(ip) {
    const now = Date.now(); const hour = Math.floor(now / 36e5);
    const e = anonBudget.get(ip); if (!e || e.hour !== hour) { anonBudget.set(ip, { hour, n: 1 }); return true; }
    if (e.n >= ANON_PER_HOUR) return false; e.n++; return true;
  }
  setInterval(() => { const hour = Math.floor(Date.now() / 36e5); for (const [k, v] of anonBudget) if (v.hour !== hour) anonBudget.delete(k); }, 36e5).unref?.();

  app.get('/api/me', requireAuth, async (req, res) => {
    const scans = store ? await store.list(req.user.uid) : [];
    const acct = isTestPro(req.user) ? { ...(await accounts.get(req.user.uid)), testPro: true, pro: true, status: 'active', plan: 'year' } : await accounts.get(req.user.uid);
    res.json({ user: req.user, scanCount: scans.length, speciesCount: new Set(scans.map((s) => s.speciesId).filter((x) => x != null)).size,
      pro: isPro(acct), plan: acct?.plan || null, status: acct?.status || null, periodEnd: acct?.periodEnd || null, cancelAtPeriodEnd: !!acct?.cancelAtPeriodEnd,
      identifyUsed: await accounts.usage(`uid:${req.user.uid}`), identifyLimit: isPro(acct) ? null : FREE_IDENTIFY_PER_MONTH, billing: !!billing?.enabled });
  });
  // Anonymous visitors get the same monthly free allowance, keyed by a device id the app generates.
  app.get('/api/quota', async (req, res) => {
    const did = String(req.headers['x-sg-device'] || '').slice(0, 64);
    const used = did ? await accounts.usage(`anon:${did}`) : 0;
    res.set('Cache-Control', 'no-store'); res.json({ identifyUsed: used, identifyLimit: FREE_IDENTIFY_PER_MONTH, billing: !!billing?.enabled });
  });
  app.post('/api/billing/checkout', requireAuth, async (req, res) => {
    if (!billing?.enabled) return res.status(503).json({ error: 'Subscriptions are not available yet.' });
    try { res.json(await billing.checkout({ uid: req.user.uid, email: req.user.email, plan: req.body?.plan === 'month' ? 'month' : 'year' })); }
    catch (e) { console.error('checkout failed', e); res.status(502).json({ error: 'Could not start checkout. Try again in a minute.' }); }
  });
  app.post('/api/billing/portal', requireAuth, async (req, res) => {
    if (!billing?.enabled) return res.status(503).json({ error: 'Subscriptions are not available yet.' });
    try { const r = await billing.portal({ uid: req.user.uid }); if (!r) return res.status(404).json({ error: 'No subscription on this account yet.' }); res.json(r); }
    catch (e) { console.error('portal failed', e); res.status(502).json({ error: 'Could not open the billing portal.' }); }
  });

  app.post('/api/identify', optionalAuth, upload.single('image'), async (req, res) => {
    if (!identifier) return res.status(503).json({ error: 'Photo identification is not configured on this server.' });
    if (!req.file) return res.status(400).json({ error: 'Attach an image as the "image" field.' });
    if (!req.user && !anonAllowed(req.ip)) return res.status(429).json({ error: 'Hourly limit for photo checks without an account reached. Sign in for unlimited checks and a gallery.' });
    // Free tier: FREE_IDENTIFY_PER_MONTH photo IDs a month (per account, or per device when anonymous); Pro is unlimited.
    const acct = req.user ? await accounts.get(req.user.uid) : null;
    const pro = isPro(acct) || isTestPro(req.user);
    const quotaKey = req.user ? `uid:${req.user.uid}` : (req.headers['x-sg-device'] ? `anon:${String(req.headers['x-sg-device']).slice(0, 64)}` : `ip:${req.ip}`);
    if (!pro && billing?.enabled) {
      const used = await accounts.usage(quotaKey);
      if (used >= FREE_IDENTIFY_PER_MONTH) return res.status(402).json({ error: `You've used your ${FREE_IDENTIFY_PER_MONTH} free photo IDs this month.`, quota: { used, limit: FREE_IDENTIFY_PER_MONTH }, upgrade: true, signedIn: !!req.user });
    }
    let images;
    try { images = await normalizeImage(req.file.buffer); }
    catch (e) { return res.status(400).json({ error: 'That file is not an image we can read.' }); }
    let ident;
    try { ident = await identifier(images.full); }
    catch (e) { console.error('identify failed', e); return res.status(502).json({ error: 'The fish identifier is unavailable right now. Try again in a minute.' }); }
    const used = pro ? null : await accounts.bumpUsage(quotaKey);
    const rec = newScanRecord({ uid: req.user ? req.user.uid : null, ident, source: req.body?.source });
    res.set('X-SG-Identify-Used', String(used ?? 0)); res.set('X-SG-Identify-Limit', pro ? 'unlimited' : String(FREE_IDENTIFY_PER_MONTH));
    const species = rec.speciesId != null ? speciesById.get(rec.speciesId) : null;
    if (!req.user || !store) {
      // anonymous: identify only, nothing stored
      return res.status(200).json({ scan: { ...rec, id: null, saved: false }, species });
    }
    Object.assign(rec, await store.putImages(req.user.uid, rec.id, images));
    await store.create(req.user.uid, rec);
    const [withUrl] = await store.withUrls([rec]);
    res.status(201).json({ scan: { ...withUrl, saved: true }, species });
  });

  // Bulk delete for the gallery's edit mode.
  app.post('/api/scans/delete', requireAuth, async (req, res) => {
    if (!store) return res.status(503).json({ error: 'Scan storage is not configured.' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 200) : [];
    let n = 0; for (const id of ids) if (await store.remove(req.user.uid, id)) n++;
    res.json({ deleted: n });
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

  // ---- species photo proxy: DNREC serves images as text/html with no caching headers, which some
  // phone browsers refuse to render in <img>; re-serve them as proper images from our own origin. ----
  const imgCache = new Map(); const IMG_MAX = 300;
  app.get('/img/species/:id.jpg', async (req, res) => {
    const id = Number(req.params.id);
    if (!speciesById.has(id)) return res.status(404).end();
    let hit = imgCache.get(id);
    if (!hit) {
      try {
        const r = await fetch(`https://fishspecies.dnrec.delaware.gov/imageDB.ashx?id=${id}&ss=2`, { headers: { 'user-agent': 'SlotGauge (+https://slotgauge.com)' } });
        const buf = Buffer.from(await r.arrayBuffer());
        if (!r.ok || buf.length < 1000) return res.status(404).end();
        const type = buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : buf[0] === 0x47 && buf[1] === 0x49 ? 'image/gif' : 'image/jpeg';
        hit = { buf, type };
        if (imgCache.size >= IMG_MAX) imgCache.delete(imgCache.keys().next().value);
        imgCache.set(id, hit);
      } catch (e) { return res.status(502).end(); }
    }
    res.set('Cache-Control', 'public, max-age=604800, immutable').type(hit.type).send(hit.buf);
  });

  // ---- tides (NOAA CO-OPS) ----
  // /api/tides/stations?lat=&lon=            nearest stations to a point (default 8)
  // /api/tides/stations?q=myrtle             name search
  // /api/tides/stations?state=SC             every prediction station in a state
  // /api/tides?station=8661070[&date=YYYY-MM-DD][&days=2]   highs/lows + 30-minute curve, station local time
  app.get('/api/tides/stations', (req, res) => {
    const { lat, lon, q, state } = req.query; const n = Math.min(50, Math.max(1, +req.query.n || 8));
    res.set('Cache-Control', 'public, max-age=3600');
    if (lat != null && lon != null) { const la = +lat, lo = +lon; if (!Number.isFinite(la) || !Number.isFinite(lo)) return res.status(400).json({ error: 'bad lat/lon' }); return res.json({ stations: tides.nearest(la, lo, n) }); }
    if (q) return res.json({ stations: tides.search(q, n) });
    if (state) return res.json({ stations: tides.byState(state) });
    return res.status(400).json({ error: 'give lat&lon, q or state' });
  });
  app.get('/api/tides', async (req, res) => {
    const st = tides.station(req.query.station); if (!st) return res.status(404).json({ error: 'unknown station' });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : undefined;
    const days = Math.min(7, Math.max(1, +req.query.days || 2));
    try {
      const data = await tides.predictions(st.id, { date, days });
      res.set('Cache-Control', 'public, max-age=1800');
      res.json({ ...data, now: tides.phase(data) });
    } catch (e) { res.status(502).json({ error: 'tide service unavailable', detail: String(e.message || e) }); }
  });
  if (tidesRefresh) { // keep the bundled station list current without a deploy
    const tick = () => tides.refreshStations().catch(() => {});
    setTimeout(tick, 30e3).unref?.(); setInterval(tick, 24 * 3600e3).unref?.();
  }

  // ---- crawlable regulation pages (SEO): /<state>/, /<state>/<habitat>/, /<state>/<species>/ for every state with data ----
  const pagesByState = Object.fromEntries(Object.values(allRegs).map((r) => { const p = makePages(r); return [p.state.slug, p]; }));
  const HABS = ['saltwater', 'freshwater', 'shellfish'];
  // Species background (Wikipedia summaries): data/species-info.json is ingested weekly by the species-info workflow;
  // anything missing is fetched once at request time and kept in memory.
  const speciesInfo = loadSpeciesInfo();
  const infoFor = makeInfoLookup({ info: speciesInfo, fetchImpl: wikiFetch, live: wikiLive });
  const html = (res, body, maxAge = 3600) => { res.set('Cache-Control', `public, max-age=${maxAge}`); res.type('html').send(body); };
  // Digital Asset Links so the Android app can open slotgauge.com full-screen (Trusted Web Activity).
  // ANDROID_CERT_SHA256 = SHA-256 fingerprints separated by | (Cloud Run env vars cannot contain commas) of the app signing certificate(s); see docs/ANDROID.md.
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    const prints = String(process.env.ANDROID_CERT_SHA256 || '').split(/[|; ]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!prints.length) return res.status(404).json([]);
    res.set('Cache-Control', 'public, max-age=3600');
    res.json([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.slotgauge.app', sha256_cert_fingerprints: prints } }]);
  });
  app.get(['/privacy', '/privacy/'], (req, res) => (req.path.endsWith('/') ? html(res, privacyPage(), 86400) : res.redirect(301, '/privacy/')));
  app.get(['/delete-account', '/delete-account/'], (req, res) => (req.path.endsWith('/') ? html(res, deleteAccountPage(), 86400) : res.redirect(301, '/delete-account/')));
  app.get(['/terms', '/terms/'], (req, res) => (req.path.endsWith('/') ? html(res, termsPage(), 86400) : res.redirect(301, '/terms/')));
  app.get(['/pro', '/pro/'], (req, res) => (req.path.endsWith('/') ? html(res, proPage(), 3600) : res.redirect(301, '/pro/')));
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /__/\nSitemap: ${SITE}/sitemap.xml\n`));
  app.get('/sitemap.xml', (_req, res) => { res.set('Cache-Control', 'public, max-age=3600'); res.type('application/xml').send(sitemapAll(pagesByState)); });
  app.get('/api/sources', (_req, res) => {
    // freshness dashboard: which official sources back each state, when they were last checked / changed
    const reg = loadSources(); const st = loadSourceState();
    res.json({ lastRun: st.lastRun || null, states: Object.entries(reg.states).map(([code, x]) => ({ code, name: x.name, season: x.season, live: !!allRegs[code], species: allRegs[code]?.species.length || 0, captured: allRegs[code]?.scraped || null,
      sources: x.sources.map((src) => ({ id: src.id, title: src.title, url: src.url, role: src.role, checked: st.sources?.[src.id]?.checked || null, changed: st.sources?.[src.id]?.changed || null, status: st.sources?.[src.id]?.status ?? null })) })) });
  });
  if (process.env.GOOGLE_SITE_VERIFICATION) {
    const token = process.env.GOOGLE_SITE_VERIFICATION.replace(/^google|\.html$/g, '');
    app.get(`/google${token}.html`, (_req, res) => res.type('text/html').send(`google-site-verification: google${token}.html`));
  }
  app.get('/:state', (req, res, next) => { const p = pagesByState[req.params.state]; if (!p) return next(); return req.path.endsWith('/') ? html(res, p.statePage()) : res.redirect(301, `/${p.state.slug}/`); });
  app.get('/:state/:slug', async (req, res, next) => {
    const p = pagesByState[req.params.state]; if (!p) return next();
    const { slug } = req.params;
    if (!req.path.endsWith('/')) return (p.bySlug.has(slug) || HABS.includes(slug) || slug === 'species') ? res.redirect(301, `${req.path}/`) : next();
    if (slug === 'species') return html(res, p.directoryPage(speciesInfo));
    if (HABS.includes(slug)) { const page = p.hubPage(slug); return page ? html(res, page) : next(); }
    const sp = p.bySlug.get(slug); if (!sp) return next();
    const info = await Promise.race([infoFor(sp.name), new Promise((r) => { const t = setTimeout(r, 2500, null); t.unref?.(); })]).catch(() => null);
    return html(res, p.speciesPage(slug, new Date(), info));
  });

  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    setHeaders(res, file) {
      if (file.endsWith('.js') || file.endsWith('index.html') || file.endsWith('.webmanifest')) res.set('Cache-Control', 'no-cache'); // app code must never be stale for an hour after a deploy
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
    identifier = async () => ({ speciesId: pick.id, name: pick.name, confidence: 0.55, why: 'Dark body, large mouth (fake).', alternates: [{ speciesId: 187, name: 'Tautog', confidence: 0.4, why: 'Blunt head and thick lips would point here (fake).' }], lengthIn: null, lengthBasis: null, notes: 'Fake identification (DEV_FAKE=1).', model: 'fake', verified: true });
    store = makeMemoryStore();
    return createApp({ verifyToken, identifier, store, firebaseConfig });
  }
  if (firebaseConfig.apiKey) {
    const { initializeApp } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const fbAuth = getAuth(initializeApp({ projectId: firebaseConfig.projectId }));
    verifyToken = async (t) => { const d = await fbAuth.verifyIdToken(t); return { uid: d.uid, email: d.email || null, name: d.name || null, picture: d.picture || null }; };
  }
  {
    const { makeIdentifier, claudeBackend, geminiBackend } = await import('./src/identify.js');
    const provider = (process.env.IDENTIFY_PROVIDER || 'auto').toLowerCase();   // gemini | claude | auto
    const gemini = process.env.GEMINI_ENABLED === '1' || provider === 'gemini';
    const claude = !!process.env.ANTHROPIC_API_KEY;
    const primary = gemini && provider !== 'claude' ? geminiBackend() : claude ? claudeBackend() : null;
    const fallback = primary && gemini && claude && provider !== 'claude' ? claudeBackend() : null;
    if (primary) {
      const main = makeIdentifier({ species: regs.species, backend: primary });
      const alt = fallback ? makeIdentifier({ species: regs.species, backend: fallback }) : null;
      identifier = async (jpeg) => {
        try { return await main(jpeg); }
        catch (e) { if (!alt) throw e; console.warn('identify: primary failed, using fallback:', e.message); return alt(jpeg); }
      };
      console.log(`identify: primary=${primary.name_()}${fallback ? ' fallback=' + fallback.name_() : ''}`);
    }
  }
  let accounts, billing;
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_YEAR) {
    const { default: Stripe } = await import('stripe');
    const { makeCloudAccounts } = await import('./src/billing.js');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-09-30.clover' });
    accounts = process.env.GOOGLE_CLOUD_PROJECT ? makeCloudAccounts(new (await import('@google-cloud/firestore')).Firestore()) : undefined;
    billing = makeBilling({ stripe, accounts: accounts || makeMemoryAccounts(), prices: { year: process.env.STRIPE_PRICE_YEAR, month: process.env.STRIPE_PRICE_MONTH }, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET, siteUrl: SITE });
    console.log(`billing: stripe on (${accounts ? 'firestore' : 'memory'} accounts, tax=${process.env.STRIPE_TAX === '1'})`);
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
  return createApp({ verifyToken, identifier, store, firebaseConfig, accounts, billing });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createProductionApp().then((app) => app.listen(PORT, () => console.log(`slotgauge listening on :${PORT}`)));
}
