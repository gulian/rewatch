// Parses the TV Time GDPR export (a zip of CSVs).
// Format documented in docs/tvtime-export-format.md (observed on real exports, July 2026).
import AdmZip from 'adm-zip'
import { parse } from 'csv-parse/sync'

export type TvTimeEpisodeEvent = {
  tvdbShowId: number
  seriesName: string
  season: number
  number: number
  watchedAt: Date
}

export type TvTimeSeries = {
  tvdbShowId: number
  name: string
  isFollowed: boolean
  isArchived: boolean
  isForLater: boolean
  followedAt: Date
}

export type TvTimeMovie = {
  title: string
  watchedAts: Date[] // empty for watchlist entries
}

export type TvTimeShowRating = {
  tvdbShowId: number
  rating: number // 1-5 (TV Time scale)
  ratedAt: Date
}

export type TvTimeExport = {
  episodeEvents: TvTimeEpisodeEvent[]
  series: TvTimeSeries[]
  watchedMovies: TvTimeMovie[]
  watchlistMovies: TvTimeMovie[]
  showRatings: TvTimeShowRating[]
  favoriteTvdbIds: number[]
}

// Export dates are formatted as 'YYYY-MM-DD HH:mm:ss' (UTC).
function parseDate(s: string): Date | null {
  if (!s) return null
  const d = new Date(s.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? null : d
}

function readCsv(zip: AdmZip, filename: string): Record<string, string>[] {
  const entry = zip.getEntries().find((e) => e.entryName.split('/').pop() === filename)
  if (!entry) return []
  return parse(entry.getData().toString('utf-8'), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  })
}

export function parseTvTimeExport(zipBuffer: Buffer): TvTimeExport {
  const zip = new AdmZip(zipBuffer)

  // — Episodes + show metadata: tracking-prod-records-v2.csv (source of truth)
  const v2 = readCsv(zip, 'tracking-prod-records-v2.csv')
  if (v2.length === 0) {
    throw new Error('tracking-prod-records-v2.csv missing from the zip — is this really a TV Time GDPR export?')
  }

  const episodeEvents: TvTimeEpisodeEvent[] = []
  const series: TvTimeSeries[] = []
  for (const row of v2) {
    const key = row.key ?? ''
    if (key.startsWith('watch-episode') || key.startsWith('rewatch-episode')) {
      const tvdbShowId = Number(row.s_id)
      const season = Number(row.season_number)
      const number = Number(row.episode_number)
      const watchedAt = parseDate(row.created_at ?? '')
      if (!tvdbShowId || Number.isNaN(season) || Number.isNaN(number) || !watchedAt) continue
      episodeEvents.push({ tvdbShowId, seriesName: row.series_name ?? '', season, number, watchedAt })
    } else if (key.startsWith('user-series')) {
      const tvdbShowId = Number(row.s_id)
      const followedAt = parseDate(row.created_at ?? '')
      if (!tvdbShowId || !followedAt) continue
      series.push({
        tvdbShowId,
        name: row.series_name ?? '',
        isFollowed: row.is_followed === 'true',
        isArchived: row.is_archived === 'true',
        isForLater: row.is_for_later === 'true',
        followedAt,
      })
    }
  }

  // — Movies: tracking-prod-records.csv (v1, the only file that contains them)
  const v1 = readCsv(zip, 'tracking-prod-records.csv')
  const watched = new Map<string, Date[]>()
  const towatch = new Set<string>()
  for (const row of v1) {
    if (row.entity_type !== 'movie' || !row.movie_name) continue
    if (row.type === 'watch') {
      const at = parseDate(row.created_at ?? '')
      if (!at) continue
      const dates = watched.get(row.movie_name) ?? []
      dates.push(at)
      watched.set(row.movie_name, dates)
    } else if (row.type === 'towatch') {
      towatch.add(row.movie_name)
    }
  }

  // — Show ratings
  const showRatings: TvTimeShowRating[] = readCsv(zip, 'tv_show_rate.csv')
    .map((row) => ({
      tvdbShowId: Number(row.tv_show_id),
      rating: Number(row.rating),
      ratedAt: parseDate(row.created_at ?? '') ?? new Date(),
    }))
    .filter((r) => r.tvdbShowId && r.rating >= 1 && r.rating <= 5)

  // — Favorites
  const favoriteTvdbIds = readCsv(zip, 'user_tv_show_data.csv')
    .filter((row) => row.is_favorited === '1')
    .map((row) => Number(row.tv_show_id))
    .filter(Boolean)

  return {
    episodeEvents,
    series,
    watchedMovies: [...watched.entries()].map(([title, watchedAts]) => ({ title, watchedAts })),
    watchlistMovies: [...towatch].filter((t) => !watched.has(t)).map((title) => ({ title, watchedAts: [] })),
    showRatings,
    favoriteTvdbIds,
  }
}
