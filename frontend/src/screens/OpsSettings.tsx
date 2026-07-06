// Instance settings: shared field primitives, the console panel, and the
// first-run setup wizard. Everything lives in the ops visual world.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../api/client'
import { useAdminSettings, useMe, useSetupStatus } from '../api/hooks'
import type { AdminSetting } from '../api/types'

const field =
  'w-full border border-[var(--ops-line)] bg-transparent px-3 py-2 text-[13px] text-[var(--ops-text)] outline-none placeholder:text-[var(--ops-dim)] focus:border-[var(--ops-muted)]'
const btn =
  'border border-[var(--ops-line)] px-3 py-2 text-[11px] tracking-[0.08em] uppercase text-[var(--ops-muted)] hover:text-[var(--ops-text)] hover:border-[var(--ops-muted)] transition-colors disabled:opacity-40'
const btnPrimary =
  'border border-[var(--ops-accent)] px-4 py-2 text-[11px] tracking-[0.08em] uppercase text-[var(--ops-accent)] hover:bg-[var(--ops-accent)] hover:text-black transition-colors disabled:opacity-40'

function Label({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
      <span className="text-[10px] tracking-[0.12em] text-[var(--ops-dim)] uppercase">{text}</span>
      {hint && <span className="min-w-0 text-[10px] text-[var(--ops-dim)]">{hint}</span>}
    </div>
  )
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`px-3 py-2 text-[11px] tracking-[0.08em] uppercase border transition-colors disabled:opacity-40 ${
        on
          ? 'border-[var(--ops-accent)] text-[var(--ops-accent)]'
          : 'border-[var(--ops-line)] text-[var(--ops-dim)]'
      }`}
    >
      {on ? 'on' : 'off'}
    </button>
  )
}

type Draft = Record<string, string>

function useSettingsForm() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: settings } = useAdminSettings()
  const [draft, setDraft] = useState<Draft>({})
  const [status, setStatus] = useState<string | null>(null)

  const get = (key: string): AdminSetting | undefined => settings?.find((s) => s.key === key)
  const shown = (key: string): string => draft[key] ?? get(key)?.value ?? ''
  const edit = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }))

  const save = async (keys?: string[]) => {
    const payload = Object.fromEntries(
      Object.entries(draft).filter(([k, v]) => (keys ? keys.includes(k) : true) && v !== ''),
    )
    if (Object.keys(payload).length === 0) return true
    setStatus(null)
    try {
      await api.put('/api/admin/settings', payload)
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !(k in payload))))
      await qc.invalidateQueries({ queryKey: ['admin-settings'] })
      await qc.invalidateQueries({ queryKey: ['setup-status'] })
      setStatus(t('ops.saved'))
      return true
    } catch (err) {
      setStatus(err instanceof ApiError ? `${t('ops.testFail')}: ${err.code}` : t('common.networkError'))
      return false
    }
  }

  return { settings, get, shown, edit, save, draft, status, setStatus }
}

// ——— Field groups (shared between panel and wizard) ———

