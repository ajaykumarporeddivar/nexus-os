import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/funnel
 *
 * Returns cohort conversion data for the admin dashboard.
 * Admin-only (isAdmin must be true in session).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as { isAdmin?: boolean } | undefined
  if (!user?.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [allUsers, paidUsers, activeUsers, executions] = await Promise.all([
    prisma.user.findMany({
      select: { plan: true, utmSource: true, leadScore: true, createdAt: true },
    }),
    prisma.user.findMany({
      where:  { plan: { in: ['starter', 'agency', 'enterprise'] } },
      select: { email: true, utmSource: true, plan: true, leadScore: true },
    }),
    prisma.user.findMany({
      where:  { lastActiveAt: { gte: thirtyDaysAgo } },
      select: { id: true },
    }),
    prisma.execution.count(),
  ])

  // By plan breakdown
  const byPlan: Record<string, number> = {}
  for (const u of allUsers) {
    byPlan[u.plan] = (byPlan[u.plan] ?? 0) + 1
  }

  // By UTM source: signups + paid count + conversion rate
  const byUtmSource: Record<string, { signups: number; paid: number; convRate: number }> = {}
  for (const u of allUsers) {
    const src = u.utmSource ?? 'organic'
    if (!byUtmSource[src]) byUtmSource[src] = { signups: 0, paid: 0, convRate: 0 }
    byUtmSource[src].signups++
  }
  for (const u of paidUsers) {
    const src = u.utmSource ?? 'organic'
    if (!byUtmSource[src]) byUtmSource[src] = { signups: 0, paid: 0, convRate: 0 }
    byUtmSource[src].paid++
  }
  for (const [src, data] of Object.entries(byUtmSource)) {
    byUtmSource[src].convRate = data.signups > 0
      ? Math.round((data.paid / data.signups) * 100)
      : 0
  }

  const totalUsers      = allUsers.length
  const totalPaid       = paidUsers.length
  const totalActive     = activeUsers.length
  const activationRate  = totalUsers > 0 ? Math.round((totalActive / totalUsers) * 100) : 0
  const conversionRate  = totalUsers > 0 ? Math.round((totalPaid  / totalUsers) * 100) : 0

  // Lead score distribution
  const scoreRanges = { cold: 0, warm: 0, hot: 0, salesReady: 0 }
  for (const u of allUsers) {
    const s = u.leadScore ?? 0
    if      (s >= 150) scoreRanges.salesReady++
    else if (s >= 76)  scoreRanges.hot++
    else if (s >= 26)  scoreRanges.warm++
    else               scoreRanges.cold++
  }

  return NextResponse.json({
    ok: true,
    data: {
      byPlan,
      byUtmSource,
      totalUsers,
      totalPaid,
      totalActive,
      totalExecutions: executions,
      activationRate,
      conversionRate,
      leadScoreRanges: scoreRanges,
    },
  })
}
