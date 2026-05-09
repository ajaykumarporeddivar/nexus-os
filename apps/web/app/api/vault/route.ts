import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { VAULT_DATA } from '@/lib/vaultData'
import { getPlan, requiresPlan, planLimitError } from '@/lib/session'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const vaultItemId = url.searchParams.get('id')
    const sessionId = req.headers.get('x-session-id') ?? 'anonymous'

    if (vaultItemId) {
      // Return all versions for a specific vault item
      const dbVersions = await prisma.vaultPrompt.findMany({
        where: { vaultItemId },
        orderBy: { version: 'desc' },
        select: { id: true, vaultItemId: true, title: true, content: true, version: true, isActive: true, createdAt: true, userId: true },
      })

      const base = VAULT_DATA.find(v => v.id === vaultItemId)
      return NextResponse.json({
        ok: true,
        data: {
          base,
          versions: dbVersions.map(v => ({ ...v, createdAt: v.createdAt.toISOString() })),
          activeVersion: dbVersions.find(v => v.isActive) ?? null,
        },
      })
    }

    // Return all vault items with their active DB version (if any)
    const activeVersions = await prisma.vaultPrompt.findMany({
      where: { isActive: true },
      select: { vaultItemId: true, content: true, version: true, id: true },
    }).catch(() => [] as { vaultItemId: string; content: string; version: number; id: string }[])

    const activeMap = new Map(activeVersions.map(v => [v.vaultItemId, v]))

    const items = VAULT_DATA.map(item => ({
      ...item,
      prompt: activeMap.get(item.id)?.content ?? item.prompt,
      dbVersion: activeMap.get(item.id)?.version ?? null,
      hasUserEdits: activeMap.has(item.id),
    }))

    return NextResponse.json({ ok: true, data: items, meta: { sessionId } })
  } catch (err) {
    console.error('[vault GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to fetch vault' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const plan = await getPlan(req)
    if (!requiresPlan(plan, 'agency')) {
      return NextResponse.json(planLimitError('Vault write & versioning', 'agency'), { status: 403 })
    }
    const { vaultItemId, content, title } = await req.json()
    const sessionId = req.headers.get('x-session-id') ?? 'anonymous'

    if (!vaultItemId || !content) {
      return NextResponse.json({ ok: false, error: 'vaultItemId and content required' }, { status: 400 })
    }

    const base = VAULT_DATA.find(v => v.id === vaultItemId)
    if (!base) {
      return NextResponse.json({ ok: false, error: 'Unknown vault item' }, { status: 404 })
    }

    // Deactivate existing active version
    await prisma.vaultPrompt.updateMany({
      where: { vaultItemId, isActive: true },
      data: { isActive: false },
    })

    // Get next version number
    const latest = await prisma.vaultPrompt.findFirst({
      where: { vaultItemId },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    const nextVersion = (latest?.version ?? 0) + 1

    const saved = await prisma.vaultPrompt.create({
      data: {
        vaultItemId,
        title: title ?? base.title,
        content,
        version: nextVersion,
        isActive: true,
        userId: null,
      },
    })

    await prisma.auditEvent.create({
      data: {
        action: 'vault_prompt_saved',
        sessionId,
        meta: { vaultItemId, version: nextVersion, promptLength: content.length },
      },
    }).catch(console.error)

    return NextResponse.json({
      ok: true,
      data: { ...saved, createdAt: saved.createdAt.toISOString() },
    }, { status: 201 })
  } catch (err) {
    console.error('[vault POST]', err)
    return NextResponse.json({ ok: false, error: 'Failed to save prompt' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const plan = await getPlan(req)
    if (!requiresPlan(plan, 'agency')) {
      return NextResponse.json(planLimitError('Vault version management', 'agency'), { status: 403 })
    }
    const { id, isActive } = await req.json()
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

    const prompt = await prisma.vaultPrompt.findUnique({ where: { id } })
    if (!prompt) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    if (isActive === true) {
      await prisma.vaultPrompt.updateMany({
        where: { vaultItemId: prompt.vaultItemId, isActive: true },
        data: { isActive: false },
      })
    }

    const updated = await prisma.vaultPrompt.update({
      where: { id },
      data: { isActive: isActive ?? prompt.isActive },
    })

    return NextResponse.json({ ok: true, data: { ...updated, createdAt: updated.createdAt.toISOString() } })
  } catch (err) {
    console.error('[vault PUT]', err)
    return NextResponse.json({ ok: false, error: 'Failed to update prompt' }, { status: 500 })
  }
}
