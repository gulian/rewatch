// Small shared components, faithful to the design.
import { useTranslation } from 'react-i18next'
import { buzz } from '../lib/haptics'

export function ScreenTitle({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-5 pt-6 pb-1 lg:px-8">
      <h1 className="text-[28px] font-extrabold tracking-tight lg:text-[26px]">{title}</h1>
      {aside}
    </div>
  )
}

export function ProgressBar({ pct, className = 'h-1' }: { pct: number; className?: string }) {
  // A full bar means "all caught up" — switch from accent to green.
  return (
    <div className={`bg-track overflow-hidden rounded-full ${className}`}>
      <div
        className={`h-full rounded-full ${pct >= 100 ? 'bg-green' : 'bg-accent'}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

export function Stars({
  value,
  onChange,
}: {
  value: number | null // 1-10 on the API side → 5 displayed stars
  onChange?: (v: number | null) => void
}) {
  const { t } = useTranslation()
  const stars = value ? Math.round(value / 2) : 0
  return (
    <div className="flex items-center gap-0.75 text-base tracking-[2px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={onChange ? () => onChange(i === stars ? null : i * 2) : undefined}
          className={i <= stars ? 'text-accent' : 'text-star-off'}
        >
          ★
        </button>
      ))}
      <span className="text-muted ml-1.5 self-center text-xs font-bold tracking-normal">{t('common.myRating')}</span>
    </div>
  )
}

/** The signature check button — 50px, fills yellow with a glow. */
export function CheckButton({
  checked,
  onClick,
  size = 50,
  busy = false,
}: {
  checked: boolean
  onClick?: () => void
  size?: number
  busy?: boolean
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
          ? () => {
              buzz()
              onClick()
            }
          : undefined
      }
      disabled={busy}
      style={{ width: size, height: size }}
      className={`flex flex-none items-center justify-center rounded-full border-2 font-extrabold transition-all duration-200 ${
        checked
          ? 'bg-accent border-accent text-ink shadow-[0_6px_18px_rgba(255,201,75,.35)]'
          : 'border-border2 text-fade bg-transparent active:scale-95'
      }`}
    >
      <span style={{ fontSize: size * 0.44 }}>✓</span>
    </button>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="border-track border-t-accent h-8 w-8 animate-spin rounded-full border-[3px]" />
    </div>
  )
}
