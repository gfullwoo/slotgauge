# Android app and home-screen widgets

`android/` is a small native wrapper: it opens slotgauge.com full-screen as a Trusted Web Activity (Chrome under the hood, so the mic, camera, sign-in and offline cache all work exactly like the installed PWA) and adds two home-screen widgets:

- **Tide (1×1)** — wave icon with an up/down arrow, "Rising"/"Falling" and the next high or low ("High 3:14p"). Tap → the tide view.
- **Tide + Say it (2×1)** — the same, plus the station name and a microphone button that opens SlotGauge already listening (`/?voice=1`).

Widgets refresh every 30 minutes (WorkManager) from `/api/tides`, follow the phone's last known location (nearest NOAA station, reference stations preferred), or can be pinned to any station: long-press the widget → **Reconfigure** (or tap it when first added) → search a town/pier/inlet, or **Follow my location**.

## Building (GitHub Actions)

The `Build Android app` workflow (`.github/workflows/android.yml`) builds on every push that touches `android/`, and on demand (Actions → Build Android app → Run workflow). Download the `slotgauge-apk` artifact; `cert.txt` inside it has the signing fingerprint.

- Without signing secrets it produces a **debug** APK (installable by sideloading; the certificate changes if the runner's debug keystore changes).
- For a stable signature (needed for the full-screen Trusted Web Activity and for Play), create a keystore once and add these repository secrets: `ANDROID_KEYSTORE_B64` (base64 of the .jks), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The workflow then builds a signed **release** APK.

## Full-screen (Digital Asset Links)

Chrome only hides its toolbar when the site vouches for the app. Put the certificate's SHA-256 fingerprint (from `cert.txt`) into the repository variable `ANDROID_CERT_SHA256` (several fingerprints separated by `|`), push or re-run Deploy, and `https://slotgauge.com/.well-known/assetlinks.json` starts serving it. Until then the app still works, just with a slim Chrome bar at the top.

## Web pieces used by the app

- `/?voice=1` starts the microphone on load; `/#tides` opens the tide view.
- `manifest.webmanifest` `shortcuts` give the same two actions to the installed PWA (long-press the icon).
- `/api/tides/stations` and `/api/tides` feed the widgets.
