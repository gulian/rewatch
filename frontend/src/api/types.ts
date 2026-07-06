export type User = {
  id: number
  username: string
  email: string | null
  emailVerified: boolean
  language: 'fr' | 'en'
  isAdmin: boolean
  blocked: boolean
  verifyDeadline: string | null
  createdAt: string
}

export type Show = {
  tmdbId: number
  tvdbId: number | null
  name: string
  posterPath: string | null
  backdropPath: string | null
  overview: string | null
  genres: string[]
  status: string | null
  network: string | null
  firstAirYear: number | null
}

export type Episode = {
  id: number
  showTmdbId: number
  season: number
  number: number
  name: string | null
  airDate: string | null
  runtime: number | null
}

export type Movie = {
  tmdbId: number
  title: string
  posterPath: string | null
  backdropPath: string | null
  overview: string | null
  genres: string[]
  releaseDate: string | null
  runtime: number | null
}

export type FollowState = 'WATCHING' | 'ARCHIVED' | 'FOR_LATER'
export type Follow = {
  userId: number
  showTmdbId: number
  state: FollowState
  followedAt: string
}

export type WatchlistShow = {
  show: Show
  nextEpisode: { id: number; season: number; number: number; name: string | null; airDate: string | null }
  seasonRemaining: number
  totalRemaining: number
  lastWatchedAt: string | null
}
export type Watchlist = { shows: WatchlistShow[]; movies: Movie[] }

export type CalendarEpisode = Episode & { show: Pick<Show, 'tmdbId' | 'name' | 'posterPath'> & { network?: string | null } }

export type SearchResult = {
  tmdbId: number
  kind: 'show' | 'movie'
  title: string
  posterPath: string | null
  year: string | null
}

export type LibraryShow = {
  show: Show
  state: FollowState
  isFavorite: boolean
  watched: number
  aired: number
}

export type ShowDetail = Show & { episodes: Episode[] }
export type ShowUser = { follow: Follow | null; rating: number | null; isFavorite: boolean; watchedEpisodeIds: number[] }
export type MovieUser = { watchedAts: string[]; inWatchlist: boolean; rating: number | null; isFavorite: boolean }

export type Stats = {
  totalMinutes: number
  episodesWatched: number
  moviesWatched: number
  showsCompleted: number
  byMonth: { month: string; minutes: number; count: number }[]
  byGenre: { genre: string; minutes: number }[]
  topShows: { tmdbId: number; name: string; posterPath: string | null; minutes: number; episodes: number }[]
}

export type ImportReport = {
  shows: { mapped: number; unmapped: { tvdbId: number; name: string }[] }
  episodes: { imported: number; unmatched: number }
  follows: number
  ratings: number
  movies: { autoMatched: number; pending: number; watchlist: number }
}
export type ImportJob = {
  id: number
  status: 'RUNNING' | 'DONE' | 'FAILED'
  progress: { phase: string; done: number; total: number } | null
  report: ImportReport | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export type PendingMovie = {
  id: number
  title: string
  kind: 'WATCHED' | 'WATCHLIST'
  watchedAts: string[]
  candidates: { tmdbId: number; title: string; year: string | null; posterPath: string | null }[]
}

export type AdminOverview = {
  users: { total: number; verified: number; active7: number; active30: number }
  activity: { watchEvents30d: number; pushSubscriptions: number }
  imports: Record<string, number>
  cache: { shows: number; episodes: number; movies: number }
  signupsByWeek: { week: string; count: number }[]
}

export type AdminUser = {
  id: number
  username: string
  email: string | null
  emailVerified: boolean
  blocked: boolean
  verifyDeadline: string | null
  language: string
  isAdmin: boolean
  createdAt: string
  lastSeenAt: string | null
  watchEvents: number
  follows: number
  pushSubscriptions: number
}

export type AdminMetrics = {
  latency: { p50: number; p95: number; p99: number; window: string }
  throughput: {
    requestsPerMinute: number
    requests15m: number
    totalSinceBoot: number
    errors15m: number
    errorRate15m: number
  }
  buckets: { count: number; p95: number }[]
  routes: { route: string; count: number; avg: number; max: number }[]
  process: { uptimeSec: number; bootedAt: string; rssMb: number; heapMb: number; node: string }
  db: { pingMs: number }
  online: { last5m: number; last1h: number }
}

export type AdminSetting = {
  key: string
  set: boolean
  envLocked: boolean
  value: string | null // null for secrets, always
}

export type HighlightCard = { kind: 'show' | 'movie'; tmdbId: number; title: string; posterPath: string | null }
export type Highlights = { favorites: HighlightCard[]; topRated: (HighlightCard & { rating: number })[] }
