import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { usePending } from '../api/hooks'
import type { PendingMovie } from '../api/types'
import { Poster } from '../components/Poster'
import { Spinner } from '../components/ui'
import { frDate } from '../lib/format'

function PendingCard({ movie, onDone }: { movie: PendingMovie; onDone: () => void }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const resolve = async (tmdbId: number) => {
    setSelected(tmdbId)
    setBusy(true)
    try {
      await api.post(`/api/import/pending/${movie.id}/resolve`, { tmdbId })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const skip = async () => {
    setBusy(true)
    try {
      await api.delete(`/api/import/pending/${movie.id}`)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-card rounded-[18px] border border-line p-4">
      <div className="text-dim text-[11px] font-extrabold tracking-widest uppercase">{t('resolve.importedTitle')}</div>
      <div className="mt-0.75 text-[17px] font-extrabold">« {movie.title} »</div>
      <div className="text-muted mt-0.5 text-xs font-semibold">
        {movie.kind === 'WATCHED' && movie.watchedAts[0]
          ? t('resolve.watchedOn', { date: frDate(movie.watchedAts[0]) })
          : t('resolve.fromWatchlist')}
      </div>
      <div className="mt-3.5 flex gap-2.5">
        {movie.candidates.slice(0, 3).map((c) => (
          <button
            key={c.tmdbId}
            type="button"
            disabled={busy}
            onClick={() => resolve(c.tmdbId)}
            className="flex flex-1 flex-col gap-1.5"
          >
            <Poster
              path={c.posterPath}
              title={c.title}
              size="w185"
              className={`aspect-[2/3] w-full rounded-[11px] border-2 text-xs ${
                selected === c.tmdbId ? 'border-accent' : 'border-transparent'
              }`}
            />
            <div className="text-center text-[11px] leading-tight font-bold">{c.year ?? c.title}</div>
          </button>
        ))}
        {movie.candidates.length === 0 && (
          <div className="text-dim py-4 text-center text-xs font-semibold">{t('resolve.noCandidates')}</div>
        )}
      </div>
      <button type="button" disabled={busy} onClick={skip} className="text-dim mt-3 w-full text-center text-[12.5px] font-bold">
        {t('resolve.skip')}
      </button>
    </div>
  )
}

export default function Resolve() {
  const { t } = useTranslation()
  const { data: pending, isLoading } = usePending()
  const [resolved, setResolved] = useState(0)
  const navigate = useNavigate()
  const qc = useQueryClient()

  if (isLoading || !pending) return <Spinner />

  const total = pending.length + resolved
  const onDone = () => {
    setResolved((n) => n + 1)
    qc.invalidateQueries({ queryKey: ['pending'] })
    qc.invalidateQueries({ queryKey: ['watchlist'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
  }

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col">
      <div className="flex items-center gap-3 px-5 pt-6 pb-1">
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="bg-card text-text flex h-8 w-8 flex-none items-center justify-center rounded-full"
        >
          ‹
        </button>
        <h1 className="flex-1 text-[22px] font-extrabold tracking-tight">{t('resolve.title')}</h1>
        {total > 0 && (
          <span className="text-accent text-[12.5px] font-extrabold">
            {resolved}/{total}
          </span>
        )}
      </div>
      {total > 0 && (
        <div className="bg-track mx-5 mt-2.5 h-1 overflow-hidden rounded-sm">
          <div className="bg-accent h-full transition-all duration-300" style={{ width: `${(resolved / total) * 100}%` }} />
        </div>
      )}
      <div className="flex flex-col gap-4 px-4 pt-4.5 pb-5">
        {pending.map((m) => (
          <PendingCard key={m.id} movie={m} onDone={onDone} />
        ))}
        {pending.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="bg-accent text-ink flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold">✓</div>
            <div className="text-lg font-extrabold">{t('resolve.allDone')}</div>
            <button type="button" onClick={() => navigate('/profile')} className="text-accent text-sm font-bold">
              {t('resolve.backToProfile')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
