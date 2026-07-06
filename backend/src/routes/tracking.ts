// Tracking mutations: mark as watched, follows, movie watchlist, ratings.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { mirrorBulkToTrakt, mirrorToTrakt } from '../lib/trakt-sync.js'
import { getMovieCached, getShowCached } from '../lib/catalog.js'
import { FollowState } from '../generated/prisma/client.js'

const idParam = z.object({ id: z.coerce.number().int().positive() })
const followBody = z.object({
  state: z.enum(FollowState).optional(),
})

// Marking an episode as watched implies following the show (TV Time behavior).
// Doesn't touch the state if a follow already exists (archived stays archived).
async function ensureFollowed(userId: number, showTmdbId: number) {
  await prisma.follow.upsert({
    where: { userId_showTmdbId: { userId, showTmdbId } },
    create: { userId, showTmdbId, state: FollowState.WATCHING },
    update: {},
  })
}

export default async function trackingRoutes(app: FastifyInstance) {
  // ——— Shows: follow / state / favorite ———

  app.put('/api/shows/:id/follow', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    const body = followBody.safeParse(request.body ?? {})
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_input' })

    await getShowCached(params.data.id) // ensures the record is cached (TMDB 404 → throw)
    return prisma.follow.upsert({
      where: { userId_showTmdbId: { userId: request.user!.id, showTmdbId: params.data.id } },
      create: {
        userId: request.user!.id,
        showTmdbId: params.data.id,
        state: body.data.state ?? 'WATCHING',
      },
      update: body.data,
    })
  })

  // ——— Favorites: one heart for shows and movies ———

  for (const [kind, target] of [
    ['shows', 'SHOW'],
    ['movies', 'MOVIE'],
  ] as const) {
    app.put(`/api/${kind}/:id/favorite`, { preHandler: app.requireAuth }, async (request, reply) => {
      const params = idParam.safeParse(request.params)
      if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
      if (kind === 'shows') await getShowCached(params.data.id)
      else await getMovieCached(params.data.id)
      await prisma.favorite.upsert({
        where: { userId_target_targetRef: { userId: request.user!.id, target, targetRef: params.data.id } },
        create: { userId: request.user!.id, target, targetRef: params.data.id },
        update: {},
      })
      return { ok: true }
    })

    app.delete(`/api/${kind}/:id/favorite`, { preHandler: app.requireAuth }, async (request, reply) => {
      const params = idParam.safeParse(request.params)
      if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
      await prisma.favorite.deleteMany({
        where: { userId: request.user!.id, target, targetRef: params.data.id },
      })
      return { ok: true }
    })
  }

  app.delete('/api/shows/:id/follow', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    await prisma.follow.deleteMany({
      where: { userId: request.user!.id, showTmdbId: params.data.id },
    })
    return { ok: true }
  })

  // ——— Episodes: watched / unwatched / bulk marking ———

  app.post('/api/episodes/:id/watch', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    const body = z.object({ watchedAt: z.coerce.date().optional() }).safeParse(request.body ?? {})
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_input' })

    const episode = await prisma.episode.findUnique({ where: { id: params.data.id } })
    if (!episode) return reply.code(404).send({ error: 'not_found' })

    const watchedAt = body.data.watchedAt ?? new Date()
    await prisma.watchEvent.create({
      data: { userId: request.user!.id, episodeId: episode.id, watchedAt },
    })
    await ensureFollowed(request.user!.id, episode.showTmdbId)
    mirrorToTrakt(request.user!.id, 'add', { kind: 'episode', showTmdbId: episode.showTmdbId, season: episode.season, number: episode.number, watchedAt })
    return { ok: true }
  })

  // Unwatched = delete every viewing of the episode (toggle from the design).
  app.delete('/api/episodes/:id/watch', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    const deleted = await prisma.watchEvent.deleteMany({
      where: { userId: request.user!.id, episodeId: params.data.id },
    })
    if (deleted.count > 0) {
      const episode = await prisma.episode.findUnique({ where: { id: params.data.id } })
      if (episode)
        mirrorToTrakt(request.user!.id, 'remove', { kind: 'episode', showTmdbId: episode.showTmdbId, season: episode.season, number: episode.number })
    }
    return { ok: true }
  })

  // Bulk: whole season, or "I'm caught up to here" (everything up to S/E inclusive).
  app.post('/api/shows/:id/watch-bulk', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    const body = z
      .object({
        season: z.number().int().min(0).optional(),
        upTo: z.object({ season: z.number().int().min(0), number: z.number().int().min(1) }).optional(),
      })
      .refine((b) => (b.season !== undefined) !== (b.upTo !== undefined), 'season XOR upTo')
      .safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_input' })

    const { season, upTo } = body.data
    const episodes = await prisma.episode.findMany({
      where: {
        showTmdbId: params.data.id,
        airDate: { lte: new Date() }, // never mark unaired episodes
        ...(season !== undefined
          ? { season }
          : {
              season: { gt: 0, lte: upTo!.season }, // specials (S0) stay manual
              OR: [{ season: { lt: upTo!.season } }, { number: { lte: upTo!.number } }],
            }),
      },
      select: { id: true, season: true, number: true },
    })

    // No rewatches created: only never-watched episodes get marked.
    const seen = await prisma.watchEvent.findMany({
      where: { userId: request.user!.id, episodeId: { in: episodes.map((e) => e.id) } },
      select: { episodeId: true },
    })
    const seenIds = new Set(seen.map((s) => s.episodeId))
    const now = new Date()
    const fresh = episodes.filter((e) => !seenIds.has(e.id))
    const created = await prisma.watchEvent.createMany({
      data: fresh.map((e) => ({ userId: request.user!.id, episodeId: e.id, watchedAt: now })),
    })
    if (created.count > 0) {
      await ensureFollowed(request.user!.id, params.data.id)
      mirrorBulkToTrakt(request.user!.id, params.data.id, fresh, now)
    }
    return { marked: created.count }
  })

  // ——— Movies: watched / rewatch / unwatched / watchlist ———

  app.post('/api/movies/:id/watch', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    const body = z.object({ watchedAt: z.coerce.date().optional() }).safeParse(request.body ?? {})
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_input' })

    await getMovieCached(params.data.id)
    const movieWatchedAt = body.data.watchedAt ?? new Date()
    await prisma.watchEvent.create({
      data: { userId: request.user!.id, movieId: params.data.id, watchedAt: movieWatchedAt },
    })
    mirrorToTrakt(request.user!.id, 'add', { kind: 'movie', movieTmdbId: params.data.id, watchedAt: movieWatchedAt })
    // Watched → drops off the watchlist.
    await prisma.movieWatchlistEntry.deleteMany({
      where: { userId: request.user!.id, movieTmdbId: params.data.id },
    })
    return { ok: true }
  })

  app.delete('/api/movies/:id/watch', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    const deleted = await prisma.watchEvent.deleteMany({
      where: { userId: request.user!.id, movieId: params.data.id },
    })
    if (deleted.count > 0) mirrorToTrakt(request.user!.id, 'remove', { kind: 'movie', movieTmdbId: params.data.id })
    return { ok: true }
  })

  app.put('/api/movies/:id/watchlist', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    await getMovieCached(params.data.id)
    await prisma.movieWatchlistEntry.upsert({
      where: { userId_movieTmdbId: { userId: request.user!.id, movieTmdbId: params.data.id } },
      create: { userId: request.user!.id, movieTmdbId: params.data.id },
      update: {},
    })
    return { ok: true }
  })

  app.delete('/api/movies/:id/watchlist', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    await prisma.movieWatchlistEntry.deleteMany({
      where: { userId: request.user!.id, movieTmdbId: params.data.id },
    })
    return { ok: true }
  })

  // ——— Ratings ———

  app.put('/api/ratings', { preHandler: app.requireAuth }, async (request, reply) => {
    const body = z
      .object({
        target: z.enum(['SHOW', 'MOVIE', 'EPISODE']),
        targetRef: z.number().int().positive(),
        value: z.number().int().min(1).max(10),
      })
      .safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_input' })

    return prisma.rating.upsert({
      where: {
        userId_target_targetRef: {
          userId: request.user!.id,
          target: body.data.target,
          targetRef: body.data.targetRef,
        },
      },
      create: { userId: request.user!.id, ...body.data },
      update: { value: body.data.value },
    })
  })

  app.delete('/api/ratings', { preHandler: app.requireAuth }, async (request, reply) => {
    const body = z
      .object({ target: z.enum(['SHOW', 'MOVIE', 'EPISODE']), targetRef: z.number().int().positive() })
      .safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_input' })
    await prisma.rating.deleteMany({ where: { userId: request.user!.id, ...body.data } })
    return { ok: true }
  })
}
