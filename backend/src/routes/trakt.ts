// Per-user Trakt connection + sync jobs.
import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { pollDeviceToken, saveTokens, startDeviceFlow, traktConfigured } from '../lib/trakt.js'
import { runTraktExport, runTraktImport } from '../lib/trakt-sync.js'

// One in-flight device-code poll per user (in-process, like the import jobs).
const pendingFlows = new Map<number, { userCode: string; verificationUrl: string; expiresAt: number }>()

export default async function traktRoutes(app: FastifyInstance) {
  app.get('/api/trakt/status', { preHandler: app.requireAuth }, async (request) => {
    const userId = request.user!.id
    const account = await prisma.traktAccount.findUnique({ where: { userId } })
    const running = await prisma.importJob.findFirst({
      where: { userId, status: 'RUNNING', source: { in: ['TRAKT', 'TRAKT_EXPORT'] } },
      select: { id: true, source: true },
    })
    const flow = pendingFlows.get(userId)
    return {
      configured: traktConfigured(),
      connected: account !== null,
      username: account?.username ?? null,
      mirrorEnabled: account?.mirrorEnabled ?? false,
      runningJob: running,
      pendingCode: flow && flow.expiresAt > Date.now() ? { userCode: flow.userCode, verificationUrl: flow.verificationUrl } : null,
    }
  })

  // Starts the OAuth device flow: returns a short code the user types on
  // trakt.tv/activate. A background poll stores the tokens once approved;
  // the client just re-polls /status until connected.
  app.post('/api/trakt/connect', { preHandler: app.requireAuth }, async (request, reply) => {
    if (!traktConfigured()) return reply.code(400).send({ error: 'trakt_not_configured' })
    const userId = request.user!.id

    const existing = pendingFlows.get(userId)
    if (existing && existing.expiresAt > Date.now()) {
      return { userCode: existing.userCode, verificationUrl: existing.verificationUrl }
    }

    const code = await startDeviceFlow()
    pendingFlows.set(userId, {
      userCode: code.user_code,
      verificationUrl: code.verification_url,
      expiresAt: Date.now() + code.expires_in * 1000,
    })

    const poll = async () => {
      const deadline = Date.now() + code.expires_in * 1000
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, code.interval * 1000))
        try {
          const result = await pollDeviceToken(code.device_code)
          if (result.status === 'ok') {
            await saveTokens(userId, result.tokens)
            app.log.info({ userId }, 'trakt connected')
            break
          }
          if (result.status !== 'pending') break
        } catch (err) {
          app.log.warn({ err }, 'trakt device poll error')
          break
        }
      }
      pendingFlows.delete(userId)
    }
    void poll()

    return { userCode: code.user_code, verificationUrl: code.verification_url }
  })

  app.post('/api/trakt/disconnect', { preHandler: app.requireAuth }, async (request) => {
    await prisma.traktAccount.deleteMany({ where: { userId: request.user!.id } })
    pendingFlows.delete(request.user!.id)
    return { ok: true }
  })

  app.post('/api/trakt/mirror', { preHandler: app.requireAuth }, async (request, reply) => {
    const enabled = (request.body as { enabled?: boolean } | null)?.enabled
    if (typeof enabled !== 'boolean') return reply.code(400).send({ error: 'invalid_input' })
    const updated = await prisma.traktAccount.updateMany({
      where: { userId: request.user!.id },
      data: { mirrorEnabled: enabled },
    })
    if (updated.count === 0) return reply.code(400).send({ error: 'trakt_not_connected' })
    return { ok: true }
  })

  const startJob = async (userId: number, source: 'TRAKT' | 'TRAKT_EXPORT') => {
    const account = await prisma.traktAccount.findUnique({ where: { userId } })
    if (!account) return { error: 'trakt_not_connected' as const }
    const running = await prisma.importJob.findFirst({ where: { userId, status: 'RUNNING' } })
    if (running) return { error: 'job_already_running' as const, jobId: running.id }
    const job = await prisma.importJob.create({ data: { userId, source } })
    void (source === 'TRAKT' ? runTraktImport(job.id, userId) : runTraktExport(job.id, userId))
    return { jobId: job.id }
  }

  app.post('/api/trakt/import', { preHandler: app.requireAuth }, async (request, reply) => {
    const result = await startJob(request.user!.id, 'TRAKT')
    if ('error' in result) return reply.code(result.error === 'trakt_not_connected' ? 400 : 409).send(result)
    return reply.code(202).send(result)
  })

  app.post('/api/trakt/export', { preHandler: app.requireAuth }, async (request, reply) => {
    const result = await startJob(request.user!.id, 'TRAKT_EXPORT')
    if ('error' in result) return reply.code(result.error === 'trakt_not_connected' ? 400 : 409).send(result)
    return reply.code(202).send(result)
  })
}
