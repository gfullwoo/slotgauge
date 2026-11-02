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
