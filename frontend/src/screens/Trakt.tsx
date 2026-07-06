import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useImportJob, useMe } from '../api/hooks'
import { Toggle } from '../components/ui'

type TraktStatus = {
  configured: boolean
  connected: boolean
  username: string | null
  mirrorEnabled: boolean
  runningJob: { id: number; source: 'TRAKT' | 'TRAKT_EXPORT' } | null
  pendingCode: { userCode: string; verificationUrl: string } | null
}

const useTraktStatus = (poll: boolean) =>
  useQuery({
    queryKey: ['trakt-status'],
    queryFn: () => api.get<TraktStatus>('/api/trakt/status'),
    refetchInterval: poll ? 3000 : false,
  })

function JobCard({ jobId, source }: { jobId: number; source: 'TRAKT' | 'TRAKT_EXPORT' }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: job } = useImportJob(jobId)
  const phases: Record<string, string> = {
    fetch: t('trakt.phaseFetch'),
    shows: t('trakt.phaseShows'),
    movies: t('trakt.phaseMovies'),
    push: t('trakt.phasePush'),
  }

  if (job?.status === 'DONE') {
    const r = job.report as Record<string, { imported?: number; episodes?: number; movies?: number }> | null
    return (
      <div className="bg-card rounded-[18px] border border-line p-4">
        <div className="flex items-center gap-3">
          <span className="bg-green/18 text-green flex h-9 w-9 flex-none items-center justify-center rounded-full text-[15px] font-extrabold">
            ✓
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-extrabold">
              {source === 'TRAKT' ? t('trakt.importDone') : t('trakt.exportDone')}
            </div>
            <div className="text-muted mt-0.5 text-[12.5px]">
              {source === 'TRAKT'
                ? t('trakt.importDoneDetail', {
                    episodes: (r?.episodes as { imported?: number })?.imported ?? 0,
                    movies: (r?.movies as { imported?: number })?.imported ?? 0,
                  })
                : t('trakt.exportDoneDetail', {
                    episodes: (r?.pushed as { episodes?: number })?.episodes ?? 0,
                    movies: (r?.pushed as { movies?: number })?.movies ?? 0,
                  })}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => qc.invalidateQueries({ queryKey: ['trakt-status'] })}
          className="text-muted mt-2 w-full text-center text-[12.5px] font-bold"
        >
          {t('profile.importClose')}
        </button>
      </div>
    )
  }

  if (job?.status === 'FAILED') {
    return (
      <div className="bg-card rounded-[18px] border border-line p-4">
        <div className="text-danger text-[13px] font-semibold">{t('trakt.jobFailed', { error: job.error })}</div>
      </div>
    )
  }

  const p = job?.progress
  return (
    <div className="bg-card rounded-[18px] border border-line p-4">
      <div className="text-[14px] font-extrabold">
        {source === 'TRAKT' ? t('trakt.importRunning') : t('trakt.exportRunning')}
      </div>
      <div className="bg-track mt-3.5 h-1.5 overflow-hidden rounded">
        <div
          className="bg-accent h-full rounded transition-all duration-500"
          style={{ width: p ? `${(p.done / Math.max(1, p.total)) * 100}%` : '4%' }}
        />
      </div>
      <div className="text-dim mt-2 text-xs font-semibold">
        {p ? `${phases[p.phase] ?? p.phase} · ${p.done}/${p.total}` : t('profile.importAnalyzing')}
      </div>
    </div>
  )
}

