import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendWelcomeEmail } from '@/lib/email'
import { checkPublicRateLimit, rateLimitHeaders } from '@/lib/ratelimit'
import { llmScore, checkScoringBudget, routeLead } from '@/lib/leadScoring'
import type { ScoreRationaleItem } from '@/lib/leadScoring'
import { enrichLead, mergeFirmographic } from '@/lib/leadEnrichment'
import { triggerHotLeadOutreach, sendNurtureEmail } from '@/lib/leadOutreach'

export async function POST(req: NextRequest) {
  try {
    const rl = await checkPublicRateLimit(req)
    if (!rl.success) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests. Please wait and try again.' },
        { status: 429, headers: rateLimitHeaders(rl) }
      )
    }

    const body = await req.json() as {
      email?: string
      name?: string
      utmSource?: string
      utmMedium?: string
      utmCampaign?: string
      utmContent?: string
      platform?: string      // instagram|whatsapp|upwork|linkedin|direct
      messageText?: string   // raw enquiry message from the form
    }

    const email = (body.email ?? '').trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400 })
    }

    // Also check the nexus_utm cookie as fallback for UTM data
    let utmSource   = body.utmSource
    let utmMedium   = body.utmMedium
    let utmCampaign = body.utmCampaign
    let utmContent  = body.utmContent

    if (!utmSource) {
      try {
        const raw = req.cookies.get('nexus_utm')?.value
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, string>
          utmSource   = parsed.source   || undefined
          utmMedium   = parsed.medium   || undefined
          utmCampaign = parsed.campaign || undefined
          utmContent  = parsed.content  || undefined
        }
      } catch { /* malformed cookie — ignore */ }
    }

    const existing = await prisma.user.findUnique({
      where:  { email },
      select: { id: true, leadScore: true, utmSource: true },
    })

    const isNew = !existing

    await prisma.user.upsert({
      where:  { email },
      create: {
        email,
        name:        body.name ?? null,
        plan:        'free',
        leadScore:   10,
        lastActiveAt: new Date(),
        utmSource:   utmSource   ?? null,
        utmMedium:   utmMedium   ?? null,
        utmCampaign: utmCampaign ?? null,
        utmContent:  utmContent  ?? null,
      },
      update: {
        lastActiveAt: new Date(),
        // Only increment score if this is effectively a re-capture (idempotent)
        ...(existing ? {} : { leadScore: { increment: 0 } }),
        // Persist UTM only if not previously captured
        ...(existing && !existing.utmSource ? {
          utmSource:   utmSource   ?? undefined,
          utmMedium:   utmMedium   ?? undefined,
          utmCampaign: utmCampaign ?? undefined,
          utmContent:  utmContent  ?? undefined,
        } : {}),
      },
    })

    // Send welcome email only to genuinely new leads
    if (isNew) {
      sendWelcomeEmail(email, body.name ?? '').catch(console.error)
    }

    // SME-2: Ingest stage — create/upsert Lead record
    const existingLead = await prisma.lead.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } })
    const lead = await prisma.lead.upsert({
      where:  { id: existingLead?.id ?? 'new' },
      create: {
        email,
        name:            body.name        ?? null,
        source:          'landing_page',
        platform:        body.platform    ?? null,
        messageText:     body.messageText ?? null,
        utmSource:       utmSource        ?? null,
        utmMedium:       utmMedium        ?? null,
        utmCampaign:     utmCampaign      ?? null,
        utmContent:      utmContent       ?? null,
        consentCaptured: true,   // landing form = explicit consent (DPDP)
        consentAt:       new Date(),
        consentSource:   'landing_form',
        status:          'new',
        // Schedule Day 3 follow-up touch immediately
        nextTouchAt:     new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        pipelineRunId:   `lp_${crypto.randomUUID()}`,  // G7: auto-generate for ROI attribution
      },
      update: {
        name: body.name ?? undefined,
        ...(!(existingLead?.consentCaptured) ? { consentCaptured: true, consentAt: new Date(), consentSource: 'landing_form' } : {}),
      },
    })

    // Async AI scoring (non-blocking)
    if (isNew) {
      scoreNewLead(lead.id, {
        email,
        name:        body.name        ?? null,
        source:      'landing_page',
        platform:    body.platform    ?? null,
        messageText: body.messageText ?? null,
        utmSource:   utmSource        ?? null,
      }).catch(console.error)
    }

    return NextResponse.json({ ok: true, isNew })
  } catch (err) {
    console.error('[lead-capture POST]', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}

async function scoreNewLead(leadId: string, input: { email: string; name: string | null; source: string; platform: string | null; messageText: string | null; utmSource: string | null }) {
  try {
    await checkScoringBudget()
    const freshFirmo = await enrichLead(input.email)
    const result     = await llmScore({ ...input, firmographic: freshFirmo })
    const routing    = routeLead(result.score)

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        firmographic:    freshFirmo as never,
        enrichedAt:      new Date(),
        icpScore:        result.score,
        scoreConfidence: result.confidence,
        scoreRationale:  result.rationale as never,
        scoredAt:        new Date(),
        scoringCostUsd:  result.costUsd,
        routingDecision: routing.decision,
        assignedRep:     routing.assignedRep || null,
        routedAt:        new Date(),
        status:          routing.decision === 'disqualified' ? 'disqualified' : 'routed',
      },
    })

    // N6 fix: use lead.company not freshFirmo.website as company in outreach
    const outreachPayload = {
      leadId,
      email:           input.email,
      name:            input.name,
      company:         lead.company ?? freshFirmo.description ?? null,
      role:            null,
      icpScore:        result.score,
      routingDecision: routing.decision,
      rationale:       result.rationale as ScoreRationaleItem[],
      source:          input.source,
      platform:        input.platform,
      messageText:     input.messageText,
      firmographic:    freshFirmo as Record<string, unknown>,
      consentCaptured: lead.consentCaptured,
      pipelineRunId:   lead.pipelineRunId,
    }
    if (routing.decision === 'hot_queue') {
      await triggerHotLeadOutreach(outreachPayload).catch(console.error)
    } else if (routing.decision === 'nurture' && lead.consentCaptured) {
      await sendNurtureEmail(outreachPayload).catch(console.error)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'dlq', dlqAt: new Date(), dlqReason: msg, dlqRetries: { increment: 1 } },
    }).catch(console.error)
  }
}
