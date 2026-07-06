// Ops console — a deliberately separate visual world from the app:
// neutral carbon, hairline grid, sharp corners, mono numerals, one phosphor
// accent, 5s live polling. Extend by adding <Panel> blocks; the /api/admin/
// metrics payload is designed to grow.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../api/client'
import { useAdminOverview, useAdminUsers, useMe } from '../api/hooks'
import type { AdminMetrics, AdminUser } from '../api/types'
import { frDate } from '../lib/format'
import { SettingsPanel } from './OpsSettings'

const useAdminMetrics = () =>
  useQuery({
    queryKey: ['admin-metrics'],
    queryFn: () => api.get<AdminMetrics>('/api/admin/metrics'),
    refetchInterval: 5000,
    staleTime: 0,
  })

// ——— Building blocks ———

function Panel({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--ops-line)]">
      <div className="flex items-baseline justify-between px-4 pt-3 pb-2 lg:px-6">
        <h2 className="text-[11px] font-medium tracking-[0.14em] text-[var(--ops-muted)] uppercase">{title}</h2>
        {aside && <div className="text-[10px] text-[var(--ops-dim)]">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

function Kpi({ value, label, tone }: { value: string; label: string; tone?: 'accent' | 'warn' | 'danger' }) {
  const color =
    tone === 'accent'
      ? 'text-[var(--ops-accent)]'
      : tone === 'warn'
        ? 'text-[var(--ops-warn)]'
        : tone === 'danger'
          ? 'text-[var(--ops-danger)]'
          : 'text-[var(--ops-text)]'
  return (
    <div className="flex flex-col gap-1 px-4 py-4 lg:px-6">
      <div className={`text-2xl font-bold tracking-tight tabular-nums lg:text-3xl ${color}`}>{value}</div>
      <div className="text-[10px] tracking-[0.12em] text-[var(--ops-dim)] uppercase">{label}</div>
    </div>
  )
}

// Minimal SVG sparkline: per-minute p95 bars, no axis clutter.
function LatencySpark({ buckets }: { buckets: { count: number; p95: number }[] }) {
  const max = Math.max(50, ...buckets.map((b) => b.p95))
  const w = 100 / buckets.length
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-16 w-full">
      {buckets.map((b, i) => {
        const h = b.count === 0 ? 0.8 : Math.max(1.5, (b.p95 / max) * 30)
        return (
          <rect
            key={i}
            x={i * w + w * 0.15}
            y={32 - h}
            width={w * 0.7}
            height={h}
            fill={b.count === 0 ? 'var(--ops-line)' : b.p95 > 500 ? 'var(--ops-warn)' : 'var(--ops-accent)'}
            opacity={b.count === 0 ? 1 : 0.45 + 0.55 * (i / buckets.length)}
          />
        )
      })}
    </svg>
  )
}

