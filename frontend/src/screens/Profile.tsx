import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { api, ApiError } from '../api/client'
import { useLegalInfo, useLibrary, useMe, usePending, useStats } from '../api/hooks'
import { ScreenTitle, Spinner } from '../components/ui'
import { getCurrentSubscription, pushSupported, subscribeToPush, unsubscribeFromPush } from '../lib/push'
import { isStandalone } from '../lib/install'
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme'

function NotificationsRow() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState<boolean | null>(null) // null = unknown (loading)
  const [busy, setBusy] = useState(false)
  const [tested, setTested] = useState(false)
  const supported = pushSupported()

  useEffect(() => {
    if (!supported) return
    getCurrentSubscription().then((s) => setEnabled(s !== null))
  }, [supported])

  const toggle = async () => {
    setBusy(true)
    try {
      if (enabled) {
        await unsubscribeFromPush()
        setEnabled(false)
      } else {
        await subscribeToPush()
        setEnabled(true)
      }
    } catch {
      alert(t('profile.notificationsDenied'))
    } finally {
      setBusy(false)
    }
  }

  if (!supported) {
    return (
      <div className="flex items-center justify-between border-t border-white/5 px-4 py-3.5 opacity-50">
        <span className="text-sm font-semibold">{t('profile.notifications')}</span>
        <span className="text-dim text-xs font-bold">{t('profile.notificationsUnsupported')}</span>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || enabled === null}
        className="flex w-full items-center justify-between border-t border-white/5 px-4 py-3.5"
      >
        <div className="text-left">
          <span className="text-sm font-semibold">{t('profile.notifications')}</span>
          <div className="text-dim mt-0.5 text-[11px] font-semibold">{t('profile.notificationsHint')}</div>
        </div>
        <span
          className={`relative h-6 w-10.5 flex-none rounded-full transition-colors ${enabled ? 'bg-accent' : 'bg-track'}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? 'left-5' : 'left-0.5'}`}
          />
        </span>
      </button>
      {enabled && (
        <button
          type="button"
          disabled={tested}
          onClick={async () => {
            const { delivered } = await api.post<{ delivered: number }>('/api/push/test')
            setTested(true)
            if (delivered === 0) alert(t('profile.testNotificationFailed'))
          }}
          className="text-accent w-full border-t border-white/5 px-4 py-3 text-left text-[13px] font-bold disabled:opacity-60"
        >
          {tested ? t('profile.testNotificationSent') : t('profile.sendTestNotification')}
        </button>
      )}
    </>
  )
}

// FR/EN segment — persists on the account and switches the UI immediately.
function ThemeRow() {
  const { t } = useTranslation()
  const [pref, setPref] = useState<ThemePref>(getThemePref())

  const change = (next: ThemePref) => {
    setThemePref(next)
    setPref(next)
  }

  return (
    <div className="flex w-full items-center justify-between gap-3 border-t border-white/5 px-4 py-3.5">
      <span className="text-sm font-semibold">{t('profile.theme')}</span>
      <div className="bg-track flex rounded-[10px] p-0.5">
        {(['dark', 'light', 'system'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => change(mode)}
            className={`rounded-lg px-2.5 py-1 text-xs font-extrabold ${
              pref === mode ? 'bg-accent text-ink' : 'text-muted'
            }`}
          >
            {t(`profile.theme_${mode}`)}
          </button>
        ))}
      </div>
    </div>
  )
}

