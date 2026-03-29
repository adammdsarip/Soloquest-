const CACHE = 'sq-v4';
const OFFLINE_URLS = ['/', '/index.html'];

// ── INSTALL: cache shell, skip waiting ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(OFFLINE_URLS)).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean old caches, claim clients ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: cache-first for shell, network-first for API ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept Anthropic API or Google Fonts
  if (url.hostname === 'api.anthropic.com' || url.hostname.includes('googleapis')) {
    return;
  }

  // Navigation requests: serve from cache, fallback to network
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/').then(cached => cached || fetch(e.request))
    );
    return;
  }

  // Static assets: cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

// ── NOTIFICATIONS: scheduled daily alarm ──
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SCHEDULE_NOTIF') {
    const { msUntil, title, body, tag } = e.data;
    if (self._notifTimer) clearTimeout(self._notifTimer);
    self._notifTimer = setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [200, 100, 200],
        data: { url: '/' },
        actions: [{ action: 'open', title: 'Open SoloQuest' }]
      });
      // Tell app to reschedule for next day
      self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'RESCHEDULE' }));
      });
    }, msUntil);
  }
});

// ── NOTIFICATION CLICK: focus or open app ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const focused = clients.find(c => c.url.includes(self.location.origin));
      if (focused) return focused.focus();
      return self.clients.openWindow('/');
    })
  );
});
