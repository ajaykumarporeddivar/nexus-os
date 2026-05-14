import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { type Prisma } from '@prisma/client'

// ─── Ownership helper ─────────────────────────────────────────────────────────

async function getOwnedWorkspace(id: string, userId: string) {
  return prisma.workspace.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  })
}

const VALID_STATUSES = new Set(['fresh', 'stale', 'archived', 'converted', 'bookmarked'])

// ─── GET /api/workspaces/:id/ideas ────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const workspace = await getOwnedWorkspace(params.id, auth.user.id!)
  if (!workspace) {
    return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })
  }

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')   // optional filter
  const niche  = searchParams.get('niche')    // optional filter
  const page   = Math.max(1, Number(searchParams.get('page')  ?? 1))
  const limit  = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? 12)))
  const skip   = (page - 1) * limit

  // Build where clause
  const where: Record<string, unknown> = { workspaceId: params.id }
  if (status && VALID_STATUSES.has(status)) where.status = status
  if (niche)  where.niche = niche

  const [ideas, total] = await Promise.all([
    prisma.workspaceIdea.findMany({
      where:   where as Prisma.WorkspaceIdeaWhereInput,
      orderBy: [{ opportunityScore: 'desc' }, { createdAt: 'desc' }],
      skip,
      take:    limit,
    }),
    prisma.workspaceIdea.count({
      where: where as Prisma.WorkspaceIdeaWhereInput,
    }),
  ])

  return NextResponse.json({
    ok:   true,
    data: {
      ideas,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  })
}

// ─── PATCH /api/workspaces/:id/ideas/:ideaId ─────────────────────────────────
// Note: ideaId is handled in a separate nested route file.
// This handler is a stub for bulk operations on the collection (reserved).

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const workspace = await getOwnedWorkspace(params.id, auth.user.id!)
  if (!workspace) {
    return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })
  }

  // Bulk stale update: mark all fresh ideas older than freshUntil as stale
  const now = new Date()
  const updated = await prisma.workspaceIdea.updateMany({
    where: {
      workspaceId: params.id,
      status:      'fresh',
      freshUntil:  { lt: now },
    },
    data: { status: 'stale' },
  })

  return NextResponse.json({
    ok:   true,
    data: { stalledCount: updated.count },
  })
}
