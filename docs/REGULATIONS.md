# How regulations stay current

Every rule SlotGauge shows traces back to an official state source, and three automated jobs make sure
they don't go stale. Nothing changes what users see without a human merging it.

## The sources

`data/sources.json` is the registry: one entry per state, listing only official URLs (state `.gov`
sites, `eregulations.com` — the digest publisher contracted by Maryland DNR — and `myfwc.com`, Florida's
agency domain). A test fails if anyone adds a non-official host. Each state records the `season` year its
live data was captured for.

| State | Live data | Primary source |
|---|---|---|
| Delaware | `data/dnrec_raw.json` + `data/overlay.json` | DNREC Fish Facts species pages (scraped nightly) |
| New Jersey | `data/nj/raw.json` (after extraction) | NJ Marine Digest PDF, annual edition |
| Maryland | `data/md/raw.json` | eRegulations Atlantic + Chesapeake Bay tables |
| Virginia | `data/va/raw.json` | VMRC recreational rules page |
| Florida | `data/fl/raw.json` | FWC saltwater recreational regulations |
| New York | `data/ny/raw.json` | NYSDEC recreational saltwater regulations |
| Connecticut | `data/ct/raw.json` | CT DEEP species regulations |

## Job 1 — nightly Delaware scrape (`refresh-regs.yml`)

Re-reads every DNREC species page. If any season/size/limit text changed it opens a pull request with the
diff and lists which hand-reviewed overlay rules are affected. Tests fail until the overlay is updated, so a
changed rule can't ship half-reviewed.

## Job 2 — weekly source watcher (`watch-sources.yml`)

Mondays, plus every January 2. Fetches every URL in the registry (PDFs are converted to text), strips
navigation, hashes the text, and compares with the last snapshot committed in `data/source-text/`. It opens
or updates a GitHub issue titled **"Regulation sources need review"** when:

- an official source's text changed (the issue carries the added/removed lines);
- a state's `season` is behind the calendar year (annual review due);
- a source could not be fetched (moved page, new PDF name).

Annual PDFs use a `urlPattern` with `{year}`, so on January 2 the watcher looks for next year's digest
automatically and says so if it isn't published yet.

## Job 3 — extraction (`npm run extract -- NJ`)

For non-Delaware states the source is prose or a PDF, so a model (Gemini on Vertex, or Claude) converts the
cached source text into the common schema, one row per species per zone, each row carrying the exact
sentence it came from. Output goes to `data/<state>/raw.json`. Every row is `needsReview` until a human adds
an `overlay.json` entry with the parsed season windows, size rules and bag limit — until then the site shows
the text exactly as printed and the checker says "check the rule" instead of guessing KEEP.

## Annual checklist (per state, when the issue says "Annual review due")

1. `npm run watch-sources` — confirm the new edition is fetched (or fix the URL in `sources.json`).
2. `npm run extract -- <STATE>` — regenerate `raw.json`; read the git diff, species by species.
3. `npm run review` (Delaware) / update `data/<state>/overlay.json` for rows whose printed text changed.
4. Bump `season` for that state in `data/sources.json`, run `npm test`, merge. The site's pages and the
   `/api/sources` freshness endpoint update on deploy.

`GET /api/sources` on the live site lists every source with its last checked / last changed dates, so
freshness can be verified without opening GitHub.
