// The species page: tap the hero image and you get everything SlotGauge knows about that fish —
// today's rule for where you are, the agency's own wording, background from Wikipedia, and the
// photos you have taken of it.
//
// Two things this file deliberately does NOT do:
//   - it never shows a KEEP/RELEASE verdict. There is no length here, so a verdict would be a guess.
//     It shows the rule and lets the checker answer the question.
//   - it never invents background. If Wikipedia has nothing for this species, the About block is
//     simply absent rather than padded with filler.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = (p, o) => (window.SG && window.SG.api ? window.SG.api(p, o) : fetch(p, o).then((r) => r.json()));

  let current = null;          // species id being shown
  const infoCache = new Map(); // id -> info | null (null = looked up, nothing there)

  function ensureView() {
    if ($('#speciesView')) return;
    const sec = document.createElement('section');
    sec.id = 'speciesView';
    sec.hidden = true;
    sec.innerHTML = '<div class="tv-head"><button class="tv-back" type="button" data-sp="back">‹ Checker</button><h2 class="disp" id="spTitle"></h2></div><div id="spBody"></div>';
    (document.querySelector('#galleryView') || document.body).insertAdjacentElement('beforebegin', sec);
    sec.addEventListener('click', (e) => {
      if (e.target.closest('[data-sp="back"]')) window.SG.showView('check');
      const check = e.target.closest('[data-sp="check"]');
      if (check) { window.SG.showView('check'); const q = $('#q'); if (q) { q.value = check.dataset.name; q.focus(); } }
    });
  }

  // Today's rule for this species, in the zone the checker is currently using.
  function ruleHtml(sp) {
    const SG = window.SG;
    const r = SG.evaluate(sp, { date: new Date(), length: null, count: null, zone: null });
    const zl = (z) => esc(z.label || SG.ZONES[z.zone] || z.zone);
    const notes = [...(r.zone.sizeNote ? ['Size detail: ' + r.zone.sizeNote] : []), ...(sp.notes || [])];
    const others = sp.zones.filter((z) => z.zone !== r.usedZone);
    const agency = SG.AGENCY || 'Official';
    return `
<div class="tv-card sp-rule">
  <div class="facts">
    <div class="fact"><div class="k">Season</div><div class="v small">${esc(r.season.text)}</div></div>
    <div class="fact"><div class="k">Size</div><div class="v small">${esc(r.sizeText)}</div></div>
    <div class="fact"><div class="k">Daily limit</div><div class="v small">${esc(r.bagText)}</div></div>
  </div>
  ${others.length ? `<p class="hint" style="margin-top:10px">Rules shown for <strong>${zl(sp.zones.find((z) => z.zone === r.usedZone) || { zone: r.usedZone })}</strong>. Also has rules for ${others.map(zl).join(', ')}.</p>` : ''}
  ${notes.length ? `<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
  ${sp.raw ? `<details class="rawtxt"><summary>Exact ${esc(agency)} wording</summary><dl><dt>Season</dt><dd>${esc(sp.raw.season)}</dd><dt>Size</dt><dd>${esc(sp.raw.size)}</dd><dt>Limit</dt><dd>${esc(sp.raw.limit)}</dd></dl></details>` : ''}
  <div class="src">
    <button class="btn primary" type="button" data-sp="check" data-name="${esc(sp.name)}">Check one of these</button>
    ${sp.url ? `<a href="${esc(sp.url)}" target="_blank" rel="noopener">${esc(agency)} source page ↗</a>` : ''}
  </div>
</div>`;
  }

  function aboutHtml(info) {
    if (!info || !info.extract) return '';
    return `
<div class="tv-card sp-about">
  <h3 class="disp">About the ${esc(info.title || '')}</h3>
  <p>${esc(info.extract)}</p>
  ${info.url ? `<p class="hint">From Wikipedia${info.license ? ` · ${esc(info.license.name)}` : ''} · <a href="${esc(info.url)}" target="_blank" rel="noopener">Read more ↗</a></p>` : ''}
</div>`;
  }

  function photosHtml(state) {
    if (state.status === 'anon') return '<div class="tv-card sp-shots"><h3 class="disp">Your photos</h3><p class="hint">Sign in and your photos of this fish collect here.</p></div>';
    if (state.status === 'loading') return '<div class="tv-card sp-shots"><h3 class="disp">Your photos</h3><p class="hint">Loading…</p></div>';
    if (state.status === 'error') return '';
    if (!state.scans.length) return '<div class="tv-card sp-shots"><h3 class="disp">Your photos</h3><p class="hint">None yet. Snap one from the Check tab and it lands here.</p></div>';
    return `
<div class="tv-card sp-shots">
  <h3 class="disp">Your photos <span class="n">×${state.scans.length}</span></h3>
  <div class="grid">${state.scans.map((s) => `<button type="button" data-sp-scan="${esc(s.id)}" title="${esc(new Date(s.createdAt).toLocaleDateString())}"><img src="${esc(s.thumbUrl)}" alt="" loading="lazy">${s.verdict ? `<span class="v ${esc(s.verdict)}">${s.verdict === 'kill' ? 'KEEP' : s.verdict === 'check' ? '?' : esc(s.verdict.toUpperCase())}</span>` : ''}</button>`).join('')}</div>
</div>`;
  }

  function draw(sp, info, shots) {
    $('#spTitle').textContent = sp.name;
    const img = sp.photo || window.SG.SPECIES_IMG(sp.id);
    $('#spBody').innerHTML = `
<div class="hero illus sp-hero"><img src="${esc(img)}" alt="${esc(sp.name)}"></div>
${sp.family || sp.habitat ? `<p class="hint sp-sub">${esc(sp.family || '')}${sp.family && sp.habitat ? ' · ' : ''}${esc(sp.habitat || '')}</p>` : ''}
${ruleHtml(sp)}
${aboutHtml(info)}
${photosHtml(shots)}`;
    const hi = $('#spBody .sp-hero img'); if (hi) hi.classList.add('in');
  }

  // The gallery lives behind auth. A signed-out visitor gets an invitation, not an error — and the
  // server's 401 is the authority on that, not a guess about the auth library being loaded.
  async function loadShots(sp) {
    try {
      const j = await api('/api/scans');
      const g = (j.groups || []).find((x) => x.speciesId === sp.id);
      return { status: 'ok', scans: g ? g.scans : [] };
    } catch (e) {
      return { status: e && (e.status === 401 || e.status === 403) ? 'anon' : 'error', scans: [] };
    }
  }

  async function open(id) {
    ensureView();
    const sp = window.SG.findSp(Number(id));
    if (!sp) return;
    current = sp.id;
    window.SG.showView('species');
    draw(sp, infoCache.get(sp.id) || null, { status: 'loading', scans: [] });

    const [info, shots] = await Promise.all([
      infoCache.has(sp.id) ? Promise.resolve(infoCache.get(sp.id)) : api(`/api/species/${sp.id}/info`).then((j) => j.info || null).catch(() => null),
      loadShots(sp),
    ]);
    infoCache.set(sp.id, info);
    if (current !== sp.id) return;   // user navigated away while we were fetching
    draw(sp, info, shots);
  }

  function init() {
    if (!window.SG || !window.SG.registerView) return setTimeout(init, 150);
    ensureView();
    window.SG.registerView('species', '#speciesView');
    window.SG_SPECIES = { open };
    // The hero is the entry point: it already shows the fish you last looked at.
    const hero = document.querySelector('#hero');
    if (hero) hero.addEventListener('click', () => { const id = hero.dataset.species; if (id) open(id); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
