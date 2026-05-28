/**
 * POST /api/hermes/dispatch
 *
 * Hermes Workspace gateway — receives task dispatches from the Hermes agent
 * system (running at :8642) and routes them to the appropriate NEXUS OS
 * capability (pipeline, deploy, health, etc.).
 *
 * Auth: x-hermes-secret: <HERMES_SECRET>
 *       Also accepts CRON_SECRET and INTERNAL_API_SECRET for flexibility.
 *
 * Body:
 *   task        string   required — what to do
 *   agentType   string   optional — 'pipeline' | 'deploy' | 'health' | 'status'
 *   context     object   optional — extra params forwarded to sub-route
 *   workspaceId string   optional
 *
 * Response:
 *   { ok, jobId, status, result?, error? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID }                from 'crypto'
import { triggerPipeline }           from '@/lib/orchestrator'
import { prisma }                    from '@/lib/prisma'

export const runtime     = 'nodejs'
export const maxDuration = 300

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const hermesSecret   = process.env.HERMES_SECRET
  const cronSecret     = process.env.CRON_SECRET
  const internalSecret = process.env.INTERNAL_API_SECRET

  // Dev: no secrets configured → allow
  if (!hermesSecret && !cronSecret && !internalSecret) return true

  const auth      = req.headers.get('authorization') ?? ''
  const hermes    = req.headers.get('x-hermes-secret') ?? ''
  const xCron     = req.headers.get('x-cron-secret') ?? ''
  const xInternal = req.headers.get('x-nexus-internal') ?? ''
  const query     = req.nextUrl.searchParams.get('secret') ?? ''

  if (hermesSecret   && (hermes === hermesSecret || auth === `Bearer ${hermesSecret}`)) return true
  if (cronSecret     && (xCron === cronSecret || auth === `Bearer ${cronSecret}` || query === cronSecret)) return true
  if (internalSecret && xInternal === internalSecret) return true

  return false
}

// ─── Agent type router ────────────────────────────────────────────────────────

type AgentType = 'pipeline' | 'deploy' | 'health' | 'status' | 'auto'

function inferAgentType(task: string, explicit?: string): AgentType {
  if (explicit && ['pipeline','deploy','health','status'].includes(explicit)) {
    return explicit as AgentType
  }
  const t = task.toLowerCase()
  if (/build|forge|generate|create|scaffold/.test(t)) return 'pipeline'
  if (/deploy|push|release|ship/.test(t))              return 'deploy'
  if (/health|status|check|monitor/.test(t))           return 'health'
  return 'pipeline'  // default: run the pipeline
}

// ─── Audit ────────────────────────────────────────────────────────────────────

async function writeDispatchAudit(jobId: string, task: string, agentType: string, result: unknown): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action:    'agent_run',
        sessionId: `hermes-${jobId}`,
        meta:      { type: 'hermes_dispatch', jobId, task: task.slice(0, 200), agentType, result: JSON.parse(JSON.stringify(result ?? null)) },
      },
    })
  } catch {
    // Non-blocking
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized — invalid HERMES_SECRET' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const task = typeof body.task === 'string' ? body.task.trim() : ''
  if (!task || task.length < 3) {
    return NextResponse.json({ ok: false, error: '"task" field required (min 3 chars)' }, { status: 400 })
  }

  const jobId     = randomUUID()
  const agentType = inferAgentType(task, typeof body.agentType === 'string' ? body.agentType : undefined)
  const context   = (typeof body.context === 'object' && body.context !== null) ? body.context as Record<string, unknown> : {}

  console.log(`[hermes/dispatch] jobId=${jobId} agentType=${agentType} task="${task.slice(0, 80)}"`)

  try {
    let result: unknown

    if (agentType === 'pipeline') {
      result = await triggerPipeline({
        task,
        workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
        projectName: typeof context.projectName === 'string' ? context.projectName : undefined,
        env:         typeof context.env === 'object' && context.env !== null ? context.env as Record<string, string> : undefined,
        triggeredBy: 'hermes',
      })

    } else if (agentType === 'deploy') {
      // Direct deploy via /api/claude/deploy — push ref to GitHub + create Vercel deployment
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.NEXTAUTH_URL ?? 'http://localhost:3000')
      const deploySecret = process.env.CRON_SECRET ?? process.env.INTERNAL_API_SECRET ?? process.env.HERMES_SECRET ?? ''
      const res = await fetch(`${baseUrl}/api/claude/deploy`, {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'x-cron-secret':  deploySecret,
        },
        body: JSON.stringify({
          ref:         typeof context.ref === 'string' ? context.ref : 'main',
          projectName: typeof context.projectName === 'string' ? context.projectName : undefined,
          skipGithub:  context.skipGithub === true,
          skipVercel:  context.skipVercel === true,
          files:       typeof context.files === 'object' && context.files !== null ? context.files : undefined,
          env:         typeof context.env === 'object' && context.env !== null ? context.env : undefined,
        }),
        signal: AbortSignal.timeout(120_000),
      })
      result = await res.json()

    } else if (agentType === 'health') {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.NEXTAUTH_URL ?? 'http://localhost:3000')
      const res  = await fetch(`${baseUrl}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      result = await res.json()

    } else if (agentType === 'status') {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.NEXTAUTH_URL ?? 'http://localhost:3000')
      // Pass all available secrets so the status route can validate with whichever is configured
      const internalHeaders: Record<string, string> = {}
      if (process.env.HERMES_SECRET)   internalHeaders['x-hermes-secret']  = process.env.HERMES_SECRET
      if (process.env.CRON_SECRET)     internalHeaders['x-cron-secret']    = process.env.CRON_SECRET
      if (process.env.INTERNAL_API_SECRET) internalHeaders['x-nexus-internal'] = process.env.INTERNAL_API_SECRET
      const res  = await fetch(`${baseUrl}/api/hermes/status`, {
        headers: internalHeaders,
        signal: AbortSignal.timeout(8000),
      })
      result = await res.json()

    } else {
      // fallback — treat as pipeline
      result = await triggerPipeline({ task, triggeredBy: 'hermes' })
    }

    await writeDispatchAudit(jobId, task, agentType, result)

    return NextResponse.json({
      ok:        true,
      jobId,
      agentType,
      status:    'completed',
      result,
    })

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[hermes/dispatch] jobId=${jobId} error:`, error)
    await writeDispatchAudit(jobId, task, agentType, { error })
    return NextResponse.json({ ok: false, jobId, error }, { status: 500 })
  }
}
