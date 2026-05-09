/**
 * AAS v4 — Phase 06: Timing Advantage (RP_score)
 *
 * RP_score = Relative Position: % of signals acted on before field consensus.
 * Target: ≥ 60% of actions precede field consensus.
 *
 * For each execution, timingAdv measures whether it occurred before or after
 * similar executions (same phase pattern) accumulated in the system.
 *
 *   1.0 = pioneer  — first run of this type in the last 7 days
 *   0.7 = early    — fewer than 3 similar runs exist
 *   0.5 = consensus — moderate adoption (field consensus forming)
 *   0.1 = late mover — ≥ 10 similar runs already done
 *
 * AAS v4 rule: if saturation_index > 0.8, reclassify from "advantage" to "hygiene" —
 * execution proceeds but no pipeline priority.
 */

import { prisma } from '@/lib/prisma'

// "Field consensus" saturation point: 10 similar runs = fully saturated market
const CONSENSUS_THRESHOLD = 10

export async function computeTimingAdvantage(phases: string[]): Promise<{
  timingAdv:       number
  similarCount:    number
  classification:  'pioneer' | 'early' | 'consensus' | 'late_mover'
  isHygiene:       boolean   // true when saturation > 0.8 (advantage → hygiene)
}> {
  if (phases.length === 0) {
    return { timingAdv: 0.5, similarCount: 0, classification: 'consensus', isHygiene: false }
  }

  // Canonical fingerprint: sorted phase set as a string
  // Two executions are "similar" if they share the same set of agents
  const fingerprint = [...phases].sort().join(',')

  // Count recent executions with the same phase fingerprint (7-day window)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Fetch recent executions with any overlapping phases — then filter in JS
  // (Postgres array overlap is hard to parameterise in Prisma without raw SQL)
  const recentSimilar = await prisma.execution.count({
    where: {
      createdAt: { gte: since },
      phases:    { hasEvery: phases },  // all phases present = same pipeline
    },
  }).catch(() => 0)

  // Timing advantage: inverse relationship with how many similar runs already exist.
  // Pioneer (0 similar): 1.0
  // CONSENSUS_THRESHOLD or more: 0.1 (late mover floor)
  const timingAdv = Math.max(0.1, 1 - (recentSimilar / CONSENSUS_THRESHOLD))

  const saturationIndex = recentSimilar / CONSENSUS_THRESHOLD

  let classification: 'pioneer' | 'early' | 'consensus' | 'late_mover'
  if (recentSimilar === 0)      classification = 'pioneer'
  else if (recentSimilar < 3)   classification = 'early'
  else if (recentSimilar < 7)   classification = 'consensus'
  else                          classification = 'late_mover'

  // AAS v4: saturation > 0.8 = reclassify to hygiene
  const isHygiene = saturationIndex > 0.8

  return {
    timingAdv:      Math.round(timingAdv * 1000) / 1000,
    similarCount:   recentSimilar,
    classification,
    isHygiene,
  }
}

// Aggregate RP_score across all recent executions.
// Returns the fraction that had timingAdv > 0.5 (i.e., acted before field consensus).
export async function computeRPScore(windowDays = 30): Promise<{
  rpScore:      number   // 0–1, target ≥ 0.6
  total:        number
  aheadOfField: number
}> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  const executions = await prisma.execution.findMany({
    where:  { createdAt: { gte: since } },
    select: { timingAdv: true },
  }).catch(() => [] as Array<{ timingAdv: number }>)

  const total        = executions.length
  const aheadOfField = executions.filter(e => e.timingAdv > 0.5).length
  const rpScore      = total > 0 ? aheadOfField / total : 0

  return { rpScore: Math.round(rpScore * 1000) / 1000, total, aheadOfField }
}
