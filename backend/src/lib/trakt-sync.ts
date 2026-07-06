// Trakt import/export jobs + the live mirror (V2).
// Same job machinery as the TV Time import: fire-and-forget, progress in
// import_jobs, idempotent DB writes.
import { prisma } from './prisma.js'
import { cacheMovie, cacheShow } from './catalog.js'
import { apiPost, getHistory, getRatings, getWatchlist } from './trakt.js'
import { FollowState, Prisma } from '../generated/prisma/client.js'

async function setProgress(jobId: number, phase: string, done: number, total: number) {
  await prisma.importJob.update({ where: { id: jobId }, data: { progress: { phase, done, total } } })
}

async function finishJob(jobId: number, fn: () => Promise<unknown>) {
  try {
    const report = await fn()
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'DONE', report: report as Prisma.InputJsonValue, progress: Prisma.DbNull },
    })
  } catch (err) {
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', error: err instanceof Error ? err.message : String(err) },
    })
  }
}

// ——— Import: Trakt → Rewatch ———

export function runTraktImport(jobId: number, userId: number): Promise<void> {
  return finishJob(jobId, async () => {
    const history = await getHistory(userId, (page, total) => void setProgress(jobId, 'fetch', page, total))
    const [ratings, watchlist] = [await getRatings(userId), await getWatchlist(userId)]

    // 1. Cache every show involved (episodes come along with each show).
    const showIds = new Set<number>()
    for (const h of history) if (h.type === 'episode' && h.show?.ids.tmdb) showIds.add(h.show.ids.tmdb)
    for (const w of watchlist) if (w.type === 'show' && w.show?.ids.tmdb) showIds.add(w.show.ids.tmdb)
    for (const r of ratings) if (r.type === 'show' && r.show?.ids.tmdb) showIds.add(r.show.ids.tmdb)

    let done = 0
    for (const tmdbId of showIds) {
      const existing = await prisma.show.findUnique({ where: { tmdbId } })
      if (!existing) await cacheShow(tmdbId)
      done++
      if (done % 5 === 0 || done === showIds.size) await setProgress(jobId, 'shows', done, showIds.size)
    }

    // 2. Episode watch events (matched by show + season + number).
    const episodes = await prisma.episode.findMany({
      where: { showTmdbId: { in: [...showIds] } },
      select: { id: true, showTmdbId: true, season: true, number: true },
    })
    const epIndex = new Map<string, number>()
    for (const ep of episodes) epIndex.set(`${ep.showTmdbId}:${ep.season}:${ep.number}`, ep.id)

    let unmatched = 0
    const events: { userId: number; episodeId: number; watchedAt: Date }[] = []
    const movieEvents: { movieTmdbId: number; watchedAt: Date }[] = []
    for (const h of history) {
      if (h.type === 'episode') {
        const showTmdb = h.show?.ids.tmdb
        const id = showTmdb ? epIndex.get(`${showTmdb}:${h.episode!.season}:${h.episode!.number}`) : undefined
        if (!id) unmatched++
        else events.push({ userId, episodeId: id, watchedAt: new Date(h.watched_at) })
      } else if (h.movie?.ids.tmdb) {
        movieEvents.push({ movieTmdbId: h.movie.ids.tmdb, watchedAt: new Date(h.watched_at) })
      }
    }
    const inserted = await prisma.watchEvent.createMany({ data: events, skipDuplicates: true })

    // 3. Movies: cache + events.
    const movieIds = [...new Set(movieEvents.map((m) => m.movieTmdbId))]
    const watchlistMovieIds = [
      ...new Set(watchlist.filter((w) => w.type === 'movie' && w.movie?.ids.tmdb).map((w) => w.movie!.ids.tmdb!)),
    ]
    let doneMovies = 0
    const allMovieIds = [...new Set([...movieIds, ...watchlistMovieIds])]
    for (const tmdbId of allMovieIds) {
      await cacheMovie(tmdbId)
      doneMovies++
      if (doneMovies % 5 === 0 || doneMovies === allMovieIds.length)
        await setProgress(jobId, 'movies', doneMovies, allMovieIds.length)
    }
    const insertedMovies = await prisma.watchEvent.createMany({
      data: movieEvents.map((m) => ({ userId, movieId: m.movieTmdbId, watchedAt: m.watchedAt })),
      skipDuplicates: true,
    })

    // 4. Follows: shows with history → WATCHING; watchlist shows → FOR_LATER.
    // upsert with empty update: never clobber a state the user already set.
    let follows = 0
    const watchedShows = new Set(events.length ? episodes.filter((e) => events.some((ev) => ev.episodeId === e.id)).map((e) => e.showTmdbId) : [])
    for (const h of history) if (h.type === 'episode' && h.show?.ids.tmdb) watchedShows.add(h.show.ids.tmdb)
    for (const tmdbId of watchedShows) {
      await prisma.follow.upsert({
        where: { userId_showTmdbId: { userId, showTmdbId: tmdbId } },
        create: { userId, showTmdbId: tmdbId, state: FollowState.WATCHING, isFavorite: false },
        update: {},
      })
      follows++
    }
    for (const w of watchlist) {
      if (w.type !== 'show' || !w.show?.ids.tmdb) continue
      await prisma.follow.upsert({
        where: { userId_showTmdbId: { userId, showTmdbId: w.show.ids.tmdb } },
        create: { userId, showTmdbId: w.show.ids.tmdb, state: FollowState.FOR_LATER, isFavorite: false },
        update: {},
      })
    }
    for (const tmdbId of watchlistMovieIds) {
      await prisma.movieWatchlistEntry.upsert({
        where: { userId_movieTmdbId: { userId, movieTmdbId: tmdbId } },
        create: { userId, movieTmdbId: tmdbId },
        update: {},
      })
    }

    // 5. Ratings (Trakt is 1-10 like ours).
    let ratingCount = 0
    for (const r of ratings) {
      const target = r.type === 'show' ? ('SHOW' as const) : r.type === 'movie' ? ('MOVIE' as const) : null
      const ref = r.type === 'show' ? r.show?.ids.tmdb : r.movie?.ids.tmdb
      if (!target || !ref) continue
      if (target === 'MOVIE' && !allMovieIds.includes(ref)) await cacheMovie(ref)
      await prisma.rating.upsert({
        where: { userId_target_targetRef: { userId, target, targetRef: ref } },
        create: { userId, target, targetRef: ref, value: r.rating, ratedAt: new Date(r.rated_at) },
        update: { value: r.rating },
      })
      ratingCount++
    }

    return {
      episodes: { imported: inserted.count, unmatched },
      movies: { imported: insertedMovies.count, watchlist: watchlistMovieIds.length },
      follows,
      ratings: ratingCount,
    }
  })
}

