// Aggregated reads: "up next" home, calendar, per-user overlays for detail pages.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { Prisma } from '../generated/prisma/client.js'
import { localizeEpisodes, localizeMovies, localizeShows } from '../lib/catalog.js'

const idParam = z.object({ id: z.coerce.number().int().positive() })

type NextEpisodeRow = {
  show_tmdb_id: number
  episode_id: number
  season: number
  number: number
  episode_name: string | null
  air_date: Date | null
  season_remaining: bigint
  total_remaining: bigint
  last_watched_at: Date | null
}

export default async function libraryRoutes(app: FastifyInstance) {
  // "Up next" home: next episode per followed show + movie watchlist.
  app.get('/api/watchlist', { preHandler: app.requireAuth }, async (request) => {
    const userId = request.user!.id

    // Per followed show (WATCHING): first aired unwatched episode (specials excluded),
    // episodes remaining in its season / overall, and last activity for sorting.
    const rows = await prisma.$queryRaw<NextEpisodeRow[]>(Prisma.sql`
      WITH aired AS (
        SELECT e.*
        FROM episodes e
        JOIN follows f ON f.show_tmdb_id = e.show_tmdb_id
        WHERE f.user_id = ${userId} AND f.state = 'WATCHING'
          AND e.season > 0 AND e.air_date <= now()
      ),
      unseen AS (
        SELECT a.* FROM aired a
        WHERE NOT EXISTS (
          SELECT 1 FROM watch_events w
          WHERE w.user_id = ${userId} AND w.episode_id = a.id
        )
      ),
      next_ep AS (
        SELECT DISTINCT ON (show_tmdb_id) *
        FROM unseen ORDER BY show_tmdb_id, season, number
      ),
      -- Single-pass aggregates instead of per-row correlated subqueries.
      counts AS (
        SELECT u.show_tmdb_id,
          count(*) AS total_remaining,
          count(*) FILTER (WHERE u.season = n.season) AS season_remaining
        FROM unseen u
        JOIN next_ep n USING (show_tmdb_id)
        GROUP BY u.show_tmdb_id
      ),
      activity AS (
        SELECT e.show_tmdb_id, max(w.watched_at) AS last_watched_at
        FROM watch_events w
        JOIN episodes e ON e.id = w.episode_id
        WHERE w.user_id = ${userId}
        GROUP BY e.show_tmdb_id
      )
      SELECT
        n.show_tmdb_id, n.id AS episode_id, n.season, n.number,
        n.name AS episode_name, n.air_date,
        c.season_remaining, c.total_remaining, a.last_watched_at
      FROM next_ep n
      JOIN counts c USING (show_tmdb_id)
      LEFT JOIN activity a USING (show_tmdb_id)
      ORDER BY a.last_watched_at DESC NULLS LAST
    `)

    const lang = request.user!.language
    const shows = await localizeShows(
      await prisma.show.findMany({ where: { tmdbId: { in: rows.map((r) => r.show_tmdb_id) } } }),
      lang,
    )
    const showById = new Map(shows.map((s) => [s.tmdbId, s]))
    const nextEpNames = new Map(
      (
        await localizeEpisodes(
          rows.map((r) => ({ id: r.episode_id, name: r.episode_name })),
          lang,
        )
      ).map((e) => [e.id, e.name]),
    )

    const entries = await prisma.movieWatchlistEntry.findMany({
      where: { userId },
      include: { movie: true },
      orderBy: { addedAt: 'desc' },
    })
    const movies = await localizeMovies(entries.map((m) => m.movie), lang)

    return {
      shows: rows.map((r) => ({
        show: showById.get(r.show_tmdb_id),
        nextEpisode: {
          id: r.episode_id,
          season: r.season,
          number: r.number,
          name: nextEpNames.get(r.episode_id) ?? r.episode_name,
          airDate: r.air_date,
        },
        seasonRemaining: Number(r.season_remaining),
        totalRemaining: Number(r.total_remaining),
        lastWatchedAt: r.last_watched_at,
      })),
      movies,
    }
  })

  // "Your shows" (search + library): follows with watched/aired progress.
  app.get('/api/library/shows', { preHandler: app.requireAuth }, async (request) => {
    const userId = request.user!.id
    const rows = await prisma.$queryRaw<
      {
        show_tmdb_id: number
        state: string
        is_favorite: boolean
        watched: bigint
        aired: bigint
        last_watched_at: Date | null
      }[]
    >(Prisma.sql`
      SELECT f.show_tmdb_id, f.state, f.is_favorite,
        (SELECT count(DISTINCT w.episode_id) FROM watch_events w
          JOIN episodes e ON e.id = w.episode_id
          WHERE w.user_id = ${userId} AND e.show_tmdb_id = f.show_tmdb_id AND e.season > 0) AS watched,
        (SELECT count(*) FROM episodes e
          WHERE e.show_tmdb_id = f.show_tmdb_id AND e.season > 0 AND e.air_date <= now()) AS aired,
        (SELECT max(w.watched_at) FROM watch_events w
          JOIN episodes e ON e.id = w.episode_id
          WHERE w.user_id = ${userId} AND e.show_tmdb_id = f.show_tmdb_id) AS last_watched_at
      FROM follows f WHERE f.user_id = ${userId}
      ORDER BY last_watched_at DESC NULLS LAST
    `)
    const shows = await localizeShows(
      await prisma.show.findMany({ where: { tmdbId: { in: rows.map((r) => r.show_tmdb_id) } } }),
      request.user!.language,
    )
    const byId = new Map(shows.map((s) => [s.tmdbId, s]))
    return rows.map((r) => ({
      show: byId.get(r.show_tmdb_id),
      state: r.state,
      isFavorite: r.is_favorite,
      watched: Number(r.watched),
      aired: Number(r.aired),
    }))
  })

  // Calendar: upcoming episodes for followed shows (all except ARCHIVED).
  app.get('/api/calendar', { preHandler: app.requireAuth }, async (request) => {
    const query = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }).parse(request.query ?? {})
    const until = new Date(Date.now() + query.days * 24 * 60 * 60 * 1000)

    const episodes = await prisma.episode.findMany({
      where: {
        airDate: { gte: new Date(new Date().toDateString()), lte: until },
        season: { gt: 0 },
        show: { follows: { some: { userId: request.user!.id, state: { not: 'ARCHIVED' } } } },
      },
      include: { show: { select: { tmdbId: true, name: true, posterPath: true, network: true } } },
      orderBy: [{ airDate: 'asc' }, { showTmdbId: 'asc' }, { number: 'asc' }],
    })
    const lang = request.user!.language
    const localized = await localizeEpisodes(episodes, lang)
    const showNames = new Map(
      (await localizeShows(episodes.map((e) => e.show), lang)).map((s) => [s.tmdbId, s.name]),
    )
    return localized.map((e) => ({ ...e, show: { ...e.show, name: showNames.get(e.show.tmdbId) ?? e.show.name } }))
  })

  // Per-user overlay for a show page: follow, rating, watched episodes.
  app.get('/api/shows/:id/user', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    const userId = request.user!.id

    const [follow, rating, watched] = await Promise.all([
      prisma.follow.findUnique({
        where: { userId_showTmdbId: { userId, showTmdbId: params.data.id } },
      }),
      prisma.rating.findUnique({
        where: { userId_target_targetRef: { userId, target: 'SHOW', targetRef: params.data.id } },
      }),
      prisma.watchEvent.groupBy({
        by: ['episodeId'],
        where: { userId, episode: { showTmdbId: params.data.id } },
        _count: true,
      }),
    ])

    return {
      follow,
      rating: rating?.value ?? null,
      watchedEpisodeIds: watched.map((w) => w.episodeId),
    }
  })

  // Per-user overlay for a movie page: viewings, watchlist, rating.
  app.get('/api/movies/:id/user', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    const userId = request.user!.id

    const [events, entry, rating] = await Promise.all([
      prisma.watchEvent.findMany({
        where: { userId, movieId: params.data.id },
        orderBy: { watchedAt: 'asc' },
        select: { watchedAt: true },
      }),
      prisma.movieWatchlistEntry.findUnique({
        where: { userId_movieTmdbId: { userId, movieTmdbId: params.data.id } },
      }),
      prisma.rating.findUnique({
        where: { userId_target_targetRef: { userId, target: 'MOVIE', targetRef: params.data.id } },
      }),
    ])

    return {
      watchedAts: events.map((e) => e.watchedAt),
      inWatchlist: entry !== null,
      rating: rating?.value ?? null,
    }
  })
}
