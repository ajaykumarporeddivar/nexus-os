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
    // ── P13 FIX: Fetch historical win rate for bid calibration ───────────────
    const [wonCount, totalCount] = await Promise.all([
      prisma.winLossEvent.count({ where: { outcome: 'won', linkedAt: { gte: new Date(Date.now() - 90 * 86400000) } } }),
      prisma.winLossEvent.count({ where: { linkedAt: { gte: new Date(Date.now() - 90 * 86400000) } } }),
    ])
    const historicalWinRate = totalCount > 0 ? Math.round((wonCount / totalCount) * 100) : null

    // ── Step 1: Bid decision ─────────────────────────────────────────────────
    const bid = await bidDecisionAgent({
      title:        proposal.rfpTitle,
      clientName:   proposal.clientName ?? 'Unknown',
      deadline:     proposal.deadline?.toISOString().split('T')[0] ?? null,
      budgetInr:    proposal.dealValueInr ? Number(proposal.dealValueInr) : null,
      scopeSummary: proposal.scopeOutline ?? '',
      requirements: [],
      contactEmail: proposal.clientEmail,
    }, undefined, historicalWinRate)
    llmCostUsd += 0.002 // ~1K tokens blended

    if (bid.decision === 'no_bid') {
      await prisma.proposal.update({
        where: { id },
        data: {
          stage:             'no_bid',
          bidDecision:       'no_bid',
          bidFitScore:       bid.bidFitScore,
          winProbabilityPct: bid.winProbabilityPct,
          bidRationale:      { rationale: bid.rationale, noBidReason: bid.noBidReason },
          bidDecisionAt:     new Date(),
          bidDecisionBy:     'agent',
          llmCostUsd:        (proposal.llmCostUsd ?? 0) + llmCostUsd,
        },
      })
      return NextResponse.json({ ok: true, decision: 'no_bid', bidFitScore: bid.bidFitScore, rationale: bid.rationale })
    }

    await prisma.proposal.update({
      where: { id },
      data: {
        stage:             'drafting',
        bidDecision:       'bid',
        bidFitScore:       bid.bidFitScore,
        winProbabilityPct: bid.winProbabilityPct,
        bidRationale:      { rationale: bid.rationale },
        bidDecisionAt:     new Date(),
        bidDecisionBy:     'agent',
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

    // ── Step 3: Pricing — value-anchored effort estimation ──────────────────
    // G1/G3/G5/G9 FIX: anchor to dealValueInr, classify scope complexity
    const computeEffortDays = (): number => {
      const dealInr   = proposal.dealValueInr ? Number(proposal.dealValueInr) : 0
      const wordCount = (proposal.scopeOutline ?? '').split(/\s+/).filter(Boolean).length

      // Scope complexity tier (S/M/L/XL) based on deal value + word count
      type ScopeTier = 'S' | 'M' | 'L' | 'XL'
      let tier: ScopeTier
      if      (dealInr >= 2_000_000 || wordCount >= 500) tier = 'XL'
      else if (dealInr >= 1_000_000 || wordCount >= 300) tier = 'L'
      else if (dealInr >=   500_000 || wordCount >= 150) tier = 'M'
      else                                               tier = 'S'

      // Floor/ceiling per tier (days)
      const tierBounds: Record<ScopeTier, [number, number]> = {
        S:  [5,  30],
        M:  [20, 60],
        L:  [45, 120],
        XL: [90, 180],
      }
      const [tFloor, tCeil] = tierBounds[tier]

      // Value-based estimate: assume ₹25,000/day blended rate
      const valueBased = dealInr > 0
        ? Math.ceil(dealInr / 25_000)
        : wordCount > 0 ? Math.ceil(wordCount / 20) : tFloor

      // Word-count fallback: words / 20 (conservative)
      const wordBased = wordCount > 0 ? Math.ceil(wordCount / 20) : tFloor

      // Take the higher of the two estimates, then clamp to tier bounds
      return Math.max(tFloor, Math.min(tCeil, Math.max(valueBased, wordBased)))
    }

    const estimatedEffort = proposal.effortEstimateDays ?? computeEffortDays()

    const pricing = await pricingAgent(
      proposal.scopeOutline ?? '',
      estimatedEffort,
      '50:50',
      proposal.deadline?.toISOString().split('T')[0] ?? null,
      proposal.dealValueInr ? Number(proposal.dealValueInr) : null,
    )
    llmCostUsd += 0.002

    const floorCheck = checkPricingFloor(pricing.totalInr)

    await prisma.proposal.update({
      where: { id },
      data: {
        stage:              'pricing',
        pricingTotalInr:    String(pricing.totalInr),
        pricingFloorMet:    floorCheck.passed,
        pricingModel:       pricing.lineItems,         // P2 FIX: save line items
        effortEstimateDays: estimatedEffort,
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
        draftVersion:         newDepth,
        marginLeakScanPassed: true,
        hallucinationFlags:   allFlags,           // P8 FIX: persist flags
        sourceReferences:     sectionResults.flatMap(r => r.sourceReferences),
        qualityScoreAtSubmission: review.qualityScore,
        llmCostUsd:           (proposal.llmCostUsd ?? 0) + llmCostUsd,
        agentCostBreakdown:   {
          bidDecision: 0.002,
          drafting:    0.012,
          pricing:     0.002,
          review:      0.003,
          total:       llmCostUsd,
        },
        draftedAt:            new Date(),
        updatedAt:            new Date(),
      },
    })

    // ── Notify reviewer if draft passed to review stage ──────────────────────
    if (nextStage === 'review') {
      const slack = process.env.SLACK_WEBHOOK_URL
      if (slack) {
        fetch(slack, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `📋 Proposal ready for review\n*${proposal.rfpTitle}* (${proposal.clientName ?? 'Unknown'})\nQuality score: ${review.qualityScore}/10 | Rev depth: ${newDepth}/3\nhttps://web-xi-vert-58.vercel.app/shell?page=proposals`,
          }),
        }).catch(e => console.error('[draft] slack notify error:', e))
      }
    }

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
