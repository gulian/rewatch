import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useMe, useSetupStatus, useWatchlist } from '../api/hooks'
import { api } from '../api/client'
import type { WatchlistShow } from '../api/types'
import { Poster } from '../components/Poster'
import { CheckButton, ProgressBar, ScreenTitle } from '../components/ui'
import { epCode, frDate, runtimeLabel } from '../lib/format'
import { detectPlatform, isStandalone } from '../lib/install'

function UpNextCard({ item }: { item: WatchlistShow }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [justChecked, setJustChecked] = useState(false)

  // "N episodes behind" when the next episode is far in the past.
  const behind = item.totalRemaining > item.seasonRemaining * 2 && item.totalRemaining - item.seasonRemaining > 8
  const rest = behind
    ? { text: t('upnext.behind', { count: item.totalRemaining }), tone: 'late' as const }
    : item.seasonRemaining === 1
      ? { text: t('upnext.lastOfSeason'), tone: 'last' as const }
      : {
          text: t('upnext.remainingInSeason', { count: item.seasonRemaining, season: item.nextEpisode.season }),
          tone: 'normal' as const,
        }
  const progressPct =
    item.totalRemaining > 0 ? Math.max(4, 100 - (item.seasonRemaining / (item.seasonRemaining + 3)) * 100) : 100

  const check = async () => {
    setJustChecked(true)
    try {
      await api.post(`/api/episodes/${item.nextEpisode.id}/watch`)
      await qc.invalidateQueries({ queryKey: ['watchlist'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['library'] })
    } finally {
      setJustChecked(false)
    }
  }

  return (
    <div className="bg-card flex items-center gap-3.5 rounded-[18px] border border-line p-3">
      <Link viewTransition to={`/show/${item.show.tmdbId}`} className="flex-none">
        <Poster path={item.show.posterPath} title={item.show.name} size="w185" className="h-[92px] w-[62px] rounded-[11px] text-[17px]" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.25">
        <Link viewTransition to={`/show/${item.show.tmdbId}`} className="truncate text-base leading-tight font-bold">
          {item.show.name}
        </Link>
        <div className="text-muted truncate text-[13px]">
          <span className="text-text font-bold">{epCode(item.nextEpisode.season, item.nextEpisode.number)}</span>
          {item.nextEpisode.name ? ` · ${item.nextEpisode.name}` : ''}
        </div>
        <ProgressBar pct={progressPct} />
        <div
          className={`text-[11.5px] ${
            justChecked
              ? 'text-accent font-bold'
              : rest.tone === 'late'
                ? 'text-warn font-bold'
                : 'text-muted font-semibold'
          }`}
        >
          {justChecked
            ? t('upnext.justChecked', { code: epCode(item.nextEpisode.season, item.nextEpisode.number + 1) })
            : rest.text}
        </div>
      </div>
      <CheckButton checked={justChecked} busy={justChecked} onClick={check} />
    </div>
  )
}

// Placeholder cards while the watchlist loads — same footprint as UpNextCard.
function Skeleton() {
  return (
    <div className="flex flex-col gap-2.5 px-4 pt-3 pb-4 lg:grid lg:grid-cols-2 lg:gap-3.5 lg:px-8">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="bg-card flex animate-pulse items-center gap-3.5 rounded-[18px] border border-line p-3">
          <div className="bg-track h-[92px] w-[62px] flex-none rounded-[11px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="bg-track h-4 w-2/3 rounded" />
            <div className="bg-track h-3 w-1/2 rounded" />
            <div className="bg-track h-1 w-full rounded" />
            <div className="bg-track h-3 w-1/3 rounded" />
          </div>
          <div className="border-border2 h-[50px] w-[50px] flex-none rounded-full border-2" />
        </div>
      ))}
    </div>
  )
}

const PAGE_SIZE = 20

function EmptyState() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-9 pt-16 text-center">
      <div className="relative mb-7 h-[150px] w-[170px]">
        <div className="bg-userbg absolute top-4 left-0 h-[126px] w-[84px] -rotate-8 rounded-xl" />
        <div className="bg-userbg absolute top-4 right-0 h-[126px] w-[84px] rotate-8 rounded-xl" />
        <div className="bg-track absolute top-1 left-[43px] flex h-[126px] w-[84px] items-center justify-center rounded-xl border border-white/10">
          <div className="bg-accent text-ink flex h-11 w-11 items-center justify-center rounded-full text-xl font-extrabold">✓</div>
        </div>
      </div>
      <div className="text-[21px] leading-tight font-extrabold">
        {t('upnext.emptyTitle1')}
        <br />
        {t('upnext.emptyTitle2')}
      </div>
      <div className="text-muted mt-2.5 text-sm leading-normal">{t('upnext.emptyText')}</div>
      <button
        type="button"
        onClick={() => navigate('/search')}
        className="bg-accent text-ink mt-6 rounded-2xl px-7 py-3.5 text-[15px] font-extrabold shadow-[0_8px_24px_rgba(255,201,75,.25)]"
      >
        {t('upnext.emptyCta')}
      </button>
      <button
        type="button"
        onClick={() => navigate('/import/tvtime')}
        className="bg-card mt-3 rounded-2xl border border-line px-7 py-3 text-[13.5px] font-extrabold"
      >
        {t('upnext.emptyImportCta')}
      </button>
    </div>
  )
}

const INSTALL_BANNER_KEY = 'rewatch-install-banner-dismissed'

