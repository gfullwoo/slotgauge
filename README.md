# SlotGauge

**Keep or release?** Describe a fish by voice or text ("30 inch striper in the bay", "my 5th sea bass, 13 inches"),
or photograph it, and SlotGauge checks it against the current season, size and daily limits for the state you're
in, then shows the verdict with the official source behind it. Live at [slotgauge.com](https://slotgauge.com) and
on Google Play.

Every rule traces to an official state source — state agency sites (`*.gov`, `myfwc.com`, `coastalgadnr.org`) and
the agency-contracted eRegulations digests. Never a forum, never a fishing blog, never a model's recollection.

## Coverage

<!-- coverage:start -->
10 states, 836 species.

| State | Species | Official sources | Season | Full audit | Flagged for review |
|---|--:|--:|--:|---|--:|
| Delaware | 196 | 2 | 2026 | — | — |
| New Jersey | 62 | 16 | 2026 | 2026-10-31 | 17 |
| Maryland | 92 | 20 | 2026 | 2026-10-31 | 16 |
| Virginia | 75 | 15 | 2026 | 2026-10-31 | 31 |
| North Carolina | 120 | 29 | 2026 | 2026-10-31 | 21 |
| South Carolina | 106 | 17 | 2026 | 2026-10-31 | 17 |
| Georgia | 51 | 15 | 2026 | 2026-10-31 | 22 |
| Florida | 52 | 36 | 2026 | — | 2 |
| New York | 48 | 3 | 2026 | — | 1 |
| Connecticut | 34 | 4 | 2026 | — | — |
| **Total** | **836** | | | | **127** |

A species is *flagged for review* when an audit found our rule disagreeing with the official page, or two
official pages disagreeing with each other. A flagged species never gets a confident verdict: the checker
says "check the rule" and links the source. States without a full audit date have not yet been read
page-by-page against their official regulations, so they may still be missing species.
<!-- coverage:end -->

## Features

| | What it does | Plan |
|---|---|---|
| **Keep/release checker** | Parses a plain-language description (or voice input) and evaluates season, slot, minimum size and bag limit for the right state and zone. | Free |
| **Photo identification** | Camera or upload → Gemini/Claude vision picks the species from the state catalog → the normal check runs on the result. | 3/month free, then Pro |
| **Species directory** | `/<state>/species/` lists every regulated species with its limits, the official source and background from Wikipedia. Crawlable; one page per species. | Free |
| **Tides** | NOAA CO-OPS highs/lows and a 30-minute curve for ~3,500 stations, a header badge showing the current state of the tide, and station search. | Nearest station free; any station and the week ahead are Pro |
| **Weather** | National Weather Service current conditions, hourly and 7-day, beside the tide chart. The Ocean theme animates to match (rain, cloud, sun, storm). | Free |
| **Moon & solunar** | Phase, illumination, moonrise/set and the four solunar windows (moon overhead, underfoot, rise, set), computed locally — no API key. | Free |
| **Catch log** | Every logged fish is auto-stamped with the tide stage, moon phase, solunar window and weather at that moment. | Pro |
| **Best windows** | Reads your own log back: which tide stage, moon phase, time of day and wind you actually catch fish in, and which upcoming windows match. | Pro |
| **Android app** | Trusted Web Activity with 1×1 and 2×1 tide widgets and a microphone shortcut. | Free |

SlotGauge Pro is $19.99/year or $2.99/month through Stripe. Tides stay usable for free; the planning features are Pro.

## How the regulation data works

```
data/<st>/raw.json       official text, one row per species per zone, each row carrying its source quote
data/<st>/overlay.json    hand-reviewed machine-readable rules (seasons, slots, bags) keyed by raw id
data/<st>/audit/          full line-by-line audit output: additions, corrections, coverage report
data/sources.json         the registry: every official URL, per state, with its audit date
src/regs.js               merges raw + overlay into GET /api/regs and flags anything that changed
```

Each overlay entry stores a `rawHash` of the official text it was reviewed against. When the source wording
changes, the nightly/weekly jobs open a PR with the diff, the app shows a "wording changed, check the source"
note for that species, and `npm test` fails until the overlay is re-reviewed. A rule cannot silently go stale.

Delaware is scraped nightly from the DNREC Fish Facts species pages. The other states are extracted from their
digests and then hand-reviewed; see [docs/REGULATIONS.md](docs/REGULATIONS.md) for the three automated jobs and
[docs/audit-brief.md](docs/audit-brief.md) for the rules an auditor follows.

### Overlay schema

```jsonc
"93": {
  "name": "Black Sea Bass", "reviewed": "2026-09-20", "rawHash": "…",
  "aliases": ["sea bass", "bsb"],
  "status": "open",                      // open | closed | invasive
  "zones": [{
    "zone": "state",                     // state | federal | delriver | chesapeake | northofhatteras | …
    "seasons": [["05-01", "12-31"]],     // MM-DD windows, null = year-round; FIRST_SAT_APR / FIRST_SAT_MAR allowed
    "size": [{ "min": 12.5, "max": null, "from": "MM-DD", "to": "MM-DD" }],  // any rule satisfied = legal size
    "bag": 15, "bagNote": "", "sizeNote": "", "closed": false
  }],
  "notes": ["Measured snout to tail tip…"],
  "review": [{ "field": "size", "current": "…", "shouldBe": "…", "quote": "…", "sourceUrl": "…" }]
}
```

`review` entries come from an audit and force `needsReview`, so the checker answers "check the rule" instead of
asserting a verdict until a human resolves the discrepancy.

## API

```
GET    /api/regs?state=DE                      rules for one state
GET    /api/regs/review                        species whose official text changed since review, or that an audit flagged
GET    /api/states, /api/config, /api/health
GET    /api/me                                 account: Pro status, plan, renewal, photo-ID usage
GET    /api/quota                              anonymous photo-ID allowance (header x-sg-device)
GET    /api/sources                            freshness dashboard: every source, last checked / changed, audit date
GET    /api/locate?lat&lon                     which state's waters a point is in
POST   /api/identify   multipart image=…       photo → species (402 with {upgrade:true} when over the free quota)
GET    /api/scans · PATCH /api/scans/:id · DELETE /api/scans/:id · POST /api/scans/delete (bulk)
GET    /api/tides/stations?lat&lon|q|state  ·  GET /api/tides?station&date&days
GET    /api/weather?lat&lon
GET    /api/moon?lat&lon&days                  phase, moonrise/set, solunar windows
GET    /api/catches · POST /api/catches · DELETE /api/catches/:id      (Pro)
GET    /api/insights?lat&lon[&species]         your patterns + ranked upcoming windows (Pro)
POST   /api/billing/checkout · /api/billing/portal · /api/billing/webhook
```

Auth is Firebase Authentication (Google sign-in); the server verifies the ID token with firebase-admin. `/__/auth/*`
is proxied to Firebase so sign-in stays on slotgauge.com (needed for iOS Safari).

## Develop

```
npm ci
npm run dev          # http://localhost:8080 (plain checker)
npm run dev:fake     # + fake sign-in, fake identifier, in-memory photo store and catch log
npm test             # 83 tests, no network
npm run scrape       # refresh Delaware from DNREC (writes data/CHANGES.md if anything changed)
npm run review       # species whose official text no longer matches the reviewed overlay (exit 1 if any)
npm run watch-sources# fetch every registered source, diff against the last snapshot
npm run extract -- NJ# re-extract one state's raw.json from its cached source text
npm run species-info # refresh Wikipedia summaries into data/species-info.json
npm run readme       # regenerate the coverage table above (the test suite fails if it is stale)
```

## Deploy

`main` deploys to Cloud Run via GitHub Actions using Workload Identity Federation (no JSON keys).

1. `BILLING_ACCOUNT=… ./infra/setup-gcp.sh` (project defaults to `slotgauge`; needs `gcloud` logged in as project
   creator). Creates the project, enables APIs, the Artifact Registry repo, the deploy and runtime service accounts,
   and the WIF pool/provider restricted to this repo, then prints four values.
2. Add those as repository **variables**: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`.
3. Push to `main`. The workflow runs tests, builds, deploys (scale-to-zero, 512Mi) and smoke-tests `/api/health`.
4. Custom domain: `gcloud beta run domain-mappings create --service slotgauge --domain slotgauge.com --region us-east4`.

Feature flags are environment-driven and independent — with none set the app still runs as the plain checker:

| Variable | Turns on |
|---|---|
| `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `SCANS_BUCKET` | sign-in, photo ID, galleries |
| `GEMINI_ENABLED=1` / `ANTHROPIC_API_KEY` / `IDENTIFY_PROVIDER` | the vision identifier (Gemini on Vertex, Claude fallback) |
| `STRIPE_SECRET_KEY` + `STRIPE_PRICE_YEAR` (+ `STRIPE_PRICE_MONTH`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TAX`) | Pro subscriptions |
| `PRO_TEST_EMAILS`, `FREE_IDENTIFY_PER_MONTH` | reviewer accounts, free-tier size |
| `GOOGLE_CLOUD_PROJECT` | Firestore-backed accounts and catch log |
| `ANDROID_CERT_SHA256` | `/.well-known/assetlinks.json` for the Android app (fingerprints separated by `\|`) |

Android builds come from `.github/workflows/android.yml` (signed APK + AAB from the keystore secrets). See
[docs/ANDROID.md](docs/ANDROID.md) and [docs/PLAY.md](docs/PLAY.md).

## Adding a state

1. Register the official sources in `data/sources.json`, then extract into `data/<st>/raw.json`.
2. Audit it page-by-page per [docs/audit-brief.md](docs/audit-brief.md) and merge with `node scripts/merge-audit.mjs <ST>`.
3. Add overlay entries for every species with a real rule.
4. Add the state polygon to `public/index.html` (`STATE_POLYS`) so geolocation picks it.
5. `npm run readme` and `npm test`.

## Keeping this README current

The coverage table is generated — `npm run readme` rewrites it and `npm test` fails when it is stale, so the
numbers cannot drift from the data. Everything else is prose and needs a human: when a change adds a feature,
an endpoint, an environment variable or an npm script, update the matching section in the same commit.

## Caveats

Simplified for quick checks; the official source page linked on every species governs. Gear, license and
area-specific rules (spawning closures, designated trout streams, per-waterbody creel limits) are noted but not
always fully modeled. Florida, New York, Connecticut and Delaware have not yet had a full line-by-line audit, so
they may be missing species the state regulates. Not legal advice.
