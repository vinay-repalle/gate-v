/* Service worker: lets the app open with no internet.
 *
 * Two caches:
 *  - APP cache   : our own files (page, scripts, styles, syllabus.json, icons).
 *                  NETWORK-FIRST: when online she always gets the newest files; the cache is only
 *                  the fallback when the network is down or slow. So a new deploy reaches her on the next open.
 *  - SDK cache   : the three Firebase files from gstatic.com. Their URL contains the version number
 *                  (11.0.2), so a given URL never changes -> CACHE-FIRST is safe.
 *
 * Firestore / login traffic (googleapis.com) is NOT touched here; Firestore keeps its own offline copy of her data.
 *
 * To force every phone to drop old files: bump VERSION below.
 */
const VERSION = 'v1';
const APP_CACHE = `gate-app-${VERSION}`;
const SDK_CACHE = 'gate-firebase-sdk-11.0.2';   // change together with the version in public/fb.js
const NETWORK_TIMEOUT_MS = 4000;

const APP_FILES = [
  './', 'index.html', 'style.css', 'app.js', 'store.js', 'cloud-store.js', 'login.js', 'fb.js',
  'syllabus.json', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];
const SDK_FILES = ['app', 'auth', 'firestore'].map((m) => `https://www.gstatic.com/firebasejs/11.0.2/firebase-${m}.js`);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // cache:'reload' = skip the browser's HTTP cache so we store the genuinely latest files
    const app = await caches.open(APP_CACHE);
    await Promise.all(APP_FILES.map((f) => app.add(new Request(f, { cache: 'reload' }))));
    const sdk = await caches.open(SDK_CACHE);
    await Promise.all(SDK_FILES.map(async (u) => { if (!(await sdk.match(u))) await sdk.add(u); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== APP_CACHE && key !== SDK_CACHE) await caches.delete(key);   // drop old versions
    }
    await self.clients.claim();
  })());
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await Promise.race([fetch(request), timeout(NETWORK_TIMEOUT_MS)]);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    // offline or very slow: use the saved copy. ignoreSearch so "/?x" still finds the page.
    const hit = (await cache.match(request, { ignoreSearch: true }))
      || (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
    if (hit) return hit;
    return fetch(request);   // nothing saved: let the browser show its normal error
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SDK_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/__/')) return;            // Firebase Hosting reserved URLs
    event.respondWith(networkFirst(request));
  } else if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/11.0.2/')) {
    event.respondWith(cacheFirst(request));
  }
});
