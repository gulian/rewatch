import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../api/client'
import { browserLang } from '../i18n'

type Mode = 'login' | 'register' | 'forgot'

const inputClass =
  'bg-card rounded-[14px] border border-white/8 px-4 py-3.75 text-[14.5px] font-semibold outline-none placeholder:text-dim focus:border-accent focus:border-[1.5px]'

export default function Login() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
    setInfo(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'forgot') {
        await api.post('/api/auth/forgot', { email })
        setInfo(t('auth.forgotSent'))
        return
      }
      if (mode === 'register') {
        if (password !== confirm) {
          setError(t('auth.passwordMismatch'))
          return
        }
        // The browser language becomes the account language, changeable later.
        await api.post('/api/auth/register', { username, password, email, language: browserLang() })
      } else {
        await api.post('/api/auth/login', { username, password })
      }
      await qc.invalidateQueries()
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.code === 'registration_closed'
            ? t('auth.registrationClosed')
            : err.code === 'invalid_credentials'
              ? t('auth.invalidCredentials')
            : err.code === 'username_taken'
              ? t('auth.usernameTaken')
              : err.code === 'email_taken'
                ? t('auth.emailTaken')
                : err.status === 429
                  ? t('auth.tooManyAttempts')
                  : t('auth.validationHint'),
        )
      } else setError(t('common.networkError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-8 pb-10">
      <div className="mb-4.5 flex items-center gap-2.75">
        <div className="bg-accent text-ink flex h-11 w-11 items-center justify-center rounded-[13px] text-[22px] font-extrabold">✓</div>
        <div className="text-[28px] font-extrabold tracking-tight">Rewatch</div>
      </div>

      {mode === 'login' && <div className="text-muted text-[15px] leading-relaxed">{t('auth.tagline')}</div>}
      {mode === 'register' && (
        <>
          <div className="text-[21px] leading-snug font-extrabold">{t('auth.createAccount')}</div>
          <div className="text-muted mt-2 text-sm leading-relaxed">{t('auth.createAccountText')}</div>
        </>
      )}
      {mode === 'forgot' && (
        <>
          <div className="text-[21px] leading-snug font-extrabold">{t('auth.forgotTitle')}</div>
          <div className="text-muted mt-2 text-sm leading-relaxed">{t('auth.forgotText')}</div>
        </>
      )}

      <form onSubmit={submit} className="mt-7 flex flex-col gap-3">
        {mode !== 'forgot' && (
          <input
            className={inputClass}
            placeholder={t('auth.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoComplete="username"
          />
        )}
        {mode !== 'login' && (
          <input
            className={inputClass}
            placeholder={t('auth.email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        )}
        {mode !== 'forgot' && (
          <div className={`${inputClass} flex items-center`}>
            <input
              className="placeholder:text-dim w-full bg-transparent outline-none"
              placeholder={t('auth.password')}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-dim ml-auto flex-none text-xs font-bold">
              {showPassword ? t('auth.hide') : t('auth.show')}
            </button>
          </div>
        )}
        {mode === 'register' && (
          <input
            className={inputClass}
            placeholder={t('auth.confirmPassword')}
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        )}
        {error && <div className="text-danger text-[13px] font-semibold">{error}</div>}
        {info && <div className="text-green text-[13px] font-semibold">{info}</div>}
        <button
          type="submit"
          disabled={busy || (mode === 'forgot' ? !email : !username || !password) || (mode === 'register' && !email)}
          className="bg-accent text-ink rounded-[14px] py-3.75 text-center text-[15px] font-extrabold shadow-[0_8px_24px_rgba(255,201,75,.22)] disabled:opacity-50"
        >
          {mode === 'login' ? t('auth.login') : mode === 'register' ? t('auth.signup') : t('auth.sendLink')}
        </button>
      </form>

      {mode === 'login' && (
        <button type="button" onClick={() => switchMode('forgot')} className="text-muted mt-4 text-center text-[13px] font-semibold">
          {t('auth.forgotLink')}
        </button>
      )}

      <div className="text-muted mt-4 text-center text-[13px] font-semibold">
        {mode === 'login' ? (
          <>
            {t('auth.noAccount')}{' '}
            <button type="button" onClick={() => switchMode('register')} className="text-accent font-extrabold">
              {t('auth.createAccount')}
            </button>
          </>
        ) : (
          <>
            {mode === 'forgot' ? '' : `${t('auth.alreadyMember')} `}
            <button type="button" onClick={() => switchMode('login')} className="text-accent font-extrabold">
              {mode === 'forgot' ? t('auth.backToLogin') : t('auth.login')}
            </button>
          </>
        )}
      </div>

      <a
        href="https://github.com/gulian/rewatch"
        target="_blank"
        rel="noreferrer"
        className="text-dim mt-8 text-center text-[11.5px] font-semibold"
      >
        Open source · GitHub
      </a>
    </div>
  )
}
