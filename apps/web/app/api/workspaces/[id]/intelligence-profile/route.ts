import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { VALID_INDUSTRY_IDS, VALID_SUBCATEGORY_IDS } from '@/lib/industryTaxonomy'

// ─── Ownership helper ─────────────────────────────────────────────────────────

async function getOwnedWorkspace(id: string, userId: string) {
  return prisma.workspace.findFirst({
    where: { id, ownerId: userId },
    select: { id: true, name: true },
  })
}

// ─── GET /api/workspaces/:id/intelligence-profile ─────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const workspace = await getOwnedWorkspace(params.id, auth.user.id!)
  if (!workspace) {
    return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })
  }

  const profile = await prisma.workspaceIntelligenceProfile.findUnique({
    where: { workspaceId: params.id },
  })

  if (!profile) {
    // Profile doesn't exist yet — create default and return it
    const created = await prisma.workspaceIntelligenceProfile.create({
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
    return NextResponse.json({ ok: true, data: { profile: created } })
  }

  return NextResponse.json({ ok: true, data: { profile } })
}

// ─── PUT /api/workspaces/:id/intelligence-profile ─────────────────────────────

const VALID_TARGET_MARKETS          = new Set(['smb', 'enterprise', 'consumer', 'mixed'])
const VALID_REVENUE_MODELS          = new Set(['subscription', 'usage', 'one-time', 'hybrid'])
const VALID_COMPLEXITY_PREFS        = new Set(['quick', 'mid', 'deep'])
const VALID_GENERATION_AGGRESSIONS  = new Set(['conservative', 'balanced', 'aggressive'])
const VALID_NICHES                  = new Set(['productivity', 'finance', 'creator', 'b2b', 'health', 'education', 'ai-tools', 'ecommerce'])

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const workspace = await getOwnedWorkspace(params.id, auth.user.id!)
  if (!workspace) {
    return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  // ── Validate and sanitize each allowed field ──────────────────────────────

  const data: Record<string, unknown> = {}

  if (body.primaryIndustry !== undefined) {
    const v = String(body.primaryIndustry).trim()
    if (v !== 'unconfigured' && !VALID_INDUSTRY_IDS.has(v)) {
      return NextResponse.json({ ok: false, error: `Invalid primaryIndustry: ${v}` }, { status: 400 })
    }
    data.primaryIndustry = v
  }

  if (body.subcategories !== undefined) {
    if (!Array.isArray(body.subcategories)) {
      return NextResponse.json({ ok: false, error: 'subcategories must be an array' }, { status: 400 })
    }
    const cleaned = (body.subcategories as unknown[])
      .map(s => String(s).trim())
      .filter(s => VALID_SUBCATEGORY_IDS.has(s))
      .slice(0, 10)
    data.subcategories = cleaned
  }

  if (body.targetMarket !== undefined) {
    const v = String(body.targetMarket).trim()
    if (!VALID_TARGET_MARKETS.has(v)) {
      return NextResponse.json({ ok: false, error: `Invalid targetMarket: ${v}` }, { status: 400 })
    }
    data.targetMarket = v
  }

  if (body.preferredRevenueModel !== undefined) {
    const v = String(body.preferredRevenueModel).trim()
    if (!VALID_REVENUE_MODELS.has(v)) {
      return NextResponse.json({ ok: false, error: `Invalid preferredRevenueModel: ${v}` }, { status: 400 })
    }
    data.preferredRevenueModel = v
  }

  if (body.buildComplexityPref !== undefined) {
    const v = String(body.buildComplexityPref).trim()
    if (!VALID_COMPLEXITY_PREFS.has(v)) {
      return NextResponse.json({ ok: false, error: `Invalid buildComplexityPref: ${v}` }, { status: 400 })
    }
    data.buildComplexityPref = v
  }

  if (body.generationAggression !== undefined) {
    const v = String(body.generationAggression).trim()
    if (!VALID_GENERATION_AGGRESSIONS.has(v)) {
      return NextResponse.json({ ok: false, error: `Invalid generationAggression: ${v}` }, { status: 400 })
    }
    data.generationAggression = v
  }

  if (body.refreshCadenceHours !== undefined) {
    const v = Number(body.refreshCadenceHours)
    if (!Number.isInteger(v) || v < 1 || v > 168) {
      return NextResponse.json({ ok: false, error: 'refreshCadenceHours must be integer 1–168' }, { status: 400 })
    }
    data.refreshCadenceHours = v
  }

  if (body.enabledNiches !== undefined) {
    if (!Array.isArray(body.enabledNiches)) {
      return NextResponse.json({ ok: false, error: 'enabledNiches must be an array' }, { status: 400 })
    }
    const cleaned = (body.enabledNiches as unknown[])
      .map(s => String(s).trim())
      .filter(s => VALID_NICHES.has(s))
    data.enabledNiches = cleaned
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: 'No valid fields to update' }, { status: 400 })
  }

  // Upsert — create with defaults if not exists, merge fields if exists
  const profile = await prisma.workspaceIntelligenceProfile.upsert({
    where: { workspaceId: params.id },
    create: {
      workspaceId:           params.id,
      primaryIndustry:       (data.primaryIndustry as string)       ?? 'unconfigured',
      subcategories:         (data.subcategories as string[])        ?? [],
      targetMarket:          (data.targetMarket as string)           ?? 'smb',
      preferredRevenueModel: (data.preferredRevenueModel as string)  ?? 'subscription',
      buildComplexityPref:   (data.buildComplexityPref as string)    ?? 'mid',
      generationAggression:  (data.generationAggression as string)   ?? 'balanced',
      refreshCadenceHours:   (data.refreshCadenceHours as number)    ?? 24,
      enabledNiches:         (data.enabledNiches as string[])        ?? [],
    },
    update: data,
  })

  // Sync industryCategory denormalized field on Workspace for fast queries
  if (data.primaryIndustry) {
    await prisma.workspace.update({
      where: { id: params.id },
      data:  { industryCategory: data.primaryIndustry as string },
    }).catch(console.error)
  }

  return NextResponse.json({ ok: true, data: { profile } })
}
