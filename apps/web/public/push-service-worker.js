// Service worker dedicado a notificações push (Etapa 13). Não faz cache de
// assets nem interfere no carregamento normal do app — apenas escuta os
// eventos "push" e "notificationclick".

self.addEventListener('push', (event) => {
  let data = { title: 'Notificação', body: '' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Notificação', body: event.data.text() };
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Notificação', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('/');
    }),
  );
});
