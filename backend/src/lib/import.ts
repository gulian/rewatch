// Runs a TV Time import: TMDB mapping + DB writes.
// Idempotent: replayable without duplicates (unique constraints + upserts).
import { prisma } from './prisma.js'
import * as tmdb from './tmdb.js'
import { cacheMovie, cacheShow } from './catalog.js'
import { parseTvTimeExport } from './tvtime.js'
import { FollowState, Prisma } from '../generated/prisma/client.js'

export type ImportReport = {
  shows: { mapped: number; unmapped: { tvdbId: number; name: string }[] }
  episodes: { imported: number; unmatched: number }
  follows: number
  ratings: number
  movies: { autoMatched: number; pending: number; watchlist: number }
}

async function setProgress(jobId: number, phase: string, done: number, total: number) {
  await prisma.importJob.update({ where: { id: jobId }, data: { progress: { phase, done, total } } })
}

function normalizeTitle(s: string) {
  return s
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export async function runTvTimeImport(jobId: number, userId: number, zipBuffer: Buffer): Promise<void> {
  try {
    const report = await doImport(jobId, userId, zipBuffer)
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'DONE', report: report as unknown as Prisma.InputJsonValue, progress: Prisma.DbNull },
    })
  } catch (err) {
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', error: err instanceof Error ? err.message : String(err) },
    })
  }
}

