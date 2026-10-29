# Tides

Tide predictions come from NOAA CO-OPS (free, no key). The header badge shows the current phase (rising/falling, animated wave, arrow) and the next high or low; tapping it opens the tide view with a 48-hour curve, highs/lows table, earlier/later day navigation and a station picker (search by name, browse by state, or use the device location).

- Station choice: a manually chosen station (`sg.tideManual`) wins; otherwise the nearest NOAA station to the device location (a reference station is preferred when it is within 6 miles of the closest one, because only reference stations publish a true curve); otherwise the last used station; otherwise a default per state.
- `data/tide-stations.json`: compact bundle of all ~3,500 NOAA tide-prediction stations (`[id, name, state, lat, lng, type, tzOffset, referenceId]`). The server refreshes it from NOAA in memory daily.
- `src/tides.js`: `makeTides()` → `nearest`, `search`, `byState`, `predictions(station, {date, days})` (highs/lows ±1 day around the window, 30-minute curve for reference stations, cosine-interpolated curve for subordinate stations), `phase`. Memory cache 6 h.
- API: `/api/tides/stations?lat&lon|q|state`, `/api/tides?station=ID[&date=YYYY-MM-DD][&days=2]` (feet above MLLW, station local time, `tz` IANA zone included).
- Front end: `public/tides.js` (badge + `#tideView`), styles in `index.html`, `showView('tides')` in `scans.js`. `/#tides` deep-links to the view.
