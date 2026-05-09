/**
 * AAS v4 — Phase 08: Retroactive LearningMethodResult delta updates
 *
 * When a new PromptVersion is created, scoreAfter = 0 (no runs yet).
 * This route retroactively fills scoreAfter + delta once the version
 * has accumulated enough runs (≥ 5) to produce a reliable avgScore.
 *
 * Also updates RP_score (timingAdv aggregate) in the analytics layer.
 *
 * POST /api/learning/update-deltas — run the retroactive update (cron or manual)
 * GET  /api/learning/update-deltas — method win-rate leaderboard
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeRPScore } from '@/lib/timingAdvantage'

const MIN_RUNS_FOR_DELTA = 5  // minimum runs before scoring a prompt version's effectiveness

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const bearer = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  return !!(secret && (header === secret || bearer === secret))
}

async function runDeltaUpdate(): Promise<{
  processed: number
  updated:   Array<{ id: string; agentId: string; methodId: string; delta: number; scoreAfter: number }>
  skipped:   number
}> {
  // Find all LearningMethodResult records that haven't been scored yet
  const pending = await prisma.learningMethodResult.findMany({
    where: { scoreAfter: 0 },
    include: {
      promptVersion: {
        select: { avgScore: true, runCount: true, agentId: true },
      },
    },
  })

  const updated: Array<{ id: string; agentId: string; methodId: string; delta: number; scoreAfter: number }> = []
  let skipped = 0

  for (const result of pending) {
    const version = result.promptVersion
    if (!version || version.runCount < MIN_RUNS_FOR_DELTA) {
      skipped++
      continue
    }

    const scoreAfter = version.avgScore
    const delta      = scoreAfter - result.scoreBefore

    await prisma.learningMethodResult.update({
      where: { id: result.id },
      data:  { scoreAfter, delta },
    })

    // If delta is negative for this version, increment loopsWithoutImprovement
    if (delta < 0) {
      await prisma.promptVersion.update({
        where: { id: result.ruleId },
        data:  { loopsWithoutImprovement: { increment: 1 } },
      }).catch(console.error)
    }

    updated.push({
      id:         result.id,
      agentId:    version.agentId,
      methodId:   result.methodId,
      delta:      Math.round(delta * 100) / 100,
      scoreAfter: Math.round(scoreAfter * 100) / 100,
    })
  }

  return { processed: pending.length, updated, skipped }
}

// POST — run retroactive delta update
export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [deltaResult, rpScore] = await Promise.all([
      runDeltaUpdate(),
      computeRPScore(30),
    ])

    await prisma.auditEvent.create({
      data: {
        action:    'learning_cycle',
        sessionId: 'update-deltas',
        meta: {
          type:         'delta_update',
          processed:    deltaResult.processed,
          updated:      deltaResult.updated.length,
          skipped:      deltaResult.skipped,
          rpScore:      rpScore.rpScore,
          rpTotal:      rpScore.total,
          rpAheadCount: rpScore.aheadOfField,
        },
      },
    }).catch(console.error)

    const alerts: string[] = []
    if (rpScore.rpScore < 0.6 && rpScore.total >= 10) {
      alerts.push(`rp_score_low: ${Math.round(rpScore.rpScore * 100)}% of runs ahead of field consensus — target ≥ 60%`)
    }

    return NextResponse.json({
      ok:   true,
      data: { ...deltaResult, rpScore, alerts },
    })
  } catch (err) {
    console.error('[update-deltas POST]', err)
    return NextResponse.json({ ok: false, error: 'Delta update failed' }, { status: 500 })
  }
}

// GET — method win-rate leaderboard + current RP_score
export async function GET(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [methodLeaderboard, pendingCount, rpScore] = await Promise.all([
      // Group by method, compute avg delta (only scored records — scoreAfter > 0)
      prisma.learningMethodResult.groupBy({
        by:      ['methodId', 'cadence'],
        where:   { scoreAfter: { gt: 0 } },
        _avg:    { delta: true, scoreBefore: true, scoreAfter: true },
        _count:  { id: true },
        orderBy: { _avg: { delta: 'desc' } },
      }),
      prisma.learningMethodResult.count({ where: { scoreAfter: 0 } }),
      computeRPScore(30),
    ])

    return NextResponse.json({
      ok: true,
      data: {
        leaderboard: methodLeaderboard.map(m => ({
          methodId:       m.methodId,
          cadence:        m.cadence,
          scoredRuns:     m._count.id,
          avgDelta:       Math.round((m._avg.delta      ?? 0) * 1000) / 1000,
          avgScoreBefore: Math.round((m._avg.scoreBefore ?? 0) * 10)  / 10,
          avgScoreAfter:  Math.round((m._avg.scoreAfter  ?? 0) * 10)  / 10,
        })),
        pendingScoring: pendingCount,
        rpScore: {
          score:        rpScore.rpScore,
          total:        rpScore.total,
          aheadOfField: rpScore.aheadOfField,
          target:       0.6,
          status:       rpScore.rpScore >= 0.6 ? 'on_target' : rpScore.total < 10 ? 'insufficient_data' : 'below_target',
        },
      },
    })
  } catch (err) {
    console.error('[update-deltas GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to fetch method leaderboard' }, { status: 500 })
  }
}
