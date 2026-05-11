/* v75: 이름·연락처 수정 항목에 거절 경고등 (사장님 명령 2026-05-07). */
const CACHE_NAME = 'sewmu-v75';
const STATIC_ASSETS = ['/logo.png', '/logo-icon.png', '/logo-vertical.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Web Push 수신 (카톡처럼 "띵" 알림)
self.addEventListener('push', e => {
  let data = { title: '세무회계 이윤', body: '새 메시지가 도착했습니다', url: '/' };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch {
    if (e.data) data.body = e.data.text();
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'sewmu-msg',
      requireInteraction: false,
      silent: false,
      renotify: true,
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return;
  const url = new URL(e.request.url);
  /* 이전 사고: JS/CSS 가 cache-first 였어서 admin.js?v=N 신버전이 사용자한테
     영원히 배포 안 되는 사고 발생. JS·CSS·HTML 은 항상 network-first. */
  if (e.request.mode === 'navigate'
      || url.pathname.endsWith('.html')
      || url.pathname.endsWith('.js')
      || url.pathname.endsWith('.css')
      || url.pathname === '/') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  /* 이미지·로고 등 진짜 정적 자산만 cache-first */
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return r;
      });
    })
  );
});
