import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { isValidClientAgentType } from '@/lib/clientAgentData'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOwnedWorkspace(id: string, userId: string) {
  return prisma.workspace.findFirst({ where: { id, ownerId: userId }, select: { id: true, name: true } })
}

// ─── GET /api/workspaces/:id/agents ──────────────────────────────────────────
// List all client agents for a workspace

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const ws = await getOwnedWorkspace(params.id, auth.user.id!)
  if (!ws) return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })

  const agents = await prisma.clientAgent.findMany({
    where:   { workspaceId: params.id },
    orderBy: { createdAt: 'asc' },
    include: {
      jobs: {
        orderBy: { createdAt: 'desc' },
        take:    1,
        select:  { id: true, status: true, completedAt: true, delivered: true },
      },
    },
  })

  return NextResponse.json({ ok: true, data: { agents } })
}

// ─── POST /api/workspaces/:id/agents ─────────────────────────────────────────
// Create a new client agent

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const ws = await getOwnedWorkspace(params.id, auth.user.id!)
  if (!ws) return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const { agentType, label, enabled, schedule, deliveryMethod, deliveryEmail, deliveryPhone } = body

  if (!agentType || !isValidClientAgentType(String(agentType))) {
    return NextResponse.json({ ok: false, error: 'Invalid agentType' }, { status: 400 })
  }

  const VALID_SCHEDULES = ['daily', 'weekly', 'manual']
  const VALID_METHODS   = ['email', 'whatsapp', 'portal']

  if (schedule && !VALID_SCHEDULES.includes(String(schedule))) {
    return NextResponse.json({ ok: false, error: 'Invalid schedule' }, { status: 400 })
  }
  if (deliveryMethod && !VALID_METHODS.includes(String(deliveryMethod))) {
    return NextResponse.json({ ok: false, error: 'Invalid deliveryMethod' }, { status: 400 })
  }

  const agent = await prisma.clientAgent.create({
    data: {
      workspaceId:    params.id,
      agentType:      String(agentType),
      label:          label ? String(label) : undefined,
      enabled:        enabled !== false,
      schedule:       schedule ? String(schedule) : 'weekly',
      deliveryMethod: deliveryMethod ? String(deliveryMethod) : 'email',
      deliveryEmail:  deliveryEmail ? String(deliveryEmail) : undefined,
      deliveryPhone:  deliveryPhone ? String(deliveryPhone) : undefined,
    },
  })

  return NextResponse.json({ ok: true, data: { agent } }, { status: 201 })
}

// ─── PATCH /api/workspaces/:id/agents ────────────────────────────────────────
// Bulk-enable/disable or update multiple agents (body: { agentId, ...fields })

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const ws = await getOwnedWorkspace(params.id, auth.user.id!)
  if (!ws) return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const { agentId, ...rest } = body

  if (!agentId) return NextResponse.json({ ok: false, error: 'agentId required' }, { status: 400 })

  // Verify the agent belongs to this workspace
  const existing = await prisma.clientAgent.findFirst({
    where: { id: String(agentId), workspaceId: params.id },
  })
  if (!existing) return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 })

  const allowed = ['label', 'enabled', 'schedule', 'deliveryMethod', 'deliveryEmail', 'deliveryPhone']
  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in rest) data[key] = rest[key]
  }

  const updated = await prisma.clientAgent.update({
    where: { id: String(agentId) },
    data,
  })

  return NextResponse.json({ ok: true, data: { agent: updated } })
}

// ─── DELETE /api/workspaces/:id/agents?agentId=xxx ───────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const ws = await getOwnedWorkspace(params.id, auth.user.id!)
  if (!ws) return NextResponse.json({ ok: false, error: 'Workspace not found' }, { status: 404 })

  const agentId = req.nextUrl.searchParams.get('agentId')
  if (!agentId) return NextResponse.json({ ok: false, error: 'agentId required' }, { status: 400 })

  const existing = await prisma.clientAgent.findFirst({
    where: { id: agentId, workspaceId: params.id },
  })
  if (!existing) return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 })

  await prisma.clientAgent.delete({ where: { id: agentId } })

  return NextResponse.json({ ok: true })
}
