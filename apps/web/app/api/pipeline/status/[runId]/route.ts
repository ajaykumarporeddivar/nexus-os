/**
 * GET /api/pipeline/status/:runId
 *
 * Returns the current state of a server-side pipeline run.
 * Used by polling clients (Hermes UI, CLI, self-heal cron) to track progress.
 *
 * Auth: same 3-method check as pipeline/trigger.
 *
 * Response 200:
 *   { ok: true, run: PipelineRunState }
 * Response 404:
 *   { ok: false, error: 'Run not found or expired' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPipelineState }          from '@/lib/pipelineState'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'

function isAuthorized(req: NextRequest): boolean {
  const cronSecret     = process.env.CRON_SECRET
  const internalSecret = process.env.INTERNAL_API_SECRET
  const hermesSecret   = process.env.HERMES_SECRET

  if (!cronSecret && !internalSecret && !hermesSecret) {
    if (process.env.NODE_ENV === 'production') return false
    return true   // dev
  }

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

export async function GET(
  req: NextRequest,
  { params }: { params: { runId: string } },
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { runId } = params
  if (!runId || typeof runId !== 'string' || runId.length < 8) {
    return NextResponse.json({ ok: false, error: 'Invalid runId' }, { status: 400 })
  }

  const run = await getPipelineState(runId)
  if (!run) {
    return NextResponse.json({ ok: false, error: 'Run not found or expired' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, run })
}
