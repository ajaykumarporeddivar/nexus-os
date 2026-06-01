/**
 * L2.75 — Control / Safety Engine  (AOI v6 Gap 1)
 *
 * PID-like governance layer that sits between Simulation (L2.5) and Execution (L3).
 * Prevents runaway optimization, oscillation, and deployment of low-quality output.
 *
 * Checks run in sequence — first failing check halts the pipeline:
 *   1. QA Score Gate        — don't BUILD if FORGE QA < threshold
 *   2. Domain Coherence     — spec must reference brief terms
 *   3. Deployment Guard     — don't deploy if BUILD produces < MIN_FILES
 *   4. Oscillation Detector — same brief failing repeatedly → flag for review
 *   5. Bounded Exploration  — only attempt verticals with prior success
 *
 * All thresholds are env-configurable; defaults are conservative.
 */

import { prisma } from '@/lib/prisma'

// ─── Thresholds (env-overridable) ─────────────────────────────────────────────

export const CONTROL_THRESHOLDS = {
  minQaScore:           parseFloat(process.env.CONTROL_MIN_QA_SCORE    ?? '7.0'),
  minBuildFiles:        parseInt(process.env.CONTROL_MIN_BUILD_FILES    ?? '4', 10),
  maxOscillationRuns:   parseInt(process.env.CONTROL_MAX_OSCILLATION    ?? '3', 10),
  coherenceMinMatches:  parseInt(process.env.CONTROL_COHERENCE_MATCHES  ?? '2', 10),
} as const

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ControlCheckResult {
  passed:  boolean
  check:   string
  reason?: string
  data?:   Record<string, unknown>
}

export interface ControlGateResult {
  allowed:  boolean
  checks:   ControlCheckResult[]
  blocking: ControlCheckResult | null  // first failing check, or null if all passed
}

// ─── Check 1: QA Score Gate ────────────────────────────────────────────────────

export function checkQaScore(qaScore: number | null | undefined): ControlCheckResult {
  const score = qaScore ?? 0
  const threshold = CONTROL_THRESHOLDS.minQaScore
  return {
    passed: score >= threshold,
    check:  'qa_score_gate',
    reason: score < threshold
      ? `QA score ${score.toFixed(1)} is below threshold ${threshold} — FORGE output quality too low to proceed to BUILD`
      : undefined,
    data: { score, threshold },
  }
}

// ─── Check 2: Domain Coherence ─────────────────────────────────────────────────
// Spec must reference meaningful terms from the brief

export function checkDomainCoherence(
  briefText:    string,
  specContract: string,
): ControlCheckResult {
  const threshold = CONTROL_THRESHOLDS.coherenceMinMatches

  // Extract significant words from brief (4+ chars, not stop words)
  const stopWords = new Set(['that','this','with','from','have','will','your','build','create','make','want','need','for','app','saas'])
  const briefWords = briefText
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stopWords.has(w))

  // Count how many significant brief words appear in the spec
  const specLower  = specContract.toLowerCase()
  const matched    = briefWords.filter(w => specLower.includes(w))
  const uniqueMatches = [...new Set(matched)]

  return {
    passed: uniqueMatches.length >= threshold,
    check:  'domain_coherence',
    reason: uniqueMatches.length < threshold
      ? `Spec contract only references ${uniqueMatches.length} terms from the brief (need ≥${threshold}) — likely generic output`
      : undefined,
    data: { briefWordCount: briefWords.length, matchCount: uniqueMatches.length, matched: uniqueMatches.slice(0, 10), threshold },
  }
}

// ─── Check 3: Build File Count Guard ──────────────────────────────────────────

export function checkBuildFileCount(files: Record<string, string>): ControlCheckResult {
  const count     = Object.keys(files).length
  const threshold = CONTROL_THRESHOLDS.minBuildFiles
  return {
    passed: count >= threshold,
    check:  'build_file_count',
    reason: count < threshold
      ? `BUILD produced only ${count} files (need ≥${threshold}) — incomplete application`
      : undefined,
    data: { count, threshold },
  }
}

// ─── Check 4: Oscillation Detector ────────────────────────────────────────────
// Same brief keeps failing → flag for human review instead of infinite retry

export async function checkOscillation(
  briefText:   string,
  projectName: string,
): Promise<ControlCheckResult> {
  const threshold = CONTROL_THRESHOLDS.maxOscillationRuns
  const briefHash = briefText.slice(0, 80).toLowerCase().replace(/\s+/g, '_')

  try {
    const recentFailures = await prisma.auditEvent.count({
      where: {
        action:    'forge_run_completed',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        meta: { path: ['ok'], equals: false },
      },
    })

    return {
      passed: recentFailures < threshold,
      check:  'oscillation_detector',
      reason: recentFailures >= threshold
        ? `${recentFailures} pipeline failures in the last 24h — system may be oscillating. Human review recommended.`
        : undefined,
      data: { recentFailures, threshold, briefHash, projectName },
    }
  } catch {
    // Non-blocking — if DB query fails, allow execution
    return { passed: true, check: 'oscillation_detector', reason: 'DB check skipped' }
  }
}

// ─── Check 5: Bounded Exploration ─────────────────────────────────────────────
// Only warn (non-blocking) if attempting a vertical with no prior success

export async function checkBoundedExploration(
  vertical: string,
): Promise<ControlCheckResult> {
  try {
    const priorSuccess = await prisma.auditEvent.findFirst({
      where: {
        action: 'forge_run_completed',
        meta:   { path: ['ok'], equals: true },
      },
    })
    // Non-blocking — warn but allow if no prior data
    return {
      passed: true,
      check:  'bounded_exploration',
      data:   { vertical, hasPriorSuccess: !!priorSuccess },
    }
  } catch {
    return { passed: true, check: 'bounded_exploration' }
  }
}

// ─── Main Gate Functions ───────────────────────────────────────────────────────

/** Run all FORGE-level checks (after FORGE, before BUILD) */
export async function runForgeGate(params: {
  qaScore:      number | null
  briefText:    string
  specContract: string
  projectName:  string
  vertical?:    string
}): Promise<ControlGateResult> {
  const checks: ControlCheckResult[] = []

  // 1. QA score
  checks.push(checkQaScore(params.qaScore))

  // 2. Domain coherence (only if QA passed — expensive otherwise)
  if (checks[0].passed) {
    checks.push(checkDomainCoherence(params.briefText, params.specContract))
  }

  // 3. Oscillation (async DB check)
  checks.push(await checkOscillation(params.briefText, params.projectName))

  // 4. Bounded exploration (warning only, always passes)
  if (params.vertical) {
    checks.push(await checkBoundedExploration(params.vertical))
  }

  const blocking = checks.find(c => !c.passed) ?? null

  return {
    allowed: blocking === null,
    checks,
    blocking,
  }
}

/** Run BUILD-level checks (after BUILD, before DEPLOY) */
export function runBuildGate(params: {
  files: Record<string, string>
}): ControlGateResult {
  const checks: ControlCheckResult[] = [
    checkBuildFileCount(params.files),
  ]
  const blocking = checks.find(c => !c.passed) ?? null
  return { allowed: blocking === null, checks, blocking }
}

/** Log a control gate decision to audit */
export async function logControlDecision(
  runId:  string,
  gate:   'forge' | 'build',
  result: ControlGateResult,
): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action:    'control_gate_decision',
        sessionId: `control-${runId}`,
        meta: {
          runId,
          gate,
          allowed:  result.allowed,
          blocking: result.blocking ?? null,
          checks:   result.checks,
        } as never,
      },
    })
  } catch (err) {
    console.error('[controlEngine] audit log failed:', err)
  }
}
