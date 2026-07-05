import { resolve } from 'node:path'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { recordRequest } from './lib/metrics.js'
import authPlugin from './plugins/auth.js'
import accountRoutes from './routes/account.js'
import adminRoutes from './routes/admin.js'
import authRoutes from './routes/auth.js'
import catalogRoutes from './routes/catalog.js'
import importRoutes from './routes/import.js'
import libraryRoutes from './routes/library.js'
import pushRoutes from './routes/push.js'
import settingsRoutes from './routes/settings.js'
import statsRoutes from './routes/stats.js'
import trackingRoutes from './routes/tracking.js'

export async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(cookie)
  await app.register(multipart, { limits: { fileSize: 30 * 1024 * 1024, files: 1 } })
  // Generous global rate limit; auth routes enforce their own strict limit (config.rateLimit).
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })
  await app.register(authPlugin)

  // Telemetry for the admin console (in-process ring buffer).
  app.addHook('onResponse', (request, reply, done) => {
    recordRequest(request.routeOptions?.url ?? request.url, reply.elapsedTime, reply.statusCode)
    done()
  })

  app.get('/api/health', async () => ({ status: 'ok' }))

  await app.register(authRoutes)
  await app.register(accountRoutes)
  await app.register(adminRoutes)
  await app.register(catalogRoutes)
  await app.register(importRoutes)
  await app.register(trackingRoutes)
  await app.register(libraryRoutes)
  await app.register(statsRoutes)
  await app.register(pushRoutes)
  await app.register(settingsRoutes)

  // Single-container mode: serve the built frontend from the API process.
  // With a reverse proxy serving the static files, leave STATIC_DIR unset.
  if (process.env.STATIC_DIR) {
    await app.register(fastifyStatic, { root: resolve(process.env.STATIC_DIR), wildcard: false })
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' })
      return reply.sendFile('index.html') // SPA fallback
    })
  }

  return app
}