function TmdbFields({ form }: { form: ReturnType<typeof useSettingsForm> }) {
  const { t } = useTranslation()
  const [test, setTest] = useState<string | null>(null)
  const meta = form.get('TMDB_API_TOKEN')

  const runTest = async () => {
    setTest('…')
    try {
      const { ok } = await api.post<{ ok: boolean }>('/api/admin/settings/test-tmdb', {
        token: form.draft.TMDB_API_TOKEN || undefined,
      })
      setTest(ok ? t('ops.testOk') : t('ops.testFail'))
    } catch {
      setTest(t('ops.testFail'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label
          text={t('ops.tmdbKey')}
          hint={meta?.envLocked ? t('ops.envLocked') : meta?.set ? t('ops.secretSet') : undefined}
        />
        <div className="flex gap-2">
          <input
            className={field}
            type="password"
            autoComplete="off"
            disabled={meta?.envLocked}
            placeholder={meta?.set ? '••••••••' : t('ops.tmdbKeyHint')}
            value={form.draft.TMDB_API_TOKEN ?? ''}
            onChange={(e) => form.edit('TMDB_API_TOKEN', e.target.value)}
          />
          <button type="button" className={btn} onClick={runTest}>
            {test ?? t('ops.test')}
          </button>
        </div>
      </div>
      <div>
        <Label text={t('ops.tmdbLanguage')} hint={form.get('TMDB_LANGUAGE')?.envLocked ? t('ops.envLocked') : undefined} />
        <select
          className={field}
          disabled={form.get('TMDB_LANGUAGE')?.envLocked}
          value={form.shown('TMDB_LANGUAGE') || 'en-US'}
          onChange={(e) => form.edit('TMDB_LANGUAGE', e.target.value)}
        >
          <option value="en-US">en-US</option>
          <option value="fr-FR">fr-FR</option>
        </select>
      </div>
    </div>
  )
}

function InstanceFields({ form, withLegal }: { form: ReturnType<typeof useSettingsForm>; withLegal?: boolean }) {
  const { t } = useTranslation()
  const reg = (form.shown('REGISTRATION_ENABLED') || 'true') !== 'false'
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label text={t('ops.appUrl')} hint={form.get('APP_URL')?.envLocked ? t('ops.envLocked') : undefined} />
        <input
          className={field}
          disabled={form.get('APP_URL')?.envLocked}
          placeholder={window.location.origin}
          value={form.shown('APP_URL')}
          onChange={(e) => form.edit('APP_URL', e.target.value)}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label text={t('ops.registration')} hint={form.get('REGISTRATION_ENABLED')?.envLocked ? t('ops.envLocked') : undefined} />
        <Toggle
          on={reg}
          disabled={form.get('REGISTRATION_ENABLED')?.envLocked}
          onChange={(v) => form.edit('REGISTRATION_ENABLED', String(v))}
        />
      </div>
      {withLegal && (
      <>
      <div>
        <Label text={t('ops.legalHost')} hint={t('ops.legalHostHint')} />
        <input
          className={field}
          disabled={form.get('LEGAL_HOST')?.envLocked}
          placeholder="OVH SAS, 2 rue Kellermann, 59100 Roubaix, France"
          value={form.shown('LEGAL_HOST')}
          onChange={(e) => form.edit('LEGAL_HOST', e.target.value)}
        />
      </div>
      <div>
        <Label text={t('ops.legalContact')} hint={t('ops.legalContactHint')} />
        <input
          className={field}
          disabled={form.get('LEGAL_CONTACT')?.envLocked}
          placeholder="operator@example.org"
          value={form.shown('LEGAL_CONTACT')}
          onChange={(e) => form.edit('LEGAL_CONTACT', e.target.value)}
        />
      </div>
      </>
      )}
    </div>
  )
}

function EmailFields({ form }: { form: ReturnType<typeof useSettingsForm> }) {
  const { t } = useTranslation()
  const { data: me } = useMe()
  const [to, setTo] = useState('')
  const [test, setTest] = useState<string | null>(null)

  const runTest = async () => {
    setTest('…')
    try {
      await api.post('/api/admin/settings/test-email', { to: to || me?.email })
      setTest(t('ops.testOk'))
    } catch {
      setTest(t('ops.testFail'))
    }
  }

  const text = (key: string, label: string, opts: { secret?: boolean; placeholder?: string } = {}) => {
    const meta = form.get(key)
    return (
      <div>
        <Label
          text={label}
          hint={meta?.envLocked ? t('ops.envLocked') : opts.secret && meta?.set ? t('ops.secretSet') : undefined}
        />
        <input
          className={field}
          type={opts.secret ? 'password' : 'text'}
          autoComplete="off"
          disabled={meta?.envLocked}
          placeholder={opts.secret && meta?.set ? '••••••••' : (opts.placeholder ?? '')}
          value={opts.secret ? (form.draft[key] ?? '') : form.shown(key)}
          onChange={(e) => form.edit(key, e.target.value)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        {text('SMTP_HOST', t('ops.smtpHost'), { placeholder: 'smtp.example.com' })}
        {text('SMTP_PORT', t('ops.smtpPort'), { placeholder: '587' })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {text('SMTP_USER', t('ops.smtpUser'))}
        {text('SMTP_PASS', t('ops.smtpPass'), { secret: true })}
      </div>
      {text('MAIL_FROM', t('ops.mailFrom'), { placeholder: 'Rewatch <no-reply@your.domain>' })}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label text={t('ops.testEmailTo')} />
          <input className={field} placeholder={me?.email ?? ''} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className={btn} onClick={runTest}>
          {test ?? t('ops.sendTest')}
        </button>
      </div>
    </div>
  )
}

function PushFields({ form }: { form: ReturnType<typeof useSettingsForm> }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [state, setState] = useState<string | null>(null)
  const configured = form.get('VAPID_PUBLIC_KEY')?.set && form.get('VAPID_PRIVATE_KEY')?.set

  const generate = async () => {
    setState('…')
    try {
      await api.post('/api/admin/settings/generate-vapid')
      await qc.invalidateQueries({ queryKey: ['admin-settings'] })
      setState(t('ops.testOk'))
    } catch (err) {
      setState(err instanceof ApiError ? err.code : t('ops.testFail'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <Label text={t('ops.vapidStatus')} />
        <span className={`text-[11px] ${configured ? 'text-[var(--ops-accent)]' : 'text-[var(--ops-warn)]'}`}>
          {configured ? t('ops.vapidSet') : t('ops.vapidUnset')}
        </span>
      </div>
      {!configured && (
        <button type="button" className={btnPrimary} onClick={generate}>
          {state ?? t('ops.generateVapid')}
        </button>
      )}
      <div>
        <Label text={t('ops.vapidSubject')} hint={form.get('VAPID_SUBJECT')?.envLocked ? t('ops.envLocked') : undefined} />
        <input
          className={field}
          placeholder="mailto:you@your.domain"
          disabled={form.get('VAPID_SUBJECT')?.envLocked}
          value={form.shown('VAPID_SUBJECT')}
          onChange={(e) => form.edit('VAPID_SUBJECT', e.target.value)}
        />
      </div>
    </div>
  )
}

// ——— Console panel ———

export function SettingsPanel() {
  const { t } = useTranslation()
  const form = useSettingsForm()
  if (!form.settings) return null

  const groups: [string, React.ReactNode][] = [
    [t('ops.groupMetadata'), <TmdbFields key="t" form={form} />],
    [t('ops.groupInstance'), <InstanceFields key="i" form={form} withLegal />],
    [t('ops.groupEmail'), <EmailFields key="e" form={form} />],
    [t('ops.groupPush'), <PushFields key="p" form={form} />],
  ]

  return (
    <section className="border-t border-[var(--ops-line)]">
      <div className="flex items-baseline justify-between px-4 pt-3 pb-2 lg:px-6">
        <h2 className="text-[11px] font-medium tracking-[0.14em] text-[var(--ops-muted)] uppercase">{t('ops.settings')}</h2>
        {form.status && <span className="text-[11px] text-[var(--ops-accent)]">{form.status}</span>}
      </div>
      <div className="grid gap-6 px-4 pb-4 lg:grid-cols-2 lg:px-6">
        {groups.map(([title, node]) => (
          <div key={title} className="border border-[var(--ops-line)] p-4">
            <div className="mb-3 text-[11px] tracking-[0.14em] text-[var(--ops-muted)] uppercase">{title}</div>
            {node}
          </div>
        ))}
      </div>
      <div className="px-4 pb-5 lg:px-6">
        <button type="button" className={btnPrimary} onClick={() => form.save()}>
          {t('ops.save')}
        </button>
      </div>
    </section>
  )
}

// ——— First-run wizard ———

export function Setup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: me } = useMe()
  const { data: setup } = useSetupStatus()
  const form = useSettingsForm()
  const [step, setStep] = useState(0)

  if (me && !me.isAdmin) {
    navigate('/', { replace: true })
    return null
  }

  const steps: { title: string; text: string; body?: React.ReactNode; canSkip: boolean; keys: string[] }[] = [
    { title: t('ops.wizWelcomeTitle'), text: t('ops.wizWelcomeText'), canSkip: false, keys: [] },
    { title: t('ops.groupMetadata'), text: t('ops.wizStepTmdb'), body: <TmdbFields form={form} />, canSkip: false, keys: ['TMDB_API_TOKEN', 'TMDB_LANGUAGE'] },
    { title: t('ops.groupInstance'), text: t('ops.wizStepInstance'), body: <InstanceFields form={form} />, canSkip: false, keys: ['APP_URL', 'REGISTRATION_ENABLED'] },
    { title: t('ops.groupEmail'), text: t('ops.wizStepEmail'), body: <EmailFields form={form} />, canSkip: true, keys: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'] },
    { title: t('ops.groupPush'), text: t('ops.wizStepPush'), body: <PushFields form={form} />, canSkip: true, keys: ['VAPID_SUBJECT'] },
    { title: t('ops.wizDone'), text: '', canSkip: false, keys: [] },
  ]
  const current = steps[step]
  const last = step === steps.length - 1

  const next = async () => {
    if (current.keys.length > 0 && !(await form.save(current.keys))) return
    setStep((s) => s + 1)
  }

  return (
    <div className="ops flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-[var(--ops-line)] px-4 py-3 lg:px-6">
        <h1 className="text-[13px] font-bold tracking-[0.18em]">{t('ops.wizTitle').toUpperCase()}</h1>
        <span className="text-[11px] tabular-nums text-[var(--ops-dim)]">
          {Math.min(step + 1, steps.length)}/{steps.length}
        </span>
      </header>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-5 px-5 py-10">
        <h2 className="text-lg font-bold">{current.title}</h2>
        {current.text && <p className="text-[13px] leading-relaxed text-[var(--ops-muted)]">{current.text}</p>}
        {current.body}
        {form.status && <div className="text-[11px] text-[var(--ops-warn)]">{form.status}</div>}
        <div className="flex items-center gap-3 pt-2">
          {!last && (
            <button type="button" className={btnPrimary} onClick={next}>
              {t('ops.wizNext')}
            </button>
          )}
          {current.canSkip && !last && (
            <button type="button" className={btn} onClick={() => setStep((s) => s + 1)}>
              {t('ops.wizSkip')}
            </button>
          )}
          {last && (
            <button type="button" className={btnPrimary} onClick={() => navigate('/', { replace: true })}>
              {t('ops.wizOpenApp')}
            </button>
          )}
        </div>
        {setup && !setup.needsSetup && step === 0 && (
          <button type="button" className={btn} onClick={() => navigate('/admin')}>
            → ops
          </button>
        )}
      </div>
    </div>
  )
}
