import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPlan, requiresPlan } from '@/lib/session'

const STARTER_KIT_LIMIT = 5

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.headers.get('x-session-id') ?? 'anonymous'
    const activations = await prisma.kitActivation.findMany({
      where: { sessionId, active: true },
      select: { kitId: true, createdAt: true, plan: true },
    })
    return NextResponse.json({ ok: true, data: { activations, count: activations.length } })
  } catch (err) {
    console.error('[kits GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to fetch kit activations' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionId = req.headers.get('x-session-id') ?? 'anonymous'
    const plan = await getPlan(req)
    const { kitId } = await req.json()

    if (!kitId) {
      return NextResponse.json({ ok: false, error: 'kitId required' }, { status: 400 })
    }

    // Starter plan: max 5 active kits; Agency/Enterprise: unlimited
    if (!requiresPlan(plan, 'agency')) {
      const count = await prisma.kitActivation.count({
        where: { sessionId, active: true },
      })
      if (count >= STARTER_KIT_LIMIT) {
        return NextResponse.json(
          { ok: false, error: `Starter plan allows up to ${STARTER_KIT_LIMIT} active kits. Upgrade to Agency for unlimited kits.`, upgrade: 'agency' },
          { status: 403 }
        )
      }
    }

    const activation = await prisma.kitActivation.upsert({
      where: { kitId_sessionId: { kitId, sessionId } },
      create: { kitId, sessionId, plan, active: true },
      update: { active: true, plan },
    })

    return NextResponse.json({ ok: true, data: { ...activation, createdAt: activation.createdAt.toISOString() } }, { status: 201 })
  } catch (err) {
    console.error('[kits POST]', err)
    return NextResponse.json({ ok: false, error: 'Failed to activate kit' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sessionId = req.headers.get('x-session-id') ?? 'anonymous'
    const url = new URL(req.url)
    const kitId = url.searchParams.get('kitId')

    if (!kitId) {
      return NextResponse.json({ ok: false, error: 'kitId required' }, { status: 400 })
    }

    await prisma.kitActivation.updateMany({
      where: { kitId, sessionId },
      data: { active: false },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[kits DELETE]', err)
    return NextResponse.json({ ok: false, error: 'Failed to deactivate kit' }, { status: 500 })
  }
}
