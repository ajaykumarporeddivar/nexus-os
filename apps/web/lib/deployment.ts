/**
 * deployment.ts — Multi-provider deployment adapter registry.
 * Provides health checks and routing scores for Vercel (and future providers).
 */

export interface ProviderHealthStatus {
  providerId:  string
  name:        string
  available:   boolean
  latencyMs:   number | null
  lastChecked: string
  error?:      string
}

export interface DeployAdapter {
  id:   string
  name: string
}

export interface RankedProvider {
  providerId:             string
  score:                  number
  disqualified:           boolean
  disqualificationReason?: string
}

/** All registered deployment adapters. */
export const ADAPTERS: DeployAdapter[] = [
  { id: 'vercel', name: 'Vercel' },
]

/** Fetch real-time health for each registered provider. */
export async function getProviderHealth(): Promise<ProviderHealthStatus[]> {
  const results: ProviderHealthStatus[] = []

  for (const adapter of ADAPTERS) {
    const start = Date.now()
    try {
      // Lightweight reachability check against Vercel's status page
      const res = await fetch('https://www.vercel-status.com/api/v2/status.json', {
        signal: AbortSignal.timeout(5000),
      })
      const data = await res.json() as { status?: { indicator?: string } }
      const ok = data?.status?.indicator === 'none'
      results.push({
        providerId:  adapter.id,
        name:        adapter.name,
        available:   ok,
        latencyMs:   Date.now() - start,
        lastChecked: new Date().toISOString(),
        ...(!ok ? { error: `Status: ${data?.status?.indicator ?? 'unknown'}` } : {}),
      })
    } catch (err) {
      results.push({
        providerId:  adapter.id,
        name:        adapter.name,
        available:   false,
        latencyMs:   null,
        lastChecked: new Date().toISOString(),
        error:       err instanceof Error ? err.message : 'Health check failed',
      })
    }
  }

  return results
}

/** Rank providers by availability and latency for routing decisions. */
export async function rankProviders(
  adapters: DeployAdapter[],
  _ctx: { idempotencyKey: string; projectName: string },
): Promise<RankedProvider[]> {
  const health = await getProviderHealth()

  return adapters.map(adapter => {
    const h = health.find(x => x.providerId === adapter.id)
    if (!h || !h.available) {
      return { providerId: adapter.id, score: 0, disqualified: true, disqualificationReason: h?.error ?? 'Unavailable' }
    }
    // Score: latency-weighted (lower latency = higher score)
    const latencyPenalty = h.latencyMs ? Math.min(h.latencyMs / 10_000, 1) : 0
    return { providerId: adapter.id, score: Math.round((1 - latencyPenalty) * 100), disqualified: false }
  })
}
