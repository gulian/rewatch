// DB cache for TMDB metadata (shared across all users).
// Base rows hold the instance-language copy; show/episode/movie translations
// are cached for every supported language and overlaid per profile language.
import { prisma } from './prisma.js'
import * as tmdb from './tmdb.js'

const STALE_MS = 24 * 60 * 60 * 1000 // refresh after 24h (ongoing shows)
export const LANGS = ['fr', 'en'] as const
export type Lang = (typeof LANGS)[number]

function parseDate(d: string | null | undefined): Date | null {
  return d ? new Date(d) : null
}

/**
 * Upserts the show record plus all its episodes from TMDB,
 * in the instance language (base rows) and every supported language (translations).
 * `tvdbId` is set when coming from a TV Time import.
 */
export async function cacheShow(tmdbId: number, tvdbId?: number) {
  const show = await tmdb.getShow(tmdbId)
  // Average runtime declared by the show — fallback when an episode has none of its own.
  const defaultRuntime = show.episode_run_time[0] ?? null

  const common = {
    name: show.name,
    posterPath: show.poster_path,
    backdropPath: show.backdrop_path,
    overview: show.overview,
    genres: show.genres.map((g) => g.name),
    status: show.status,
    network: show.networks[0]?.name ?? null,
    firstAirYear: show.first_air_date ? Number(show.first_air_date.slice(0, 4)) : null,
  }
  await prisma.show.upsert({
    where: { tmdbId },
    create: { tmdbId, tvdbId: tvdbId ?? null, ...common },
    update: { ...(tvdbId ? { tvdbId } : {}), ...common, cachedAt: new Date() },
  })

  for (const season of show.seasons) {
    const detail = await tmdb.getSeason(tmdbId, season.season_number)
    for (const ep of detail.episodes) {
      const data = {
        tmdbId: ep.id,
        name: ep.name,
        airDate: parseDate(ep.air_date),
        runtime: ep.runtime ?? defaultRuntime,
      }
      await prisma.episode.upsert({
        where: {
          showTmdbId_season_number: {
            showTmdbId: tmdbId,
            season: ep.season_number,
            number: ep.episode_number,
          },
        },
        create: { showTmdbId: tmdbId, season: ep.season_number, number: ep.episode_number, ...data },
        update: data,
      })
    }
  }

  await cacheShowTranslations(tmdbId)

  return prisma.show.findUniqueOrThrow({
    where: { tmdbId },
    include: { episodes: { orderBy: [{ season: 'asc' }, { number: 'asc' }] } },
  })
}

/** Fetches the show in every supported language and upserts translation rows. */
export async function cacheShowTranslations(tmdbId: number) {
  const episodes = await prisma.episode.findMany({
    where: { showTmdbId: tmdbId },
    select: { id: true, season: true, number: true },
  })
  const byKey = new Map(episodes.map((e) => [`${e.season}:${e.number}`, e.id]))

  for (const lang of LANGS) {
    const tmdbLang = tmdb.LANG_TO_TMDB[lang]
    const localized = await tmdb.getShow(tmdbId, tmdbLang)
    await prisma.showTranslation.upsert({
      where: { showTmdbId_lang: { showTmdbId: tmdbId, lang } },
      create: {
        showTmdbId: tmdbId,
        lang,
        name: localized.name,
        overview: localized.overview,
        genres: localized.genres.map((g) => g.name),
      },
      update: { name: localized.name, overview: localized.overview, genres: localized.genres.map((g) => g.name) },
    })

    for (const season of localized.seasons) {
      const detail = await tmdb.getSeason(tmdbId, season.season_number, tmdbLang)
      for (const ep of detail.episodes) {
        const episodeId = byKey.get(`${ep.season_number}:${ep.episode_number}`)
        if (episodeId === undefined) continue
        await prisma.episodeTranslation.upsert({
          where: { episodeId_lang: { episodeId, lang } },
          create: { episodeId, lang, name: ep.name },
          update: { name: ep.name },
        })
      }
    }
  }
}

