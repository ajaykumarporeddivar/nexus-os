import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { type Prisma } from '@prisma/client'
import { aiComplete } from '@/lib/ai'
import { exploreRatio } from '@/lib/crCompute'
import { computeFreshUntil, getTaxonomyNode, getSubcategoryLabels } from '@/lib/industryTaxonomy'
import crypto from 'crypto'

const KEEP_TOP = 12

// ─── Ownership helper ─────────────────────────────────────────────────────────

async function getOwnedWorkspace(id: string, userId: string) {
  return prisma.workspace.findFirst({
    where: { id, ownerId: userId },
    select: { id: true, name: true },
  })
}

// ─── Content hash for exact dedup ─────────────────────────────────────────────

function contentHash(title: string, problem: string): string {
  return crypto
    .createHash('sha256')
    .update(`${title.toLowerCase().trim()}|${problem.toLowerCase().trim()}`)
    .digest('hex')
    .slice(0, 32)
}

// ─── Workspace-scoped generation prompt builder ───────────────────────────────

interface WorkspaceGenerationContext {
  workspaceName:         string
  primaryIndustry:       string
  subcategoryLabels:     string[]
  targetMarket:          string
  preferredRevenueModel: string
  buildComplexityPref:   string
  generationAggression:  string
  previousIdeaTitles:    string[]
  regimeClass:           string
  exploreRatioValue:     number
  loopVersion:           number
  enabledNiches:         string[]
}

function buildGenerationPrompt(ctx: WorkspaceGenerationContext): string {
  const industryLabel = getTaxonomyNode(ctx.primaryIndustry)?.label ?? ctx.primaryIndustry
  const subcatText = ctx.subcategoryLabels.length > 0
    ? ctx.subcategoryLabels.join(', ')
    : 'General'
  const nicheFilter = ctx.enabledNiches.length > 0
    ? `Focus ONLY on these niches: ${ctx.enabledNiches.join(', ')}.`
    : 'Spread across relevant niches: productivity, b2b, ai-tools, finance, or domain-specific.'

  const aggressionGuidance = {
    conservative: 'Favor proven business models with clear demand. Avoid experimental or emerging tech.',
    balanced:     'Mix proven models with emerging opportunities. Some risk is acceptable.',
    aggressive:   'Favor contrarian, emerging, and underserved opportunities. Higher risk, higher upside.',
  }[ctx.generationAggression] ?? 'Mix proven models with emerging opportunities.'

  const complexityGuidance = {
    quick: 'Prefer low build complexity — apps that can be shipped in 1–2 weeks.',
    mid:   'Prefer medium build complexity — apps that take 3–6 weeks.',
    deep:  'Prefer deep, feature-rich apps — complex systems worth 6+ weeks of development.',
  }[ctx.buildComplexityPref] ?? 'Prefer medium build complexity.'

  const prevTitles = ctx.previousIdeaTitles.length > 0
    ? `\nPREVIOUSLY GENERATED IDEAS FOR THIS WORKSPACE (do NOT regenerate these concepts):\n${ctx.previousIdeaTitles.map(t => `- ${t}`).join('\n')}\n`
    : ''

  return `You are a micro-SaaS trend analyst for "${ctx.workspaceName}", a workspace specializing in the ${industryLabel} industry (focus: ${subcatText}).

TARGET CUSTOMER: ${ctx.targetMarket} market buyers
PREFERRED REVENUE MODEL: ${ctx.preferredRevenueModel}
IDEA STYLE: ${aggressionGuidance}
BUILD COMPLEXITY: ${complexityGuidance}
${nicheFilter}
${prevTitles}
Generate ${KEEP_TOP} trending micro-SaaS opportunities SPECIFIC to ${industryLabel}/${subcatText} clients.

Rules:
- Every idea must be directly relevant to ${industryLabel} businesses or buyers
- The problem must be a real pain point experienced by ${industryLabel} operators/teams
- Revenue model should align with ${ctx.preferredRevenueModel} preference where possible
- Build complexity should match ${ctx.buildComplexityPref} preference
- Do NOT generate generic SaaS ideas that could apply to any industry
- Each idea must be ready for One-Click Pipeline MVP: the problem should derive exactly 3 workflows
- Avoid ideas requiring regulated infrastructure, real medical/legal/financial decisions at MVP

AAS SYSTEM CONTEXT (for internal signal quality):
- Regime: ${ctx.regimeClass}
- Explore ratio: ${ctx.exploreRatioValue.toFixed(2)} (${ctx.exploreRatioValue > 0.4 ? 'novelty-biased' : 'exploitation-biased'})

Return a JSON array ONLY (no preamble, no markdown). Each object must have EXACTLY these fields:
{
  "title": "Short catchy app name specific to ${industryLabel}",
  "niche": one of exactly: "productivity" | "finance" | "creator" | "b2b" | "health" | "education" | "ai-tools" | "ecommerce",
  "problem": "One sentence — the specific pain this solves for ${industryLabel} teams",
  "targetMarket": "Who specifically pays (e.g. '${industryLabel} operations managers')",
  "revenueModel": "e.g. '$49/mo per team', '$99 one-time', 'Usage-based'",
  "trendReason": "Why this is hot RIGHT NOW for ${industryLabel} in 2026",
  "buildComplexity": "low" | "medium" | "high",
  "tags": ["tag1", "tag2", "tag3"],
  "opportunityScore": integer between 65 and 99
}`
}

