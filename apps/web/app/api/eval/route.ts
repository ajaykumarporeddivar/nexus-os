import { NextRequest, NextResponse } from 'next/server'
import { aiComplete } from '@/lib/ai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'
import { brand } from '@/lib/brand'
import { AGENTS } from '@/lib/agentData'
import { EVAL_BRIEFS, type EvalBrief } from '@/lib/evalBriefs'
import { computeFatigueZone, enforceZoneGate } from '@/lib/fatigueZone'
import { killThreshold } from '@/lib/crCompute'
import { computeTimingAdvantage } from '@/lib/timingAdvantage'

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, agency: 2, enterprise: 3 }

// AAS v4 — fetch current regime class (best-effort, falls back to 'unknown')
async function currentRegimeClass(): Promise<string> {
  try {
    const r = await prisma.systemRegime.findFirst({ orderBy: { classifiedAt: 'desc' } })
    return r?.regimeClass ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

// AAS v4 — regime-adjusted kill threshold converted to a 0–10 score floor.
// killThreshold() returns EV/C ratio [0,1]; multiply by 10 for score space,
// then clamp against the brief's own minScore so we never relax below the
// brief author's intent for E-track novelty slots.
function regimeMinScore(briefMinScore: number, regimeClass: string): number {
  const ktX = killThreshold(regimeClass, 'X')  // 0.2–0.6 depending on regime
  const regimeFloor = ktX * 10                  // map to 0–10 score space

  switch (regimeClass) {
    case 'expansion':
      // Expansion: relax by up to 10%, floor still applies
      return Math.max(regimeFloor, briefMinScore * 0.90)
    case 'contraction':
      // Contraction: tighten by 15%, capped at 9.5
      return Math.min(9.5, Math.max(regimeFloor, briefMinScore * 1.15))
    default:
      // Transition / unknown: use brief's own minScore unchanged
      return Math.max(regimeFloor, briefMinScore)
  }
}


// Score a FORGE run output using the QA rubric
const QA_SYSTEM = `You are the NEXUS QA GATE for ${brand.name}. You are a strict, senior technical reviewer hired to catch problems BEFORE client delivery.

Score the FORGE pipeline output on a scale of 0–10 across these dimensions:
- Instruction Clarity (20%): Are instructions specific and actionable? Vague phrases like "handle edge cases" score ≤5.
- Schema Completeness (20%): Are data models, API contracts, and types fully defined with field names, types, and constraints? Missing fields score ≤6.
- Code Quality (25%): Is the code idiomatic, typed, and production-ready? Pseudocode, placeholder comments, or missing imports score ≤5.
- Security Posture (15%): Are auth, input validation, and data handling explicitly addressed? Missing auth on mutations scores ≤4.
- Test Coverage (10%): Are test cases specific with inputs/outputs defined? "Write tests for X" without examples scores ≤4.
- Deliverability (10%): Could a mid-level dev ship this to a real client today without asking questions? Incomplete = ≤5.

Calibration anchors:
- 9–10: Genuinely production-ready, no gaps, a developer could ship it unchanged
- 7–8: Minor gaps, needs 1–2 hours of polish before delivery
- 5–6: Structural scaffolding present but significant work remains
- 3–4: High-level plan only, no implementation detail
- 1–2: Generic AI output with no client-specific adaptation

Be critical. A score above 8.5 should be rare and only for truly exceptional output.
Respond with ONLY a JSON object in this exact format:
{"overall": 8.5, "dimensions": {"clarity": 9, "schema": 8, "code": 9, "security": 8, "tests": 8, "delivery": 8.5}, "verdict": "APPROVED", "gaps": ["gap1", "gap2"]}`

// Run one agent phase, return output + token count
async function runAgent(
  agentId: string,
  brief: string,
  previousOutputs: string,
): Promise<{ output: string; tokens: number }> {
  const agentMeta = AGENTS.find(a => a.id === agentId)

  // Fetch active prompt version from DB if available
  const activeVersion = await prisma.promptVersion.findFirst({
    where: { agentId, active: true },
    select: { prompt: true },
  }).catch(() => null)

  const systemPrompt = activeVersion?.prompt
    ?? `You are the ${agentMeta?.name ?? agentId} agent for ${brand.name}, an AI delivery platform.
Role: ${agentMeta?.role ?? 'Produce high-quality agency deliverables.'}
Context: You are part of the 21-agent NEXUS pipeline. Previous agents have already produced context shown below.
Instructions:
- Be specific, production-ready, and agency-appropriate
- Use the client brief to tailor every output
- Output clean, structured deliverables — no filler or preamble`

  const userMessage = `CLIENT BRIEF:\n${brief}\n\nPREVIOUS PIPELINE OUTPUT:\n${previousOutputs || '(first agent — no prior output)'}\n\nProduce your deliverable for phase: ${agentMeta?.role ?? agentId}`

  const result = await aiComplete({
    system:    systemPrompt,
    messages:  [{ role: 'user', content: userMessage }],
    maxTokens: 2048,
  })

  return { output: result.text, tokens: result.tokens ?? 0 }
}

// Score the full run output
async function scoreRun(combined: string): Promise<{ score: number; gaps: string[] }> {
  try {
    const result = await aiComplete({
      system:    QA_SYSTEM,
      messages:  [{ role: 'user', content: `FORGE RUN OUTPUT:\n${combined.slice(0, 12000)}` }],
      maxTokens: 512,
      fastMode:  true,
    })
    const parsed = JSON.parse(result.text.trim())
    return { score: Number(parsed.overall) ?? 0, gaps: parsed.gaps ?? [] }
  } catch {
    return { score: 0, gaps: ['scoring_failed'] }
  }
}

async function runEval(brief: EvalBrief, regimeClass: string, fatigueZone: string): Promise<{
  briefId: string; score: number; tokens: number; phases: string[]; passed: boolean; gaps: string[]
  effectiveMinScore: number; regimeClass: string; fatigueZone: string
}> {
  const PHASES = ['analyst', 'architect', 'planner', 'test-writer', 'builder', 'security', 'db-opt', 'qa']
  const outputs: Record<string, string> = {}
  let totalTokens = 0
  const phases: string[] = []

  for (const agentId of PHASES) {
    const previousContext = Object.entries(outputs)
      .map(([id, out]) => `=== ${id.toUpperCase()} ===\n${out.slice(0, 800)}`)
      .join('\n\n')

    try {
      const { output, tokens } = await runAgent(agentId, brief.brief, previousContext)
      outputs[agentId] = output
      totalTokens += tokens
      phases.push(agentId)
    } catch (err) {
      console.error(`[eval] agent ${agentId} failed:`, err)
      break
    }
  }

  const combined = Object.entries(outputs)
    .map(([id, out]) => `=== ${id.toUpperCase()} ===\n${out}`)
    .join('\n\n')

  const { score, gaps } = await scoreRun(combined)

  // AAS v4 Phase 03: regime-adjusted kill threshold replaces static minScore
  const effectiveMinScore = regimeMinScore(brief.minScore, regimeClass)
  const passed = phases.length >= brief.expectedPhases && score >= effectiveMinScore

  // AAS v4 Phase 02: causalMechanism — derive from brief (never null per AAS kill gate)
  const causalMechanism = brief.brief.split('\n').find(l => l.trim().length > 20)?.trim()
    ?? `${brief.client} requires automated ${brief.id} delivery`

  // AAS v4 Phase 06: timing advantage for this eval run
  const { timingAdv } = await computeTimingAdvantage(phases).catch(() => ({ timingAdv: 0.5 }))

  // Persist to Execution table so learning cycle can read it
  await prisma.execution.create({
    data: {
      sessionId:       `eval:${brief.id}`,
      inputSnippet:    brief.brief.slice(0, 500),
      clientName:      brief.client,
      phases,
      tokens:          totalTokens,
      calls:           phases.length + 1,
      score,
      passed,
      status:          passed ? 'APPROVED' : 'NEEDS_REVISION',
      fileCount:       phases.length,
      fatigueZone,
      attributionConf: score / 10,
      irreversible:    false,
      timingAdv,       // AAS v4 Phase 06
    },
  })

  // Update PromptVersion.avgScore + runCount for each agent
  for (const agentId of phases) {
    const current = await prisma.promptVersion.findFirst({
      where: { agentId, active: true },
      select: { id: true, avgScore: true, runCount: true },
    }).catch(() => null)

    if (current) {
      const newRunCount = current.runCount + 1
      const newAvgScore = ((current.avgScore * current.runCount) + score) / newRunCount
      await prisma.promptVersion.update({
        where: { id: current.id },
        data: { avgScore: Math.round(newAvgScore * 100) / 100, runCount: newRunCount },
      }).catch(console.error)
    } else {
      // Create a baseline PromptVersion record so the editor shows real scores
      await prisma.promptVersion.create({
        data: {
          agentId,
          prompt: `You are the ${agentId} agent for ${brand.name}. Produce high-quality agency deliverables.`,
          avgScore: score,
          runCount: 1,
          active: true,
        },
      }).catch(console.error)
    }
  }

  return { briefId: brief.id, score, tokens: totalTokens, phases, passed, gaps, effectiveMinScore, regimeClass, fatigueZone }
}

// GET — status/list of eval briefs
export async function GET() {
  const executions = await prisma.execution.findMany({
    where: { sessionId: { startsWith: 'eval:' } },
    select: { sessionId: true, score: true, passed: true, phases: true, tokens: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  }).catch(() => [])

  const ran = new Set(executions.map(e => e.sessionId.replace('eval:', '')))

  return NextResponse.json({
    ok: true,
    data: {
      briefs: EVAL_BRIEFS.map(b => ({
        id: b.id,
        client: b.client,
        expectedPhases: b.expectedPhases,
        minScore: b.minScore,
        ran: ran.has(b.id),
        lastRun: executions.find(e => e.sessionId === `eval:${b.id}`) ?? null,
      })),
      totalRan: ran.size,
      avgScore: executions.length
        ? Math.round(executions.reduce((s, e) => s + (e.score ?? 0), 0) / executions.length * 10) / 10
        : null,
    },
  })
}

// POST — run one or all eval briefs
export async function POST(req: NextRequest) {
  const secret     = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET
  const validCron  = !!(cronSecret && secret === cronSecret)

  // Also accept authenticated sessions with agency+ plan (or admin)
  let validSession = false
  if (!validCron) {
    const session = await getServerSession(authOptions)
    const plan    = (session?.user as { plan?: string; isAdmin?: boolean } | undefined)
    const isAdmin = plan?.isAdmin ?? false
    const rank    = PLAN_RANK[plan?.plan ?? 'free'] ?? 0
    validSession  = isAdmin || rank >= PLAN_RANK.agency
  }

  if (!validCron && !validSession) {
    return NextResponse.json({ ok: false, error: 'Unauthorized — Agency+ plan or CRON_SECRET required' }, { status: 401 })
  }

  const { briefId, runAll } = await req.json().catch(() => ({}))

  // AAS v4 Phase 05 — fatigue zone gate (hard stop, no override)
  const plan       = (await getServerSession(authOptions).catch(() => null))
    ?.user as { plan?: string } | undefined
  const planStr    = plan?.plan ?? 'free'
  const fatigue    = await computeFatigueZone(planStr)
  const zoneBlock  = enforceZoneGate(fatigue, false)  // eval runs are reversible
  if (zoneBlock) {
    return NextResponse.json({
      ok:    false,
      error: `AAS v4 fatigue gate: ${zoneBlock.zone} zone — ${zoneBlock.reason}`,
      code:  `fatigue_${zoneBlock.zone}`,
      aas:   { fatigueZone: fatigue.zone, metrics: fatigue.metrics },
    }, { status: 429 })
  }

  // AAS v4 Phase 01 — fetch current regime for dynamic kill threshold
  const regimeClass = await currentRegimeClass()

  const briefs = runAll
    ? EVAL_BRIEFS
    : EVAL_BRIEFS.filter(b => b.id === briefId)

  if (briefs.length === 0) {
    return NextResponse.json({ ok: false, error: 'No matching brief' }, { status: 404 })
  }

  const results = []
  for (const brief of briefs) {
    try {
      const result = await runEval(brief, regimeClass, fatigue.zone)
      results.push({ ...result, ok: true })
    } catch (err) {
      results.push({ briefId: brief.id, ok: false, error: err instanceof Error ? err.message : 'Failed' })
    }
  }

  await prisma.auditEvent.create({
    data: {
      action: 'learning_cycle',
      sessionId: 'eval-harness',
      meta: {
        results,
        briefs:      briefs.map(b => b.id),
        regimeClass,
        fatigueZone: fatigue.zone,
        fatigueMetrics: fatigue.metrics,
      },
    },
  }).catch(console.error)

  return NextResponse.json({ ok: true, data: { results } })
}