export async function cacheMovie(tmdbId: number) {
  const movie = await tmdb.getMovie(tmdbId)
  const data = {
    title: movie.title,
    posterPath: movie.poster_path,
    backdropPath: movie.backdrop_path,
    overview: movie.overview,
    genres: movie.genres.map((g) => g.name),
    releaseDate: parseDate(movie.release_date),
    runtime: movie.runtime,
    cachedAt: new Date(),
  }
  const saved = await prisma.movie.upsert({ where: { tmdbId }, create: { tmdbId, ...data }, update: data })

  for (const lang of LANGS) {
    const localized = await tmdb.getMovie(tmdbId, tmdb.LANG_TO_TMDB[lang])
    await prisma.movieTranslation.upsert({
      where: { movieTmdbId_lang: { movieTmdbId: tmdbId, lang } },
      create: {
        movieTmdbId: tmdbId,
        lang,
        title: localized.title,
        overview: localized.overview,
        genres: localized.genres.map((g) => g.name),
      },
      update: { title: localized.title, overview: localized.overview, genres: localized.genres.map((g) => g.name) },
    })
  }
  return saved
}

/** Show record from cache, fetched from TMDB when missing or stale (ongoing show). */
export async function getShowCached(tmdbId: number) {
  const cached = await prisma.show.findUnique({
    where: { tmdbId },
    include: { episodes: { orderBy: [{ season: 'asc' }, { number: 'asc' }] } },
  })
  const stale =
    !cached ||
    (cached.status !== 'Ended' && cached.status !== 'Canceled' && Date.now() - cached.cachedAt.getTime() > STALE_MS)
  return stale ? cacheShow(tmdbId) : cached
}

export async function getMovieCached(tmdbId: number) {
  const cached = await prisma.movie.findUnique({ where: { tmdbId } })
  return cached ?? cacheMovie(tmdbId)
}

// ——— Localization overlays (batch, applied at route level) ———

export async function localizeShows<T extends { tmdbId: number; name: string; overview?: string | null; genres?: string[] }>(
  shows: T[],
  lang: string,
): Promise<T[]> {
  if (shows.length === 0) return shows
  const translations = await prisma.showTranslation.findMany({
    where: { lang, showTmdbId: { in: shows.map((s) => s.tmdbId) } },
  })
  const byId = new Map(translations.map((t) => [t.showTmdbId, t]))
  return shows.map((s) => {
    const t = byId.get(s.tmdbId)
    if (!t) return s
    return {
      ...s,
      name: t.name,
      ...('overview' in s ? { overview: t.overview ?? s.overview } : {}),
      ...('genres' in s ? { genres: t.genres.length ? t.genres : s.genres } : {}),
    }
  })
}

export async function localizeEpisodes<T extends { id: number; name: string | null }>(
  episodes: T[],
  lang: string,
): Promise<T[]> {
  if (episodes.length === 0) return episodes
  const translations = await prisma.episodeTranslation.findMany({
    where: { lang, episodeId: { in: episodes.map((e) => e.id) } },
  })
  const byId = new Map(translations.map((t) => [t.episodeId, t.name]))
  return episodes.map((e) => {
    const name = byId.get(e.id)
    return name ? { ...e, name } : e
  })
}

export async function localizeMovies<T extends { tmdbId: number; title: string; overview?: string | null; genres?: string[] }>(
  movies: T[],
  lang: string,
): Promise<T[]> {
  if (movies.length === 0) return movies
  const translations = await prisma.movieTranslation.findMany({
    where: { lang, movieTmdbId: { in: movies.map((m) => m.tmdbId) } },
  })
  const byId = new Map(translations.map((t) => [t.movieTmdbId, t]))
  return movies.map((m) => {
    const t = byId.get(m.tmdbId)
    if (!t) return m
    return {
      ...m,
      title: t.title,
      ...('overview' in m ? { overview: t.overview ?? m.overview } : {}),
      ...('genres' in m ? { genres: t.genres.length ? t.genres : m.genres } : {}),
    }
  })
}
