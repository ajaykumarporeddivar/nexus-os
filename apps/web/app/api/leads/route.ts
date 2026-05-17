/**
 * GET  /api/leads — admin list (paginated, filtered)
 * POST /api/leads — create/upsert a lead record directly (API ingestion)
 *
 * SME-1: lead_record entity
 * SME-2: Ingest stage
 * SME-6: PII governance (admin-only access)
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireAdmin } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { checkPublicRateLimit, rateLimitHeaders } from '@/lib/ratelimit'
import { llmScore, checkScoringBudget, routeLead } from '@/lib/leadScoring'
import type { ScoreRationaleItem } from '@/lib/leadScoring'
import { enrichLead, mergeFirmographic } from '@/lib/leadEnrichment'
import { triggerHotLeadOutreach, sendNurtureEmail } from '@/lib/leadOutreach'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 30

// ── GET /api/leads ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status')   ?? undefined
  const q        = searchParams.get('q')?.trim() ?? undefined
  const page     = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
  const limit    = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))
  const skip     = (page - 1) * limit
  const sortBy   = searchParams.get('sortBy')   ?? 'createdAt'
  const order    = (searchParams.get('order') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'

  // N2 fix: full-text search across email, name, company
  const searchFilter = q ? {
    OR: [
      { email:   { contains: q, mode: 'insensitive' as const } },
      { name:    { contains: q, mode: 'insensitive' as const } },
      { company: { contains: q, mode: 'insensitive' as const } },
    ],
  } : {}

  const where = {
    ...(status ? { status: status as never } : {}),
    ...searchFilter,
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { [sortBy]: order },
      skip,
      take: limit,
      select: {
        id: true, email: true, name: true, company: true, role: true,
        icpScore: true, scoreConfidence: true, scoreRationale: true,
        status: true, routingDecision: true, assignedRep: true,
        consentCaptured: true, source: true, utmSource: true,
        pipelineRunId: true, dlqAt: true, dlqReason: true,
        scoringCostUsd: true, enrichCostUsd: true,
        createdAt: true, scoredAt: true, routedAt: true,
        repOverrideScore: true, repOverrideReason: true, repOverrideBy: true,
      },
    }),
    prisma.lead.count({ where }),
  ])

  // Aggregate stats for the dashboard header
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)

  const [scoreRanges, costToday] = await Promise.all([
    prisma.lead.groupBy({
      by: ['status'],
      _count: { status: true },
    }),
    prisma.lead.aggregate({
      _sum: { scoringCostUsd: true },
      where: { scoredAt: { gte: dayStart } },
    }),
  ])

  const statusCounts: Record<string, number> = {}
  for (const r of scoreRanges) statusCounts[r.status] = r._count.status

  return NextResponse.json({
    ok: true,
    data: { leads, total, page, limit },
    meta: {
      statusCounts,
      costTodayUsd: costToday._sum.scoringCostUsd ?? 0,
    },
  })
}

// ── POST /api/leads ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Lead ingestion needs higher limit than default 5/min public rate — use IP check with 30/min
  // We re-use checkPublicRateLimit but allow retries by checking origin header for internal calls
  const isInternal = req.headers.get('x-nexus-internal') === process.env.INTERNAL_API_SECRET
  if (!isInternal) {
    const rl = await checkPublicRateLimit(req)
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: 'Rate limit exceeded' }, { status: 429, headers: rateLimitHeaders(rl) })
    }
  }

  const body = await req.json() as {
    email?: string; name?: string; company?: string; role?: string; phone?: string
    source?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string
    consentCaptured?: boolean; pipelineRunId?: string
    firmographic?: { companySize?: number; industry?: string; location?: string }
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400 })
  }

  // SME-2: Ingest stage — normalise and upsert
  const existing = await prisma.lead.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } })

  const lead = await prisma.lead.upsert({
    where:  { id: existing?.id ?? 'new' },
    create: {
      email,
      name:            body.name     ?? null,
      company:         body.company  ?? null,
      role:            body.role     ?? null,
      phone:           body.phone    ?? null,
      source:          body.source   ?? 'api',
      utmSource:       body.utmSource   ?? null,
      utmMedium:       body.utmMedium   ?? null,
      utmCampaign:     body.utmCampaign ?? null,
      utmContent:      body.utmContent  ?? null,
      consentCaptured: body.consentCaptured ?? false,
      consentAt:       body.consentCaptured ? new Date() : null,
      consentSource:   body.consentCaptured ? (body.source ?? 'api') : null,
      pipelineRunId:   body.pipelineRunId ?? `api_${crypto.randomUUID()}`,  // G7: auto-generate
      firmographic:    (body.firmographic ?? undefined) as never,
      status:          'new',
    },
    update: {
      name:        body.name    ?? undefined,
      company:     body.company ?? undefined,
      role:        body.role    ?? undefined,
      phone:       body.phone   ?? undefined,
      firmographic: body.firmographic ?? undefined,
      pipelineRunId: body.pipelineRunId ?? undefined,
      ...(body.consentCaptured && !existing?.consentCaptured ? {
        consentCaptured: true,
        consentAt:       new Date(),
        consentSource:   body.source ?? 'api',
      } : {}),
    },
  })

  // Kick off async scoring (non-blocking — returns lead immediately)
  scoreLeadAsync(lead.id, {
    email,
    name:        body.name     ?? null,
    company:     body.company  ?? null,
    role:        body.role     ?? null,
    firmographic: (body.firmographic ?? null) as never,
    source:      body.source   ?? 'api',
    utmSource:   body.utmSource ?? null,
  }).catch(err => console.error('[leads POST] async score error:', err))

  return NextResponse.json({ ok: true, leadId: lead.id, status: lead.status })
}

// ── Async scoring pipeline: Enrich → Score → Route → Outreach ────────────────
async function scoreLeadAsync(leadId: string, input: Parameters<typeof llmScore>[0]) {
  try {
    await checkScoringBudget() // SME-11 budget_cap

    // Stage 2: Enrich (SME-2)
    const freshFirmo = await enrichLead(input.email)
    const merged     = mergeFirmographic((input.firmographic ?? null) as never, freshFirmo)

    // Stage 3: Score
    const result  = await llmScore({ ...input, firmographic: merged })
    const routing = routeLead(result.score)

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        firmographic:    merged as never,
        enrichedAt:      new Date(),
        enrichmentFailed: false,
        icpScore:        result.score,
        scoreConfidence: result.confidence,
        scoreRationale:  result.rationale as never,
        scoredAt:        new Date(),
        scoringCostUsd:  result.costUsd,
        routingDecision: routing.decision,
        assignedRep:     routing.assignedRep || null,
        routedAt:        new Date(),
        status:          routing.decision === 'disqualified' ? 'disqualified' : 'routed',
        ...(routing.decision === 'disqualified' ? {
          disqualifiedAt:         new Date(),
          disqualificationReason: `Auto-disqualified: ICP score ${result.score}/100 < threshold 40`,
        } : {}),
      },
    })

    // Stage 4: Outreach — hot leads + nurture sequence (N4 fix)
    const outreachPayload = {
      leadId,
      email:           input.email,
      name:            input.name ?? null,
      company:         input.company ?? null,
      role:            input.role ?? null,
      icpScore:        result.score,
      routingDecision: routing.decision,
      rationale:       result.rationale as ScoreRationaleItem[],
      source:          input.source ?? null,
      consentCaptured: lead.consentCaptured,
      pipelineRunId:   lead.pipelineRunId,
    }
    if (routing.decision === 'hot_queue') {
      await triggerHotLeadOutreach(outreachPayload)
        .catch(e => console.error('[scoreLeadAsync] outreach error:', e))
    } else if (routing.decision === 'nurture' && lead.consentCaptured) {
      await sendNurtureEmail(outreachPayload)
        .catch(e => console.error('[scoreLeadAsync] nurture error:', e))
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status:    'dlq',
        dlqAt:     new Date(),
        dlqReason: msg === 'SCORING_BUDGET_EXHAUSTED' ? 'Daily scoring budget exhausted' : msg,
        dlqRetries: { increment: 1 },
        enrichmentFailed: msg.includes('enrich'),
      },
    }).catch(console.error)
  }
}
