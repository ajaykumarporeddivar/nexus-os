/**
 * GET /api/pipeline/reputation
 *
 * Returns system-wide reputation scores + vertical leaderboard.
 * Auth: CRON_SECRET / INTERNAL_API_SECRET / HERMES_SECRET
 *
 * Query params:
 *   period   24h | 7d | 30d  (default: 7d)
 *   userId   string           optional — return single user reputation
 */

import { NextRequest, NextResponse }      from 'next/server'
import { getSystemReputation, getVerticalReputations, getUserReputation } from '@/lib/reputationEngine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorized(req: NextRequest): boolean {
  const cronSecret     = process.env.CRON_SECRET
  const internalSecret = process.env.INTERNAL_API_SECRET
  const hermesSecret   = process.env.HERMES_SECRET
  if (!cronSecret && !internalSecret && !hermesSecret) return true

  const auth      = req.headers.get('authorization') ?? ''
  const xCron     = req.headers.get('x-cron-secret') ?? ''
  const xInternal = req.headers.get('x-nexus-internal') ?? ''
  const xHermes   = req.headers.get('x-hermes-secret') ?? ''
  const query     = req.nextUrl.searchParams.get('secret') ?? ''

  if (cronSecret     && (auth === `Bearer ${cronSecret}` || xCron === cronSecret || query === cronSecret)) return true
  if (internalSecret && xInternal === internalSecret) return true
  if (hermesSecret   && xHermes   === hermesSecret)   return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const period = (req.nextUrl.searchParams.get('period') ?? '7d') as '24h' | '7d' | '30d'
  const userId = req.nextUrl.searchParams.get('userId')

  if (userId) {
    const userRep = await getUserReputation(userId)
    return NextResponse.json({ ok: true, data: userRep })
  }

  const [system, verticals] = await Promise.all([
    getSystemReputation(period),
    getVerticalReputations(),
  ])

  return NextResponse.json({
    ok: true,
    data: {
      system,
      verticals,
      topVertical:    verticals[0] ?? null,
      worstVertical:  verticals[verticals.length - 1] ?? null,
    },
  })
}