function fmtUptime(sec: number, never: string): string {
  if (!sec) return never
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ——— Accounts ———

function AccountRow({ user, self }: { user: AdminUser; self: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setFeedback(null)
    try {
      await fn()
      setFeedback(`${label} ✓`)
      await qc.invalidateQueries({ queryKey: ['admin-users'] })
      await qc.invalidateQueries({ queryKey: ['admin-overview'] })
    } catch (err) {
      setFeedback(err instanceof ApiError ? `${label}: ${err.code}` : `${label}: error`)
    }
  }

  const status = user.blocked
    ? { label: t('admin.statusBlocked'), color: 'var(--ops-danger)' }
    : !user.emailVerified
      ? { label: t('admin.statusUnverified'), color: 'var(--ops-warn)' }
      : { label: 'ok', color: 'var(--ops-accent)' }

  const btn =
    'border border-[var(--ops-line)] px-2.5 py-1.5 text-[10px] tracking-[0.08em] uppercase text-[var(--ops-muted)] hover:text-[var(--ops-text)] hover:border-[var(--ops-muted)] transition-colors'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto_1.25rem] items-center gap-x-4 border-t border-[var(--ops-line)] px-4 py-2.5 text-left transition-colors hover:bg-white/[0.02] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_5rem_4.5rem_1.25rem] lg:px-6"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 flex-none" style={{ background: status.color }} />
          <span className="truncate text-[13px] font-medium">{user.username}</span>
          {user.isAdmin && <span className="text-[9px] tracking-[0.1em] text-[var(--ops-accent)]">ADMIN</span>}
        </span>
        <span className="hidden min-w-0 truncate text-[11px] text-[var(--ops-dim)] sm:block">{user.email ?? '—'}</span>
        <span className="hidden text-right text-[11px] tabular-nums text-[var(--ops-muted)] sm:block">
          {user.watchEvents.toLocaleString()}
        </span>
        <span className="text-right text-[11px] tabular-nums text-[var(--ops-dim)]">
          {user.lastSeenAt ? frDate(user.lastSeenAt, { day: 'numeric', month: 'short' }) : t('admin.never')}
        </span>
        <span className="text-[10px] text-[var(--ops-dim)]">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ops-line)] bg-white/[0.015] px-4 py-3 lg:px-6">
          <span className="mr-2 text-[10px] tracking-[0.1em] uppercase" style={{ color: status.color }}>
            {status.label}
          </span>
          {!user.emailVerified && user.email && (
            <>
              <button type="button" className={btn} onClick={() => act(t('admin.actResend'), () => api.post(`/api/admin/users/${user.id}/resend-verification`))}>
                {t('admin.actResend')}
              </button>
              <button type="button" className={btn} onClick={() => act(t('admin.actVerify'), () => api.post(`/api/admin/users/${user.id}/verify`))}>
                {t('admin.actVerify')}
              </button>
            </>
          )}
          {user.email && (
            <button type="button" className={btn} onClick={() => act(t('admin.actReset'), () => api.post(`/api/admin/users/${user.id}/send-reset`))}>
              {t('admin.actReset')}
            </button>
          )}
          {!self && !user.isAdmin && (
            <button
              type="button"
              className="border border-[var(--ops-danger)]/40 px-2.5 py-1.5 text-[10px] tracking-[0.08em] text-[var(--ops-danger)] uppercase transition-colors hover:border-[var(--ops-danger)]"
              onClick={() => {
                if (confirm(t('admin.deleteConfirm', { username: user.username }))) {
                  void act(t('admin.actDelete'), () => api.delete(`/api/admin/users/${user.id}`))
                }
              }}
            >
              {t('admin.actDelete')}
            </button>
          )}
          {feedback && <span className="text-[11px] text-[var(--ops-accent)]">{feedback}</span>}
        </div>
      )}
    </>
  )
}

// ——— Console ———

