import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { type Prisma } from '@prisma/client'
import { exploreRatio } from '@/lib/crCompute'
import { aiComplete } from '@/lib/ai'
import { computeTimingAdvantage } from '@/lib/timingAdvantage'

const KEEP_TOP = 12
const TRENDING_DB_TIMEOUT_MS = 3500
const USE_FAST_LOCAL_FALLBACK =
  process.env.NODE_ENV === 'development' &&
  process.env.TRENDING_USE_DATABASE !== '1'

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

// Fix 9: compute opportunityScore from observable fields rather than trusting LLM self-assignment.
// LLMs tend to cluster at 75-85 regardless of signal quality; this spreads the range correctly.
function computeOpportunityScore(op: MicroSaaSOpportunity): number {
  let score = 50

  // buildComplexity: lower = faster to market = higher score
  if (op.buildComplexity === 'low')    score += 20
  else if (op.buildComplexity === 'medium') score += 10
  // high = 0 bonus

  // revenueModel specificity: contains a dollar amount → concrete pricing
  if (/\$\d+/.test(op.revenueModel ?? '')) score += 10

  // targetMarket specificity: longer and more specific = better signal
  const tmWords = (op.targetMarket ?? '').split(/\s+/).filter(Boolean).length
  if (tmWords >= 4)      score += 10
  else if (tmWords >= 2) score += 5

  // trendReason word count: short reasons are vague
  const trWords = (op.trendReason ?? '').split(/\s+/).filter(Boolean).length
  if (trWords >= 12)     score += 8
  else if (trWords >= 6) score += 4

  // tags count: more workflow tags = more buildable
  const tagCount = Array.isArray(op.tags) ? op.tags.length : 0
  if (tagCount >= 4)     score += 7
  else if (tagCount >= 2) score += 3

  return Math.min(99, Math.max(50, score))
}

