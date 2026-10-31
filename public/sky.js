// Ocean theme sky: a quiet full-screen canvas behind the page that follows the live weather
// (clear / partly / cloudy / fog / rain / storm / snow / wind, day or night). Minimal by design.
(function () {
  const canvas = document.createElement('canvas'); canvas.id = 'sky'; canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, raf = 0, sky = 'partly', night = false, lastFlash = 0, running = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const R = (a, b) => a + Math.random() * (b - a);
  let clouds = [], drops = [], flakes = [], stars = [], fog = [], motes = [];

  function size() { dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); seed(); }
  function seed() {
    const n = { clear: 0, partly: 3, cloudy: 6, fog: 2, rain: 4, storm: 5, snow: 3, wind: 4 }[sky] || 3;
    clouds = Array.from({ length: n }, (_, i) => ({ x: R(-0.2, 1) * W, y: R(0.03, 0.35) * H, s: R(0.9, 1.6), v: R(6, 14) * (sky === 'wind' ? 3 : 1), a: sky === 'cloudy' || sky === 'storm' ? R(0.14, 0.22) : R(0.08, 0.16), seed: i * 7.3 }));
    drops = (sky === 'rain' || sky === 'storm') ? Array.from({ length: sky === 'storm' ? 90 : 55 }, () => ({ x: R(0, W), y: R(0, H), l: R(10, 22), v: R(380, 560) })) : [];
    flakes = sky === 'snow' ? Array.from({ length: 70 }, () => ({ x: R(0, W), y: R(0, H), r: R(1, 2.6), v: R(18, 40), w: R(0, 6.28) })) : [];
    stars = night ? Array.from({ length: 70 }, () => ({ x: R(0, W), y: R(0, H * 0.6), r: R(0.5, 1.4), p: R(0, 6.28) })) : [];
    fog = sky === 'fog' ? Array.from({ length: 5 }, (_, i) => ({ y: R(0.1, 0.9) * H, h: R(60, 140), v: R(4, 10) * (i % 2 ? 1 : -1), a: R(0.05, 0.1), o: R(0, W) })) : [];
    motes = (sky === 'clear' || sky === 'partly') && !night ? Array.from({ length: 14 }, () => ({ x: R(0, W), y: R(0, H), r: R(0.8, 2), v: R(3, 8), p: R(0, 6.28) })) : [];
  }

  function cloud(c, t) {
    const x = ((c.x + c.v * t) % (W + 320 * c.s)) - 160 * c.s, y = c.y + Math.sin(t * 0.15 + c.seed) * 4;
    ctx.save(); ctx.globalAlpha = c.a; ctx.fillStyle = night ? '#9fb7c6' : '#ffffff';
    const s = c.s;
    for (const [dx, dy, r] of [[0, 0, 34], [36, -10, 42], [78, 0, 34], [40, 12, 30], [-8, 12, 24]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, 6.29); ctx.fill(); }
    ctx.restore();
  }
  function sun(t) {
    const x = W * 0.82, y = H * 0.12, r = Math.min(W, H) * 0.09;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4.2); g.addColorStop(0, 'rgba(255,236,170,0.55)'); g.addColorStop(0.25, 'rgba(255,220,120,0.22)'); g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r * 4.2, y - r * 4.2, r * 8.4, r * 8.4);
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.02); ctx.globalAlpha = 0.07; ctx.fillStyle = '#fff3c4';
    for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r * 0.9, r * 4.5); ctx.lineTo(r * 0.9, r * 4.5); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 6.29); ctx.fillStyle = 'rgba(255,245,200,0.85)'; ctx.fill();
  }
  function moon(t) {
    const x = W * 0.8, y = H * 0.12, r = Math.min(W, H) * 0.05;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4); g.addColorStop(0, 'rgba(220,235,255,0.35)'); g.addColorStop(1, 'rgba(220,235,255,0)'); ctx.fillStyle = g; ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.29); ctx.fillStyle = 'rgba(240,246,255,0.9)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.45, y - r * 0.15, r * 0.85, 0, 6.29); ctx.fillStyle = 'rgba(6,48,74,0.9)'; ctx.fill();
    for (const s of stars) { ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(t * 0.8 + s.p)); ctx.fillStyle = '#eaf6ff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.29); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  let t0 = performance.now();
  function frame(now) {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    if (night) moon(t); else if (sky === 'clear' || sky === 'partly' || sky === 'wind') sun(t);
    for (const m of motes) { const y = (m.y - m.v * t) % H, yy = y < 0 ? y + H : y; ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t + m.p); ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.arc(m.x + Math.sin(t * 0.3 + m.p) * 8, yy, m.r, 0, 6.29); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const c of clouds) cloud(c, t);
    for (const f of fog) { const x = ((f.o + f.v * t) % (W * 2)) - W; const g = ctx.createLinearGradient(0, f.y, 0, f.y + f.h); g.addColorStop(0, 'rgba(230,240,245,0)'); g.addColorStop(0.5, `rgba(230,240,245,${f.a})`); g.addColorStop(1, 'rgba(230,240,245,0)'); ctx.fillStyle = g; ctx.fillRect(x, f.y, W * 2, f.h); ctx.fillRect(x - W * 2, f.y, W * 2, f.h); }
    if (drops.length) { ctx.strokeStyle = 'rgba(205,235,245,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); for (const d of drops) { const y = (d.y + d.v * t) % (H + 30) - 20, x = (d.x + t * 40) % (W + 20) - 10; ctx.moveTo(x, y); ctx.lineTo(x - 2, y + d.l); } ctx.stroke(); }
    if (sky === 'storm') { if (now - lastFlash > 7000 + Math.random() * 9000) lastFlash = now; const age = now - lastFlash; if (age < 220) { ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - age / 220)})`; ctx.fillRect(0, 0, W, H); } }
    for (const f of flakes) { const y = (f.y + f.v * t) % (H + 10) - 5, x = f.x + Math.sin(t * 0.7 + f.w) * 14; ctx.globalAlpha = 0.75; ctx.fillStyle = '#f4fbff'; ctx.beginPath(); ctx.arc(x, y, f.r, 0, 6.29); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (running && !reduced) raf = requestAnimationFrame(frame);
  }

  function start() { if (!canvas.isConnected) document.body.prepend(canvas); size(); running = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); if (canvas.isConnected) canvas.remove(); }
  function active() { return document.documentElement.getAttribute('data-theme') === 'ocean'; }
  function set(s, n) { sky = s || sky; night = !!n; if (running) { size(); } }
  function sync() { if (active()) { if (!running) start(); } else if (running) stop(); }

  window.addEventListener('resize', () => running && size());
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else if (running && !reduced) raf = requestAnimationFrame(frame); });
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('sg:weather', (e) => { set(e.detail?.sky, e.detail?.night); });
  window.SG_SKY = { set, sync, get sky() { return sky; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
})();
