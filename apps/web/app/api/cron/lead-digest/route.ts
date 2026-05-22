/**
 * GET /api/cron/lead-digest
 * Cron: daily 9 AM — "0 9 * * *"
 *
 * SME-12 / SME-13: Daily lead ops intelligence digest
 * Sends to founder with: yesterday's leads by tier, platform breakdown,
 * follow-up queue depth, ROI proxy, cost report, ICP drift warnings.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cronAuth'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { brand, appUrl } from '@/lib/brand'
import { ICP, DAILY_SCORING_BUDGET_USD } from '@/lib/leadScoring'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 30

const FROM           = () => process.env.EMAIL_FROM  ?? `${brand.name} <noreply@${brand.domain}>`
const FOUNDER_EMAIL  = () => process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'

export async function GET(req: NextRequest) {
  const authErr = verifyCronRequest(req)
  if (authErr) return authErr

  const r = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  if (!r) return NextResponse.json({ ok: false, error: 'RESEND_API_KEY not set' })

  const now      = new Date()
  const day1ago  = new Date(now.getTime() -  1 * 24 * 60 * 60 * 1000)
  const day7ago  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000)
  const day30ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalLeads,
    newLast24h,
    newLast7,
    statusCounts,
    hotLeads,
    costDay,
    costWeek,
    conversionLast30,
    dlqCount,
    avgScore,
    platformCounts,
    followUpQueue,
    pendingOnboarding,
    pendingRetainer,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { createdAt: { gte: day1ago } } }),
    prisma.lead.count({ where: { createdAt: { gte: day7ago } } }),
    prisma.lead.groupBy({ by: ['status'], _count: { status: true } }),
    prisma.lead.count({ where: { icpScore: { gte: ICP.hotScore } } }),
    prisma.lead.aggregate({ _sum: { scoringCostUsd: true }, where: { scoredAt: { gte: day1ago } } }),
    prisma.lead.aggregate({ _sum: { scoringCostUsd: true }, where: { scoredAt: { gte: day7ago } } }),
    prisma.lead.count({ where: { status: 'converted', updatedAt: { gte: day30ago } } }),
    prisma.lead.count({ where: { status: 'dlq' } }),
    prisma.lead.aggregate({ _avg: { icpScore: true }, where: { icpScore: { gt: 0 } } }),
    prisma.lead.groupBy({ by: ['platform'], _count: { platform: true }, where: { createdAt: { gte: day7ago } } }),
    prisma.lead.count({ where: { status: { in: ['in_outreach', 'routed'] }, consentCaptured: true, nextTouchAt: { lte: now }, touchCount: { lt: 5 } } }),
    prisma.lead.count({ where: { status: 'converted', onboardingFormSentAt: null } }),
    prisma.lead.count({ where: { deliveredAt: { lte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }, retainerPitchedAt: null } }),
  ])

  const statusMap: Record<string, number> = {}
  for (const s of statusCounts) statusMap[s.status] = s._count.status

  const routed       = statusMap['routed']       ?? 0
  const disqualified = statusMap['disqualified'] ?? 0
  const costDayUsd   = costDay._sum.scoringCostUsd  ?? 0
  const costWeekUsd  = costWeek._sum.scoringCostUsd ?? 0
  const avgIcpScore  = avgScore._avg.icpScore       ?? 0

  // Platform breakdown (last 7 days)
  const platformRows = (platformCounts as { platform: string | null; _count: { platform: number } }[])
    .sort((a, b) => b._count.platform - a._count.platform)
    .slice(0, 5)
    .map(p => metricRow(p.platform ?? 'unknown', p._count.platform))
    .join('')

  // SME-13: ROI proxy (qualified leads / cost)
  const costPerHotLead = hotLeads > 0 ? costWeekUsd / hotLeads : 0

  // SME-10: ICP drift signal — disqualification rate spike
  const totalScored = hotLeads + disqualified + routed
  const disqualRate = totalScored > 0 ? disqualified / totalScored : 0

  // Assumption decay warnings (SME-10 — hardcoded decay triggers for now)
  const warnings: string[] = []
  if (disqualRate > 0.5) warnings.push('Disqualification rate >50% — ICP definition may be drifting')
  if (dlqCount > 5)      warnings.push(`${dlqCount} leads stuck in DLQ — investigate enrichment/scoring failures`)
  if (avgIcpScore < 40)  warnings.push('Average ICP score <40 — inbound quality degrading, review top-of-funnel sources')
  if (costWeekUsd > DAILY_SCORING_BUDGET_USD * 3) warnings.push('Weekly scoring cost high — consider raising daily cap or using cached scores')

  const warningsHtml = warnings.length > 0
    ? `<div style="background:#1a0a0a;border:1px solid #7f1d1d;border-radius:8px;padding:16px;margin:20px 0">
        <div style="font-size:11px;color:#ef4444;font-weight:700;margin-bottom:8px">⚠ ATTENTION REQUIRED</div>
        ${warnings.map(w => `<div style="font-size:13px;color:#fca5a5;margin:4px 0">· ${w}</div>`).join('')}
       </div>`
    : ''

  const metricRow = (label: string, value: string | number, color = '#e5e5e5') =>
    `<tr>
      <td style="padding:8px 12px;color:#888;font-size:13px;border-bottom:1px solid #1a1a1a">${label}</td>
      <td style="padding:8px 12px;font-size:14px;font-weight:600;color:${color};border-bottom:1px solid #1a1a1a;text-align:right">${value}</td>
    </tr>`

  await r.emails.send({
    from:    FROM(),
    to:      FOUNDER_EMAIL(),
    subject: `${brand.name} · Daily Lead Digest — ${newLast24h} new today · ${hotLeads} hot total · followups: ${followUpQueue}`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:32px 16px}
  .card{background:#111;border:1px solid #222;border-radius:12px;padding:28px;max-width:520px;margin:0 auto}
  table{width:100%;border-collapse:collapse}
  .btn{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:11px 22px;border-radius:8px;text-decoration:none;margin-top:20px}
</style></head>
<body><div class="card">
  <div style="font-size:11px;color:#555;margin-bottom:16px;letter-spacing:.1em">${brand.name} · DAILY LEAD DIGEST · ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
  <h1 style="font-size:20px;font-weight:700;margin:0 0 20px">Lead Pipeline Intelligence</h1>

  ${warningsHtml}

  <div style="font-size:11px;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em">Today's Activity</div>
  <table>
    ${metricRow('New leads (24h)', newLast24h, '#c8ff00')}
    ${metricRow('Hot (ICP ≥ 75)', hotLeads, '#4ade80')}
    ${metricRow('Follow-up touches due', followUpQueue, followUpQueue > 0 ? '#facc15' : '#888')}
    ${metricRow('Awaiting onboarding form', pendingOnboarding, pendingOnboarding > 0 ? '#facc15' : '#888')}
    ${metricRow('Retainer pitch due', pendingRetainer, pendingRetainer > 0 ? '#818cf8' : '#888')}
  </table>

  <div style="font-size:11px;color:#555;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.08em">Funnel · Last 7 days</div>
  <table>
    ${metricRow('New leads', newLast7)}
    ${metricRow('Routed', routed)}
    ${metricRow('Disqualified', disqualified)}
    ${metricRow('Converted (30d)', conversionLast30, '#818cf8')}
    ${metricRow('DLQ (pending retry)', dlqCount, dlqCount > 0 ? '#f87171' : '#888')}
  </table>

  <div style="font-size:11px;color:#555;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.08em">Platform Breakdown · Last 7 days</div>
  <table>${platformRows || metricRow('No platform data yet', '–')}</table>

  <div style="font-size:11px;color:#555;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.08em">Intelligence · Quality & Cost</div>
  <table>
    ${metricRow('Avg ICP score', `${avgIcpScore.toFixed(1)}/100`, avgIcpScore >= 60 ? '#4ade80' : '#facc15')}
    ${metricRow('Disqualification rate', `${(disqualRate * 100).toFixed(0)}%`, disqualRate > 0.4 ? '#f87171' : '#888')}
    ${metricRow('Scoring cost (today)', `$${costDayUsd.toFixed(4)}`)}
    ${metricRow('Scoring cost (7d)', `$${costWeekUsd.toFixed(4)}`)}
    ${metricRow('Cost per hot lead', hotLeads > 0 ? `$${costPerHotLead.toFixed(4)}` : '–')}
    ${metricRow('Total leads in DB', totalLeads)}
  </table>

  <div style="font-size:11px;color:#555;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.08em">SME-10 Assumption Status</div>
  <table>
    ${metricRow('ICP definition', 'C-suite/VP · 50+ emp · SaaS/tech')}
    ${metricRow('Conversion lag assumption', '14–30 days')}
    ${metricRow('Hot lead response SLA', '< 4 hours')}
    ${metricRow('Daily scoring budget', `$${DAILY_SCORING_BUDGET_USD}.00`)}
  </table>

  <a href="${appUrl}/shell/leads" class="btn">Open Lead Dashboard →</a>
  <div style="font-size:11px;color:#444;margin-top:20px">${brand.name} · Auto-digest · Reply to this email for help</div>
</div></body></html>`,
  })

  console.log(`[lead-digest] sent to ${FOUNDER_EMAIL()}: ${newLast24h} new today, ${hotLeads} hot, followups=${followUpQueue}, $${costDayUsd.toFixed(4)} cost today`)
  return NextResponse.json({
    ok: true,
    sentTo: FOUNDER_EMAIL(),
    newLast24h, newLast7, hotLeads, conversionLast30,
    followUpQueue, pendingOnboarding, pendingRetainer,
    costDayUsd, costWeekUsd,
    avgIcpScore: parseFloat(avgIcpScore.toFixed(1)),
    dlqCount,
    disqualRate: parseFloat((disqualRate * 100).toFixed(1)),
    costPerHotLead: hotLeads > 0 ? parseFloat(costPerHotLead.toFixed(4)) : null,
    warnings,
  })
}
