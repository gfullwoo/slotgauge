# Google Play listing — SlotGauge

## App name (30)
SlotGauge: Is it a keeper?

## Short description (80)
Say, snap or type your catch. Keep or release by today's state rules, plus tides.

## Full description (4000)
<!-- Rejected 2026-11-04 under the Misleading Claims policy: "Missing Source Link for Government
     Information". An app that relays government information must name the official source and say
     plainly that it is not a government app. Both are now in the description below — do not remove
     the PLEASE NOTE block or the per-state source links, and keep claims hedged ("that your state
     publishes", not "the exact ... official regulations"). 3,504 of 4,000 characters. -->
Caught a fish and not sure if you can keep it? Tell SlotGauge what you caught — say it, snap a photo, or type it — and get a clear KEEP or RELEASE answer with the size limit, season and daily limit that your state publishes.

PLEASE NOTE
SlotGauge is an independent app. It is not a government app, is not affiliated with, endorsed by or operated by any state or federal agency, and does not provide official government services. It summarises publicly available fishing regulations for quick reference. The official agency source for every state is linked below and on every answer in the app. Always confirm with that source before keeping a fish.

WHAT IT DOES
• Say it: "twenty-two inch striper in the bay" — the mic turns itself off when you stop talking.
• Snap it: take a photo and SlotGauge identifies the species.
• Type it: species, length and where you are.
• Answers use today's date, your zone (ocean, bay, river, inland) and the current season, slot and bag limits.
• Shows the agency's own wording and a link straight to its source page.

STATES COVERED AND THEIR OFFICIAL SOURCES
Saltwater and statewide inland rules. SlotGauge picks your state from your location, or choose any state to plan a trip. Every rule in the app is taken from these official agency pages and rechecked against them automatically:

• Delaware — DNREC Division of Fish & Wildlife: https://dnrec.delaware.gov/fish-wildlife/fishing/
• New Jersey — NJDEP Fish & Wildlife: https://dep.nj.gov/njfw/fishing/marine/seasons-and-regulations/
• Maryland — Maryland DNR Fishing & Boating Services: https://dnr.maryland.gov/fisheries/pages/regulations/changes.aspx
• Virginia — Virginia Marine Resources Commission: https://webapps.mrc.virginia.gov/public/reports/swrecfishingrules.php
• North Carolina — NC Division of Marine Fisheries: https://www.deq.nc.gov/about/divisions/marine-fisheries
• South Carolina — SC Department of Natural Resources: https://saltwaterfishing.sc.gov/rulesandregs.html
• Georgia — Georgia DNR Coastal Resources Division: https://coastalgadnr.org/limits
• Florida — Florida Fish and Wildlife Conservation Commission: https://myfwc.com/fishing/saltwater/recreational/
• New York — New York State DEC: https://dec.ny.gov/things-to-do/saltwater-fishing/recreational-fishing-regulations
• Connecticut — CT DEEP: https://portal.ct.gov/deep/fishing/saltwater-fishing-guide/species-regulations

TIDES
A tide badge at the top shows whether the tide is rising or falling and when the next high or low is. Tap it for a 48-hour chart, highs and lows, and any NOAA station in the country — your nearest one by default, or search a town, pier or inlet to plan travel. Tide predictions come from NOAA CO-OPS: https://tidesandcurrents.noaa.gov/

HOME-SCREEN WIDGETS
• Tide (1×1): rising/falling arrow and the next high or low, refreshed automatically.
• Tide + Say it (2×1): the same plus a microphone button that opens SlotGauge already listening.
Long-press a widget to pin it to any tide station.

ALSO
• Species guides for every regulated fish in each state, with photos and background.
• Works offline with the last saved regulations.
• Optional Google sign-in to keep a gallery of your catches.
• No ads, no tracking, no selling of data.

SlotGauge simplifies regulations for quick checks and can be out of date or incomplete. The state agency's current fishing guide governs, and gear, licence and area rules also apply. This app is not legal advice and is not a substitute for the official regulations.

## Category
Sports (or Maps & Navigation)

## Contact
Email: greg.fullwood@gmail.com · Website: https://slotgauge.com · Privacy policy: https://slotgauge.com/privacy/

## Data safety form (answers)
- Collects data: Yes.
- Location → Approximate and precise location: collected, optional, App functionality (resolve the
  state, nearest tide station, local forecast), not shared.
  **Processed ephemerally: NO.** The lookups themselves keep nothing, but a Pro catch logged with
  "Use my location for conditions" ticked stores its coordinates on the catch record
  (`cleanCatch` keeps lat/lon and `makeCloudCatches.add()` writes them to Firestore). Answering
  "yes, ephemeral" here would be a false declaration. Disclosed in the privacy policy under
  "Catch log (Pro)".
- Photos and videos → Photos: collected (user-initiated), optional, App functionality; stored only
  for signed-in users who save a catch; user can request deletion.
- Audio → Voice or sound recordings: NOT collected by the developer (speech is processed by the
  device/browser speech service; only text reaches the app). If reviewers push back, declare
  "Audio: ephemeral, app functionality, optional".
- Personal info → Name, Email address, User IDs: collected only when the user signs in with Google;
  App functionality / account management; user can request deletion.
- Data encrypted in transit: Yes (HTTPS). Deletion request mechanism: email in the privacy policy.
- No data shared with third parties for advertising. Third-party processors: Google Cloud (hosting,
  Vertex AI), Anthropic (photo identification fallback), Firebase Authentication.

## Content rating questionnaire
Utility/productivity app, no user-generated content shared publicly, no violence, no gambling → "Everyone".

## Permissions to declare
INTERNET, ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION (for nearest tide station and state). Camera and microphone are used by the web content through Chrome, not declared by the app.

## Assets (android/play/assets)
- icon-512.png (512×512, 32-bit PNG)
- feature-graphic.png (1024×500)
- phone screenshots: screenshots/*.png (1080×2340)
