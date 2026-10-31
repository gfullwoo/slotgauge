import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMemoryAccounts, makeBilling, isPro, FREE_IDENTIFY_PER_MONTH } from '../src/billing.js';
import { createApp } from '../server.js';
import { makeMemoryStore } from '../src/scans.js';
import sharp from 'sharp';

function fakeStripe() {
  const calls = [];
  return { calls,
    checkout: { sessions: { create: async (p) => { calls.push(['checkout', p]); return { id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }; } } },
    billingPortal: { sessions: { create: async (p) => { calls.push(['portal', p]); return { url: 'https://portal.stripe.test/x' }; } } },
    subscriptions: { retrieve: async (id) => ({ id, status: 'active', customer: 'cus_1', metadata: { uid: 'u1', plan: 'year' }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, items: { data: [{ price: { recurring: { interval: 'year' } } }] } }) },
    webhooks: { constructEvent: (body, sig, secret) => { if (sig !== 'good') throw new Error('bad sig'); return JSON.parse(body.toString()); } },
  };
}

test('isPro honours status and period end with grace', () => {
  const soon = new Date(Date.now() + 86400e3).toISOString(), old = new Date(Date.now() - 10 * 86400e3).toISOString();
  assert.equal(isPro(null), false);
  assert.equal(isPro({ pro: true, status: 'active', periodEnd: soon }), true);
  assert.equal(isPro({ pro: true, status: 'canceled', periodEnd: soon }), false);
  assert.equal(isPro({ pro: true, status: 'active', periodEnd: old }), false);
  assert.equal(isPro({ pro: true, status: 'active', periodEnd: new Date(Date.now() - 86400e3).toISOString() }), true); // within grace
});

test('checkout, webhook and portal flow turns Pro on and off', async () => {
  const stripe = fakeStripe(); const accounts = makeMemoryAccounts();
  const b = makeBilling({ stripe, accounts, prices: { year: 'price_y', month: 'price_m' }, webhookSecret: 'whsec' });
  assert.equal(b.enabled, true);
  const c = await b.checkout({ uid: 'u1', email: 'g@x.com', plan: 'month' });
  assert.equal(c.url, 'https://checkout.stripe.test/cs_1'); assert.equal(stripe.calls[0][1].line_items[0].price, 'price_m'); assert.equal(stripe.calls[0][1].client_reference_id, 'u1');
  const ev = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', data: { object: { client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1', customer_details: { email: 'g@x.com' } } } }));
  await b.handleEvent(b.verify(ev, 'good'));
  assert.equal(isPro(await accounts.get('u1')), true); assert.equal((await accounts.get('u1')).plan, 'year');
  assert.throws(() => b.verify(ev, 'bad'));
  await b.handleEvent({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', status: 'canceled', customer: 'cus_1', metadata: {} } } });
  assert.equal(isPro(await accounts.get('u1')), false);
  const p = await b.portal({ uid: 'u1' }); assert.equal(p.url, 'https://portal.stripe.test/x');
  assert.equal(await b.portal({ uid: 'nobody' }), null);
});

