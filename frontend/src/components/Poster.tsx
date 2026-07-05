import { initial, posterColor, tmdbImage } from '../lib/format'

// TMDB poster with a design-faithful fallback: flat color, large ghost
// initial in the top-right corner, uppercase title at the bottom.
export function Poster({
  path,
  title,
  className = '',
  size = 'w342',
}: {
  path: string | null
  title: string
  className?: string
  size?: 'w185' | 'w342' | 'w780'
}) {
  const src = tmdbImage(path, size)
  if (src) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img src={src} alt={title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      </div>
    )
  }
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: posterColor(title) }}>
      <div className="pointer-events-none absolute -top-[10%] -right-[4%] text-[3.4em] leading-none font-extrabold text-white/15">
        {initial(title)}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-[8%] text-[0.55em] leading-[1.25] font-bold tracking-wider text-white/95 uppercase">
        {title}
      </div>
    </div>
  )
}
