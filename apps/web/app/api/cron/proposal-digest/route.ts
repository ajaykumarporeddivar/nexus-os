/**
 * GET /api/cron/proposal-digest
 *
 * Weekly ops digest — summarises proposal pipeline health.
 * Sends email to ops team and logs stats.
 *
 * Secured by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest }         from '@/lib/cronAuth'
import { prisma }                    from '@/lib/prisma'
import { Resend }                    from 'resend'

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req)
  if (authError) return authError

  const now    = new Date()
  const week   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalOpen,
    newThisWeek,
    wonThisWeek,
    lostThisWeek,
    dlqCount,
    avgBidFit,
    totalLlmCost,
  ] = await Promise.all([
    prisma.proposal.count({ where: { stage: { notIn: ['delivered', 'no_bid', 'dlq'] } } }),
    prisma.proposal.count({ where: { createdAt: { gte: week } } }),
    prisma.winLossEvent.count({ where: { outcome: 'won',  linkedAt: { gte: week } } }),
    prisma.winLossEvent.count({ where: { outcome: 'lost', linkedAt: { gte: week } } }),
    prisma.proposal.count({ where: { stage: 'dlq' } }),
    prisma.proposal.aggregate({ _avg: { bidFitScore: true }, where: { bidFitScore: { gt: 0 } } }),
    prisma.proposal.aggregate({ _sum: { llmCostUsd: true } }),
  ])

  const winRate = wonThisWeek + lostThisWeek > 0
    ? Math.round((wonThisWeek / (wonThisWeek + lostThisWeek)) * 100)
    : null

  const stats = {
    totalOpen,
    newThisWeek,
    wonThisWeek,
    lostThisWeek,
    winRatePct:     winRate,
    dlqCount,
    avgBidFitScore: Math.round(avgBidFit._avg.bidFitScore ?? 0),
    totalLlmCostUsd: (totalLlmCost._sum.llmCostUsd ?? 0).toFixed(4),
  }

  // Email ops team
  const opsEmail = process.env.OPS_DIGEST_EMAIL
  if (opsEmail && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from:    'NEXUS OS <onboarding@resend.dev>',
      to:      opsEmail,
      subject: `Proposal Pipeline Digest — w/e ${now.toLocaleDateString('en-IN')}`,
      html: `
<h2>Proposal Pipeline Weekly Digest</h2>
<table border="1" cellpadding="8" style="border-collapse:collapse">
  <tr><th>Metric</th><th>Value</th></tr>
  <tr><td>Open proposals</td><td>${totalOpen}</td></tr>
  <tr><td>New this week</td><td>${newThisWeek}</td></tr>
  <tr><td>Won this week</td><td>${wonThisWeek}</td></tr>
  <tr><td>Lost this week</td><td>${lostThisWeek}</td></tr>
  <tr><td>Win rate</td><td>${winRate !== null ? winRate + '%' : 'N/A'}</td></tr>
  <tr><td>In DLQ</td><td>${dlqCount}</td></tr>
  <tr><td>Avg bid fit score</td><td>${stats.avgBidFitScore}</td></tr>
  <tr><td>Total LLM cost (all-time)</td><td>$${stats.totalLlmCostUsd}</td></tr>
</table>
<p><a href="https://web-xi-vert-58.vercel.app/shell?page=proposals">View Proposal Dashboard →</a></p>
      `,
    }).catch(e => console.error('[proposal-digest] email error:', e))
  }

  return NextResponse.json({ ok: true, stats })
}
