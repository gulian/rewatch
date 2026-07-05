import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { applyMovieMatch, runTvTimeImport } from '../lib/import.js'

const idParam = z.object({ id: z.coerce.number().int().positive() })

export default async function importRoutes(app: FastifyInstance) {
  // Uploads the TV Time GDPR export. The import runs in the background
  // within the process (no queue) — tracked via GET /jobs/:id.
  app.post('/api/import/tvtime', { preHandler: app.requireAuth }, async (request, reply) => {
    const userId = request.user!.id

    const running = await prisma.importJob.findFirst({ where: { userId, status: 'RUNNING' } })
    if (running) return reply.code(409).send({ error: 'import_already_running', jobId: running.id })

    const file = await request.file()
    if (!file) return reply.code(400).send({ error: 'missing_file' })
    const buffer = await file.toBuffer()

    const job = await prisma.importJob.create({ data: { userId } })
    // Fire-and-forget: runTvTimeImport handles DONE/FAILED itself.
    void runTvTimeImport(job.id, userId, buffer)
    return reply.code(202).send({ jobId: job.id })
  })

  app.get('/api/import/jobs/:id', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    const job = await prisma.importJob.findFirst({
      where: { id: params.data.id, userId: request.user!.id },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    return job
  })

  // Movies without a confident match — to be resolved manually.
  app.get('/api/import/pending', { preHandler: app.requireAuth }, async (request) => {
    return prisma.importPendingMovie.findMany({
      where: { userId: request.user!.id },
      orderBy: { title: 'asc' },
    })
  })

  app.post('/api/import/pending/:id/resolve', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    const body = z.object({ tmdbId: z.number().int().positive() }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_input' })

    const pending = await prisma.importPendingMovie.findFirst({
      where: { id: params.data.id, userId: request.user!.id },
    })
    if (!pending) return reply.code(404).send({ error: 'not_found' })

    await applyMovieMatch(request.user!.id, body.data.tmdbId, pending.kind, pending.watchedAts)
    await prisma.importPendingMovie.delete({ where: { id: pending.id } })
    return { ok: true }
  })

  // Dismiss an unresolved movie.
  app.delete('/api/import/pending/:id', { preHandler: app.requireAuth }, async (request, reply) => {
    const params = idParam.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_id' })
    const deleted = await prisma.importPendingMovie.deleteMany({
      where: { id: params.data.id, userId: request.user!.id },
    })
    if (deleted.count === 0) return reply.code(404).send({ error: 'not_found' })
    return { ok: true }
  })
}
