// Brisa: guarda la app para que abra sin conexión. Sube VERSION al cambiar archivos.
// Primero intenta la red (así las versiones nuevas llegan al momento) y, sin conexión, usa la caché.
const VERSION = 'brisa-v0.2.4';
const ARCHIVOS = ['./', './index.html', './styles.css', './app.js', './categorizador.js', './reglas-iniciales.js',
  './xlsx.core.min.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const propio = e.request.url.startsWith(self.location.origin);
  if (!propio && !e.request.url.includes('fonts.g')) return;
  e.respondWith(fetch(e.request).then((resp) => {
    if (resp.ok) { const copia = resp.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); }
    return resp;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
});
