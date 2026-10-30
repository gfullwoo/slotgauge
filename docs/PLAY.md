# Publishing SlotGauge on Google Play

Everything the listing needs is in `android/play/` (copy in `listing.md`, graphics in `assets/`, release notes in `whatsnew/`). The `Build Android app` workflow builds the signed bundle and, once a Play service-account key is in the repo secrets, uploads every build to the track in the `PLAY_TRACK` repo variable (default `internal`).

## One-time setup

1. Developer account: https://play.google.com/console/signup — personal account, $25, identity verification (1–3 days). Use greg.fullwood@gmail.com (the same Google account as the GCP project keeps IAM simple).
2. Signing keystore + secrets (see docs/ANDROID.md "Optional, for the full-screen look"). Play rejects debug-signed bundles.
3. Create the app in Play Console: **Create app** → name `SlotGauge: Is it a keeper?`, App, Free, accept declarations.
4. Service account for uploads:
   - Google Cloud console → project `slotgauge` → IAM & Admin → Service Accounts → **Create service account** → name `play-publisher` → Done → open it → Keys → **Add key → Create new key → JSON** (downloads `slotgauge-….json`).
   - Play Console → **Users and permissions → Invite new users** → paste the service account email (`play-publisher@slotgauge.iam.gserviceaccount.com`) → App permissions: add SlotGauge → Account permissions: **Release to production, exclude devices, and use Play App Signing** + **Manage testing tracks** → Invite.
   - `gh secret set PLAY_SERVICE_ACCOUNT_JSON < ~/Downloads/slotgauge-….json`
5. First upload must be manual (Play needs one bundle before the API works): run the workflow (`gh workflow run android.yml; sleep 20; gh run watch`), download the `slotgauge-apk` artifact, and in Play Console → **Testing → Internal testing → Create new release** → upload `app-release.aab` → Next → Save → Review → Start rollout. After this, the workflow uploads automatically.

## Store listing (Play Console → Grow → Store presence → Main store listing)
- App name / short / full description: paste from `android/play/listing.md`.
- App icon: `android/play/assets/icon-512.png`. Feature graphic: `android/play/assets/feature-graphic.png`. Phone screenshots: the five files in `android/play/assets/screenshots/` (replace with real phone screenshots any time).
- Category: Sports. Contact email: greg.fullwood@gmail.com. Website: https://slotgauge.com. Privacy policy (Policy → App content): https://slotgauge.com/privacy/

## App content questionnaires (Policy → App content)
Privacy policy URL as above; Ads: No; App access: all functionality available without login (sign-in optional); Content rating: fill as a utility (Everyone); Target audience: 18+ (or 13+); Data safety: answers in `listing.md`; Government apps: No; Financial features: No; Health: No.

## Getting to production
New personal developer accounts must run a **closed test with at least 12 testers opted in for 14 continuous days** before applying for production access. Do it right away: **Testing → Closed testing → Create track** (name "Friends") → Testers → create an email list → add 12+ Gmail addresses → share the opt-in link they must tap. Set `gh variable set PLAY_TRACK -b "Friends"`-style only if you want builds to go there automatically; otherwise promote from Internal in the console. After 14 days: **Dashboard → Apply for production access**, answer the questions, then **Production → Create release** (promote the tested build) → review usually 1–7 days.

## Updating
Push changes under `android/` (or run the workflow). `versionCode` is the GitHub run number, so every build is newer than the last. Edit `android/play/whatsnew/whatsnew-en-US` for release notes.

## Digital Asset Links (full-screen)
After the first signed build, copy the SHA-256 from the workflow's "Signing certificate fingerprint" step into `gh variable set ANDROID_CERT_SHA256 -b "…"` and redeploy the site. If you turn on Play App Signing (default for new apps), Play re-signs the app with its own key: get that fingerprint from Play Console → **Setup → App signing → App signing key certificate → SHA-256** and add it too, separated by `|`.
