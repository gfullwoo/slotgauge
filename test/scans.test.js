import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../server.js';
import { makeMemoryStore, groupBySpecies } from '../src/scans.js';
import { parseModelJson, speciesCatalog, makeIdentifier, geminiBackend } from '../src/identify.js';
import { buildRegs } from '../src/regs.js';

const regs = buildRegs();
const seaBass = regs.species.find((s) => s.name === 'Black Sea Bass');
const tautog = regs.species.find((s) => s.name === 'Tautog');

async function testJpeg() {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 20, g: 90, b: 120 } } }).jpeg().toBuffer();
}

function appWithFakes({ ident } = {}) {
  const store = makeMemoryStore();
  const verifyToken = async (t) => { if (t !== 'good') throw new Error('bad token'); return { uid: 'u1', email: 'a@b.c', name: 'A', picture: null }; };
  const identifier = async () => ident || { speciesId: seaBass.id, name: seaBass.name, confidence: 0.9, alternates: [{ speciesId: tautog.id, name: tautog.name, confidence: 0.05 }], lengthIn: 13.5, lengthBasis: 'ruler visible', notes: '', model: 'fake' };
  return { app: createApp({ verifyToken, identifier, store, firebaseConfig: { apiKey: 'x', authDomain: 'y', projectId: 'p' } }), store };
}

test('parseModelJson accepts ranked candidates and the legacy single-answer shape', () => {
  const r = parseModelJson('Sure: {"candidates":[{"speciesId":"187","name":"Tautog","confidence":0.55,"why":"thick lips"},{"speciesId":93,"name":"Black Sea Bass","confidence":0.4,"why":"dark"}], "lengthIn": 13.13, "lengthBasis": null, "notes": ""} done');
  assert.equal(r.speciesId, 187); assert.equal(r.confidence, 0.55); assert.equal(r.lengthIn, 13.25);
  assert.equal(r.alternates[0].speciesId, 93); assert.equal(r.alternates[0].why, 'dark');
  const legacy = parseModelJson('{"speciesId": 93, "name": "x", "confidence": 1.4, "alternates": [], "lengthIn": null}');
  assert.equal(legacy.speciesId, 93); assert.equal(legacy.confidence, 1);
  assert.throws(() => parseModelJson('no json here'));
});

test('makeIdentifier snaps names to the catalog, drops unknown ids, skips verify when confident', async () => {
  let calls = 0;
  const client = { messages: { create: async () => { calls++; return { content: [{ type: 'text', text: JSON.stringify({ candidates: [{ speciesId: seaBass.id, name: 'sea bass thing', confidence: 0.95, why: 'filaments' }, { speciesId: 999999, name: 'x', confidence: 0.03 }, { speciesId: tautog.id, name: 'tog', confidence: 0.02 }], lengthIn: null, lengthBasis: null, notes: '' }) }] }; } } };
  const identify = makeIdentifier({ species: regs.species, client, model: 'test' });
  const r = await identify(Buffer.from('x'));
  assert.equal(r.name, 'Black Sea Bass');
  assert.deepEqual(r.alternates.map((a) => a.name), ['Tautog']);
  assert.equal(calls, 1); assert.equal(r.verified, false);
  assert.ok(speciesCatalog(regs.species).includes(`${seaBass.id}|Black Sea Bass|saltwater`));
});

test('makeIdentifier runs a head-to-head verify pass when unsure and adopts its ranking', async () => {
  const replies = [
    { candidates: [{ speciesId: seaBass.id, confidence: 0.6, why: 'dark body' }, { speciesId: tautog.id, confidence: 0.35, why: 'blunt head' }], lengthIn: null, lengthBasis: null, notes: 'first look' },
    { candidates: [{ speciesId: tautog.id, confidence: 0.85, why: 'thick rubbery lips, rounded tail, no dorsal filaments' }, { speciesId: seaBass.id, confidence: 0.15, why: 'no white tabs on dorsal' }], notes: 'lips decide it' },
  ];
  const prompts = [];
  const client = { messages: { create: async (req) => { prompts.push(req.system); return { content: [{ type: 'text', text: JSON.stringify(replies.shift()) }] }; } } };
  const identify = makeIdentifier({ species: regs.species, client, model: 'test' });
  const r = await identify(Buffer.from('x'));
  assert.equal(r.name, 'Tautog'); assert.equal(r.confidence, 0.85); assert.equal(r.verified, true);
  assert.equal(r.alternates[0].name, 'Black Sea Bass');
  assert.equal(r.notes, 'lips decide it');
  assert.equal(prompts.length, 2); assert.match(prompts[1], /head-to-head/);
});

