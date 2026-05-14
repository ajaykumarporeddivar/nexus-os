import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession, getPlan, requiresPlan, planLimitError } from '@/lib/session'
import { encrypt } from '@/lib/keyUtils'

export const runtime = 'nodejs'

// GET /api/keys — list keys for authenticated user (never returns plaintext)
export async function GET() {
  try {
    const auth = await requireSession()
    if (auth.error) return auth.error

    const keys = await prisma.apiKey.findMany({
      where:   { userId: auth.user.id!, isValid: true },
      orderBy: { createdAt: 'desc' },
      select:  { id: true, keyHint: true, isValid: true, lastUsed: true, createdAt: true },
    })

    return NextResponse.json({
      ok: true,
      data: keys.map(k => ({
        ...k,
        lastUsed:  k.lastUsed?.toISOString()  ?? null,
        createdAt: k.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/keys — save a new Anthropic API key (Agency+ only)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession()
    if (auth.error) return auth.error

    const plan = await getPlan(req)
    if (!requiresPlan(plan, 'agency')) {
      return NextResponse.json(planLimitError('API key storage', 'agency'), { status: 403 })
    }

    const { apiKey } = await req.json()
    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ ok: false, error: 'apiKey is required' }, { status: 400 })
    }
    if (!apiKey.startsWith('sk-ant-')) {
      return NextResponse.json({ ok: false, error: 'Must be a valid Anthropic API key (starts with sk-ant-)' }, { status: 400 })
    }

    const encryptedKey = encrypt(apiKey)
    const keyHint      = `sk-ant-...${apiKey.slice(-4)}`

    // Revoke any existing keys first — one active key per user
    await prisma.apiKey.updateMany({
      where:  { userId: auth.user.id! },
      data:   { isValid: false },
    })

    const created = await prisma.apiKey.create({
      data: { userId: auth.user.id!, encryptedKey, keyHint, isValid: true },
      select: { id: true, keyHint: true, isValid: true, createdAt: true },
    })

    return NextResponse.json({
      ok:   true,
      data: { ...created, createdAt: created.createdAt.toISOString(), lastUsed: null },
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// DELETE /api/keys?id=<keyId> — revoke a key
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSession()
    if (auth.error) return auth.error

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'id param required' }, { status: 400 })

    const key = await prisma.apiKey.findFirst({ where: { id, userId: auth.user.id! } })
    if (!key) return NextResponse.json({ ok: false, error: 'Key not found' }, { status: 404 })

    await prisma.apiKey.update({ where: { id }, data: { isValid: false } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

