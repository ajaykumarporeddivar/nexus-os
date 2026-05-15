import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWinBack7, sendWinBack30 } from '@/lib/email'

export const runtime     = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/winback
 *
 * Runs weekly. Finds subscriptions that expired exactly 7 or 30 days ago
 * and sends the appropriate win-back email sequence.
 *
 * Auth: CRON_SECRET via Authorization: Bearer / x-cron-secret / ?secret=
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader  = req.headers.get('authorization') ?? ''
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''
  const cronHeader  = req.headers.get('x-cron-secret') ?? ''

  const isAuthorised =
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret ||
    cronHeader  === cronSecret

  if (!isAuthorised) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Windows: ±12h around 7 days ago and 30 days ago
  function window(daysAgo: number) {
    const center = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
    return {
      gte: new Date(center.getTime() - 12 * 60 * 60 * 1000),
      lte: new Date(center.getTime() + 12 * 60 * 60 * 1000),
    }
  }

  const [expired7, expired30] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: 'expired', expiresAt: window(7) },
      include: { user: { select: { email: true, name: true, leadScore: true } } },
      take: 100,
    }),
    prisma.subscription.findMany({
      where: { status: 'expired', expiresAt: window(30) },
      include: { user: { select: { email: true, name: true } } },
      take: 100,
    }),
  ])

  let sent7 = 0
  let sent30 = 0

  for (const sub of expired7) {
    try {
      await sendWinBack7(sub.user.email, sub.user.name ?? '', sub.plan)
      await prisma.user.update({
        where: { email: sub.user.email },
        data:  { leadScore: { decrement: 5 } },
      })
      sent7++
    } catch (err) {
      console.error(`[cron/winback 7d] failed for ${sub.user.email}:`, err)
    }
  }

  for (const sub of expired30) {
    try {
      await sendWinBack30(sub.user.email, sub.user.name ?? '', sub.plan)
      sent30++
    } catch (err) {
      console.error(`[cron/winback 30d] failed for ${sub.user.email}:`, err)
    }
  }

  return NextResponse.json({ ok: true, sent7, sent30 })
}
