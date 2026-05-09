import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPlan, requiresPlan, planLimitError } from '@/lib/session'
import { AGENTS } from '@/lib/agentData'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const agentId = url.searchParams.get('agentId')

    // Return version history for a specific agent
    if (agentId) {
      const versions = await prisma.promptVersion.findMany({
        where: { agentId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, agentId: true, prompt: true, avgScore: true, runCount: true, active: true, createdAt: true },
      })
      return NextResponse.json({
        ok: true,
        versions: versions.map(v => ({ ...v, createdAt: v.createdAt.toISOString() })),
      })
    }

    // Fetch all prompt versions grouped by agent
    const versions = await prisma.promptVersion.findMany({
      orderBy: [{ agentId: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true, agentId: true, prompt: true,
        avgScore: true, runCount: true, active: true, createdAt: true,
      },
    })

    // Build agent summary: known agents + any extra from DB
    const agentIds = new Set([
      ...AGENTS.map(a => a.id),
      ...versions.map(v => v.agentId),
    ])

    const result = Array.from(agentIds).map(agentId => {
      const meta = AGENTS.find(a => a.id === agentId)
      const agentVersions = versions.filter(v => v.agentId === agentId)
      const active = agentVersions.find(v => v.active)
      return {
        id: agentId,
        name: meta?.name ?? agentId,
        role: meta?.role ?? '',
        activeVersion: active
          ? { ...active, createdAt: active.createdAt.toISOString() }
          : null,
        versionCount: agentVersions.length,
        avgScore: active?.avgScore ?? null,
        runCount: active?.runCount ?? 0,
      }
    })

    return NextResponse.json({ ok: true, data: result })
  } catch (err) {
    console.error('[agents GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to fetch agents' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const plan = await getPlan(req)
    if (!requiresPlan(plan, 'agency')) {
      return NextResponse.json(planLimitError('Custom agent prompts', 'agency'), { status: 403 })
    }

    const { agentId, prompt } = await req.json()
    if (!agentId || !prompt?.trim()) {
      return NextResponse.json({ ok: false, error: 'agentId and prompt required' }, { status: 400 })
    }

    const knownAgent = AGENTS.find(a => a.id === agentId)
    if (!knownAgent) {
      return NextResponse.json({ ok: false, error: 'Unknown agent id' }, { status: 404 })
    }

    // Deactivate current active version
    await prisma.promptVersion.updateMany({
      where: { agentId, active: true },
      data: { active: false },
    })

    const saved = await prisma.promptVersion.create({
      data: { agentId, prompt: prompt.trim(), avgScore: 0, runCount: 0, active: true },
    })

    await prisma.auditEvent.create({
      data: {
        action: 'agent_prompt_saved',
        sessionId: req.headers.get('x-session-id') ?? 'anon',
        meta: { agentId, promptLength: prompt.length, versionId: saved.id },
      },
    }).catch(console.error)

    return NextResponse.json({
      ok: true,
      data: { ...saved, createdAt: saved.createdAt.toISOString() },
    }, { status: 201 })
  } catch (err) {
    console.error('[agents POST]', err)
    return NextResponse.json({ ok: false, error: 'Failed to save agent prompt' }, { status: 500 })
  }
}

// GET version history for a specific agent
export async function PUT(req: NextRequest) {
  try {
    const { agentId, versionId } = await req.json()
    if (!agentId || !versionId) {
      return NextResponse.json({ ok: false, error: 'agentId and versionId required' }, { status: 400 })
    }

    const plan = await getPlan(req)
    if (!requiresPlan(plan, 'agency')) {
      return NextResponse.json(planLimitError('Agent version management', 'agency'), { status: 403 })
    }

    await prisma.promptVersion.updateMany({ where: { agentId, active: true }, data: { active: false } })
    const updated = await prisma.promptVersion.update({ where: { id: versionId }, data: { active: true } })

    return NextResponse.json({ ok: true, data: { ...updated, createdAt: updated.createdAt.toISOString() } })
  } catch (err) {
    console.error('[agents PUT]', err)
    return NextResponse.json({ ok: false, error: 'Failed to activate version' }, { status: 500 })
  }
}
