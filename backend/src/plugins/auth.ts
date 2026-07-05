import fp from 'fastify-plugin'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { getSessionUser } from '../lib/session.js'
import { isBlocked } from '../lib/verification.js'

export type AuthUser = {
  id: number
  username: string
  email: string | null
  emailVerifiedAt: Date | null
  language: string
  isAdmin: boolean
  createdAt: Date
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAuthAllowBlocked: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export default fp(async (app) => {
  app.decorateRequest('user', null)

  // Variant without the verification gate: reserved for the routes that let
  // a blocked user unblock themselves (me, resend, email change) and for logout.
  app.decorate('requireAuthAllowBlocked', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await getSessionUser(request)
    if (!user) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
    request.user = user
  })

  // Admin-only routes. 404 (not 403) so the admin surface stays invisible.
  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await getSessionUser(request)
    if (!user || !user.isAdmin) {
      return reply.code(404).send({ error: 'not_found' })
    }
    request.user = user
  })

  // `requireAuth` is used as a preHandler on every protected route.
  // Unverified account past the grace period → 403, the frontend shows the gate.
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await getSessionUser(request)
    if (!user) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
    if (isBlocked(user)) {
      return reply.code(403).send({ error: 'email_verification_required' })
    }
    request.user = user
  })
})
