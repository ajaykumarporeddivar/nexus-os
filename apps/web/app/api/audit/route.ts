import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, requireSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  // Audit log is admin-only — exposes all session IDs and actions
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  try {
    const url = new URL(req.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 500)
    const action = url.searchParams.get('action')

    const rows = await prisma.auditEvent.findMany({
      where: action ? { action } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, action: true, userId: true, sessionId: true, meta: true, createdAt: true },
    })

    return NextResponse.json({
      ok: true,
      data: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
    })
  } catch (err) {
    console.error('[audit GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to fetch audit log' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  // Require a valid session to write audit events (prevent anonymous spam)
  const auth = await requireSession()
  if (auth.error) return auth.error

  try {
    const { action, meta = {}, userId, executionId } = await req.json()
    if (!action) return NextResponse.json({ ok: false, error: 'action required' }, { status: 400 })

    const event = await prisma.auditEvent.create({
      data: {
        action,
        sessionId: auth.user.id ?? req.headers.get('x-session-id') ?? crypto.randomUUID(),
        userId: auth.user.id ?? userId ?? null,
        executionId: executionId ?? null,
        meta,
      },
    })

    return NextResponse.json({
      ok: true,
      data: { ...event, createdAt: event.createdAt.toISOString() },
    }, { status: 201 })
  } catch (err) {
    console.error('[audit POST]', err)
    return NextResponse.json({ ok: false, error: 'Failed to save audit event' }, { status: 500 })
  }
}
