/* Service worker: la app funciona sin conexión tras la primera visita. */
var CACHE = "palabra-v3";
var FILES = [
  "./", "index.html", "css/styles.css", "js/app.js", "js/config.js", "js/words.js", "js/dict.js",
  "manifest.webmanifest", "assets/icon.svg", "assets/icon-192.png",
  "assets/fonts/fraunces-latin-full-normal.woff2", "assets/fonts/fraunces-latin-full-italic.woff2",
  "assets/fonts/inter-latin-wght-normal.woff2"
];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
/* Red primero (para recibir mejoras), caché si no hay conexión. */
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true });
  }));
});
