// Instance settings, editable from the admin console and stored in the DB.
// Environment variables with the same name always win (12-factor overrides),
// so existing .env-based deployments keep working unchanged.
import { prisma } from './prisma.js'

export const SETTING_KEYS = [
  'TMDB_API_TOKEN',
  'TMDB_LANGUAGE',
  'APP_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'REGISTRATION_ENABLED',
  'LEGAL_HOST',
  'LEGAL_CONTACT',
  'TRAKT_CLIENT_ID',
  'TRAKT_CLIENT_SECRET',
] as const
export type SettingKey = (typeof SETTING_KEYS)[number]

// Never returned to the client, even to admins — only a "set" flag is.
export const SECRET_KEYS: readonly SettingKey[] = ['TMDB_API_TOKEN', 'SMTP_PASS', 'VAPID_PRIVATE_KEY', 'TRAKT_CLIENT_SECRET']

const cache = new Map<string, string>()
const listeners: Array<() => void> = []

/** Load DB values into the in-process cache. Call once at boot. */
export async function loadSettings() {
  const rows = await prisma.setting.findMany()
  cache.clear()
  for (const row of rows) cache.set(row.key, row.value)
}

/** Env var (non-empty) wins over the DB value. */
export function getSetting(key: SettingKey): string | undefined {
  const env = process.env[key]
  if (env !== undefined && env !== '') return env
  const db = cache.get(key)
  return db !== undefined && db !== '' ? db : undefined
}

/** True when the value is forced by the environment (read-only in the UI). */
export function isEnvLocked(key: SettingKey): boolean {
  const env = process.env[key]
  return env !== undefined && env !== ''
}

/** Modules with internal state (web-push) re-init through this. */
export function onSettingsChange(listener: () => void) {
  listeners.push(listener)
}

export async function saveSettings(values: Partial<Record<SettingKey, string>>) {
  const entries = Object.entries(values) as [SettingKey, string][]
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  )
  for (const [key, value] of entries) cache.set(key, value)
  for (const listener of listeners) listener()
}

/** The instance is usable once a TMDB key exists — drives the setup wizard. */
export function needsSetup(): boolean {
  return getSetting('TMDB_API_TOKEN') === undefined
}
