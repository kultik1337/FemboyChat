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
 *
 * NOTHING here should ever run inside the installed desktop program — see
 * isDesktopOrigin() below.
 */

/* The cache name is versioned so a bad generation can be abandoned wholesale:
   activate() deletes every cache whose name is not the current one. Bumped to
   v3 together with the desktop self-destruct, so desktop installs that were
   stuck on a cached build drop everything they had. */
const CACHE = 'fc-shell-v3'
const SHELL = ['/', '/icon.png', '/manifest.webmanifest']

/*
 * Tauri serves the bundled interface from `http://tauri.localhost` (and
 * `tauri://localhost` on some platforms), which the WebView treats as a
 * perfectly ordinary origin — so this worker used to register there and start
 * caching. That was a trap rather than a feature: the cache lives in the
 * WebView2 profile under %LOCALAPPDATA%, which no installer ever touches, so a
 * freshly built .exe kept being served the shell and hashed bundles captured on
 * the very first launch. Offline support is meaningless there anyway, because
 * the files are already inside the executable.
 *
 * New builds no longer register the worker at all (see src/lib/pwa.ts), but the
 * copies already installed on people's machines have to be got rid of too — and
 * the only code that can remove them is the worker itself, which the page keeps
 * updating every minute. Hence the self-destruct.
 */
function isDesktopOrigin() {
  const host = self.location.hostname
  return host === 'tauri.localhost' || host.endsWith('.tauri.localhost') || self.location.protocol === 'tauri:'
}

async function selfDestruct() {
  const keys = await caches.keys()
  await Promise.all(keys.map((key) => caches.delete(key)))
  await self.registration.unregister()
  // Reload every window so the next paint comes from the real bundled files
  // instead of whatever this worker was still answering with.
  const windows = await self.clients.matchAll({ type: 'window' })
  for (const client of windows) {
    if ('navigate' in client) client.navigate(client.url).catch(() => undefined)
  }
}

self.addEventListener('install', (event) => {
  if (isDesktopOrigin()) {
    event.waitUntil(self.skipWaiting())
    return
  }
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  if (isDesktopOrigin()) {
    event.waitUntil(selfDestruct())
    return
  }
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
  // In the desktop program every request must go straight to the bundled files.
  if (isDesktopOrigin()) return

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

/* ─────────────────────── Push notifications ─────────────────── */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (err) {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'FemboyChat'
  const body = data.body || 'Новое сообщение'
  // One notification per chat: a burst of messages replaces itself instead of
  // stacking ten separate banners.
  const tag = data.chatId ? 'fc-chat-' + data.chatId : 'fc-message'

  event.waitUntil(
    (async () => {
      // If the app is open AND visible, the in-app toast and sound already did
      // the job; a system banner on top of that is just noise.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const visible = windows.some((client) => client.visibilityState === 'visible' && client.focused)
      if (visible) return

      await self.registration.showNotification(title, {
        body,
        tag,
        renotify: true,
        icon: '/icon.png',
        badge: '/icon.png',
        timestamp: Date.now(),
        data: { chatId: data.chatId || null, messageId: data.messageId || null },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const chatId = event.notification.data ? event.notification.data.chatId : null

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        let sameOrigin = false
        try {
          sameOrigin = new URL(client.url).origin === self.location.origin
        } catch (err) {
          sameOrigin = false
        }
        if (sameOrigin) {
          // Reuse the existing tab and let the app route itself, rather than
          // reloading and losing the user's place.
          await client.focus()
          client.postMessage({ type: 'OPEN_CHAT', chatId })
          return
        }
      }
      await self.clients.openWindow(chatId ? '/?chat=' + encodeURIComponent(chatId) : '/')
    })(),
  )
})