export default function Admin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: me } = useMe()
  const { data: metrics } = useAdminMetrics()
  const { data: overview } = useAdminOverview()
  const { data: users } = useAdminUsers()

  if (me && !me.isAdmin) {
    navigate('/', { replace: true })
    return null
  }

  // Always render 12 week slots so a young instance doesn't show one giant bar.
  const weekMs = 7 * 24 * 60 * 60 * 1000
  const signupWeeks = Array.from({ length: 12 }, (_, i) => {
    const start = new Date(Date.now() - (11 - i) * weekMs)
    const found = overview?.signupsByWeek.find(
      (w) => Math.abs(new Date(w.week).getTime() - start.getTime()) < weekMs / 2,
    )
    return { week: start.toISOString(), count: found?.count ?? 0 }
  })
  const maxSignups = Math.max(1, ...signupWeeks.map((w) => w.count))
  const p95 = metrics?.latency.p95 ?? 0
  const errRate = metrics?.throughput.errorRate15m ?? 0

  return (
    <div className="ops min-h-dvh pb-16">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-[var(--ops-line)] px-4 py-3 lg:px-6">
        <div className="flex items-baseline gap-4">
          <Link to="/" className="text-[11px] text-[var(--ops-dim)] transition-colors hover:text-[var(--ops-text)]">
            ‹ rewatch
          </Link>
          <h1 className="text-[13px] font-bold tracking-[0.18em]">OPS</h1>
        </div>
        <div className="flex items-center gap-2 text-[11px] tabular-nums text-[var(--ops-muted)]">
          <span
            className={metrics ? 'ops-live h-1.5 w-1.5 rounded-full' : 'h-1.5 w-1.5 rounded-full'}
            style={{ background: metrics ? 'var(--ops-accent)' : 'var(--ops-dim)' }}
          />
          {metrics ? `${t('admin.uptime')} ${fmtUptime(metrics.process.uptimeSec, '—')}` : t('common.loading')}
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 divide-x divide-[var(--ops-line)] sm:grid-cols-3 lg:grid-cols-6">
        <Kpi value={String(metrics?.online.last5m ?? '—')} label={t('admin.onlineNow')} tone="accent" />
        <Kpi value={String(overview?.users.total ?? '—')} label={t('admin.accounts')} />
        <Kpi value={String(overview?.users.active7 ?? '—')} label={t('admin.active7')} />
        <Kpi value={String(metrics?.throughput.requestsPerMinute ?? '—')} label={t('admin.reqPerMin')} />
        <Kpi
          value={metrics ? `${Math.round(p95)}ms` : '—'}
          label={t('admin.p95')}
          tone={p95 > 800 ? 'danger' : p95 > 300 ? 'warn' : undefined}
        />
        <Kpi
          value={metrics ? `${errRate}%` : '—'}
          label={t('admin.errors15m')}
          tone={errRate > 5 ? 'danger' : errRate > 0 ? 'warn' : undefined}
        />
      </div>

      {/* Latency */}
      <Panel title={t('admin.latency')} aside={t('admin.latencyWindow')}>
        <div className="grid grid-cols-[auto_1fr] items-end gap-6 px-4 pb-4 lg:px-6">
          <div className="flex gap-6">
            {(['p50', 'p95', 'p99'] as const).map((k) => (
              <div key={k} className="flex flex-col gap-0.5">
                <span className="text-lg font-bold tabular-nums">{metrics ? `${Math.round(metrics.latency[k])}` : '—'}</span>
                <span className="text-[9px] tracking-[0.12em] text-[var(--ops-dim)] uppercase">{k} ms</span>
              </div>
            ))}
          </div>
          <div className="min-w-0">{metrics && <LatencySpark buckets={metrics.buckets} />}</div>
        </div>
      </Panel>

      {/* Two-column: routes + system */}
      <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-[var(--ops-line)]">
        <Panel title={t('admin.slowRoutes')} aside={t('admin.latencyWindow')}>
          <div className="px-4 pb-4 lg:px-6">
            {(metrics?.routes ?? []).map((r) => (
              <div key={r.route} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-t border-[var(--ops-line)] py-1.5 text-[11px] first:border-t-0">
                <span className="truncate text-[var(--ops-muted)]">{r.route}</span>
                <span className="tabular-nums text-[var(--ops-dim)]">×{r.count}</span>
                <span className="w-14 text-right tabular-nums">{r.avg}ms</span>
                <span className="w-14 text-right tabular-nums text-[var(--ops-dim)]">{r.max}ms</span>
              </div>
            ))}
            {!metrics?.routes.length && <div className="py-2 text-[11px] text-[var(--ops-dim)]">—</div>}
          </div>
        </Panel>

        <Panel title={t('admin.system')}>
          <div className="grid grid-cols-2 gap-x-8 px-4 pb-4 sm:grid-cols-3 lg:px-6">
            {[
              [t('admin.dbPing'), metrics ? `${metrics.db.pingMs}ms` : '—'],
              [t('admin.memory'), metrics ? `${metrics.process.rssMb}mb` : '—'],
              ['heap', metrics ? `${metrics.process.heapMb}mb` : '—'],
              ['node', metrics?.process.node ?? '—'],
              [t('admin.online1h'), String(metrics?.online.last1h ?? '—')],
              [t('admin.pushSubs'), String(overview?.activity.pushSubscriptions ?? '—')],
              [t('admin.cacheShows'), String(overview?.cache.shows ?? '—')],
              [t('admin.cacheEpisodes'), (overview?.cache.episodes ?? 0).toLocaleString()],
              [
                t('admin.imports'),
                overview ? `${overview.imports.DONE ?? 0}✓ ${overview.imports.FAILED ?? 0}✗` : '—',
              ],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 border-t border-[var(--ops-line)] py-1.5 first:border-t-0 sm:[&:nth-child(-n+3)]:border-t-0">
                <span className="text-[10px] tracking-[0.1em] text-[var(--ops-dim)] uppercase">{label}</span>
                <span className="text-[11px] tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Signups */}
      <Panel title={t('admin.signups')}>
        <div className="flex h-20 items-end gap-1 px-4 pb-4 lg:px-6">
          {signupWeeks.map((s, i) => (
            <div key={i} className="flex-1" title={`${frDate(s.week)}: ${s.count}`}>
              <div
                className="w-full"
                style={{
                  height: s.count === 0 ? '3px' : `${Math.max(6, (s.count / maxSignups) * 64)}px`,
                  background: s.count === 0 ? 'var(--ops-line)' : 'var(--ops-accent)',
                  opacity: s.count === 0 ? 1 : 0.4 + 0.6 * (i / 12),
                }}
              />
            </div>
          ))}
        </div>
      </Panel>

      <SettingsPanel />

      {/* Accounts */}
      <Panel title={t('admin.accounts')} aside={`${users?.length ?? '—'}`}>
        <div className="pb-2">
          {(users ?? []).map((u) => (
            <AccountRow key={u.id} user={u} self={u.id === me?.id} />
          ))}
        </div>
      </Panel>
    </div>
  )
}
