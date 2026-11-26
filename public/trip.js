// Plan my Trip (Pro): pick dates and a place, get the window as a whole.
//
// The honesty rules this view keeps, because a planner is read as a promise:
//   - tides and moon resolve for any date; the weather forecast runs about a week, and days past it
//     say so instead of showing an empty card that looks like calm weather;
//   - the species list is the regulations, not a guess — if nothing is open, that is the answer;
//   - the advisor's output is labelled generated guidance, and anything it named that the rules do
//     not allow is shown as dropped rather than quietly removed.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = (p, o) => (window.SG && window.SG.api ? window.SG.api(p, o) : fetch(p, o).then((r) => r.json()));
  const isPro = () => !window.SG_PRO || window.SG_PRO.isPro();

  const MAXD = 14;
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const nice = (s) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtT = (ms, tz) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz || undefined });

  let state = { start: null, end: null, station: null, lat: null, lon: null, code: null, facts: null, target: null, month: null };

  function ensureView() {
    if ($('#tripView')) return;
    const sec = document.createElement('section');
    sec.id = 'tripView'; sec.hidden = true;
    sec.innerHTML = `
<div class="tv-head"><button class="tv-back" id="tripBack" type="button">‹ Checker</button><h2 class="disp">Plan my Trip</h2></div>
<div id="tripSetup"></div>
<div id="tripBody"></div>`;
    ($('#tideView') || $('#galleryView') || document.body).insertAdjacentElement('beforebegin', sec);
    sec.addEventListener('click', onClick);
    sec.addEventListener('change', onChange);
  }

  // ---------- date picking ----------
  function calendar(monthStart) {
    const first = new Date(monthStart + '-01T12:00:00');
    const y = first.getFullYear(), m = first.getMonth();
    const lead = new Date(y, m, 1).getDay();
    const len = new Date(y, m + 1, 0).getDate();
    const today = iso(new Date());
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span class="tp-pad"></span>');
    for (let d = 1; d <= len; d++) {
      const day = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const past = day < today;
      const sel = state.start && state.end && day >= state.start && day <= state.end;
      const edge = day === state.start || day === state.end;
      cells.push(`<button type="button" class="tp-day${sel ? ' in' : ''}${edge ? ' edge' : ''}" data-day="${day}"${past ? ' disabled' : ''}>${d}</button>`);
    }
    const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return `<div class="tp-cal">
      <div class="tp-cal-head"><button type="button" class="btn" data-month="-1">‹</button><b>${esc(label)}</b><button type="button" class="btn" data-month="1">›</button></div>
      <div class="tp-grid">${['S','M','T','W','T','F','S'].map((d) => `<span class="tp-dow">${d}</span>`).join('')}${cells.join('')}</div>
    </div>`;
  }

  function drawSetup() {
    const n = state.start && state.end ? Math.round((Date.parse(state.end) - Date.parse(state.start)) / 86400e3) + 1 : 0;
    const when = state.start && state.end ? `${nice(state.start)} – ${nice(state.end)} · ${n} day${n > 1 ? 's' : ''}`
      : state.start ? `${nice(state.start)} — now pick the last day` : 'Tap a day to start, then the last day';
    $('#tripSetup').innerHTML = `
<div class="tv-card tp-setup">
  <div class="tp-row"><span class="tp-k">When</span><span class="tp-v">${esc(when)}</span>${state.start ? '<button class="btn" type="button" data-tp="clear">Clear</button>' : ''}</div>
  ${calendar(state.month || (state.start || iso(new Date())).slice(0, 7))}
  <div class="tp-row"><span class="tp-k">Where</span><span class="tp-v" id="tpWhere">${state.station ? esc(state.station.name) + (state.code ? ` · ${esc(state.code)}` : '') : 'No place chosen'}</span></div>
  <div class="tv-pick-row"><input id="tpQ" type="search" placeholder="Search a town, pier, inlet or river" autocomplete="off"><button class="btn" id="tpLoc" type="button">Use my location</button></div>
  <div class="tv-results" id="tpResults"></div>
  <div class="tp-go"><button class="btn primary" type="button" data-tp="plan"${state.start && state.end && state.station ? '' : ' disabled'}>Plan this trip</button>
    <span class="hint">Up to ${MAXD} days.</span></div>
</div>`;
  }

  async function search(q) {
    if (q.length < 2) return ($('#tpResults').innerHTML = '');
    const j = await api(`/api/tides/stations?q=${encodeURIComponent(q)}&n=12`).catch(() => null);
    const list = j?.stations || [];
    $('#tpResults').innerHTML = list.length
      ? list.map((s) => `<button type="button" data-pick='${esc(JSON.stringify(s))}'><b>${esc(s.name)}</b><small>${esc(s.state || '')}${s.miles != null ? ` · ${s.miles} mi` : ''}</small></button>`).join('')
      : '<div class="tv-msg">No places found.</div>';
  }

  // ---------- the plan ----------
  async function plan() {
    $('#tripBody').innerHTML = '<div class="tv-msg">Working out the window…</div>';
    const q = new URLSearchParams({ lat: state.lat, lon: state.lon, start: state.start, end: state.end, station: state.station.id });
    if (state.code) q.set('state', state.code);
    try {
      const facts = await api(`/api/trip?${q}`);
      state.facts = facts;
      drawFacts(facts);
    } catch (e) {
      $('#tripBody').innerHTML = `<div class="tv-msg">${esc(e.message || 'Could not plan that trip.')}</div>`;
    }
  }

  function wxCell(w) {
    if (w.outOfRange) return `<span class="tp-none">No forecast yet${w.lastForecast ? '' : ''}</span>`;
    const d = w.day || w.night;
    return `${esc(d.text)} · ${d.tempF}°${d.wind ? ` · ${esc(d.windDir || '')} ${esc(d.wind)}` : ''}${d.pop ? ` · ${d.pop}%` : ''}`;
  }

  function drawFacts(f) {
    const tz = f.tz;
    const byDate = (arr) => Object.fromEntries(arr.map((x) => [x.date, x]));
    const T = byDate(f.tides), M = byDate(f.moon), W = byDate(f.weather);
    const rows = f.days.map((d) => {
      const t = T[d] || { hilo: [] }, m = M[d], w = W[d];
      return `<div class="tp-day-card">
        <div class="tp-date">${esc(nice(d))}</div>
        <div class="tp-line"><span class="tp-lk">Tide</span><span>${t.hilo.length ? t.hilo.map((p) => `${p.type === 'H' ? 'High' : 'Low'} ${fmtT(p.ms, tz)} <i>${p.v}ft</i>`).join(' · ') : '<span class="tp-none">No predictions published</span>'}</span></div>
        <div class="tp-line"><span class="tp-lk">Moon</span><span>${esc(m.phase.emoji)} ${esc(m.phase.name)} · ${Math.round(m.phase.fraction * 100)}% · <i>${esc(m.ratingLabel)}</i></span></div>
        <div class="tp-line"><span class="tp-lk">Windows</span><span>${m.windows.map((x) => `<span class="pill ${x.kind === 'major' ? 'sol' : ''}">${esc(x.label)} ${fmtT(x.start, tz)}</span>`).join(' ')}</span></div>
        <div class="tp-line"><span class="tp-lk">Weather</span><span>${wxCell(w)}</span></div>
      </div>`;
    }).join('');

    const cov = f.coverage;
    const covNote = cov.none
      ? `<p class="tp-warn">No weather forecast reaches these dates — the National Weather Service publishes about a week ahead. Tides and moon below are computed and will not change; check back nearer the trip for conditions.</p>`
      : cov.partial ? `<p class="tp-warn">The forecast covers the first ${cov.days} of ${cov.of} days. The rest will fill in closer to the date.</p>` : '';

    const sp = f.species;
    const target = `<div class="tv-card tp-target">
      <h3 class="disp">Target a species</h3>
      <p class="hint">${sp.length} species are legal to harvest here on these dates. Pick one to focus the advice, or leave it on everything.</p>
      <div class="tv-pick-row">
        <select id="tpSpecies"><option value="">Everything that's open</option>${sp.map((s) => `<option value="${esc(s.name)}"${state.target === s.name ? ' selected' : ''}>${esc(s.name)}${s.allWindow ? '' : ' (part of the window)'}</option>`).join('')}</select>
        <button class="btn primary" type="button" data-tp="advise">Suggest what to target</button>
      </div>
    </div>`;

    $('#tripBody').innerHTML = `
<div class="tv-card tp-head">
  <b>${esc(f.station ? f.station.name : 'Selected point')}</b>
  <small>${esc(f.state)} · ${esc(f.days[0])} to ${esc(f.days[f.days.length - 1])} · ${f.days.length} days</small>
  ${covNote}
</div>
${sp.length ? '' : `<p class="tp-warn">Nothing is open to harvest in ${esc(f.state)} on these dates. That is the plan: the rules say no.</p>`}
<div class="tp-days">${rows}</div>
${sp.length ? target : ''}
<div id="tripAdvice"></div>
<p class="tv-foot">Tides from NOAA CO-OPS, weather from the National Weather Service, moon computed locally. Species list from the ${esc(f.state)} regulations for these dates.</p>`;
  }

  async function advise() {
    const box = $('#tripAdvice');
    box.innerHTML = '<div class="tv-msg">Thinking it through…</div>';
    try {
      const r = await api('/api/trip/advice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: state.lat, lon: state.lon, start: state.start, end: state.end, state: state.code, station: state.station.id, target: state.target || null }),
      });
      if (!r.advice) return (box.innerHTML = `<div class="tv-msg">${esc(r.reason || 'No advice for this window.')}</div>`);
      const a = r.advice;
      box.innerHTML = `
<div class="tv-card tp-advice">
  <h3 class="disp">What to target${state.target ? `: ${esc(state.target)}` : ''}</h3>
  <p class="tp-over">${esc(a.overview || '')}</p>
  ${(a.species || []).map((s) => `<div class="tp-sp">
      <div class="tp-sp-top"><b>${esc(s.name)}</b><span class="pill">${esc(s.confidence || '')} confidence</span></div>
      <p>${esc(s.why || '')}</p>
      ${s.bestTimes?.length ? `<div class="tp-line"><span class="tp-lk">When</span><span>${s.bestTimes.map((t) => esc(t)).join(' · ')}</span></div>` : ''}
      ${s.bait?.length ? `<div class="tp-line"><span class="tp-lk">Bait</span><span>${s.bait.map((b) => esc(b)).join(', ')}</span></div>` : ''}
      ${s.style ? `<div class="tp-line"><span class="tp-lk">Style</span><span>${esc(s.style)}</span></div>` : ''}
      <div class="tp-line"><span class="tp-lk">Rules</span><span>${esc(s.size || '')} · ${esc(s.bag || '')}${s.openDays ? ` · open ${s.openDays.map(esc).join(', ')}` : ''}</span></div>
      ${s.needsReview ? '<p class="tp-warn">This rule is under review — read the official page before keeping one.</p>' : ''}
      ${s.basis ? `<p class="hint">Based on: ${esc(s.basis)}</p>` : ''}
    </div>`).join('')}
  ${(a.caveats || []).length ? `<ul class="tp-caveats">${a.caveats.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
  ${r.dropped?.length ? `<p class="tp-warn">Dropped ${r.dropped.map((d) => esc(d.name)).join(', ')}: not legal to harvest here on these dates.</p>` : ''}
  <p class="tv-foot">${esc(r.note)}</p>
</div>`;
    } catch (e) {
      box.innerHTML = `<div class="tv-msg">${esc(e.message || 'Could not get suggestions.')}</div>`;
    }
  }

  // ---------- events ----------
  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'tripBack') return window.SG.showView('check');
    if (b.dataset.month) { const base = state.month || iso(new Date()).slice(0, 7); const d = new Date(base + '-01T12:00:00'); d.setMonth(d.getMonth() + (+b.dataset.month)); state.month = iso(d).slice(0, 7); return drawSetup(); }
    if (b.dataset.day) {
      const d = b.dataset.day;
      if (!state.start || (state.start && state.end)) { state.start = d; state.end = null; }
      else if (d < state.start) { state.start = d; }
      else { const span = Math.round((Date.parse(d) - Date.parse(state.start)) / 86400e3) + 1; state.end = span > MAXD ? addDays(state.start, MAXD - 1) : d; }
      return drawSetup();
    }
    if (b.dataset.tp === 'clear') { state.start = state.end = null; return drawSetup(); }
    if (b.dataset.tp === 'plan') return plan();
    if (b.dataset.tp === 'advise') return advise();
    if (b.id === 'tpLoc') return useLocation();
    if (b.dataset.pick) {
      const s = JSON.parse(b.dataset.pick);
      state.station = s; state.lat = s.lat; state.lon = s.lng; state.code = s.state || null;
      $('#tpResults').innerHTML = '';
      return drawSetup();
    }
  }
  function onChange(e) {
    if (e.target.id === 'tpSpecies') state.target = e.target.value || null;
  }
  async function useLocation() {
    const loc = (window.SG && window.SG.loc && window.SG.loc()) || {};
    if (loc.status !== 'ok' || loc.lat == null) return ($('#tpResults').innerHTML = '<div class="tv-msg">Location is not available — search for a place instead.</div>');
    const j = await api(`/api/tides/stations?lat=${loc.lat}&lon=${loc.lon}&n=8`).catch(() => null);
    const s = (j?.stations || [])[0];
    if (!s) return ($('#tpResults').innerHTML = '<div class="tv-msg">No tide station near you — search for a place.</div>');
    state.station = s; state.lat = s.lat; state.lon = s.lng; state.code = s.state || loc.state || null;
    $('#tpResults').innerHTML = ''; drawSetup();
  }

  function open() {
    ensureView();
    if (!isPro()) return window.SG_PRO.gate('trip');
    window.SG.showView('trip');
    if (!state.start) { state.start = iso(new Date()); state.end = addDays(state.start, 2); state.month = state.start.slice(0, 7); }
    drawSetup();
    if (!state.facts) $('#tripBody').innerHTML = '';
  }

  function init() {
    if (!window.SG || !window.SG.registerView) return setTimeout(init, 150);
    ensureView();
    window.SG.registerView('trip', '#tripView');
    let t;
    document.addEventListener('input', (e) => { if (e.target.id === 'tpQ') { clearTimeout(t); t = setTimeout(() => search(e.target.value.trim()), 250); } });
    window.SG_TRIP = { open };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
