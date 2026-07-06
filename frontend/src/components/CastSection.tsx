// Top-billed cast as a grid (no horizontal scroll): 6 faces, expandable.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { Poster } from './Poster'

type CastMember = { name: string; character: string | null; profilePath: string | null }

export default function CastSection({ kind, tmdbId }: { kind: 'shows' | 'movies'; tmdbId: number }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const { data } = useQuery({
    queryKey: ['cast', kind, tmdbId],
    queryFn: () => api.get<{ cast: CastMember[] }>(`/api/${kind}/${tmdbId}/cast`),
    staleTime: 60 * 60 * 1000,
  })

  const cast = data?.cast ?? []
  if (cast.length === 0) return null
  const shown = expanded ? cast : cast.slice(0, 6)

  return (
    <div className="px-5 pt-5">
      <div className="mb-2.5 text-[15px] font-extrabold">{t('show.cast')}</div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {shown.map((c) => (
          <div key={c.name} className="flex flex-col gap-1.25">
            <Poster path={c.profilePath} title={c.name} size="w185" className="aspect-[3/4] w-full rounded-[12px] text-base" />
            <div className="truncate text-[11.5px] leading-tight font-bold">{c.name}</div>
            {c.character && <div className="text-dim -mt-0.5 truncate text-[10.5px]">{c.character}</div>}
          </div>
        ))}
      </div>
      {cast.length > 6 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted mt-2.5 w-full text-center text-xs font-bold"
        >
          {expanded ? t('show.castLess') : t('show.castMore', { count: cast.length })}
        </button>
      )}
    </div>
  )
}
