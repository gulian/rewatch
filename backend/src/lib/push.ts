// Web Push. Two rules learned the hard way: VAPID config fails loudly
// (never silently), and dead subscriptions (404/410) are cleaned up on send.
import webpush from 'web-push'
import { prisma } from './prisma.js'
import { getSetting, onSettingsChange } from './settings.js'

let configured = false
onSettingsChange(() => {
  configured = false // keys may have just been generated from the console
})

export function ensurePushConfigured(): boolean {
  if (configured) return true
  const publicKey = getSetting('VAPID_PUBLIC_KEY')
  const privateKey = getSetting('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(getSetting('VAPID_SUBJECT') ?? 'mailto:admin@localhost', publicKey, privateKey)
  configured = true
  return true
}

export type PushPayload = {
  title: string
  body: string
  url?: string // route opened on click
}

/** Sends to all of a user's devices. Returns the number of successful deliveries. */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<number> {
  if (!ensurePushConfigured()) {
    throw new Error('Web Push keys are not configured (admin settings or VAPID_* env)')
  }
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } })
  let delivered = 0
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      )
      delivered++
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        // Expired/revoked subscription → remove it.
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
      } else {
        console.error(`push KO (user ${userId}, status ${status}):`, (err as Error).message)
      }
    }
  }
  return delivered
}
