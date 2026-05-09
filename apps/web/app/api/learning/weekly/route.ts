/**
 * AAS v4 — Phase 08 Weekly Cadence
 * Method: success_deconstruction — extract patterns from high-scoring runs,
 * inject winning patterns into active prompts rather than fixing failures.
 *
 * POST /api/learning/weekly — run weekly cadence (cron or manual with secret)
 * GET  /api/learning/weekly — last 4 weekly cycle summaries
 *
 * Complements the daily failure_analysis cycle:
 *   Daily  → eliminate failure modes
 *   Weekly → amplify success patterns
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { aiComplete } from '@/lib/ai'
import { brand } from '@/lib/brand'
import {
  computeSQI, computePAcc, computeKPrec, computeEVel, computeLSM, computeCR,
} from '@/lib/crCompute'

const METHOD_ID = 'success_deconstruction'
const CADENCE   = 'weekly'
const HIGH_SCORE_THRESHOLD = 8.5  // only runs this good feed the success analysis

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const bearer = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  return !!(secret && (header === secret || bearer === secret))
}

interface HighScoreSample { agentId: string; score: number; inputSnippet: string }

async function getHighScoreSamples(since: Date): Promise<HighScoreSample[]> {
  const rows = await prisma.execution.findMany({
    where:   { createdAt: { gte: since }, score: { gte: HIGH_SCORE_THRESHOLD }, passed: true },
    select:  { phases: true, score: true, inputSnippet: true },
    orderBy: { score: 'desc' },
    take:    30,
  })
  const samples: HighScoreSample[] = []
  for (const r of rows) {
    for (const agentId of r.phases) {
      samples.push({ agentId, score: r.score!, inputSnippet: r.inputSnippet })
    }
  }
  return samples
}

async function deconstructSuccess(
  agentId:       string,
  samples:       HighScoreSample[],
  currentPrompt: string,
): Promise<string> {
  const avgScore  = samples.reduce((s, x) => s + x.score, 0) / samples.length
  const topInputs = samples.slice(0, 5)

  const result = await aiComplete({
    system:    `You are a prompt optimization AI for ${brand.name}, an AI delivery platform for digital agencies.`,
    messages:  [{
      role:    'user',
      content: `Agent ID: ${agentId}
Method: success_deconstruction — amplify what's working, not what's failing.
Average score of winning runs: ${avgScore.toFixed(2)}/10 (threshold ≥${HIGH_SCORE_THRESHOLD})

High-scoring inputs that this agent handled well:
${topInputs.map(s => `- Score ${s.score.toFixed(1)}: "${s.inputSnippet.slice(0, 100)}"`).join('\n')}

Current system prompt:
<prompt>
${currentPrompt}
</prompt>

Task: Identify the patterns that made these inputs succeed and reinforce them in the prompt.
Focus on:
1. What kinds of specificity or context made these inputs easy to handle well?
2. What output characteristics score highest across these winning runs?
3. Strengthen the prompt to consistently produce outputs of this quality.

Return ONLY the improved prompt text, no explanation.`,
    }],
    maxTokens: 1024,
  })

  return result.text.trim() || currentPrompt
}

// Cross-agent pattern analysis: identify which agent combinations produce top results
async function analyzeCrossAgentPatterns(since: Date): Promise<{
  topCombinations: Array<{ phases: string[]; avgScore: number; count: number }>
}> {
  const topRuns = await prisma.execution.findMany({
    where:   { createdAt: { gte: since }, score: { gte: HIGH_SCORE_THRESHOLD } },
    select:  { phases: true, score: true },
    orderBy: { score: 'desc' },
    take:    20,
  })

  // Group by phase combination fingerprint
  const combMap: Record<string, { scores: number[]; phases: string[] }> = {}
  for (const run of topRuns) {
    const key = run.phases.sort().join(',')
    if (!combMap[key]) combMap[key] = { scores: [], phases: run.phases }
    combMap[key].scores.push(run.score ?? 0)
  }

  const topCombinations = Object.values(combMap)
    .map(v => ({
      phases:   v.phases,
      avgScore: Math.round((v.scores.reduce((a, b) => a + b, 0) / v.scores.length) * 10) / 10,
      count:    v.scores.length,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 5)

  return { topCombinations }
}

async function snapshotCR(cadence: string): Promise<number> {
  try {
    const since    = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000)
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
        sqi:   Math.round(dims.sqi   * 10000) / 10000,
        pAcc:  Math.round(dims.pAcc  * 10000) / 10000,
        kPrec: Math.round(dims.kPrec * 10000) / 10000,
        evel:  Math.round(dims.evel  * 10000) / 10000,
        lsm:   Math.round(dims.lsm   * 10000) / 10000,
        cr:    Math.round(cr  * 10000) / 10000,
        mCR:   Math.round(mCR * 10000) / 10000,
        regimeClass: regimeRow?.regimeClass ?? 'unknown',
        cadence,
      },
    })
    return mCR
  } catch (e) {
    console.error('[learning/weekly] CR snapshot failed (non-fatal):', e)
    return 0
  }
}

async function runWeeklyCycle() {
  const since   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const samples = await getHighScoreSamples(since)

  if (samples.length < 3) {
    return { skipped: true, reason: 'insufficient_high_score_data', sampleCount: samples.length, threshold: HIGH_SCORE_THRESHOLD }
  }

  const byAgent = samples.reduce<Record<string, HighScoreSample[]>>((acc, s) => {
    ;(acc[s.agentId] ??= []).push(s)
    return acc
  }, {})

  const [crossAgent] = await Promise.all([
    analyzeCrossAgentPatterns(since),
  ])

  const improved: Array<{ agentId: string; oldAvg: number; newVersionId: string }> = []

  for (const [agentId, agentSamples] of Object.entries(byAgent)) {
    if (agentSamples.length < 2) continue

    const current = await prisma.promptVersion.findFirst({
      where:   { agentId, active: true, quarantined: false },
      orderBy: { createdAt: 'desc' },
    })

    // Only run success_deconstruction if agent has room to improve
    const avgScore = agentSamples.reduce((s, x) => s + x.score, 0) / agentSamples.length
    if (current && current.avgScore >= 9.2) continue  // already near ceiling

    const basePrompt = current?.prompt
      ?? `You are the ${agentId} agent for ${brand.name}. Produce high-quality agency deliverables.`

    const improvedPrompt = await deconstructSuccess(agentId, agentSamples, basePrompt)

    const newVersion = await prisma.promptVersion.create({
      data: {
        agentId,
        prompt:                  improvedPrompt,
        avgScore:                0,
        runCount:                0,
        active:                  true,
        methodId:                METHOD_ID,
        loopsWithoutImprovement: 0,
      },
    })

    if (current) {
      await prisma.promptVersion.update({
        where: { id: current.id },
        data:  { active: false },
      })
    }

    await prisma.learningMethodResult.create({
      data: {
        methodId:   METHOD_ID,
        agentId,
        ruleId:     newVersion.id,
        scoreBefore: current?.avgScore ?? avgScore,
        scoreAfter:  0,
        delta:       0,
        cadence:     CADENCE,
      },
    }).catch(console.error)

    improved.push({ agentId, oldAvg: avgScore, newVersionId: newVersion.id })
  }

  return {
    skipped:          false,
    cycleRan:         true,
    improved,
    sampleCount:      samples.length,
    crossAgentInsights: crossAgent.topCombinations,
  }
}

// POST — run weekly cadence
export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runWeeklyCycle()
    const mCR    = await snapshotCR(CADENCE)

    await prisma.auditEvent.create({
      data: {
        action:    'learning_cycle',
        sessionId: 'cron-weekly',
        meta: { ...result, improved: result.skipped ? [] : result.improved, cadence: CADENCE, methodId: METHOD_ID, mCR },
      },
    }).catch(console.error)

    const alerts: string[] = []
    if (mCR < 0) alerts.push('mcr_negative: success_deconstruction not improving CR — consider anomaly_review method')

    return NextResponse.json({ ok: true, data: { ...result, mCR, cadence: CADENCE, alerts } })
  } catch (err) {
    console.error('[learning/weekly POST]', err)
    return NextResponse.json({ ok: false, error: 'Weekly learning cycle failed' }, { status: 500 })
  }
}

// GET — last 4 weekly cycle audit entries + method comparison
export async function GET(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [weeklyAudits, weeklySnapshots, methodComparison] = await Promise.all([
      prisma.auditEvent.findMany({
        where:   { action: 'learning_cycle', sessionId: 'cron-weekly' },
        orderBy: { createdAt: 'desc' },
        take:    4,
        select:  { meta: true, createdAt: true },
      }),
      prisma.cRSnapshot.findMany({
        where:   { cadence: CADENCE },
        orderBy: { computedAt: 'desc' },
        take:    4,
        select:  { cr: true, mCR: true, loopVersion: true, computedAt: true },
      }),
      // Compare method win rates: failure_analysis vs success_deconstruction
      prisma.learningMethodResult.groupBy({
        by:      ['methodId'],
        _avg:    { delta: true },
        _count:  { id: true },
        orderBy: { _avg: { delta: 'desc' } },
      }),
    ])

    return NextResponse.json({
      ok: true,
      data: {
        recentCycles:  weeklyAudits,
        crSnapshots:   weeklySnapshots,
        methodWinRates: methodComparison.map(m => ({
          methodId: m.methodId,
          runs:     m._count.id,
          avgDelta: Math.round((m._avg.delta ?? 0) * 1000) / 1000,
        })),
      },
    })
  } catch (err) {
    console.error('[learning/weekly GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to fetch weekly learning state' }, { status: 500 })
  }
}
