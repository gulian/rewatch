import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMovie, useMovieUser, useTracking } from '../api/hooks'
import { Poster } from '../components/Poster'
import { Spinner, Stars } from '../components/ui'
import { frDate, initial, posterColor, runtimeLabel, tmdbImage } from '../lib/format'
import { buzz } from '../lib/haptics'

export default function MovieDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const movieId = Number(id)
  const navigate = useNavigate()
  const { data: movie, isLoading } = useMovie(movieId)
  const { data: user } = useMovieUser(movieId)
  const tracking = useTracking()

  if (isLoading || !movie) return <Spinner />

  const watchCount = user?.watchedAts.length ?? 0
  const firstWatch = user?.watchedAts[0]
  const backdrop = tmdbImage(movie.backdropPath, 'w780')

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col pb-8">
      <div className="relative h-[210px] overflow-hidden" style={{ background: posterColor(movie.title) }}>
        {backdrop ? (
          <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute -top-8 -right-2.5 text-[190px] leading-none font-extrabold text-white/10">
            {initial(movie.title)}
          </div>
        )}
        <div className="from-surface/15 via-surface/90 to-surface absolute inset-0 bg-gradient-to-b" />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-text absolute top-3.5 left-4 flex h-8.5 w-8.5 items-center justify-center rounded-full bg-[rgba(9,12,20,.6)] text-base"
        >
          ‹
        </button>
      </div>

      <div className="relative -mt-16 flex gap-3.5 px-5">
        <Poster
          path={movie.posterPath}
          title={movie.title}
          size="w185"
          className="border-surface h-36 w-24 flex-none rounded-[14px] border-2 text-lg shadow-[0_10px_30px_rgba(0,0,0,.5)]"
        />
        <div className="flex min-w-0 flex-1 flex-col justify-end gap-1 pb-0.5">
          <div className="text-[23px] leading-tight font-extrabold">{movie.title}</div>
          <div className="text-muted text-[12.5px] font-semibold">
            {[
              movie.releaseDate ? frDate(movie.releaseDate, { year: 'numeric' }) : null,
              runtimeLabel(movie.runtime),
              t('movie.kind'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <Stars
            value={user?.rating ?? null}
            onChange={(v) =>
              tracking.mutate(
                v === null
                  ? { method: 'delete', path: '/api/ratings', body: { target: 'MOVIE', targetRef: movieId } }
                  : { method: 'put', path: '/api/ratings', body: { target: 'MOVIE', targetRef: movieId, value: v } },
              )
            }
          />
        </div>
      </div>

      {/* Watched / rewatch / watchlist actions */}
      <div className="flex gap-2 px-5 pt-4">
        {watchCount > 0 ? (
          <>
            <button
              type="button"
              onClick={() => tracking.mutate({ method: 'delete', path: `/api/movies/${movieId}/watch` })}
              className="bg-accent text-ink flex flex-1 items-center justify-center gap-1.75 rounded-xl px-1 py-3 text-[13px] font-extrabold"
            >
              {firstWatch ? t('movie.watchedOn', { date: frDate(firstWatch) }) : '✓'}
            </button>
            <button
              type="button"
              onClick={() => {
                buzz()
                tracking.mutate({ method: 'post', path: `/api/movies/${movieId}/watch` })
              }}
              className="border-border text-text flex flex-none items-center gap-1.75 rounded-xl border-[1.5px] px-3.5 py-3 text-[13px] font-extrabold"
            >
              {t('movie.rewatched')}
              {watchCount > 1 && (
                <span className="bg-track text-accent rounded-md px-1.75 py-px text-xs">×{watchCount - 1}</span>
              )}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                buzz()
                tracking.mutate({ method: 'post', path: `/api/movies/${movieId}/watch` })
              }}
              className="bg-accent text-ink flex-1 rounded-xl px-1 py-3 text-[13px] font-extrabold"
            >
              {t('movie.markWatched')}
            </button>
            <button
              type="button"
              onClick={() =>
                tracking.mutate({
                  method: user?.inWatchlist ? 'delete' : 'put',
                  path: `/api/movies/${movieId}/watchlist`,
                })
              }
              className={`flex-none rounded-xl border-[1.5px] px-3.5 py-3 text-[13px] font-extrabold ${
                user?.inWatchlist ? 'border-accent text-accent' : 'border-border text-text'
              }`}
            >
              {user?.inWatchlist ? t('movie.inWatchlist') : t('movie.addToWatchlist')}
            </button>
          </>
        )}
      </div>

      {movie.genres.length > 0 && (
        <div className="flex flex-wrap gap-2 px-5 pt-3">
          {movie.genres.map((g) => (
            <div key={g} className="border-border text-muted rounded-[10px] border-[1.5px] px-3 py-1.75 text-xs font-bold">
              {g}
            </div>
          ))}
        </div>
      )}

      {movie.overview && (
        <div className="px-5 pt-4.5">
          <div className="mb-2 text-[14.5px] font-extrabold">{t('movie.synopsis')}</div>
          <div className="text-soft text-[13.5px] leading-relaxed">{movie.overview}</div>
        </div>
      )}
    </div>
  )
}
