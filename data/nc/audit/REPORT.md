# North Carolina regulation audit — 2026-10-31

## Pages checked (30)

Saltwater (NC DMF, deq.nc.gov / files.nc.gov)
- Recreational Size and Bag Limits (table effective Nov 1, 2026)
- Fisheries Management Proclamations index (all 6 pages enumerated; 90+ current proclamations listed)
- FF-45-2026 Snapper Grouper Complex – Recreational (Reg. Amendment 36, eff. Oct 28, 2026) — the current snapper-grouper proclamation
- FF-40-2026 Red Snapper limited season (Oct 9–11, 2026; superseded by FF-45-2026)
- FF-3-2026 Shark – commercial and recreational
- FF-1-2026 Bluefish rec; FF-24-2026 Black Sea Bass north of Hatteras; FF-8-2026 Shad; FF-30-2022 Dolphin vessel limit; FF-16-2026 Sheepshead; FF-10-2024 Weakfish; FF-18-2024 Scup; FF-4-2026 Cobia; FF-27-2026 Flounder; FF-31-2026 Spotted Seatrout
- Striped bass: FF-25-2023 (Atlantic Ocean slot), FF-19-2026 (CSMA Tar-Pamlico/Neuse April opening), FF-17-2023 (Albemarle close), DMF Striped Bass Recreational Fishing Information page (by management area)
- Shellfish/crustaceans: SF-1-2026 Oyster hand harvest, SH-4-2022 Shrimp cast net, M-7-2022 Spiny Lobster, SF-4-2024 Calico Scallop closure

Freshwater (NC WRC digest on eregulations.com)
- Index, Warm Water Game Fish Regulations, General Mountain Trout Regulations, Nongame Fish Size & Creel Limits, Nongame Fish Regulations, Other Fishing Regulations (species prohibitions), Inland Fishing Regulations

## Counts

| | |
|---|---|
| Species/rows printed on sources (incl. group rows) | ~125 |
| Already present and matching | 36 |
| Added (`additions.json` species) | 73 |
| Corrections filed | 19 |
| Printed but intentionally not added | 8 (catch-alls, HMS-only permit mentions, commercial-only proclamations) |

### What was added
- Snapper-grouper complex expanded from the placeholder into 41 real rows from FF-45-2026: 17 groupers (incl. 4 prohibited), greater amberjack, other jacks, bar jack, red snapper (prohibited), vermilion, hogfish, 8 other snappers, red porgy, other porgies, scup south of Hatteras, 3 tilefish, gray triggerfish, wreckfish, grunts, spadefish — each with state + federal zones, seasons, aggregates (10 snapper / 3 grouper-tilefish / 20 mixed), vessel limits, and gear rules in `userNotes`.
- Sharks expanded from the single placeholder into 10 rows from FF-3-2026 (sharpnose, bonnethead, hammerheads, LCS, pelagics, blacknose, finetooth, smooth dogfish, spiny dogfish, prohibited list of 23 species).
- Bigeye and bluefin tuna, sturgeon, calico scallop.
- Striped bass modeled by management area (Albemarle, Roanoke River, CSMA, CSMA Tar-Pamlico/Neuse April window, Cape Fear, inland impoundments) plus a Bodie bass (hybrid) row.
- Freshwater: Alabama bass, Bartram's bass, Roanoke bass, walleye, muskellunge, sauger, kokanee, bullheads, catfish (blue/channel/flathead with the 32-inch blue cat reservoirs), yellow perch, pickerel, grass carp, freshwater mussels/Asian clam, madtoms, crayfish (200 combined), and the WRC live-possession prohibited species list (snakehead, Asian carps, etc.).

### Corrections worth acting on first
1. **Oyster** — our row says closed; season OPENED Oct 15, 2026 (to Mar 31, 2027), 3" shell, 1 bushel/person, 2/vessel.
2. **Flounder** — our row shows the Sept 1–14 season; it is now closed (DMF prints UNLAWFUL TO POSSESS).
3. **Dolphin** — add 54-per-vessel cap; **Mullet** — add 400-per-vessel cap.
4. **Striped Bass "Internal coastal waters"** — split into the management areas (different slots and closures).
5. **American/Hickory Shad** — replace "(D)" placeholder with the FF-8-2026 10-fish aggregate and area sub-caps.
6. Freshwater nuance: rock bass east of I-77 (8", 2), largemouth/smallmouth/crappie water-specific rules, mountain trout Delayed Harvest / Catch-and-Release / Special Regulation classes, river herring 6-inch inland rule, white perch live-possession ban in the far west.

## Unsure / caveats
- PDFs on files.nc.gov are proxy-blocked for curl and CORS-blocked for in-browser fetch; they were read via WebFetch (quotes capped ~120 chars, so longer quotes are stitched from consecutive verbatim fragments joined with "...") and spot-checked visually with browser screenshots of FF-45-2026 pp. 1–2.
- FF-45-2026 prints the gag season as May 1 – Aug 1, 2026 although issued Oct 28; modeled as closed for the rest of 2026.
- Shark proclamation table: bonnethead season cell and the LCS/pelagic possession cell did not extract; limits were taken from items E/F and the footnote examples (1 sharpnose + 1 bonnethead per person, + 1 additional shark per vessel per day).
- Roanoke River striped bass season is set by WRC proclamation each spring and is not printed in the digest; zone is modeled closed until proclaimed.
- Mountain trout county-by-county water lists (Counties A–M / N–Z / Other Trout Waters) were not enumerated water-by-water; class rules and the two Special Regulation waters on the general page were captured.
- Group rows used only where the state prints a group rule (Other Jacks, Porgies Complex, grunts within the 20-fish aggregate, LCS/pelagic/hammerhead shark groups, bullheads, prohibited lists); every member is in `aliases`.
