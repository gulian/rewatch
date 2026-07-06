import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as tmdb from '../lib/tmdb.js'
import { getMovieCached, getShowCached, localizeEpisodes, localizeMovies, localizeShows } from '../lib/catalog.js'
import { LANG_TO_TMDB } from '../lib/tmdb.js'

const idParam = z.object({ id: z.coerce.number().int().positive() })

export default async function catalogRoutes(app: FastifyInstance) {
  // Unified show + movie search (TMDB proxy, no caching: results are volatile).
  app.get('/api/search', { preHandler: app.requireAuth }, async (request, reply) => {
    const query = z.object({ q: z.string().min(1).max(200) }).safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: 'invalid_query' })

    const { results } = await tmdb.searchMulti(query.data.q, LANG_TO_TMDB[request.user!.language])
    return results
      .filter((r) => r.media_type === 'tv' || r.media_type === 'movie')
      .map((r) => ({
        tmdbId: r.id,
        kind: r.media_type === 'tv' ? 'show' : 'movie',
        title: r.media_type === 'tv' ? r.name : r.title,
        posterPath: r.poster_path,
        // TMDB sometimes returns an empty date ("") — hence `||`, not `??`.
        year: (r.first_air_date || r.release_date || '').slice(0, 4) || null,
      }))
  })

  app.get('/api/shows/:id', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    const lang = request.user!.language
    const show = await getShowCached(params.data.id)
    const [localized] = await localizeShows([show], lang)
    return { ...localized, episodes: await localizeEpisodes(show.episodes, lang) }
  })

  app.get('/api/movies/:id', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    const [localized] = await localizeMovies([await getMovieCached(params.data.id)], request.user!.language)
    return localized
  })

  // Cast (top billing, with photos). Fetched from TMDB on demand with a small
  // in-process TTL cache: consulted occasionally, not worth persisting.
  const castCache = new Map<string, { at: number; cast: unknown }>()
  const CAST_TTL = 24 * 60 * 60 * 1000
  const CAST_MAX = 500

  for (const kind of ['shows', 'movies'] as const) {
    app.get(`/api/${kind}/:id/cast`, { preHandler: app.requireAuth }, async (request, reply) => {
      const params = idParam.safeParse(request.params)
      if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
      const key = `${kind}:${params.data.id}`
      const hit = castCache.get(key)
      if (hit && Date.now() - hit.at < CAST_TTL) return { cast: hit.cast }

      const credits =
        kind === 'shows'
          ? await tmdb.getShowCredits(params.data.id)
          : await tmdb.getMovieCredits(params.data.id)
      const cast = (credits.cast ?? [])
        .slice(0, 12)
        .map((c) => ({
          name: c.name,
          character: c.character ?? c.roles?.[0]?.character ?? null,
          profilePath: c.profile_path,
        }))

      if (castCache.size >= CAST_MAX) castCache.delete(castCache.keys().next().value!)
      castCache.set(key, { at: Date.now(), cast })
      return { cast }
    })
  }
}
