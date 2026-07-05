// Client-side Web Push subscription.
import { api } from '../api/client'

function base64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/** Requests permission, subscribes and registers server-side. */
export async function subscribeToPush(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('permission_denied')

  const { key } = await api.get<{ key: string }>('/api/push/vapid-key')
  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToUint8Array(key),
  })
  await api.put('/api/push/subscription', subscription.toJSON())
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getCurrentSubscription()
  if (!subscription) return
  await api.delete('/api/push/subscription', { endpoint: subscription.endpoint })
  await subscription.unsubscribe()
}
