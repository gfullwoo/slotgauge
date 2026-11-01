# New Jersey (NJ) regulation audit — 2026-10-31

## Sources and how they were read

- dep.nj.gov marine "Seasons & Regulations" and freshwater pages contain no HTML tables; they link only to PDFs
  (2026 Marine Digest, Attention Anglers sheet, Recreational Seasons Summary Chart, 2026 Freshwater Digest).
- `curl` to dep.nj.gov and eregulations.com is blocked by the agent proxy (CONNECT tunnel 403), so no PDF could be
  downloaded for `pdftotext`.
- All values were read in the built-in browser from the publisher's HTML edition of the same 2026 digests on
  eregulations.com (linked from https://dep.nj.gov/njfw/digests/marine/ as "Publisher's Online 2026 New Jersey
  Marine Digest"). eregulations.com is an allowed official source per the brief. Page "Last Updated" stamps:
  saltwater limits Oct 5 2026; sharks/mollusks/finfish May 11 2026; freshwater limits/trout/baitfish Sep 23 2026;
  Delaware River / Greenwood Lake Mar 2 2026.

## Pages checked (17)

DEP: marine seasons-and-regulations, digests/marine, fishing/freshwater, freshwater/regulations-and-permits.
eRegulations saltwater: index, State Size & Possession Limits, Sharks, Mollusks & Crustaceans, Finfish Regulations,
Striped Bass Bonus Program.
eRegulations freshwater: index, Size/Season/Creel Limits, Trout Fishing Regulations, Delaware River, Greenwood Lake,
Baitfish (incl. turtle/frog), Summary of Fishing Regulations.

## Counts

- Species/rules printed on source (incl. group rows and named members): ~75 distinct names.
- Already present and matching: 27 rows (all 21 marine finfish rows incl. 5 striped bass zones, 3 fluke zones;
  lobster, blue crab, hard clam, Atlantic sturgeon; walleye, channel catfish, crappie, muskellunge).
- Added: 27 rows — marine: Shortnose Sturgeon, Horseshoe Crab, Atlantic Herring (bait), Shellfish aggregate group,
  Eastern Oyster, 8 shark rows (Aggregated Large Coastal, Hammerhead, Non-Blacknose Small Coastal, Blacknose,
  Pelagic, Smoothhound, Shortfin Mako, Prohibited species); freshwater: Striped Bass (fresh waters), Redfin
  Pickerel, Tiger Musky, Yellow Perch, American Eel (fresh waters), Protected native species group, Potentially
  Dangerous Fish group, Freshwater Baitfish group, Brook Trout, Brown Trout, Rainbow Trout, Lake Trout,
  Landlocked Atlantic Salmon, Alewife/Blueback Herring (freshwater lakes).
- Corrections filed: 22 (mostly missing zones: Delaware River, Greenwood Lake, Lunker Bass Lakes, Northern Pike
  C&R waters, Raritan River hybrid slot, Striped Bass bonus zone, NOAA federal-waters deferral for black sea bass
  and summer flounder, group-row aliases for Sunfish and Perch / Sharks / Trout, hard clam 150 aggregate wording).
- Printed but not added: 38 entries (already present, group members covered by aliases, or non-fish: diamondback
  terrapin, sea turtles, snapping turtle, bull/green frog).

## Unsure / needs a human look

1. Shark minimum size: the digest table says 54" FL for "all other retainable sharks" but the text says no state
   minimum for non-blacknose small coastal and blacknose sharks (federal 54" for blacknose/finetooth). Both recorded.
2. Hickory shad on the Delaware River: freshwater page says Closed, marine table allows 6 shad in "Delaware River &
   tributaries". Presumably tidal vs non-tidal; the digest does not say so.
3. American shad: freshwater table "Delaware River Mainstem" vs marine "Delaware River & tributaries".
4. Snapping turtle (Jul 15–Oct 31, 13" curved carapace, 1/day, consumption only) and bull/green frog (15 combined)
   are printed with limits but are not fish; left out pending a schema decision.
5. Striped Bass Bonus Program (24" to <28", 1 per permit, May 15–Dec 31) filed as a correction adding a `bonus`
   zone rather than a duplicate species row.
6. Trout special-regulation waters are extensive (TCAs, C&R areas, 40+ wild trout streams, trophy/holdover lakes);
   stream-by-stream lists were summarized in zone labels, not enumerated individually.
7. The DEP PDFs (primary registered sources) were not re-verified this pass because of the proxy block; the HTML
   edition is the same digest content but dates/values should be spot-checked against the PDF when curl works.
