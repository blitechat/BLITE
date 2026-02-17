import api from './api'

let vapidPublicKey: string | null = null

export async function getVapidKey(): Promise<string | null> {
  if (vapidPublicKey) return vapidPublicKey
  try {
    const res = await api.get<{ publicKey: string | null }>('/notifications/vapid-key')
    vapidPublicKey = res.data.publicKey
    return vapidPublicKey
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function subscribeToPush(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('[Push] Push notifications not supported')
      return false
    }

    const vapidKey = await getVapidKey()
    if (!vapidKey) {
      console.log('[Push] No VAPID key configured on server')
      return false
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.log('[Push] Notification permission denied')
      return false
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    const json = subscription.toJSON()
    await api.post('/notifications/subscribe', {
      endpoint: json.endpoint,
      keys: json.keys,
    })

    console.log('[Push] Subscribed to push notifications')
    return true
  } catch (err) {
    console.error('[Push] Failed to subscribe:', err)
    return false
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await api.delete('/notifications/unsubscribe', {
        data: { endpoint: subscription.endpoint },
      })
      await subscription.unsubscribe()
    }
  } catch (err) {
    console.error('[Push] Failed to unsubscribe:', err)
  }
}
