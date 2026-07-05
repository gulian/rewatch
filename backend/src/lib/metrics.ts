// In-process telemetry: a ring buffer of recent request timings.
// No external APM — good enough for a single-node instance, zero dependencies.
// Extend by adding fields to `snapshot()`; the admin console reads that shape.

type Sample = { route: string; ms: number; status: number; at: number }

const CAPACITY = 5000
const samples: Sample[] = new Array(CAPACITY)
let writeIndex = 0
let totalRequests = 0
const bootedAt = Date.now()

export function recordRequest(route: string, ms: number, status: number) {
  samples[writeIndex % CAPACITY] = { route, ms, status, at: Date.now() }
  writeIndex++
  totalRequests++
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return Math.round((sorted[Math.max(0, i)] ?? 0) * 10) / 10
}

function windowSamples(windowMs: number): Sample[] {
  const cutoff = Date.now() - windowMs
  const out: Sample[] = []
  const count = Math.min(writeIndex, CAPACITY)
  for (let i = 0; i < count; i++) {
    const s = samples[i]
    if (s && s.at >= cutoff) out.push(s)
  }
  return out
}

export function metricsSnapshot() {
  const win15 = windowSamples(15 * 60_000)
  const win1 = windowSamples(60_000)
  const durations = win15.map((s) => s.ms).sort((a, b) => a - b)
  const errors = win15.filter((s) => s.status >= 500).length

  // Per-minute latency buckets for the last 30 minutes (sparkline).
  const now = Date.now()
  const buckets = Array.from({ length: 30 }, (_, i) => {
    const start = now - (30 - i) * 60_000
    const end = start + 60_000
    const inBucket = windowSamples(31 * 60_000).filter((s) => s.at >= start && s.at < end)
    const ds = inBucket.map((s) => s.ms).sort((a, b) => a - b)
    return { count: inBucket.length, p95: percentile(ds, 95) }
  })

  // Slowest routes over the window (aggregated). API only: when the process
  // also serves the frontend (STATIC_DIR), asset requests are just noise here.
  const byRoute = new Map<string, { count: number; total: number; max: number }>()
  for (const s of win15) {
    if (!s.route.startsWith('/api/')) continue
    const r = byRoute.get(s.route) ?? { count: 0, total: 0, max: 0 }
    r.count++
    r.total += s.ms
    r.max = Math.max(r.max, s.ms)
    byRoute.set(s.route, r)
  }
  const routes = [...byRoute.entries()]
    .map(([route, r]) => ({ route, count: r.count, avg: Math.round(r.total / r.count), max: Math.round(r.max) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8)

  const mem = process.memoryUsage()
  return {
    latency: {
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
      window: '15m',
    },
    throughput: {
      requestsPerMinute: win1.length,
      requests15m: win15.length,
      totalSinceBoot: totalRequests,
      errors15m: errors,
      errorRate15m: win15.length ? Math.round((errors / win15.length) * 1000) / 10 : 0,
    },
    buckets,
    routes,
    process: {
      uptimeSec: Math.round(process.uptime()),
      bootedAt: new Date(bootedAt).toISOString(),
      rssMb: Math.round(mem.rss / 1048576),
      heapMb: Math.round(mem.heapUsed / 1048576),
      node: process.version,
    },
  }
}
