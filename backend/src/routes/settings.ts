// Admin-editable instance settings + first-run helpers.
import type { FastifyInstance } from 'fastify'
import webpush from 'web-push'
import { z } from 'zod'
import {
  SETTING_KEYS,
  SECRET_KEYS,
  getSetting,
  isEnvLocked,
  needsSetup,
  saveSettings,
  type SettingKey,
} from '../lib/settings.js'

const valueSchemas: Record<SettingKey, z.ZodType<string>> = {
  TMDB_API_TOKEN: z.string().min(10).max(300),
  TMDB_LANGUAGE: z.enum(['en-US', 'fr-FR']),
  APP_URL: z.url().transform((u) => u.replace(/\/$/, '')),
  SMTP_HOST: z.string().max(253),
  SMTP_PORT: z.string().regex(/^\d{1,5}$/),
  SMTP_SECURE: z.enum(['true', 'false']),
  SMTP_USER: z.string().max(254),
  SMTP_PASS: z.string().max(500),
  MAIL_FROM: z.string().max(320),
  VAPID_PUBLIC_KEY: z.string().max(200),
  VAPID_PRIVATE_KEY: z.string().max(200),
  VAPID_SUBJECT: z.string().startsWith('mailto:').max(320),
  REGISTRATION_ENABLED: z.enum(['true', 'false']),
}

export default async function settingsRoutes(app: FastifyInstance) {
  // Public and unauthenticated on purpose: the login screen needs to know
  // whether this is a fresh instance. Exposes a single boolean, nothing else.
  app.get('/api/setup-status', async () => ({ needsSetup: needsSetup() }))

  app.get('/api/admin/settings', { preHandler: app.requireAdmin }, async () => {
    return SETTING_KEYS.map((key) => {
      const value = getSetting(key)
      const secret = SECRET_KEYS.includes(key)
      return {
        key,
        set: value !== undefined,
        envLocked: isEnvLocked(key),
        // Secrets never leave the server; the UI writes a new value to rotate.
        value: secret ? null : (value ?? null),
      }
    })
  })

  app.put('/api/admin/settings', { preHandler: app.requireAdmin }, async (request, reply) => {
    const body = request.body as Record<string, unknown>
    if (typeof body !== 'object' || body === null) return reply.code(400).send({ error: 'invalid_input' })

    const values: Partial<Record<SettingKey, string>> = {}
    for (const [key, raw] of Object.entries(body)) {
      if (!(SETTING_KEYS as readonly string[]).includes(key)) {
        return reply.code(400).send({ error: 'unknown_setting', key })
      }
      const parsed = valueSchemas[key as SettingKey].safeParse(raw)
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_value', key })
      if (isEnvLocked(key as SettingKey)) return reply.code(400).send({ error: 'env_locked', key })
      values[key as SettingKey] = parsed.data
    }
    await saveSettings(values)
    app.log.warn({ admin: request.user!.id, action: 'settings-update', keys: Object.keys(values) }, 'admin action')
    return { ok: true }
  })

  // Live validation of a TMDB key (the provided one, or the stored one).
  app.post('/api/admin/settings/test-tmdb', { preHandler: app.requireAdmin }, async (request, reply) => {
    const body = z.object({ token: z.string().optional() }).safeParse(request.body ?? {})
    const token = body.success ? (body.data.token ?? getSetting('TMDB_API_TOKEN')) : undefined
    if (!token) return reply.code(400).send({ error: 'no_token' })

    const url = new URL('https://api.themoviedb.org/3/configuration')
    const headers: Record<string, string> = {}
    if (token.includes('.')) headers.Authorization = `Bearer ${token}`
    else url.searchParams.set('api_key', token)
    const res = await fetch(url, { headers })
    return { ok: res.ok }
  })

  // Sends a real email through the current SMTP settings.
  app.post('/api/admin/settings/test-email', { preHandler: app.requireAdmin }, async (request, reply) => {
    const body = z.object({ to: z.email() }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_input' })
    if (!getSetting('SMTP_HOST')) return reply.code(400).send({ error: 'smtp_not_configured' })
    const { sendTestEmail } = await import('../lib/mailer.js')
    try {
      await sendTestEmail(body.data.to)
      return { ok: true }
    } catch (err) {
      return reply.code(502).send({ error: 'smtp_error', detail: (err as Error).message })
    }
  })

  // One-click VAPID generation. Refuses to overwrite existing keys: rotating
  // them silently would strand every push subscription.
  app.post('/api/admin/settings/generate-vapid', { preHandler: app.requireAdmin }, async (request, reply) => {
    if (getSetting('VAPID_PUBLIC_KEY') || getSetting('VAPID_PRIVATE_KEY')) {
      return reply.code(409).send({ error: 'vapid_already_set' })
    }
    const keys = webpush.generateVAPIDKeys()
    await saveSettings({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey })
    app.log.warn({ admin: request.user!.id, action: 'generate-vapid' }, 'admin action')
    return { ok: true, publicKey: keys.publicKey }
  })
}
