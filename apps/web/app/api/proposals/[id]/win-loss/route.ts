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

  // G4 FIX: auto-compute missing win-loss metrics from proposal data
  const draftedAt = proposal.draftedAt ?? proposal.createdAt
  const computedLag = body.conversionLagDays ??
    Math.round((Date.now() - draftedAt.getTime()) / 86_400_000)
  const computedQuality = body.qualityScoreAtSubmission ?? proposal.qualityScoreAtSubmission ?? null
  const computedRevisions = (proposal as { revisionDepth?: number }).revisionDepth ?? 0

  const [winLoss] = await prisma.$transaction([
    prisma.winLossEvent.create({
      data: {
        proposalId:               id,
        outcome:                  body.outcome,
        valueUsd:                 body.valueUsd ?? (proposal.dealValueInr ? Number(proposal.dealValueInr) / 85 : null),
        conversionLagDays:        computedLag,
        qualityScoreAtSubmission: computedQuality,
        revisionCycles:           computedRevisions,
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

  // G11 FIX: link won proposal back to originating lead for ROI attribution
  let linkedLeadId: string | null = null
  if (body.outcome === 'won' && proposal.pipelineRunId) {
    try {
      const linkedLead = await prisma.lead.findFirst({
        where:  { pipelineRunId: proposal.pipelineRunId },
        select: { id: true },
      })
      if (linkedLead) {
        linkedLeadId = linkedLead.id
        await prisma.lead.update({
          where: { id: linkedLead.id },
          data: {
            status: 'converted',
            // store proposal win metadata for ROI loop
          },
        })
        await prisma.auditEvent.create({
          data: {
            action:    'lead_proposal_won',
            sessionId: linkedLead.id,
            meta: {
              proposalId:   id,
              rfpTitle:     proposal.rfpTitle,
              dealValueInr: proposal.dealValueInr ? Number(proposal.dealValueInr) : null,
              clientName:   proposal.clientName,
            } as never,
          },
        })
      }
    } catch (e) {
      console.error('[win-loss] lead linkage failed (non-fatal):', e)
    }
  }

  return NextResponse.json({ ok: true, winLoss, linkedLeadId })
}
