import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCalendar } from '../api/hooks'
import type { CalendarEpisode } from '../api/types'
import { Poster } from '../components/Poster'
import { ScreenTitle, Spinner } from '../components/ui'
import { calendarDayLabel, epCode } from '../lib/format'

export default function Calendar() {
  const { t } = useTranslation()
  const { data, isLoading } = useCalendar()

  // Group by day (days without a release simply don't exist).
  const groups = new Map<string, CalendarEpisode[]>()
  for (const ep of data ?? []) {
    if (!ep.airDate) continue
    const key = ep.airDate.slice(0, 10)
    groups.set(key, [...(groups.get(key) ?? []), ep])
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScreenTitle title={t('calendar.title')} />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-5 px-4 pt-3.5 pb-4 lg:max-w-3xl lg:px-8">
          {[...groups.entries()].map(([day, eps]) => {
            const { label, sub, today } = calendarDayLabel(new Date(day))
            return (
              <div key={day} className="flex flex-col gap-2.25">
                <div className="flex items-baseline gap-2 px-1">
                  <span className={`text-sm font-extrabold tracking-wider uppercase ${today ? 'text-accent' : 'text-text'}`}>
                    {label}
                  </span>
                  {sub && <span className="text-dim text-xs font-semibold">{sub}</span>}
                </div>
                {eps.map((ep) => (
                  <Link
                    viewTransition
                    key={ep.id}
                    to={`/show/${ep.show.tmdbId}`}
                    className="bg-card flex items-center gap-3.25 rounded-2xl border border-line px-3 py-2.5"
                  >
                    <Poster path={ep.show.posterPath} title={ep.show.name} size="w185" className="h-[72px] w-12 rounded-[9px] text-[13px]" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.75">
                      <div className="truncate text-[15px] font-bold">{ep.show.name}</div>
                      <div className="text-muted truncate text-[13px]">
                        <span className="text-text font-bold">{epCode(ep.season, ep.number)}</span>
                        {ep.name ? ` · ${ep.name}` : ''}
                      </div>
                    </div>
                    {ep.show.network && (
                      <div className="text-soft bg-track flex-none rounded-[7px] px-2.25 py-1.25 text-[10.5px] font-bold tracking-wide uppercase">
                        {ep.show.network}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )
          })}
          <div className="text-dim pt-2 text-center text-[12.5px]">
            {groups.size === 0 ? t('calendar.noUpcoming') : t('calendar.onlyDaysWithReleases')}
          </div>
        </div>
      )}
    </div>
  )
}
