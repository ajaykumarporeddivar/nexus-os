/**
 * AAS v4 — Phase 08 Micro Cadence (daily)
 * Method: failure_analysis — find low-scoring runs, improve prompts, track delta.
 *
 * POST /api/learning/cycle  — run the micro cycle (cron or manual)
 * GET  /api/learning/cycle  — list active prompt versions + method performance summary
 *
 * After each cycle: triggers a CR snapshot so mCR is tracked per cadence.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { aiComplete } from '@/lib/ai'
import { brand } from '@/lib/brand'
import {
  computeSQI, computePAcc, computeKPrec, computeEVel, computeLSM, computeCR,
} from '@/lib/crCompute'

const METHOD_ID = 'failure_analysis'
const CADENCE   = 'micro'

// Stagnation threshold: if new avgScore is within STAGNATION_BAND of old, count as no improvement
const STAGNATION_BAND        = 0.15
const QUARANTINE_LOOP_LIMIT  = 6   // loops without improvement → quarantine

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const bearer = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  return !!(secret && (header === secret || bearer === secret))
}

interface ScoreSample { agentId: string; score: number; inputSnippet: string }

async function getRecentScores(since: Date): Promise<ScoreSample[]> {
  const rows = await prisma.execution.findMany({
    where:   { createdAt: { gte: since }, score: { not: null } },
    select:  { phases: true, score: true, inputSnippet: true },
    orderBy: { createdAt: 'desc' },
    take:    50,
  })
  const samples: ScoreSample[] = []
  for (const r of rows) {
    for (const agentId of r.phases) {
      samples.push({ agentId, score: r.score!, inputSnippet: r.inputSnippet })
    }
  }
  return samples
}

async function improvePrompt(agentId: string, samples: ScoreSample[], currentPrompt: string): Promise<string> {
  const avgScore        = samples.reduce((s, x) => s + x.score, 0) / samples.length
  const lowScoreSamples = samples.filter(s => s.score < 7).slice(0, 3)

  const result = await aiComplete({
    system:    `You are a prompt optimization AI for ${brand.name}, an AI delivery platform for digital agencies.`,
    messages:  [{
      role:    'user',
      content: `Agent ID: ${agentId}
Current average quality score: ${avgScore.toFixed(2)}/10
Method: failure_analysis — focus on eliminating failure patterns from low-scoring runs.

Low-scoring inputs (score < 7):
${lowScoreSamples.map(s => `- Score ${s.score}: "${s.inputSnippet.slice(0, 80)}"`).join('\n')}

Current system prompt:
<prompt>
${currentPrompt}
</prompt>

Rewrite the prompt to reduce failures. Focus on:
1. Specific, actionable instructions for the failure patterns above
2. Clearer output format expectations to prevent structural failures
3. Better context awareness for agency/marketing use cases

Return ONLY the improved prompt text, no explanation.`,
    }],
    maxTokens: 1024,
  })

  return result.text.trim() || currentPrompt
}

// Compute and persist a CR snapshot tagged with this cadence
async function snapshotCR(cadence: string): Promise<number> {
  try {
    const since    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const baseline = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [currentExecs, baselineAgg, auditCycles, priorSnap] = await Promise.all([
      prisma.execution.findMany({
        where:  { createdAt: { gte: since } },
        select: { score: true, passed: true, phases: true, createdAt: true },
      }),
      prisma.execution.aggregate({
        where: { createdAt: { gte: baseline, lt: since } },
        _count: { id: true },
      }),
      prisma.auditEvent.findMany({
        where:  { action: 'learning_cycle', createdAt: { gte: baseline } },
        select: { meta: true },
        orderBy: { createdAt: 'desc' },
        take:   20,
      }),
      prisma.cRSnapshot.findFirst({ orderBy: { computedAt: 'desc' } }),
    ])

    const cycleSamples: Array<{ avgScoreBefore: number; avgScoreAfter: number }> = []
    for (const evt of auditCycles) {
      const meta = evt.meta as Record<string, unknown>
      if (Array.isArray(meta?.improved)) {
        for (const item of meta.improved as Array<{ oldAvg?: number; newAvg?: number }>) {
          if (typeof item.oldAvg === 'number' && typeof item.newAvg === 'number') {
            cycleSamples.push({ avgScoreBefore: item.oldAvg, avgScoreAfter: item.newAvg })
          }
        }
      }
    }

    const execSamples = currentExecs.map(e => ({
      score: e.score, passed: e.passed, phases: e.phases, createdAt: e.createdAt,
    }))
    const dims = {
      sqi:   computeSQI(execSamples),
      pAcc:  computePAcc(execSamples),
      kPrec: computeKPrec(execSamples),
      evel:  computeEVel(currentExecs.length, 7, baselineAgg._count.id, 23),
      lsm:   computeLSM(cycleSamples),
    }
    const cr  = computeCR(dims)
    const mCR = priorSnap ? cr - priorSnap.cr : 0

    const regimeRow = await prisma.systemRegime.findFirst({ orderBy: { classifiedAt: 'desc' } }).catch(() => null)

    await prisma.cRSnapshot.create({
      data: {
        loopVersion: (priorSnap?.loopVersion ?? 0) + 1,
        sqi:         Math.round(dims.sqi   * 10000) / 10000,
        pAcc:        Math.round(dims.pAcc  * 10000) / 10000,
        kPrec:       Math.round(dims.kPrec * 10000) / 10000,
        evel:        Math.round(dims.evel  * 10000) / 10000,
        lsm:         Math.round(dims.lsm   * 10000) / 10000,
        cr:          Math.round(cr  * 10000) / 10000,
        mCR:         Math.round(mCR * 10000) / 10000,
        regimeClass: regimeRow?.regimeClass ?? 'unknown',
        cadence,
      },
    })

    return mCR
  } catch (e) {
    console.error('[learning/cycle] CR snapshot failed (non-fatal):', e)
    return 0
  }
}

async function runMicroCycle() {
  const since   = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const samples = await getRecentScores(since)

  if (samples.length < 3) {
    return { skipped: true, reason: 'insufficient_data', sampleCount: samples.length }
  }

  const byAgent = samples.reduce<Record<string, ScoreSample[]>>((acc, s) => {
    ;(acc[s.agentId] ??= []).push(s)
    return acc
  }, {})

  const improved: Array<{ agentId: string; oldAvg: number; newVersionId: string; methodId: string }> = []
  const stagnant: Array<{ agentId: string; loops: number; quarantined: boolean }> = []

  for (const [agentId, agentSamples] of Object.entries(byAgent)) {
    if (agentSamples.length < 2) continue
    const avgScore = agentSamples.reduce((s, x) => s + x.score, 0) / agentSamples.length
    if (avgScore >= 9) continue  // already near-perfect — skip

    const current = await prisma.promptVersion.findFirst({
      where:   { agentId, active: true, quarantined: false },
      orderBy: { createdAt: 'desc' },
    })

    const basePrompt = current?.prompt
      ?? `You are the ${agentId} agent for ${brand.name}. Produce high-quality agency deliverables based on the user's brief.`

    const improvedPrompt = await improvePrompt(agentId, agentSamples, basePrompt)

    // Assess if this is genuinely improved vs current
    const scoreDelta     = current ? (avgScore - current.avgScore) : 0
    const isImprovement  = !current || scoreDelta >= STAGNATION_BAND || current.runCount < 3
    const newLoops       = isImprovement ? 0 : (current?.loopsWithoutImprovement ?? 0) + 1
    const shouldQuarantine = newLoops >= QUARANTINE_LOOP_LIMIT

    if (shouldQuarantine && current) {
      // Phase 10: quarantine stagnant prompt — don't replace, just flag
      await prisma.promptVersion.update({
        where: { id: current.id },
        data:  { quarantined: true, quarantinedAt: new Date(), loopsWithoutImprovement: newLoops },
      })
      stagnant.push({ agentId, loops: newLoops, quarantined: true })
      continue
    }

    // Create improved version
    const newVersion = await prisma.promptVersion.create({
      data: {
        agentId,
        prompt:                 improvedPrompt,
        avgScore:               0,
        runCount:               0,
        active:                 true,
        methodId:               METHOD_ID,
        loopsWithoutImprovement: newLoops,
      },
    })

    if (current) {
      await prisma.promptVersion.update({
        where: { id: current.id },
        data:  { active: false },
      })
    }

    // AAS v4 Phase 08: persist LearningMethodResult for win-rate tracking
    await prisma.learningMethodResult.create({
      data: {
        methodId:    METHOD_ID,
        agentId,
        ruleId:      newVersion.id,
        scoreBefore: current?.avgScore ?? avgScore,
        scoreAfter:  0,
        delta:       0,
        cadence:     CADENCE,
      },
    }).catch(console.error)

    improved.push({ agentId, oldAvg: avgScore, newVersionId: newVersion.id, methodId: METHOD_ID })

    if (!isImprovement && current) {
      await prisma.promptVersion.update({
        where: { id: newVersion.id },
        data:  { loopsWithoutImprovement: newLoops },
      }).catch(console.error)
    }
  }

  return { skipped: false, cycleRan: true, improved, stagnant, sampleCount: samples.length }
}

// POST — run micro cycle (cron or manual)
export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runMicroCycle()
    const mCR    = await snapshotCR(CADENCE)

    const auditMeta = {
      ...result,
      improved: result.skipped ? [] : result.improved,
      cadence:  CADENCE,
      methodId: METHOD_ID,
      mCR,
    }

    await prisma.auditEvent.create({
      data: { action: 'learning_cycle', sessionId: 'cron', meta: auditMeta },
    }).catch(console.error)

    const mCRAlerts: string[] = []
    if (mCR < 0) mCRAlerts.push('mcr_negative: learning system producing diminishing returns — review method effectiveness')

    return NextResponse.json({ ok: true, data: { ...result, mCR, cadence: CADENCE, alerts: mCRAlerts } })
  } catch (err) {
    console.error('[learning/cycle POST]', err)
    return NextResponse.json({ ok: false, error: 'Micro learning cycle failed' }, { status: 500 })
  }
}

// GET — list active prompt versions + per-method win-rate summary
export async function GET(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [activeVersions, methodResults, recentSnapshots] = await Promise.all([
      prisma.promptVersion.findMany({
        where:   { active: true },
        orderBy: { createdAt: 'desc' },
        select:  { id: true, agentId: true, avgScore: true, runCount: true, methodId: true, loopsWithoutImprovement: true, quarantined: true, createdAt: true },
      }),
      // Method win rates: avg delta per method
      prisma.learningMethodResult.groupBy({
        by:      ['methodId', 'cadence'],
        _avg:    { delta: true, scoreBefore: true },
        _count:  { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.cRSnapshot.findMany({
        where:   { cadence: CADENCE },
        orderBy: { computedAt: 'desc' },
        take:    5,
        select:  { cr: true, mCR: true, loopVersion: true, computedAt: true },
      }),
    ])

    const quarantinedCount = await prisma.promptVersion.count({ where: { quarantined: true } })

    return NextResponse.json({
      ok: true,
      data: {
        activeVersions,
        methodPerformance: methodResults.map(r => ({
          methodId: r.methodId,
          cadence:  r.cadence,
          runs:     r._count.id,
          avgDelta: Math.round((r._avg.delta ?? 0) * 1000) / 1000,
          avgScoreBefore: Math.round((r._avg.scoreBefore ?? 0) * 10) / 10,
        })),
        microSnapshots:   recentSnapshots,
        quarantinedCount,
      },
    })
  } catch (err) {
    console.error('[learning/cycle GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to fetch learning state' }, { status: 500 })
  }
}
