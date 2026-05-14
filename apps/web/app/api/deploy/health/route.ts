/**
 * GET /api/deploy/health
 *
 * Returns real-time health status for all deployment providers.
 * Used by the PipelinePage deploy section to show provider availability
 * and by the routing engine to make informed provider selection.
 *
 * Response: { ok: true, data: ProviderHealthStatus[] }
 */

import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getProviderHealth, rankProviders, ADAPTERS } from '@/lib/deployment'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireSession()
    if (auth.error) return auth.error

    const health = await getProviderHealth()

    // Include routing scores as advisory info
    const ranked = await rankProviders(ADAPTERS, {
      idempotencyKey: 'health-check',
      projectName:    'health-check',
    })

    const data = health.map(h => {
      const score = ranked.find(r => r.providerId === h.providerId)
      return {
        ...h,
        routingScore:          score?.score ?? 0,
        routingDisqualified:   score?.disqualified ?? true,
        disqualificationReason: score?.disqualificationReason,
      }
    })

    return NextResponse.json({ ok: true, data })
  } catch (err) {
    console.error('[deploy/health]', err)
    return NextResponse.json(
      { ok: false, error: 'Health check failed' },
      { status: 500 },
    )
  }
}
