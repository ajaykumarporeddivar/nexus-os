/**
 * GET /api/cron/proposal-dlq-retry
 *
 * Hourly: retries proposals stuck in DLQ.
 * Max 3 retries (dlqRetries field). After 3 failures → P0 escalation.
 * Secured by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest }         from '@/lib/cronAuth'
import { prisma }                    from '@/lib/prisma'

const MAX_DLQ_RETRIES = 3

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req)
  if (authError) return authError

  // Find all DLQ proposals that haven't exceeded retry limit
  const stuck = await prisma.proposal.findMany({
    where: {
      stage:      'dlq',
      dlqRetries: { lt: MAX_DLQ_RETRIES },
    },
    select: {
      id: true, rfpTitle: true, clientName: true,
      dlqRetries: true, dlqReason: true, dlqAt: true,
    },
    take: 20,
  })

  const retried:    string[] = []
  const escalated:  string[] = []
  const errors:     string[] = []

  for (const p of stuck) {
    try {
      // Reset stage to intake for re-processing
      await prisma.proposal.update({
        where: { id: p.id },
        data: {
          stage:      'intake',
          dlqAt:      null,
          dlqReason:  null,
          dlqRetries: p.dlqRetries + 1,
        },
      })
      retried.push(p.id)

      // If this is the 3rd retry attempt, send P0 Slack alert
      if (p.dlqRetries + 1 >= MAX_DLQ_RETRIES - 1) {
        const slack = process.env.SLACK_WEBHOOK_URL
        if (slack) {
          fetch(slack, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `🚨 P0: Proposal DLQ retry ${p.dlqRetries + 1}/${MAX_DLQ_RETRIES}\n*${p.rfpTitle}* (${p.clientName ?? 'Unknown'})\nReason: ${p.dlqReason ?? 'unknown'}\nhttps://web-xi-vert-58.vercel.app/shell?page=proposals`,
            }),
          }).catch(() => {})
        }
      }
    } catch (e) {
      console.error(`[proposal-dlq-retry] failed for ${p.id}:`, e)
      errors.push(p.id)
    }
  }

  // Proposals that have exhausted retries → escalate to human
  const exhausted = await prisma.proposal.findMany({
    where: { stage: 'dlq', dlqRetries: { gte: MAX_DLQ_RETRIES } },
    select: { id: true, rfpTitle: true },
  })

  for (const p of exhausted) {
    escalated.push(p.id)
  }

  if (escalated.length > 0) {
    const slack = process.env.SLACK_WEBHOOK_URL
    if (slack) {
      fetch(slack, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 ${escalated.length} proposal(s) exhausted DLQ retries — manual intervention required\nhttps://web-xi-vert-58.vercel.app/shell?page=proposals`,
        }),
      }).catch(() => {})
    }
  }

  return NextResponse.json({
    ok:        true,
    checked:   stuck.length,
    retried:   retried.length,
    escalated: escalated.length,
    errors:    errors.length,
  })
}
