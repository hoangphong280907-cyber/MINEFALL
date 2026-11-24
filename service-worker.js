/* MINEFALL PWA service worker. Bump CACHE_NAME when the app shell changes. */
'use strict';

const CACHE_NAME = 'minefall-pwa-1.0.0-rc.4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa.js',
  '/online.css',
  '/arena-visuals.css',
  '/cosmetics.js',
  '/engine.js',
  '/arena-visuals.js',
  '/online-client.js',
  '/assets/pwa/icon-192.png',
  '/assets/pwa/icon-512.png',
  '/assets/pwa/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('minefall-pwa-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/health' || url.pathname === '/ws') return;

  // HTML is network-first so players receive new releases; cached app shell is the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match('/index.html');
        return cached || new Response('MINEFALL chưa được lưu trên thiết bị. Hãy kết nối Internet và mở lại ứng dụng.', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Same-origin scripts, styles, icons and game assets are network-first and cached for offline use.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});
