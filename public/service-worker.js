const CACHE = 'marees-v4-2';
const DATA_CACHE_KEY = '/api/tides?days=30';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nextCache = await caches.open(CACHE);
    const cacheNames = await caches.keys();

    // Conserver la dernière réponse API valide lors du passage depuis une ancienne version.
    for (const cacheName of cacheNames) {
      if (cacheName === CACHE) continue;
      const oldCache = await caches.open(cacheName);
      const requests = await oldCache.keys();
      for (const request of requests) {
        const url = new URL(request.url);
        if (url.pathname === '/api/tides') {
          const response = await oldCache.match(request);
          if (response?.ok) await nextCache.put(DATA_CACHE_KEY, response.clone());
        }
      }
    }

    await Promise.all(cacheNames.filter(name => name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname === '/api/tides') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(DATA_CACHE_KEY, response.clone());
        return response;
      } catch {
        const cached = await cache.match(DATA_CACHE_KEY);
        return cached || new Response(JSON.stringify({ error: 'Données indisponibles hors connexion' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
    })());
    return;
  }

  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      return response;
    } catch {
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      throw new Error('Ressource indisponible hors connexion');
    }
  })());
});
