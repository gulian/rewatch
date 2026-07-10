// Admin-only endpoints: instance stats and account management.
// Every mutating action is logged (audit trail in the service journal).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { Prisma } from '../generated/prisma/client.js'
import { createAuthToken } from '../lib/auth-tokens.js'
import { sendResetEmail, sendVerificationEmail, type Lang } from '../lib/mailer.js'
import { isBlocked, verifyDeadline, VERIFY_GRACE_MS } from '../lib/verification.js'

const idParam = z.object({ id: z.coerce.number().int().positive() })

// Filtering / sorting / pagination for the accounts table — all server-side.
const usersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.enum(['username', 'email', 'createdAt', 'lastSeenAt', 'watchEvents', 'follows']).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'ok', 'unverified', 'blocked']).default('all'),
  role: z.enum(['all', 'admin', 'user']).default('all'),
})

// Whitelist: sort keys → SQL expressions (never interpolate raw user input).
const USER_SORT_COLUMNS: Record<z.infer<typeof usersQuery>['sort'], string> = {
  username: 'u.username',
  email: 'u.email',
  createdAt: 'u.created_at',
  lastSeenAt: 'last_seen_at',
  watchEvents: 'watch_events',
  follows: 'follows_count',
}

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

  // Paginated accounts table. Filtering, sorting and pagination all run in SQL:
  // last-seen ordering and per-user counts are relation aggregates Prisma's query
  // builder can't order by, so the list is a single raw query (+ a count for the total).
  app.get('/api/admin/users', { preHandler: app.requireAdmin }, async (request, reply) => {
    const parsed = usersQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query' })
    const { page, pageSize, sort, dir, search, status, role } = parsed.data

    // "unverified" = still within the grace window; "blocked" = grace expired.
    // Cutoff computed from the same constant the policy uses (no interval drift).
    const graceCutoff = new Date(Date.now() - VERIFY_GRACE_MS)
    const conds: Prisma.Sql[] = []
    if (search) {
      const like = `%${search}%`
      conds.push(Prisma.sql`(u.username ILIKE ${like} OR u.email ILIKE ${like})`)
    }
    if (status === 'ok') conds.push(Prisma.sql`u.email_verified_at IS NOT NULL`)
    else if (status === 'unverified')
      conds.push(Prisma.sql`u.email_verified_at IS NULL AND u.created_at >= ${graceCutoff}`)
    else if (status === 'blocked')
      conds.push(Prisma.sql`u.email_verified_at IS NULL AND u.created_at < ${graceCutoff}`)
    if (role === 'admin') conds.push(Prisma.sql`u.is_admin = true`)
    else if (role === 'user') conds.push(Prisma.sql`u.is_admin = false`)
    const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty

    // sort/dir come from validated whitelists → safe to inline.
    const orderBy = Prisma.raw(
      `ORDER BY ${USER_SORT_COLUMNS[sort]} ${dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, u.id ASC`,
    )

    const rows = await prisma.$queryRaw<
      {
        id: number
        username: string
        email: string | null
        email_verified_at: Date | null
        language: string
        is_admin: boolean
        created_at: Date
        last_seen_at: Date | null
        watch_events: number
        follows_count: number
        push_subscriptions: number
      }[]
    >(Prisma.sql`
      SELECT u.id, u.username, u.email, u.email_verified_at, u.language, u.is_admin, u.created_at,
        ls.last_seen_at,
        COALESCE(we.cnt, 0)::int AS watch_events,
        COALESCE(fo.cnt, 0)::int AS follows_count,
        COALESCE(ps.cnt, 0)::int AS push_subscriptions
      FROM users u
      LEFT JOIN (
        SELECT user_id, max(COALESCE(last_used_at, created_at)) AS last_seen_at FROM sessions GROUP BY user_id
      ) ls ON ls.user_id = u.id
      LEFT JOIN (SELECT user_id, count(*) AS cnt FROM watch_events GROUP BY user_id) we ON we.user_id = u.id
      LEFT JOIN (SELECT user_id, count(*) AS cnt FROM follows GROUP BY user_id) fo ON fo.user_id = u.id
      LEFT JOIN (SELECT user_id, count(*) AS cnt FROM push_subscriptions GROUP BY user_id) ps ON ps.user_id = u.id
      ${where}
      ${orderBy}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `)

    const totalRow = await prisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT count(*) AS count FROM users u ${where}`,
    )
    const total = Number(totalRow[0]?.count ?? 0)

    return {
      users: rows.map((u) => {
        const vu = { emailVerifiedAt: u.email_verified_at, createdAt: u.created_at }
        return {
          id: u.id,
          username: u.username,
          email: u.email,
          emailVerified: u.email_verified_at !== null,
          blocked: isBlocked(vu),
          verifyDeadline: verifyDeadline(vu),
          language: u.language,
          isAdmin: u.is_admin,
          createdAt: u.created_at,
          lastSeenAt: u.last_seen_at,
          watchEvents: u.watch_events,
          follows: u.follows_count,
          pushSubscriptions: u.push_subscriptions,
        }
      }),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
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
