import type { FastifyInstance } from 'fastify'
import argon2 from 'argon2'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { createSession, destroySession } from '../lib/session.js'
import { createAuthToken, consumeAuthToken } from '../lib/auth-tokens.js'
import { sendResetEmail, sendVerificationEmail, type Lang } from '../lib/mailer.js'
import { isBlocked, verifyDeadline } from '../lib/verification.js'
import { getSetting } from '../lib/settings.js'

const usernameSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_.-]+$/, 'letters, digits, _ . - only')
const passwordSchema = z.string().min(8).max(128)
const emailSchema = z.email().max(254).transform((e) => e.toLowerCase())
const languageSchema = z.enum(['fr', 'en'])

// Strict limit on bruteforce/mail-spam sensitive routes (per IP).
const strictRateLimit = {
  rateLimit: { max: 5, timeWindow: '1 minute' },
}

type UserRow = {
  id: number
  username: string
  email: string | null
  emailVerifiedAt: Date | null
  language: string
  isAdmin: boolean
  createdAt: Date
}

const publicUser = (u: UserRow) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  emailVerified: u.emailVerifiedAt !== null,
  language: u.language,
  isAdmin: u.isAdmin,
  // The frontend shows the gate when blocked, and the deadline before that.
  blocked: isBlocked(u),
  verifyDeadline: verifyDeadline(u),
  createdAt: u.createdAt,
})

export default async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', { config: strictRateLimit }, async (request, reply) => {
    // Instance operators can close self-service signups.
    if (getSetting('REGISTRATION_ENABLED') === 'false') {
      return reply.code(403).send({ error: 'registration_closed' })
    }
    const parsed = z
      .object({
        username: usernameSchema,
        password: passwordSchema,
        email: emailSchema,
        language: languageSchema.default('en'),
      })
      .safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_input', details: z.flattenError(parsed.error).fieldErrors })
    }
    const { username, password, email, language } = parsed.data

    if (await prisma.user.findUnique({ where: { username } })) {
      return reply.code(409).send({ error: 'username_taken' })
    }
    if (await prisma.user.findUnique({ where: { email } })) {
      return reply.code(409).send({ error: 'email_taken' })
    }

    // The very first account on a fresh instance is the operator.
    const isFirstAccount = (await prisma.user.count()) === 0
    const user = await prisma.user.create({
      data: { username, email, language, isAdmin: isFirstAccount, passwordHash: await argon2.hash(password) },
    })
    const token = await createAuthToken(user.id, 'VERIFY_EMAIL')
    sendVerificationEmail(email, username, token, language).catch((err) =>
      app.log.error(err, 'verification email failed'),
    )

    await createSession(reply, user.id)
    return reply.code(201).send(publicUser(user))
  })

  app.post('/api/auth/login', { config: strictRateLimit }, async (request, reply) => {
    const parsed = z.object({ username: usernameSchema, password: passwordSchema }).safeParse(request.body)
    if (!parsed.success) {
      // Generic message: never reveal whether the account exists.
      return reply.code(401).send({ error: 'invalid_credentials' })
    }
    const { username, password } = parsed.data

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      return reply.code(401).send({ error: 'invalid_credentials' })
    }

    await createSession(reply, user.id)
    return publicUser(user)
  })

  app.post('/api/auth/logout', async (request, reply) => {
    await destroySession(request, reply)
    return { ok: true }
  })

  app.get('/api/auth/me', { preHandler: app.requireAuthAllowBlocked }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } })
    return publicUser(user)
  })

  // Persist the UI language on the account.
  app.patch('/api/auth/language', { preHandler: app.requireAuthAllowBlocked }, async (request, reply) => {
    const body = z.object({ language: languageSchema }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_input' })
    const user = await prisma.user.update({
      where: { id: request.user!.id },
      data: { language: body.data.language },
    })
    return publicUser(user)
  })

  // ——— Email verification ———

  app.post('/api/auth/verify', async (request, reply) => {
    const body = z.object({ token: z.string().min(1) }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_input' })

    const userId = await consumeAuthToken(body.data.token, 'VERIFY_EMAIL')
    if (!userId) return reply.code(400).send({ error: 'invalid_or_expired_token' })

    await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } })
    return { ok: true }
  })

  app.post(
    '/api/auth/resend-verification',
    { preHandler: app.requireAuthAllowBlocked, config: strictRateLimit },
    async (request, reply) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } })
      if (!user.email) return reply.code(400).send({ error: 'no_email' })
      if (user.emailVerifiedAt) return { ok: true }
      const token = await createAuthToken(user.id, 'VERIFY_EMAIL')
      await sendVerificationEmail(user.email, user.username, token, user.language as Lang)
      return { ok: true }
    },
  )

  // Set/change the email address (re-triggers verification).
  app.patch('/api/auth/email', { preHandler: app.requireAuthAllowBlocked, config: strictRateLimit }, async (request, reply) => {
    const body = z.object({ email: emailSchema }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_input' })

    const existing = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (existing && existing.id !== request.user!.id) return reply.code(409).send({ error: 'email_taken' })

    const user = await prisma.user.update({
      where: { id: request.user!.id },
      data: { email: body.data.email, emailVerifiedAt: null },
    })
    const token = await createAuthToken(user.id, 'VERIFY_EMAIL')
    await sendVerificationEmail(body.data.email, user.username, token, user.language as Lang)
    return publicUser(user)
  })

  // ——— Forgot password ———

  app.post('/api/auth/forgot', { config: strictRateLimit }, async (request, reply) => {
    const body = z.object({ email: emailSchema }).safeParse(request.body)
    // Always 200: never reveal whether the address is known.
    if (!body.success) return { ok: true }

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    // Verified emails only: otherwise anyone could register someone else's
    // address and capture a reset link for their account.
    if (user?.email && user.emailVerifiedAt) {
      const token = await createAuthToken(user.id, 'RESET_PASSWORD')
      sendResetEmail(user.email, user.username, token, user.language as Lang).catch((err) =>
        app.log.error(err, 'reset email failed'),
      )
    }
    return { ok: true }
  })

  app.post('/api/auth/reset', { config: strictRateLimit }, async (request, reply) => {
    const body = z.object({ token: z.string().min(1), password: passwordSchema }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_input' })

    const userId = await consumeAuthToken(body.data.token, 'RESET_PASSWORD')
    if (!userId) return reply.code(400).send({ error: 'invalid_or_expired_token' })

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(body.data.password) } }),
      // Revoke every session: a password reset logs out all devices.
      prisma.session.deleteMany({ where: { userId } }),
    ])
    return { ok: true }
  })

  app.patch('/api/auth/password', { preHandler: app.requireAuth, config: strictRateLimit }, async (request, reply) => {
    const body = z.object({ current: z.string().min(1), next: passwordSchema }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_input' })

    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } })
    if (!(await argon2.verify(user.passwordHash, body.data.current))) {
      return reply.code(401).send({ error: 'invalid_credentials' })
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(body.data.next) },
    })
    return { ok: true }
  })
}
