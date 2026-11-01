# Georgia (GA) regulation audit — 2026-10-31

Sources: Georgia DNR 2026 Hunting & Fishing Regulations guide on eregulations.com (all pages
"Last Updated: August 27, 2026"), Coastal Resources Division pages (coastalgadnr.org), and the
gadnrle.org shrimp/crab/shellfish page. Read with the built-in browser (page text + DOM extraction
of the CRD accordion `<dl>` blocks).

## Pages checked (16)

eRegulations (digest index + every page that prints a season, size or limit):
- /georgia/fishing/ (index — enumerated all 26 sidebar links)
- finfish-seasons-limits-sizes (saltwater table incl. sharks, billfish)
- game-species-daily-limits (freshwater game fish)
- general-regulations (freshwater seasons, length limits by lake/river)
- trout-fishing (delayed harvest, artificial-only, Waters Creek / Noontootla / Dukes Creek)
- agreements-with-bordering-states (GA–SC, GA–AL, GA–FL, GA–NC reciprocal limits)
- public-fishing-areas (PFA default limits + per-PFA slots)
- fishing-methods (bait/nongame gear limits, noodling species)
- recreational-fishing (landing, gear, shark hook rules, 2027 endorsement)
- georgia-saltwater-fish (ID plates; list of harvestable shark species)
- shrimp-crab-shellfish-bait-minnows (incl. whelk, stone crab, bait minnows)

CRD / LE:
- coastalgadnr.org/limits (27 accordion species, expanded via DOM)
- coastalgadnr.org/RedDrum
- coastalgadnr.org/HMS (defers to NOAA)
- coastalgadnr.org/Shellfish/Recreational (oyster/clam season)
- gadnrle.org/shrimpregs

Index pages with no limits (not enumerated further): definitions, fish consumption guidelines,
contact info, commissioner's message, DNR, handling & releasing fish, license requirements/fees,
saltwater gamefish records, boating, trout streams by county, freshwater fish ID, freshwater records.

## Counts

| Metric | Count |
|---|---|
| Distinct species/groups printed with a rule across all pages | ~58 (incl. 22 prohibited sharks, 8 harvestable shark species, 8 sunfish members) |
| Already present in SlotGauge (raw ids 1–38) | 38 rows (36 with overlay) |
| Already present with values matching | 30 |
| Species added (`species`) | 14 |
| Corrections filed | 27 |
| Printed but intentionally not added | 5 (whiting, individual harvestable sharks, nongame bait fish, turtles, tuna/swordfish) |

### Added (14)
Billfish; Hammerhead Sharks; Shortfin Mako Shark; Prohibited Sharks (22 members in aliases);
Largemouth Bass; Shoal Bass; Spotted Bass; White Bass; Hybrid Striped Bass; Lake Sturgeon;
Grass Carp (PFA release rule); Whelk (conch); Stone Crab (printed as unregulated); Bait Minnows
(saltwater, 2 qt).

### Most important corrections
1. **Red Drum** — overlay already applies 3 fish / 15–23 in. CRD says the current rule is 5 fish,
   14–23 in TL; the 3 fish / 15–24 in rule takes effect **Jan 1, 2027**. Date-switch the zone.
2. **Oyster** — CRD: closed June 1 – Sept 30 every year. Current data says year-round.
3. **Bluefish** — CRD prints season "May 1 - Feb. 28 annually"; eRegulations prints "All year". Conflict.
4. **Gag Grouper** — CRD prints 25" TL; eRegulations prints 24 TL. Conflict.
5. **Sharks (other)** (raw id 17) and **Striped Bass / Savannah River** (raw id 23) have **no overlay
   entry** (no zones, no aliases). Hammerheads (78 FL) and shortfin mako (83 FL, federal quota)
   should be split out of the Sharks (other) size string.
6. **Striped Bass** — missing zones: coastal rivers (2 @ 22 in), Lake Russell (2, one >34), Hartwell/
   Clarks Hill (10, three >26), and the May 1 – Oct 31 closure on the Flint/Chattahoochee/Spring Creek.
7. **Black Bass** — largemouth 12 in statewide / 14 in on listed lakes / shoal 15 in / Lindsay Grace
   slot / PFA 5 @ 14 in are all missing (overlay has no size). Group aliases missing Altamaha,
   Bartram's, Chattahoochee, Coosa, Suwannee, Tallapoosa, redeye.
8. **Sunfish / Pickerel / Shad / Walleye** aliases missing printed members (flier, redear, rock bass,
   spotted sunfish, shadow bass; grass/redfin pickerel; American/hickory shad; sauger).
9. **Trout** — Waters Creek 22/18 in, Noontootla 16 in, Dukes Creek no-possession, delayed-harvest
   C&R Nov 1 – May 14, GA–SC border 5 fish.
10. **Shrimp** — seine food-shrimp limit (24 qt / 15 qt tails) missing; season window is set yearly.
11. 2027 **Reef & Migratory Fish Endorsement** note for the nine listed species.

## Things I was unsure about
- Bluefish season and gag size conflicts between the two official sources: filed as corrections
  with the CRD text and flagged, rather than choosing one.
- eRegulations prints the shark limit cell merged across three rows; "1 per angler or boat,
  whichever is less" was attributed to hammerheads and shortfin mako on that basis (CRD's single
  "Sharks (other than...)" entry includes the mako size, which supports this).
- CRD's limits page omits a hammerhead row entirely; the 78 FL value comes from eRegulations only.
- Stone crab is printed as unregulated with a recommendation; included as a "No limit" row per the
  brief's explicit-no-limit rule.
- Grass carp is printed only as a PFA release rule; modeled as a PFA-zone closed row.

## Unfetchable
- https://coastalgadnr.org/ShellfishHarvest → 404. Used https://coastalgadnr.org/Shellfish/Recreational.
- Federal SAFMC / NOAA HMS pages were not opened (non-state sources); the state's printed links are
  recorded in notes.
