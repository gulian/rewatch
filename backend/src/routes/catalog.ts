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
}
