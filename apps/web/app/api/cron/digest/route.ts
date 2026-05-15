import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMonthlyDigest } from '@/lib/email'

export const runtime     = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/digest
 *
 * Runs on the 1st of each month. Sends a monthly usage digest to all
 * Starter and Agency users who have been active in the past 30 days.
 *
 * Auth: CRON_SECRET via Authorization: Bearer / x-cron-secret / ?secret=
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader  = req.headers.get('authorization') ?? ''
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''
  const cronHeader  = req.headers.get('x-cron-secret') ?? ''

  const isAuthorised =
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret ||
    cronHeader  === cronSecret

  if (!isAuthorised) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const monthStart    = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) // ~1 month window

  const paidUsers = await prisma.user.findMany({
    where: {
      plan:        { in: ['starter', 'agency'] },
      lastActiveAt: { gte: thirtyDaysAgo },
    },
    select: { id: true, email: true, name: true },
    take: 200,
  })

  let sent = 0
  for (const user of paidUsers) {
    try {
      // Aggregate stats for this user over the past month
      const executions = await prisma.execution.findMany({
        where: {
          userId:    user.id,
          createdAt: { gte: monthStart },
        },
        select: { tokens: true, score: true, agentOutputs: { select: { agentId: true } } },
      })

      if (executions.length === 0) continue

      const totalRuns  = executions.length
      const tokensUsed = executions.reduce((s, e) => s + e.tokens, 0)
      const scores     = executions.map(e => e.score ?? 0).filter(s => s > 0)
      const avgScore   = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0

      // Find top agent by output count
      const agentCounts: Record<string, number> = {}
      for (const exec of executions) {
        for (const ao of exec.agentOutputs) {
          agentCounts[ao.agentId] = (agentCounts[ao.agentId] ?? 0) + 1
        }
      }
      const topAgent = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0]?.[0]

      await sendMonthlyDigest(user.email, user.name ?? '', { totalRuns, avgScore, tokensUsed, topAgent })
      // Reward monthly active users with lead score bump
      await prisma.user.update({
        where: { id: user.id },
        data:  { leadScore: { increment: 10 } },
      })
      sent++
    } catch (err) {
      console.error(`[cron/digest] failed for ${user.email}:`, err)
    }
  }

  return NextResponse.json({ ok: true, processed: paidUsers.length, sent })
}