test('photo ID quota: free users get FREE_IDENTIFY_PER_MONTH, Pro is unlimited, anonymous keyed by device', async () => {
  const stripe = fakeStripe(); const accounts = makeMemoryAccounts();
  const billing = makeBilling({ stripe, accounts, prices: { year: 'price_y' }, webhookSecret: 'whsec' });
  const app = createApp({ wikiLive: false, tidesRefresh: false, accounts, billing, store: makeMemoryStore(), firebaseConfig: { apiKey: 'x' },
    verifyToken: async (t) => ({ uid: t, email: `${t}@x.com` }), identifier: async () => ({ speciesId: 1, name: 'Striped Bass', confidence: 0.9, alternates: [] }) });
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  const jpg = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#357' } }).jpeg().toBuffer();
  const send = async (headers) => { const fd = new FormData(); fd.append('image', new Blob([jpg], { type: 'image/jpeg' }), 'f.jpg'); return fetch(`${base}/api/identify`, { method: 'POST', body: fd, headers }); };
  try {
    for (let i = 0; i < FREE_IDENTIFY_PER_MONTH; i++) assert.equal((await send({ Authorization: 'Bearer u1' })).status, 201, `free id ${i + 1}`);
    const over = await send({ Authorization: 'Bearer u1' }); assert.equal(over.status, 402); const j = await over.json(); assert.equal(j.upgrade, true); assert.equal(j.quota.used, FREE_IDENTIFY_PER_MONTH);
    const me = await (await fetch(`${base}/api/me`, { headers: { Authorization: 'Bearer u1' } })).json(); assert.equal(me.pro, false); assert.equal(me.identifyUsed, FREE_IDENTIFY_PER_MONTH);
    await accounts.set('u1', { pro: true, status: 'active', plan: 'year' });
    assert.equal((await send({ Authorization: 'Bearer u1' })).status, 201);
    assert.equal((await (await fetch(`${base}/api/me`, { headers: { Authorization: 'Bearer u1' } })).json()).identifyLimit, null);
    for (let i = 0; i < FREE_IDENTIFY_PER_MONTH; i++) assert.equal((await send({ 'x-sg-device': 'dev-abc' })).status, 200);
    assert.equal((await send({ 'x-sg-device': 'dev-abc' })).status, 402);
    const q = await (await fetch(`${base}/api/quota`, { headers: { 'x-sg-device': 'dev-abc' } })).json(); assert.equal(q.identifyUsed, FREE_IDENTIFY_PER_MONTH);
    const co = await fetch(`${base}/api/billing/checkout`, { method: 'POST', headers: { Authorization: 'Bearer u2', 'content-type': 'application/json' }, body: '{"plan":"year"}' });
    assert.equal(co.status, 200); assert.ok((await co.json()).url.includes('checkout'));
    assert.equal((await fetch(`${base}/api/billing/checkout`, { method: 'POST' })).status, 401);
    const wh = await fetch(`${base}/api/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 'bad' }, body: '{}' }); assert.equal(wh.status, 400);
  } finally { srv.close(); }
});

test('without billing configured nothing is gated', async () => {
  const app = createApp({ wikiLive: false, tidesRefresh: false, verifyToken: async (t) => ({ uid: t }), identifier: async () => ({ speciesId: 1, name: 'x', confidence: 0.9, alternates: [] }), store: makeMemoryStore(), firebaseConfig: { apiKey: 'x' } });
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  const jpg = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#357' } }).jpeg().toBuffer();
  try {
    for (let i = 0; i < FREE_IDENTIFY_PER_MONTH + 2; i++) { const fd = new FormData(); fd.append('image', new Blob([jpg], { type: 'image/jpeg' }), 'f.jpg'); assert.equal((await fetch(`${base}/api/identify`, { method: 'POST', body: fd, headers: { Authorization: 'Bearer u9' } })).status, 201); }
    assert.equal((await fetch(`${base}/api/billing/checkout`, { method: 'POST', headers: { Authorization: 'Bearer u9' } })).status, 503);
    assert.equal((await (await fetch(`${base}/api/config`)).json()).features.billing, false);
  } finally { srv.close(); }
});

test('PRO_TEST_EMAILS accounts are Pro without a subscription', async () => {
  process.env.PRO_TEST_EMAILS = 'slotgauge.reviewer@gmail.com';
  const accounts = makeMemoryAccounts(); const stripe = fakeStripe();
  const billing = makeBilling({ stripe, accounts, prices: { year: 'p' }, webhookSecret: 'w' });
  const app = createApp({ wikiLive: false, tidesRefresh: false, accounts, billing, store: makeMemoryStore(), firebaseConfig: { apiKey: 'x' }, verifyToken: async (t) => ({ uid: t, email: `${t}@gmail.com` }), identifier: async () => ({ speciesId: 1, name: 'x', confidence: 0.9, alternates: [] }) });
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = await (await fetch(`${base}/api/me`, { headers: { Authorization: 'Bearer slotgauge.reviewer' } })).json();
    assert.equal(me.pro, true); assert.equal(me.identifyLimit, null);
    const other = await (await fetch(`${base}/api/me`, { headers: { Authorization: 'Bearer someone' } })).json(); assert.equal(other.pro, false);
  } finally { srv.close(); delete process.env.PRO_TEST_EMAILS; }
});