// ——— Export: Rewatch → Trakt ———

const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10)

export function runTraktExport(jobId: number, userId: number): Promise<void> {
  return finishJob(jobId, async () => {
    await setProgress(jobId, 'fetch', 0, 1)
    const theirs = await getHistory(userId, (page, total) => void setProgress(jobId, 'fetch', page, total))
    const seen = new Set<string>()
    for (const h of theirs) {
      if (h.type === 'episode' && h.show?.ids.tmdb)
        seen.add(`e:${h.show.ids.tmdb}:${h.episode!.season}:${h.episode!.number}:${dayKey(h.watched_at)}`)
      if (h.type === 'movie' && h.movie?.ids.tmdb) seen.add(`m:${h.movie.ids.tmdb}:${dayKey(h.watched_at)}`)
    }

    const ours = await prisma.watchEvent.findMany({
      where: { userId },
      include: { episode: { select: { showTmdbId: true, season: true, number: true } } },
    })

    // Same-day plays already on Trakt are skipped: close enough to avoid
    // duplicates without chasing exact-timestamp equality.
    type ShowAcc = Map<number, Map<number, { number: number; watched_at: string }[]>>
    const shows: ShowAcc = new Map()
    const movies: { ids: { tmdb: number }; watched_at: string }[] = []
    let skipped = 0
    let pushCount = 0
    for (const ev of ours) {
      if (ev.episode) {
        const key = `e:${ev.episode.showTmdbId}:${ev.episode.season}:${ev.episode.number}:${dayKey(ev.watchedAt)}`
        if (seen.has(key)) {
          skipped++
          continue
        }
        const seasons = shows.get(ev.episode.showTmdbId) ?? new Map()
        const eps = seasons.get(ev.episode.season) ?? []
        eps.push({ number: ev.episode.number, watched_at: ev.watchedAt.toISOString() })
        seasons.set(ev.episode.season, eps)
        shows.set(ev.episode.showTmdbId, seasons)
        pushCount++
      } else if (ev.movieId) {
        const key = `m:${ev.movieId}:${dayKey(ev.watchedAt)}`
        if (seen.has(key)) {
          skipped++
          continue
        }
        movies.push({ ids: { tmdb: ev.movieId }, watched_at: ev.watchedAt.toISOString() })
        pushCount++
      }
    }

    // POST rate limit is 1/s: chunk large pushes and pace them.
    const showPayload = [...shows.entries()].map(([tmdb, seasons]) => ({
      ids: { tmdb },
      seasons: [...seasons.entries()].map(([number, eps]) => ({ number, episodes: eps })),
    }))
    const chunks: { shows?: typeof showPayload; movies?: typeof movies }[] = []
    for (let i = 0; i < showPayload.length; i += 100) chunks.push({ shows: showPayload.slice(i, i + 100) })
    for (let i = 0; i < movies.length; i += 500) chunks.push({ movies: movies.slice(i, i + 500) })

    let added = { episodes: 0, movies: 0 }
    for (let i = 0; i < chunks.length; i++) {
      const res = await apiPost<{ added: { episodes: number; movies: number } }>(userId, '/sync/history', chunks[i])
      added = { episodes: added.episodes + (res.added?.episodes ?? 0), movies: added.movies + (res.added?.movies ?? 0) }
      await setProgress(jobId, 'push', i + 1, chunks.length)
      if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 1100))
    }

    return { pushed: added, skipped, candidates: pushCount }
  })
}

