/**
 * AAS v4 — Phase 10: Removal Pass (Quarantine Manager)
 *
 * Rules (from Phase 10 simplicity mandate):
 *   - Rules not triggered in 6 consecutive loops → quarantine
 *   - Duplicate functionality → merge or discard
 *   - Quarantined rules NOT deleted — held for review until re-validated or removed
 *   - Removal is default; addition must prove > 5% EV improvement
 *
 * GET  /api/learning/quarantine         — list quarantined + near-quarantine versions
 * POST /api/learning/quarantine         — run removal pass scan (cron or manual)
 * POST /api/learning/quarantine?action= — revalidate | remove a specific version
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// A version is eligible for auto-quarantine scan if:
//   - active: true (still serving traffic)
//   - loopsWithoutImprovement >= QUARANTINE_LOOP_LIMIT
//   - OR avgScore hasn't moved more than STAGNATION_BAND in last N runs
const QUARANTINE_LOOP_LIMIT = 6
const STAGNATION_BAND       = 0.1
const LOW_RUN_COUNT         = 3   // versions with < 3 runs aren't quarantinable (too little data)

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const bearer = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  return !!(secret && (header === secret || bearer === secret))
}

async function runRemovalPassScan(): Promise<{
  scanned:    number
  quarantined: Array<{ id: string; agentId: string; reason: string; loops: number }>
  nearLimit:   Array<{ id: string; agentId: string; loops: number; loopsRemaining: number }>
}> {
  // Fetch all active, non-quarantined versions with enough runs to evaluate
  const candidates = await prisma.promptVersion.findMany({
    where:   { active: true, quarantined: false, runCount: { gte: LOW_RUN_COUNT } },
    orderBy: { createdAt: 'asc' },
  })

  const newlyQuarantined: Array<{ id: string; agentId: string; reason: string; loops: number }> = []
  const nearLimit:        Array<{ id: string; agentId: string; loops: number; loopsRemaining: number }> = []

  for (const version of candidates) {
    const loops = version.loopsWithoutImprovement

    if (loops >= QUARANTINE_LOOP_LIMIT) {
      // Check if there's a better version for this agent — if not, don't quarantine (would leave agent with nothing)
      const betterExists = await prisma.promptVersion.findFirst({
        where: {
          agentId:     version.agentId,
          id:          { not: version.id },
          active:      true,
          quarantined: false,
          avgScore:    { gt: version.avgScore + STAGNATION_BAND },
        },
      })

      if (betterExists) {
        await prisma.promptVersion.update({
          where: { id: version.id },
          data:  { quarantined: true, quarantinedAt: new Date(), active: false },
        })
        newlyQuarantined.push({
          id:      version.id,
          agentId: version.agentId,
          reason:  `stagnant_${loops}_loops`,
          loops,
        })
      } else {
        // Flag as near-limit but keep active — no replacement available yet
        nearLimit.push({
          id:             version.id,
          agentId:        version.agentId,
          loops,
          loopsRemaining: 0,
        })
      }
    } else if (loops >= QUARANTINE_LOOP_LIMIT - 2) {
      // Within 2 loops of quarantine — surface as warning
      nearLimit.push({
        id:             version.id,
        agentId:        version.agentId,
        loops,
        loopsRemaining: QUARANTINE_LOOP_LIMIT - loops,
      })
    }
  }

  return { scanned: candidates.length, quarantined: newlyQuarantined, nearLimit }
}

// GET — full quarantine state
export async function GET(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [quarantined, active, methodResults] = await Promise.all([
      prisma.promptVersion.findMany({
        where:   { quarantined: true },
        orderBy: { quarantinedAt: 'desc' },
        select:  { id: true, agentId: true, avgScore: true, runCount: true, methodId: true, loopsWithoutImprovement: true, quarantinedAt: true, createdAt: true },
      }),
      prisma.promptVersion.findMany({
        where:   { active: true, quarantined: false },
        orderBy: { loopsWithoutImprovement: 'desc' },
        select:  { id: true, agentId: true, avgScore: true, runCount: true, methodId: true, loopsWithoutImprovement: true },
        take:    20,
      }),
      // Which methods are producing quarantined rules most often?
      prisma.promptVersion.groupBy({
        by:     ['methodId'],
        where:  { quarantined: true },
        _count: { id: true },
      }),
    ])

    const nearLimit = active.filter(v => v.loopsWithoutImprovement >= QUARANTINE_LOOP_LIMIT - 2)

    return NextResponse.json({
      ok: true,
      data: {
        quarantined,
        nearLimit,
        methodQuarantineRates: methodResults.map(m => ({
          methodId:         m.methodId,
          quarantinedCount: m._count.id,
        })),
        summary: {
          totalQuarantined: quarantined.length,
          nearLimitCount:   nearLimit.length,
          quarantineLimit:  QUARANTINE_LOOP_LIMIT,
        },
      },
    })
  } catch (err) {
    console.error('[quarantine GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to fetch quarantine state' }, { status: 500 })
  }
}

// POST — run removal pass scan OR action on a specific version
export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const action = req.nextUrl.searchParams.get('action')

  try {
    // Action: revalidate — un-quarantine a specific version (new evidence)
    if (action === 'revalidate') {
      const { id, reason } = await req.json()
      if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

      const version = await prisma.promptVersion.findUnique({ where: { id } })
      if (!version) return NextResponse.json({ ok: false, error: 'Version not found' }, { status: 404 })

      // Deactivate any currently active version for this agent first
      await prisma.promptVersion.updateMany({
        where: { agentId: version.agentId, active: true },
        data:  { active: false },
      })

      await prisma.promptVersion.update({
        where: { id },
        data:  { quarantined: false, quarantinedAt: null, active: true, loopsWithoutImprovement: 0 },
      })

      await prisma.auditEvent.create({
        data: {
          action:    'agent_prompt_saved',
          sessionId: 'quarantine-revalidate',
          meta:      { promptVersionId: id, agentId: version.agentId, reason: reason ?? 'manual_revalidation' },
        },
      }).catch(console.error)

      return NextResponse.json({ ok: true, data: { action: 'revalidated', id, agentId: version.agentId } })
    }

    // Action: remove — permanently deactivate (Phase 10 removal pass final step)
    if (action === 'remove') {
      const { id, reason } = await req.json()
      if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

      const version = await prisma.promptVersion.findUnique({ where: { id } })
      if (!version) return NextResponse.json({ ok: false, error: 'Version not found' }, { status: 404 })
      if (!version.quarantined) {
        return NextResponse.json({
          ok: false,
          error: 'AAS v4 safety: only quarantined versions can be removed. Run removal_pass_scan first.',
        }, { status: 400 })
      }

      // Soft delete: mark inactive + quarantined, never hard-delete (AAS v4: quarantined rules held for re-validation)
      await prisma.promptVersion.update({
        where: { id },
        data:  { active: false, quarantined: true },
      })

      await prisma.auditEvent.create({
        data: {
          action:    'agent_prompt_saved',
          sessionId: 'quarantine-remove',
          meta:      { promptVersionId: id, agentId: version.agentId, action: 'removed', reason: reason ?? 'phase_10_removal_pass' },
        },
      }).catch(console.error)

      return NextResponse.json({ ok: true, data: { action: 'removed', id, agentId: version.agentId } })
    }

    // Default: run removal pass scan
    const result = await runRemovalPassScan()

    await prisma.auditEvent.create({
      data: {
        action:    'learning_cycle',
        sessionId: 'quarantine-scan',
        meta:      { type: 'removal_pass_scan', ...result },
      },
    }).catch(console.error)

    return NextResponse.json({ ok: true, data: { action: 'removal_pass_scan', ...result } })
  } catch (err) {
    console.error('[quarantine POST]', err)
    return NextResponse.json({ ok: false, error: 'Quarantine action failed' }, { status: 500 })
  }
}
