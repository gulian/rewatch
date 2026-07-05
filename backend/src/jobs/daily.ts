// Daily job — run by a systemd timer in prod (`node dist/jobs/daily.js`),
// manually in dev. Idempotent: safe to re-run without double sends.
import 'dotenv/config'
import { prisma } from '../lib/prisma.js'
import { loadSettings } from '../lib/settings.js'
import { createAuthToken } from '../lib/auth-tokens.js'
import { sendVerifyReminderEmail, type Lang } from '../lib/mailer.js'
import { REMINDER_BEFORE_MS, VERIFY_GRACE_MS } from '../lib/verification.js'

await loadSettings()

// Verification reminder at D-1 before lockout: unverified accounts whose
// deadline (createdAt + 7d) falls within the next 24h, never reminded before.
async function sendVerifyReminders() {
  const now = Date.now()
  const users = await prisma.user.findMany({
    where: {
      emailVerifiedAt: null,
      email: { not: null },
      verifyReminderSentAt: null,
      createdAt: {
        lte: new Date(now - (VERIFY_GRACE_MS - REMINDER_BEFORE_MS)), // deadline ≤ 24h away
        gte: new Date(now - VERIFY_GRACE_MS), // not locked yet
      },
    },
  })
  for (const user of users) {
    const token = await createAuthToken(user.id, 'VERIFY_EMAIL')
    await sendVerifyReminderEmail(user.email!, user.username, token, user.language as Lang)
    await prisma.user.update({ where: { id: user.id }, data: { verifyReminderSentAt: new Date() } })
    console.log(`verification reminder sent → ${user.username}`)
  }
  return users.length
}

// Housekeeping: drop expired auth tokens.
async function purgeExpiredTokens() {
  const { count } = await prisma.authToken.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  return count
}

const PUSH_T = {
  fr: {
    one: 'Nouvel épisode disponible',
    many: (n: number) => `${n} épisodes sortent aujourd’hui`,
    more: (n: number) => `… et ${n} autres`,
  },
  en: {
    one: 'New episode available',
    many: (n: number) => `${n} episodes air today`,
    more: (n: number) => `… and ${n} more`,
  },
}

// "New episode" push: today's releases for followed (WATCHING) shows,
// grouped into one notification per subscribed user.
async function sendNewEpisodePushes() {
  const { sendPushToUser } = await import('../lib/push.js')
  const today = new Date(new Date().toDateString())
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)

  const episodes = await prisma.episode.findMany({
    where: { airDate: { gte: today, lt: tomorrow }, season: { gt: 0 } },
    include: {
      show: {
        select: {
          name: true,
          follows: {
            where: { state: 'WATCHING', user: { pushSubscriptions: { some: {} } } },
            select: { userId: true },
          },
        },
      },
    },
  })

  const byUser = new Map<number, string[]>()
  for (const ep of episodes) {
    const label = `${ep.show.name} S${String(ep.season).padStart(2, '0')}E${String(ep.number).padStart(2, '0')}`
    for (const f of ep.show.follows) {
      byUser.set(f.userId, [...(byUser.get(f.userId) ?? []), label])
    }
  }

  const langs = new Map(
    (await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, language: true } })).map(
      (u) => [u.id, (u.language === 'fr' ? 'fr' : 'en') as Lang],
    ),
  )

  let sent = 0
  for (const [userId, labels] of byUser) {
    const t = PUSH_T[langs.get(userId) ?? 'en']
    const title = labels.length === 1 ? t.one : t.many(labels.length)
    const body = labels.slice(0, 4).join('\n') + (labels.length > 4 ? `\n${t.more(labels.length - 4)}` : '')
    sent += await sendPushToUser(userId, { title, body, url: '/calendar' })
  }
  return { users: byUser.size, sent }
}

const reminders = await sendVerifyReminders()
const purged = await purgeExpiredTokens()
const pushes = await sendNewEpisodePushes().catch((err) => {
  console.error('new-episode push failed:', (err as Error).message)
  return { users: 0, sent: 0 }
})
console.log(`daily: ${reminders} reminder(s), ${purged} expired token(s) purged, release push → ${pushes.sent} delivery(ies) / ${pushes.users} user(s)`)
await prisma.$disconnect()
