import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const GDPR_URL = 'https://gdpr.tvtime.com/gdpr/self-service'

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
        <img
          src={image}
          alt=""
          loading="lazy"
          className="mx-auto mt-3 w-full max-w-90 rounded-[14px] border border-line"
        />
      )}
    </div>
  )
}

export default function TvTimeHelp() {
  const { t } = useTranslation()
  const navigate = useNavigate()

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
        <h1 className="flex-1 text-[22px] font-extrabold tracking-tight">{t('tvhelp.title')}</h1>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3.5 pb-6">
        <div className="text-muted px-1 text-[13px] leading-normal">{t('tvhelp.intro')}</div>

        <div className="border-warn/40 bg-warn/10 rounded-[14px] border p-3.5">
          <div className="text-warn text-[13px] font-extrabold">{t('tvhelp.deadlineTitle')}</div>
          <div className="text-muted mt-1 text-[12.5px] leading-normal">{t('tvhelp.deadlineText')}</div>
        </div>

        <Step
          n={1}
          title={t('tvhelp.step1Title')}
          text={
            <>
              {t('tvhelp.step1Text')}{' '}
              <a href={GDPR_URL} target="_blank" rel="noopener noreferrer" className="text-accent font-bold break-all">
                gdpr.tvtime.com/gdpr/self-service
              </a>
            </>
          }
        />
        <Step
          n={2}
          title={t('tvhelp.step2Title')}
          text={
            <>
              {t('tvhelp.step2Text')}
              <span className="bg-track mt-2 block rounded-[10px] p-2.5 text-[12.5px]">
                <b>{t('tvhelp.step2TipLabel')}</b> {t('tvhelp.step2Tip')}
              </span>
            </>
          }
          image="/help/tvtime-1-login.png"
        />
        <Step n={3} title={t('tvhelp.step3Title')} text={t('tvhelp.step3Text')} image="/help/tvtime-2-generate.png" />
        <Step n={4} title={t('tvhelp.step4Title')} text={t('tvhelp.step4Text')} image="/help/tvtime-4-download.png" />
        <Step n={5} title={t('tvhelp.step5Title')} text={t('tvhelp.step5Text')} />

        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="bg-accent text-ink mt-2 rounded-2xl px-7 py-3.5 text-[15px] font-extrabold shadow-[0_8px_24px_rgba(255,201,75,.25)]"
        >
          {t('tvhelp.cta')}
        </button>
      </div>
    </div>
  )
}