function LanguageRow() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const current = i18n.language === 'fr' ? 'fr' : 'en'

  const change = async (lang: 'fr' | 'en') => {
    if (lang === current) return
    await i18n.changeLanguage(lang)
    await api.patch('/api/auth/language', { language: lang })
    // Metadata (names, synopses, genres) is served in the account language —
    // refetch everything, not just /me.
    await qc.invalidateQueries()
  }

  return (
    <div className="flex w-full items-center justify-between border-t border-white/5 px-4 py-3.5">
      <span className="text-sm font-semibold">{t('profile.language')}</span>
      <div className="bg-track flex rounded-[10px] p-0.5">
        {(['fr', 'en'] as const).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => change(lang)}
            className={`rounded-lg px-3 py-1 text-xs font-extrabold uppercase ${
              current === lang ? 'bg-accent text-ink' : 'text-muted'
            }`}
          >
            {lang}
          </button>
        ))}
      </div>
    </div>
  )
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next !== confirm) {
      setMsg({ ok: false, text: t('profile.passwordMismatch') })
      return
    }
    try {
      await api.patch('/api/auth/password', { current, next })
      setMsg({ ok: true, text: t('profile.passwordChanged') })
      setTimeout(onClose, 1200)
    } catch {
      setMsg({ ok: false, text: t('profile.passwordError') })
    }
  }

  const inputClass =
    'bg-card placeholder:text-dim rounded-[14px] border border-white/8 px-4 py-3.5 text-[14.5px] font-semibold outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface w-full max-w-md rounded-t-3xl border border-line p-6 sm:rounded-3xl"
      >
        <div className="text-lg font-extrabold">{t('profile.passwordModalTitle')}</div>
        <div className="mt-4 flex flex-col gap-3">
          <input type="password" placeholder={t('profile.passwordCurrent')} value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} autoComplete="current-password" />
          <input type="password" placeholder={t('profile.passwordNew')} value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} autoComplete="new-password" />
          <input type="password" placeholder={t('profile.passwordConfirm')} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} autoComplete="new-password" />
          {msg && <div className={`text-[13px] font-semibold ${msg.ok ? 'text-green' : 'text-danger'}`}>{msg.text}</div>}
          <button type="submit" className="bg-accent text-ink rounded-[14px] py-3.5 text-[15px] font-extrabold">
            {t('common.confirm')}
          </button>
        </div>
      </form>
    </div>
  )
}

