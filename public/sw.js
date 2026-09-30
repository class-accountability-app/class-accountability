// Study Pods service worker. A plain file with no build step, so every rule
// below is visible here (Prompt 10 adds push to this same file).
//
// The privacy rule: nothing that belongs to a student is ever stored. Only
// three things are cached:
//   1. /offline.html and the app icons (the same for everyone),
//   2. hashed /_next/static files (build output: JS, CSS, fonts).
// Pages (logged in or not), page data (?_rsc), server actions, and anything
// from Supabase or another origin are never cached, and most never even pass
// through here. So signing out or deleting an account leaves nothing behind
// in Cache Storage, by design.
//
// Served with Cache-Control: no-cache (next.config.ts), so the browser checks
// for a new version on every visit. Bump VERSION when the cached shell
// changes; activate deletes every cache from other versions.

const VERSION = 'sp-v1'
const SHELL_CACHE = `shell-${VERSION}`
const STATIC_CACHE = `static-${VERSION}`
// Hashed files change with every deploy; keep the newest ones only.
const STATIC_MAX_ENTRIES = 150

const OFFLINE_URL = '/offline.html'
const SHELL_URLS = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, STATIC_CACHE])
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  // Only same-origin GETs are ever handled. Everything else (POST server
  // actions, Supabase, fonts from other origins) goes straight to the
  // network: no respondWith at all.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // A page load: the network, always. The offline page only when the network
  // itself fails; a 404 or 500 from the server is shown as it is. The page is
  // never stored.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staticFile(event, request))
    return
  }

  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)))
  }

  // Anything else (?_rsc page data, /manifest.webmanifest, API routes):
  // untouched.
})

// Cache first. Only a plain same-origin 200 is stored; then the cache is
// trimmed to the newest STATIC_MAX_ENTRIES (keys come back oldest first).
async function staticFile(event, request) {
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit

  const response = await fetch(request)
  if (response.status === 200 && response.type === 'basic') {
    const copy = response.clone()
    event.waitUntil(cache.put(request, copy).then(() => trim(cache)))
  }
  return response
}

async function trim(cache) {
  const keys = await cache.keys()
  const extra = keys.length - STATIC_MAX_ENTRIES
  for (let i = 0; i < extra; i++) await cache.delete(keys[i])
}
