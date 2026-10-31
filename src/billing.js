// SlotGauge Pro: accounts (entitlements + monthly usage) and Stripe subscriptions.
//
//   accounts: { get(uid) -> {pro, status, plan, customerId, subscriptionId, periodEnd} | null,
//               set(uid, patch), byCustomer(customerId) -> uid|null,
//               bumpUsage(key, month) -> count after increment, usage(key, month) -> count }
//   Keys for usage: "uid:<firebase uid>" for signed-in users, "anon:<device id>" for anonymous photo IDs.
//
// Stripe flow: POST /api/billing/checkout -> Checkout Session (mode=subscription, client_reference_id=uid)
//              webhook checkout.session.completed / customer.subscription.* -> accounts.set(uid, {pro,...})
//              POST /api/billing/portal -> Customer Portal URL for cancel/upgrade/receipts.

export const FREE_IDENTIFY_PER_MONTH = Number(process.env.FREE_IDENTIFY_PER_MONTH || 3);
export const PLANS = { year: { label: 'Yearly', price: '$19.99/year' }, month: { label: 'Monthly', price: '$2.99/month' } };

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

/** Emails that are always Pro (store reviewers, testers): env PRO_TEST_EMAILS="a@x.com,b@y.com". */
export const proTestEmails = () => new Set(String(process.env.PRO_TEST_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean));
export const isTestPro = (user) => !!(user?.email && proTestEmails().has(String(user.email).toLowerCase()));

export function isPro(acct, now = Date.now()) {
  if (acct && acct.testPro) return true;
  if (!acct || !acct.pro) return false;
  if (acct.status && !['active', 'trialing', 'past_due'].includes(acct.status)) return false;
  if (acct.periodEnd && new Date(acct.periodEnd).getTime() + 3 * 86400e3 < now) return false; // 3-day grace after period end
  return true;
}

export function makeMemoryAccounts() {
  const accts = new Map(); const usage = new Map();
  return {
    async get(uid) { return accts.get(uid) || null; },
    async set(uid, patch) { const cur = accts.get(uid) || {}; const next = { ...cur, ...patch, updated: new Date().toISOString() }; accts.set(uid, next); return next; },
    async byCustomer(customerId) { for (const [uid, a] of accts) if (a.customerId === customerId) return uid; return null; },
    async bumpUsage(key, month = monthKey()) { const k = `${key}|${month}`; const n = (usage.get(k) || 0) + 1; usage.set(k, n); return n; },
    async usage(key, month = monthKey()) { return usage.get(`${key}|${month}`) || 0; },
  };
}

/** Firestore-backed accounts: collection accounts/{uid}, usage counters in usage/{key}/months/{YYYY-MM}. */
export function makeCloudAccounts(firestore) {
  const accts = firestore.collection('accounts');
  const usageDoc = (key, month) => firestore.collection('usage').doc(key.replace(/\//g, '_')).collection('months').doc(month);
  return {
    async get(uid) { const d = await accts.doc(uid).get(); return d.exists ? d.data() : null; },
    async set(uid, patch) { await accts.doc(uid).set({ ...patch, updated: new Date().toISOString() }, { merge: true }); return this.get(uid); },
    async byCustomer(customerId) { const q = await accts.where('customerId', '==', customerId).limit(1).get(); return q.empty ? null : q.docs[0].id; },
    async bumpUsage(key, month = monthKey()) {
      const ref = usageDoc(key, month);
      return firestore.runTransaction(async (t) => { const d = await t.get(ref); const n = (d.exists ? d.data().n || 0 : 0) + 1; t.set(ref, { n, updated: new Date().toISOString() }); return n; });
    },
    async usage(key, month = monthKey()) { const d = await usageDoc(key, month).get(); return d.exists ? d.data().n || 0 : 0; },
  };
}

/**
 * Stripe wiring. `stripe` is a Stripe SDK instance (or a fake in tests) with
 * checkout.sessions.create, billingPortal.sessions.create, webhooks.constructEvent, subscriptions.retrieve.
 */
export function makeBilling({ stripe, accounts, prices = {}, webhookSecret, siteUrl = 'https://slotgauge.com' }) {
  const enabled = !!(stripe && prices.year);

  async function checkout({ uid, email, plan = 'year' }) {
    const price = prices[plan] || prices.year;
    const acct = await accounts.get(uid);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      client_reference_id: uid,
      customer: acct?.customerId || undefined,
      customer_email: acct?.customerId ? undefined : (email || undefined),
      metadata: { uid, plan },
      subscription_data: { metadata: { uid, plan } },
      allow_promotion_codes: true,
      automatic_tax: { enabled: process.env.STRIPE_TAX === '1' },
      success_url: `${siteUrl}/?pro=welcome`,
      cancel_url: `${siteUrl}/?pro=cancelled`,
    });
    return { url: session.url, id: session.id };
  }

  async function portal({ uid }) {
    const acct = await accounts.get(uid);
    if (!acct?.customerId) return null;
    const s = await stripe.billingPortal.sessions.create({ customer: acct.customerId, return_url: `${siteUrl}/?pro=managed` });
    return { url: s.url };
  }

  /** Apply a Stripe subscription object to the account it belongs to. */
  async function applySubscription(sub, uidHint) {
    const uid = uidHint || sub.metadata?.uid || (await accounts.byCustomer(typeof sub.customer === 'string' ? sub.customer : sub.customer?.id));
    if (!uid) return null;
    const active = ['active', 'trialing', 'past_due'].includes(sub.status);
    const item = sub.items?.data?.[0];
    const plan = sub.metadata?.plan || (item?.price?.recurring?.interval === 'year' ? 'year' : item?.price?.recurring?.interval === 'month' ? 'month' : undefined);
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : (item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null);
    return accounts.set(uid, { pro: active, status: sub.status, plan, customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id, subscriptionId: sub.id, periodEnd, cancelAtPeriodEnd: !!sub.cancel_at_period_end });
  }

  /** Handle a verified webhook event. Returns a short description for logs. */
  async function handleEvent(event) {
    const obj = event.data?.object || {};
    switch (event.type) {
      case 'checkout.session.completed': {
        const uid = obj.client_reference_id || obj.metadata?.uid; if (!uid) return 'checkout without uid';
        const customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;
        await accounts.set(uid, { customerId, email: obj.customer_details?.email || obj.customer_email || null });
        if (obj.subscription) {
          const sub = typeof obj.subscription === 'string' ? await stripe.subscriptions.retrieve(obj.subscription) : obj.subscription;
          await applySubscription(sub, uid);
        } else await accounts.set(uid, { pro: true, status: 'active' });
        return `pro on for ${uid}`;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const r = await applySubscription(obj);
        return r ? `${event.type} -> pro=${r.pro} status=${r.status}` : 'subscription for unknown customer';
      }
      case 'invoice.payment_failed': {
        const uid = await accounts.byCustomer(typeof obj.customer === 'string' ? obj.customer : obj.customer?.id);
        if (uid) await accounts.set(uid, { status: 'past_due' });
        return 'payment failed';
      }
      default: return `ignored ${event.type}`;
    }
  }

  function verify(rawBody, signature) {
    if (!webhookSecret) throw new Error('webhook secret not configured');
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  return { enabled, checkout, portal, handleEvent, verify, applySubscription };
}
