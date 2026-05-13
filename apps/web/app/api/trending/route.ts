import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exploreRatio } from '@/lib/crCompute'
import { aiComplete } from '@/lib/ai'

const KEEP_TOP = 12

interface MicroSaaSOpportunity {
  title:           string
  niche:           string
  problem:         string
  targetMarket:    string
  revenueModel:    string
  trendReason:     string
  buildComplexity: 'low' | 'medium' | 'high'
  tags:            string[]
  opportunityScore: number
}

async function generateOpportunities(): Promise<MicroSaaSOpportunity[]> {
  const result = await aiComplete({
    system: `You are a micro-SaaS trend analyst for NEXUS OS, an AI-powered software delivery platform. Generate ${KEEP_TOP} trending micro-SaaS opportunities that are genuinely viral and underserved right now in 2026.

Focus on specific niches with real revenue potential — not generic ideas. Think: what are people actually paying for and searching for today?

Each opportunity must be ready for the One-Click Pipeline's MVP strategy:
- The problem must be concrete enough to derive exactly 3 MVP workflows.
- The target market must name the buyer/user sharply, not "businesses" or "everyone".
- Tags should include workflow nouns the app can turn into screens, such as "intake", "triage", "approval", "reporting", "exports", "analytics", or the domain-specific equivalents.
- Avoid ideas that require regulated infrastructure, real medical/legal/financial decisions, or external integrations to be useful at MVP stage.

Return a JSON array ONLY (no preamble, no markdown). Each object must have EXACTLY these fields:
{
  "title": "Short catchy app name (e.g. 'Proposal PDF Autopilot', 'Churn Signal Detector')",
  "niche": one of exactly: "productivity" | "finance" | "creator" | "b2b" | "health" | "education" | "ai-tools" | "ecommerce",
  "problem": "One sentence — the specific pain this solves",
  "targetMarket": "Who pays for this (e.g. 'Freelance designers', 'E-commerce store owners')",
  "revenueModel": "e.g. '$29/mo per seat', '$99 one-time', 'Usage-based $0.01/call'",
  "trendReason": "Why this is hot RIGHT NOW in 2026 — what shifted in the market (1 sentence)",
  "buildComplexity": "low" | "medium" | "high",
  "tags": ["tag1", "tag2", "tag3"],
  "opportunityScore": integer between 65 and 99
}

Spread across niches: 2-3 AI-powered tools, 2-3 automation/workflow tools, 2-3 creator/freelancer tools, rest across b2b/finance/ecommerce. Make titles specific and memorable.`,
    messages: [{ role: 'user', content: 'Generate the trending micro-SaaS opportunities JSON array now.' }],
    maxTokens: 3000,
  })

  const match = result.text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array in AI response')
  try {
    return JSON.parse(match[0]) as MicroSaaSOpportunity[]
  } catch {
    // Retry once with a stricter prompt on malformed JSON
    const retry = await aiComplete({
      system: 'You are a JSON repair tool. Return ONLY valid JSON — no prose, no markdown fences.',
      messages: [{ role: 'user', content: `Fix this broken JSON array and return it valid:\n${match[0]}` }],
      maxTokens: 3000,
    })
    const retryMatch = retry.text.match(/\[[\s\S]*\]/)
    if (!retryMatch) throw new Error('AI returned malformed JSON twice')
    return JSON.parse(retryMatch[0]) as MicroSaaSOpportunity[]
  }
}

