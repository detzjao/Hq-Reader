const SHELL_CACHE = 'hq-reader-shell-v3';
const RUNTIME_CACHE = 'hq-reader-runtime-v3';
const OFFLINE_CACHE = 'hq-reader-offline-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('hq-reader-shell-') && key !== SHELL_CACHE).map((key) => caches.delete(key)));
    await Promise.all(keys.filter((key) => key.startsWith('hq-reader-runtime-') && key !== RUNTIME_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function baseRequest(request) {
  return new Request(request.url, { method: 'GET', headers: {}, mode: request.mode, credentials: request.credentials, redirect: request.redirect });
}

function parseRange(range, size) {
  const match = String(range || '').match(/bytes=(\d*)-(\d*)/i);
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!match[1] && match[2]) {
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function offlineMatch(request) {
  const cache = await caches.open(OFFLINE_CACHE);
  const cached = await cache.match(request.url, { ignoreVary: true });
  if (!cached) return null;

  const range = request.headers.get('range');
  if (!range || cached.type === 'opaque') return cached;

  const buffer = await cached.arrayBuffer();
  const selected = parseRange(range, buffer.byteLength);
  if (!selected) return cached;
  const headers = new Headers(cached.headers);
  headers.set('Content-Range', `bytes ${selected.start}-${selected.end}/${buffer.byteLength}`);
  headers.set('Content-Length', String(selected.end - selected.start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(buffer.slice(selected.start, selected.end + 1), { status: 206, statusText: 'Partial Content', headers });
}

async function networkFirst(request, cacheName = RUNTIME_CACHE) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  const update = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || update || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    const saved = await offlineMatch(request);
    if (saved) return saved;

    const url = new URL(request.url);
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request);
        const shell = await caches.open(SHELL_CACHE);
        await shell.put('/index.html', response.clone());
        return response;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/'));
      }
    }

    if (url.origin === self.location.origin && /^\/api\/(?:comics|comic|archive)/.test(url.pathname)) {
      return networkFirst(request);
    }

    if (url.origin === self.location.origin && /^\/api\/(?:content|download)/.test(url.pathname)) {
      return fetch(request);
    }

    if (url.origin === self.location.origin) return staleWhileRevalidate(request);

    try { return await fetch(request); } catch {
      const runtime = await caches.open(RUNTIME_CACHE);
      return (await runtime.match(request, { ignoreVary: true })) || Response.error();
    }
  })());
});
