import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime     = 'nodejs'
export const maxDuration = 300
export const dynamic     = 'force-dynamic'

/**
 * GET /api/client-agents/batch
 *
 * Processes all due client agents across all workspaces.
 * Called by /api/cron/workspace-scheduler.
 * Auth: CRON_SECRET only.
 *
 * "Due" = enabled agent whose schedule matches and lastRunAt is stale:
 *   - daily:  lastRunAt < 23h ago (or never)
 *   - weekly: lastRunAt < 6d 12h ago (or never)
 *   - manual: never dispatched by batch
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader  = req.headers.get('authorization') ?? ''
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''
  const cronHeader  = req.headers.get('x-cron-secret') ?? ''

  const isAuthorised =
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret ||
    cronHeader  === cronSecret

  if (!isAuthorised) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const now     = new Date()
  const DAY_MS  = 24 * 60 * 60 * 1000
  const WEEK_MS = 6.5 * DAY_MS

  // ── Find all enabled, scheduled agents ────────────────────────────────────
  const agents = await prisma.clientAgent.findMany({
    where: {
      enabled:  true,
      schedule: { in: ['daily', 'weekly'] },
    },
    select: {
      id:            true,
      agentType:     true,
      schedule:      true,
      lastRunAt:     true,
      workspaceId:   true,
      deliveryMethod: true,
      deliveryEmail:  true,
      deliveryPhone:  true,
    },
  }).catch(() => [])

  // ── Filter stale agents ────────────────────────────────────────────────────
  const dueAgents = agents.filter(a => {
    if (!a.lastRunAt) return true
    const age = now.getTime() - a.lastRunAt.getTime()
    return a.schedule === 'daily' ? age >= (DAY_MS - 3600_000) : age >= (WEEK_MS)
  })

  if (dueAgents.length === 0) {
    return NextResponse.json({ ok: true, data: { processed: 0, skipped: 0, failed: 0 } })
  }

  const MAX_PER_RUN = 20
  const toProcess   = dueAgents.slice(0, MAX_PER_RUN)

  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '')
    ?? `https://${req.headers.get('host') ?? 'localhost:3000'}`

  let processed = 0, skipped = 0, failed = 0
  const results: Array<{ agentId: string; status: string; reason?: string }> = []

  for (const agent of toProcess) {
    // ── Check for a running job < 10 min (concurrency lock) ──────────────────
    const running = await prisma.clientAgentJob.findFirst({
      where: {
        clientAgentId: agent.id,
        status:        'running',
        startedAt:     { gte: new Date(now.getTime() - 10 * 60 * 1000) },
      },
      select: { id: true },
    }).catch(() => null)

    if (running) {
      skipped++
      results.push({ agentId: agent.id, status: 'skipped', reason: 'running_lock' })
      continue
    }

    try {
      // ── Run the agent ──────────────────────────────────────────────────────
      const runRes = await fetch(`${baseUrl}/api/client-agents/run`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'x-cron-secret': cronSecret,
        },
        body: JSON.stringify({ agentId: agent.id }),
      })

      const runJson = await runRes.json().catch(() => ({ ok: false, error: 'parse_error' })) as {
        ok: boolean
        data?: { jobId: string }
        error?: string
      }

      if (!runJson.ok) {
        failed++
        results.push({ agentId: agent.id, status: 'failed', reason: runJson.error })
        continue
      }

      // ── Deliver if email or whatsapp configured ────────────────────────────
      const shouldDeliver =
        !!runJson.data?.jobId &&
        ((agent.deliveryMethod === 'email' && !!agent.deliveryEmail) ||
         (agent.deliveryMethod === 'whatsapp' && !!agent.deliveryPhone))

      if (shouldDeliver && runJson.data?.jobId) {
        await fetch(`${baseUrl}/api/client-agents/deliver`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'x-cron-secret': cronSecret,
          },
          body: JSON.stringify({ jobId: runJson.data.jobId }),
        }).catch(console.error)
      }

      processed++
      results.push({ agentId: agent.id, status: 'done' })

    } catch (err) {
      failed++
      results.push({ agentId: agent.id, status: 'failed', reason: String(err) })
    }
  }

  // ── Audit log ──────────────────────────────────────────────────────────────
  await prisma.auditEvent.create({
    data: {
      action:    'client_agent_batch_run',
      sessionId: 'cron-client-agent-batch',
      meta: {
        totalDue:  dueAgents.length,
        processed,
        skipped,
        failed,
        results,
      },
    },
  }).catch(console.error)

  return NextResponse.json({
    ok: true,
    data: { totalDue: dueAgents.length, processed, skipped, failed },
  })
}
