// BLITE Push Notification Service Worker

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()
    const options = {
      body: data.body || 'New message',
      icon: '/logo.png',
      badge: '/logo.png',
      data: data.data || {},
      tag: 'blite-notification',
      renotify: true,
    }

    event.waitUntil(
      self.registration.showNotification(data.title || 'BLITE', options)
    )
  } catch (err) {
    console.error('[SW] Push event error:', err)
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow('/app')
      }
    })
  )
})