test('makeIdentifier falls back to the next model when the API says the name is unknown', async () => {
  const used = [];
  const client = { messages: { create: async (req) => { used.push(req.model); if (req.model === 'bogus') { const e = new Error('model: bogus not found'); e.status = 404; throw e; } return { content: [{ type: 'text', text: JSON.stringify({ candidates: [{ speciesId: tautog.id, name: 'Tautog', confidence: 0.95, why: 'lips' }] }) }] }; } } };
  const identify = makeIdentifier({ species: regs.species, client, model: 'bogus', models: ['bogus', 'good-model'] });
  const r = await identify(Buffer.from('x'));
  assert.equal(r.name, 'Tautog'); assert.equal(r.model, 'claude:good-model');
  assert.deepEqual(used, ['bogus', 'good-model']);
  await identify(Buffer.from('x'));
  assert.deepEqual(used.slice(2), ['good-model']);   // sticks with the working model
});

test('geminiBackend calls Vertex AI with the image and walks its model chain on 404', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    if (url.includes('/models/gone:')) return { status: 404, ok: false, text: async () => 'nope' };
    const body = JSON.parse(opts.body);
    assert.equal(body.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
    assert.match(opts.headers.authorization, /^Bearer tok/);
    return { status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ candidates: [{ speciesId: tautog.id, name: 'Tautog', confidence: 0.93, why: 'thick lips, scaled body' }] }) }] } }] }) };
  };
  const backend = geminiBackend({ project: 'p', location: 'global', models: ['gone', 'gemini-test'], fetchImpl, tokenProvider: async () => 'tok' });
  const identify = makeIdentifier({ species: regs.species, backend });
  const r = await identify(Buffer.from('x'));
  assert.equal(r.name, 'Tautog'); assert.equal(r.model, 'gemini:gemini-test');
  assert.match(calls[0], /aiplatform\.googleapis\.com\/v1\/projects\/p\/locations\/global\/publishers\/google\/models\/gone:generateContent/);
  assert.equal(calls.length, 2);
});

test('scan endpoints require auth and the feature flag is advertised', async () => {
  const { app } = appWithFakes();
  const cfg = await request(app).get('/api/config');
  assert.equal(cfg.body.features.scans, true);
  assert.equal((await request(app).get('/api/scans')).status, 401);
  assert.equal((await request(app).get('/api/scans').set('Authorization', 'Bearer nope')).status, 401);
  const off = createApp();
  assert.equal((await request(off).get('/api/config')).body.features.scans, false);
  assert.equal((await request(off).get('/api/scans')).status, 503);
});

test('identify -> gallery grouping -> correction -> delete', async () => {
  const { app } = appWithFakes();
  const auth = (r) => r.set('Authorization', 'Bearer good');
  const jpeg = await testJpeg();
  const id1 = await auth(request(app).post('/api/identify')).field('source', 'camera').attach('image', jpeg, 'a.jpg');
  assert.equal(id1.status, 201);
  assert.equal(id1.body.scan.speciesName, 'Black Sea Bass');
  assert.equal(id1.body.scan.lengthIn, 13.5);
  assert.equal(id1.body.scan.source, 'camera');
  assert.match(id1.body.scan.thumbUrl, /thumb\.jpg$/);
  const id2 = await auth(request(app).post('/api/identify')).attach('image', jpeg, 'b.jpg');
  assert.equal(id2.status, 201);

  let g = await auth(request(app).get('/api/scans'));
  assert.equal(g.body.scans.length, 2);
  assert.deepEqual(g.body.groups.map((x) => [x.speciesName, x.count]), [['Black Sea Bass', 2]]);

  // user says the second one is actually a tautog, adds a verdict
  const p = await auth(request(app).patch('/api/scans/' + id2.body.scan.id)).send({ speciesId: tautog.id, lengthIn: 17, verdict: 'keep', verdictText: 'ok' });
  assert.equal(p.status, 200);
  assert.equal(p.body.scan.speciesName, 'Tautog');
  assert.equal(p.body.scan.userCorrected, true);
  g = await auth(request(app).get('/api/scans'));
  assert.deepEqual(g.body.groups.map((x) => [x.speciesName, x.count]).sort(), [['Black Sea Bass', 1], ['Tautog', 1]]);

  assert.equal((await auth(request(app).patch('/api/scans/' + id2.body.scan.id)).send({ speciesId: 424242 })).status, 400);
  assert.equal((await auth(request(app).delete('/api/scans/' + id1.body.scan.id))).status, 204);
  assert.equal((await auth(request(app).delete('/api/scans/' + id1.body.scan.id))).status, 404);
  const me = await auth(request(app).get('/api/me'));
  assert.equal(me.body.scanCount, 1);
});

