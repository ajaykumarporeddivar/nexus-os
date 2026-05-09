/**
 * AAS v4 — Phase 01: Regime Classification
 *
 * GET  /api/regime  — current regime + last 5 CR snapshots
 * POST /api/regime  — re-classify regime now (cron or manual with secret)
 *
 * Regime drives all dynamic thresholds downstream:
 *   expansion   → pipeline cap 7, kill floor EV/C ≥ 0.2
 *   transition  → pipeline cap 3, kill floor EV/C ≥ 0.35
 *   contraction → pipeline cap 1, kill floor EV/C ≥ 0.6
 *   unknown     → transition rules, velocity –50%, human review before irreversible
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  computeSQI,
  computePAcc,
  computeKPrec,
  computeEVel,
  computeLSM,
  computeCR,
  classifyRegime,
  killThreshold,
  pipelineCap,
  exploreRatio,
  type CRDimensions,
} from '@/lib/crCompute'
import { computeFatigueZone } from '@/lib/fatigueZone'

function authCheck(req: NextRequest): boolean {
  const secret      = process.env.CRON_SECRET
  const header      = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const bearer      = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  return !!(secret && (header === secret || bearer === secret))
}

// GET — current regime + last 5 CR snapshots + derived thresholds + fatigue zone
export async function GET() {
  try {
    const [latestRegime, recentSnapshots, fatigueState] = await Promise.all([
      prisma.systemRegime.findFirst({ orderBy: { classifiedAt: 'desc' } }),
      prisma.cRSnapshot.findMany({ orderBy: { computedAt: 'desc' }, take: 5 }),
      computeFatigueZone('agency'),  // use agency as a representative cap for dashboard display
    ])

    const regime      = latestRegime?.regimeClass ?? 'unknown'
    const loopVersion = recentSnapshots[0]?.loopVersion ?? 1

    return NextResponse.json({
      ok: true,
      data: {
        current: latestRegime ?? {
          regimeClass:   'unknown',
          confidence:    0.3,
          triggerSource: 'default',
          indicators:    {},
          classifiedAt:  new Date().toISOString(),
        },
        snapshots: recentSnapshots,
        // AAS v4 policy parameters derived from current regime
        policy: {
          killThresholdE: killThreshold(regime, 'E'),
          killThresholdX: killThreshold(regime, 'X'),
          pipelineCap:    pipelineCap(regime),
          exploreRatio:   exploreRatio(regime, loopVersion),
          loopVersion,
        },
        // AAS v4 Phase 05 — current fatigue zone state
        fatigue: {
          zone:    fatigueState.zone,
          reason:  fatigueState.reason,
          metrics: fatigueState.metrics,
        },
      },
    })
  } catch (err) {
    console.error('[regime GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to fetch regime' }, { status: 500 })
  }
}

// POST — classify current regime from live execution data + persist CR snapshot
export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body       = await req.json().catch(() => ({}))
    const trigger    = (body.trigger as string) ?? 'scheduled'
    const windowDays = 7
    const since      = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    const baseline   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // Fetch execution data for current window + 30d baseline
    const [currentExecs, baselineExecs, recentAuditCycles, priorSnapshot] = await Promise.all([
      prisma.execution.findMany({
        where:  { createdAt: { gte: since } },
        select: { score: true, passed: true, phases: true, createdAt: true },
      }),
      prisma.execution.aggregate({
        where:  { createdAt: { gte: baseline, lt: since } },
        _count: { id: true },
      }),
      // Learning cycles that ran — used for LSM
      prisma.auditEvent.findMany({
        where:  { action: 'learning_cycle', createdAt: { gte: baseline } },
        select: { meta: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.cRSnapshot.findFirst({ orderBy: { computedAt: 'desc' } }),
    ])

    // Build execution samples for CR dimensions
    const execSamples = currentExecs.map(e => ({
      score:     e.score,
      passed:    e.passed,
      phases:    e.phases,
      createdAt: e.createdAt,
    }))

    // Extract learning cycle score deltas from audit meta (best-effort)
    const cycleSamples: Array<{ avgScoreBefore: number; avgScoreAfter: number }> = []
    for (const evt of recentAuditCycles) {
      const meta = evt.meta as Record<string, unknown>
      if (Array.isArray(meta?.improved)) {
        for (const item of meta.improved as Array<{ oldAvg?: number; newAvg?: number }>) {
          if (typeof item.oldAvg === 'number' && typeof item.newAvg === 'number') {
            cycleSamples.push({ avgScoreBefore: item.oldAvg, avgScoreAfter: item.newAvg })
          }
        }
      }
    }

    // Compute 5 CR dimensions
    const dims: CRDimensions = {
      sqi:   computeSQI(execSamples),
      pAcc:  computePAcc(execSamples),
      kPrec: computeKPrec(execSamples),
      evel:  computeEVel(
        currentExecs.length,
        windowDays,
        baselineExecs._count.id,
        23,  // 30d minus current 7d window
      ),
      lsm:   computeLSM(cycleSamples),
    }
    const cr  = computeCR(dims)
    const mCR = priorSnapshot ? cr - priorSnapshot.cr : 0
    const loopVersion = (priorSnapshot?.loopVersion ?? 0) + 1

    // Compute regime classification indicators
    const baselineRate  = baselineExecs._count.id / 23
    const maxRate       = Math.max(baselineRate, 1)
    const currentRate   = currentExecs.length / windowDays

    // Trend slope: compare first-half vs second-half of window
    const midPoint = new Date(Date.now() - (windowDays / 2) * 24 * 60 * 60 * 1000)
    const firstHalf  = currentExecs.filter(e => e.createdAt < midPoint).length
    const secondHalf = currentExecs.filter(e => e.createdAt >= midPoint).length
    const total      = firstHalf + secondHalf || 1
    const trendSlope = (secondHalf - firstHalf) / total  // [-1, 1]

    const anomalyRate   = execSamples.length > 0
      ? execSamples.filter(e => e.phases.length < 4 || e.passed === false).length / execSamples.length
      : 0
    const signalDensity = Math.min(1, currentRate / Math.max(maxRate, 1))

    const indicators = { signalDensity, trendSlope, anomalyRate, crDelta: mCR }
    const { regimeClass, confidence } = classifyRegime(indicators)

    // Persist both regime and CR snapshot in parallel
    const [regime, snapshot] = await Promise.all([
      prisma.systemRegime.create({
        data: {
          regimeClass,
          confidence,
          triggerSource: trigger,
          indicators,
        },
      }),
      prisma.cRSnapshot.create({
        data: {
          loopVersion,
          sqi:   Math.round(dims.sqi   * 10000) / 10000,
          pAcc:  Math.round(dims.pAcc  * 10000) / 10000,
          kPrec: Math.round(dims.kPrec * 10000) / 10000,
          evel:  Math.round(dims.evel  * 10000) / 10000,
          lsm:   Math.round(dims.lsm   * 10000) / 10000,
          cr:    Math.round(cr  * 10000) / 10000,
          mCR:   Math.round(mCR * 10000) / 10000,
          regimeClass,
        },
      }),
    ])

    await prisma.auditEvent.create({
      data: {
        action:    'regime_classify',
        sessionId: 'regime-cron',
        meta: {
          regimeClass,
          confidence,
          cr,
          mCR,
          loopVersion,
          trigger,
          indicators,
          dims: { ...dims },  // spread to satisfy Prisma JsonObject index signature
        },
      },
    }).catch(console.error)

    // CR health alerts
    const crAlerts: string[] = []
    if (cr < 0.95)  crAlerts.push('cr_red: CR below 0.95 — Phase 09 audit triggered if persists for 2 loops')
    if (mCR < 0)    crAlerts.push('mcr_negative: mCR negative — monitor learning method effectiveness')
    if (regimeClass === 'contraction') crAlerts.push('regime_contraction: graceful degradation mode active')
    if (regimeClass === 'unknown')     crAlerts.push('regime_unknown: default to transition rules, human review required before irreversible actions')

    return NextResponse.json({
      ok: true,
      data: {
        regime,
        snapshot,
        dims,
        policy: {
          killThresholdE: killThreshold(regimeClass, 'E'),
          killThresholdX: killThreshold(regimeClass, 'X'),
          pipelineCap:    pipelineCap(regimeClass),
          exploreRatio:   exploreRatio(regimeClass, loopVersion),
          loopVersion,
        },
        alerts: crAlerts,
      },
    })
  } catch (err) {
    console.error('[regime POST]', err)
    return NextResponse.json({ ok: false, error: 'Regime classification failed' }, { status: 500 })
  }
}
