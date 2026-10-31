# SlotGauge Pro (subscriptions)

Free: voice/text checks, all regulation & species pages, tide badge + 48-hour chart for the nearest station, 3 photo IDs a month (per account, or per device when anonymous). Pro ($19.99/yr or $2.99/mo): unlimited photo ID, tides anywhere (station search, browse by state, days beyond tomorrow), and the upcoming catch log/insights.

## How it works
- `src/billing.js`: `makeMemoryAccounts` / `makeCloudAccounts(firestore)` (collection `accounts/{uid}`: pro, status, plan, customerId, subscriptionId, periodEnd; usage counters in `usage/{key}/months/{YYYY-MM}`), `makeBilling({stripe, accounts, prices, webhookSecret})`, `isPro()` (active/trialing/past_due, 3-day grace after periodEnd).
- Routes: `GET /api/me` (pro, plan, periodEnd, identifyUsed/Limit), `GET /api/quota` (anonymous, header `x-sg-device`), `POST /api/billing/checkout {plan}` → Stripe Checkout URL, `POST /api/billing/portal` → Customer Portal URL, `POST /api/billing/webhook` (raw body, signature verified; handles checkout.session.completed, customer.subscription.created/updated/deleted, invoice.payment_failed).
- `/api/identify` returns **402** `{upgrade:true, quota}` once the free allowance is used; Pro bypasses. Gating only applies when billing is configured (`features.billing` in `/api/config`), so dev and tests are ungated.
- App (`public/scans.js`): `window.SG_PRO` (`isPro()`, `gate(feature)`, `open()`), Pro page (`#proView`), menu entries ("Go Pro · N of 3 free photo IDs left" / "SlotGauge Pro · renews …" + "Manage subscription"), PRO tag in the header, upgrade card on 402. `public/tides.js` gates station search/browse/other stations and days outside today–tomorrow. In the Android app (`?source=android`) purchase buttons are hidden (Play Billing comes later; Google forbids outside payment links in Play apps).
- Pages: `/pro/`, `/terms/`; privacy policy has a Payments section.

## Stripe setup (once)
1. https://dashboard.stripe.com/register → activate the account (business details, bank for payouts). Use **Test mode** first.
2. Product catalog → **Add product**: name `SlotGauge Pro`, description "Unlimited photo ID, tides anywhere, catch log with conditions". Add two recurring prices: **$19.99 / year** and **$2.99 / month**. Copy each price ID (`price_…`).
3. Developers → API keys → copy the **Secret key** (`sk_test_…` / `sk_live_…`).
4. Developers → Webhooks → **Add endpoint** → URL `https://slotgauge.com/api/billing/webhook` → select events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` → Add → copy the **Signing secret** (`whsec_…`).
5. Settings → Billing → **Customer portal**: enable; allow cancel, switch plan (both prices), update payment method; save.
6. Optional: Settings → Tax → enable Stripe Tax and set `STRIPE_TAX=1`.
7. In Terminal (paste the real values):
   ```
   cd ~/Downloads/slotgauge
   gh secret set STRIPE_SECRET_KEY -b "sk_test_…"
   gh secret set STRIPE_WEBHOOK_SECRET -b "whsec_…"
   gh variable set STRIPE_PRICE_YEAR -b "price_…"
   gh variable set STRIPE_PRICE_MONTH -b "price_…"
   gh workflow run deploy.yml; sleep 15; gh run watch
   ```
8. Test with card `4242 4242 4242 4242`, any future date, any CVC. The account menu should switch to "SlotGauge Pro · yearly" within a few seconds (webhook). Then repeat steps 3–4 in **Live mode** and set the secrets again.

## Google Play
Play requires Google Play Billing for subscriptions bought inside the Android app. Until that is added (androidbrowserhelper billing + Digital Goods API), the Android build hides the purchase buttons; subscriptions bought on the website still unlock Pro in the app because entitlement is on the Google account.
