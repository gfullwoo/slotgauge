# Working on SlotGauge

## Keep the README current — every change, same commit

`README.md` is the only description of this project anyone reads first. It must never describe a version of
SlotGauge that no longer exists. Before committing, check whether the change touched any of these, and update
the matching README section in the *same* commit:

| If the change… | Update |
|---|---|
| adds or alters a feature | the **Features** table (and say which plan it is on) |
| adds, renames or removes an HTTP route | the **API** block — a test enforces this, it will fail otherwise |
| adds an environment variable or feature flag | the flag table under **Deploy** |
| adds an npm script | the **Develop** block |
| changes the overlay/raw/audit data shape | **How the regulation data works** and the schema sample |
| changes regulation data for any state | run `npm run readme` (the coverage table is generated; a test fails if stale) |
| adds a state | coverage table, **Adding a state**, and the Caveats audit list |
| changes what the app does *not* cover | **Caveats** — an overstated claim here is worse than a missing feature |

`npm test` enforces the mechanical parts: the coverage table must match the data, every state must be named,
and every `/api/*` route in `server.js` must appear in the README. The prose parts are on you.

## Never overwrite a file you did not just read from this repo

The worst outage this project has had was not a bug. `3153a4e` replaced `public/index.html` with a
copy from a sandbox clone that had no git remote and sat several commits behind. ~215 lines vanished
— the location override system, the theme picker, the moon/catch-log/Best-Windows styles, and the
script tags for `log.js` and `species.js`. Tests passed, the deploy went green, and the features were
simply gone in production for two days.

- Build patches against **this** checkout, never a copy held elsewhere. A clone with no remote drifts
  and cannot be trusted as a base.
- `git diff HEAD -- <file>` before every commit, and **read the removed lines**. If a change meant to
  add a feature removes anything, stop.
- `test/integrity.test.js` enforces the mechanical half: every `public/*.js` must be loaded by
  index.html, a marker from each feature must still be present, and the file cannot shrink below 900
  lines. Removing a feature on purpose means deleting its line there in the same commit.

## Reproduce before diagnosing

When a user reports something missing, get evidence from the running system before offering a cause.
The dead-NOAA-station bug was diagnosed twice as a caching problem and twice the user was told to
clear a cache; the actual evidence — a 502 from one station id — was one fetch away the whole time.

## Other standing rules

- **Official sources only** for regulations: state `.gov` sites and the agency-contracted eRegulations digests.
  Never a forum, a fishing site, or recollection. Every value needs a verbatim quote and URL. See
  `docs/audit-brief.md`.
- **Never assert a verdict we are not sure of.** A species with a `review` entry or a changed `rawHash` must
  produce "check the rule" with a link, not a KEEP or RELEASE.
- **Never paste secrets into chat.** Have the user run `gh secret set NAME` interactively and paste at the prompt;
  `-b "$(pbpaste)"` fails because copying the command itself overwrites the clipboard.
- Give complete literal commands, with the `cd`, never placeholders or "…".
- `npm test` before every push. Tests must not need the network.
