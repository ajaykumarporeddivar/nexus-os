/**
 * L5 — Reputation Engine  (AOI v6 Gap 2)
 *
 * Dynamic trust scores earned through pipeline fulfillment.
 * Reputation is liquid capital — it drives routing priority, plan suggestions,
 * and learning cycle focus areas.
 *
 * Scores are computed from AuditEvent records (no new DB tables needed).
 *
 * Dimensions tracked:
 *   - User reputation:    avg QA score across all their pipeline runs
 *   - Vertical quality:   which domain types produce the best output
 *   - Agent performance:  which FORGE/BUILD agents contribute most to quality
 *   - System health:      rolling success rate over last 24h / 7d / 30d
 */

import { prisma } from '@/lib/prisma'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface UserReputation {
  userId:        string | null
  email?:        string
  totalRuns:     number
  successRuns:   number
  avgQaScore:    number
  successRate:   number
  reputationTier: 'platinum' | 'gold' | 'silver' | 'bronze' | 'new'
  trend:         'improving' | 'stable' | 'declining'
  lastRunAt:     string | null
}

export interface VerticalReputation {
  vertical:    string
  totalRuns:   number
  successRuns: number
  avgQaScore:  number
  successRate: number
  rank:        number
}

export interface SystemReputation {
  period:         '24h' | '7d' | '30d'
  totalRuns:      number
  successRuns:    number
  avgQaScore:     number
  successRate:    number
  gateBlockRate:  number   // % of runs blocked by L2.75 control gates
  trend:          'improving' | 'stable' | 'declining'
}

// ─── Tier thresholds ──────────────────────────────────────────────────────────

function reputationTier(avgQa: number, successRate: number): UserReputation['reputationTier'] {
  if (avgQa >= 9.0 && successRate >= 0.9) return 'platinum'
  if (avgQa >= 8.0 && successRate >= 0.8) return 'gold'
  if (avgQa >= 7.0 && successRate >= 0.7) return 'silver'
  if (avgQa >= 5.0)                       return 'bronze'
  return 'new'
}

// ─── User Reputation ──────────────────────────────────────────────────────────

export async function getUserReputation(userId: string): Promise<UserReputation | null> {
  try {
    const events = await prisma.auditEvent.findMany({
      where:   { action: 'forge_run_completed', sessionId: { contains: userId } },
      orderBy: { createdAt: 'desc' },
      take:    50,
      select:  { meta: true, createdAt: true },
    })

    if (!events.length) return null

    const metas   = events.map(e => e.meta as Record<string, unknown>)
    const successes = metas.filter(m => m.ok === true)
    const qaScores  = metas.map(m => typeof m.qaScore === 'number' ? m.qaScore : 0).filter(s => s > 0)
    const avgQa     = qaScores.length ? qaScores.reduce((a, b) => a + b, 0) / qaScores.length : 0
    const successRate = events.length ? successes.length / events.length : 0

    // Trend: compare last 10 vs previous 10
    const recent   = qaScores.slice(0, 10)
    const previous = qaScores.slice(10, 20)
    const recentAvg   = recent.length   ? recent.reduce((a,b)=>a+b,0)/recent.length   : 0
    const previousAvg = previous.length ? previous.reduce((a,b)=>a+b,0)/previous.length : 0
    const trend: UserReputation['trend'] =
      previousAvg === 0 ? 'stable' :
      recentAvg > previousAvg + 0.3 ? 'improving' :
      recentAvg < previousAvg - 0.3 ? 'declining' : 'stable'

    return {
      userId,
      totalRuns:     events.length,
      successRuns:   successes.length,
      avgQaScore:    Math.round(avgQa * 10) / 10,
      successRate:   Math.round(successRate * 100) / 100,
      reputationTier: reputationTier(avgQa, successRate),
      trend,
      lastRunAt:     events[0]?.createdAt?.toString() ?? null,
    }
  } catch {
    return null
  }
}

// ─── Vertical Reputation ──────────────────────────────────────────────────────

export async function getVerticalReputations(): Promise<VerticalReputation[]> {
  try {
    const events = await prisma.auditEvent.findMany({
      where:  { action: 'forge_run_completed' },
      select: { meta: true },
      take:   500,
    })

    const byVertical: Record<string, { runs: number; successes: number; qaSum: number }> = {}

    for (const e of events) {
      const meta = e.meta as Record<string, unknown>
      const vertical = (meta.vertical as string) ?? 'unknown'
      if (!byVertical[vertical]) byVertical[vertical] = { runs: 0, successes: 0, qaSum: 0 }
      byVertical[vertical].runs++
      if (meta.ok) byVertical[vertical].successes++
      if (typeof meta.qaScore === 'number') byVertical[vertical].qaSum += meta.qaScore
    }

    const results = Object.entries(byVertical)
      .map(([vertical, d]) => ({
        vertical,
        totalRuns:   d.runs,
        successRuns: d.successes,
        avgQaScore:  d.runs ? Math.round((d.qaSum / d.runs) * 10) / 10 : 0,
        successRate: d.runs ? Math.round((d.successes / d.runs) * 100) / 100 : 0,
        rank:        0,
      }))
      .sort((a, b) => b.avgQaScore - a.avgQaScore)
      .map((v, i) => ({ ...v, rank: i + 1 }))

    return results
  } catch {
    return []
  }
}

// ─── System Reputation ────────────────────────────────────────────────────────

export async function getSystemReputation(period: SystemReputation['period']): Promise<SystemReputation> {
  const msMap = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }
  const since = new Date(Date.now() - msMap[period])

  try {
    const [runEvents, gateBlocks] = await Promise.all([
      prisma.auditEvent.findMany({
        where:  { action: 'forge_run_completed', createdAt: { gte: since } },
        select: { meta: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.auditEvent.count({
        where: { action: 'control_gate_decision', createdAt: { gte: since } },
      }),
    ])

    const metas      = runEvents.map(e => e.meta as Record<string, unknown>)
    const successes  = metas.filter(m => m.ok === true)
    const qaScores   = metas.map(m => typeof m.qaScore === 'number' ? m.qaScore : 0).filter(s => s > 0)
    const avgQa      = qaScores.length ? qaScores.reduce((a,b)=>a+b,0) / qaScores.length : 0
    const total      = runEvents.length

    // Trend: split period in half
    const mid        = since.getTime() + msMap[period] / 2
    const firstHalf  = metas.filter((_, i) => runEvents[i] && new Date(runEvents[i].createdAt).getTime() < mid)
    const secondHalf = metas.filter((_, i) => runEvents[i] && new Date(runEvents[i].createdAt).getTime() >= mid)
    const firstAvg   = firstHalf.filter(m=>m.ok).length  / (firstHalf.length  || 1)
    const secondAvg  = secondHalf.filter(m=>m.ok).length / (secondHalf.length || 1)
    const trend: SystemReputation['trend'] =
      secondAvg > firstAvg + 0.05 ? 'improving' :
      secondAvg < firstAvg - 0.05 ? 'declining' : 'stable'

    return {
      period,
      totalRuns:     total,
      successRuns:   successes.length,
      avgQaScore:    Math.round(avgQa * 10) / 10,
      successRate:   total ? Math.round((successes.length / total) * 100) / 100 : 0,
      gateBlockRate: total ? Math.round((gateBlocks / (total + gateBlocks)) * 100) / 100 : 0,
      trend,
    }
  } catch {
    return { period, totalRuns: 0, successRuns: 0, avgQaScore: 0, successRate: 0, gateBlockRate: 0, trend: 'stable' }
  }
}