// GET — return latest batch, optionally filtered
function fallbackOpportunities(): MicroSaaSOpportunity[] {
  return [
    {
      title: 'Client Proof Pack Builder',
      niche: 'b2b',
      problem: 'Agencies struggle to turn scattered campaign results into client-ready proof packs that justify retainers and renewals.',
      targetMarket: 'Small digital agency owners',
      revenueModel: '$49/mo per workspace',
      trendReason: 'Service buyers increasingly demand measurable proof before renewing retainers.',
      buildComplexity: 'medium',
      tags: ['intake', 'reporting', 'exports'],
      opportunityScore: 91,
    },
    {
      title: 'Returns Triage Desk',
      niche: 'ecommerce',
      problem: 'Shopify teams lose margin because return requests are manually reviewed without a consistent priority queue.',
      targetMarket: 'E-commerce operations managers',
      revenueModel: '$79/mo per store',
      trendReason: 'Return costs remain high while lean teams need faster exception handling.',
      buildComplexity: 'medium',
      tags: ['triage', 'approval', 'analytics'],
      opportunityScore: 89,
    },
    {
      title: 'Creator Sponsor Pipeline',
      niche: 'creator',
      problem: 'Creators miss sponsor revenue because outreach, deliverables, and approval status live across disconnected tools.',
      targetMarket: 'Independent creators and creator managers',
      revenueModel: '$29/mo per creator',
      trendReason: 'More creators are monetizing directly and need lightweight business operations.',
      buildComplexity: 'low',
      tags: ['intake', 'pipeline', 'exports'],
      opportunityScore: 88,
    },
    {
      title: 'Invoice Exception Radar',
      niche: 'finance',
      problem: 'Finance teams waste hours finding invoice exceptions, missing approvals, and payment-risk items before month close.',
      targetMarket: 'Fractional finance teams',
      revenueModel: '$99/mo per team',
      trendReason: 'Lean finance teams are automating close workflows without buying heavy ERP modules.',
      buildComplexity: 'medium',
      tags: ['approval', 'triage', 'reporting'],
      opportunityScore: 87,
    },
    {
      title: 'Course Cohort Signal',
      niche: 'education',
      problem: 'Course operators cannot quickly identify stalled learners, weak lessons, and refund-risk cohorts from basic engagement data.',
      targetMarket: 'Cohort course operators',
      revenueModel: '$59/mo per course',
      trendReason: 'Education businesses are optimizing retention as acquisition costs rise.',
      buildComplexity: 'medium',
      tags: ['analytics', 'triage', 'exports'],
      opportunityScore: 86,
    },
    {
      title: 'Clinic Follow-up Queue',
      niche: 'health',
      problem: 'Wellness clinics lose repeat visits because follow-up tasks, reminders, and client readiness are tracked manually.',
      targetMarket: 'Wellness clinic operators',
      revenueModel: '$69/mo per location',
      trendReason: 'Service clinics are adopting lightweight workflow tools that avoid regulated diagnosis decisions.',
      buildComplexity: 'medium',
      tags: ['intake', 'queue', 'reporting'],
      opportunityScore: 85,
    },
  ]
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const category = searchParams.get('category')
  const limit    = Math.min(Number(searchParams.get('limit') ?? 20), 50)

  try {
    const latest = await prisma.trendingItem.findFirst({
      orderBy: { fetchedAt: 'desc' },
      select:  { batchId: true, fetchedAt: true },
    })

    const where = {
      ...(latest   ? { batchId: latest.batchId } : {}),
      ...(category ? { category }                : {}),
    }

    const items = await prisma.trendingItem.findMany({
      where,
      orderBy: [{ hnScore: 'desc' }, { fetchedAt: 'desc' }],
      take: limit,
    })

    const allBatches = await prisma.trendingItem.groupBy({
      by:      ['batchId', 'fetchedAt'],
      orderBy: { fetchedAt: 'desc' },
      take:    10,
      _count:  { id: true },
    })

    return NextResponse.json({
      ok:   true,
      data: {
        items,
        lastFetched: latest?.fetchedAt ?? null,
        batchCount:  allBatches.length,
        nextFetch:   latest
          ? new Date(latest.fetchedAt.getTime() + 5 * 60 * 60 * 1000).toISOString()
          : null,
      },
    })
  } catch (err) {
    console.error('[trending GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to fetch trending items' }, { status: 500 })
  }
}

