import { createHash, randomBytes } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from './prisma.js'

export const SESSION_COOKIE = 'rewatch_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// Only the token hash is stored in the DB: leaking the table
// doesn't let anyone replay sessions.
function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(reply: FastifyReply, userId: number) {
  const token = randomBytes(32).toString('hex')
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export async function destroySession(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[SESSION_COOKIE]
  if (token) {
    await prisma.session.deleteMany({ where: { id: hashToken(token) } })
  }
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

export async function getSessionUser(request: FastifyRequest) {
  const token = request.cookies[SESSION_COOKIE]
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: {
      user: { select: { id: true, username: true, email: true, emailVerifiedAt: true, language: true, isAdmin: true, createdAt: true } },
    },
  })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  // Throttled activity touch — powers the "online now" admin metric.
  if (!session.lastUsedAt || Date.now() - session.lastUsedAt.getTime() > 60_000) {
    prisma.session
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {})
  }
  return session.user
}
