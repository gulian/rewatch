// Minimal TMDB client — the key never leaves the server.
// Docs: https://developer.themoviedb.org/reference

import { getSetting } from './settings.js'

const BASE = 'https://api.themoviedb.org/3'
// Instance default (base cache rows); per-call override for translations.
export const defaultLanguage = () => getSetting('TMDB_LANGUAGE') ?? 'en-US'
export const LANG_TO_TMDB: Record<string, string> = { fr: 'fr-FR', en: 'en-US' }

class TmdbError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function tmdb<T>(path: string, params: Record<string, string> = {}, language?: string): Promise<T> {
  language ??= defaultLanguage()
  const token = getSetting('TMDB_API_TOKEN')
  if (!token) throw new Error('TMDB API key is not configured (admin settings or TMDB_API_TOKEN env)')

  const url = new URL(BASE + path)
  url.searchParams.set('language', language)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  // v4 token (JWT) → Bearer header; v3 key (32 hex chars) → api_key query param.
  const headers: Record<string, string> = {}
  if (token.includes('.')) headers.Authorization = `Bearer ${token}`
  else url.searchParams.set('api_key', token)

  const res = await fetch(url, { headers })
  if (!res.ok) throw new TmdbError(res.status, `TMDB ${res.status} on ${path}`)
  return res.json() as Promise<T>
}

// ————— Types (only the fields we use) —————

export type TmdbShow = {
  id: number
  name: string
  poster_path: string | null
  backdrop_path: string | null
  overview: string
  genres: { id: number; name: string }[]
  status: string
  first_air_date: string | null
  episode_run_time: number[]
  networks: { name: string }[]
  seasons: { season_number: number; episode_count: number }[]
}

export type TmdbSeason = {
  season_number: number
  episodes: {
    id: number
    season_number: number
    episode_number: number
    name: string
    air_date: string | null
    runtime: number | null
  }[]
}

export type TmdbMovie = {
  id: number
  title: string
  original_title?: string
  poster_path: string | null
  backdrop_path: string | null
  overview: string
  genres: { id: number; name: string }[]
  release_date: string | null
  runtime: number | null
}

export type TmdbSearchResult = {
  id: number
  media_type: 'tv' | 'movie' | 'person'
  name?: string
  title?: string
  poster_path: string | null
  first_air_date?: string
  release_date?: string
  overview?: string
}

// ————— API —————

export const getShow = (tmdbId: number, language?: string) => tmdb<TmdbShow>(`/tv/${tmdbId}`, {}, language)

export const getSeason = (showTmdbId: number, seasonNumber: number, language?: string) =>
  tmdb<TmdbSeason>(`/tv/${showTmdbId}/season/${seasonNumber}`, {}, language)

export const getMovie = (tmdbId: number, language?: string) => tmdb<TmdbMovie>(`/movie/${tmdbId}`, {}, language)

export type TmdbCastMember = {
  name: string
  profile_path: string | null
  character?: string
  roles?: { character: string; episode_count: number }[]
  order?: number
}

// aggregate_credits for TV: covers every season, not just the current one.
export const getShowCredits = (tmdbId: number, language?: string) =>
  tmdb<{ cast: TmdbCastMember[] }>(`/tv/${tmdbId}/aggregate_credits`, {}, language)
export const getMovieCredits = (tmdbId: number, language?: string) =>
  tmdb<{ cast: TmdbCastMember[] }>(`/movie/${tmdbId}/credits`, {}, language)

export const searchMulti = (query: string, language?: string) =>
  tmdb<{ results: TmdbSearchResult[] }>('/search/multi', { query, include_adult: 'false' }, language)

export const searchMovie = (query: string) =>
  tmdb<{ results: TmdbMovie[] }>('/search/movie', { query, include_adult: 'false' })

export const searchTv = (query: string) =>
  tmdb<{ results: { id: number; name: string; original_name?: string }[] }>('/search/tv', {
    query,
    include_adult: 'false',
  })

/** Resolves a TheTVDB ID (TV Time export) to its TMDB entry. Null if unknown. */
export async function findShowByTvdbId(tvdbId: number): Promise<{ id: number; name: string } | null> {
  const res = await tmdb<{ tv_results: { id: number; name: string }[] }>(`/find/${tvdbId}`, {
    external_source: 'tvdb_id',
  })
  return res.tv_results[0] ?? null
}
