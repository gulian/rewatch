/// <reference lib="webworker" />
// Custom service worker: Workbox precache (PWA) + Web Push.
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0] }

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA: every navigation serves the precached app shell — except the API.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }))

// TMDB posters/backdrops: cache-first, immutable per URL.
registerRoute(
  ({ url }) => url.origin === 'https://image.tmdb.org',
  new CacheFirst({
    cacheName: 'tmdb-images',
    plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
)

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// ——— Web Push ———

type PushPayload = { title: string; body: string; url?: string }

self.addEventListener('push', (event) => {
  if (!event.data) return
  const payload = event.data.json() as PushPayload
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string })?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing window if possible, otherwise open one.
      const existing = clients.find((c) => 'focus' in c)
      if (existing) {
        existing.navigate(url)
        return existing.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