async function generateOpportunities(): Promise<MicroSaaSOpportunity[]> {
  const result = await aiComplete({
    system: `You are a micro-SaaS trend analyst for NEXUS OS, an AI-powered software delivery platform. Generate ${KEEP_TOP} trending micro-SaaS opportunities that are genuinely viral and underserved right now in 2026.

Focus on specific niches with real revenue potential — not generic ideas. Think: what are people actually paying for and searching for today?

Each opportunity must be ready for the One-Click Pipeline's MVP strategy:
- The problem must be concrete enough to derive exactly 3 MVP workflows.
- The target market must name the buyer/user sharply in 5+ words, e.g. "small marketing agencies managing recurring retainers"; never use a workflow tag like "exports", "reporting", "intake", "analytics", or "automation" as the market.
- The niche/category must describe the operational buying category, not just broad "B2B SaaS" when a sharper category is obvious.
- Tags should include workflow nouns the app can turn into screens, such as "intake", "triage", "approval", "reporting", "exports", "analytics", or the domain-specific equivalents. Tags are never the target market.
- Avoid ideas that require regulated infrastructure, real medical/legal/financial decisions, or external integrations to be useful at MVP stage.

Return a JSON array ONLY (no preamble, no markdown). Each object must have EXACTLY these fields:
{
  "title": "Short catchy app name (e.g. 'Proposal PDF Autopilot', 'Churn Signal Detector')",
  "niche": one of exactly: "productivity" | "finance" | "creator" | "b2b" | "health" | "education" | "ai-tools" | "ecommerce",
  "problem": "One sentence — the specific pain this solves",
  "targetMarket": "Who pays for this in 5+ specific words (e.g. 'small paid media agencies managing client retainers')",
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

// ─── Workspace-scoped idea fetch helper ──────────────────────────────────────

async function getWorkspaceIdeas(workspaceId: string, category: string | null, limit: number) {
  const { prisma: db } = await import('@/lib/prisma')
  const where: Record<string, unknown> = { workspaceId, status: { in: ['fresh', 'bookmarked'] } }
  if (category) where.niche = category
  return db.workspaceIdea.findMany({
    where:   where as Prisma.WorkspaceIdeaWhereInput,
    orderBy: [{ opportunityScore: 'desc' }, { createdAt: 'desc' }],
    take:    limit,
  })
}

// GET — return latest batch, optionally filtered
function fallbackOpportunities(): MicroSaaSOpportunity[] {
  return [
    {
      title: 'Client Proof Pack Builder',
      niche: 'b2b',
      problem: 'Agencies struggle to turn scattered campaign results into client-ready proof packs that justify retainers and renewals.',
      targetMarket: 'Small to mid-sized marketing agencies managing recurring client retainers',
      revenueModel: '$99/mo per workspace',
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
    {
      title: 'Meeting Action Extractor',
      niche: 'ai-tools',
      problem: 'Customer-facing teams lose commitments because meeting notes, owners, and next steps are scattered after every call.',
      targetMarket: 'Client success teams running weekly account calls',
      revenueModel: '$39/mo per seat',
      trendReason: 'AI note takers created more transcripts, but teams still need accountable follow-through workflows.',
      buildComplexity: 'low',
      tags: ['intake', 'approval', 'queue'],
      opportunityScore: 84,
    },
    {
      title: 'Proposal Risk Scanner',
      niche: 'productivity',
      problem: 'Service firms send proposals without spotting risky terms, missing scope, and weak proof before buyers compare vendors.',
      targetMarket: 'Small consulting firms sending fixed-fee proposals',
      revenueModel: '$49/mo per workspace',
      trendReason: 'Buyers are scrutinizing vendor value harder while lean firms need faster proposal QA.',
      buildComplexity: 'low',
      tags: ['review', 'risk', 'exports'],
      opportunityScore: 83,
    },
    {
      title: 'Subscription Save Desk',
      niche: 'b2b',
      problem: 'Small SaaS teams do not know which cancellation requests are saveable until churn has already happened.',
      targetMarket: 'Bootstrapped SaaS founders managing customer retention',
      revenueModel: '$79/mo per workspace',
      trendReason: 'Retention is getting more attention as paid acquisition remains expensive.',
      buildComplexity: 'medium',
      tags: ['triage', 'analytics', 'playbooks'],
      opportunityScore: 82,
    },
    {
      title: 'Creator Content Repurposer',
      niche: 'creator',
      problem: 'Solo creators struggle to turn one long-form asset into a structured weekly queue of posts, hooks, and sponsor-safe snippets.',
      targetMarket: 'Independent creators publishing across multiple channels',
      revenueModel: '$29/mo per creator',
      trendReason: 'Creators are being asked to publish more formats without hiring operations help.',
      buildComplexity: 'low',
      tags: ['intake', 'calendar', 'exports'],
      opportunityScore: 81,
    },
    {
      title: 'Support Escalation Radar',
      niche: 'b2b',
      problem: 'Support managers miss the tickets that are about to become churn, refund, or executive escalation risks.',
      targetMarket: 'B2B support teams handling high-value accounts',
      revenueModel: '$99/mo per team',
      trendReason: 'Customer support is moving from reactive ticket handling to revenue protection.',
      buildComplexity: 'medium',
      tags: ['triage', 'priority', 'analytics'],
      opportunityScore: 80,
    },
    {
      title: 'Ad Creative Winner Board',
      niche: 'ecommerce',
      problem: 'E-commerce marketers cannot quickly turn messy ad test results into a clear queue of winning creatives and next experiments.',
      targetMarket: 'Shopify brands running weekly paid social tests',
      revenueModel: '$89/mo per brand',
      trendReason: 'Creative testing velocity is becoming the main paid growth advantage for small brands.',
      buildComplexity: 'medium',
      tags: ['reporting', 'ranking', 'exports'],
      opportunityScore: 79,
    },
  ]
}

function fallbackTrendingItems(limit: number, category: string | null) {
  const now = new Date()
  return fallbackOpportunities()
    .filter(item => !category || item.niche === category)
    .slice(0, limit)
    .map((item, index) => ({
      id: `fallback-${slugifyTitle(item.title)}-${index}`,
      title: item.title,
      url: null,
      source: 'NEXUS deterministic feed',
      category: item.niche,
      audience: item.targetMarket,
      summary: item.problem,
      useCase: `${item.trendReason} · Revenue: ${item.revenueModel}`,
      tags: [...item.tags, item.targetMarket],
      hnScore: item.opportunityScore,
      fetchedAt: now,
      batchId: 'fallback-current',
      confidence: item.opportunityScore,
      regimeClass: 'fallback',
    }))
}

function slugifyTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'idea'
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const category  = searchParams.get('category')
  const limit     = Math.min(Number(searchParams.get('limit') ?? 20), 50)
  const scope     = searchParams.get('scope') ?? 'global'   // 'global' | 'workspace'
  const wsId      = searchParams.get('ws')                   // workspaceId for scope=workspace

  // ── Workspace-scoped feed (authenticated, owned workspace only) ────────────
  if (scope === 'workspace' && wsId) {
    try {
      const { getServerSession } = await import('next-auth')
      const { authOptions }      = await import('@/lib/authOptions')
      const session = await getServerSession(authOptions)
      const userId  = (session?.user as { id?: string } | null)?.id ?? null
      if (!userId) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      }
      // Verify ownership
      const ws = await prisma.workspace.findFirst({
        where: { id: wsId, ownerId: userId },
        select: { id: true, name: true },
      })
      if (!ws) {
        return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })
      }
      const ideas = await getWorkspaceIdeas(wsId, category, limit)
      const profile = await prisma.workspaceIntelligenceProfile.findUnique({
        where:  { workspaceId: wsId },
        select: { lastGeneratedAt: true, refreshCadenceHours: true, primaryIndustry: true },
      })
      return NextResponse.json({
        ok:   true,
        data: {
          scope:       'workspace',
          workspaceId: wsId,
          items:       ideas,
          lastFetched: profile?.lastGeneratedAt ?? null,
          nextFetch:   profile?.lastGeneratedAt
            ? new Date(profile.lastGeneratedAt.getTime() + (profile.refreshCadenceHours ?? 24) * 3600000).toISOString()
            : null,
          industry:    profile?.primaryIndustry ?? 'unconfigured',
        },
      })
    } catch (err) {
      console.error('[trending GET workspace]', err)
      return NextResponse.json({ ok: false, error: 'Failed to fetch workspace ideas' }, { status: 500 })
    }
  }

  // ── Global feed (original behavior, unchanged) ─────────────────────────────
  if (USE_FAST_LOCAL_FALLBACK) {
    const items = fallbackTrendingItems(limit, category)
    return NextResponse.json({
      ok: true,
      data: {
        items,
        lastFetched: items[0]?.fetchedAt ?? null,
        batchCount: 0,
        nextFetch: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        fallback: true,
        source: 'local-deterministic',
      },
    })
  }

  try {
    const latest = await withTimeout(prisma.trendingItem.findFirst({
      orderBy: { fetchedAt: 'desc' },
      select:  { batchId: true, fetchedAt: true },
    }), TRENDING_DB_TIMEOUT_MS, 'trending latest batch')

    const where = {
      ...(latest   ? { batchId: latest.batchId } : {}),
      ...(category ? { category }                : {}),
    }

    const [items, allBatches] = await withTimeout(Promise.all([
      prisma.trendingItem.findMany({
      where,
      orderBy: [{ hnScore: 'desc' }, { fetchedAt: 'desc' }],
      take: limit,
      }),
      prisma.trendingItem.groupBy({
      by:      ['batchId', 'fetchedAt'],
      orderBy: { fetchedAt: 'desc' },
      take:    10,
      _count:  { id: true },
      }),
    ]), TRENDING_DB_TIMEOUT_MS, 'trending feed query')

    const minimumCount = Math.min(limit, KEEP_TOP)
    const seenTitles = new Set(items.map(item => item.title.toLowerCase().trim()))
    const supplementedItems = items.length >= minimumCount
      ? items
      : [
          ...items,
          ...fallbackTrendingItems(limit, category)
            .filter(item => !seenTitles.has(item.title.toLowerCase().trim()))
            .slice(0, minimumCount - items.length),
        ]

    return NextResponse.json({
      ok:   true,
      data: {
        items:       supplementedItems,
        lastFetched: latest?.fetchedAt ?? null,
        batchCount:  allBatches.length,
        nextFetch:   latest
          ? new Date(latest.fetchedAt.getTime() + 5 * 60 * 60 * 1000).toISOString()
          : null,
        supplemented: supplementedItems.length > items.length,
      },
    })
  } catch (err) {
    console.error('[trending GET] using deterministic fallback:', err)
    const items = fallbackTrendingItems(limit, category)
    return NextResponse.json({
      ok: true,
      data: {
        items,
        lastFetched: items[0]?.fetchedAt ?? null,
        batchCount: 0,
        nextFetch: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        fallback: true,
      },
    })
  }
}

// POST — generate fresh micro-SaaS opportunities + persist (cron or authenticated session)
export async function POST(req: NextRequest) {
  const cronSecret  = process.env.CRON_SECRET
  const secret      = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const bearerToken = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  const hasCronAuth = !!(cronSecret && (secret === cronSecret || bearerToken === cronSecret))

  // Also allow any authenticated NextAuth session (manual "Refresh Now" from the UI)
  let sessionUserId: string | null = null
  if (!hasCronAuth) {
    try {
      const { getServerSession } = await import('next-auth')
      const { authOptions }      = await import('@/lib/authOptions')
      const session = await getServerSession(authOptions)
      sessionUserId = (session?.user as { id?: string } | undefined)?.id ?? session?.user?.email ?? null
    } catch {
      // getServerSession unavailable in edge — fall through
    }
  }

  if (!hasCronAuth && !sessionUserId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit: 1 POST per hour per authenticated user (cron calls bypass this)
  if (!hasCronAuth && sessionUserId) {
    try {
      const { Redis } = await import('@upstash/redis')
      const url   = process.env.UPSTASH_REDIS_REST_URL?.trim()
      const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
      if (url && token && url.startsWith('https://')) {
        const redis = new Redis({ url, token })
        const rlKey = `rl:trending:${sessionUserId}`
        const count = await redis.incr(rlKey)
        if (count === 1) await redis.expire(rlKey, 3600)   // 1 hour window
        if (count > 1) {
          const ttl = await redis.ttl(rlKey)
          return NextResponse.json(
            { ok: false, error: `Rate limit: 1 refresh per hour. Retry in ${Math.ceil(ttl / 60)} min.` },
            { status: 429 },
          )
        }
      }
    } catch {
      // Redis unavailable — allow through rather than blocking a legitimate request
    }
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

    // AAS v4 — compute batch-level saturation: items in same niche within last 7 days only.
    // All-time counts inflate saturation for evergreen niches — window to recent signal.
    const saturationSince = new Date(Date.now() - 7 * 86400000)
    type NicheCount = { category: string; _count: { id: number } }
    const existingByNiche: NicheCount[] = await prisma.trendingItem.groupBy({
      by: ['category'],
      _count: { id: true },
      where: { fetchedAt: { gte: saturationSince } },
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

    // Pre-compute per-niche timing advantage in parallel before the synchronous map.
    const uniqueNiches = [...new Set(opportunities.slice(0, KEEP_TOP).map(op => String(op.niche ?? 'b2b')))]
    const timingAdvMap: Record<string, number> = {}
    await Promise.all(
      uniqueNiches.map(async niche => {
        try {
          const t = await computeTimingAdvantage([niche])
          timingAdvMap[niche] = t.timingAdv
        } catch {
          timingAdvMap[niche] = 0.5
        }
      })
    )

    const rows = opportunities.slice(0, KEEP_TOP).map((op, idx) => {
      const niche          = String(op.niche ?? 'b2b')
      const nicheCount     = nicheCountMap[niche] ?? 0

      // Saturation index: fraction of existing items in same niche vs total.
      // High saturation (>0.6) → information edge is eroding.
      const saturationIndex = totalExisting > 0
        ? Math.min(1, nicheCount / Math.max(totalExisting, 1))
        : 0

      // Confidence: derived from computed opportunityScore (observable fields, not LLM self-assignment).
      // Novelty slots (first 20% of batch, per explore ratio) get lower confidence floor.
      const computedScore = computeOpportunityScore(op)
      const rawConf       = Math.min(1, computedScore / 100)
      const isNoveltySlot = idx < Math.ceil(KEEP_TOP * eRatio)
      const confidence    = isNoveltySlot ? Math.max(0.25, rawConf * 0.8) : rawConf

      // causalMechanism: a non-null string summarising WHY this opportunity exists.
      // Null = kill per AAS v4 Phase 02 rule — so we always generate one from LLM data.
      const causalMechanism = op.trendReason
        ? String(op.trendReason).slice(0, 500)
        : `${niche} segment underserved, ${op.revenueModel ?? 'recurring revenue'} viable`

      // Timing advantage: pre-computed per unique niche before this map (see timingAdvMap above).
      const timingAdv = timingAdvMap[niche] ?? 0.5

      return {
        title:           String(op.title      ?? '').slice(0, 300),
        url:             null,
        source:          'nexus_generated',
        category:        niche,
        audience:        op.targetMarket ? String(op.targetMarket).slice(0, 300) : 'specific B2B operators',
        summary:         String(op.problem    ?? ''),
        useCase:         `${(op.trendReason ?? '').replace(/\u00c2\u00b7/g, '·')} · Revenue: ${op.revenueModel ?? ''}`,
        tags: [
          ...(Array.isArray(op.tags) ? op.tags.map(String) : []),
          op.targetMarket   ? String(op.targetMarket)           : '',
          op.buildComplexity ? `build:${op.buildComplexity}`    : '',
          regimeClass !== 'unknown' ? `regime:${regimeClass}`   : '',
        ].filter(Boolean),
        hnScore:          computedScore,
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
