// Photo identification, sign-in, and the species-grouped gallery.
// Runs after the core checker (index.html) fires 'sg:ready'.
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let cfg = null, user = null, currentScan = null, view = 'check';

  function fakeFirebase() {
    let u = null; const subs = [];
    const auth = { onAuthStateChanged: (f) => { subs.push(f); f(u); }, getRedirectResult: async () => ({}), signOut: async () => { u = null; subs.forEach((f) => f(u)); },
      signInWithPopup: async () => { u = { uid: 'dev-user', displayName: 'Dev Angler', email: 'dev@example.com', photoURL: null, getIdToken: async () => 'dev' }; subs.forEach((f) => f(u)); }, signInWithRedirect: async () => auth.signInWithPopup() };
    const fb = { initializeApp() {}, auth: () => auth }; fb.auth.GoogleAuthProvider = function () {}; return fb;
  }
  function ready() { return new Promise((r) => (window.SG ? r() : document.addEventListener('sg:ready', r, { once: true }))); }

  async function init() {
    await ready();
    try { cfg = await fetch('/api/config').then((r) => r.json()); } catch (e) { return; }
    const canIdentify = !!cfg.features?.identify;
    const canSave = !!(cfg.features?.scans && cfg.firebase?.apiKey);
    if (!canIdentify && !canSave) return; // nothing extra on this deployment
    if (canIdentify) { $('#camBtn').hidden = false; $('#upBtn').hidden = false; $('#hint').textContent = 'Try an example above, snap a photo, or describe your own catch.'; }
    wire();
    drawWayPhoto();
    if (!canSave) return;
    if (cfg.firebase.apiKey === 'dev') window.firebase = fakeFirebase(); else if (!window.firebase) return;
    firebase.initializeApp(cfg.firebase);
    $('#tabs').hidden = false; $('#acct').hidden = false;
    firebase.auth().onAuthStateChanged((u) => { user = u; drawAccount(); drawWayPhoto(); if (view === 'gallery') loadGallery(); });
    firebase.auth().getRedirectResult().catch(() => {});
  }

  // ---------- auth ----------
  async function signIn() {
    const p = new firebase.auth.GoogleAuthProvider();
    try { const r = await firebase.auth().signInWithPopup(p); if (r && r.user) user = r.user; }
    catch (e) { if (/popup/i.test(e.code || '')) await firebase.auth().signInWithRedirect(p); else alert('Sign-in failed: ' + (e.message || e.code)); }
  }
  async function token() { return user ? user.getIdToken() : null; }
  async function api(path, opts = {}) {
    const t = await token();
    const headers = Object.assign({}, opts.headers || {}, t ? { Authorization: 'Bearer ' + t } : {});
    const r = await fetch(path, { ...opts, headers });
    if (r.status === 204) return null;
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && user) { try { await user.getIdToken(true); } catch (_) {} }
    if (!r.ok) throw new Error(j.error || ('Request failed (' + r.status + ')'));
    return j;
  }
  function drawWayPhoto() {
    const w = $('#wayPhoto'), d = $('#wayPhotoD'); if (!w) return;
    const on = !$('#camBtn').hidden;
    w.classList.toggle('locked', !on);
    d.textContent = on ? 'Take or upload a photo; it identifies the species' : 'Photo identification is not enabled here';
  }
  function drawAccount() {
    const b = $('#avatarBtn');
    if (user) {
      b.innerHTML = user.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span style="font-weight:700;font-size:13px">${esc((user.displayName || user.email || '?').slice(0, 1).toUpperCase())}</span>`;
      $('#menu').innerHTML = `<div class="who">${esc(user.displayName || '')}<br>${esc(user.email || '')}</div><button data-act="gallery">My catches</button>${window.SG_INSTALL && window.SG_INSTALL.available() ? '<button data-act="install">Install app</button>' : ''}<button data-act="signout">Sign out</button>`;
    } else {
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`;
      $('#menu').innerHTML = `<div class="who">Sign in to identify fish from photos and keep a gallery of your catches.</div><button data-act="signin">Sign in with Google</button>${window.SG_INSTALL && window.SG_INSTALL.available() ? '<button data-act="install">Install app</button>' : ''}`;
    }
  }

  // ---------- tabs ----------
  function showView(v) {
    view = v;
    for (const b of document.querySelectorAll('#tabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === v));
    const check = v === 'check';
    for (const id of ['#ctx', '.inputbox', '#examples', '#hint', '#scanCard', '#out', '#recentWrap', '#seo']) { const el = document.querySelector(id); if (el) el.hidden = !check || (id === '#recentWrap' && !el.querySelector('button')); }
    const hero = $('#hero'); if (hero) hero.hidden = !check || !$('#heroImg').classList.contains('in');
    $('#galleryView').hidden = check;
    if (!check) loadGallery(); else if (!$('#out').innerHTML.trim() && !$('#scanCard').innerHTML.trim()) window.SG.showWelcome();
  }

  // ---------- photo -> identify ----------
  async function handleFile(file, source) {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    $('#scanCard').innerHTML = `<div class="scan"><div class="photo"><img src="${preview}" alt="Your photo"><div class="busy"><span class="spin"></span>Identifying the fish…</div></div></div>`;
    $('#out').innerHTML = '';
    $('#scanCard').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    const fd = new FormData(); fd.append('image', file, file.name || 'photo.jpg'); fd.append('source', source);
    try {
      const { scan } = await api('/api/identify', { method: 'POST', body: fd });
      currentScan = scan;
      drawScan(scan, preview);
      if (scan.speciesId != null) checkScan(scan, true);
    } catch (e) {
      $('#scanCard').innerHTML = `<div class="scan"><div class="photo"><img src="${preview}" alt=""></div><div class="body"><div class="idline"><span class="name">Couldn't identify</span></div><p class="hint">${esc(e.message)}</p></div></div>`;
    }
  }

  function confClass(c) { return c >= 0.75 ? 'hi' : c >= 0.45 ? '' : 'lo'; }
  function candRow(id, name, conf, why, isTop) {
    const pct = Math.round(conf * 100);
    return `<button class="cand${isTop ? ' top' : ''}" data-alt="${id}" ${isTop ? 'disabled' : ''}>
      <span class="cname">${esc(name)}</span><span class="cpct">${pct}%</span>
      <span class="cbar"><span style="width:${pct}%"></span></span>
      ${why ? `<span class="cwhy">${esc(why)}</span>` : ''}
      ${isTop ? '' : '<span class="cpick">Tap if this is it</span>'}
    </button>`;
  }
  function drawScan(scan, imgUrl) {
    const sp = scan.speciesId != null ? window.SG.SP.find((s) => s.id === scan.speciesId) : null;
    const sure = scan.confidence >= 0.8;
    const rows = [];
    if (sp) rows.push(candRow(sp.id, sp.name, scan.userCorrected ? 1 : scan.confidence, scan.userCorrected ? '' : scan.why, true));
    for (const a of scan.alternates || []) rows.push(candRow(a.speciesId, a.name, a.confidence, a.why, false));
    const heroSrc = imgUrl || scan.fullUrl;
    if (heroSrc) window.SG.setHero({ src: heroSrc, fallback: sp ? window.SG.SPECIES_IMG(sp.id) : null, name: sp ? sp.name : 'Your photo', sub: scan.userCorrected ? 'You chose this' : sp ? 'Identified from your photo' : 'No match' });
    $('#scanCard').innerHTML = `<div class="scan">
      <div class="photo"><img src="${esc(imgUrl || scan.fullUrl)}" alt="${esc(scan.speciesName || 'fish')}"></div>
      <div class="body">
        <div class="idline">
          <span class="name">${sp ? esc(sp.name) : 'No match in Delaware species'}</span>
          ${sp ? `<span class="conf ${confClass(scan.confidence)}">${scan.userCorrected ? 'You chose this' : (sure ? 'Likely' : 'Best guess') + ' · ' + Math.round(scan.confidence * 100) + '%'}</span>` : ''}
        </div>
        ${!sure && sp && !scan.userCorrected ? `<p class="hint" style="margin-top:6px">Not certain. Compare the candidates below and tap the right one; the regulations update instantly.</p>` : ''}
        ${scan.notes ? `<p class="hint" style="margin-top:6px">${esc(scan.notes)}</p>` : ''}
        <div class="cands">${rows.join('')}<button class="cand other" data-alt="other"><span class="cname">Something else…</span><span class="cpick">Search all species</span></button></div>
        <div class="lenrow">
          <label for="scanLen">Length</label>
          <input id="scanLen" type="number" inputmode="decimal" step="0.25" min="0" max="200" placeholder="inches" value="${scan.lengthIn ?? ''}">
          <button class="btn primary" id="scanCheck">Check</button>
          ${scan.lengthBasis ? `<span class="hint" style="margin:0">Measured from photo: ${esc(scan.lengthBasis)}</span>` : `<span class="hint" style="margin:0">No ruler in the photo - enter the length.</span>`}
        </div>
        <div class="meta">${scan.saved ? 'Saved to your gallery' : (window.firebase && $('#acct') && !$('#acct').hidden ? '<button class="linkish" data-act="signin">Sign in</button> to keep this in a gallery' : 'Not saved')} · ${new Date(scan.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${scan.verified ? ' · double-checked' : ''}</div>
      </div></div>`;
  }

  async function checkScan(scan, quiet) {
    if (scan.speciesId == null) return;
    const len = parseFloat($('#scanLen')?.value);
    const lengthIn = Number.isFinite(len) ? len : null;
    const zone = window.SG.zone;
    const text = lengthIn != null ? `${lengthIn} inch fish from photo` : 'fish from photo';
    window.SG.run(text, scan.speciesId, true);
    const v = document.querySelector('#out .verdict');
    const verdict = v ? [...v.classList].find((c) => ['keep', 'release', 'closed', 'check', 'kill'].includes(c)) : null;
    const verdictText = v ? v.querySelector('.why').textContent : '';
    if (!scan.id) { currentScan = { ...scan, lengthIn, verdict, verdictText }; return; }
    try {
      const { scan: updated } = await api('/api/scans/' + scan.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lengthIn, verdict, verdictText, zone }) });
      currentScan = { ...updated, saved: true };
    } catch (e) { /* verdict still shown; saving is best-effort */ }
  }

  async function setSpecies(scan, speciesId, imgUrl) {
    if (!scan.id) {
      const sp = window.SG.SP.find((s) => s.id === speciesId);
      const alts = (scan.alternates || []).filter((a) => a.speciesId !== speciesId);
      if (scan.speciesId != null && !alts.some((a) => a.speciesId === scan.speciesId)) alts.unshift({ speciesId: scan.speciesId, name: scan.speciesName, confidence: scan.confidence, why: scan.why });
      const updated = { ...scan, speciesId, speciesName: sp ? sp.name : null, userCorrected: true, alternates: alts.slice(0, 3) };
      currentScan = updated; drawScan(updated, imgUrl); checkScan(updated, true); return;
    }
    try {
      const { scan: updated } = await api('/api/scans/' + scan.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speciesId }) });
      currentScan = { ...updated, saved: true };
      drawScan(currentScan, imgUrl);
      checkScan(currentScan, true);
    } catch (e) { alert(e.message); }
  }

  function pickAnySpecies(onPick) {
    const list = window.SG.SP.slice().sort((a, b) => a.name.localeCompare(b.name));
    $('#out').innerHTML = `<div class="picker"><h3>Which fish is it?</h3><input id="spSearch" type="search" placeholder="Search species" style="width:100%;font:inherit;font-size:16px;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--ink);margin-bottom:10px"><div class="list" id="spList"></div></div>`;
    const draw = (q) => { $('#spList').innerHTML = list.filter((s) => !q || s.name.toLowerCase().includes(q) || s.aliases.some((a) => a.includes(q))).slice(0, 40).map((s) => `<button class="chip" data-sp="${s.id}">${esc(s.name)} <span style="color:var(--ink-3)">· ${s.habitat}</span></button>`).join(''); };
    draw('');
    $('#spSearch').addEventListener('input', (e) => draw(e.target.value.trim().toLowerCase()));
    $('#spList').addEventListener('click', (e) => { const b = e.target.closest('[data-sp]'); if (b) onPick(+b.dataset.sp); });
    $('#spSearch').focus();
  }

  // ---------- gallery ----------
  let editing = false, selected = new Set();
  async function loadGallery() {
    $('#galDetail').innerHTML = '';
    if (!user) { $('#galBody').innerHTML = `<div class="empty">Sign in to keep a gallery of your catches, sorted by species.<br><br><button class="btn primary" data-act="signin">Sign in with Google</button></div>`; $('#galStats').innerHTML = ''; return; }
    $('#galBody').innerHTML = '<div class="empty">Loading…</div>';
    try {
      const { scans, groups } = await api('/api/scans');
      selected = new Set([...selected].filter((id) => scans.some((s) => s.id === id)));
      const stats = scans.length ? `${scans.length} photo${scans.length === 1 ? '' : 's'} · ${groups.filter((g) => g.speciesId != null).length} species` : '';
      $('#galStats').innerHTML = scans.length ? (editing
        ? `<span>${selected.size ? selected.size + ' selected' : 'Tap photos to select'}</span> <button class="btn" id="galAll">${selected.size === scans.length ? 'None' : 'All'}</button> <button class="btn danger" id="galDelSel" ${selected.size ? '' : 'disabled'}>Remove${selected.size ? ' ' + selected.size : ''}</button> <button class="btn" id="galEdit">Done</button>`
        : `<span>${stats}</span> <button class="btn" id="galEdit">Select</button>`) : '';
      if (!scans.length) { editing = false; $('#galBody').innerHTML = '<div class="empty">No catches yet. Snap a photo from the Check tab and it lands here, sorted by species.</div>'; return; }
      $('#galBody').innerHTML = groups.map((g) => `<section class="species-group"><h3 class="disp">${esc(g.speciesName)} <span class="n">×${g.count}</span></h3><div class="grid${editing ? ' editing' : ''}">${g.scans.map((s) => `<button data-scan="${s.id}" class="${selected.has(s.id) ? 'sel' : ''}" title="${esc(new Date(s.createdAt).toLocaleDateString())}"><img src="${esc(s.thumbUrl)}" alt="" loading="lazy">${s.verdict ? `<span class="v ${s.verdict}">${s.verdict === 'kill' ? 'KEEP' : s.verdict === 'check' ? '?' : s.verdict.toUpperCase()}</span>` : ''}${editing ? `<span class="tick" aria-hidden="true">${selected.has(s.id) ? '✓' : ''}</span><span class="x" data-del="${s.id}" role="button" aria-label="Remove photo">×</span>` : ''}</button>`).join('')}</div></section>`).join('');
      $('#galBody').dataset.scans = JSON.stringify(scans);
    } catch (e) { $('#galBody').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  function askConfirm(message, okLabel) {
    return new Promise((resolve) => {
      const old = $('#confirmBar'); if (old) old.remove();
      const bar = document.createElement('div'); bar.id = 'confirmBar'; bar.className = 'confirm';
      bar.innerHTML = `<span>${esc(message)}</span><span class="acts"><button class="btn" data-c="no">Cancel</button><button class="btn danger solid" data-c="yes">${esc(okLabel)}</button></span>`;
      document.body.appendChild(bar);
      bar.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; bar.remove(); resolve(b.dataset.c === 'yes'); });
    });
  }
  async function deleteScans(ids) {
    if (!ids.length) return;
    const ok = await askConfirm(ids.length === 1 ? 'Remove this photo from your gallery?' : `Remove ${ids.length} photos from your gallery?`, ids.length === 1 ? 'Remove' : `Remove ${ids.length}`);
    if (!ok) return;
    $('#galStats').innerHTML = '<span>Removing…</span>';
    try { await api('/api/scans/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }); }
    catch (e) { $('#galBody').insertAdjacentHTML('afterbegin', `<div class="empty">${esc(e.message)}</div>`); }
    for (const id of ids) selected.delete(id);
    $('#galDetail').innerHTML = '';
    loadGallery();
  }

  function showDetail(scan) {
    const sp = scan.speciesId != null ? window.SG.SP.find((s) => s.id === scan.speciesId) : null;
    $('#galDetail').innerHTML = `<div class="scan">
      <div class="photo"><img src="${esc(scan.fullUrl)}" alt=""></div>
      <div class="body">
        <div class="idline"><span class="name">${sp ? esc(sp.name) : 'Unidentified'}</span>${scan.verdict ? `<span class="conf ${scan.verdict === 'keep' || scan.verdict === 'kill' ? 'hi' : scan.verdict === 'check' ? 'lo' : ''}">${scan.verdict === 'kill' ? 'KEEP (invasive)' : scan.verdict.toUpperCase()}</span>` : ''}</div>
        <div class="meta">${new Date(scan.createdAt).toLocaleString()} · ${scan.lengthIn != null ? window.SG.fmtIn(scan.lengthIn) + ' in' : 'no length'} · ${Math.round((scan.confidence || 0) * 100)}% ID confidence${scan.userCorrected ? ' (corrected by you)' : ''}</div>
        ${scan.verdictText ? `<p class="hint" style="margin-top:8px">${esc(scan.verdictText)}</p>` : ''}
        <div class="detail-actions">
          <button class="btn primary" data-dact="recheck">Re-check today</button>
          <button class="btn" data-dact="species">Change species</button>
          <button class="btn danger" data-dact="delete">Delete</button>
          <button class="btn" data-dact="close">Close</button>
        </div>
      </div></div>`;
    $('#galDetail').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    $('#galDetail').onclick = async (e) => {
      const b = e.target.closest('[data-dact]'); if (!b) return;
      if (b.dataset.dact === 'close') $('#galDetail').innerHTML = '';
      if (b.dataset.dact === 'delete') { deleteScans([scan.id]); }
      if (b.dataset.dact === 'recheck') { currentScan = scan; showView('check'); drawScan(scan, scan.fullUrl); checkScan(scan, true); }
      if (b.dataset.dact === 'species') { currentScan = scan; showView('check'); drawScan(scan, scan.fullUrl); pickAnySpecies((id) => setSpecies(scan, id, scan.fullUrl)); }
    };
  }

  // ---------- events ----------
  function wire() {
    $('#camBtn').addEventListener('click', () => $('#camInput').click());
    $('#upBtn').addEventListener('click', () => $('#upInput').click());
    $('#camInput').addEventListener('change', (e) => { handleFile(e.target.files[0], 'camera'); e.target.value = ''; });
    $('#upInput').addEventListener('change', (e) => { handleFile(e.target.files[0], 'upload'); e.target.value = ''; });
    $('#avatarBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#menu').hidden = !$('#menu').hidden; });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#acct')) $('#menu').hidden = true;
      const a = e.target.closest('[data-act]');
      if (a) { $('#menu').hidden = true; if (a.dataset.act === 'signin') signIn(); if (a.dataset.act === 'signout') firebase.auth().signOut(); if (a.dataset.act === 'gallery') showView('gallery'); }
      const tab = e.target.closest('#tabs [data-tab]'); if (tab) showView(tab.dataset.tab);
      const alt = e.target.closest('#scanCard [data-alt]');
      if (alt && currentScan) { const img = $('#scanCard img')?.src; if (alt.dataset.alt === 'other') pickAnySpecies((id) => setSpecies(currentScan, id, img)); else setSpecies(currentScan, +alt.dataset.alt, img); }
      if (e.target.closest('#scanCheck') && currentScan) checkScan(currentScan);
      if (e.target.closest('#galEdit')) { editing = !editing; if (!editing) selected.clear(); loadGallery(); return; }
      if (e.target.closest('#galDelSel')) { deleteScans([...selected]); return; }
      if (e.target.closest('#galAll')) { const scans = JSON.parse($('#galBody').dataset.scans || '[]'); if (selected.size === scans.length) selected.clear(); else scans.forEach((s) => selected.add(s.id)); loadGallery(); return; }
      const x = e.target.closest('#galBody [data-del]');
      if (x) { e.stopPropagation(); deleteScans([x.dataset.del]); return; }
      const g = e.target.closest('#galBody [data-scan]');
      if (g) {
        if (editing) {
          const id = g.dataset.scan; selected.has(id) ? selected.delete(id) : selected.add(id);
          g.classList.toggle('sel', selected.has(id)); const tk = g.querySelector('.tick'); if (tk) tk.textContent = selected.has(id) ? '✓' : '';
          const scans = JSON.parse($('#galBody').dataset.scans || '[]');
          $('#galStats').querySelector('span').textContent = selected.size ? selected.size + ' selected' : 'Tap photos to select';
          const del = $('#galDelSel'); del.disabled = !selected.size; del.textContent = 'Remove' + (selected.size ? ' ' + selected.size : '');
          $('#galAll').textContent = selected.size === scans.length ? 'None' : 'All';
          return;
        }
        const scans = JSON.parse($('#galBody').dataset.scans || '[]'); const s = scans.find((x) => x.id === g.dataset.scan); if (s) showDetail(s);
      }
    });
    $('#scanCard').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'scanLen' && currentScan) { e.preventDefault(); checkScan(currentScan); } });
  }

  init();
})();
