/**
 * GET /api/cron/lead-dlq-retry
 * Cron: every 15 minutes — "0/15 * * * *" (Vercel: every hour minimum, so "0 * * * *")
 *
 * SME-8: DLQ retry — P1 leads 2h SLA, others 24h
 * Retries up to 10 DLQ leads per run; budget-gates each attempt.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyCronRequest } from '@/lib/cronAuth'
import { llmScore, checkScoringBudget, routeLead, DAILY_SCORING_BUDGET_USD } from '@/lib/leadScoring'
import { triggerHotLeadOutreach, sendNurtureEmail } from '@/lib/leadOutreach'
import { enrichLead, mergeFirmographic } from '@/lib/leadEnrichment'
import type { ScoreRationaleItem } from '@/lib/leadScoring'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authErr = verifyCronRequest(req)
  if (authErr) return authErr

  const dlqLeads = await prisma.lead.findMany({
    where: { status: 'dlq', dlqRetries: { lt: 5 } }, // max 5 total retries
    orderBy: { dlqAt: 'asc' },
    take: 10,
  })

  if (dlqLeads.length === 0) {
    return NextResponse.json({ ok: true, retried: 0, message: 'DLQ empty' })
  }

  let retried = 0
  let skipped = 0
  const results: { leadId: string; result: string }[] = []

  for (const lead of dlqLeads) {
    try {
      await checkScoringBudget()
    } catch {
      // Budget exhausted — stop processing
      skipped = dlqLeads.length - retried
      break
    }

    try {
      // Re-enrich before re-scoring
      const freshFirmo = await enrichLead(lead.email)
      const merged     = mergeFirmographic(lead.firmographic as never, freshFirmo)

      const result  = await llmScore({
        email:        lead.email,
        name:         lead.name,
        company:      lead.company,
        role:         lead.role,
        firmographic: merged,
        source:       lead.source,
        utmSource:    lead.utmSource,
      })

      const routing = routeLead(result.score)

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          firmographic:     merged as never,
          enrichedAt:       new Date(),
          enrichmentFailed: false,          // L2 FIX: clear enrichment failure flag
          icpScore:         result.score,
          scoreConfidence:  result.confidence,
          scoreRationale:   result.rationale as never,
          scoredAt:         new Date(),
          scoringCostUsd:   (lead.scoringCostUsd ?? 0) + result.costUsd,
          routingDecision:  routing.decision,
          assignedRep:      routing.assignedRep || null,
          routedAt:         new Date(),
          status:           routing.decision === 'disqualified' ? 'disqualified' : 'routed',
          dlqAt:            null,
          dlqReason:        null,
          dlqRetries:       0,              // L1 FIX: reset retry counter so future DLQs get full quota
        },
      })

      // Fire outreach for hot or nurture leads on DLQ recovery
      const dlqOutreachPayload = {
        leadId:          lead.id,
        email:           lead.email,
        name:            lead.name,
        company:         lead.company,
        role:            lead.role,
        icpScore:        result.score,
        routingDecision: routing.decision,
        rationale:       result.rationale as ScoreRationaleItem[],
        source:          lead.source,
        consentCaptured: lead.consentCaptured,
        pipelineRunId:   lead.pipelineRunId,
      }
      if (routing.decision === 'hot_queue') {
        await triggerHotLeadOutreach(dlqOutreachPayload).catch(console.error)
      } else if (routing.decision === 'nurture' && lead.consentCaptured) {
        await sendNurtureEmail(dlqOutreachPayload).catch(console.error)
      }

      retried++
      results.push({ leadId: lead.id, result: `scored ${result.score} → ${routing.decision}` })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.lead.update({
        where: { id: lead.id },
        data: { dlqRetries: { increment: 1 }, dlqReason: msg },
      })
      results.push({ leadId: lead.id, result: `failed: ${msg}` })
    }
  }

  console.log(`[lead-dlq-retry] retried=${retried} skipped=${skipped}`)
  return NextResponse.json({ ok: true, retried, skipped, results })
}
