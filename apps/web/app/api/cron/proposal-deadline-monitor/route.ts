/**
 * GET /api/cron/proposal-deadline-monitor
 *
 * Hourly deadline DLQ check (SME-8 §8.11 — deadline_dlq_monitor).
 * - Moves proposals near deadline into DLQ if stuck
 * - Emits alerts for proposals <6h from deadline
 * - Sends Slack ping for P0 alerts
 *
 * Secured by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest }         from '@/lib/cronAuth'
import { prisma }                    from '@/lib/prisma'
import { checkDeadlineDlq }          from '@/lib/proposalGov'

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req)
  if (authError) return authError

  const open = await prisma.proposal.findMany({
    where: {
      stage:    { notIn: ['approved', 'delivered', 'no_bid', 'dlq'] },
      deadline: { not: null },
    },
    select: {
      id: true, rfpTitle: true, clientName: true,
      deadline: true, stage: true, dlqAt: true, createdAt: true,
    },
  })

  const criticalAlerts: string[] = []
  const warningAlerts:  string[] = []
  const dlqMoved:       string[] = []

  for (const p of open) {
    const result = checkDeadlineDlq({
      id:        p.id,
      deadline:  p.deadline,
      stage:     p.stage,
      dlqAt:     p.dlqAt,
      createdAt: p.createdAt,
    })

    if (!result.needsAlert) continue

    if (result.urgency === 'critical') {
      criticalAlerts.push(p.id)

      // Move to DLQ if not already flagged
      if (!p.dlqAt) {
        await prisma.proposal.update({
          where: { id: p.id },
          data:  {
            stage:     'dlq',
            dlqAt:     new Date(),
            dlqReason: result.hoursRemaining === 0
              ? 'Deadline passed without delivery'
              : 'Proposal in DLQ past 50% deadline window — P0 escalation',
          },
        })
        dlqMoved.push(p.id)
      }

      // Slack P0 alert
      const slack = process.env.SLACK_WEBHOOK_URL
      if (slack) {
        const hrs  = result.hoursRemaining === 0 ? 'OVERDUE' : `${result.hoursRemaining?.toFixed(1)}h remaining`
        const text = `🚨 P0 Proposal Deadline Alert\n*${p.rfpTitle}* (${p.clientName ?? 'Unknown'})\nStage: ${p.stage} | ${hrs}\nhttps://web-xi-vert-58.vercel.app/shell?page=proposals&id=${p.id}`
        fetch(slack, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ text }),
        }).catch(e => console.error('[proposal-deadline] slack error:', e))
      }
    } else {
      warningAlerts.push(p.id)
    }
  }

  return NextResponse.json({
    ok:             true,
    checked:        open.length,
    criticalAlerts: criticalAlerts.length,
    warningAlerts:  warningAlerts.length,
    dlqMoved:       dlqMoved.length,
  })
}
