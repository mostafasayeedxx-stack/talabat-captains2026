/* =====================================================================
 * Talabat Captains Hub — sw.js (Service Worker)  v2
 *
 * الاستراتيجية: Network-First للملفات الأساسية (captain.html و meta.json و manifest والأيقونات):
 *   - دائماً نجلب النسخة الأحدث من الشبكة (بدون كاش HTTP) ونحفظ نسخة احتياطية.
 *   - لا نستخدم النسخة المحفوظة إلا عند انقطاع الاتصال.
 *   => أي تحديث يرفعه الأدمن على GitHub يصل للكباتن تلقائياً، بدون Ctrl+Shift+R وبدون مسح كاش.
 * ملفات البيانات المشفرة (data/*.bin) لا يتدخل فيها الـ SW (متصفح الكابتن يتعامل معها مباشرة).
 * ضع هذا الملف بجانب captain.html في المستودع (نفس المجلد).
 * ===================================================================== */
'use strict';

const CACHE = 'captain-shell-v3';
const SHELL = ['captain.html', 'manifest.webmanifest', 'icons/icon-192.png'];
// ملفات تُجلب Network-First: صفحة التطبيق، meta.json، الـ manifest، الأيقونات
const NETWORK_FIRST = /(?:^|\/)(?:captain\.html|meta\.json|manifest\.webmanifest|icons\/[^/]+)$/;

self.addEventListener('install', (e) => {
  self.skipWaiting();   // النسخة الجديدة تُفعَّل فوراً
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));   // يمسح أي كاش قديم تلقائياً
    await self.clients.claim();
    (await self.clients.matchAll()).forEach((c) => c.postMessage({ type: 'SW_UPDATED' }));   // the page shows a soft-reload toast
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                       // Google Sign-In / جسر Apps Script: لا نتدخل
  const isNav = req.mode === 'navigate';
  if (!isNav && !NETWORK_FIRST.test(url.pathname)) return;               // data/*.bin وغيرها: مباشرة من الشبكة
  e.respondWith(networkFirst(req, url, isNav));
});

async function networkFirst(req, url, isNav) {
  const cache = await caches.open(CACHE);
  const key = url.origin + url.pathname;                                 // نحفظ بدون الـ query (?t=...)
  try {
    const res = await fetch(new Request(req.url, { cache: 'no-store', credentials: 'same-origin' }));
    if (res && res.ok) cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch (_) {                                                          // لا اتصال: النسخة المحفوظة
    return (await cache.match(key)) || (isNav ? await cache.match(new URL('captain.html', self.location.href).href) : null) || Response.error();
  }
}
