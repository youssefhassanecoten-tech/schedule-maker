/* Offline support for the installed app.
 *
 * Network-first so a code update is picked up immediately, cache as the offline
 * fallback. Bump CACHE when the shipped files change.
 */
var CACHE = 'schedule-maker-v2';

var ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/styles.css',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-512-maskable.png',
  'assets/favicon-32.png',
  'assets/apple-touch-icon.png',
  'vendor/jszip.min.js',
  'src/config.js',
  'src/util.js',
  'src/i18n.js',
  'src/spec.js',
  'src/cellparse.js',
  'src/docx-read.js',
  'src/resolve.js',
  'src/counters.js',
  'src/rooms.js',
  'src/docx-write.js',
  'src/templates/weekly.js',
  'src/templates/monthly.js',
  'src/templates/zayavka.js',
  'src/model.js',
  'src/package.js',
  'src/ui.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // addAll fails entirely if one request fails; add individually instead
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () { /* ignore one bad entry */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
