import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useShow, useShowUser, useTracking } from '../api/hooks'
import type { Episode, FollowState } from '../api/types'
import CastSection from '../components/CastSection'
import { Poster } from '../components/Poster'
import StateMenu from '../components/StateMenu'
import { Spinner, Stars } from '../components/ui'
import { frDate, initial, posterColor, tmdbImage } from '../lib/format'
import { buzz } from '../lib/haptics'

const STATES: { key: FollowState; labelKey: string }[] = [
  { key: 'WATCHING', labelKey: 'show.watching' },
  { key: 'ARCHIVED', labelKey: 'show.archived' },
  { key: 'FOR_LATER', labelKey: 'show.forLater' },
]

function SeasonBlock({
  season,
  episodes,
  watched,
  showId,
}: {
  season: number
  episodes: Episode[]
  watched: Set<number>
  showId: number
}) {
  const { t } = useTranslation()
  const aired = episodes.filter((e) => e.airDate && new Date(e.airDate) <= new Date())
  const seen = aired.filter((e) => watched.has(e.id)).length
  const complete = aired.length > 0 && seen === aired.length
  const [open, setOpen] = useState(!complete && aired.length > 0)
  const tracking = useTracking()

  return (
    <div className="bg-card overflow-hidden rounded-[14px] border border-line">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center justify-between px-4 py-3.5 ${open ? 'border-b border-line' : ''}`}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[14.5px] font-extrabold">
            {season === 0 ? t('show.specials') : t('show.season', { n: season })}
          </span>
          <span
            className={`rounded-md px-1.75 py-0.5 text-[11.5px] font-bold ${
              complete ? 'bg-accent text-ink' : 'bg-track text-soft'
            }`}
          >
            {seen}/{aired.length}{complete ? ' ✓' : ''}
          </span>
        </div>
        <span className="text-dim text-[13px]">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div>
          {episodes.map((e) => {
            const future = !e.airDate || new Date(e.airDate) > new Date()
            const seen = watched.has(e.id)
            return (
              <div
                key={e.id}
                className={`flex items-center gap-3 border-b border-white/[.045] px-4 py-2.75 last:border-b-0 ${
                  future ? 'opacity-45' : ''
                }`}
              >
                <span className="text-dim w-7.5 flex-none text-xs font-extrabold">E{String(e.number).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] leading-tight font-semibold">
                    {e.name ?? t('show.episodeFallback', { n: e.number })}
                  </div>
                  {e.airDate && <div className="text-dim mt-0.5 text-[11px] font-semibold">{frDate(e.airDate)}</div>}
                </div>
                {future ? (
                  <div className="text-dim border-border flex-none rounded-[7px] border-[1.5px] px-2 py-1 text-[10px] font-extrabold tracking-wider uppercase">
                    {t('show.upcoming')}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      buzz()
                      tracking.mutate({
                        method: seen ? 'delete' : 'post',
                        path: `/api/episodes/${e.id}/watch`,
                      })
                    }}
                    className={`flex h-7.5 w-7.5 flex-none items-center justify-center rounded-full border-[1.5px] text-sm font-extrabold transition-colors ${
                      seen ? 'bg-accent border-accent text-ink' : 'border-border2 text-fade'
                    }`}
                  >
                    {seen ? '✓' : ''}
                  </button>
                )}
              </div>
            )
          })}
          {aired.length > 0 &&
            (() => {
              const allSeen = aired.every((e) => watched.has(e.id))
              return (
                <button
                  type="button"
                  onClick={() =>
                    tracking.mutate({
                      method: 'post',
                      path: `/api/shows/${showId}/${allSeen ? 'unwatch-bulk' : 'watch-bulk'}`,
                      body: { season },
                    })
                  }
                  className="text-muted w-full border-t border-line px-4 py-3 text-center text-xs font-bold"
                >
                  {allSeen ? t('show.markSeasonUnwatched') : t('show.markSeasonWatched')}
                </button>
              )
            })()}
        </div>
      )}
    </div>
  )
}

export default function ShowDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const showId = Number(id)
  const navigate = useNavigate()
  const { data: show, isLoading } = useShow(showId)
  const { data: user } = useShowUser(showId)
  const tracking = useTracking()

  const watched = useMemo(() => new Set(user?.watchedEpisodeIds ?? []), [user])
  const seasons = useMemo(() => {
    const map = new Map<number, Episode[]>()
    for (const e of show?.episodes ?? []) map.set(e.season, [...(map.get(e.season) ?? []), e])
    return [...map.entries()].sort(([a], [b]) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
  }, [show])

  if (isLoading || !show) return <Spinner />

  const airedEps = show.episodes.filter((e) => e.season > 0 && e.airDate && new Date(e.airDate) <= new Date())
  const seenCount = airedEps.filter((e) => watched.has(e.id)).length
  const nextEp = [...airedEps].sort((a, b) => a.season - b.season || a.number - b.number).find((e) => !watched.has(e.id)) ?? null
  const followState = user?.follow?.state ?? null
  const isFavorite = user?.isFavorite ?? false
  const backdrop = tmdbImage(show.backdropPath, 'w780')

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col pb-8">
      {/* Immersive header */}
      <div className="relative h-[210px] overflow-hidden" style={{ background: posterColor(show.name) }}>
        {backdrop ? (
          <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute -top-8 -right-2.5 text-[190px] leading-none font-extrabold text-white/10">
            {initial(show.name)}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-surface/15 via-surface/90 to-surface" style={{ ['--tw-gradient-via-position' as string]: '88%' }} />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-text absolute top-3.5 left-4 flex h-8.5 w-8.5 items-center justify-center rounded-full bg-[rgba(9,12,20,.6)] text-base"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() =>
            tracking.mutate({
              method: isFavorite ? 'delete' : 'put',
              path: `/api/shows/${showId}/favorite`,
            })
          }
          className={`absolute top-3.5 right-4 flex h-8.5 w-8.5 items-center justify-center rounded-full bg-[rgba(9,12,20,.6)] text-[15px] ${
            isFavorite ? 'text-accent' : 'text-star-off'
          }`}
        >
          ♥
        </button>
      </div>

      <div className="relative -mt-16 flex gap-3.5 px-5">
        <Poster
          path={show.posterPath}
          title={show.name}
          size="w185"
          className="border-surface h-36 w-24 flex-none rounded-[14px] border-2 text-lg shadow-[0_10px_30px_rgba(0,0,0,.5)]"
        />
        <div className="flex min-w-0 flex-1 flex-col justify-end gap-1 pb-0.5">
          <div className="text-[23px] leading-tight font-extrabold">{show.name}</div>
          <div className="text-muted text-[12.5px] font-semibold">
            {[show.firstAirYear, show.genres.slice(0, 2).join(', '), show.network].filter(Boolean).join(' · ')}
          </div>
          <Stars
            value={user?.rating ?? null}
            onChange={(v) =>
              tracking.mutate(
                v === null
                  ? { method: 'delete', path: '/api/ratings', body: { target: 'SHOW', targetRef: showId } }
                  : { method: 'put', path: '/api/ratings', body: { target: 'SHOW', targetRef: showId, value: v } },
              )
            }
          />
        </div>
      </div>

      {/* Actions — same composition as the movie page: primary CTA + state button */}
      <div className="flex gap-2 px-5 pt-4">
        {followState === null ? (
          <>
            <button
              type="button"
              onClick={() =>
                tracking.mutate({ method: 'put', path: `/api/shows/${showId}/follow`, body: { state: 'WATCHING' } })
              }
              className="bg-accent text-ink flex-1 rounded-xl px-1 py-2.75 text-[13px] font-extrabold"
            >
              {t('show.follow')}
            </button>
            <button
              type="button"
              onClick={() =>
                tracking.mutate({ method: 'put', path: `/api/shows/${showId}/follow`, body: { state: 'FOR_LATER' } })
              }
              className="border-border text-muted flex-none rounded-xl border-[1.5px] px-3.5 py-2.75 text-[13px] font-bold"
            >
              {t('show.forLater')}
            </button>
          </>
        ) : (
          <>
            {nextEp ? (
              <button
                type="button"
                onClick={() => {
                  buzz()
                  tracking.mutate({ method: 'post', path: `/api/episodes/${nextEp.id}/watch` })
                }}
                className="bg-accent text-ink flex-1 rounded-xl px-1 py-2.75 text-[13px] font-extrabold"
              >
                {t('show.markNextWatched', { s: nextEp.season, e: String(nextEp.number).padStart(2, '0') })}
              </button>
            ) : (
              <div className="bg-track text-green flex flex-1 items-center justify-center rounded-xl px-1 py-2.75 text-[13px] font-extrabold">
                {t('show.upToDate')}
              </div>
            )}
            <StateMenu
              label={t(STATES.find((s) => s.key === followState)?.labelKey ?? 'show.watching')}
              options={STATES.map((s) => ({
                key: s.key,
                label: t(s.labelKey),
                active: followState === s.key,
                onSelect: () =>
                  tracking.mutate({ method: 'put', path: `/api/shows/${showId}/follow`, body: { state: s.key } }),
              }))}
              removeLabel={t('show.unfollow')}
              onRemove={() => tracking.mutate({ method: 'delete', path: `/api/shows/${showId}/follow` })}
            />
          </>
        )}
      </div>

      {/* Progress */}
      <div className="px-5 pt-4.5">
        <div className="mb-1.75 flex justify-between text-[12.5px] font-bold">
          <span className="text-muted">{t('show.progress')}</span>
          <span>
            <span className="text-accent">{seenCount}</span>
            <span className="text-muted">{t('show.episodesOf', { total: airedEps.length })}</span>
          </span>
        </div>
        <div className="bg-track h-1.75 overflow-hidden rounded">
          <div
            className={`h-full rounded ${airedEps.length > 0 && seenCount === airedEps.length ? 'bg-green' : 'bg-accent'}`}
            style={{ width: `${airedEps.length ? (seenCount / airedEps.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <CastSection kind="shows" tmdbId={showId} />

      {show.overview && (
        <div className="px-5 pt-4.5">
          <div className="mb-2 text-[14.5px] font-extrabold">{t('show.synopsis')}</div>
          <div className="text-soft text-[13.5px] leading-relaxed">{show.overview}</div>
        </div>
      )}

      {/* Seasons */}
      <div className="flex flex-col gap-2.5 px-4 pt-5">
        {seasons.map(([season, eps]) => (
          <SeasonBlock key={season} season={season} episodes={eps} watched={watched} showId={showId} />
        ))}
      </div>
    </div>
  )
}
