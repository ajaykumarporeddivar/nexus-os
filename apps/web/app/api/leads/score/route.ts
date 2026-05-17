/**
 * POST /api/leads/score
 *
 * Force-score a specific lead by ID or trigger batch re-score.
 * SME-2: Score stage (explicit trigger)
 * SME-11: score_groundedness enforcement
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { llmScore, checkScoringBudget, routeLead } from '@/lib/leadScoring'
import { enrichLead, mergeFirmographic } from '@/lib/leadEnrichment'

export const runtime     = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json() as { leadId?: string; rescoreAll?: boolean }

  if (body.rescoreAll) {
    // Re-score all DLQ + new leads (up to 20 at a time — budget-gated)
    const pending = await prisma.lead.findMany({
      where: { status: { in: ['new', 'dlq'] } },
      take: 20,
      orderBy: { createdAt: 'asc' },
    })

    let scored = 0
    for (const lead of pending) {
      try {
        await checkScoringBudget()
        const freshFirmo2 = await enrichLead(lead.email).catch(() => null)
        const mergedFirmo2 = freshFirmo2
          ? mergeFirmographic(lead.firmographic as never, freshFirmo2)
          : (lead.firmographic as never)
        const result = await llmScore({
          email:       lead.email,
          name:        lead.name,
          company:     lead.company,
          role:        lead.role,
          firmographic: mergedFirmo2,
          source:      lead.source,
          utmSource:   lead.utmSource,
        })
        const routing = routeLead(result.score)
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            icpScore:        result.score,
            scoreConfidence: result.confidence,
            scoreRationale:  result.rationale as never,
            scoredAt:        new Date(),
            scoringCostUsd:  (lead.scoringCostUsd ?? 0) + result.costUsd,
            firmographic:    mergedFirmo2 as never,
            enrichedAt:      freshFirmo2 ? new Date() : undefined,
            routingDecision: routing.decision,
            assignedRep:     routing.assignedRep || null,
            routedAt:        new Date(),
            status:          routing.decision === 'disqualified' ? 'disqualified' : 'routed',
            dlqAt:           null,
            dlqReason:       null,
          },
        })
        scored++
      } catch {
        break // budget exhausted — stop
      }
    }

    return NextResponse.json({ ok: true, scored, total: pending.length })
  }

  if (!body.leadId) {
    return NextResponse.json({ ok: false, error: 'leadId required' }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({ where: { id: body.leadId } })
  if (!lead) return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })

  await checkScoringBudget()

  // G3 fix: always enrich before scoring so firmographic is fresh
  const freshFirmo = await enrichLead(lead.email).catch(() => null)
  const mergedFirmo = freshFirmo
    ? mergeFirmographic(lead.firmographic as never, freshFirmo)
    : (lead.firmographic as never)

  const result = await llmScore({
    email:       lead.email,
    name:        lead.name,
    company:     lead.company,
    role:        lead.role,
    firmographic: mergedFirmo,
    source:      lead.source,
    utmSource:   lead.utmSource,
  })
  const routing = routeLead(result.score)

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      // G12 fix: write 'scored' status first, then routing decision
      icpScore:        result.score,
      scoreConfidence: result.confidence,
      scoreRationale:  result.rationale as never,
      scoredAt:        new Date(),
      scoringCostUsd:  (lead.scoringCostUsd ?? 0) + result.costUsd,
      firmographic:    mergedFirmo as never,
      enrichedAt:      freshFirmo ? new Date() : lead.enrichedAt,
      routingDecision: routing.decision,
      assignedRep:     routing.assignedRep || null,
      routedAt:        new Date(),
      status:          routing.decision === 'disqualified' ? 'disqualified' : 'routed',
      dlqAt:           null,
      dlqReason:       null,
    },
  })

  return NextResponse.json({
    ok: true,
    score:      result.score,
    confidence: result.confidence,
    rationale:  result.rationale,
    method:     result.method,
    routing:    routing.decision,
    costUsd:    result.costUsd,
    status:     updated.status,
  })
}
