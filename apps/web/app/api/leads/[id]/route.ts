/**
 * GET    /api/leads/[id]         — get single lead (admin)
 * PATCH  /api/leads/[id]         — rep override / disqualify
 * DELETE /api/leads/[id]         — DPDP Act right-to-deletion (admin, 72h SLA)
 *
 * SME-6:  PII governance, right-to-deletion
 * SME-9:  Rep override audit trail
 * SME-11: rep_override_audit GDSL rule
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { routeLead } from '@/lib/leadScoring'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const lead = await prisma.lead.findUnique({ where: { id: params.id } })
  if (!lead) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, lead })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json() as {
    action: 'override_score' | 'disqualify' | 'mark_converted'
    score?:  number
    reason?: string
    rep?:    string
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } })
  if (!lead) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

  if (body.action === 'override_score') {
    // SME-11: rep_override_audit — reason required
    if (!body.reason) {
      return NextResponse.json({ ok: false, error: 'reason required for score override' }, { status: 400 })
    }
    if (body.score === undefined || body.score < 0 || body.score > 100) {
      return NextResponse.json({ ok: false, error: 'score must be 0–100' }, { status: 400 })
    }

    const routing = routeLead(body.score)
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        repOverrideScore:  body.score,
        repOverrideReason: body.reason,
        repOverrideAt:     new Date(),
        repOverrideBy:     body.rep ?? 'admin',
        routingDecision:   routing.decision,
        assignedRep:       routing.assignedRep || null,
        status:            routing.decision === 'disqualified' ? 'disqualified' : 'routed',
      },
    })

    // Audit log
    await prisma.auditEvent.create({
      data: {
        action:    'lead_score_override',
        sessionId: `lead_${lead.id}`,
        userId:    null,
        meta: {
          leadId:    lead.id,
          email:     lead.email,
          fromScore: lead.icpScore,
          toScore:   body.score,
          reason:    body.reason,
          by:        body.rep ?? 'admin',
        } as never,
      },
    })

    return NextResponse.json({ ok: true, lead: updated })
  }

  if (body.action === 'disqualify') {
    if (!body.reason) {
      return NextResponse.json({ ok: false, error: 'reason required for disqualification' }, { status: 400 })
    }
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status:                    'disqualified',
        disqualifiedAt:            new Date(),
        disqualificationReason:    body.reason,
        repOverrideBy:             body.rep ?? 'admin',
        repOverrideAt:             new Date(),
        repOverrideReason:         body.reason,
      },
    })
    await prisma.auditEvent.create({
      data: {
        action:    'lead_disqualified',
        sessionId: `lead_${lead.id}`,
        userId:    null,
        meta:      { leadId: lead.id, email: lead.email, reason: body.reason, by: body.rep ?? 'admin' } as never,
      },
    })
    return NextResponse.json({ ok: true, lead: updated })
  }

  if (body.action === 'mark_converted') {
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'converted' },
    })
    // G18: audit every conversion action
    await prisma.auditEvent.create({
      data: {
        action:    'lead_converted_manual',
        sessionId: `lead_${lead.id}`,
        userId:    null,
        meta:      { leadId: lead.id, email: lead.email, by: body.rep ?? 'admin', previousStatus: lead.status } as never,
      },
    }).catch(console.error)
    return NextResponse.json({ ok: true, lead: updated })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  // SME-6: DPDP Act right-to-deletion — hard delete PII fields, keep anonymised record
  const lead = await prisma.lead.findUnique({ where: { id: params.id } })
  if (!lead) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

  await prisma.lead.update({
    where: { id: params.id },
    data: {
      email:  `deleted_${params.id}@redacted`,
      name:   null,
      phone:  null,
      role:   null,
      status: 'disqualified',
      disqualificationReason: 'DPDP right-to-deletion exercised',
      disqualifiedAt: new Date(),
    },
  })

  await prisma.auditEvent.create({
    data: {
      action:    'lead_pii_deleted',
      sessionId: `lead_${params.id}`,
      userId:    null,
      meta:      { leadId: params.id } as never,
    },
  })

  return NextResponse.json({ ok: true, message: 'PII fields redacted per DPDP §6.16' })
}
