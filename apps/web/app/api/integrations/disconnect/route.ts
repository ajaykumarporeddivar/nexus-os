import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DELETE /api/integrations/disconnect
 * Body: { workspaceId, provider }
 *
 * Removes the integration record, effectively disconnecting the provider.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const { workspaceId, provider } = await req.json().catch(() => ({})) as Record<string, string>
  if (!workspaceId || !provider) {
    return NextResponse.json({ ok: false, error: 'workspaceId and provider required' }, { status: 400 })
  }

  try {
    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId, ownerId: auth.user.id! },
      select: { id: true },
    })
    if (!ws) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    await prisma.workspaceIntegration.deleteMany({ where: { workspaceId, provider } })

    prisma.auditEvent.create({
      data: {
        action:    'integration_disconnected',
        userId:    auth.user.id!,
        sessionId: `integration-${provider}-${workspaceId}`,
        meta:      { provider, workspaceId },
      },
    }).catch(console.error)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[integrations/disconnect DELETE]', err)
    return NextResponse.json({ ok: false, error: 'Disconnect failed' }, { status: 500 })
  }
}
