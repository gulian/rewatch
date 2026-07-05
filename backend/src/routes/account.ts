// Account data export and danger zone.
import type { FastifyInstance } from 'fastify'
import argon2 from 'argon2'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { localizeMovies, localizeShows } from '../lib/catalog.js'

export default async function accountRoutes(app: FastifyInstance) {
  // Full export of the user's tracking data as a portable JSON file.
  // TMDB ids make it reimportable anywhere (including a future Rewatch import).
  app.get('/api/account/export', { preHandler: app.requireAuth }, async (request, reply) => {
    const userId = request.user!.id
    const lang = request.user!.language

    const [follows, events, ratings, watchlist] = await Promise.all([
      prisma.follow.findMany({ where: { userId }, include: { show: true } }),
      prisma.watchEvent.findMany({
        where: { userId },
        include: {
          episode: { select: { season: true, number: true, showTmdbId: true, show: { select: { name: true } } } },
          movie: { select: { tmdbId: true, title: true } },
        },
        orderBy: { watchedAt: 'asc' },
      }),
      prisma.rating.findMany({ where: { userId } }),
      prisma.movieWatchlistEntry.findMany({ where: { userId }, include: { movie: true } }),
    ])

    const shows = await localizeShows(follows.map((f) => f.show), lang)
    const showNames = new Map(shows.map((s) => [s.tmdbId, s.name]))
    const showRatings = new Map(ratings.filter((r) => r.target === 'SHOW').map((r) => [r.targetRef, r.value]))
    const movieRatings = new Map(ratings.filter((r) => r.target === 'MOVIE').map((r) => [r.targetRef, r.value]))

    // Movies: aggregate one entry per movie with all watch dates.
    const movieMap = new Map<number, { tmdbId: number; title: string; watchedAts: Date[] }>()
    for (const e of events) {
      if (!e.movie) continue
      const entry = movieMap.get(e.movie.tmdbId) ?? { tmdbId: e.movie.tmdbId, title: e.movie.title, watchedAts: [] }
      entry.watchedAts.push(e.watchedAt)
      movieMap.set(e.movie.tmdbId, entry)
    }
    const movieTitles = new Map(
      (await localizeMovies([...movieMap.values()], lang)).map((m) => [m.tmdbId, m.title]),
    )

    const payload = {
      format: 'rewatch-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { username: request.user!.username, language: lang },
      shows: follows.map((f) => ({
        tmdbId: f.showTmdbId,
        tvdbId: f.show.tvdbId,
        name: showNames.get(f.showTmdbId) ?? f.show.name,
        state: f.state,
        isFavorite: f.isFavorite,
        followedAt: f.followedAt,
        rating: showRatings.get(f.showTmdbId) ?? null,
      })),
      episodeWatches: events
        .filter((e) => e.episode)
        .map((e) => ({
          showTmdbId: e.episode!.showTmdbId,
          showName: showNames.get(e.episode!.showTmdbId) ?? e.episode!.show.name,
          season: e.episode!.season,
          number: e.episode!.number,
          watchedAt: e.watchedAt,
        })),
      movies: [...movieMap.values()].map((m) => ({
        tmdbId: m.tmdbId,
        title: movieTitles.get(m.tmdbId) ?? m.title,
        watchedAts: m.watchedAts,
        rating: movieRatings.get(m.tmdbId) ?? null,
      })),
      movieWatchlist: watchlist.map((w) => ({ tmdbId: w.movieTmdbId, title: w.movie.title, addedAt: w.addedAt })),
    }

    const date = new Date().toISOString().slice(0, 10)
    reply
      .header('content-type', 'application/json')
      .header(
        'content-disposition',
        `attachment; filename="rewatch-export-${request.user!.username}-${date}.json"`,
      )
    return payload
  })

  // Purges ALL of the user's tracking history (the account itself remains).
  // Strong confirmation: password required. Irreversible.
  app.delete(
    '/api/account/history',
    { preHandler: app.requireAuth, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = z.object({ password: z.string().min(1) }).safeParse(request.body)
      if (!body.success) return reply.code(400).send({ error: 'invalid_input' })

      const userId = request.user!.id
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
      if (!(await argon2.verify(user.passwordHash, body.data.password))) {
        return reply.code(401).send({ error: 'invalid_credentials' })
      }

      const [events, follows, ratings, watchlist, pending, jobs] = await prisma.$transaction([
        prisma.watchEvent.deleteMany({ where: { userId } }),
        prisma.follow.deleteMany({ where: { userId } }),
        prisma.rating.deleteMany({ where: { userId } }),
        prisma.movieWatchlistEntry.deleteMany({ where: { userId } }),
        prisma.importPendingMovie.deleteMany({ where: { userId } }),
        prisma.importJob.deleteMany({ where: { userId } }),
      ])
      app.log.warn({ userId, events: events.count, follows: follows.count }, 'history purged')
      return {
        deleted: {
          watchEvents: events.count,
          follows: follows.count,
          ratings: ratings.count,
          movieWatchlist: watchlist.count,
          pendingMovies: pending.count,
          importJobs: jobs.count,
        },
      }
    },
  )
}