// ─── Fallback ideas for workspace generation failures ─────────────────────────

function buildFallbackIdeas(ctx: WorkspaceGenerationContext) {
  const industry = getTaxonomyNode(ctx.primaryIndustry)?.label ?? ctx.primaryIndustry
  return [
    {
      title:           `${industry} Workflow Automator`,
      niche:           'b2b',
      problem:         `${industry} teams waste hours on manual, repetitive workflow tasks that could be automated.`,
      targetMarket:    `${industry} operations managers`,
      revenueModel:    '$49/mo per team',
      trendReason:     `${industry} businesses are adopting automation tools to reduce operational overhead.`,
      buildComplexity: 'medium' as const,
      tags:            ['workflow', 'automation', 'productivity'],
      opportunityScore: 78,
    },
    {
      title:           `${industry} Client Portal`,
      niche:           'b2b',
      problem:         `${industry} providers lose time to client status requests and email threads for routine updates.`,
      targetMarket:    `${industry} service providers`,
      revenueModel:    '$29/mo per workspace',
      trendReason:     `${industry} clients increasingly expect self-serve status visibility without scheduling calls.`,
      buildComplexity: 'low' as const,
      tags:            ['client', 'portal', 'reporting'],
      opportunityScore: 74,
    },
  ]
}

// ─── POST /api/workspaces/:id/generate ───────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Cron scheduler bypass: accept x-cron-secret as alternative to session auth.
  // When called from /api/cron/workspace-scheduler, ownership is verified by
  // looking up the workspace directly (no ownerId filter needed for internal calls).
  const cronSecret   = process.env.CRON_SECRET
  const incomingCron = req.headers.get('x-cron-secret')
  const isCronCall   = cronSecret && incomingCron === cronSecret

  let resolvedUserId: string
  let workspace: { id: string; name: string }

  if (isCronCall) {
    // Look up workspace directly for audit logging — no session required
    const ws = await prisma.workspace.findUnique({
      where:  { id: params.id },
      select: { id: true, name: true, ownerId: true },
    })
    if (!ws) return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })
    resolvedUserId = ws.ownerId ?? 'system'
    workspace = { id: ws.id, name: ws.name }
  } else {
    const auth = await requireSession()
    if (auth.error) return auth.error
    const owned = await getOwnedWorkspace(params.id, auth.user.id!)
    if (!owned) {
      return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })
    }
    resolvedUserId = auth.user.id!
    workspace = owned
  }

  let body: { force?: boolean; batchId?: string } = {}
  try { body = await req.json() } catch { /* optional body */ }

  // ── Load intelligence profile ──────────────────────────────────────────────
  let profile = await prisma.workspaceIntelligenceProfile.findUnique({
    where: { workspaceId: params.id },
  })

  if (!profile) {
    // Auto-create default profile
    profile = await prisma.workspaceIntelligenceProfile.create({
      data: {
        workspaceId:           params.id,
        primaryIndustry:       'unconfigured',
        subcategories:         [],
        targetMarket:          'smb',
        preferredRevenueModel: 'subscription',
        buildComplexityPref:   'mid',
        generationAggression:  'balanced',
        refreshCadenceHours:   24,
        enabledNiches:         [],
      },
    })
  }

  // ── Stale detection (skip if force=true) ──────────────────────────────────
  if (!body.force && profile.lastGeneratedAt) {
    const nextRefresh = new Date(
      profile.lastGeneratedAt.getTime() + profile.refreshCadenceHours * 60 * 60 * 1000
    )
    if (new Date() < nextRefresh) {
      return NextResponse.json({
        ok:   true,
        data: {
          skipped:     true,
          reason:      'not_stale',
          nextRefresh: nextRefresh.toISOString(),
        },
      })
    }
  }

  const batchId = body.batchId ?? `ws-${params.id}-${Date.now()}`

  // ── Create generation job (idempotency guard) ─────────────────────────────
  let job = await prisma.workspaceGenerationJob.findUnique({ where: { batchId } })
  if (job?.status === 'running' || job?.status === 'done') {
    return NextResponse.json({
      ok:   true,
      data: { jobId: job.id, batchId, status: job.status, ideasGenerated: job.ideasGenerated },
    })
  }

  job = await prisma.workspaceGenerationJob.upsert({
    where:  { batchId },
    create: { workspaceId: params.id, batchId, status: 'running', startedAt: new Date() },
    update: { status: 'running', startedAt: new Date() },
  })

  try {
    // ── AAS v4 signals ──────────────────────────────────────────────────────
    const currentRegime = await prisma.systemRegime.findFirst({
      orderBy: { classifiedAt: 'desc' },
    }).catch(() => null)
    const regimeClass  = currentRegime?.regimeClass ?? 'unknown'
    const loopVersion  = await prisma.cRSnapshot.count().catch(() => 0)
    const eRatio       = exploreRatio(regimeClass, loopVersion)

    // ── Previous ideas for dedup ────────────────────────────────────────────
    const prevIdeas = await prisma.workspaceIdea.findMany({
      where:   { workspaceId: params.id },
      orderBy: { createdAt: 'desc' },
      take:    30,
      select:  { title: true, contentHash: true },
    })
    const previousIdeaTitles  = prevIdeas.map(i => i.title).slice(0, 5)
    const previousHashes      = new Set(prevIdeas.map(i => i.contentHash))

    // ── Subcategory labels for prompt ───────────────────────────────────────
    const subcategoryLabels = getSubcategoryLabels(
      profile.primaryIndustry,
      profile.subcategories,
    )

    // ── Saturation data ─────────────────────────────────────────────────────
    type NicheCount = { niche: string; _count: { id: number } }
    const existingByNiche: NicheCount[] = await prisma.workspaceIdea.groupBy({
      by:      ['niche'],
      where:   { workspaceId: params.id },
      _count:  { id: true },
      orderBy: { _count: { id: 'desc' } },
    }).then(rows => rows as NicheCount[]).catch(() => [] as NicheCount[])

    const totalExisting  = existingByNiche.reduce((s, g) => s + g._count.id, 0)
    const nicheCountMap  = Object.fromEntries(existingByNiche.map(g => [g.niche, g._count.id]))

    // ── Build generation context ────────────────────────────────────────────
    const genCtx: WorkspaceGenerationContext = {
      workspaceName:         workspace.name,
      primaryIndustry:       profile.primaryIndustry,
      subcategoryLabels,
      targetMarket:          profile.targetMarket,
      preferredRevenueModel: profile.preferredRevenueModel,
      buildComplexityPref:   profile.buildComplexityPref,
      generationAggression:  profile.generationAggression,
      previousIdeaTitles,
      regimeClass,
      exploreRatioValue:     eRatio,
      loopVersion,
      enabledNiches:         profile.enabledNiches,
    }

    // ── Call AI ─────────────────────────────────────────────────────────────
    let rawIdeas: Array<{
      title: string; niche: string; problem: string; targetMarket: string
      revenueModel: string; trendReason: string; buildComplexity: string
      tags: string[]; opportunityScore: number
    }>

    try {
      const result = await aiComplete({
        system:    buildGenerationPrompt(genCtx),
        messages:  [{ role: 'user', content: 'Generate the workspace-specific micro-SaaS opportunities JSON array now.' }],
        maxTokens: 3500,
      })
      const match = result.text.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('No JSON array in AI response')
      rawIdeas = JSON.parse(match[0])
    } catch (err) {
      console.error(`[workspace/generate] AI failed for workspace ${params.id}:`, err)
      rawIdeas = buildFallbackIdeas(genCtx)
    }

    // ── Dedup + build rows ──────────────────────────────────────────────────
    let deDupedCount = 0
    const rows: Prisma.WorkspaceIdeaCreateManyInput[] = []

    for (let idx = 0; idx < Math.min(rawIdeas.length, KEEP_TOP); idx++) {
      const op = rawIdeas[idx]
      const hash = contentHash(op.title ?? '', op.problem ?? '')

      // Exact dedup: skip if this content hash already exists in workspace
      if (previousHashes.has(hash)) {
        deDupedCount++
        continue
      }

      const niche          = String(op.niche ?? 'b2b')
      const nicheCount     = nicheCountMap[niche] ?? 0
      const saturationIndex = totalExisting > 0
        ? Math.min(1, nicheCount / Math.max(totalExisting, 1))
        : 0

      const rawConf       = Math.min(1, (Number(op.opportunityScore) || 70) / 100)
      const isNoveltySlot = idx < Math.ceil(KEEP_TOP * eRatio)
      const confidence    = isNoveltySlot ? Math.max(0.25, rawConf * 0.8) : rawConf

      const causalMechanism = op.trendReason
        ? String(op.trendReason).slice(0, 500)
        : `${niche} segment underserved in ${genCtx.primaryIndustry}`

      rows.push({
        workspaceId:     params.id,
        title:           String(op.title      ?? '').slice(0, 300),
        niche,
        problem:         String(op.problem    ?? ''),
        targetMarket:    String(op.targetMarket ?? ''),
        revenueModel:    String(op.revenueModel ?? ''),
        trendReason:     String(op.trendReason  ?? ''),
        buildComplexity: ['low','medium','high'].includes(op.buildComplexity) ? op.buildComplexity : 'medium',
        tags:            Array.isArray(op.tags) ? op.tags.map(String).slice(0, 8) : [],
        opportunityScore: Math.min(99, Math.max(50, Number(op.opportunityScore) || 70)),
        confidence,
        causalMechanism,
        regimeClass,
        exploreOrExploit: isNoveltySlot ? 'E' : 'X',
        saturationIndex:  Math.round(saturationIndex * 10000) / 10000,
        timingAdv:        0.5,  // neutral default — will be enriched by AAS timing computation
        status:           'fresh',
        freshUntil:       computeFreshUntil(niche),
        batchId,
        generationVersion: profile.generationCount + 1,
        contentHash:      hash,
      })
    }

    // ── Persist ideas ───────────────────────────────────────────────────────
    const created = rows.length > 0
      ? await prisma.workspaceIdea.createMany({ data: rows })
      : { count: 0 }

    // ── Update profile stats ────────────────────────────────────────────────
    await prisma.workspaceIntelligenceProfile.update({
      where: { workspaceId: params.id },
      data:  {
        lastGeneratedAt:  new Date(),
        generationCount:  { increment: 1 },
      },
    })

    // ── Mark job done ───────────────────────────────────────────────────────
    await prisma.workspaceGenerationJob.update({
      where: { id: job.id },
      data:  {
        status:         'done',
        completedAt:    new Date(),
        ideasGenerated: created.count,
        deDupedCount,
      },
    })

    // ── Audit event ─────────────────────────────────────────────────────────
    await prisma.auditEvent.create({
      data: {
        action:    'workspace_generation',
        sessionId: `ws-${params.id}`,
        userId:    resolvedUserId,
        meta: {
          workspaceId:    params.id,
          workspaceName:  workspace.name,
          industry:       profile.primaryIndustry,
          ideasGenerated: created.count,
          deDupedCount,
          regimeClass,
          exploreRatio:   eRatio,
          loopVersion,
          batchId,
        },
      },
    }).catch(console.error)

    return NextResponse.json({
      ok:   true,
      data: {
        jobId:          job.id,
        batchId,
        ideasGenerated: created.count,
        deDupedCount,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[workspace/generate] fatal error for workspace ${params.id}:`, err)

    await prisma.workspaceGenerationJob.update({
      where: { id: job.id },
      data:  { status: 'failed', errorMessage: msg, completedAt: new Date() },
    }).catch(console.error)

    return NextResponse.json(
      { ok: false, error: 'Workspace generation failed', detail: process.env.NODE_ENV === 'development' ? msg : undefined },
      { status: 500 },
    )
  }
}