function EmailModal({ current, onClose }: { current: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState(current ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const qc = useQueryClient()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.patch('/api/auth/email', { email })
      await qc.invalidateQueries({ queryKey: ['me'] })
      setMsg({ ok: true, text: t('profile.emailModalSaved') })
      setTimeout(onClose, 1500)
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof ApiError && err.code === 'email_taken' ? t('profile.emailModalTaken') : t('profile.emailModalInvalid'),
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface w-full max-w-md rounded-t-3xl border border-line p-6 sm:rounded-3xl"
      >
        <div className="text-lg font-extrabold">{current ? t('profile.emailModalChange') : t('profile.emailModalSet')}</div>
        <div className="text-muted mt-1.5 text-[13px] leading-normal">{t('profile.emailModalText')}</div>
        <div className="mt-4 flex flex-col gap-3">
          <input
            type="email"
            placeholder={t('profile.emailModalPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-card placeholder:text-dim rounded-[14px] border border-white/8 px-4 py-3.5 text-[14.5px] font-semibold outline-none"
            autoComplete="email"
          />
          {msg && <div className={`text-[13px] font-semibold ${msg.ok ? 'text-green' : 'text-danger'}`}>{msg.text}</div>}
          <button type="submit" className="bg-accent text-ink rounded-[14px] py-3.5 text-[15px] font-extrabold">
            {t('common.confirm')}
          </button>
        </div>
      </form>
    </div>
  )
}

function PurgeModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()

  const armed = keyword === t('profile.purgeKeyword')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { deleted } = await api.delete<{ deleted: { watchEvents: number; follows: number } }>(
        '/api/account/history',
        { password },
      )
      await qc.invalidateQueries()
      alert(t('profile.purgeDone', { events: deleted.watchEvents, follows: deleted.follows }))
      onClose()
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t('profile.purgeWrongPassword') : t('profile.purgeError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface border-danger/30 w-full max-w-md rounded-t-3xl border p-6 sm:rounded-3xl"
      >
        <div className="text-danger text-lg font-extrabold">{t('profile.purgeModalTitle')}</div>
        <div className="text-soft mt-2 text-[13px] leading-relaxed [&_b]:font-extrabold">
          <Trans i18nKey="profile.purgeModalText" components={{ b: <b /> }} />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <div className="text-muted mb-1.5 text-xs font-bold">
              <Trans i18nKey="profile.purgeTypeToConfirm" components={{ kw: <span className="text-danger font-extrabold" /> }} />
            </div>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="bg-card placeholder:text-dim w-full rounded-[14px] border border-white/8 px-4 py-3.5 text-[14.5px] font-semibold outline-none"
              autoCapitalize="characters"
            />
          </div>
          <input
            type="password"
            placeholder={t('profile.purgePassword')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-card placeholder:text-dim rounded-[14px] border border-white/8 px-4 py-3.5 text-[14.5px] font-semibold outline-none"
            autoComplete="current-password"
          />
          {error && <div className="text-danger text-[13px] font-semibold">{error}</div>}
          <button
            type="submit"
            disabled={!armed || !password || busy}
            className="bg-danger rounded-[14px] py-3.5 text-[15px] font-extrabold text-white disabled:opacity-40"
          >
            {busy ? t('profile.purging') : t('profile.purgeButton')}
          </button>
          <button type="button" onClick={onClose} className="text-muted py-1 text-center text-[13px] font-bold">
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()

  const armed = keyword === t('profile.purgeKeyword')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.delete('/api/account', { password })
      qc.clear()
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t('profile.purgeWrongPassword') : t('profile.deleteError'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface border-danger/30 w-full max-w-md rounded-t-3xl border p-6 sm:rounded-3xl"
      >
        <div className="text-danger text-lg font-extrabold">{t('profile.deleteModalTitle')}</div>
        <div className="text-soft mt-2 text-[13px] leading-relaxed [&_b]:font-extrabold">
          <Trans i18nKey="profile.deleteModalText" components={{ b: <b /> }} />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <div className="text-muted mb-1.5 text-xs font-bold">
              <Trans i18nKey="profile.purgeTypeToConfirm" components={{ kw: <span className="text-danger font-extrabold" /> }} />
            </div>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="bg-card placeholder:text-dim w-full rounded-[14px] border border-white/8 px-4 py-3.5 text-[14.5px] font-semibold outline-none"
              autoCapitalize="characters"
            />
          </div>
          <input
            type="password"
            placeholder={t('profile.purgePassword')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-card placeholder:text-dim rounded-[14px] border border-white/8 px-4 py-3.5 text-[14.5px] font-semibold outline-none"
            autoComplete="current-password"
          />
          {error && <div className="text-danger text-[13px] font-semibold">{error}</div>}
          <button
            type="submit"
            disabled={!armed || !password || busy}
            className="bg-danger rounded-[14px] py-3.5 text-[15px] font-extrabold text-white disabled:opacity-40"
          >
            {busy ? t('profile.purging') : t('profile.deleteButton')}
          </button>
          <button type="button" onClick={onClose} className="text-muted py-1 text-center text-[13px] font-bold">
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function Profile() {
  const { t, i18n } = useTranslation()
  const { data: me } = useMe()
  const { data: stats } = useStats()
  const { data: library } = useLibrary()
  const { data: legalInfo } = useLegalInfo()
  const { data: pending } = usePending()
  const [showPassword, setShowPassword] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [showPurge, setShowPurge] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [resent, setResent] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  if (!me) return <Spinner />

  const logout = async () => {
    await api.post('/api/auth/logout')
    qc.clear()
    navigate('/login', { replace: true })
  }

  const days = stats ? Math.floor(stats.totalMinutes / 60 / 24) : null
  const followed = library?.filter((l) => l.state === 'WATCHING').length

  return (
    <div className="flex min-h-full flex-col">
      <ScreenTitle title={t('profile.title')} />
      <div className="flex flex-col gap-3.5 px-4 pt-3.5 pb-5 lg:max-w-2xl lg:px-8">
        <div className="flex items-center gap-3.5 px-1">
          <div className="bg-accent text-ink flex h-16 w-16 flex-none items-center justify-center rounded-full text-2xl font-extrabold">
            {me.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="text-[19px] font-extrabold">{me.username}</div>
            <div className="text-muted text-[13px] font-semibold">
              {t('profile.memberSince', {
                username: me.username,
                date: new Intl.DateTimeFormat(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
                  month: 'long',
                  year: 'numeric',
                }).format(new Date(me.createdAt)),
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2.5">
          <div className="bg-card flex-1 rounded-[14px] border border-line p-3 text-center">
            <div className="text-accent text-[17px] font-extrabold">{days !== null ? `${days} ${i18n.language === 'fr' ? 'j' : 'd'}` : '…'}</div>
            <div className="text-muted text-[10.5px] font-bold">{t('profile.screenTime')}</div>
          </div>
          <div className="bg-card flex-1 rounded-[14px] border border-line p-3 text-center">
            <div className="text-[17px] font-extrabold">{followed ?? '…'}</div>
            <div className="text-muted text-[10.5px] font-bold">{t('profile.followedShows')}</div>
          </div>
          <div className="bg-card flex-1 rounded-[14px] border border-line p-3 text-center">
            <div className="text-[17px] font-extrabold">{stats?.moviesWatched ?? '…'}</div>
            <div className="text-muted text-[10.5px] font-bold">{t('profile.moviesWatched')}</div>
          </div>
        </div>

        <div className="bg-card overflow-hidden rounded-[18px] border border-line">
          <div className="text-dim px-4 py-3.25 text-xs font-extrabold tracking-widest uppercase">{t('profile.dataSection')}</div>
          <Link viewTransition to="/import/tvtime" className="flex w-full items-center justify-between gap-3 border-t border-white/5 px-4 py-3.5">
            <div className="text-left">
              <span className="text-sm font-semibold">{t('profile.importTitle')}</span>
              <div className="text-dim mt-0.5 text-[11px] font-semibold">{t('profile.importRowHint')}</div>
            </div>
            <span className="text-dim">›</span>
          </Link>
          {(pending?.length ?? 0) > 0 && (
            <Link viewTransition to="/resolve" className="text-accent block w-full border-t border-white/5 px-4 py-3 text-left text-[13px] font-extrabold">
              {t('profile.importPendingLink', { count: pending!.length })}
            </Link>
          )}
          <Link viewTransition to="/trakt" className="flex w-full items-center justify-between gap-3 border-t border-white/5 px-4 py-3.5">
            <div className="text-left">
              <span className="text-sm font-semibold">{t('profile.traktRow')}</span>
              <div className="text-dim mt-0.5 text-[11px] font-semibold">{t('profile.traktRowHint')}</div>
            </div>
            <span className="text-dim">›</span>
          </Link>
          <a href="/api/account/export" download className="flex w-full items-center justify-between gap-3 border-t border-white/5 px-4 py-3.5">
            <div className="text-left">
              <span className="text-sm font-semibold">{t('profile.exportTitle')}</span>
              <div className="text-dim mt-0.5 text-[11px] font-semibold">{t('profile.exportHint')}</div>
            </div>
            <span className="text-dim">↓</span>
          </a>
        </div>

        <div className="bg-card overflow-hidden rounded-[18px] border border-line">
          <div className="text-dim px-4 py-3.25 text-xs font-extrabold tracking-widest uppercase">{t('profile.account')}</div>
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="flex w-full items-center justify-between gap-3 border-t border-white/5 px-4 py-3.5"
          >
            <span className="flex-none text-sm font-semibold">{t('profile.email')}</span>
            <span className="text-muted min-w-0 flex-1 truncate text-right text-[13px] font-semibold">
              {me.email ?? t('profile.emailToSet')}
            </span>
            {me.email &&
              (me.emailVerified ? (
                <span className="text-green flex-none text-xs font-bold">{t('profile.emailVerified')}</span>
              ) : (
                <span className="text-warn flex-none text-xs font-bold">{t('profile.emailUnverified')}</span>
              ))}
            <span className="text-dim flex-none">›</span>
          </button>
          {me.email && !me.emailVerified && (
            <button
              type="button"
              onClick={async () => {
                await api.post('/api/auth/resend-verification')
                setResent(true)
              }}
              disabled={resent}
              className="text-accent w-full border-t border-white/5 px-4 py-3 text-left text-[13px] font-bold disabled:opacity-60"
            >
              {resent ? t('profile.verificationResent') : t('profile.resendVerification')}
            </button>
          )}
          <LanguageRow />
          <ThemeRow />
          <button
            type="button"
            onClick={() => setShowPassword(true)}
            className="flex w-full items-center justify-between border-t border-white/5 px-4 py-3.5"
          >
            <span className="text-sm font-semibold">{t('profile.changePassword')}</span>
            <span className="text-dim">›</span>
          </button>
          <NotificationsRow />
          {!isStandalone() && (
            <Link viewTransition to="/install" className="flex w-full items-center justify-between border-t border-white/5 px-4 py-3.5">
              <div className="text-left">
                <span className="text-sm font-semibold">{t('profile.installRow')}</span>
                <div className="text-dim mt-0.5 text-[11px] font-semibold">{t('profile.installRowHint')}</div>
              </div>
              <span className="text-dim">›</span>
            </Link>
          )}
          <button
            type="button"
            onClick={logout}
            className="text-danger flex w-full items-center border-t border-white/5 px-4 py-3.5 text-sm font-bold"
          >
            {t('profile.logout')}
          </button>
        </div>

        {me.isAdmin && (
          <Link
            viewTransition
            to="/admin"
            className="bg-card flex items-center justify-between rounded-[18px] border border-line px-4 py-3.5"
          >
            <div className="flex items-center gap-2.5">
              <span className="bg-accent text-ink rounded px-1.5 py-0.5 text-[10px] font-extrabold">ADMIN</span>
              <span className="text-sm font-semibold">{t('admin.title')}</span>
            </div>
            <span className="text-dim">›</span>
          </Link>
        )}

        {/* Danger zone */}
        <div className="border-danger/30 overflow-hidden rounded-[18px] border">
          <div className="text-danger px-4 py-3.25 text-xs font-extrabold tracking-widest uppercase">{t('profile.dangerZone')}</div>
          <button
            type="button"
            onClick={() => setShowPurge(true)}
            className="border-danger/20 flex w-full items-center justify-between border-t px-4 py-3.5"
          >
            <div className="text-left">
              <div className="text-danger text-sm font-bold">{t('profile.purgeTitle')}</div>
              <div className="text-dim mt-0.5 text-[11.5px] font-semibold">{t('profile.purgeHint')}</div>
            </div>
            <span className="text-danger">›</span>
          </button>
          {!me.isAdmin && (
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="border-danger/20 flex w-full items-center justify-between border-t px-4 py-3.5"
            >
              <div className="text-left">
                <div className="text-danger text-sm font-bold">{t('profile.deleteAccountTitle')}</div>
                <div className="text-dim mt-0.5 text-[11.5px] font-semibold">{t('profile.deleteAccountHint')}</div>
              </div>
              <span className="text-danger">›</span>
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5 pt-2 pb-1 text-center">
          <div className="text-dim text-[12px] font-semibold">
            Made with <span className="text-accent">♥</span> by gulian
          </div>
          <div className="text-dim flex flex-wrap items-center justify-center gap-x-2 text-[11px] font-semibold">
            <a href="https://github.com/gulian/rewatch" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              GitHub
            </a>
            <span>·</span>
            <a href="https://github.com/gulian/rewatch/issues/new/choose" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {t('profile.footerIssue')}
            </a>
            {(legalInfo?.host || legalInfo?.contact) && (
              <>
                <span>·</span>
                <Link viewTransition to="/legal" className="underline underline-offset-2">
                  {t('profile.legalLink')}
                </Link>
              </>
            )}
          </div>
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noreferrer"
            className="text-dim px-4 text-[10.5px] leading-normal"
          >
            {t('profile.tmdbAttribution')}
          </a>
        </div>
      </div>
      {showPassword && <PasswordModal onClose={() => setShowPassword(false)} />}
      {showEmail && <EmailModal current={me.email} onClose={() => setShowEmail(false)} />}
      {showPurge && <PurgeModal onClose={() => setShowPurge(false)} />}
      {showDelete && <DeleteAccountModal onClose={() => setShowDelete(false)} />}
    </div>
  )
}
