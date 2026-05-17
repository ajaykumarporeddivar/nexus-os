/**
 * POST /api/proposals/[id]/draft
 *
 * Triggers the full AI drafting pipeline:
 *   1. bidDecisionAgent   → bid/no-bid decision
 *   2. draftingAgent ×5   → executive_summary, technical_approach, team_credentials, timeline, commercials
 *   3. pricingAgent       → line-item pricing
 *   4. reviewAgent        → quality gate (score ≥ 7.0)
 *   5. On fail: increment revisionDepth, re-draft, or escalate
 *
 * GDSL: nda_access_gate, revision_depth_halt, margin_leak_guard,
 *       groundedness_credential, pricing_floor_gate, high_value_review_gate
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { prisma }                    from '@/lib/prisma'
import {
  bidDecisionAgent,
  draftingAgent,
  pricingAgent,
  reviewAgent,
} from '@/lib/proposalAgents'
import {
  checkNdaAccessGate,
  checkRevisionDepth,
  checkPricingFloor,
  checkMarginLeak,
  checkGroundednessCredential,
  needsHumanEscalation,
  runGovGates,
} from '@/lib/proposalGov'

type Params = { params: Promise<{ id: string }> }

const DRAFT_SECTIONS = [
  'executive_summary',
  'technical_approach',
  'team_credentials',
  'timeline',
  'commercials',
] as const

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

  // Only allowed in drafting stage or prior
  if (['approved', 'delivered', 'no_bid'].includes(proposal.stage)) {
    return NextResponse.json({ ok: false, error: 'Cannot re-draft a closed proposal' }, { status: 422 })
  }

  // ── GDSL: nda_access_gate ───────────────────────────────────────────────────
  const ndaCheck = checkNdaAccessGate({
    ndaActive:       proposal.ndaActive,
    consentCaptured: proposal.consentCaptured,
  })
  if (!ndaCheck.passed) {
    return NextResponse.json({ ok: false, rule: ndaCheck.rule, reason: ndaCheck.reason }, { status: 422 })
  }

  // ── GDSL: revision_depth_halt ───────────────────────────────────────────────
  const depthCheck = checkRevisionDepth(proposal.revisionDepth)
  if (!depthCheck.passed) {
    await prisma.proposal.update({
      where: { id },
      data:  { stage: 'review', escalatedAt: new Date() },
    })
    return NextResponse.json({
      ok:     false,
      rule:   depthCheck.rule,
      reason: depthCheck.reason,
      action: 'escalated_to_human',
    }, { status: 422 })
  }

  // ── Human escalation warning at depth 2 ────────────────────────────────────
  const needsEscalation = needsHumanEscalation(proposal.revisionDepth)

  const startMs = Date.now()
  let llmCostUsd = 0

  try {
    // ── Step 1: Bid decision ─────────────────────────────────────────────────
    const bid = await bidDecisionAgent({
      title:        proposal.rfpTitle,
      clientName:   proposal.clientName ?? 'Unknown',
      deadline:     proposal.deadline?.toISOString().split('T')[0] ?? null,
      budgetInr:    proposal.dealValueInr ? Number(proposal.dealValueInr) : null,
      scopeSummary: proposal.scopeOutline ?? '',
      requirements: [],
      contactEmail: proposal.clientEmail,
    })
    llmCostUsd += 0.002 // ~1K tokens blended

    if (bid.decision === 'no_bid') {
      await prisma.proposal.update({
        where: { id },
        data: {
          stage:        'no_bid',
          bidDecision:  'no_bid',
          bidFitScore:  bid.bidFitScore,
          bidRationale: bid.noBidReason ?? bid.rationale.join(' | '),
          llmCostUsd:   (proposal.llmCostUsd ?? 0) + llmCostUsd,
        },
      })
      return NextResponse.json({ ok: true, decision: 'no_bid', bidFitScore: bid.bidFitScore, rationale: bid.rationale })
    }

    await prisma.proposal.update({
      where: { id },
      data: {
        stage:       'drafting',
        bidDecision: 'bid',
        bidFitScore: bid.bidFitScore,
        bidRationale: bid.rationale.join(' | '),
      },
    })

    // ── Step 2: Draft all 5 sections ────────────────────────────────────────
    const sectionResults = await Promise.all(
      DRAFT_SECTIONS.map(sec =>
        draftingAgent({
          title:        proposal.rfpTitle,
          clientName:   proposal.clientName ?? 'Unknown',
          deadline:     proposal.deadline?.toISOString().split('T')[0] ?? null,
          budgetInr:    proposal.dealValueInr ? Number(proposal.dealValueInr) : null,
          scopeSummary: proposal.scopeOutline ?? '',
          requirements: [],
          contactEmail: proposal.clientEmail,
        }, sec, proposal.scopeOutline ?? '')
      )
    )
    llmCostUsd += 0.012 // ~4K tokens × 5 sections

    const fullDraft = DRAFT_SECTIONS.map((sec, i) =>
      `# ${sec.replace(/_/g, ' ').toUpperCase()}\n\n${sectionResults[i].sectionText}`
    ).join('\n\n---\n\n')

    const allFlags = sectionResults.flatMap(r => r.hallucinationRiskFlags)

    // ── GDSL: margin_leak_guard ─────────────────────────────────────────────
    const marginCheck = checkMarginLeak(fullDraft)
    if (!marginCheck.passed) {
      return NextResponse.json({ ok: false, rule: marginCheck.rule, reason: marginCheck.reason }, { status: 422 })
    }

    // ── GDSL: groundedness_credential ──────────────────────────────────────
    const credCheck = checkGroundednessCredential(fullDraft)
    if (!credCheck.passed) {
      return NextResponse.json({ ok: false, rule: credCheck.rule, reason: credCheck.reason }, { status: 422 })
    }

    // ── Step 3: Pricing ──────────────────────────────────────────────────────
    const pricing = await pricingAgent(
      proposal.scopeOutline ?? '',
      proposal.effortEstimateDays ?? 10,
    )
    llmCostUsd += 0.002

    const floorCheck = checkPricingFloor(pricing.totalInr)

    await prisma.proposal.update({
      where: { id },
      data: {
        stage:           'pricing',
        pricingTotalInr: String(pricing.totalInr),
        pricingFloorMet: floorCheck.passed,
      },
    })

    // ── Step 4: Review ───────────────────────────────────────────────────────
    const review = await reviewAgent(fullDraft)
    llmCostUsd += 0.003
    const totalMs = Date.now() - startMs

    // ── Save revision ────────────────────────────────────────────────────────
    const newDepth = proposal.revisionDepth + 1
    await prisma.proposalRevision.create({
      data: {
        proposalId:  id,
        version:     newDepth,
        draftText:   fullDraft,
        reviewNotes: review.summaryVerdict,
        agentFlags:  JSON.stringify({
          qualityScore:      review.qualityScore,
          issues:            review.issues,
          hallucinationRisks: allFlags,
          pricingFloorMet:   floorCheck.passed,
        }),
        triggeredBy: session.user?.email ?? 'system',
      },
    })

    // ── Update proposal ──────────────────────────────────────────────────────
    const govGates = runGovGates([floorCheck])
    const nextStage = review.passed && !govGates ? 'review' : 'drafting'

    await prisma.proposal.update({
      where: { id },
      data: {
        stage:                nextStage,
        proposalDraft:        fullDraft,
        revisionDepth:        newDepth,
        marginLeakScanPassed: true,
        llmCostUsd:           (proposal.llmCostUsd ?? 0) + llmCostUsd,
        updatedAt:            new Date(),
      },
    })

    return NextResponse.json({
      ok:              true,
      stage:           nextStage,
      qualityScore:    review.qualityScore,
      passed:          review.passed,
      revisionDepth:   newDepth,
      needsEscalation,
      pricingTotalInr: pricing.totalInr,
      pricingFloorMet: floorCheck.passed,
      govBlocked:      govGates ? govGates.reason : null,
      hallucinationFlags: allFlags,
      durationMs:      totalMs,
    })

  } catch (e) {
    console.error('[proposals/draft] pipeline error:', e)
    await prisma.proposal.update({
      where: { id },
      data:  { stage: 'dlq', dlqAt: new Date(), dlqReason: String(e) },
    })
    return NextResponse.json({ ok: false, error: 'Draft pipeline failed — moved to DLQ' }, { status: 500 })
  }
}
