// Admin-only endpoints: instance stats and account management.
// Every mutating action is logged (audit trail in the service journal).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { Prisma } from '../generated/prisma/client.js'
import { createAuthToken } from '../lib/auth-tokens.js'
import { sendResetEmail, sendVerificationEmail, type Lang } from '../lib/mailer.js'
import { isBlocked, verifyDeadline } from '../lib/verification.js'

const idParam = z.object({ id: z.coerce.number().int().positive() })

export default async function adminRoutes(app: FastifyInstance) {
  // Live telemetry — polled every few seconds by the admin console.
  app.get('/api/admin/metrics', { preHandler: app.requireAdmin }, async () => {
    const { metricsSnapshot } = await import('../lib/metrics.js')

    const dbStart = performance.now()
    await prisma.$queryRaw`SELECT 1`
    const dbPingMs = Math.round((performance.now() - dbStart) * 10) / 10

    const [online5m, online1h] = await Promise.all([
      prisma.session
        .groupBy({ by: ['userId'], where: { lastUsedAt: { gte: new Date(Date.now() - 5 * 60_000) } } })
        .then((r) => r.length),
      prisma.session
        .groupBy({ by: ['userId'], where: { lastUsedAt: { gte: new Date(Date.now() - 60 * 60_000) } } })
        .then((r) => r.length),
    ])

    return { ...metricsSnapshot(), db: { pingMs: dbPingMs }, online: { last5m: online5m, last1h: online1h } }
  })

  app.get('/api/admin/overview', { preHandler: app.requireAdmin }, async () => {
    const now = Date.now()
    const d7 = new Date(now - 7 * 864e5)
    const d30 = new Date(now - 30 * 864e5)

    const [users, verified, active7, active30, events30, pushSubs, cacheShows, cacheEpisodes, cacheMovies] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
        prisma.session.groupBy({ by: ['userId'], where: { createdAt: { gte: d7 } } }).then((r) => r.length),
        prisma.session.groupBy({ by: ['userId'], where: { createdAt: { gte: d30 } } }).then((r) => r.length),
        prisma.watchEvent.count({ where: { watchedAt: { gte: d30 } } }),
        prisma.pushSubscription.count(),
        prisma.show.count(),
        prisma.episode.count(),
        prisma.movie.count(),
      ])

    const imports = await prisma.importJob.groupBy({ by: ['status'], _count: true })

    // Weekly signups, last 12 weeks (gaps filled client-side).
    const signups = await prisma.$queryRaw<{ week: Date; count: bigint }[]>(Prisma.sql`
      SELECT date_trunc('week', created_at) AS week, count(*) AS count
      FROM users
      WHERE created_at >= now() - interval '12 weeks'
      GROUP BY 1 ORDER BY 1
    `)

    return {
      users: { total: users, verified, active7, active30 },
      activity: { watchEvents30d: events30, pushSubscriptions: pushSubs },
      imports: Object.fromEntries(imports.map((i) => [i.status, i._count])),
      cache: { shows: cacheShows, episodes: cacheEpisodes, movies: cacheMovies },
      signupsByWeek: signups.map((s) => ({ week: s.week, count: Number(s.count) })),
    }
  })

  app.get('/api/admin/users', { preHandler: app.requireAdmin }, async () => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerifiedAt: true,
        language: true,
        isAdmin: true,
        createdAt: true,
        _count: { select: { watchEvents: true, follows: true, pushSubscriptions: true } },
      },
    })
    // Last login proxy: most recent session creation per user.
    const lastSeen = await prisma.session.groupBy({ by: ['userId'], _max: { createdAt: true } })
    const seenById = new Map(lastSeen.map((s) => [s.userId, s._max.createdAt]))

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      emailVerified: u.emailVerifiedAt !== null,
      blocked: isBlocked(u),
      verifyDeadline: verifyDeadline(u),
      language: u.language,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt,
      lastSeenAt: seenById.get(u.id) ?? null,
      watchEvents: u._count.watchEvents,
      follows: u._count.follows,
      pushSubscriptions: u._count.pushSubscriptions,
    }))
  })

  // Resend the verification email to a user stuck without it.
  app.post('/api/admin/users/:id/resend-verification', { preHandler: app.requireAdmin }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    const user = await prisma.user.findUnique({ where: { id: params.data.id } })
    if (!user) return reply.code(404).send({ error: 'not_found' })
    if (!user.email) return reply.code(400).send({ error: 'no_email' })
    if (user.emailVerifiedAt) return { ok: true }

    const token = await createAuthToken(user.id, 'VERIFY_EMAIL')
    await sendVerificationEmail(user.email, user.username, token, user.language as Lang)
    app.log.warn({ admin: request.user!.id, action: 'resend-verification', target: user.id }, 'admin action')
    return { ok: true }
  })

  // Manually mark an email as verified (e.g. mails not getting through).
  app.post('/api/admin/users/:id/verify', { preHandler: app.requireAdmin }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    await prisma.user.update({ where: { id: params.data.id }, data: { emailVerifiedAt: new Date() } })
    app.log.warn({ admin: request.user!.id, action: 'manual-verify', target: params.data.id }, 'admin action')
    return { ok: true }
  })

  // Send a password reset link (admin-triggered works even on unverified email:
  // it's a deliberate action, not the self-service enumeration-prone path).
  app.post('/api/admin/users/:id/send-reset', { preHandler: app.requireAdmin }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    const user = await prisma.user.findUnique({ where: { id: params.data.id } })
    if (!user) return reply.code(404).send({ error: 'not_found' })
    if (!user.email) return reply.code(400).send({ error: 'no_email' })

    const token = await createAuthToken(user.id, 'RESET_PASSWORD')
    await sendResetEmail(user.email, user.username, token, user.language as Lang)
    app.log.warn({ admin: request.user!.id, action: 'send-reset', target: user.id }, 'admin action')
    return { ok: true }
  })

  // Delete an account and everything it owns (relations cascade).
  app.delete('/api/admin/users/:id', { preHandler: app.requireAdmin }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    if (params.data.id === request.user!.id) {
      return reply.code(400).send({ error: 'cannot_delete_self' })
    }
    const user = await prisma.user.findUnique({ where: { id: params.data.id } })
    if (!user) return reply.code(404).send({ error: 'not_found' })
    if (user.isAdmin) return reply.code(400).send({ error: 'cannot_delete_admin' })

    await prisma.user.delete({ where: { id: user.id } })
    app.log.warn(
      { admin: request.user!.id, action: 'delete-user', target: user.id, username: user.username },
      'admin action',
    )
    return { ok: true }
  })
}
