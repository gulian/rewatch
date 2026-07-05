import 'dotenv/config'
import { buildApp } from './app.js'
import { prisma } from './lib/prisma.js'
import { loadSettings } from './lib/settings.js'

await loadSettings()
const app = await buildApp()

// Import jobs run in-process; any job still RUNNING at boot was killed by a
// restart or crash. Fail it so the user can retry (imports are idempotent) —
// otherwise the one-running-job-per-user guard blocks them forever.
const swept = await prisma.importJob.updateMany({
  where: { status: 'RUNNING' },
  data: { status: 'FAILED', error: 'interrupted by server restart' },
})
if (swept.count > 0) app.log.warn({ count: swept.count }, 'swept interrupted import jobs')

const port = Number(process.env.PORT ?? 3010)
// Defaults to loopback: a reverse proxy is expected in front. Set HOST=0.0.0.0 in containers.
const host = process.env.HOST ?? '127.0.0.1'

app.listen({ port, host }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})

// Drain in-flight requests on restart/stop instead of cutting connections.
let stopping = false
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    app.log.info({ signal }, 'shutting down')
    void app.close().then(() => process.exit(0))
  })
}
