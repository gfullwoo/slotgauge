# Virginia (VA) regulation audit — 2026-10-31

## Pages checked (21)

Saltwater (VMRC)
- https://webapps.mrc.virginia.gov/public/reports/swrecfishingrules.php — full recreational table (HTML, read in full)
- https://webapps.mrc.virginia.gov/public/reports/FinfishRegCardMay2026.pdf — 2026 Finfish Regulation Card (PDF, pdftotext)
- https://webapps.mrc.virginia.gov/public/reports/RecreationalFishingRegulationsApril2026.pdf — April 2026 regulations sheet (PDF)
- https://mrc.virginia.gov/regulations/VA-recreational-crabbing-rules.shtm — recreational crabbing
- https://mrc.virginia.gov/Regulations/VA-recreational-shellfish-non-HL-fish-gears.shtm — recreational shellfish / alternative gears
- https://mrc.virginia.gov/Regulations/spearfishing-rules.shtm — spearfishing restrictions
- https://mrc.virginia.gov/recreational/ — recreational hub (link enumeration)
- https://webapps.mrc.virginia.gov/vsrfdf/shark_links.php — shark ID page (links to fr490, which 404s)
- https://law.lis.virginia.gov/admincode/title4/agency20/chapter490/section20/ — shark species definitions
- https://law.lis.virginia.gov/admincode/title4/agency20/chapter490/section40/ — shark recreational limits
- https://law.lis.virginia.gov/admincode/title4/agency20/chapter110/section20/ and /section30/ — lobster size and prohibitions
- https://law.lis.virginia.gov/admincode/title4/agency20/chapter720/section40/ — 2026-27 public oyster season table

Freshwater (DWR)
- https://dwr.virginia.gov/fishing/regulations/ — regulations hub
- https://dwr.virginia.gov/wp-content/uploads/media/creel-and-length-limits.pdf — 2026 creel and length limit table (pp. 22-26, PDF)
- https://dwr.virginia.gov/fishing/trout/ , /season-and-limits/ , /special-regulation-trout-waters/ , /delayed-harvest-waters/
- https://dwr.virginia.gov/fishing/regulations/nongame/ — nongame fish and invertebrate limits

## Counts

| Metric | Count |
|---|---|
| Species/rows printed with a rule on the sources (group rows counted once) | ~85 |
| Already present in SlotGauge (values match) | 50 rows (audit-briefs/VA.md) |
| Added in additions.json | 27 |
| Corrections filed | 43 (touching 30 existing rows) |
| Printed but intentionally not added (citation-only, out of scope) | 11 groups (coverage.speciesOnSourceNotAdded) |

### Added (27)
Saltwater: Kingfish (Sea Mullet), Dolphin, Swordfish, Bluefin Tuna, Yellowfin Tuna, Bigeye Tuna, Wahoo, Sharks (large coastal group), Atlantic Sharpnose Shark, Bonnethead Shark, Sharks (blacknose & finetooth), Sharks (pelagic: blue/porbeagle/thresher), Dogfish (smooth & spiny), Sharks (recreationally prohibited; all 23 species in aliases), American Lobster.

Freshwater: Hybrid Striped Bass (Kerr/Claytor/Gaston/SML zones), Roanoke Bass, White Perch, Bowfin, Grass Carp, Common Carp, Nongame fish (no possession limit), Other nongame fish (20/day), Threatened and endangered fish / freshwater mussels (no possession), Hickory Shad, Southern Flounder (Back Bay), Crayfish.

### Most important corrections
1. Sharks (coastal species) (raw id 16) has no overlay.json entry; its "Season Closed May 15 - July 15" is applied to all sharks but the regulation closes only the large coastal group (blacktip, bull, hammerheads, lemon, nurse, spinner, tiger). Mako footnote is stale: shortfin and longfin mako are now prohibited (4VAC20-490-20, eff. May 1 2025; 2026 card agrees).
2. Alewife, Blueback Herring, American Shad, Sturgeon overlays have closed: false with empty bagNote although possession is prohibited; should be closed: true, bagNote "Possession prohibited".
3. King Mackerel alias "kingfish" collides with Virginia's printed "Kingfish (Roundhead)" = sea mullet (no limits). Remove.
4. Longnose Gar alias "bowfin" and Rock Bass alias "roanoke bass": DWR prints Bowfin and Roanoke Bass as their own rows (added).
5. Freshwater geographic exceptions are missing from the overlay for bass, striped bass (lake slots; Chowan-drainage no-possession), walleye, white bass, pike/pickerel, musky, trout (special-reg and delayed-harvest categories), crappie, sunfish, rock bass, perch, catfish (below-fall-line no limit; 1-over-32-inch blue cat rule). Each is filed with the verbatim DWR row.
6. Back Bay / North Landing River DWR rules for spotted seatrout (4/day), red drum (1/day 18-27), grey trout, American eel differ from VMRC rules; filed as added zones.
7. Oyster: the 2026-27 public season is now published (hand-tong areas generally Oct 1 2026 - May 31 2027; seaside by hand Nov 1 - May 31). Blue Crab: seaside Eastern Shore peeler is 3.25 in all season; pot seasons and sanctuary closures missing.

## Unsure / caveats
- Hickory shad: DWR defers Chesapeake-river limits to VMRC, but the VMRC recreational table prints no hickory shad row. Added with bag null for Chesapeake rivers; Chowan drainage 10/day is from DWR. Verify against 4VAC20-530.
- Lobster has no printed recreational bag number (size and Feb 1 - Mar 31 landing closure only).
- Trout special-regulation and delayed-harvest waters are ~60 named stream sections; modeled as categories (9-inch, 16-inch/2 fish, 20-inch/1 fish fly-only, catch-and-release, delayed harvest, Jackson tailwater, Moomaw, Smith River, South Holston) in the Trout correction, not one zone per stream.
- Official oyster table text contains typos ("May 32, 2027", "October 1, 2027, through May 31, 2027"); rows without typos were quoted.
- Potomac River mainstem/tributary rules belong to PRFC (prfc.us), not a Virginia agency domain; not fetched.
- Crevalle Jack and Pompano appear on the MRC table with tournament-citation sizes only (no regulation); not added.

## Fetch notes
- curl to webapps.mrc.virginia.gov and dwr.virginia.gov is proxy-blocked; all PDFs were fetched inside the Claude browser tab (fetch -> base64, chunked for the 1 MB DWR table) and decoded locally with pdftotext. All quotes are verbatim from page text or the PDF text layer.
- https://mrc.virginia.gov/regulations/fr490.shtm returns 404.
