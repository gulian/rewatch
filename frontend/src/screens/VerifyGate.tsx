// Gate shown when the account is blocked (email unverified after 7 days).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import type { User } from '../api/types'

export default function VerifyGate({ me }: { me: User }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState(me.email ?? '')
  const [editing, setEditing] = useState(!me.email)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const resend = async () => {
    setError(null)
    try {
      await api.post('/api/auth/resend-verification')
      setSent(true)
    } catch {
      setError(t('gate.tooMany'))
    }
  }

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.patch('/api/auth/email', { email })
      await qc.invalidateQueries({ queryKey: ['me'] })
      setEditing(false)
      setSent(true)
    } catch {
      setError(t('gate.invalidEmail'))
    }
  }

  const logout = async () => {
    await api.post('/api/auth/logout')
    qc.clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-8 pb-10">
      <div className="bg-warn/15 text-warn mb-5 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold">
        !
      </div>
      <div className="text-[21px] leading-snug font-extrabold">{t('gate.title')}</div>
      <div className="text-muted mt-2.5 text-sm leading-relaxed">{t('gate.text')}</div>

      {editing ? (
        <form onSubmit={changeEmail} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            placeholder={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-card placeholder:text-dim focus:border-accent rounded-[14px] border border-white/8 px-4 py-3.75 text-[14.5px] font-semibold outline-none"
            autoComplete="email"
          />
          <button type="submit" className="bg-accent text-ink rounded-[14px] py-3.75 text-[15px] font-extrabold">
            {t('gate.saveAndSend')}
          </button>
        </form>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          <div className="bg-card text-muted rounded-[14px] border border-white/8 px-4 py-3.75 text-[14.5px] font-semibold">
            {me.email}
          </div>
          <button
            type="button"
            onClick={resend}
            disabled={sent}
            className="bg-accent text-ink rounded-[14px] py-3.75 text-[15px] font-extrabold disabled:opacity-60"
          >
            {sent ? t('gate.sent') : t('gate.resend')}
          </button>
          <button type="button" onClick={() => setEditing(true)} className="text-muted py-1 text-[13px] font-bold">
            {t('gate.wrongAddress')}
          </button>
        </div>
      )}

      {error && <div className="text-danger mt-3 text-[13px] font-semibold">{error}</div>}

      <button type="button" onClick={logout} className="text-dim mt-8 text-center text-[13px] font-bold">
        {t('gate.logout')}
      </button>
    </div>
  )
}