async function doImport(jobId: number, userId: number, zipBuffer: Buffer): Promise<ImportReport> {
  const data = parseTvTimeExport(zipBuffer)

  // ——— 1. Map shows tvdb → tmdb (+ cache show/episode records) ———
  const tvdbIds = [...new Set([...data.series.map((s) => s.tvdbShowId), ...data.episodeEvents.map((e) => e.tvdbShowId)])]
  const tvdbToTmdb = new Map<number, number>()
  const unmapped: { tvdbId: number; name: string }[] = []
  const nameOf = new Map<number, string>()
  for (const s of data.series) nameOf.set(s.tvdbShowId, s.name)
  for (const e of data.episodeEvents) if (!nameOf.has(e.tvdbShowId)) nameOf.set(e.tvdbShowId, e.seriesName)

  let done = 0
  for (const tvdbId of tvdbIds) {
    // Already cached (previous import or another user) → no refetch.
    const existing = await prisma.show.findUnique({ where: { tvdbId } })
    if (existing) {
      tvdbToTmdb.set(tvdbId, existing.tmdbId)
    } else {
      let found = await tmdb.findShowByTvdbId(tvdbId)
      // Fallback: some tvdb_id values in the export are legacy TheTVDB IDs that TMDB
      // doesn't know (e.g. Prison Break 75340 vs 360115) → exact match by name.
      const name = nameOf.get(tvdbId)
      if (!found && name) {
        // Two attempts: raw title, then without the year suffix — "Monster (2022)" → "Monster".
        for (const query of [name, name.replace(/\s*\(\d{4}\)\s*$/, '')]) {
          if (!query) continue
          const { results } = await tmdb.searchTv(query)
          const wanted = normalizeTitle(query)
          found =
            results.find(
              (r) =>
                normalizeTitle(r.name) === wanted || (r.original_name && normalizeTitle(r.original_name) === wanted),
            ) ?? null
          if (found) break
        }
      }
      if (found) {
        await cacheShow(found.id, tvdbId)
        tvdbToTmdb.set(tvdbId, found.id)
      } else {
        unmapped.push({ tvdbId, name: name ?? '?' })
      }
    }
    done++
    if (done % 5 === 0 || done === tvdbIds.length) await setProgress(jobId, 'shows', done, tvdbIds.length)
  }

  // ——— 2. Episode watch events ———
  await setProgress(jobId, 'episodes', 0, data.episodeEvents.length)
  // Index of (tmdbShowId, season, number) → episode.id
  const episodes = await prisma.episode.findMany({
    where: { showTmdbId: { in: [...tvdbToTmdb.values()] } },
    select: { id: true, showTmdbId: true, season: true, number: true },
  })
  const epIndex = new Map<string, number>()
  for (const ep of episodes) epIndex.set(`${ep.showTmdbId}:${ep.season}:${ep.number}`, ep.id)

  let unmatchedEpisodes = 0
  const events: { userId: number; episodeId: number; watchedAt: Date }[] = []
  for (const ev of data.episodeEvents) {
    const tmdbShowId = tvdbToTmdb.get(ev.tvdbShowId)
    const episodeId = tmdbShowId ? epIndex.get(`${tmdbShowId}:${ev.season}:${ev.number}`) : undefined
    if (!episodeId) {
      unmatchedEpisodes++
      continue
    }
    events.push({ userId, episodeId, watchedAt: ev.watchedAt })
  }
  const inserted = await prisma.watchEvent.createMany({ data: events, skipDuplicates: true })
  await setProgress(jobId, 'episodes', data.episodeEvents.length, data.episodeEvents.length)

  // ——— 3. Follows + favorites + ratings ———
  const favorites = new Set(data.favoriteTvdbIds)
  let follows = 0
  for (const s of data.series) {
    const tmdbShowId = tvdbToTmdb.get(s.tvdbShowId)
    if (!tmdbShowId) continue
    if (!s.isFollowed && !s.isArchived && !s.isForLater) continue // show dropped on the TV Time side
    const state = s.isArchived ? FollowState.ARCHIVED : s.isForLater ? FollowState.FOR_LATER : FollowState.WATCHING
    await prisma.follow.upsert({
      where: { userId_showTmdbId: { userId, showTmdbId: tmdbShowId } },
      create: { userId, showTmdbId: tmdbShowId, state, followedAt: s.followedAt },
      update: { state },
    })
    if (favorites.has(s.tvdbShowId)) {
      await prisma.favorite.upsert({
        where: { userId_target_targetRef: { userId, target: 'SHOW', targetRef: tmdbShowId } },
        create: { userId, target: 'SHOW', targetRef: tmdbShowId },
        update: {},
      })
    }
    follows++
  }

  let ratings = 0
  for (const r of data.showRatings) {
    const tmdbShowId = tvdbToTmdb.get(r.tvdbShowId)
    if (!tmdbShowId) continue
    await prisma.rating.upsert({
      where: { userId_target_targetRef: { userId, target: 'SHOW', targetRef: tmdbShowId } },
      create: { userId, target: 'SHOW', targetRef: tmdbShowId, value: r.rating * 2, ratedAt: r.ratedAt },
      update: { value: r.rating * 2 },
    })
    ratings++
  }

  // ——— 4. Movies: match by title, otherwise queue for manual resolution ———
  const allMovies = [
    ...data.watchedMovies.map((m) => ({ ...m, kind: 'WATCHED' as const })),
    ...data.watchlistMovies.map((m) => ({ ...m, kind: 'WATCHLIST' as const })),
  ]
  let autoMatched = 0
  let pending = 0
  let watchlist = 0
  let doneMovies = 0
  for (const movie of allMovies) {
    const { results } = await tmdb.searchMovie(movie.title)
    const wanted = normalizeTitle(movie.title)
    const exact = results.filter(
      (r) => normalizeTitle(r.title) === wanted || (r.original_title && normalizeTitle(r.original_title) === wanted),
    )
    // Auto-match: first exact title (TMDB sorts by relevance), or single result.
    const match = exact[0] ?? (results.length === 1 ? results[0] : null)

    if (match) {
      await applyMovieMatch(userId, match.id, movie.kind, movie.watchedAts)
      // A previous import may have left this title pending manual resolution.
      await prisma.importPendingMovie.deleteMany({ where: { userId, title: movie.title, kind: movie.kind } })
      if (movie.kind === 'WATCHED') autoMatched++
      else watchlist++
    } else {
      await prisma.importPendingMovie.upsert({
        where: { userId_title_kind: { userId, title: movie.title, kind: movie.kind } },
        create: {
          userId,
          title: movie.title,
          kind: movie.kind,
          watchedAts: movie.watchedAts,
          candidates: results.slice(0, 5).map((r) => ({
            tmdbId: r.id,
            title: r.title,
            year: r.release_date?.slice(0, 4) ?? null,
            posterPath: r.poster_path,
          })),
        },
        update: { watchedAts: movie.watchedAts },
      })
      pending++
    }
    doneMovies++
    if (doneMovies % 5 === 0 || doneMovies === allMovies.length)
      await setProgress(jobId, 'movies', doneMovies, allMovies.length)
  }

  return {
    shows: { mapped: tvdbToTmdb.size, unmapped },
    episodes: { imported: inserted.count, unmatched: unmatchedEpisodes },
    follows,
    ratings,
    movies: { autoMatched, pending, watchlist },
  }
}

/** Applies a movie match (auto or manual resolution): cache + events/watchlist. */
export async function applyMovieMatch(
  userId: number,
  movieTmdbId: number,
  kind: 'WATCHED' | 'WATCHLIST',
  watchedAts: Date[],
) {
  await cacheMovie(movieTmdbId)
  if (kind === 'WATCHED') {
    await prisma.watchEvent.createMany({
      data: watchedAts.map((watchedAt) => ({ userId, movieId: movieTmdbId, watchedAt })),
      skipDuplicates: true,
    })
  } else {
    await prisma.movieWatchlistEntry.upsert({
      where: { userId_movieTmdbId: { userId, movieTmdbId } },
      create: { userId, movieTmdbId },
      update: {},
    })
  }
}
