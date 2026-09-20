// Minimal offline cache: app shell + last good copy of the regs.
const SHELL = 'sg-shell-v2';
const ASSETS = ['/', '/index.html', '/scans.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/regs') return; // never cache user data
  if (url.pathname.startsWith('/__/') || url.pathname.startsWith('/dev-blob/')) return;
  // network-first for regs and the page, cache-first for everything else
  if (url.pathname === '/api/regs' || url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('.js')) {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); return r; })));
  }
});