// ——— Live mirror (V2) ———

type MirrorItem =
  | { kind: 'episode'; showTmdbId: number; season: number; number: number; watchedAt?: Date }
  | { kind: 'movie'; movieTmdbId: number; watchedAt?: Date }

/** Bulk variant: one aggregated payload (POSTs are rate-limited to 1/s). */
export function mirrorBulkToTrakt(
  userId: number,
  showTmdbId: number,
  episodes: { season: number; number: number }[],
  watchedAt: Date,
): void {
  void (async () => {
    const account = await prisma.traktAccount.findUnique({ where: { userId } })
    if (!account?.mirrorEnabled || episodes.length === 0) return
    const bySeason = new Map<number, { number: number; watched_at: string }[]>()
    for (const e of episodes) {
      const list = bySeason.get(e.season) ?? []
      list.push({ number: e.number, watched_at: watchedAt.toISOString() })
      bySeason.set(e.season, list)
    }
    await apiPost(userId, '/sync/history', {
      shows: [{ ids: { tmdb: showTmdbId }, seasons: [...bySeason.entries()].map(([number, eps]) => ({ number, episodes: eps })) }],
    })
  })().catch((err) => {
    console.warn(`trakt bulk mirror failed (user ${userId}):`, err instanceof Error ? err.message : err)
  })
}

/**
 * Forwards a watch (or unwatch) to Trakt when the user enabled the mirror.
 * Fire-and-forget by design: a Trakt hiccup must never break a check-in.
 */
export function mirrorToTrakt(userId: number, action: 'add' | 'remove', item: MirrorItem): void {
  void (async () => {
    const account = await prisma.traktAccount.findUnique({ where: { userId } })
    if (!account?.mirrorEnabled) return
    const path = action === 'add' ? '/sync/history' : '/sync/history/remove'
    const watched = item.watchedAt ? { watched_at: item.watchedAt.toISOString() } : {}
    const body =
      item.kind === 'episode'
        ? { shows: [{ ids: { tmdb: item.showTmdbId }, seasons: [{ number: item.season, episodes: [{ number: item.number, ...watched }] }] }] }
        : { movies: [{ ids: { tmdb: item.movieTmdbId }, ...watched }] }
    await apiPost(userId, path, body)
  })().catch((err) => {
    console.warn(`trakt mirror failed (user ${userId}):`, err instanceof Error ? err.message : err)
  })
}
