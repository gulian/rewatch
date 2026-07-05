import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLibrary, useSearch, useTracking } from '../api/hooks'
import { Poster } from '../components/Poster'
import { ProgressBar, ScreenTitle, Spinner } from '../components/ui'

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="flex-none">
      <path
        d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12z M14.5 14.5L20 20"
        fill="none"
        stroke={active ? 'var(--color-accent)' : 'var(--color-muted)'}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ResultCard({
  tmdbId,
  kind,
  title,
  posterPath,
  year,
}: {
  tmdbId: number
  kind: 'show' | 'movie'
  title: string
  posterPath: string | null
  year: string | null
}) {
  const { t } = useTranslation()
  const tracking = useTracking()
  const [done, setDone] = useState(false)
  const to = kind === 'show' ? `/show/${tmdbId}` : `/movie/${tmdbId}`

  const quickAdd = () => {
    setDone(true)
    tracking.mutate(
      kind === 'show'
        ? { method: 'put', path: `/api/shows/${tmdbId}/follow`, body: {} }
        : { method: 'put', path: `/api/movies/${tmdbId}/watchlist` },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Link viewTransition to={to} className="relative">
        <Poster path={posterPath} title={title} className="aspect-[2/3] w-full rounded-[14px] text-[20px]" />
        <div
          className={`absolute top-2 left-2 rounded-md bg-[rgba(9,12,20,.72)] px-2 py-1 text-[9px] font-extrabold tracking-widest uppercase ${
            kind === 'show' ? 'text-[#7EC8FF]' : 'text-accent'
          }`}
        >
          {kind === 'show' ? t('common.show') : t('common.movie')}
        </div>
      </Link>
      <div className="min-w-0">
        <Link viewTransition to={to} className="block truncate text-[13px] leading-tight font-bold">
          {title}
        </Link>
        <div className="text-dim text-[11.5px] font-semibold">{year || '—'}</div>
      </div>
      <button
        type="button"
        onClick={quickAdd}
        disabled={done}
        className={`rounded-[11px] border-[1.5px] py-2.25 text-[12.5px] font-extrabold ${
          done
            ? 'border-accent bg-accent text-ink'
            : kind === 'show'
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-text bg-transparent'
        }`}
      >
        {done ? t('search.added') : kind === 'show' ? t('search.follow') : t('search.addToWatchlist')}
      </button>
    </div>
  )
}

export default function Search() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const search = useSearch(q)
  const library = useLibrary()
  const searching = q.trim().length > 0

  return (
    <div className="flex min-h-full flex-col">
      <ScreenTitle title={t('search.title')} />
      <div className="px-4 pt-3.5 pb-1.5 lg:max-w-3xl lg:px-8">
        <label
          className={`bg-card flex items-center gap-2.5 rounded-[14px] border px-4 py-3.25 ${
            searching ? 'border-accent border-[1.5px]' : 'border-white/8'
          }`}
        >
          <SearchIcon active={searching} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            className="placeholder:text-dim w-full bg-transparent text-[15px] font-semibold outline-none"
          />
          {searching && (
            <button type="button" onClick={() => setQ('')} className="text-dim text-[13px] font-semibold">
              ✕
            </button>
          )}
        </label>
      </div>

      {searching ? (
        search.isLoading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-2 gap-3.5 px-4 pt-3 pb-4 sm:grid-cols-3 lg:max-w-4xl lg:grid-cols-5 lg:px-8">
            {(search.data ?? []).map((r) => (
              <ResultCard key={`${r.kind}-${r.tmdbId}`} {...r} />
            ))}
            {search.data?.length === 0 && (
              <div className="text-dim col-span-full py-10 text-center text-sm">{t('search.noResults')}</div>
            )}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3 px-4 pt-3 pb-4 lg:max-w-4xl lg:px-8">
          {library.data && library.data.length > 0 && (
            <div className="px-1 text-base font-extrabold">{t('search.yourShows')}</div>
          )}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {(library.data ?? []).map((l) => (
              <Link viewTransition key={l.show.tmdbId} to={`/show/${l.show.tmdbId}`} className="flex flex-col gap-1.5">
                <Poster path={l.show.posterPath} title={l.show.name} size="w185" className="aspect-[2/3] w-full rounded-[13px] text-base" />
                <ProgressBar pct={l.aired > 0 ? (l.watched / l.aired) * 100 : 0} />
                <div className="text-muted text-[11px] font-semibold">
                  {t('search.episodesProgress', { watched: l.watched, aired: l.aired })}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
