# State regulation audit — brief for auditors

Goal: SlotGauge must list **every** species that the state's official recreational regulations put a season,
size, bag/possession limit, gear restriction or prohibition on — saltwater finfish, freshwater game/pan fish,
sharks, highly migratory species as printed by the state, crustaceans, shellfish, and explicitly
"no limit" species when the state prints them in its tables. A missing species is a bug.

## Rules (non-negotiable)

1. **Official sources only.** State agency domains (`*.gov`, `dnr.sc.gov`, `myfwc.com`, `coastalgadnr.org`,
   `gadnrle.org`, `mrc.virginia.gov`, `dwr.virginia.gov`, `deq.nc.gov`, `dec.ny.gov`, `portal.ct.gov`,
   `dep.nj.gov`, `dnrec.delaware.gov`, `fishspecies.dnrec.delaware.gov`) and `eregulations.com` (the agency-
   contracted digest publisher). No forums, no FishRules, no blogs, no Wikipedia for regulations.
2. **Every value must carry a verbatim `quote`** from the page it came from and the `sourceUrl`. If you
   cannot fetch a page, say so in `issues` — never fill from memory.
3. **Enumerate the whole digest.** Start from the digest's table of contents / sidebar and open every page
   that lists limits: inshore, offshore, snapper-grouper / reef fish, sharks, HMS, freshwater, trout,
   crabs/shrimp/lobster, clams/oysters/scallops/whelks, bait species. List each page you checked in
   `coverage.pagesChecked`, and every species printed there that you did NOT add (with the reason) in
   `coverage.speciesOnSourceNotAdded` — the goal is that nothing printed is unaccounted for.
4. **Capture the nuance, don't flatten it.** If a rule differs by zone (state vs federal waters, a river
   system, north/south of a line, a county), by season, by vessel vs person, by gear, by aggregate
   (e.g. "10 snapper aggregate"), by slot vs minimum, or by "see proclamation", model it as separate `zones`
   and spell it out in `userNotes` in plain language an angler on a boat can act on. If a species is
   managed federally and the state defers ("see SAFMC/NOAA"), say exactly that and give the federal page the
   state links to.
5. **Compare against what we already have.** The current species list is in the brief you were given. Also
   check the existing rows for the species you can see: if a printed value disagrees with our data, file a
   `corrections` entry (don't edit raw/overlay yourself).
6. Group rows (e.g. "Sunfish", "Sharks (coastal species)") are acceptable only when the state itself prints
   a group rule. If the state prints a list of species under a group, add the group row AND put every
   member name in `aliases` so searches find it.

## Output: `data/<st>/audit/additions.json`

```json
{
  "state": "GA",
  "auditedOn": "2026-10-31",
  "sources": [
    { "id": "ga-sharks", "title": "GA DNR saltwater sharks limits", "url": "https://...", "type": "html", "role": "primary" }
  ],
  "species": [
    {
      "name": "Vermilion Snapper",
      "aliases": ["beeliner", "b-liner"],
      "habitat": "saltwater",            // saltwater | freshwater | shellfish
      "family": "Snappers",               // optional grouping word printed by the state, else ""
      "sourceId": "ga-sharks",            // must match an id in `sources` or an existing source id
      "sourceUrl": "https://...",
      "quote": "Vermilion snapper | 12\" TL | 5 per person",   // verbatim row/sentence
      "season": "Open year-round",        // printed season text, or "Possession prohibited"
      "size": "12 inch total length",     // printed size text, "None" if no size limit
      "limit": "5 per person per day",    // printed bag text
      "notes": "",                        // other printed conditions (gear, landing whole, aggregate)
      "zones": [
        { "zone": "state", "label": "GA state waters (to 3 mi)", "seasons": null,
          "size": [{ "min": 12, "max": null }], "bag": 5, "bagNote": "5 per person per day",
          "closed": false, "sizeNote": "12 inch total length" },
        { "zone": "federal", "label": "Federal waters (3–200 mi)", "seasons": [["05-01","08-01"]],
          "size": [{ "min": 12, "max": null }], "bag": 5, "bagNote": "5 per person per day",
          "closed": false, "sizeNote": "12 inch total length" }
      ],
      "userNotes": [
        "Counts toward the 10-fish snapper aggregate.",
        "Federal season can close early when the annual catch limit is met — check safmc.net."
      ]
    }
  ],
  "corrections": [
    { "existingName": "Black Sea Bass", "field": "limit", "current": "15", "shouldBe": "7 per person",
      "quote": "Black sea bass ... 7 per person per day", "sourceUrl": "https://..." }
  ],
  "coverage": {
    "pagesChecked": ["https://..."],
    "speciesOnSourceNotAdded": [ { "name": "Bluefish", "reason": "already present, values match" } ]
  },
  "issues": [ "Could not fetch https://... (403)" ]
}
```

Zone conventions: `seasons` is `null` for year-round, else a list of `["MM-DD","MM-DD"]` open windows
(a window may wrap the year, e.g. `["11-01","03-31"]`). `size` is a list of `{min,max}` in inches (slot =
both set; `max` only = "must be under"); empty list = no size limit. `bag` is the per-person number, `null`
when there is no numeric per-person limit, `0` is never used — a prohibited species is `closed: true` with
`bagNote: "Possession prohibited"`. `closed: true` means harvest is not allowed in that zone at all.
Zone keys: `state`, `federal`, or a short lowercase word for a named area (`chesapeake`, `atlantic`,
`northofhatteras`, `gulf`). Labels are what the user sees.

Also write `data/<st>/audit/REPORT.md`: pages checked, counts (printed / already present / added /
corrected), and anything you were unsure about.
