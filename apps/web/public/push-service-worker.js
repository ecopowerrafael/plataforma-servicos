// Service worker do aplicativo público. Trata push/notificationclick e dá o
// mínimo de comportamento offline exigido para instalação do PWA.
//
// Regras de cache, pensadas para vários tenants na MESMA origem:
//   - a chave de cache é a URL completa da requisição, então /public/<slug>
//     de tenants diferentes nunca se misturam;
//   - nada autenticado é cacheado (cookies/Authorization, /tenant/*, /auth/*);
//   - HTML, manifest e mídia de branding são network-first e nunca ficam
//     presos: o cache só responde se a rede falhar;
//   - assets versionados do build (/assets/*, com hash no nome) são
//     cache-first, porque uma nova versão gera outra URL.

const RUNTIME_CACHE = 'agendei-runtime-v1';

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== RUNTIME_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isPrivate(request, url) {
  if (request.headers.has('authorization')) return true;
  if (request.credentials === 'include') return true;
  return (
    url.pathname.startsWith('/tenant/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/platform/')
  );
}

function isVersionedAsset(url) {
  return url.pathname.startsWith('/assets/');
}

function isDynamicPublic(request, url) {
  if (request.mode === 'navigate') return true;
  return (
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.startsWith('/public/media/') ||
    url.pathname.startsWith('/public/brand/')
  );
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    // A chave inclui a URL completa: o fallback é sempre do mesmo tenant.
    const cached = await cache.match(request);
    if (cached !== undefined) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached !== undefined) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivate(request, url)) return;

  if (isVersionedAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (isDynamicPublic(request, url)) {
    event.respondWith(networkFirst(request));
  }
});

// Ícone global real do Agendei; o ícone do tenant vem no payload.
const FALLBACK_ICON = '/icons/agendei-192.png';

self.addEventListener('push', (event) => {
  let data = { title: 'Notificação', body: '' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Notificação', body: event.data.text() };
    }
  }
  const icon = typeof data.icon === 'string' && data.icon !== '' ? data.icon : FALLBACK_ICON;
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Notificação', {
      body: data.body ?? '',
      icon,
      badge: typeof data.badge === 'string' && data.badge !== '' ? data.badge : icon,
      // Quem sabe o tenant é o backend: o SW apenas repassa o destino.
      data: { url: typeof data.url === 'string' && data.url !== '' ? data.url : '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(target)) return client.focus();
      }
      if (clients.length > 0 && target === '/') return clients[0].focus();
      return self.clients.openWindow(target);
    }),
  );
});
