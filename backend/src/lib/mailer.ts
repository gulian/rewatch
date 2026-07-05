// Transactional emails: plain SMTP configured via env,
// disabled when SMTP_HOST is empty (links are logged instead; handy in dev).
import nodemailer from 'nodemailer'
import { getSetting } from './settings.js'

export type Lang = 'fr' | 'en'

const from = () => getSetting('MAIL_FROM') ?? 'Rewatch <no-reply@rewatch.local>'

function transport() {
  const host = getSetting('SMTP_HOST')
  if (!host) return null
  return nodemailer.createTransport({
    host,
    port: Number(getSetting('SMTP_PORT') ?? 587),
    secure: getSetting('SMTP_SECURE') === 'true',
    auth: getSetting('SMTP_USER')
      ? { user: getSetting('SMTP_USER'), pass: getSetting('SMTP_PASS') }
      : undefined,
  })
}

async function send(to: string, subject: string, text: string) {
  const t = transport()
  if (!t) {
    console.log(`[mailer disabled] To: ${to} | ${subject}\n${text}`)
    return
  }
  await t.sendMail({ from: from(), to, subject, text })
}

const appUrl = () => (getSetting('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

const T = {
  verify: {
    fr: (username: string, link: string) => ({
      subject: 'Rewatch — vérifiez votre adresse email',
      text: `Salut ${username},

Bienvenue sur Rewatch ! Clique sur ce lien pour vérifier ton adresse email :

${link}

Le lien est valable 7 jours. Si tu n'es pas à l'origine de cette inscription, ignore ce message.`,
    }),
    en: (username: string, link: string) => ({
      subject: 'Rewatch — verify your email address',
      text: `Hi ${username},

Welcome to Rewatch! Click this link to verify your email address:

${link}

The link is valid for 7 days. If you didn't sign up, just ignore this message.`,
    }),
  },
  verifyReminder: {
    fr: (username: string, link: string) => ({
      subject: 'Rewatch — dernière chance de vérifier votre email',
      text: `Salut ${username},

Petit rappel : ton adresse email n'est toujours pas vérifiée, et ton compte Rewatch sera bloqué demain si tu ne le fais pas (il sera débloqué dès la vérification, rien n'est perdu).

Clique ici pour vérifier :

${link}`,
    }),
    en: (username: string, link: string) => ({
      subject: 'Rewatch — last chance to verify your email',
      text: `Hi ${username},

Quick reminder: your email address is still unverified, and your Rewatch account will be locked tomorrow unless you verify it (it unlocks as soon as you do — nothing is lost).

Click here to verify:

${link}`,
    }),
  },
  reset: {
    fr: (username: string, link: string) => ({
      subject: 'Rewatch — réinitialisation du mot de passe',
      text: `Salut ${username},

Quelqu'un (toi, normalement) a demandé à réinitialiser ton mot de passe Rewatch. Clique ici :

${link}

Le lien est valable 1 heure et ne peut servir qu'une fois. Si tu n'as rien demandé, ignore ce message — ton mot de passe reste inchangé.`,
    }),
    en: (username: string, link: string) => ({
      subject: 'Rewatch — password reset',
      text: `Hi ${username},

Someone (hopefully you) asked to reset your Rewatch password. Click here:

${link}

The link is valid for 1 hour and can only be used once. If you didn't ask for this, ignore this message — your password stays unchanged.`,
    }),
  },
}

export const sendVerificationEmail = (to: string, username: string, token: string, lang: Lang = 'en') => {
  const { subject, text } = T.verify[lang](username, `${appUrl()}/verify?token=${token}`)
  return send(to, subject, text)
}

export const sendVerifyReminderEmail = (to: string, username: string, token: string, lang: Lang = 'en') => {
  const { subject, text } = T.verifyReminder[lang](username, `${appUrl()}/verify?token=${token}`)
  return send(to, subject, text)
}

export const sendResetEmail = (to: string, username: string, token: string, lang: Lang = 'en') => {
  const { subject, text } = T.reset[lang](username, `${appUrl()}/reset?token=${token}`)
  return send(to, subject, text)
}

export const sendTestEmail = (to: string) =>
  send(to, 'Rewatch — test email', 'SMTP is configured correctly. This is a test message from your Rewatch instance.')
