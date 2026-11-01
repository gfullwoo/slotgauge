// Moon & solunar card (free), the catch log, and the Best Windows view (both Pro).
//
// The log exists so an angler can answer "when do I actually catch fish?" from their own water. Every
// claim this file renders carries its sample size, and nothing is called a pattern below the server's
// minimum — a confident-sounding pattern drawn from four fish would be worse than saying nothing.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = (p, o) => (window.SG && window.SG.api ? window.SG.api(p, o) : fetch(p, o));
  const isPro = () => !window.SG_PRO || window.SG_PRO.isPro();
  const gate = (f) => (isPro() ? true : (window.SG_PRO.gate(f), false));
  const fmtT = (ms, tz) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz || undefined });
  const fmtD = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const titled = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());

  // ---------- moon card on the tide view (free) ----------
  let moonDays = null, moonKey = '';
  async function loadMoon(lat, lon, tz) {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    if (moonKey === key && moonDays) return moonDays;
    try {
      const r = await api(`/api/moon?lat=${lat}&lon=${lon}&days=7`);
      if (!r.ok) return null;
      moonDays = (await r.json()).days; moonKey = key;
      drawMoon(tz);
      document.dispatchEvent(new CustomEvent('sg:moon', { detail: { days: moonDays } }));
      return moonDays;
    } catch { return null; }
  }

  function drawMoon(tz) {
    const el = $('#tvMoon'); if (!el || !moonDays?.length) return;
    const d = moonDays[0];
    const windows = d.windows.map((w) => `<li class="${w.kind}"><b>${esc(w.label)}</b><span>${fmtT(w.start, tz)} – ${fmtT(w.end, tz)}</span><small>${w.kind === 'major' ? 'Major' : 'Minor'}</small></li>`).join('');
    el.hidden = false;
    el.innerHTML = `
<div class="tv-card moon">
  <div class="moon-top">
    <span class="moon-face" aria-hidden="true">${d.phase.emoji}</span>
    <div><div class="tv-big">${esc(d.phase.name)}</div><div class="tv-next">${Math.round(d.phase.fraction * 100)}% lit · day ${Math.round(d.phase.age)} of the cycle${d.moonrise ? ` · moonrise ${fmtT(d.moonrise, tz)}` : ''}${d.moonset ? ` · moonset ${fmtT(d.moonset, tz)}` : ''}</div></div>
  </div>
  ${windows ? `<ul class="moon-win">${windows}</ul>` : ''}
  <p class="moon-foot">Solunar windows are a traditional guide — the moon overhead or underfoot, and moonrise and moonset. Whether they hold on your water is what the catch log answers.</p>
</div>`;
  }

  // Hook the moon card into the tide view as soon as a station is known.
  document.addEventListener('sg:tides', (e) => {
    const { lat, lon, tz } = e.detail || {};
    if (!$('#tvMoon') && $('#tvWx')) $('#tvWx').insertAdjacentHTML('afterend', '<div class="tv-moon" id="tvMoon" hidden></div>');
    if (lat != null && lon != null) loadMoon(lat, lon, tz);
  });

  // ---------- catch log (Pro) ----------
  function ensureLogView() {
    if ($('#logView')) return;
    const sec = document.createElement('section'); sec.id = 'logView'; sec.hidden = true;
    sec.innerHTML = `
<div class="tv-head"><button class="tv-back" data-log="back" type="button">‹ Checker</button><h2 class="disp">Catch log</h2></div>
<p class="log-intro">Every fish you log is stamped with the tide, moon, solunar window and weather at that moment, so the app can tell you later when you actually catch fish.</p>
<form class="log-form" id="logForm">
  <div class="log-row"><label>Species<input name="species" required maxlength="80" placeholder="Striped Bass" autocomplete="off"></label>
  <label>When<input name="at" type="datetime-local"></label></div>
  <div class="log-row"><label>Length (in)<input name="lengthIn" type="number" step="0.25" min="0" inputmode="decimal"></label>
  <label>Weight (lb)<input name="weightLb" type="number" step="0.1" min="0" inputmode="decimal"></label>
  <label>Spot<input name="place" maxlength="120" placeholder="Indian River Inlet" autocomplete="off"></label></div>
  <div class="log-row log-keep"><label class="chk"><input type="radio" name="fate" value="kept" checked> Kept</label><label class="chk"><input type="radio" name="fate" value="released"> Released</label>
  <label class="chk"><input type="checkbox" name="here" checked> Use my location for conditions</label></div>
  <label class="log-note">Notes<textarea name="note" maxlength="500" rows="2" placeholder="Bucktail on the outgoing, bait everywhere"></textarea></label>
  <div class="log-actions"><button class="btn primary" type="submit">Log this catch</button><span id="logMsg" class="log-msg"></span></div>
</form>
<div class="log-list" id="logList"></div>`;
    document.querySelector('#tideView, #galleryView').insertAdjacentElement('afterend', sec);
    sec.addEventListener('click', (e) => {
      const b = e.target.closest('[data-log]'); if (!b) return;
      if (b.dataset.log === 'back') window.SG.showView('check');
      if (b.dataset.log === 'del') removeCatch(b.dataset.id);
    });
    $('#logForm').addEventListener('submit', submitCatch);
  }

  async function submitCatch(e) {
    e.preventDefault();
    if (!gate('catch-log')) return;
    const f = e.target, fd = new FormData(f);
    const msg = $('#logMsg'); msg.textContent = 'Saving…'; msg.className = 'log-msg';
    const body = {
      species: fd.get('species'), lengthIn: fd.get('lengthIn') || null, weightLb: fd.get('weightLb') || null,
      place: fd.get('place') || null, note: fd.get('note') || null,
      kept: fd.get('fate') === 'kept', released: fd.get('fate') === 'released',
    };
    if (fd.get('at')) body.at = new Date(fd.get('at')).toISOString();
    if (fd.get('here')) {
      const c = await coords();
      if (c) { body.lat = c.lat; body.lon = c.lon; }
      else msg.textContent = 'Saving without location (conditions will be limited)…';
    }
    try {
      const r = await api('/api/catches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 402) { window.SG_PRO.open(); return; }
      if (!r.ok) { msg.textContent = j.error || 'Could not save that.'; msg.className = 'log-msg bad'; return; }
      f.reset(); msg.textContent = 'Logged.'; msg.className = 'log-msg good';
      setTimeout(() => { msg.textContent = ''; }, 2500);
      loadLog();
    } catch { msg.textContent = 'Network problem — try again.'; msg.className = 'log-msg bad'; }
  }

  async function removeCatch(id) {
    if (!confirm('Delete this catch?')) return;
    const r = await api(`/api/catches/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (r.ok) loadLog();
  }

  function coords() {
    const loc = window.SG && window.SG.loc && window.SG.loc();
    if (loc && loc.status === 'ok' && loc.lat != null) return Promise.resolve({ lat: loc.lat, lon: loc.lon });
    if (!navigator.geolocation) return Promise.resolve(null);
    return new Promise((res) => navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }), () => res(null), { timeout: 8000, maximumAge: 300000 }));
  }

  const condLine = (c) => {
    if (!c) return '';
    const bits = [];
    if (c.tide?.stage) bits.push(`<span class="pill tide">${esc(titled(c.tide.stage))}${c.tide.heightFt != null ? ` ${c.tide.heightFt} ft` : ''}</span>`);
    if (c.moon?.name) bits.push(`<span class="pill moon">${c.moon.emoji || ''} ${esc(c.moon.name)}</span>`);
    if (c.solunar?.window) bits.push(`<span class="pill sol">${esc(c.solunar.window.label)}</span>`);
    if (c.weather) { const w = c.weather; bits.push(`<span class="pill wx">${esc(w.text || w.sky || '')}${w.tempF != null ? ` ${w.tempF}°` : ''}${w.windMph != null ? ` · ${w.windMph} mph ${esc(w.windDir || '')}` : ''}</span>`); }
    return bits.length ? `<div class="log-cond">${bits.join('')}</div>` : '';
  };

  async function loadLog() {
    ensureLogView();
    const list = $('#logList'); if (!list) return;
    if (!isPro()) { list.innerHTML = proPitch('The catch log'); return; }
    list.innerHTML = '<div class="tv-msg">Loading…</div>';
    try {
      const r = await api('/api/catches');
      if (r.status === 402) { list.innerHTML = proPitch('The catch log'); return; }
      if (r.status === 401) { list.innerHTML = '<div class="tv-msg">Sign in to keep a catch log.</div>'; return; }
      const { catches, summary } = await r.json();
      if (!catches.length) { list.innerHTML = '<div class="tv-msg">No catches logged yet. Your first one goes above.</div>'; return; }
      list.innerHTML = `<div class="log-count">${summary.catches} catch${summary.catches === 1 ? '' : 'es'}${summary.bySpecies.length > 1 ? ` · ${summary.bySpecies.length} species` : ''}</div>` + catches.map((c) => `
<article class="log-item">
  <div class="log-main"><b>${esc(c.species)}</b>${c.lengthIn ? ` <span>${c.lengthIn}"</span>` : ''}${c.weightLb ? ` <span>${c.weightLb} lb</span>` : ''}
    <small>${fmtD(c.at)} · ${new Date(c.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${c.place ? ` · ${esc(c.place)}` : ''} · ${c.kept ? 'kept' : 'released'}</small></div>
  ${condLine(c.conditions)}
  ${c.note ? `<p class="log-noteline">${esc(c.note)}</p>` : ''}
  <button class="log-del" data-log="del" data-id="${esc(c.id)}" type="button" aria-label="Delete this catch">×</button>
</article>`).join('');
    } catch { list.innerHTML = '<div class="tv-msg">Could not load your log.</div>'; }
  }

  const proPitch = (what) => `<div class="tv-msg">${esc(what)} is part of SlotGauge Pro. <button class="btn primary" type="button" onclick="window.SG_PRO.open()">See Pro</button></div>`;

  // ---------- best windows (Pro) ----------
  function ensureInsightsView() {
    if ($('#insightsView')) return;
    const sec = document.createElement('section'); sec.id = 'insightsView'; sec.hidden = true;
    sec.innerHTML = `
<div class="tv-head"><button class="tv-back" data-ins="back" type="button">‹ Checker</button><h2 class="disp">Best windows</h2></div>
<div id="insBody"></div>`;
    document.querySelector('#logView, #tideView').insertAdjacentElement('afterend', sec);
    sec.addEventListener('click', (e) => { if (e.target.closest('[data-ins="back"]')) window.SG.showView('check'); });
  }

  function bucketBar(t, label) {
    if (!t.total) return '';
    const rows = t.buckets.slice(0, 5).map((b) => `<li${t.best.includes(b.key) ? ' class="best"' : ''}><span class="bk">${esc(titled(b.key))}</span><span class="bar"><i style="width:${b.pct}%"></i></span><span class="bn">${b.n} fish · ${b.pct}%</span></li>`).join('');
    return `<section class="ins-group"><h3>${esc(label)}</h3><ul class="ins-bars">${rows}</ul>${t.decisive ? '' : `<p class="ins-flat">${t.only ? 'Every catch so far falls here — nothing to compare it against yet.' : 'Spread fairly evenly — no pattern here yet.'}</p>`}</section>`;
  }

  async function loadInsights() {
    ensureInsightsView();
    const body = $('#insBody'); if (!body) return;
    if (!isPro()) { body.innerHTML = proPitch('Best windows'); return; }
    body.innerHTML = '<div class="tv-msg">Reading your log…</div>';
    const c = await coords();
    const q = c ? `?lat=${c.lat}&lon=${c.lon}` : '';
    try {
      const r = await api(`/api/insights${q}`);
      if (r.status === 402) { body.innerHTML = proPitch('Best windows'); return; }
      if (r.status === 401) { body.innerHTML = '<div class="tv-msg">Sign in to see your best windows.</div>'; return; }
      const { summary, windows, note } = await r.json();
      const head = summary.catches === 0
        ? '<div class="tv-msg">Log some catches and this page will tell you when you actually catch fish.</div>'
        : `<p class="ins-head">${summary.catches} catch${summary.catches === 1 ? '' : 'es'} logged${summary.firstAt ? ` since ${fmtD(summary.firstAt)}` : ''}.${note ? ` <b>${esc(note)}</b>` : ''}</p>`;
      const patterns = summary.enough ? [
        bucketBar(summary.tide, 'Tide stage'),
        bucketBar(summary.solunar, 'Solunar window'),
        bucketBar(summary.moon, 'Moon phase'),
        bucketBar(summary.timeOfDay, 'Time of day'),
        bucketBar(summary.wind, 'Wind'),
        bucketBar(summary.sky, 'Sky'),
      ].join('') : '';
      const upcoming = windows.length ? `<section class="ins-group"><h3>Next 7 days</h3><ul class="ins-win">${windows.map((w) => `
<li class="${w.kind}${w.reasons.length ? ' hit' : ''}">
  <div class="iw-when"><b>${new Date(w.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</b><span>${fmtT(w.start)} – ${fmtT(w.end)}</span></div>
  <div class="iw-what"><b>${esc(w.label)}</b> <small>${w.kind === 'major' ? 'Major' : 'Minor'} · ${w.moonEmoji} ${esc(w.moon)}</small>
    ${w.reasons.length ? `<ul class="iw-why">${w.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>
</li>`).join('')}</ul>${summary.enough ? '' : '<p class="ins-flat">Windows are ranked on moon position alone until your log has enough fish to say more.</p>'}</section>` : (c ? '' : '<div class="tv-msg">Allow location access to see upcoming windows for where you are.</div>');
      body.innerHTML = head + patterns + upcoming + '<p class="ins-foot">This describes your own logged catches — it is not a forecast, and a small log can mislead. Sample sizes are shown so you can judge for yourself.</p>';
    } catch { body.innerHTML = '<div class="tv-msg">Could not load your insights.</div>'; }
  }

  // ---------- wiring ----------
  function init() {
    if (!window.SG || !window.SG.registerView) return setTimeout(init, 150);
    window.SG.registerView('log', '#logView', loadLog);
    window.SG.registerView('insights', '#insightsView', loadInsights);
    ensureLogView(); ensureInsightsView();
    window.SG_LOG = { open: () => window.SG.showView('log'), insights: () => window.SG.showView('insights'), reload: loadLog };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
