import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegs, rawHash, loadJson } from './src/regs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(compression());

  const regs = buildRegs();
  const etag = `"${rawHash({ season: regs.scraped, size: String(regs.species.length), limit: process.env.K_REVISION || 'local' })}"`;

  app.get('/healthz', (_req, res) => res.json({ ok: true, scraped: regs.scraped, species: regs.species.length }));

  app.get('/api/regs', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('ETag', etag);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.json(regs);
  });

  app.get('/api/regs/review', (_req, res) => {
    // Species whose DNREC wording changed since the overlay was reviewed, or that have rules but no overlay yet.
    res.json(regs.species.filter((s) => s.needsReview).map(({ id, name, habitat, raw, url, reviewed }) => ({ id, name, habitat, raw, url, reviewed })));
  });

  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    setHeaders(res, file) {
      if (file.endsWith('sw.js') || file.endsWith('index.html')) res.set('Cache-Control', 'no-cache');
    },
  }));
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createApp().listen(PORT, () => console.log(`fishkeepr listening on :${PORT}`));
}

export { loadJson };
