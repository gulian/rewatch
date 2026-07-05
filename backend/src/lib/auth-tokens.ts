import { createHash, randomBytes } from 'node:crypto'
import { prisma } from './prisma.js'
import type { AuthTokenKind } from '../generated/prisma/client.js'

const TTL: Record<AuthTokenKind, number> = {
  VERIFY_EMAIL: 7 * 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
}

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex')

/** Creates a token (only one active per user+kind) and returns its raw form to email out. */
export async function createAuthToken(userId: number, kind: AuthTokenKind): Promise<string> {
  const raw = randomBytes(32).toString('hex')
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, kind } }),
    prisma.authToken.create({
      data: { id: hash(raw), userId, kind, expiresAt: new Date(Date.now() + TTL[kind]) },
    }),
  ])
  return raw
}

/** Consumes a token (single use) — returns the userId or null. */
export async function consumeAuthToken(raw: string, kind: AuthTokenKind): Promise<number | null> {
  const token = await prisma.authToken.findUnique({ where: { id: hash(raw) } })
  if (!token || token.kind !== kind) return null
  await prisma.authToken.delete({ where: { id: token.id } })
  if (token.expiresAt < new Date()) return null
  return token.userId
}
