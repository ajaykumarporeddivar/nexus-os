/**
 * POST /api/proposals/[id]/approve
 *
 * Approves or rejects a proposal at review stage.
 * For deals >₹10L: first approval sets approvedBy, requires secondApprovedBy for delivery.
 *
 * GDSL: high_value_review_gate — enforced here at approval, not just at delivery
 *
 * Body: { action: 'approve'|'reject', isSecondApprover?: boolean, rejectionReason?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { prisma }                    from '@/lib/prisma'
import { HIGH_VALUE_THRESHOLD_INR }  from '@/lib/proposalGov'
import { Resend }                    from 'resend'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const proposal = await prisma.proposal.findUnique({ where: { id } })
  if (!proposal) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }

  if (proposal.stage !== 'review' && proposal.stage !== 'approved') {
    return NextResponse.json({
      ok:    false,
      error: `Proposal must be in 'review' or 'approved' stage to approve (currently: ${proposal.stage})`,
    }, { status: 422 })
  }

  let body: { action: 'approve' | 'reject'; isSecondApprover?: boolean; rejectionReason?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const approverEmail = session.user.email
  const isHighValue   = proposal.dealValueInr
    ? Number(proposal.dealValueInr) > HIGH_VALUE_THRESHOLD_INR
    : false

  // ── Reject ────────────────────────────────────────────────────────────────
  if (body.action === 'reject') {
    const updated = await prisma.proposal.update({
      where: { id },
      data: {
        stage:            'drafting',   // send back for revision
        approvalStatus:   'rejected',
        rejectionReason:  body.rejectionReason ?? null,
      },
    })
    return NextResponse.json({ ok: true, stage: updated.stage, approvalStatus: 'rejected' })
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  const isFirstApproval  = !proposal.approvedBy
  const isSecondApproval = body.isSecondApprover === true

  if (isFirstApproval) {
    const needsSecond = isHighValue
    await prisma.proposal.update({
      where: { id },
      data: {
        approvalStatus:       needsSecond ? 'pending' : 'approved',
        approvedBy:           approverEmail,
        approvedAt:           new Date(),
        secondReviewRequired: needsSecond,
        stage:                needsSecond ? 'approved' : 'approved',
      },
    })

    if (needsSecond) {
      // Notify for second reviewer
      const slack = process.env.SLACK_WEBHOOK_URL
      if (slack) {
        fetch(slack, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `⚠️ High-value proposal needs 2nd reviewer\n*${proposal.rfpTitle}* (₹${Number(proposal.dealValueInr).toLocaleString('en-IN')})\nFirst approval: ${approverEmail}\nhttps://web-xi-vert-58.vercel.app/shell?page=proposals`,
          }),
        }).catch(() => {})
      }
      return NextResponse.json({
        ok:               true,
        stage:            'approved',
        approvalStatus:   'pending',
        needsSecondReview: true,
        message:          `Deal >₹10L: second reviewer sign-off required before delivery`,
      })
    }

    return NextResponse.json({ ok: true, stage: 'approved', approvalStatus: 'approved' })
  }

  // Second approval for high-value deals
  if (isSecondApproval) {
    if (proposal.approvedBy === approverEmail) {
      return NextResponse.json({
        ok:    false,
        error: 'Second approver must be a different person than the first approver',
      }, { status: 422 })
    }
    await prisma.proposal.update({
      where: { id },
      data: {
        approvalStatus:   'approved',
        secondApprovedBy: approverEmail,
        secondApprovedAt: new Date(),
      },
    })

    // Send delivery-ready notification
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
    if (resend && proposal.clientEmail) {
      await resend.emails.send({
        from:    'NEXUS OS <onboarding@resend.dev>',
        to:      proposal.clientEmail,
        subject: `Proposal Ready: ${proposal.rfpTitle}`,
        html: `
<h2>Your proposal is approved and ready for delivery</h2>
<p>Dear ${proposal.clientName ?? 'Valued Client'},</p>
<p>We are pleased to inform you that your proposal <strong>${proposal.rfpTitle}</strong> has been approved and is ready for delivery.</p>
<p>Our team will be in touch shortly to proceed with the next steps.</p>
<p>Reference: ${proposal.rfpRef ?? proposal.id}</p>
        `,
      }).catch(e => console.error('[approve] email error:', e))
    }

    return NextResponse.json({ ok: true, stage: 'approved', approvalStatus: 'approved', fullyApproved: true })
  }

  return NextResponse.json({ ok: false, error: 'Approval state unclear — specify isSecondApprover if making a second approval' }, { status: 422 })
}
