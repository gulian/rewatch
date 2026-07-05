// Stats — everything is computed from watch_events × runtimes (no denormalized counters).
import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { Prisma } from '../generated/prisma/client.js'

// Fallback runtimes when TMDB doesn't provide one.
const FALLBACK_EPISODE_MIN = 40
const FALLBACK_MOVIE_MIN = 110

export default async function statsRoutes(app: FastifyInstance) {
  app.get('/api/stats', { preHandler: app.requireAuth }, async (request) => {
    const userId = request.user!.id
    const lang = request.user!.language

    const totals = await prisma.$queryRaw<
      { episodes: bigint; movies: bigint; episode_minutes: bigint | null; movie_minutes: bigint | null }[]
    >(Prisma.sql`
      SELECT
        count(*) FILTER (WHERE w.episode_id IS NOT NULL) AS episodes,
        count(*) FILTER (WHERE w.movie_id IS NOT NULL) AS movies,
        sum(COALESCE(e.runtime, ${FALLBACK_EPISODE_MIN})) FILTER (WHERE w.episode_id IS NOT NULL) AS episode_minutes,
        sum(COALESCE(m.runtime, ${FALLBACK_MOVIE_MIN})) FILTER (WHERE w.movie_id IS NOT NULL) AS movie_minutes
      FROM watch_events w
      LEFT JOIN episodes e ON e.id = w.episode_id
      LEFT JOIN movies m ON m.tmdb_id = w.movie_id
      WHERE w.user_id = ${userId}
    `)

    const byMonth = await prisma.$queryRaw<{ month: Date; minutes: bigint; count: bigint }[]>(Prisma.sql`
      SELECT date_trunc('month', w.watched_at) AS month,
        sum(COALESCE(e.runtime, ${FALLBACK_EPISODE_MIN}) * (w.episode_id IS NOT NULL)::int
          + COALESCE(m.runtime, ${FALLBACK_MOVIE_MIN}) * (w.movie_id IS NOT NULL)::int) AS minutes,
        count(*) AS count
      FROM watch_events w
      LEFT JOIN episodes e ON e.id = w.episode_id
      LEFT JOIN movies m ON m.tmdb_id = w.movie_id
      WHERE w.user_id = ${userId}
      GROUP BY 1 ORDER BY 1
    `)

    // Genres weighted by time (a multi-genre show counts toward each one).
    const byGenre = await prisma.$queryRaw<{ genre: string; minutes: bigint }[]>(Prisma.sql`
      SELECT g.genre, sum(minutes) AS minutes FROM (
        SELECT unnest(COALESCE(st.genres, s.genres)) AS genre, COALESCE(e.runtime, ${FALLBACK_EPISODE_MIN}) AS minutes
        FROM watch_events w
        JOIN episodes e ON e.id = w.episode_id
        JOIN shows s ON s.tmdb_id = e.show_tmdb_id
        LEFT JOIN show_translations st ON st.show_tmdb_id = s.tmdb_id AND st.lang = ${lang}
        WHERE w.user_id = ${userId}
        UNION ALL
        SELECT unnest(COALESCE(mt.genres, m.genres)) AS genre, COALESCE(m.runtime, ${FALLBACK_MOVIE_MIN}) AS minutes
        FROM watch_events w
        JOIN movies m ON m.tmdb_id = w.movie_id
        LEFT JOIN movie_translations mt ON mt.movie_tmdb_id = m.tmdb_id AND mt.lang = ${lang}
        WHERE w.user_id = ${userId}
      ) g
      GROUP BY g.genre ORDER BY minutes DESC
    `)

    const topShows = await prisma.$queryRaw<
      { tmdb_id: number; name: string; poster_path: string | null; minutes: bigint; episodes: bigint }[]
    >(Prisma.sql`
      SELECT s.tmdb_id, COALESCE(st.name, s.name) AS name, s.poster_path,
        sum(COALESCE(e.runtime, ${FALLBACK_EPISODE_MIN})) AS minutes,
        count(*) AS episodes
      FROM watch_events w
      JOIN episodes e ON e.id = w.episode_id
      JOIN shows s ON s.tmdb_id = e.show_tmdb_id
      LEFT JOIN show_translations st ON st.show_tmdb_id = s.tmdb_id AND st.lang = ${lang}
      WHERE w.user_id = ${userId}
      GROUP BY s.tmdb_id, COALESCE(st.name, s.name), s.poster_path
      ORDER BY minutes DESC LIMIT 10
    `)

    // "Completed" shows: followed, final TMDB status, nothing aired left to watch.
    const completed = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*) AS count FROM follows f
      JOIN shows s ON s.tmdb_id = f.show_tmdb_id
      WHERE f.user_id = ${userId} AND s.status IN ('Ended', 'Canceled')
        AND NOT EXISTS (
          SELECT 1 FROM episodes e
          WHERE e.show_tmdb_id = f.show_tmdb_id AND e.season > 0 AND e.air_date <= now()
            AND NOT EXISTS (
              SELECT 1 FROM watch_events w
              WHERE w.user_id = ${userId} AND w.episode_id = e.id
            )
        )
    `)

    const t = totals[0]!
    return {
      totalMinutes: Number(t.episode_minutes ?? 0) + Number(t.movie_minutes ?? 0),
      episodesWatched: Number(t.episodes),
      moviesWatched: Number(t.movies),
      showsCompleted: Number(completed[0]!.count),
      byMonth: byMonth.map((r) => ({ month: r.month, minutes: Number(r.minutes), count: Number(r.count) })),
      byGenre: byGenre.map((r) => ({ genre: r.genre, minutes: Number(r.minutes) })),
      topShows: topShows.map((r) => ({
        tmdbId: r.tmdb_id,
        name: r.name,
        posterPath: r.poster_path,
        minutes: Number(r.minutes),
        episodes: Number(r.episodes),
      })),
    }
  })
}
