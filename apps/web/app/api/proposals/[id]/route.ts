/**
 * GET    /api/proposals/[id]  — fetch full proposal
 * PATCH  /api/proposals/[id]  — advance stage / update fields
 *                               GDSL: proposal_mutation_gate
 * DELETE /api/proposals/[id]  — DPDP hard delete
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { prisma }                    from '@/lib/prisma'
import {
  checkMutationGate,
  checkHighValueReview,
  checkNoBidReason,
  runGovGates,
} from '@/lib/proposalGov'

type Params = { params: Promise<{ id: string }> }

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: {
      revisions:    { orderBy: { createdAt: 'asc' } },
      winLossEvents: true,
    },
  })

  if (!proposal) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, proposal })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const existing = await prisma.proposal.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const patchFields = Object.keys(body)

  // ── GDSL gates ──────────────────────────────────────────────────────────────
  const gates = runGovGates([
    // Rule 5: mutation gate — post-approval fields locked
    checkMutationGate(existing.stage, patchFields),

    // Rule 9: high-value gate — only enforced when advancing to delivered
    ...(body.stage === 'delivered' ? [checkHighValueReview({
      dealValueInr:     existing.dealValueInr ? Number(existing.dealValueInr) : null,
      approvalStatus:   existing.approvalStatus,
      secondApprovedBy: existing.secondApprovedBy,
    })] : []),

    // Rule 10: no-bid reason — only enforced when setting bidDecision=no_bid
    ...(body.bidDecision === 'no_bid' ? [checkNoBidReason(
      'no_bid',
      (body.bidRationale as string) ?? existing.bidRationale,
    )] : []),
  ])

  if (gates) {
    return NextResponse.json({ ok: false, rule: gates.rule, reason: gates.reason }, { status: 422 })
  }

  // ── If advancing stage from approved/delivered, re-trigger approval ─────────
  const PROTECTED_FIELDS = ['pricingModel', 'pricingTotalInr', 'scopeOutline', 'effortEstimateDays', 'deadline']
  const hasProtectedEdit = patchFields.some(f => PROTECTED_FIELDS.includes(f))
  if (hasProtectedEdit && (existing.stage === 'approved' || existing.stage === 'delivered')) {
    // Force back to review
    body.stage = 'review'
    body.approvalStatus = 'pending'
  }

  const updated = await prisma.proposal.update({
    where: { id },
    data:  body as never,
  })

  return NextResponse.json({ ok: true, proposal: updated })
}

// ── DELETE (DPDP hard delete) ─────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const existing = await prisma.proposal.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }

  // DPDP §6.16 — hard delete cascades to revisions + win-loss events
  await prisma.proposal.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