// POST — generate fresh micro-SaaS opportunities + persist (cron or authenticated session)
export async function POST(req: NextRequest) {
  const cronSecret  = process.env.CRON_SECRET
  const secret      = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const bearerToken = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  const hasCronAuth = !!(cronSecret && (secret === cronSecret || bearerToken === cronSecret))

  // Also allow any authenticated NextAuth session (manual "Refresh Now" from the UI)
  let hasSessionAuth = false
  if (!hasCronAuth) {
    try {
      const { getServerSession } = await import('next-auth')
      const { authOptions }      = await import('@/lib/authOptions')
      const session = await getServerSession(authOptions)
      hasSessionAuth = !!session?.user
    } catch {
      // getServerSession unavailable in edge — fall through
    }
  }

  if (!hasCronAuth && !hasSessionAuth) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const batchId = `batch-${Date.now()}`

    // AAS v4 — fetch current regime before generating signals (Phase 01: regime-first)
    const currentRegime = await prisma.systemRegime.findFirst({
      orderBy: { classifiedAt: 'desc' },
    }).catch(() => null)
    const regimeClass   = currentRegime?.regimeClass ?? 'unknown'
    const loopVersion   = await prisma.cRSnapshot.count().catch(() => 0)
    const eRatio        = exploreRatio(regimeClass, loopVersion)

    // AAS v4 — compute batch-level saturation: how many existing items share the same niche?
    type NicheCount = { category: string; _count: { id: number } }
    const existingByNiche: NicheCount[] = await prisma.trendingItem.groupBy({
      by: ['category'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }).then(rows => rows as NicheCount[]).catch(() => [] as NicheCount[])
    const totalExisting  = existingByNiche.reduce((s: number, g: NicheCount) => s + g._count.id, 0)
    const nicheCountMap: Record<string, number> = Object.fromEntries(
      existingByNiche.map((g: NicheCount) => [g.category, g._count.id])
    )

    console.log('[trending] generating micro-SaaS opportunities with Groq…')
    let opportunities: MicroSaaSOpportunity[]
    try {
      opportunities = await generateOpportunities()
    } catch (err) {
      console.error('[trending] AI generation failed, using deterministic fallback opportunities:', err)
      opportunities = fallbackOpportunities()
    }
    console.log(`[trending] got ${opportunities.length} opportunities`)

    const rows = opportunities.slice(0, KEEP_TOP).map((op, idx) => {
      const niche          = String(op.niche ?? 'b2b')
      const nicheCount     = nicheCountMap[niche] ?? 0

      // Saturation index: fraction of existing items in same niche vs total.
      // High saturation (>0.6) → information edge is eroding.
      const saturationIndex = totalExisting > 0
        ? Math.min(1, nicheCount / Math.max(totalExisting, 1))
        : 0

      // Confidence: derived from opportunityScore (LLM-assigned) normalised to [0,1].
      // Novelty slots (first 20% of batch, per explore ratio) get lower confidence floor.
      const rawConf      = Math.min(1, (Number(op.opportunityScore) || 70) / 100)
      const isNoveltySlot = idx < Math.ceil(KEEP_TOP * eRatio)
      const confidence   = isNoveltySlot ? Math.max(0.25, rawConf * 0.8) : rawConf

      // causalMechanism: a non-null string summarising WHY this opportunity exists.
      // Null = kill per AAS v4 Phase 02 rule — so we always generate one from LLM data.
      const causalMechanism = op.trendReason
        ? String(op.trendReason).slice(0, 500)
        : `${niche} segment underserved, ${op.revenueModel ?? 'recurring revenue'} viable`

      // Timing advantage placeholder: 0.5 neutral until field consensus data available.
      const timingAdv = 0.5

      return {
        title:           String(op.title      ?? '').slice(0, 300),
        url:             null,
        source:          'nexus_generated',
        category:        niche,
        audience:        'both',
        summary:         String(op.problem    ?? ''),
        useCase:         `${(op.trendReason ?? '').replace(/\u00c2\u00b7/g, '·')} · Revenue: ${op.revenueModel ?? ''}`,
        tags: [
          ...(Array.isArray(op.tags) ? op.tags.map(String) : []),
          op.targetMarket   ? String(op.targetMarket)           : '',
          op.buildComplexity ? `build:${op.buildComplexity}`    : '',
          regimeClass !== 'unknown' ? `regime:${regimeClass}`   : '',
        ].filter(Boolean),
        hnScore:          Number(op.opportunityScore) || 70,
        batchId,
        // AAS v4 signal fields
        confidence,
        causalMechanism,
        regimeClass,
        exploreOrExploit: isNoveltySlot ? 'E' : 'X',
        saturationIndex:  Math.round(saturationIndex * 10000) / 10000,
        timingAdv,
      }
    })

    const created = await prisma.trendingItem.createMany({ data: rows })
    console.log(`[trending] persisted ${created.count} items`)

    // Prune old batches — keep last 5 runs
    await prisma.$executeRaw`
      DELETE FROM "TrendingItem"
      WHERE "batchId" NOT IN (
        SELECT "batchId" FROM (
          SELECT "batchId", MIN("fetchedAt") AS min_at
          FROM "TrendingItem"
          GROUP BY "batchId"
          ORDER BY min_at DESC
          LIMIT 5
        ) kept
      )
    `.catch((e: unknown) => console.error('[trending] prune failed (non-fatal):', e))

    await prisma.auditEvent.create({
      data: {
        action:    'learning_cycle',
        sessionId: 'trending-cron',
        meta: {
          type:        'trending_fetch',
          batchId,
          count:       created.count,
          regimeClass,
          exploreRatio: eRatio,
          loopVersion,
        },
      },
    }).catch(console.error)

    return NextResponse.json({ ok: true, data: { batchId, count: created.count } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[trending POST]', err)
    return NextResponse.json(
      { ok: false, error: 'Trending generation failed', detail: process.env.NODE_ENV === 'development' ? msg : undefined },
      { status: 500 },
    )
  }
}
