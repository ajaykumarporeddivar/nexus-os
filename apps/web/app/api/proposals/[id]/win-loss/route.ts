/**
 * POST /api/proposals/[id]/win-loss
 *
 * Records the final outcome (won/lost/no_decision) → feeds ROI loop.
 * Closes the proposal pipeline. Emits AuditEvent.
 *
 * Body: { outcome, valueUsd?, conversionLagDays?, qualityScoreAtSubmission?, lostReason? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { prisma }                    from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const proposal = await prisma.proposal.findUnique({ where: { id } })
  if (!proposal) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }

  let body: {
    outcome:                 'won' | 'lost' | 'no_decision'
    valueUsd?:               number
    conversionLagDays?:      number
    qualityScoreAtSubmission?: number
    lostReason?:             string
    notes?:                  string
  }

  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  if (!['won', 'lost', 'no_decision'].includes(body.outcome)) {
    return NextResponse.json({ ok: false, error: 'Invalid outcome' }, { status: 400 })
  }

  const [winLoss] = await prisma.$transaction([
    prisma.winLossEvent.create({
      data: {
        proposalId:               id,
        outcome:                  body.outcome,
        valueUsd:                 body.valueUsd ?? null,
        conversionLagDays:        body.conversionLagDays ?? null,
        qualityScoreAtSubmission: body.qualityScoreAtSubmission ?? null,
        lossReason:               body.lostReason ?? null,
        notes:                    body.notes ?? null,
      },
    }),
    prisma.proposal.update({
      where: { id },
      data:  { stage: 'delivered', outcome: body.outcome },
    }),
    prisma.auditEvent.create({
      data: {
        action:    'proposal_win_loss_recorded',
        sessionId: id,
        meta:      { outcome: body.outcome, valueUsd: body.valueUsd ?? null },
      },
    }),
  ])

  return NextResponse.json({ ok: true, winLoss })
}
