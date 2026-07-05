// Landing pages for email links: /verify?token=… and /reset?token=…
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-8 pb-10">
      <div className="mb-6 flex items-center gap-2.75">
        <div className="bg-accent text-ink flex h-11 w-11 items-center justify-center rounded-[13px] text-[22px] font-extrabold">✓</div>
        <div className="text-[28px] font-extrabold tracking-tight">Rewatch</div>
      </div>
      {children}
    </div>
  )
}

export function Verify() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const [state, setState] = useState<'pending' | 'ok' | 'ko'>('pending')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // StrictMode double-run: the token is single-use
    ran.current = true
    const token = params.get('token')
    if (!token) {
      setState('ko')
      return
    }
    api
      .post('/api/auth/verify', { token })
      .then(() => setState('ok'))
      .catch(() => setState('ko'))
  }, [params])

  return (
    <Shell>
      {state === 'pending' && <div className="text-muted text-[15px]">{t('tokens.verifying')}</div>}
      {state === 'ok' && (
        <>
          <div className="text-[21px] font-extrabold">{t('tokens.verifiedTitle')}</div>
          <div className="text-muted mt-2 text-sm leading-relaxed">{t('tokens.verifiedText')}</div>
          <Link to="/" className="bg-accent text-ink mt-6 rounded-[14px] py-3.75 text-center text-[15px] font-extrabold">
            {t('tokens.openApp')}
          </Link>
        </>
      )}
      {state === 'ko' && (
        <>
          <div className="text-[21px] font-extrabold">{t('tokens.invalidTitle')}</div>
          <div className="text-muted mt-2 text-sm leading-relaxed">{t('tokens.invalidText')}</div>
          <Link to="/profile" className="text-accent mt-5 text-sm font-extrabold">
            {t('tokens.goToProfile')}
          </Link>
        </>
      )}
    </Shell>
  )
}

export function Reset() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const navigate = useNavigate()
  const token = params.get('token')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'))
      return
    }
    try {
      await api.post('/api/auth/reset', { token, password })
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 1500)
    } catch {
      setError(t('tokens.resetError'))
    }
  }

  if (!token)
    return (
      <Shell>
        <div className="text-[21px] font-extrabold">{t('tokens.invalidLink')}</div>
      </Shell>
    )

  return (
    <Shell>
      <div className="text-[21px] font-extrabold">{t('tokens.resetTitle')}</div>
      {done ? (
        <div className="text-green mt-4 text-sm font-semibold">{t('tokens.resetDone')}</div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <input
            type="password"
            placeholder={t('tokens.resetNewPassword')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-card placeholder:text-dim focus:border-accent rounded-[14px] border border-white/8 px-4 py-3.75 text-[14.5px] font-semibold outline-none"
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder={t('tokens.resetConfirm')}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="bg-card placeholder:text-dim focus:border-accent rounded-[14px] border border-white/8 px-4 py-3.75 text-[14.5px] font-semibold outline-none"
            autoComplete="new-password"
          />
          {error && <div className="text-danger text-[13px] font-semibold">{error}</div>}
          <button
            type="submit"
            disabled={password.length < 8}
            className="bg-accent text-ink rounded-[14px] py-3.75 text-[15px] font-extrabold disabled:opacity-50"
          >
            {t('common.confirm')}
          </button>
        </form>
      )}
    </Shell>
  )
}