test('anonymous identify works without storing, and is rate limited per IP', async () => {
  const { app, store } = appWithFakes();
  const jpeg = await testJpeg();
  const r = await request(app).post('/api/identify').attach('image', jpeg, 'a.jpg');
  assert.equal(r.status, 200);
  assert.equal(r.body.scan.saved, false); assert.equal(r.body.scan.id, null);
  assert.equal(r.body.scan.speciesName, 'Black Sea Bass');
  assert.equal((await store.list('u1')).length, 0);
  const cfg = await request(app).get('/api/config');
  assert.equal(cfg.body.features.identify, true);
  // exhaust the anonymous budget
  process.env.ANON_IDENTIFY_PER_HOUR = '2';
  const { app: tight } = appWithFakes();
  assert.equal((await request(tight).post('/api/identify').attach('image', jpeg, 'a.jpg')).status, 200);
  assert.equal((await request(tight).post('/api/identify').attach('image', jpeg, 'a.jpg')).status, 200);
  assert.equal((await request(tight).post('/api/identify').attach('image', jpeg, 'a.jpg')).status, 429);
  assert.equal((await request(tight).post('/api/identify').set('Authorization', 'Bearer good').attach('image', jpeg, 'a.jpg')).status, 201);
  delete process.env.ANON_IDENTIFY_PER_HOUR;
});

test('bulk delete removes several scans at once', async () => {
  const { app } = appWithFakes();
  const auth = (r) => r.set('Authorization', 'Bearer good');
  const jpeg = await testJpeg();
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await auth(request(app).post('/api/identify')).attach('image', jpeg, 'a.jpg')).body.scan.id);
  const d = await auth(request(app).post('/api/scans/delete')).send({ ids: ids.slice(0, 2).concat(['nope']) });
  assert.equal(d.body.deleted, 2);
  assert.equal((await auth(request(app).get('/api/scans'))).body.scans.length, 1);
  assert.equal((await request(app).post('/api/scans/delete').send({ ids })).status, 401);
});

test('identify rejects non-images and reports identifier outages cleanly', async () => {
  const { app } = appWithFakes();
  const bad = await request(app).post('/api/identify').set('Authorization', 'Bearer good').attach('image', Buffer.from('not an image'), 'x.jpg');
  assert.equal(bad.status, 400);
  const broken = createApp({ verifyToken: async () => ({ uid: 'u' }), identifier: async () => { throw new Error('boom'); }, store: makeMemoryStore() });
  const r = await request(broken).post('/api/identify').set('Authorization', 'Bearer t').attach('image', await testJpeg(), 'x.jpg');
  assert.equal(r.status, 502);
});

test('groupBySpecies orders by count then recency and buckets unidentified', () => {
  const g = groupBySpecies([
    { speciesId: 1, speciesName: 'A', createdAt: '2026-01-01' }, { speciesId: 2, speciesName: 'B', createdAt: '2026-01-05' },
    { speciesId: 2, speciesName: 'B', createdAt: '2026-01-02' }, { speciesId: null, speciesName: null, createdAt: '2026-01-03' }]);
  assert.deepEqual(g.map((x) => [x.speciesName, x.count]), [['B', 2], ['Unidentified', 1], ['A', 1]]);
});
