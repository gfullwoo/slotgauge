# SlotGauge

Keep or release? Describe a fish by voice or text ("30 inch striper in the bay", "my 5th sea bass, 13 inches") and SlotGauge checks it against the current Delaware season, size, and daily limits and gives a verdict with the source.

Regulations come only from the official state source, the DNREC Fish Facts species pages (https://fishspecies.dnrec.delaware.gov/), re-scraped nightly.

## How it works

```
data/dnrec_raw.json   <- nightly scrape of every DNREC species page (season / size / limit text)
data/overlay.json     <- hand-reviewed, machine-readable rules for the ~100 species that have real limits
src/regs.js           <- merges the two into GET /api/regs; flags anything DNREC changed since review
public/index.html     <- the app (PWA, offline-capable): parses the description, evaluates, shows verdict
```

Each overlay entry stores a `rawHash` of the DNREC text it was reviewed against. When DNREC changes the wording, the nightly job opens a PR with the diff, the app shows a "wording changed, check the source" note for that species, and `npm test` fails until `overlay.json` is re-reviewed. That keeps a rule from silently going stale.

### Overlay schema

```jsonc
"93": {
  "name": "Black Sea Bass", "reviewed": "2026-09-20", "rawHash": "…",
  "aliases": ["sea bass", "bsb"],
  "status": "open",                      // open | closed | invasive
  "zones": [{
    "zone": "state",                     // state | federal | delriver | nanticoke | becks | tidal | nontidal | streams | ponds | flyonly | vessel
    "seasons": [["05-01", "12-31"]],     // MM-DD windows, null = year-round; FIRST_SAT_APR / FIRST_SAT_MAR allowed
    "size": [{ "min": 12.5, "max": null, "from": "MM-DD", "to": "MM-DD" }],  // any rule satisfied = legal size
    "bag": 15, "bagNote": "", "sizeNote": "", "closed": false
  }],
  "notes": ["Measured snout to tail tip…"]
}
```

## Photo identification and galleries

Signed-in users can take or upload a photo. The server downsizes it, asks Claude (vision) to pick the species from the DNREC catalog, stores the photo privately in Cloud Storage and the record in Firestore, and the app runs the normal keep/release check on the result. The gallery groups every photo by species; users can correct a species, add a length, re-check on a later date, or delete.

```
POST   /api/identify   multipart image=<file> source=camera|upload   -> {scan, species}
GET    /api/scans                                                      -> {scans, groups}   (grouped by species)
PATCH  /api/scans/:id  {speciesId?, lengthIn?, verdict?, verdictText?, note?}
DELETE /api/scans/:id
GET    /api/me, GET /api/config
```

Auth is Firebase Authentication (Google sign-in); the server verifies the ID token with firebase-admin. `/__/auth/*` is proxied to Firebase so sign-in stays on slotgauge.com (needed for iOS Safari).

Local end-to-end without any cloud services: `npm run dev:fake` (fake sign-in, fake identifier that always says Black Sea Bass, in-memory photo store).

Setup: `ANTHROPIC_API_KEY=sk-ant-… ./infra/setup-scans.sh`, then the Firebase console steps it prints, then add the `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `SCANS_BUCKET` repository variables. Each feature is independent: with no variables set the app still runs as the plain checker.

## Develop

```
npm ci
npm run dev          # http://localhost:8080 (plain checker)
npm run dev:fake     # checker + fake sign-in/identify/gallery for UI work
npm test
npm run scrape       # refresh data/dnrec_raw.json from DNREC (writes data/CHANGES.md if anything changed)
npm run review       # list species whose DNREC text no longer matches the reviewed overlay (exit 1 if any)
```

## Deploy

`main` deploys to Cloud Run via GitHub Actions using Workload Identity Federation (no JSON keys).

1. `BILLING_ACCOUNT=… ./infra/setup-gcp.sh (project defaults to `slotgauge`)` (needs `gcloud` logged in as project creator). It creates the project, enables APIs, creates the Artifact Registry repo, the deploy and runtime service accounts, and the WIF pool/provider restricted to this repo, then prints four values.
2. Add those as repository **variables**: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`. Create a `production` environment (optional: require a reviewer).
3. Push to `main`. The workflow runs tests, builds the image, pushes to Artifact Registry, deploys to Cloud Run (scale-to-zero, 256Mi), and smoke-tests `/healthz`.
4. Custom domain: `gcloud beta run domain-mappings create --service slotgauge --domain slotgauge.com --region us-east4` and add the DNS records it prints.

Cost at hobby traffic is effectively $0 (Cloud Run free tier; Artifact Registry a few cents).

## Adding a state

1. Write a scraper for that state's official regulations page into the same raw shape (`id, h, n, f, season, size, limit`).
2. Add overlay entries for species with real rules.
3. Add the state polygon to `public/index.html` (`STATE_POLYS`) so geolocation picks it.

## Caveats

Simplified for quick checks; the DNREC page and the Delaware Fishing Guide govern. Gear, license, and area-specific rules (spawning-ground closures, designated trout streams) are noted but not fully modeled. Not legal advice.
