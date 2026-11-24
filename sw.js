'use strict';
const CACHE = 'talabat-pwa-shell-v2';
const SHELL = ['index.html', 'captain.html', 'manifest.webmanifest', 'styles/pwa.css', 'scripts/i18n.js', 'scripts/idb.js', 'scripts/hub-core.js', 'scripts/ui.js', 'scripts/crypto-sync.js', 'scripts/app.js', 'icons/icon-192.png'];
const NETWORK_FIRST = /(?:^|\/)(?:index\.html|captain\.html|meta\.json|manifest\.webmanifest|styles\/[^/]+|scripts\/[^/]+|icons\/[^/]+)$/;
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null))))); });
self.addEventListener('activate', (e) => { e.waitUntil((async () => { const keys = await caches.keys(); await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))); await self.clients.claim(); })()); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  const isNav = req.mode === 'navigate'; if (!isNav && !NETWORK_FIRST.test(url.pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE), key = url.origin + url.pathname;
    try { const res = await fetch(new Request(req.url, { cache: 'no-store', credentials: 'same-origin' })); if (res && res.ok) cache.put(key, res.clone()).catch(() => {}); return res; }
    catch (_) { return (await cache.match(key)) || (isNav ? await cache.match(new URL('index.html', self.location.href).href) : null) || Response.error(); }
  })());
});