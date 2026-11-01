# South Carolina regulation audit — 2026-10-31

Scope: SCDNR 2026-27 Rules & Regulations digest on eregulations.com (every sidebar page that prints a
season, size or limit), plus the SCDNR pages the digest links to (red snapper EFP page, shellfish
harvest page, the registered saltwaterfishing.sc.gov rules page).

## How pages were read

Direct `curl` to eregulations.com is blocked by the sandbox proxy, and WebFetch returned paraphrased
summaries and refused to reproduce table text verbatim. All pages were therefore read through the
built-in Browser pane (`get_page_text`), which returns the page's main-content text verbatim; every
`quote` in `additions.json` is copied from that text. Page "Last Updated" stamps were Aug 5-11, 2026.

## Pages checked (19)

Digest index, Finfish, Snapper-Grouper Complex, Billfish & Atlantic Tunas, Sharks, Crustaceans &
Shellfish, Crustacean & Shellfish Methods & Devices, General Information (saltwater), Freshwater Game
Fishing Regulations, Freshwater Fish Size & Possession Limits, Trout Size & Limits, Freshwater Nongame
Fishing Regulations, Nongame Methods & Devices, Shad & Herring, State Lakes, Aquatic Invasive Plants &
Animals; dnr.sc.gov/redsnapper; saltwaterfishing.sc.gov/rulesandregs.html;
saltwaterfishing.sc.gov/shellfishharvest.html.

Not opened: Nongame Device Limits by Location (gear/area table), licence/boating/FAQ pages, species
identification pages, PDF guides.

## Counts

| | Count |
|---|---|
| Distinct species / group rows printed with a rule across all pages | ~110 (79 already in data) |
| Already present and matching | 75 |
| Added in `additions.json` | 30 |
| Corrections filed | 16 |

### Added (30)

Sharks (6): Atlantic Sharpnose, Bonnethead, Sharks 1-per-vessel group (11 species as aliases),
Hammerhead Sharks (great/scalloped/smooth), Prohibited Sharks (22 species as aliases), Dogfish.

Billfish & tunas (11): Blue Marlin, White Marlin, Sailfish, Swordfish, Roundscale Spearfish, Longbill
Spearfish (prohibited), Albacore & Skipjack, Bigeye Tuna, Bluefin Tuna (defers to NOAA), Yellowfin
Tuna, Other Tunas (blackfin/bonita/little tunny).

Finfish page (3): Herring (with Savannah and Winyah Bay closed zones), Hybrid Striped Bass
(saltwater), Florida Pompano.

Snapper-grouper (1): "Other Snapper-Grouper Complex Species" 20-aggregate group row (lesser
amberjack, scup, almaco/bar jack, margate, four porgies, banded rudderfish, sailors choice).

Freshwater (6): Redeye (Bartrams) Bass, Redfin Pickerel, Blue Catfish (new 150/day law, with
Santee-Cooper 25/day and 2-over-32-inch zones), Hybrid Striped Bass (freshwater, 7 water-body zones),
Grass Carp (prohibited), Robust Redhorse (prohibited).

Other prohibitions (3): Sturgeon (Atlantic & Shortnose), Horseshoe Crab, native Freshwater Mussels.

### Snapper-grouper verification (rows added earlier today)

All 37 rows were compared against the live page. Sizes, state bags and federal closed-season windows
match for every row (gag open 05-01..08-01, black 05-01..12-31, red grouper 06-01..12-31, red porgy
05-01..06-30, wreckfish 07-01..08-31, golden tilefish 01-01..03-20, snowy 05-01..06-06, blueline
05-01..08-31, greater amberjack 05-01..03-31, scamp/yellowmouth/yellowfin/coney/graysby/hinds
05-01..12-31). Three numeric discrepancies filed as corrections:

- Scamp and Yellowmouth: federal-zone `bag` is 3; page says max 1 (scamp or yellowmouth, not both) in federal waters.
- Blueline Tilefish: federal-zone `bag` is 3; page says 2 in federal waters.
- Atlantic Spadefish: the 14-inch / 30-per-boat values are printed "(state waters)" only, but the overlay copies them into the federal zone and stores 30 as a per-person `bag`.

### Other corrections

- Red Snapper: add userNote for the SC Experimental Fishing Permit (EFP) season (Oct 2026 season ended; free GoOutdoorsSC permit, VESL trip declaration/reporting, descending device).
- White Bass: statewide rule excludes the Savannah River; lower Savannah is 27 in / 2 per day.
- Striped Bass (freshwater): coastal rivers, Santee system slot, Lake Murray/middle Saluda, Russell/Hartwell tailwater, Hartwell & Thurmond and lower Savannah each need their own zone (zones spelled out in the Hybrid Striped Bass (freshwater) addition).
- Largemouth / Smallmouth / Spotted Bass: Savannah-basin lakes (12 in / 10 combined), Lake Robinson, Slade's Lake zones missing.
- Trout: delayed-harvest streams (Nov 1 - May 14 catch-and-release, single-hook artificials), Lake Jocassee (15 in, one over 20, 3 fish Oct-May), Lower Saluda (one over 16 in; C&R section), Middle Saluda C&R and artificial-only waters missing.
- Walleye: label as "Walleye & Sauger".
- Crappie: no minimum size on SCDNR State Lakes.
- Shrimp: 12 dozen bait shrimp allowed per boat in the closed season.
- Oyster/Hard Clam: digest (Oct 1) and shellfishharvest.html (Sept 16) disagree on season start.
- Source `sc-dnr-rules` (saltwaterfishing.sc.gov/rulesandregs.html) is stale — still prints the 2018 red drum rule.

## Things I was unsure about

1. Hammerhead sharks: the digest row prints only "78-inch FL"; the bag cell is blank. Not filled from memory; row carries a "confirm with NOAA HMS" note.
2. Billfish and bigeye tuna rows print no bag number (federal HMS rules). Recorded as `bag: null`.
3. Bluefin tuna: SC prints no size/bag/season and points to NOAA's retention-limit bulletin; row is a "see NOAA" placeholder.
4. Herring season: General Information says saltwater nets have "No closed season ... (except shad and herring)" but no herring dates are printed anywhere; left `seasons: null` with area closures as closed zones.
5. SCDNR State Lakes: 18 lakes each with their own catfish (3/5/no limit), bass (2-5, some 16 in min) and bream (5-20) creels, open days and hours, plus closures (Dargan's Pond closed; Lake Edwin B. Johnson closed until July 1, 2027). This is a per-waterbody layer rather than species zones; not modelled here. Suggest a follow-up that stores the matrix once and attaches it to Catfish, black bass, Bream and Crappie rows.
6. Hickory shad: the shad limit is printed as "shad" (American and hickory); covered by the American Shad row — recommend adding a "hickory shad" alias rather than a new row.
7. Whelks: named only in a heading on the Methods & Devices page with the general shellfish season; no whelk-specific size or bag printed, so no row.
