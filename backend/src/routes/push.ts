import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { ensurePushConfigured, sendPushToUser } from '../lib/push.js'

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

export default async function pushRoutes(app: FastifyInstance) {
  // Clé publique VAPID pour PushManager.subscribe côté client.
  app.get('/api/push/vapid-key', { preHandler: app.requireAuth }, async (_request, reply) => {
    if (!ensurePushConfigured()) return reply.code(503).send({ error: 'push_not_configured' })
    return { key: process.env.VAPID_PUBLIC_KEY }
  })

  app.put('/api/push/subscription', { preHandler: app.requireAuth }, async (request, reply) => {
    const body = subscriptionSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_input' })
    const { endpoint, keys } = body.data
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      // Un endpoint réattribué à un autre compte suit le compte connecté.
      create: { userId: request.user!.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId: request.user!.id, p256dh: keys.p256dh, auth: keys.auth },
    })
    return { ok: true }
  })

  app.delete('/api/push/subscription', { preHandler: app.requireAuth }, async (request, reply) => {
    const body = z.object({ endpoint: z.url() }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_input' })
    await prisma.pushSubscription.deleteMany({
      where: { userId: request.user!.id, endpoint: body.data.endpoint },
    })
    return { ok: true }
  })

  // Notification de test vers ses propres appareils — pour valider le setup.
  app.post(
    '/api/push/test',
    { preHandler: app.requireAuth, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      const delivered = await sendPushToUser(request.user!.id, {
        title: 'Rewatch',
        body: 'Les notifications fonctionnent sur cet appareil ✓',
        url: '/',
      })
      return { delivered }
    },
  )
}
