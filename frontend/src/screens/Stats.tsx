import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useHighlights, useStats } from '../api/hooks'
import { Poster } from '../components/Poster'
import { ScreenTitle, Spinner } from '../components/ui'
import { minutesToDaysHours } from '../lib/format'

const GENRE_COLORS = ['#FFC94B', '#3FA98E', '#5B82D6', '#CD6A55', '#55628A']

export default function Stats() {
  const { t, i18n } = useTranslation()
  const { data, isLoading } = useStats()
  const { data: highlights } = useHighlights()
  if (isLoading || !data) return <Spinner />

  const numberLocale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const days = Math.floor(data.totalMinutes / 60 / 24)
  const hours = Math.round(data.totalMinutes / 60)

  // Last 12 months, gaps filled with 0, current month highlighted.
  const now = new Date()
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const row = data.byMonth.find((m) => m.month.slice(0, 7) === key)
    return {
      label: new Intl.DateTimeFormat(numberLocale, { month: 'narrow' }).format(d).toUpperCase(),
      hours: row ? row.minutes / 60 : 0,
      current: i === 11,
    }
  })
  const maxHours = Math.max(1, ...months.map((m) => m.hours))

  // Genre donut: top 4 + Others.
  const totalGenreMin = data.byGenre.reduce((n, g) => n + g.minutes, 0)
  const top = data.byGenre.slice(0, 4)
  const others = totalGenreMin - top.reduce((n, g) => n + g.minutes, 0)
  const slices = [
    ...top.map((g) => ({ name: g.genre, min: g.minutes })),
    ...(others > 0 ? [{ name: t('stats.others'), min: others }] : []),
  ]
  let acc = 0
  const gradient = slices
    .map((s, i) => {
      const from = (acc / totalGenreMin) * 100
      acc += s.min
      const to = (acc / totalGenreMin) * 100
      return `${GENRE_COLORS[i]} ${from}% ${to}%`
    })
    .join(', ')

  const maxTop = Math.max(1, ...data.topShows.map((s) => s.minutes))

  return (
    <div className="flex min-h-full flex-col">
      <ScreenTitle title={t('stats.title')} />
      <div className="flex flex-col gap-3.5 px-4 pt-3.5 pb-5 lg:max-w-3xl lg:px-8">
        {/* Total screen time hero */}
        <div className="bg-accent text-ink relative overflow-hidden rounded-[20px] px-5 py-5.5">
          <div className="absolute -top-6 -right-3 text-[130px] leading-none font-extrabold text-[rgba(34,25,10,.08)]">✓</div>
          <div className="text-xs font-extrabold tracking-widest uppercase opacity-65">{t('stats.totalScreenTime')}</div>
          <div className="mt-1.5 text-[44px] leading-tight font-extrabold tracking-tighter">
            {days > 0 ? t('stats.days', { count: days }) : minutesToDaysHours(data.totalMinutes)}
          </div>
          <div className="mt-1 text-[13.5px] font-bold opacity-75">
            {t('stats.noRegrets', { hours: hours.toLocaleString(numberLocale) })}
          </div>
        </div>

        {/* Counter tiles */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            [data.episodesWatched.toLocaleString(numberLocale), t('stats.episodesWatched')],
            [data.moviesWatched.toLocaleString(numberLocale), t('stats.moviesWatched')],
            [String(data.showsCompleted), t('stats.showsCompleted')],
          ].map(([n, l]) => (
            <div key={l} className="bg-card rounded-2xl border border-line px-3 py-3.5 text-center">
              <div className="text-[22px] font-extrabold">{n}</div>
              <div className="text-muted mt-0.5 text-[11px] font-bold">{l}</div>
            </div>
          ))}
        </div>

        {/* Last 12 months */}
        <div className="bg-card rounded-[18px] border border-line p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-extrabold">{t('stats.last12Months')}</span>
            <span className="text-muted text-[11.5px] font-bold">{t('stats.inHours')}</span>
          </div>
          <div className="mt-3.5 flex h-24 items-end gap-1.5">
            {months.map((m, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.25">
                <div
                  className={`w-full rounded-t-[5px] rounded-b-sm ${m.current ? 'bg-accent' : 'bg-border'}`}
                  style={{ height: `${Math.max(2, (m.hours / maxHours) * 100)}%` }}
                />
                <div className={`text-[9px] font-bold ${m.current ? 'text-accent' : 'text-dim'}`}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Genres */}
        {slices.length > 0 && (
          <div className="bg-card flex items-center gap-4.5 rounded-[18px] border border-line p-4">
            <div
              className="relative flex h-[110px] w-[110px] flex-none items-center justify-center rounded-full"
              style={{ background: `conic-gradient(${gradient})` }}
            >
              <div className="bg-card flex h-16 w-16 items-center justify-center rounded-full">
                <span className="text-sm font-extrabold">{t('stats.genres')}</span>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-1.75">
              {slices.map((s, i) => (
                <div key={s.name} className="flex items-center gap-2 text-xs font-bold">
                  <span className="h-2.25 w-2.25 rounded-[3px]" style={{ background: GENRE_COLORS[i] }} />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="text-muted">{Math.round((s.min / totalGenreMin) * 100)} %</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top shows */}
        {data.topShows.length > 0 && (
          <div className="bg-card flex flex-col gap-3 rounded-[18px] border border-line p-4">
            <div className="text-sm font-extrabold">{t('stats.topShows')}</div>
            {data.topShows.map((s, i) => (
              <Link viewTransition key={s.tmdbId} to={`/show/${s.tmdbId}`} className="flex items-center gap-2.75">
                <span className="text-dim w-4.5 flex-none text-[13px] font-extrabold">{i + 1}</span>
                <Poster path={s.posterPath} title={s.name} size="w185" className="h-[50px] w-[34px] flex-none rounded-[7px] text-[9px]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold">{s.name}</div>
                  <div className="bg-track mt-1.5 h-1.25 overflow-hidden rounded-[3px]">
                    <div className="bg-accent h-full rounded-[3px]" style={{ width: `${(s.minutes / maxTop) * 100}%` }} />
                  </div>
                </div>
                <span className="text-muted flex-none text-xs font-extrabold">{minutesToDaysHours(s.minutes)}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Top rated */}
        {(highlights?.topRated.length ?? 0) > 0 && (
          <div className="bg-card flex flex-col gap-3 rounded-[18px] border border-line p-4">
            <div className="text-sm font-extrabold">{t('stats.topRated')}</div>
            <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
              {highlights!.topRated.slice(0, 12).map((c) => (
                <Link viewTransition key={`${c.kind}-${c.tmdbId}`} to={`/${c.kind}/${c.tmdbId}`} className="relative">
                  <Poster path={c.posterPath} title={c.title} size="w185" className="aspect-[2/3] w-full rounded-[10px] text-xs" />
                  <span className="bg-accent text-ink absolute -top-1.5 -right-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold">
                    {c.rating}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Favorites */}
        {(highlights?.favorites.length ?? 0) > 0 && (
          <div className="bg-card flex flex-col gap-3 rounded-[18px] border border-line p-4">
            <div className="text-sm font-extrabold">{t('stats.favorites')} ♥</div>
            <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
              {highlights!.favorites.map((c) => (
                <Link viewTransition key={`${c.kind}-${c.tmdbId}`} to={`/${c.kind}/${c.tmdbId}`}>
                  <Poster path={c.posterPath} title={c.title} size="w185" className="aspect-[2/3] w-full rounded-[10px] text-xs" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
