import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

const VALID_STATUSES = new Set(['archived', 'converted', 'bookmarked', 'fresh', 'stale'])

// ─── PATCH /api/workspaces/:id/ideas/:ideaId ─────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; ideaId: string } },
) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  // Verify workspace ownership
  const workspace = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: auth.user.id! },
    select: { id: true },
  })
  if (!workspace) {
    return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })
  }

  // Verify idea belongs to workspace
  const existing = await prisma.workspaceIdea.findFirst({
    where: { id: params.ideaId, workspaceId: params.id },
  })
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Idea not found' }, { status: 404 })
  }

  let body: { status?: string; executionId?: number } = {}
  try { body = await req.json() } catch { /* optional */ }

  const { status, executionId } = body

  if (!status && executionId === undefined) {
    return NextResponse.json({ ok: false, error: 'No valid fields to update' }, { status: 400 })
  }
  if (status && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ ok: false, error: `Invalid status: ${status}` }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (status)      updateData.status = status
  if (status === 'converted') updateData.convertedAt = new Date()
  if (executionId !== undefined) updateData.executionId = executionId

  const updated = await prisma.workspaceIdea.update({
    where: { id: params.ideaId },
    data:  updateData,
  })

  return NextResponse.json({ ok: true, data: { idea: updated } })
}

// ─── GET /api/workspaces/:id/ideas/:ideaId ────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; ideaId: string } },
) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const workspace = await prisma.workspace.findFirst({
    where: { id: params.id, ownerId: auth.user.id! },
    select: { id: true },
  })
  if (!workspace) {
    return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })
  }

  const idea = await prisma.workspaceIdea.findFirst({
    where: { id: params.ideaId, workspaceId: params.id },
  })
  if (!idea) {
    return NextResponse.json({ ok: false, error: 'Idea not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, data: { idea } })
}
