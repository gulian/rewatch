import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { canPromptInstall, detectPlatform, isStandalone, onInstallPromptReady, promptInstall } from '../lib/install'

type Platform = 'ios' | 'android' | 'desktop'

function Step({ n, title, text, image }: { n: number; title: string; text: React.ReactNode; image?: string }) {
  return (
    <div className="bg-card rounded-[18px] border border-line p-4">
      <div className="flex items-center gap-2.5">
        <span className="bg-accent text-ink flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12.5px] font-extrabold">
          {n}
        </span>
        <span className="text-[14.5px] font-extrabold">{title}</span>
      </div>
      <div className="text-muted mt-1.5 text-[13px] leading-normal">{text}</div>
      {image && (
        <img src={image} alt="" loading="lazy" className="mx-auto mt-3 w-full max-w-90 rounded-[14px] border border-line" />
      )}
    </div>
  )
}

export default function Install() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [platform, setPlatform] = useState<Platform>(detectPlatform())
  const [, setPromptReady] = useState(canPromptInstall())
  const [installed, setInstalled] = useState(false)
  const lang = i18n.language === 'fr' ? 'fr' : 'en'

  useEffect(() => onInstallPromptReady(() => setPromptReady(true)), [])

  const nativeInstall = async () => {
    if (await promptInstall()) setInstalled(true)
  }

  const tabs: [Platform, string][] = [
    ['ios', 'iPhone / iPad'],
    ['android', 'Android'],
    ['desktop', t('install.desktop')],
  ]

  const pushStep = (n: number) => (
    <Step n={n} title={t('install.stepPushTitle')} text={t('install.stepPushText')} />
  )

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
        <h1 className="flex-1 text-[22px] font-extrabold tracking-tight">{t('install.title')}</h1>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3.5 pb-8">
        <div className="text-muted px-1 text-[13px] leading-normal">{t('install.intro')}</div>

        {isStandalone() ? (
          <div className="bg-card flex items-center gap-3 rounded-[18px] border border-line p-4">
            <span className="bg-green/18 text-green flex h-9 w-9 flex-none items-center justify-center rounded-full text-[15px] font-extrabold">
              ✓
            </span>
            <div className="text-[13.5px] font-bold">{t('install.alreadyInstalled')}</div>
          </div>
        ) : (
          <>
            <div className="bg-card flex gap-1 rounded-[14px] border border-line p-1">
              {tabs.map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`flex-1 rounded-[10px] py-2 text-[12.5px] font-extrabold ${
                    platform === p ? 'bg-accent text-ink' : 'text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {platform === 'ios' && (
              <>
                <Step
                  n={1}
                  title={t('install.iosStep1Title', { host: window.location.host })}
                  text={
                    <>
                      {t('install.iosStep1Text', { host: window.location.host })}
                      <span className="bg-track mt-2 block rounded-[10px] p-2.5 text-[12.5px]">
                        <b>{t('install.iosSafariWarnLabel')}</b> {t('install.iosSafariWarn')}
                      </span>
                    </>
                  }
                  image={`/help/install-ios-1-${lang}.png`}
                />
                <Step n={2} title={t('install.iosStep2Title')} text={t('install.iosStep2Text')} image={`/help/install-ios-2-${lang}.png`} />
                <Step n={3} title={t('install.iosStep3Title')} text={t('install.iosStep3Text')} image={`/help/install-ios-3-${lang}.png`} />
                {pushStep(4)}
                <div className="text-dim px-1 text-[11.5px] leading-normal">{t('install.iosPushNote')}</div>
              </>
            )}

            {platform === 'android' && (
              <>
                {canPromptInstall() && !installed && (
                  <button
                    type="button"
                    onClick={nativeInstall}
                    className="bg-accent text-ink rounded-2xl px-7 py-3.5 text-[15px] font-extrabold shadow-[0_8px_24px_rgba(255,201,75,.25)]"
                  >
                    {t('install.nativeButton')}
                  </button>
                )}
                {installed && (
                  <div className="text-green px-1 text-[13px] font-bold">{t('install.nativeDone')}</div>
                )}
                <Step n={1} title={t('install.androidStep1Title')} text={t('install.androidStep1Text', { host: window.location.host })} image={`/help/install-android-${lang}.png`} />
                <Step n={2} title={t('install.androidStep2Title')} text={t('install.androidStep2Text')} />
                {pushStep(3)}
              </>
            )}

            {platform === 'desktop' && (
              <>
                {canPromptInstall() && !installed && (
                  <button
                    type="button"
                    onClick={nativeInstall}
                    className="bg-accent text-ink rounded-2xl px-7 py-3.5 text-[15px] font-extrabold shadow-[0_8px_24px_rgba(255,201,75,.25)]"
                  >
                    {t('install.nativeButton')}
                  </button>
                )}
                {installed && (
                  <div className="text-green px-1 text-[13px] font-bold">{t('install.nativeDone')}</div>
                )}
                <Step n={1} title={t('install.desktopStep1Title')} text={t('install.desktopStep1Text')} />
                {pushStep(2)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
