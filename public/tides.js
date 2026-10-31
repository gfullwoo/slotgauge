// Tides: header badge (rising/falling + next high/low at a glance) and the full tide view
// (48-hour curve, highs/lows, station picker for any region). Runs after index.html fires 'sg:ready'.
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'sg.tideStation', MANUAL = 'sg.tideManual';
  const DEFAULT_BY_STATE = { DE: '8557380', NJ: '8534720', MD: '8570283', VA: '8638863', NC: '8656483', SC: '8665530', GA: '8670870', FL: '8720218', NY: '8518750', CT: '8465705' };
  let station = null, data = null, shown = null, dayOffset = 0, timer = null, manual = false;

  const nice = (n) => String(n || '').replace(/\w\S*/g, (w) => (w.length > 3 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w)).replace(/\b(Nw|Ne|Sw|Se|N|S|E|W)\b(?=[ ,.]|$)/g, (m) => m.toUpperCase());
  const fmtT = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(ms)).replace(' ', '').replace('AM', 'a').replace('PM', 'p');
  const fmtD = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ms));
  const ymd = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const mins = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`);
  const geo = () => new Promise((res) => { if (!navigator.geolocation) return res(null); let done = false; const fin = (v) => { if (!done) { done = true; res(v); } }; setTimeout(() => fin(null), 8000); navigator.geolocation.getCurrentPosition((p) => fin(p.coords), () => fin(null), { timeout: 7000, maximumAge: 600000 }); });

  function phase(at = Date.now()) {
    if (!data) return null;
    const hl = data.around || data.hilo;
    const next = hl.find((p) => p.ms > at) || null, prev = [...hl].reverse().find((p) => p.ms <= at) || null;
    const rising = next ? next.type === 'H' : prev ? prev.type === 'L' : null;
    let height = null;
    if (prev && next) { const f = (at - prev.ms) / (next.ms - prev.ms); height = +(prev.v + (next.v - prev.v) * (1 - Math.cos(Math.PI * f)) / 2).toFixed(1); }
    return { rising, height, next, prev, minutesToNext: next ? Math.round((next.ms - at) / 60000) : null };
  }

  // ---------- header badge ----------
  function ensureBadge() {
    if ($('#tideBadge')) return;
    const b = document.createElement('button');
    b.id = 'tideBadge'; b.className = 'tide-badge'; b.type = 'button'; b.hidden = true; b.setAttribute('aria-label', 'Tide chart');
    b.innerHTML = `<svg class="tb-ico" viewBox="0 0 28 28" width="26" height="26" aria-hidden="true"><path class="tb-wave" d="M2 17c3 0 3-3 6-3s3 3 6 3 3-3 6-3 3 3 6 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path class="tb-wave2" d="M2 22c3 0 3-3 6-3s3 3 6 3 3-3 6-3 3 3 6 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity=".45"/><path class="tb-arrow" d="M14 3v8M10.5 6.5 14 3l3.5 3.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="tb-txt"><b id="tbPhase">Tide</b><small id="tbNext"></small></span>`;
    const right = document.querySelector('header .right'); right.insertBefore(b, right.firstChild);
    b.addEventListener('click', () => openTides());
  }
  function drawBadge() {
    const b = $('#tideBadge'); if (!b) return;
    const ph = phase(); if (!ph || ph.rising == null) { b.hidden = true; return; }
    b.hidden = false; b.classList.toggle('falling', !ph.rising);
    $('#tbPhase').textContent = ph.rising ? 'Rising' : 'Falling';
    $('#tbNext').textContent = ph.next ? `${ph.next.type === 'H' ? 'High' : 'Low'} ${fmtT(ph.next.ms, station.tz)}` : '';
    b.title = `${ph.rising ? 'Rising' : 'Falling'} tide at ${nice(station.name)}${ph.height != null ? `, about ${ph.height} ft` : ''}${ph.next ? `; ${ph.next.type === 'H' ? 'high' : 'low'} at ${fmtT(ph.next.ms, station.tz)} (in ${mins(ph.minutesToNext)})` : ''}. Tap for the chart.`;
  }

  // ---------- data ----------
  async function stationsNear(lat, lon) { const r = await fetch(`/api/tides/stations?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&n=10`); return r.ok ? (await r.json()).stations : []; }
  function pickNear(list) { if (!list.length) return null; const ref = list.find((s) => s.type === 'reference'); return ref && ref.miles <= list[0].miles + 6 ? ref : list[0]; }
  async function load(dateOffset = 0) {
    if (!station) return null;
    dayOffset = dateOffset;
    const date = addDays(ymd(Date.now(), station.tz), dateOffset);
    const r = await fetch(`/api/tides?station=${station.id}&date=${date}&days=2`);
    if (!r.ok) throw new Error('tide service');
    const d = await r.json(); if (dateOffset === 0) data = d; return d;
  }
  async function setStation(s, isManual) {
    station = s; manual = !!isManual; data = null;
    try { localStorage.setItem(KEY, JSON.stringify(s)); if (isManual) localStorage.setItem(MANUAL, '1'); else localStorage.removeItem(MANUAL); } catch (e) {}
    try { await load(0); } catch (e) { data = null; }
    drawBadge(); if (!$('#tideView').hidden) drawView(data);
  }
  async function resolveStation() {
    let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); manual = localStorage.getItem(MANUAL) === '1'; } catch (e) {}
    if (manual && saved) return setStation(saved, true);
    const loc = (window.SG && window.SG.loc && window.SG.loc()) || {};
    if (loc.status === 'ok' && loc.lat != null) { const near = pickNear(await stationsNear(loc.lat, loc.lon).catch(() => [])); if (near) return setStation(near, false); }
    if (saved) return setStation(saved, false);
    const st = window.SG?.STATE || 'DE';
    const r = await fetch(`/api/tides/stations?q=${DEFAULT_BY_STATE[st] || DEFAULT_BY_STATE.DE}`).catch(() => null);
    const list = r && r.ok ? (await r.json()).stations : [];
    if (list[0]) return setStation(list[0], false);
  }

  // ---------- tide view ----------
  function ensureView() {
    if ($('#tideView')) return;
    const sec = document.createElement('section'); sec.id = 'tideView'; sec.hidden = true;
    sec.innerHTML = `
<div class="tv-head"><button class="tv-back" id="tvBack" type="button">‹ Checker</button><h2 class="disp">Tides</h2></div>
<div class="tv-station"><div><b id="tvName">—</b><small id="tvSub"></small></div><button class="btn" id="tvChange" type="button">Change location</button></div>
<div class="tv-pick" id="tvPick" hidden>
  <div class="tv-pick-row"><input id="tvQ" type="search" placeholder="Search a town, pier, inlet or river (e.g. Myrtle Beach)" autocomplete="off"><button class="btn primary" id="tvLoc" type="button">Use my location</button></div>
  <div class="tv-pick-row"><label for="tvState" class="sr">State</label><select id="tvState"><option value="">Browse by state…</option>${['DE', 'NJ', 'MD', 'VA', 'NC', 'SC', 'GA', 'FL', 'NY', 'CT', 'ME', 'NH', 'MA', 'RI', 'PA', 'AL', 'MS', 'LA', 'TX', 'CA', 'OR', 'WA', 'AK', 'HI', 'PR', 'VI'].map((s) => `<option value="${s}">${s}</option>`).join('')}</select></div>
  <div class="tv-results" id="tvResults"></div>
</div>
<div class="tv-now" id="tvNow"></div>
<div class="tv-wx" id="tvWx" hidden></div>
<div class="tv-nav"><button class="btn" id="tvPrev" type="button">‹ Earlier</button><span id="tvRange"></span><button class="btn" id="tvNext" type="button">Later ›</button></div>
<div class="tv-chart" id="tvChart"></div>
<table class="tv-table"><thead><tr><th>Day</th><th>Tide</th><th>Time</th><th>Height</th></tr></thead><tbody id="tvRows"></tbody></table>
<p class="tv-foot">Predictions from <a href="https://tidesandcurrents.noaa.gov/" target="_blank" rel="noopener">NOAA CO-OPS</a>, station <span id="tvId"></span>, feet above MLLW, station local time. Weather and wind can change actual water levels.</p>`;
    $('#galleryView').insertAdjacentElement('afterend', sec);
    $('#tvBack').addEventListener('click', () => window.SG.showView('check'));
    $('#tvChange').addEventListener('click', () => { const p = $('#tvPick'); p.hidden = !p.hidden; if (!p.hidden) { $('#tvQ').focus(); showNearby(); } });
    let t; $('#tvQ').addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 250); });
    $('#tvState').addEventListener('change', async () => { const st = $('#tvState').value; if (!st) return; if (!pro('tide-stations')) { $('#tvState').value = ''; return; } const r = await fetch(`/api/tides/stations?state=${st}`); drawResults(r.ok ? (await r.json()).stations : [], `Stations in ${st}`); });
    $('#tvLoc').addEventListener('click', async () => { $('#tvResults').innerHTML = '<div class="tv-msg">Locating…</div>'; const c = await geo(); if (!c) return ($('#tvResults').innerHTML = '<div class="tv-msg">Location unavailable. Allow location access, or search by name.</div>'); const list = await stationsNear(c.latitude, c.longitude).catch(() => []); const near = pickNear(list); if (near) { await setStation(near, false); $('#tvPick').hidden = true; } else drawResults(list, 'Nearest stations'); });
    $('#tvPrev').addEventListener('click', () => shift(-1)); $('#tvNext').addEventListener('click', () => shift(1));
    $('#tvResults').addEventListener('click', async (e) => { const b = e.target.closest('[data-id]'); if (!b) return; const s = JSON.parse(b.dataset.s); if (s.miles == null && !pro('tide-stations')) return; await setStation(s, true); $('#tvPick').hidden = true; });
  }
  const pro = (f) => !window.SG_PRO || window.SG_PRO.isPro() || (window.SG_PRO.gate(f), false);
  async function search() { const q = $('#tvQ').value.trim(); if (q.length < 2) return showNearby(); if (!pro('tide-stations')) return; const r = await fetch(`/api/tides/stations?q=${encodeURIComponent(q)}&n=25`); drawResults(r.ok ? (await r.json()).stations : [], `Matches for “${q}”`); }
  async function showNearby() { const loc = (window.SG && window.SG.loc && window.SG.loc()) || {}; if (loc.status === 'ok' && loc.lat != null) { const list = await stationsNear(loc.lat, loc.lon).catch(() => []); drawResults(list, 'Nearest to you'); } else $('#tvResults').innerHTML = '<div class="tv-msg">Search by name, pick a state, or use your location.' + (window.SG_PRO && !window.SG_PRO.isPro() ? ' Stations away from you are a Pro feature.' : '') + '</div>'; }
  function drawResults(list, title) {
    if (!list.length) return ($('#tvResults').innerHTML = '<div class="tv-msg">No stations found.</div>');
    $('#tvResults').innerHTML = `<div class="tv-msg">${esc(title)}</div>` + list.map((s) => `<button type="button" data-id="${esc(s.id)}" data-s='${esc(JSON.stringify(s))}' class="${station && s.id === station.id ? 'on' : ''}"><b>${esc(nice(s.name))}</b><small>${esc(s.state || '')}${s.miles != null ? ` · ${s.miles} mi` : ''}${s.type === 'subordinate' ? ' · highs/lows' : ''}</small></button>`).join('');
  }
  async function shift(n) { const next = dayOffset + n; if ((next < 0 || next > 1) && !pro('tide-week')) return; const d = await load(next).catch(() => null); if (d) drawView(d); }
  async function openTides() {
    ensureView(); window.SG.showView('tides');
    if (!station) await resolveStation();
    if (!data && station) { try { await load(0); } catch (e) {} }
    drawView(dayOffset === 0 ? data : await load(dayOffset).catch(() => data));
  }

  // ---------- weather (National Weather Service) ----------
  let wx = null, wxFor = null;
  const SKY_ICON = { clear: '☀', partly: '⛅', cloudy: '☁', fog: '🌫', rain: '🌧', storm: '⛈', snow: '🌨', wind: '🌬', night: '🌙' };
  const wxIcon = (sky, night) => `<span class="wx-ico">${night && (sky === 'clear' || sky === 'partly') ? SKY_ICON.night : SKY_ICON[sky] || SKY_ICON.partly}</span>`;
  const hourTxt = (iso, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric' }).format(new Date(iso)).replace(' ', '').replace('AM', 'a').replace('PM', 'p');
  async function loadWeather() {
    const loc = (window.SG && window.SG.loc && window.SG.loc()) || {};
    const lat = loc.status === 'ok' && loc.lat != null && !manual ? loc.lat : station?.lat, lon = loc.status === 'ok' && loc.lon != null && !manual ? loc.lon : station?.lng;
    if (lat == null || lon == null) return null;
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`; if (wxFor === key && wx && Date.now() - wx.at < 15 * 60e3) return wx.data;
    try { const r = await fetch(`/api/weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`); if (!r.ok) throw new Error(); const data = await r.json(); wx = { data, at: Date.now() }; wxFor = key; document.dispatchEvent(new CustomEvent('sg:weather', { detail: { sky: data.sky, night: data.night } })); drawWxLine(); return data; }
    catch (e) { return wx ? wx.data : null; }
  }
  function drawWxLine() {
    let el = $('#wxLine'); if (!el) { el = document.createElement('div'); el.id = 'wxLine'; el.className = 'wx-line'; const today = $('#today'); if (today) today.insertAdjacentElement('afterend', el); else return; }
    const d = wx?.data; if (!d) { el.hidden = true; return; }
    const c = d.current, h = d.hourly?.[0];
    const temp = c?.tempF ?? h?.tempF, text = c?.text || h?.text || '', wind = c?.windMph != null ? `${c.windDir || ''} ${c.windMph} mph` : h ? `${h.windDir || ''} ${h.windMph} mph` : '';
    el.innerHTML = `${wxIcon(d.sky, d.night)} ${temp != null ? `<b>${temp}°</b>` : ''} ${esc(text)}${wind ? ` · ${esc(wind.trim())}` : ''}${d.place ? ` <span class="wx-place">· ${esc(d.place)}</span>` : ''}`;
    el.hidden = false; el.onclick = () => openTides();
  }
  function drawWeather(d) {
    const el = $('#tvWx'); if (!el) return;
    if (!d) { el.hidden = true; return; }
    const c = d.current, tz = d.tz || station?.tz || 'America/New_York';
    const hours = (d.hourly || []).slice(0, 12);
    const days = (d.daily || []).slice(0, 8);
    el.innerHTML = `
<div class="wx-head"><div class="wx-now">${wxIcon(d.sky, d.night)}<div><div class="wx-temp">${c?.tempF ?? hours[0]?.tempF ?? '—'}°<span>F</span></div><div class="wx-text">${esc(c?.text || hours[0]?.text || '')}</div></div></div>
<div class="wx-facts">${c?.windMph != null ? `<span>Wind <b>${esc(c.windDir || '')} ${c.windMph}${c.gustMph ? `–${c.gustMph}` : ''} mph</b></span>` : ''}${c?.humidity != null ? `<span>Humidity <b>${c.humidity}%</b></span>` : ''}${c?.pressureInHg != null ? `<span>Pressure <b>${c.pressureInHg} inHg</b></span>` : ''}${c?.visibilityMi != null ? `<span>Visibility <b>${c.visibilityMi} mi</b></span>` : ''}</div></div>
<div class="wx-hours">${hours.map((h) => `<div class="wx-h"><small>${hourTxt(h.t, tz)}</small>${wxIcon(h.sky, !h.day)}<b>${h.tempF}°</b><small class="pop">${h.pop ? h.pop + '%' : ''}</small></div>`).join('')}</div>
<div class="wx-days">${days.map((p) => `<div class="wx-d"><b>${esc(p.name)}</b>${wxIcon(p.sky, !p.day)}<span>${p.tempF}°</span><small>${esc(p.text)}${p.pop ? ` · ${p.pop}%` : ''}</small><em>${esc(p.windDir || '')} ${esc(p.wind || '')}</em></div>`).join('')}</div>
<p class="tv-foot" style="margin-top:6px">Weather from the <a href="https://www.weather.gov/" target="_blank" rel="noopener">National Weather Service</a>${c?.station ? ` · observed at ${esc(c.station.name)}` : ''}${d.place ? ` · forecast for ${esc(d.place)}` : ''}.</p>`;
    el.hidden = false;
  }

  function drawView(d) {
    if (!station) return;
    loadWeather().then(drawWeather);
    shown = d;
    $('#tvName').textContent = nice(station.name); $('#tvId').textContent = station.id;
    $('#tvSub').textContent = `${station.state || ''}${station.miles != null && !manual ? ` · ${station.miles} mi from you` : manual ? ' · chosen by you' : ''}`;
    if (!d) { $('#tvNow').innerHTML = '<div class="tv-msg">Tide predictions are unavailable right now. Try again in a minute.</div>'; $('#tvChart').innerHTML = ''; $('#tvRows').innerHTML = ''; $('#tvRange').textContent = ''; return; }
    const tz = station.tz, ph = phase();
    $('#tvNow').innerHTML = ph && ph.rising != null ? `<div class="tv-card ${ph.rising ? 'rising' : 'falling'}"><div class="tv-big">${ph.rising ? '↑ Rising' : '↓ Falling'}${ph.height != null ? ` <span>· about ${ph.height} ft now</span>` : ''}</div><div class="tv-next">${ph.next ? `${ph.next.type === 'H' ? 'High' : 'Low'} tide at <b>${fmtT(ph.next.ms, tz)}</b> (${ph.next.v} ft), in ${mins(ph.minutesToNext)}` : ''}${ph.prev ? ` · last ${ph.prev.type === 'H' ? 'high' : 'low'} ${fmtT(ph.prev.ms, tz)}` : ''}</div></div>` : '';
    $('#tvRange').textContent = `${fmtD(d.start, tz)} – ${fmtD(d.end - 1, tz)}`;
    $('#tvChart').innerHTML = chartSvg(d, tz);
    $('#tvRows').innerHTML = d.hilo.map((p) => `<tr class="${p.type === 'H' ? 'hi' : 'lo'}"><td>${fmtD(p.ms, tz)}</td><td>${p.type === 'H' ? 'High' : 'Low'}</td><td>${fmtT(p.ms, tz)}</td><td>${p.v.toFixed(1)} ft</td></tr>`).join('');
  }

  function chartSvg(d, tz) {
    const cw = ($('#tvChart') && $('#tvChart').clientWidth) || 720; const W = Math.max(320, cw - 8), H = W < 480 ? 250 : 230, L = 30, R = 8, T = 26, B = 30; const narrow = W < 480;
    const pts = d.curve.length ? d.curve : d.hilo; if (!pts.length) return '';
    const vs = pts.map((p) => p.v).concat(d.hilo.map((p) => p.v));
    let lo = Math.min(...vs), hi = Math.max(...vs); const pad = Math.max(0.4, (hi - lo) * 0.15); lo -= pad; hi += pad;
    const x = (ms) => L + ((ms - d.start) / (d.end - d.start)) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.ms).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const area = `${line}L${x(pts[pts.length - 1].ms).toFixed(1)},${H - B}L${x(pts[0].ms).toFixed(1)},${H - B}Z`;
    let g = '';
    for (let ms = d.start; ms <= d.end; ms += (narrow ? 12 : 6) * 3600e3) { const xx = x(ms); const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric' }).format(new Date(ms)); g += `<line x1="${xx.toFixed(1)}" y1="${T}" x2="${xx.toFixed(1)}" y2="${H - B}" class="grid"/><text x="${xx.toFixed(1)}" y="${H - 10}" class="tick" text-anchor="middle">${h.replace(' ', '').replace('AM', 'a').replace('PM', 'p')}</text>`; }
    const mid = d.start + (d.end - d.start) / 2;
    g += `<line x1="${x(mid).toFixed(1)}" y1="${T - 6}" x2="${x(mid).toFixed(1)}" y2="${H - B}" class="day"/><text x="${(x(d.start) + 4).toFixed(1)}" y="${T - 10}" class="dayl">${fmtD(d.start, tz)}</text><text x="${(x(mid) + 4).toFixed(1)}" y="${T - 10}" class="dayl">${fmtD(mid, tz)}</text>`;
    const yticks = []; const step = hi - lo > 6 ? 2 : 1; for (let v = Math.ceil(lo); v <= Math.floor(hi); v += step) yticks.push(v);
    g += yticks.map((v) => `<text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" class="tick" text-anchor="end">${v}</text><line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" class="grid"/>`).join('');
    const marks = d.hilo.map((p) => `<circle cx="${x(p.ms).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4" class="${p.type === 'H' ? 'hi' : 'lo'}"/><text x="${x(p.ms).toFixed(1)}" y="${(p.type === 'H' ? y(p.v) - 9 : y(p.v) + 16).toFixed(1)}" class="lab" text-anchor="middle">${narrow ? fmtT(p.ms, tz) : `${fmtT(p.ms, tz)} · ${p.v.toFixed(1)}`}</text>`).join('');
    const now = Date.now(); let nowG = '';
    if (now >= d.start && now < d.end) { const ph = phase(now); const yy = ph && ph.height != null ? y(ph.height) : H - B; nowG = `<rect x="${L}" y="${T}" width="${(x(now) - L).toFixed(1)}" height="${H - T - B}" class="past"/><line x1="${x(now).toFixed(1)}" y1="${T}" x2="${x(now).toFixed(1)}" y2="${H - B}" class="now"/><circle cx="${x(now).toFixed(1)}" cy="${yy.toFixed(1)}" r="5.5" class="nowdot"/><text x="${x(now).toFixed(1)}" y="${H - B + 12}" class="nowl" text-anchor="middle">now</text>`; }
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tide height for the next two days">${g}<path d="${area}" class="area"/><path d="${line}" class="line"/>${nowG}${marks}</svg>`;
  }

  // ---------- boot ----------
  function ready() { return new Promise((r) => (window.SG ? r() : document.addEventListener('sg:ready', r, { once: true }))); }
  ready().then(async () => {
    ensureBadge(); ensureView();
    await resolveStation().catch(() => {});
    drawBadge(); loadWeather();
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (!$('#tideView').hidden && shown) drawView(shown); }, 200); });
    timer = setInterval(() => { drawBadge(); if (!$('#tideView').hidden && shown) drawView(shown); }, 60e3);
    setInterval(loadWeather, 15 * 60e3);
    // refresh predictions when the day rolls over or the tab comes back after a long sleep
    document.addEventListener('visibilitychange', () => { if (!document.hidden && data && Date.now() - new Date(data.fetched).getTime() > 3 * 3600e3) load(0).then(() => drawBadge()).catch(() => {}); });
    if (location.hash === '#tides') openTides();
  });
  window.SG_TIDES = { open: openTides, setStation, get station() { return station; }, get data() { return data; }, phase };
})();
