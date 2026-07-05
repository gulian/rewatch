import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLegalInfo } from '../api/hooks'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-[18px] border border-line p-4">
      <div className="text-[14.5px] font-extrabold">{title}</div>
      <div className="text-muted mt-1.5 text-[13px] leading-normal">{children}</div>
    </div>
  )
}

// Public page: reachable logged-out (the login screen links here).
export default function Legal() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: info } = useLegalInfo()

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <div className="flex items-center gap-3 px-5 pt-6 pb-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="bg-card text-text flex h-8 w-8 flex-none items-center justify-center rounded-full"
        >
          ‹
        </button>
        <h1 className="flex-1 text-[22px] font-extrabold tracking-tight">{t('legal.title')}</h1>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3.5 pb-8">
        <div className="text-muted px-1 text-[13px] leading-normal">
          {t('legal.operator')}
          {info?.contact && (
            <>
              {' '}
              {t('legal.contactLabel')} :{' '}
              <a href={`mailto:${info.contact}`} className="text-accent font-bold break-all">
                {info.contact}
              </a>
            </>
          )}
        </div>

        <Section title={t('legal.dataTitle')}>{t('legal.dataText')}</Section>
        <Section title={t('legal.rightsTitle')}>{t('legal.rightsText')}</Section>
        <Section title={t('legal.cookiesTitle')}>{t('legal.cookiesText')}</Section>
        {info?.host && <Section title={t('legal.hostTitle')}>{info.host}</Section>}
        <Section title={t('legal.sourceTitle')}>
          {t('legal.sourceText')}{' '}
          <a
            href="https://github.com/gulian/rewatch"
            target="_blank"
            rel="noreferrer"
            className="text-accent font-bold"
          >
            github.com/gulian/rewatch
          </a>
        </Section>

        <div className="text-dim px-1 pt-1 text-[10.5px] leading-normal">{t('profile.tmdbAttribution')}</div>
      </div>
    </div>
  )
}
