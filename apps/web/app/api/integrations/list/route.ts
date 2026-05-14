import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/integrations/list?workspaceId=xxx
 *
 * Returns connected integrations for a workspace (safe — no tokens exposed).
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: 'workspaceId required' }, { status: 400 })
  }

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, ownerId: auth.user.id! },
    select: { id: true },
  })
  if (!ws) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

  const integrations = await prisma.workspaceIntegration.findMany({
    where:  { workspaceId },
    select: {
      provider:     true,
      accountEmail: true,
      enabled:      true,
      expiresAt:    true,
      scopes:       true,
      createdAt:    true,
      updatedAt:    true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ ok: true, data: integrations })
}
