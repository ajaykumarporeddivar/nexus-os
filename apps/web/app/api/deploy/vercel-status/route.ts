import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'

const VERCEL_API = 'https://api.vercel.com'

/**
 * GET /api/deploy/vercel-status?id=<deploymentId>
 * Lightweight status check — called by client every 10s while waiting for a build.
 * Returns: { ok, state, deployUrl, aliasUrl, ready, error? }
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const token  = process.env.VERCEL_TOKEN?.trim()
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || undefined

  if (!token) {
    return NextResponse.json({ ok: false, error: 'VERCEL_TOKEN not configured' }, { status: 400 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing deployment id' }, { status: 400 })
  }

  try {
    const qs  = teamId ? `?teamId=${teamId}` : ''
    const res = await fetch(`${VERCEL_API}/v13/deployments/${id}${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      // Short timeout — this is a polling endpoint
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({
        ok:    false,
        error: (err as { error?: { message?: string } }).error?.message ?? `Status ${res.status}`,
      }, { status: res.status })
    }

    const d = await res.json()
    const state: string = d.readyState ?? 'BUILDING'

    // Prefer the alias URL (project.vercel.app) when READY — it's cleaner.
    // Fall back to the deployment-specific URL (project-hash.vercel.app).
    const deployUrl = state === 'READY' && d.alias?.[0]
      ? `https://${d.alias[0] as string}`
      : d.url
      ? `https://${d.url as string}`
      : null

    // For ERROR state, fetch build event logs to surface the actual webpack/Next.js error
    let buildError: string | undefined
    if (state === 'ERROR') {
      buildError = d.errorMessage ?? 'Build failed'
      try {
        const logsQs = teamId ? `?teamId=${teamId}&limit=100&direction=backward` : '?limit=100&direction=backward'
        const logsRes = await fetch(`${VERCEL_API}/v2/deployments/${id}/events${logsQs}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal:  AbortSignal.timeout(5000),
        })
        if (logsRes.ok) {
          const logsData = await logsRes.json() as { type?: string; payload?: { text?: string } }[]
          // Find the first error line (usually "Error: ..." or "Module not found:")
          const errorLines = (Array.isArray(logsData) ? logsData : [])
            .filter(e => e.type === 'stdout' || e.type === 'stderr')
            .map(e => e.payload?.text ?? '')
            .filter(t => /error:|module not found|cannot find|failed to compile/i.test(t))
            .slice(0, 5)
            .join('\n')
          if (errorLines) buildError = errorLines.slice(0, 800)
        }
      } catch { /* non-fatal — use errorMessage fallback */ }
    }

    return NextResponse.json({
      ok:       true,
      state,
      deployUrl,
      ready:    state === 'READY',
      error:    state === 'ERROR' ? buildError : undefined,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
