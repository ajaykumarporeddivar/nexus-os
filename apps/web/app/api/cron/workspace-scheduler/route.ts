import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime     = 'nodejs'
export const maxDuration = 300  // 5 min — may process multiple workspaces

const MAX_WORKSPACES_PER_RUN = 10  // safety cap — avoids runaway cost spikes

/**
 * GET /api/cron/workspace-scheduler
 *
 * Per-workspace AI idea generation scheduler.
 * Runs on Vercel Cron every 4 hours and:
 *   1. Finds workspaces whose ideas are stale (lastGeneratedAt + cadenceHours ≤ now)
 *   2. Prioritises by oldest lastGeneratedAt (null first — never generated)
 *   3. Skips workspaces with a running job < 10 min old (DB-level concurrency lock)
 *   4. POSTs to /api/workspaces/:id/generate with x-cron-secret bypass
 *   5. Logs overall run to AuditEvent
 *
 * Auth: CRON_SECRET via Authorization: Bearer or ?secret= or x-cron-secret header.
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

  const runStart = Date.now()
  const now      = new Date()

  // ── 1. Find stale workspaces via intelligence profiles ─────────────────────
  // A workspace is stale when:
  //   - lastGeneratedAt IS NULL  (never generated)
  //   - OR lastGeneratedAt + refreshCadenceHours ≤ now
  //
  // Priority queue: NULL first (never run), then oldest lastGeneratedAt.
  // We filter in JS because "date + interval" comparison is easier without raw SQL.
  const profiles = await prisma.workspaceIntelligenceProfile.findMany({
    orderBy: [
      { lastGeneratedAt: 'asc' },   // NULL sorts first in most DBs (earliest = highest priority)
    ],
    select: {
      workspaceId:          true,
      refreshCadenceHours:  true,
      lastGeneratedAt:      true,
      primaryIndustry:      true,
    },
  }).catch(() => [])

  const staleProfiles = profiles.filter(p => {
    if (!p.lastGeneratedAt) return true   // never generated — always stale
    const nextRefresh = new Date(p.lastGeneratedAt.getTime() + p.refreshCadenceHours * 60 * 60 * 1000)
    return now >= nextRefresh
  })

  if (staleProfiles.length === 0) {
    return NextResponse.json({
      ok:   true,
      data: { processed: 0, skipped: 0, failed: 0, message: 'No stale workspaces' },
    })
  }

  const toProcess = staleProfiles.slice(0, MAX_WORKSPACES_PER_RUN)

  // ── 2. Determine base URL for internal fetch ───────────────────────────────
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '')
    ?? `https://${req.headers.get('host') ?? 'localhost:3000'}`

  // ── 3. Process each stale workspace ───────────────────────────────────────
  let processed = 0
  let skipped   = 0
  let failed    = 0

  const results: Array<{ workspaceId: string; status: string; reason?: string }> = []

  for (const profile of toProcess) {
    const { workspaceId } = profile

    // ── Concurrency lock: skip if a job is already running (< 10 min ago) ───
    const recentRunningJob = await prisma.workspaceGenerationJob.findFirst({
      where: {
        workspaceId,
        status:    'running',
        startedAt: { gte: new Date(now.getTime() - 10 * 60 * 1000) },
      },
      select: { id: true },
    }).catch(() => null)

    if (recentRunningJob) {
      skipped++
      results.push({ workspaceId, status: 'skipped', reason: 'running_lock' })
      continue
    }

    // ── Call generate endpoint with cron-secret bypass ───────────────────────
    try {
      const batchId = `cron-${workspaceId}-${now.getTime()}`
      const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/generate`, {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'x-cron-secret':  cronSecret,
        },
        body: JSON.stringify({ force: false, batchId }),
      })

      const json = await res.json().catch(() => ({ ok: false, error: 'parse_error' }))

      if (json.ok) {
        if (json.data?.skipped) {
          skipped++
          results.push({ workspaceId, status: 'skipped', reason: json.data.reason ?? 'not_stale' })
        } else {
          processed++
          results.push({ workspaceId, status: 'done' })
        }
      } else {
        failed++
        results.push({ workspaceId, status: 'failed', reason: json.error ?? 'unknown' })
        console.error(`[workspace-scheduler] failed for ${workspaceId}:`, json.error)
      }
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ workspaceId, status: 'failed', reason: msg })
      console.error(`[workspace-scheduler] fetch error for ${workspaceId}:`, err)
    }
  }

  const durationMs = Date.now() - runStart

  // ── 4. Dispatch client agent batch ────────────────────────────────────────
  let clientAgentResult: { processed?: number; skipped?: number; failed?: number } = {}
  try {
    const caRes = await fetch(`${baseUrl}/api/client-agents/batch`, {
      method:  'GET',
      headers: { 'x-cron-secret': cronSecret },
    })
    const caJson = await caRes.json().catch(() => ({})) as { ok: boolean; data?: typeof clientAgentResult }
    if (caJson.ok && caJson.data) clientAgentResult = caJson.data
  } catch (e) {
    console.error('[workspace-scheduler] client-agent batch error:', e)
  }

  // ── 5. Audit log the overall scheduler run ─────────────────────────────────
  await prisma.auditEvent.create({
    data: {
      action:    'workspace_scheduler_run',
      sessionId: `cron-workspace-scheduler`,
      meta: {
        totalStale:  staleProfiles.length,
        processed,
        skipped,
        failed,
        durationMs,
        results,
        clientAgents: clientAgentResult,
      },
    },
  }).catch(console.error)

  return NextResponse.json({
    ok:   true,
    data: {
      totalStale: staleProfiles.length,
      processed,
      skipped,
      failed,
      durationMs,
    },
  })
}
