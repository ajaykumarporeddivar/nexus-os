/**
 * GET /api/admin/users
 *
 * Returns the full user list for the admin dashboard.
 * Admin-only — requires isAdmin === true in JWT.
 *
 * Query params:
 *   plan   string  filter by plan (free | starter | agency | enterprise)
 *   search string  filter by email/name (case-insensitive)
 *   take   number  page size (default 100)
 *   skip   number  offset (default 0)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin }              from '@/lib/session'
import { prisma }                    from '@/lib/prisma'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const plan   = searchParams.get('plan')   ?? undefined
  const search = searchParams.get('search') ?? undefined
  const take   = Math.min(parseInt(searchParams.get('take') ?? '100', 10), 200)
  const skip   = parseInt(searchParams.get('skip') ?? '0', 10)

  const where = {
    ...(plan   ? { plan }                                                                         : {}),
    ...(search ? { OR: [
      { email: { contains: search, mode: 'insensitive' as const } },
      { name:  { contains: search, mode: 'insensitive' as const } },
    ] } : {}),
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      select: {
        id:              true,
        email:           true,
        name:            true,
        image:           true,
        plan:            true,
        createdAt:       true,
        planActivatedAt: true,
        razorpayOrderId: true,
      },
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({
    ok: true,
    data: { users, total, take, skip },
  })
}

/**
 * DELETE /api/admin/users
 * Body: { ids: string[] }  — delete specific user IDs
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { ids } = await req.json() as { ids: string[] }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'ids array required' }, { status: 400 })
  }
  if (ids.length > 50) {
    return NextResponse.json({ ok: false, error: 'Max 50 users per request' }, { status: 400 })
  }

  // Delete dependent rows first
  await prisma.session.deleteMany({ where: { userId: { in: ids } } })
  await prisma.account.deleteMany({ where: { userId: { in: ids } } })
  const deleted = await prisma.user.deleteMany({ where: { id: { in: ids } } })

  await prisma.auditEvent.create({
    data: {
      action:    'admin_users_deleted',
      sessionId: `admin-delete-${Date.now()}`,
      meta:      { ids, count: deleted.count } as never,
    },
  }).catch(console.error)

  return NextResponse.json({ ok: true, deleted: deleted.count })
}
