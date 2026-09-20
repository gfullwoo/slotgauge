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
    if (!cfg.features?.scans || !cfg.firebase?.apiKey) return; // feature off on this deployment
    if (cfg.firebase.apiKey === 'dev') window.firebase = fakeFirebase(); else if (!window.firebase) return;
    firebase.initializeApp(cfg.firebase);
    $('#tabs').hidden = false; $('#acct').hidden = false; $('#camBtn').hidden = false; $('#upBtn').hidden = false;
    $('#hint').textContent = 'Type or say the fish, or snap a photo. Add the length and where you are fishing.';
    firebase.auth().onAuthStateChanged((u) => { user = u; drawAccount(); if (view === 'gallery') loadGallery(); });
    firebase.auth().getRedirectResult().catch(() => {});
    wire();
  }

  // ---------- auth ----------
  async function signIn() {
    const p = new firebase.auth.GoogleAuthProvider();
    try { await firebase.auth().signInWithPopup(p); }
    catch (e) { if (/popup/i.test(e.code || '')) await firebase.auth().signInWithRedirect(p); else alert('Sign-in failed: ' + (e.message || e.code)); }
  }
  async function token() { return user ? user.getIdToken() : null; }
  async function api(path, opts = {}) {
    const t = await token();
    const headers = Object.assign({}, opts.headers || {}, t ? { Authorization: 'Bearer ' + t } : {});
    const r = await fetch(path, { ...opts, headers });
    if (r.status === 204) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('Request failed (' + r.status + ')'));
    return j;
  }
  function drawAccount() {
    const b = $('#avatarBtn');
    if (user) {
      b.innerHTML = user.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span style="font-weight:700;font-size:13px">${esc((user.displayName || user.email || '?').slice(0, 1).toUpperCase())}</span>`;
      $('#menu').innerHTML = `<div class="who">${esc(user.displayName || '')}<br>${esc(user.email || '')}</div><button data-act="gallery">My catches</button><button data-act="signout">Sign out</button>`;
    } else {
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`;
      $('#menu').innerHTML = `<div class="who">Sign in to identify fish from photos and keep a gallery of your catches.</div><button data-act="signin">Sign in with Google</button>`;
    }
  }

  // ---------- tabs ----------
  function showView(v) {
    view = v;
    for (const b of document.querySelectorAll('#tabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === v));
    const check = v === 'check';
    for (const id of ['#ctx', '.inputbox', '#examples', '#hint', '#scanCard', '#out', '#recentWrap']) { const el = document.querySelector(id); if (el) el.hidden = !check || (id === '#recentWrap' && !el.querySelector('button')); }
    $('#galleryView').hidden = check;
    if (!check) loadGallery();
  }

  // ---------- photo -> identify ----------
  async function handleFile(file, source) {
    if (!file) return;
    if (!user) { await signIn(); if (!user) return; }
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
  function drawScan(scan, imgUrl) {
    const sp = scan.speciesId != null ? window.SG.SP.find((s) => s.id === scan.speciesId) : null;
    const alts = (scan.alternates || []).map((a) => `<button class="chip" data-alt="${a.speciesId}">${esc(a.name)} <span style="color:var(--ink-3)">${Math.round(a.confidence * 100)}%</span></button>`).join('');
    $('#scanCard').innerHTML = `<div class="scan">
      <div class="photo"><img src="${esc(imgUrl || scan.fullUrl)}" alt="${esc(scan.speciesName || 'fish')}"></div>
      <div class="body">
        <div class="idline"><span class="name">${sp ? esc(sp.name) : 'No match in Delaware species'}</span>
          ${sp ? `<span class="conf ${confClass(scan.confidence)}">${Math.round(scan.confidence * 100)}% sure${scan.userCorrected ? ' · corrected' : ''}</span>` : ''}</div>
        ${scan.notes ? `<p class="hint" style="margin-top:6px">${esc(scan.notes)}</p>` : ''}
        <div class="alts">${alts}<button class="chip" data-alt="other">Different fish…</button></div>
        <div class="lenrow">
          <label for="scanLen">Length</label>
          <input id="scanLen" type="number" inputmode="decimal" step="0.25" min="0" max="200" placeholder="inches" value="${scan.lengthIn ?? ''}">
          <button class="btn primary" id="scanCheck">Check</button>
          ${scan.lengthBasis ? `<span class="hint" style="margin:0">Measured from photo: ${esc(scan.lengthBasis)}</span>` : `<span class="hint" style="margin:0">No ruler in the photo - enter the length.</span>`}
        </div>
        <div class="meta">Saved to your gallery · ${new Date(scan.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
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
    try {
      const { scan: updated } = await api('/api/scans/' + scan.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lengthIn, verdict, verdictText, zone }) });
      currentScan = updated;
    } catch (e) { /* verdict still shown; saving is best-effort */ }
  }

  async function setSpecies(scan, speciesId, imgUrl) {
    try {
      const { scan: updated } = await api('/api/scans/' + scan.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speciesId }) });
      currentScan = updated;
      drawScan(updated, imgUrl);
      checkScan(updated, true);
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
  async function loadGallery() {
    $('#galDetail').innerHTML = '';
    if (!user) { $('#galBody').innerHTML = `<div class="empty">Sign in to see your catches.<br><br><button class="btn primary" data-act="signin">Sign in with Google</button></div>`; $('#galStats').textContent = ''; return; }
    $('#galBody').innerHTML = '<div class="empty">Loading…</div>';
    try {
      const { scans, groups } = await api('/api/scans');
      $('#galStats').textContent = scans.length ? `${scans.length} photo${scans.length === 1 ? '' : 's'} · ${groups.filter((g) => g.speciesId != null).length} species` : '';
      if (!scans.length) { $('#galBody').innerHTML = '<div class="empty">No catches yet. Snap a photo from the Check tab and it lands here, sorted by species.</div>'; return; }
      $('#galBody').innerHTML = groups.map((g) => `<section class="species-group"><h3 class="disp">${esc(g.speciesName)} <span class="n">×${g.count}</span></h3><div class="grid">${g.scans.map((s) => `<button data-scan="${s.id}" title="${esc(new Date(s.createdAt).toLocaleDateString())}"><img src="${esc(s.thumbUrl)}" alt="" loading="lazy">${s.verdict ? `<span class="v ${s.verdict}">${s.verdict === 'kill' ? 'KEEP' : s.verdict === 'check' ? '?' : s.verdict.toUpperCase()}</span>` : ''}</button>`).join('')}</div></section>`).join('');
      $('#galBody').dataset.scans = JSON.stringify(scans);
    } catch (e) { $('#galBody').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
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
      if (b.dataset.dact === 'delete') { if (confirm('Delete this photo from your gallery?')) { await api('/api/scans/' + scan.id, { method: 'DELETE' }); loadGallery(); } }
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
      const g = e.target.closest('#galBody [data-scan]');
      if (g) { const scans = JSON.parse($('#galBody').dataset.scans || '[]'); const s = scans.find((x) => x.id === g.dataset.scan); if (s) showDetail(s); }
    });
    $('#scanCard').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'scanLen' && currentScan) { e.preventDefault(); checkScan(currentScan); } });
  }

  init();
})();
