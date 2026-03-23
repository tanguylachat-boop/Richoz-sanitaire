// Service Worker for Richoz Sanitaire PWA - Web Push Notifications

self.addEventListener('push', function (event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Richoz Sanitaire', message: event.data.text() };
  }

  const options = {
    body: data.message || data.body || '',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    tag: data.tag || 'default',
    renotify: true,
    data: {
      url: data.url || '/technician/notifications',
    },
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Richoz Sanitaire', options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var targetPath = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/technician/notifications';

  // Build absolute URL from the SW origin
  var targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // Try to focus an existing window and navigate it
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          return client.focus().then(function (focusedClient) {
            if (focusedClient && 'navigate' in focusedClient) {
              return focusedClient.navigate(targetUrl);
            }
          });
        }
      }
      // No existing window — open a new one
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
});
