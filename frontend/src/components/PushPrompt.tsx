// One-time bottom sheet offering to enable push notifications.
// Browsers require a user gesture for the permission prompt, so "on by
// default" means proactively asking on first app entry.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentSubscription, pushSupported, subscribeToPush } from '../lib/push'

const DISMISSED_KEY = 'rewatch-push-prompt-dismissed'

export default function PushPrompt() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!pushSupported()) return
    if (Notification.permission !== 'default') return // already granted or denied
    if (localStorage.getItem(DISMISSED_KEY)) return
    getCurrentSubscription().then((sub) => {
      if (!sub) setVisible(true)
    })
  }, [])

  if (!visible) return null

  const enable = async () => {
    setBusy(true)
    try {
      await subscribeToPush()
    } catch {
      // Permission denied — the browser remembers, don't nag again.
    } finally {
      localStorage.setItem(DISMISSED_KEY, '1')
      setVisible(false)
    }
  }

  const later = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  return (
    <div className="fixed inset-x-3 bottom-24 z-30 lg:right-auto lg:bottom-6 lg:left-[248px] lg:w-96">
      <div className="bg-surface rounded-[20px] border border-white/12 p-4 shadow-[0_16px_50px_rgba(0,0,0,.6)] backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="bg-accent/15 text-accent flex h-10 w-10 flex-none items-center justify-center rounded-full text-lg">
            🔔
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-extrabold">{t('pushPrompt.title')}</div>
            <div className="text-muted mt-0.5 text-[12.5px] leading-normal">{t('pushPrompt.text')}</div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="bg-accent text-ink flex-1 rounded-[12px] py-2.5 text-[13.5px] font-extrabold disabled:opacity-60"
          >
            {t('pushPrompt.enable')}
          </button>
          <button type="button" onClick={later} className="text-muted flex-none px-3 text-[13px] font-bold">
            {t('pushPrompt.later')}
          </button>
        </div>
      </div>
    </div>
  )
}
