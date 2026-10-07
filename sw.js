// Brisa: guarda la app para que abra sin conexión. Sube VERSION al cambiar archivos.
const VERSION = 'brisa-v0.1.10';
const ARCHIVOS = ['./', './index.html', './styles.css', './app.js', './categorizador.js', './reglas-iniciales.js',
  './xlsx.core.min.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
    if (resp.ok && (e.request.url.startsWith(self.location.origin) || e.request.url.includes('fonts.g'))) {
      const copia = resp.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia));
    }
    return resp;
  }).catch(() => caches.match('./index.html'))));
});
