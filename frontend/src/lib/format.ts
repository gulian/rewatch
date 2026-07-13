import i18n from '../i18n'

const locale = () => (i18n.language === 'fr' ? 'fr-FR' : 'en-GB')

export const epCode = (season: number, number: number) =>
  `S${String(season).padStart(2, '0')}E${String(number).padStart(2, '0')}`

export const tmdbImage = (path: string | null, size: 'w185' | 'w342' | 'w780' = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null

/** Design-style initial: leading article ignored ("The Office" → O). */
export const initial = (title: string) =>
  title
    .replace(/^(The|Le|La|Les|L')\s*/i, '')
    .charAt(0)
    .toUpperCase()

/** Poster fallback color, stable per title (muted palette from the design). */
const POSTER_COLORS = [
  '#1F7A6B', '#B07A3E', '#6E4A3A', '#36415F', '#7A5B2E', '#B2483A',
  '#5A3A45', '#4A6A8A', '#3E7C3A', '#5C5470', '#96692E', '#54452E',
]
export function posterColor(title: string) {
  let h = 0
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return POSTER_COLORS[h % POSTER_COLORS.length]
}

export const minutesToDaysHours = (min: number) => {
  const days = Math.floor(min / 60 / 24)
  const hours = Math.floor((min / 60) % 24)
  return days > 0
    ? i18n.t('units.daysHours', { days, hours })
    : i18n.t('units.hoursMin', { hours, min: Math.floor(min % 60) })
}

export const runtimeLabel = (min: number | null) => {
  if (!min) return null
  const h = Math.floor(min / 60)
  return h > 0 ? i18n.t('units.hoursShort', { h, mm: String(min % 60).padStart(2, '0') }) : i18n.t('units.minutes', { min })
}

export const frDate = (d: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Intl.DateTimeFormat(locale(), opts).format(new Date(d))

/** "Today" / "Tomorrow" / "Sunday 12 July" (+ year when different) for the calendar. */
export function calendarDayLabel(date: Date): { label: string; sub: string; today: boolean; daysUntil: number | null } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  const sameYear = target.getFullYear() === today.getFullYear()
  const full = new Intl.DateTimeFormat(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
  if (diff === 0) return { label: i18n.t('calendar.today'), sub: full, today: true, daysUntil: null }
  if (diff === 1) return { label: i18n.t('calendar.tomorrow'), sub: full, today: false, daysUntil: null }
  return { label: full.charAt(0).toUpperCase() + full.slice(1), sub: '', today: false, daysUntil: diff > 0 ? diff : null }
}
