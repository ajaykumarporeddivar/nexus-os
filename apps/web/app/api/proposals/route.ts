/**
 * GET  /api/proposals  — paginated list (admin)
 * POST /api/proposals  — ingest new RFP → run intakeAgent → create Proposal record
 *
 * GDSL gates enforced: proposal_pii_gate, nda_access_gate
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { prisma }                    from '@/lib/prisma'
import { intakeAgent }               from '@/lib/proposalAgents'
import {
  checkPiiGate,
  checkNdaAccessGate,
  runGovGates,
} from '@/lib/proposalGov'

// ── GET /api/proposals ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sp     = req.nextUrl.searchParams
  const page   = Math.max(1, parseInt(sp.get('page')  ?? '1', 10))
  const limit  = Math.min(50, parseInt(sp.get('limit') ?? '20', 10))
  const stage  = sp.get('stage')
  const q      = sp.get('q')?.trim()

  const where: Record<string, unknown> = {}
  if (stage) where.stage = stage
  if (q) {
    where.OR = [
      { rfpTitle:   { contains: q, mode: 'insensitive' } },
      { clientName: { contains: q, mode: 'insensitive' } },
      { rfpRef:     { contains: q, mode: 'insensitive' } },
    ]
  }

  const [proposals, total] = await Promise.all([
    prisma.proposal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
      select: {
        id: true, rfpTitle: true, clientName: true, rfpRef: true,
        stage: true, bidDecision: true, bidFitScore: true,
        deadline: true, dealValueInr: true, approvalStatus: true,
        pricingTotalInr: true, revisionDepth: true,
        createdAt: true, updatedAt: true,
      },
    }),
    prisma.proposal.count({ where }),
  ])

  return NextResponse.json({ ok: true, proposals, total, page, limit })
}

// ── POST /api/proposals ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  // Allow both authenticated users and internal API callers
  const internalSecret = process.env.INTERNAL_API_SECRET
  const authHeader     = req.headers.get('x-internal-secret') ?? ''
  const isInternal     = internalSecret && authHeader === internalSecret
  if (!session?.user && !isInternal) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    rfpText:         string
    rfpRef?:         string
    clientName?:     string
    clientEmail?:    string
    ndaActive?:      boolean
    consentCaptured: boolean
    submittedBy?:    string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.rfpText?.trim()) {
    return NextResponse.json({ ok: false, error: 'rfpText is required' }, { status: 400 })
  }

  // ── GDSL gates ──────────────────────────────────────────────────────────────
  const gates = runGovGates([
    checkPiiGate({
      clientEmail:     body.clientEmail,
      consentCaptured: body.consentCaptured,
    }),
    checkNdaAccessGate({
      ndaActive:       body.ndaActive ?? false,
      consentCaptured: body.consentCaptured,
    }),
  ])

  if (gates) {
    return NextResponse.json({ ok: false, rule: gates.rule, reason: gates.reason }, { status: 422 })
  }

  // ── Run intakeAgent ─────────────────────────────────────────────────────────
  let rfpRecord
  try {
    rfpRecord = await intakeAgent(body.rfpText)
  } catch (e) {
    console.error('[proposals] intakeAgent failed:', e)
    rfpRecord = {
      title:        body.rfpRef ?? 'Untitled RFP',
      clientName:   body.clientName ?? 'Unknown',
      deadline:     null,
      budgetInr:    null,
      scopeSummary: body.rfpText.slice(0, 300),
      requirements: [],
      contactEmail: body.clientEmail ?? null,
    }
  }

  // ── Persist ─────────────────────────────────────────────────────────────────
  const proposal = await prisma.proposal.create({
    data: {
      rfpRef:          body.rfpRef ?? null,
      rfpTitle:        rfpRecord.title,
      rfpText:         body.rfpText,
      clientName:      rfpRecord.clientName ?? body.clientName ?? 'Unknown',
      clientEmail:     body.clientEmail ?? rfpRecord.contactEmail ?? null,
      consentCaptured: body.consentCaptured,
      ndaActive:       body.ndaActive ?? false,
      stage:           'intake',
      deadline:        rfpRecord.deadline ? new Date(rfpRecord.deadline) : null,
      dealValueInr:    rfpRecord.budgetInr ?? null,
      scopeOutline:    rfpRecord.scopeSummary,
    },
  })

  return NextResponse.json({ ok: true, proposal }, { status: 201 })
}