export default function Trakt() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const [connecting, setConnecting] = useState(false)
  const [activeJob, setActiveJob] = useState<{ id: number; source: 'TRAKT' | 'TRAKT_EXPORT' } | null>(null)
  const { data: status } = useTraktStatus(connecting)

  const job = activeJob ?? status?.runningJob ?? null

  const connect = async () => {
    setConnecting(true)
    await api.post('/api/trakt/connect')
    await qc.invalidateQueries({ queryKey: ['trakt-status'] })
  }

  const disconnect = async () => {
    if (!confirm(t('trakt.disconnectConfirm'))) return
    await api.post('/api/trakt/disconnect')
    setConnecting(false)
    await qc.invalidateQueries({ queryKey: ['trakt-status'] })
  }

  const start = async (kind: 'import' | 'export') => {
    const { jobId } = await api.post<{ jobId: number }>(`/api/trakt/${kind}`)
    setActiveJob({ id: jobId, source: kind === 'import' ? 'TRAKT' : 'TRAKT_EXPORT' })
  }

  const setMirror = async (enabled: boolean) => {
    await api.post('/api/trakt/mirror', { enabled })
    await qc.invalidateQueries({ queryKey: ['trakt-status'] })
  }

  // Once connected, stop the connect polling.
  if (connecting && status?.connected) setConnecting(false)

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col">
      <div className="flex items-center gap-3 px-5 pt-6 pb-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="bg-card text-text flex h-8 w-8 flex-none items-center justify-center rounded-full"
        >
          ‹
        </button>
        <h1 className="flex-1 text-[22px] font-extrabold tracking-tight">Trakt</h1>
        {status?.connected && (
          <span className="text-green text-[12px] font-extrabold">
            {status.username ? `@${status.username}` : t('trakt.connected')}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3.5 pb-8">
        <div className="text-muted px-1 text-[13px] leading-normal">{t('trakt.intro')}</div>

        {!status ? null : !status.configured ? (
          <div className="bg-card rounded-[18px] border border-line p-4">
            <div className="text-[13.5px] font-bold">{t('trakt.notConfigured')}</div>
            <div className="text-muted mt-1 text-[12.5px] leading-normal">
              {me?.isAdmin ? t('trakt.notConfiguredAdmin') : t('trakt.notConfiguredUser')}
            </div>
          </div>
        ) : !status.connected ? (
          status.pendingCode ? (
            <div className="bg-card flex flex-col items-center gap-3 rounded-[18px] border border-line p-6 text-center">
              <div className="text-muted text-[13px]">{t('trakt.codeText')}</div>
              <div className="text-accent text-[34px] font-extrabold tracking-[0.2em] tabular-nums">
                {status.pendingCode.userCode}
              </div>
              <a
                href={status.pendingCode.verificationUrl}
                target="_blank"
                rel="noreferrer"
                className="bg-accent text-ink rounded-2xl px-7 py-3 text-[14px] font-extrabold"
              >
                {t('trakt.openActivate')}
              </a>
              <div className="text-dim flex items-center gap-2 text-[12px]">
                <span className="border-accent inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent" />
                {t('trakt.waiting')}
              </div>
            </div>
          ) : (
            <div className="bg-card flex flex-col items-center gap-3 rounded-[18px] border border-line p-6 text-center">
              <div className="text-muted text-[13px] leading-normal">{t('trakt.connectText')}</div>
              <button
                type="button"
                onClick={connect}
                className="bg-accent text-ink rounded-2xl px-7 py-3.5 text-[15px] font-extrabold shadow-[0_8px_24px_rgba(255,201,75,.25)]"
              >
                {t('trakt.connectButton')}
              </button>
            </div>
          )
        ) : (
          <>
            {job && <JobCard jobId={job.id} source={job.source} />}

            {!job && (
              <>
                <button
                  type="button"
                  onClick={() => start('import')}
                  className="bg-card rounded-[18px] border border-line p-4 text-left"
                >
                  <div className="text-[14.5px] font-extrabold">{t('trakt.importTitle')} ›</div>
                  <div className="text-muted mt-1 text-[12.5px] leading-normal">{t('trakt.importText')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => start('export')}
                  className="bg-card rounded-[18px] border border-line p-4 text-left"
                >
                  <div className="text-[14.5px] font-extrabold">{t('trakt.exportTitle')} ›</div>
                  <div className="text-muted mt-1 text-[12.5px] leading-normal">{t('trakt.exportText')}</div>
                </button>
              </>
            )}

            <div className="bg-card flex items-center justify-between gap-4 rounded-[18px] border border-line p-4">
              <div className="min-w-0">
                <div className="text-[14.5px] font-extrabold">{t('trakt.mirrorTitle')}</div>
                <div className="text-muted mt-1 text-[12.5px] leading-normal">{t('trakt.mirrorText')}</div>
              </div>
              <Toggle on={status.mirrorEnabled} onChange={setMirror} />
            </div>

            <button type="button" onClick={disconnect} className="text-muted py-2 text-center text-[13px] font-bold">
              {t('trakt.disconnect')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
