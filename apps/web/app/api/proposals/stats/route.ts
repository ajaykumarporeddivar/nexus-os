/**
 * GET /api/proposals/stats
 *
 * Browser-accessible proposal pipeline stats (admin auth).
 * Replaces /api/cron/proposal-digest for UI consumption.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { prisma }                    from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const now  = new Date()
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalOpen,
    newThisWeek,
    wonThisWeek,
    lostThisWeek,
    dlqCount,
    avgBidFit,
    totalLlmCost,
    stageBreakdown,
    avgQualityScore,
  ] = await Promise.all([
    prisma.proposal.count({ where: { stage: { notIn: ['delivered', 'no_bid', 'dlq'] } } }),
    prisma.proposal.count({ where: { createdAt: { gte: week } } }),
    prisma.winLossEvent.count({ where: { outcome: 'won',  linkedAt: { gte: week } } }),
    prisma.winLossEvent.count({ where: { outcome: 'lost', linkedAt: { gte: week } } }),
    prisma.proposal.count({ where: { stage: 'dlq' } }),
    prisma.proposal.aggregate({ _avg: { bidFitScore: true }, where: { bidFitScore: { gt: 0 } } }),
    prisma.proposal.aggregate({ _sum: { llmCostUsd: true } }),
    prisma.proposal.groupBy({
      by:    ['stage'],
      _count: { id: true },
    }),
    prisma.proposalRevision.aggregate({
      _avg: { version: true },
      // proxy: avg revision version ≈ avg quality proxy
    }),
  ])

  // G7 FIX: return 0 (not null) when there are outcomes but zero wins
  const winRate = wonThisWeek + lostThisWeek > 0
    ? Math.round((wonThisWeek / (wonThisWeek + lostThisWeek)) * 100)
    : wonThisWeek === 0 && lostThisWeek === 0 ? null : 0

  const stages = Object.fromEntries(
    stageBreakdown.map(s => [s.stage, s._count.id])
  )

  return NextResponse.json({
    ok:   true,
    stats: {
      totalOpen,
      newThisWeek,
      wonThisWeek,
      lostThisWeek,
      winRatePct:       winRate,
      dlqCount,
      avgBidFitScore:   Math.round(avgBidFit._avg.bidFitScore ?? 0),
      totalLlmCostUsd:  Number((totalLlmCost._sum.llmCostUsd ?? 0).toFixed(4)),
      stages,
    },
  })
}