function InstallBanner() {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(
    () => isStandalone() || detectPlatform() === 'desktop' || !!localStorage.getItem(INSTALL_BANNER_KEY),
  )
  if (dismissed) return null
  return (
    <div className="bg-card flex items-center gap-3 rounded-[14px] border border-line px-4 py-3">
      <Link viewTransition to="/install" className="text-accent min-w-0 flex-1 text-[13px] font-extrabold">
        {t('upnext.installBanner')} ›
      </Link>
      <button
        type="button"
        className="text-dim flex-none px-1 text-[13px] font-semibold"
        onClick={() => {
          localStorage.setItem(INSTALL_BANNER_KEY, '1')
          setDismissed(true)
        }}
      >
        ✕
      </button>
    </div>
  )
}

const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export default function UpNext() {
  const { t } = useTranslation()
  const { data, isLoading } = useWatchlist()
  const { data: me } = useMe()
  const { data: setup } = useSetupStatus()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')

  // Fresh instance: the operator lands in the setup wizard first.
  useEffect(() => {
    if (me?.isAdmin && setup?.needsSetup) navigate('/admin/setup', { replace: true })
  }, [me, setup, navigate])

  // The API sorts by latest activity, but the order is frozen while the screen
  // is open: checking an episode must not reorder the list under the finger.
  // A fresh sort applies on the next visit to the tab.
  const orderRef = useRef(new Map<number, number>())
  const shows = useMemo(() => {
    const order = orderRef.current
    for (const s of data?.shows ?? []) {
      if (!order.has(s.show.tmdbId)) order.set(s.show.tmdbId, order.size)
    }
    return [...(data?.shows ?? [])].sort((a, b) => order.get(a.show.tmdbId)! - order.get(b.show.tmdbId)!)
  }, [data])

  const query = normalize(filter.trim())
  const filteredShows = query ? shows.filter((s) => normalize(s.show.name).includes(query)) : shows
  const filteredMovies = query
    ? (data?.movies ?? []).filter((m) => normalize(m.title).includes(query))
    : (data?.movies ?? [])

  // Progressive rendering: first PAGE_SIZE cards immediately, the rest as the
  // sentinel enters the viewport. Keeps first paint light on long lists.
  const [visible, setVisible] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || visible >= shows.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisible((v) => v + PAGE_SIZE)
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible, shows.length])

  return (
    <div className="flex min-h-full flex-col">
      <ScreenTitle
        title={t('upnext.title')}
        aside={
          data && data.shows.length > 0 ? (
            <span className="text-accent text-[13px] font-semibold">
              {t('upnext.showsInProgress', { count: data.shows.length })}
            </span>
          ) : undefined
        }
      />
      {isLoading ? (
        <Skeleton />
      ) : !data || (data.shows.length === 0 && data.movies.length === 0) ? (
        <>
          <div className="px-4 pt-3 lg:px-8">
            <InstallBanner />
          </div>
          <EmptyState />
        </>
      ) : (
        <div className="flex flex-col gap-2.5 px-4 pt-3 pb-4 lg:px-8">
          <InstallBanner />
          <label
            className={`bg-card flex items-center gap-2.5 rounded-[14px] border px-4 py-2.75 lg:max-w-md ${
              query ? 'border-accent border-[1.5px]' : 'border-white/8'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" className="flex-none">
              <path
                d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12z M14.5 14.5L20 20"
                fill="none"
                stroke={query ? 'var(--color-accent)' : 'var(--color-dim)'}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('upnext.filterPlaceholder')}
              className="placeholder:text-dim w-full bg-transparent text-[14px] font-semibold outline-none"
            />
            {query && (
              <button type="button" onClick={() => setFilter('')} className="text-dim text-[13px] font-semibold">
                ✕
              </button>
            )}
          </label>
          {query && filteredShows.length === 0 && filteredMovies.length === 0 && (
            <div className="text-dim py-8 text-center text-sm">{t('upnext.filterNoMatch')}</div>
          )}
          <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3.5">
            {filteredShows.slice(0, visible).map((s) => (
              <UpNextCard key={s.show.tmdbId} item={s} />
            ))}
          </div>
          {visible < filteredShows.length && <div ref={sentinelRef} className="h-1" />}
          {filteredMovies.length > 0 && (
            <>
              <div className="flex items-baseline justify-between px-1 pt-3.5 pb-0.5">
                <div className="text-[17px] font-extrabold lg:text-lg">{t('upnext.moviesToWatch')}</div>
                <div className="text-muted text-[12.5px] font-semibold">
                  {t('upnext.moviesCount', { count: filteredMovies.length })}
                </div>
              </div>
              <div className="flex gap-3 overflow-x-auto px-1 py-0.5 lg:gap-4">
                {filteredMovies.map((m) => (
                  <Link viewTransition key={m.tmdbId} to={`/movie/${m.tmdbId}`} className="flex w-[104px] flex-none flex-col gap-1.75 lg:w-32">
                    <Poster path={m.posterPath} title={m.title} size="w185" className="h-[156px] w-[104px] rounded-[13px] text-lg lg:h-48 lg:w-32" />
                    <div className="truncate text-xs font-semibold lg:text-[12.5px]">{m.title}</div>
                    <div className="text-dim -mt-1 text-[11px]">
                      {[m.releaseDate ? frDate(m.releaseDate, { year: 'numeric' }) : null, runtimeLabel(m.runtime)]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
