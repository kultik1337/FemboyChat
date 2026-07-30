/*
 * FemboyChat service worker.
 *
 * Deliberately conservative. The app shell is served NETWORK-FIRST so a fresh
 * Cloudflare Pages build can never be masked by a stale cache — the one thing a
 * naive service worker always gets wrong. Only hashed build output under
 * /assets/ is cache-first, and that is safe because those file names change on
 * every build, so a cached entry can never be the wrong version.
 *
 * Cross-origin requests (Supabase, fonts) are not touched at all: they are left
 * to the network so auth, realtime and storage behave exactly as before.
 */

const CACHE = 'fc-shell-v1'
const SHELL = ['/', '/icon.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// The page asks a freshly installed worker to take over instead of waiting for
// every tab to close.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

function cachePut(request, response) {
  const copy = response.clone()
  caches
    .open(CACHE)
    .then((cache) => cache.put(request, copy))
    .catch(() => undefined)
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch (err) {
    return
  }
  if (url.origin !== self.location.origin) return

  // Navigations: network first, cached shell only as an offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut('/', response)
          return response
        })
        .catch(() => caches.match('/').then((hit) => hit || Response.error())),
    )
    return
  }

  // Hashed build output is immutable — cache first, no revalidation needed.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            cachePut(request, response)
            return response
          }),
      ),
    )
    return
  }

  // Everything else same-origin (icon, manifest): network first, cache as backup.
  event.respondWith(
    fetch(request)
      .then((response) => {
        cachePut(request, response)
        return response
      })
      .catch(() => caches.match(request).then((hit) => hit || Response.error())),
  )
})
