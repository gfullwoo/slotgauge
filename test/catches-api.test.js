import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
import { makeMemoryAccounts, makeBilling } from '../src/billing.js';
import { makeMemoryCatches } from '../src/catches.js';

const stripe = {
  checkout: { sessions: { create: async () => ({ id: 'cs', url: 'u' }) } },
  billingPortal: { sessions: { create: async () => ({ url: 'u' }) } },
  subscriptions: { retrieve: async () => ({}) },
  webhooks: { constructEvent: () => ({}) },
};

async function app({ pro = false } = {}) {
  const accounts = makeMemoryAccounts();
  if (pro) await accounts.set('u1', { pro: true, status: 'active', periodEnd: new Date(Date.now() + 30 * 86400e3).toISOString() });
  const billing = makeBilling({ stripe, accounts, prices: { year: 'price_y' }, webhookSecret: 'w' });
  const a = createApp({
    wikiLive: false, tidesRefresh: false, accounts, billing, catches: makeMemoryCatches(),
    firebaseConfig: { apiKey: 'x' }, verifyToken: async (t) => ({ uid: t, email: `${t}@x.com` }),
    // no network in tests: tide and weather lookups fail, which is the path that must not lose a catch
    tides: { nearest: () => [{ id: '8557380', name: 'Lewes' }], predictions: async () => { throw new Error('offline'); }, phase: () => null, station: () => null, refreshStations: async () => {} },
    weather: { at: async () => { throw new Error('offline'); } },
  });
  const srv = a.listen(0);
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

const AUTH = { Authorization: 'Bearer u1', 'Content-Type': 'application/json' };

test('moon endpoint is free and returns solunar windows', async () => {
  const { base, close } = await app();
  try {
    const bad = await fetch(`${base}/api/moon`);
    assert.equal(bad.status, 400);
    const r = await fetch(`${base}/api/moon?lat=38.6&lon=-75.07&days=3`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.days.length, 3);
    assert.ok(j.days[0].phase.name);
    assert.ok(j.days[0].windows.length >= 2);
    assert.match(j.note, /not a forecast/i, 'must say solunar is folklore, not a forecast');
  } finally { close(); }
});

test('catch log refuses anonymous users and non-Pro users', async () => {
  const { base, close } = await app({ pro: false });
  try {
    assert.equal((await fetch(`${base}/api/catches`)).status, 401);
    const r = await fetch(`${base}/api/catches`, { headers: AUTH });
    assert.equal(r.status, 402);
    assert.equal((await r.json()).upgrade, true);
  } finally { close(); }
});

test('Pro user logs a catch, gets it back, and deletes it', async () => {
  const { base, close } = await app({ pro: true });
  try {
    const post = await fetch(`${base}/api/catches`, { method: 'POST', headers: AUTH, body: JSON.stringify({ species: 'Striped Bass', lengthIn: 28, lat: 38.6, lon: -75.07, kept: true, place: 'Indian River Inlet' }) });
    assert.equal(post.status, 201);
    const { catch: c } = await post.json();
    assert.equal(c.species, 'Striped Bass');
    assert.ok(c.conditions.moon.name, 'moon is local arithmetic, always stamped');
    assert.equal(c.conditions.tide, null, 'tide service was offline; the catch is still saved');

    const list = await (await fetch(`${base}/api/catches`, { headers: AUTH })).json();
    assert.equal(list.catches.length, 1);
    assert.equal(list.summary.enough, false, 'one fish is not a pattern');

    assert.equal((await fetch(`${base}/api/catches/${c.id}`, { method: 'DELETE', headers: AUTH })).status, 200);
    assert.equal((await fetch(`${base}/api/catches/nope`, { method: 'DELETE', headers: AUTH })).status, 404);
  } finally { close(); }
});

test('a bad catch is rejected with a readable message', async () => {
  const { base, close } = await app({ pro: true });
  try {
    const r = await fetch(`${base}/api/catches`, { method: 'POST', headers: AUTH, body: JSON.stringify({ lengthIn: 5 }) });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /species/i);
  } finally { close(); }
});

test('insights tells a new user how many more catches it needs', async () => {
  const { base, close } = await app({ pro: true });
  try {
    const j = await (await fetch(`${base}/api/insights?lat=38.6&lon=-75.07`, { headers: AUTH })).json();
    assert.equal(j.summary.catches, 0);
    assert.match(j.note, /\d+ more catches/);
    assert.ok(Array.isArray(j.windows));
  } finally { close(); }
});

test('config advertises the catch log and moon features', async () => {
  const { base, close } = await app();
  try {
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.equal(cfg.features.catchLog, true);
    assert.equal(cfg.features.moon, true);
  } finally { close(); }
});
