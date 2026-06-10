/**
 * POST /api/pipeline/trigger
 *
 * Server-side entrypoint for the autonomous FORGE → BUILD → DEPLOY pipeline.
 * Callable by:
 *   - Cron jobs (Authorization: Bearer <CRON_SECRET>)
 *   - Self-heal monitor (x-nexus-internal: <INTERNAL_API_SECRET>)
 *   - Hermes Workspace (x-hermes-secret: <HERMES_SECRET>)
 *   - Manual curl triggers (?secret=<CRON_SECRET>)
 *
 * Body (JSON):
 *   task         string   required — human-readable goal
 *   workspaceId  string   optional — scopes forge to a workspace
 *   projectName  string   optional — override auto-generated name
 *   ref          string   optional — git branch (default: main)
 *   env          object   optional — extra env vars for deployment
 *   triggeredBy  string   optional — 'cron' | 'hermes' | 'self-heal' | 'manual'
 *
 * Response 200:
 *   { ok: true,  runId, steps: { forge, build, deploy }, totalMs }
 * Response 4xx/5xx:
 *   { ok: false, error }
 */

import { NextRequest, NextResponse } from 'next/server'
import { triggerPipeline } from '@/lib/orchestrator'

export const runtime     = 'nodejs'
export const maxDuration = 300   // Vercel Pro: 300s for full FORGE→BUILD→DEPLOY

function isAuthorized(req: NextRequest): boolean {
  const cronSecret     = process.env.CRON_SECRET
  const internalSecret = process.env.INTERNAL_API_SECRET
  const hermesSecret   = process.env.HERMES_SECRET

  // Dev only: no secrets configured → allow through (never in production)
  if (!cronSecret && !internalSecret && !hermesSecret) {
    if (process.env.NODE_ENV === 'production') return false
    return true
  }

  const authHeader  = req.headers.get('authorization') ?? ''
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''
  const internal    = req.headers.get('x-nexus-internal') ?? ''
  const hermes      = req.headers.get('x-hermes-secret') ?? ''
  const cronHeader  = req.headers.get('x-cron-secret') ?? ''

  if (cronSecret && (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret || cronHeader === cronSecret)) return true
  if (internalSecret && internal === internalSecret) return true
  if (hermesSecret && hermes === hermesSecret) return true

  return false
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized — invalid secret' },
      { status: 401 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const task = body.task
  if (!task || typeof task !== 'string' || task.trim().length < 5) {
    return NextResponse.json(
      { ok: false, error: '"task" field is required (min 5 chars)' },
      { status: 400 },
    )
  }

  try {
    const result = await triggerPipeline({
      task:        task.trim(),
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
      projectName: typeof body.projectName === 'string' ? body.projectName : undefined,
      ref:         typeof body.ref         === 'string' ? body.ref         : undefined,
      env:         typeof body.env         === 'object' && body.env !== null
                     ? body.env as Record<string, string>
                     : undefined,
      triggeredBy: ['cron','hermes','self-heal','manual'].includes(String(body.triggeredBy))
                     ? body.triggeredBy as 'cron' | 'hermes' | 'self-heal' | 'manual'
                     : 'manual',
    })

    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pipeline/trigger]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
