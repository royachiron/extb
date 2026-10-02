// Service-worker source served at /sw.js, split from api/static.ts
// getServiceWorker. CACHE_NAME stays inside the string (static.test.ts
// guards it). Byte-identical to the previous inline template.
export const SW_SCRIPT = `
const CACHE_NAME = 'extb-v1';
const ASSETS = ['/css/forum.css'];

self.addEventListener('install', function() { self.skipWaiting(); });

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE_NAME; }).map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // HTML requests (navigations + HTMX partials) must always hit the network and
  // BYPASS the browser HTTP cache. A full page and its HTMX partial share the
  // same URL; replaying one for the other makes the PWA reopen as a raw,
  // unstyled fragment.
  var isHtml = req.mode === 'navigate'
    || (req.headers.get('accept') || '').includes('text/html')
    || req.destination === 'document'
    || req.headers.get('hx-request') === 'true';
  if (isHtml) {
    e.respondWith(fetch(req, { cache: 'reload' }).catch(function() {
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }));
    return;
  }

  if (ASSETS.indexOf(url.pathname) !== -1) {
    e.respondWith(
      fetch(req, { cache: 'reload' }).then(function(res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(req, copy); });
        return res;
      }).catch(function() {
        return caches.match(req);
      })
    );
    return;
  }

  e.respondWith(caches.match(req).then(function(r) { return r || fetch(req); }));
});

self.addEventListener('push', function(e) {
  var data = {};
  try { if (e.data) data = e.data.json(); } catch(_) {}
  var title = data.title || 'New message';
  var body = data.body || '';
  var url = data.url || '/';
  var origin = self.location.origin;
  var isDm = (data.type || 'dm') === 'dm';
  var tag = data.tag || ('dm-' + (data.from || 'msg'));

  if (navigator.setAppBadge) navigator.setAppBadge(1);

  // DMs stay loud (persistent, strong vibration); mention/reply pushes are
  // quiet one-buzz notifications that coalesce per topic via the tag.
  var promise = self.registration.showNotification(title, {
    body: body,
    icon: origin + '/favicon.svg',
    badge: origin + '/favicon.svg',
    data: { url: url },
    tag: tag,
    renotify: isDm,
    vibrate: isDm ? [10, 500, 1000, 200, 1000] : [100],
    requireInteraction: isDm,
    actions: [{ action: 'view', title: isDm ? 'READ MESSAGE' : 'VIEW' }]
  });

  e.waitUntil(promise);
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cl) {
    for (var i = 0; i < cl.length; i++) {
      if (cl[i].url.indexOf(url) !== -1 && 'focus' in cl[i]) return cl[i].focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
`;
