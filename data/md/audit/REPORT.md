# Maryland (MD) regulation audit — 2026-10-31

Sources: Maryland DNR Fishing Guide 2026 on eregulations.com (digest "Last Updated: September 16, 2026" on most limit pages), DNR regulation-changes page, DNR 2026-27 recreational crab limits public notice (PDF), and COMAR 08.02.05.29/.30 (linked from the digest for snapper/grouper/tilefish species lists). All pages read in the built-in browser with table text extracted verbatim; the PDF via WebFetch (curl is proxy-blocked for dnr.maryland.gov).

## Pages checked (23)

| Page | Result |
|---|---|
| eregulations.com/maryland/fishing/ (index/sidebar) | Enumerated all 37 section links |
| atlantic-seasons-sizes-limits | 26 printed rows; 2 missing (Shrimp, Shortnose Sturgeon) |
| chesapeake-bay-seasons-sizes-limits | 31 printed rows; 2 missing (Shrimp, Shortnose Sturgeon) |
| striped-bass | 4 tables; Susquehanna Flats table and "nontidal rivers closed" not in data |
| sharks | Whole table missing from data (8 group rows) |
| highly-migratory-species | No state limits printed; federal deferral row added |
| freshwater-seasons-sizes-limits | 20 printed rows; 7 missing; 1 season correction (Walleye) |
| youghiogheny-river-lake-seasons-sizes-limits | Entire table (17 rows) missing from data |
| bass-fishing | Slot-limit and catch-and-release bass areas — filed as correction |
| special-management-areas-trout | Brook/brown trout closures, trophy sizes, delayed harvest — added |
| put-and-take-trout-fishing-areas | 5/10 limit, brook = 0, Closure 1 Mar 8–28, 2026 — added |
| special-management-areas-all-species | No species limits (age-restricted and C&R impoundments only) |
| public-lakes-ponds | Location directory only, no limits |
| invasive-species | Snakehead no size/creel; illegal to possess live |
| bowfishing | Legal/illegal bowfishing targets; gar creel matches |
| freshwater-fishing-regulations | Gear/bait rules; crayfish head-removal rule; bait-species prohibitions |
| saltwater-fishing-regulations | Gear/bait rules; eel-as-bait closure dates; 15-lb fillet rule |
| oysters-clams | Oyster and hard clam match existing rows |
| blue-crabs-chesapeake-bay | Matches existing row |
| blue-crabs-atlantic | Existing Atlantic row is BLANK — correction filed |
| dnr.maryland.gov .../changes.aspx | Confirms 2026 red drum (3 fish, 26 in max), yellow perch (5), striped bass season changes already in digest |
| PN_RecCatchLimits_2026-27 PDF | Boat limits match existing Chesapeake crab row |
| COMAR 08.02.05.29 (regs.maryland.gov) | Full grouper (19) and "other" snapper-grouper (46) species lists; tilefish (3) |

## Counts

- Species/rows printed with a season, size, limit or closure across all pages: ~110 (counting group rows once per zone table).
- Already present with matching values: 56 rows in the existing MD list (see `coverage.speciesOnSourceNotAdded`, 41 entries incl. grouped ones).
- Added: 39 species entries (2 saltwater, 8 shark/HMS, 2 striped bass zone rows, 10 freshwater/trout, 17 Youghiogheny River Lake).
- Corrections: 16 (1 blank-row fill, 1 season error, 14 alias/notes/zone enrichments).

## Key findings

1. **Sharks were entirely absent.** Maryland prints an approved-harvest table (Atlantic sharpnose/bonnethead; 54-inch FL year-round group; 54-inch group closed May 15–Jul 15; hammerheads 78 inch closed May 15–Jul 15; smooth and spiny dogfish no limit) with a shore (1 per angler per day) vs vessel (1 per vessel per trip) limit, and a prohibited list (sandbar, dusky, sand tiger [new 2026], oceanic whitetip, shortfin mako, all unlisted). Modeled as group rows with every member in aliases, zones `shore`/`vessel`.
2. **Youghiogheny River Lake** has its own 17-row table with limits that differ from statewide (muskie 40 in, pike 24 in, pickerel 18 in, striped bass 20 in, American shad and river herring OPEN at 3 and 50/day, 50-fish panfish aggregate, trout 7 in with an 8 a.m. April 18 opener). All added with `(Youghiogheny River Lake)` suffix, zone `yough`.
3. **Blue Crab — Atlantic row is blank** in current data; page prints season Apr 1–Dec 31, 5 in hard / 3½ soft / 3¼→3½ peeler, mature females no minimum, 1 bushel (6 dozen) per person, 2 bushels (12 dozen) per boat.
4. **Walleye (nontidal)** season is not year-round: closed Mar 1–Apr 15 on Deep Creek Lake and the Youghiogheny below Rt 42.
5. **Brook trout** are release-only in all nontidal waters east of I-81, in the Savage River above the reservoir and in every Put-and-Take area — a statewide-scale rule the single "Trout" row hides. Added Brook Trout, Brown Trout (Beaver Creek closure, 18-inch trophy size) and a Trout special-areas row with Put-and-Take (5/10), Delayed Harvest (Group I Jun 1–Sep 30, Group II Jun 16–Sep 30), Catch-and-Return and Trophy zones.
6. **Striped bass**: the Susquehanna Flats / Lower Susquehanna / Northeast River table has no May harvest and is closed to all fishing Apr 1–May 31; nontidal rivers and streams are closed at all times. Both added as rows. 2026 adds "may not use striped bass as bait."
7. **Snapper/Grouper groups**: digest prints only group rows and links COMAR; aliases correction supplies all 19 grouper and 46 "other" species (incl. porgies, grunts, jacks, triggerfish, hogfish, spadefish).
8. **HMS**: Maryland prints no sizes/limits for tunas, billfish or swordfish — added one federal-deferral row pointing to NOAA HMS permits/reporting (new 24-hour electronic reporting effective Dec 22, 2025).
9. Missing simple rows: Shrimp (brown/white; no limit, both tidal tables), Shortnose Sturgeon (CLOSED, all tables), nontidal American Eel (9 in, 25/25), Baitfish incl. madtoms (35 aggregate), nontidal herring/shad/sturgeon/bivalves CLOSED, nontidal White Perch (no limit), nontidal snakehead.

## Uncertain / caveats

- Shark creel columns are rowspanned in HTML; interpreted as applying to every approved-species row (consistent with the footnote "from this list of approved species").
- Put-and-Take Closure 1 dates are 2026-specific (Mar 8–28) and shift annually; modeled as a wrapped open window 03-28→03-08.
- COMAR species lists come from regs.maryland.gov (the dsd.maryland.gov link the digest uses redirects there) — official state regulation text, not the digest itself.
- Pending DNR proposals (comment periods to Nov 2–13, 2026) that could change rows: Governors Bridge Pond / Waterworks Park Pond put-and-take, lower Savage River to catch-and-return, Owens Creek upper sections, white perch conservation measures, recreational gear (jugs/gigs/projectile).
- Nothing was unfetchable in the end; the crab PDF needed WebFetch rather than direct text extraction.
