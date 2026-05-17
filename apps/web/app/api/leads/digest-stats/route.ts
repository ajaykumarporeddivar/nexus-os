/**
 * GET /api/leads/digest-stats — admin-auth version of digest stats for UI DriftPanel
 * Requires session auth (not cron secret) so the browser can call it safely.
 */
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)

  const [total, statusGroups, dlqCount, scored, costToday] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.groupBy({ by: ['status'], _count: { status: true } }),
    prisma.lead.count({ where: { status: 'dlq' } }),
    prisma.lead.aggregate({ _avg: { icpScore: true }, where: { icpScore: { gt: 0 } } }),
    prisma.lead.aggregate({ _sum: { scoringCostUsd: true }, where: { scoredAt: { gte: dayStart } } }),
  ])

  const statusMap: Record<string, number> = {}
  for (const r of statusGroups) statusMap[r.status] = r._count.status

  const disqualCount = statusMap['disqualified'] ?? 0
  const hotCount     = statusMap['hot_queue'] ?? statusMap['routed'] ?? 0
  const disqualRate  = total > 0 ? Math.round((disqualCount / total) * 100) : 0
  const avgIcpScore  = Math.round(scored._avg.icpScore ?? 0)
  const costToday$   = costToday._sum.scoringCostUsd ?? 0
  const costPerHot   = hotCount > 0 ? +(costToday$ / hotCount).toFixed(4) : 0

  const warnings: string[] = []
  if (disqualRate > 40) warnings.push(`High disqualification rate: ${disqualRate}% of leads are disqualified`)
  if (avgIcpScore > 0 && avgIcpScore < 40) warnings.push(`Low avg ICP score: ${avgIcpScore}/100 — review scoring criteria`)
  if (dlqCount > 3) warnings.push(`${dlqCount} leads in DLQ — check scoring budget or LLM errors`)

  return NextResponse.json({
    ok: true,
    stats: {
      totalLeads:     total,
      avgIcpScore,
      disqualRate,
      dlqCount,
      costPerHotLead: costPerHot,
      warnings,
    },
  })
}
