import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPlanExpiryEmail } from '@/lib/email'

export const runtime     = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/subscription-expiry
 *
 * Runs daily. Finds all active subscriptions whose expiresAt has passed,
 * marks them as expired, and downgrades the user plan to 'free'.
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

  // Find all active subscriptions that have expired
  const expiredSubs = await prisma.subscription.findMany({
    where: {
      status:    'active',
      expiresAt: { lt: now },
    },
    include: {
      user: {
        select: { id: true, email: true, name: true, plan: true },
      },
    },
  }).catch(() => [] as never[])

  if (expiredSubs.length === 0) {
    return NextResponse.json({
      ok: true,
      data: { expired: 0, message: 'No expired subscriptions found' },
    })
  }

  let expired  = 0
  let failed   = 0
  const details: Array<{ userId: string; plan: string; status: string }> = []

  for (const sub of expiredSubs) {
    try {
      // 1. Mark subscription expired
      await prisma.subscription.update({
        where: { id: sub.id },
        data:  { status: 'expired' },
      })

      // 2. Downgrade user plan to free
      const previousPlan = sub.user?.plan ?? sub.plan
      await prisma.user.update({
        where: { id: sub.userId },
        data:  { plan: 'free' },
      })

      // 3. Audit log
      await prisma.auditEvent.create({
        data: {
          action:    'subscription_expired',
          sessionId: `cron-subscription-expiry`,
          userId:    sub.userId,
          meta: {
            subscriptionId: sub.id,
            previousPlan,
            expiresAt: sub.expiresAt.toISOString(),
          },
        },
      }).catch(console.error)

      // 4. Send expiry email
      if (sub.user?.email) {
        sendPlanExpiryEmail({
          to:   sub.user.email,
          name: sub.user.name ?? '',
          plan: previousPlan,
        }).catch(console.error)
      }

      expired++
      details.push({ userId: sub.userId, plan: previousPlan, status: 'expired' })
    } catch (err) {
      failed++
      console.error(`[subscription-expiry] failed for sub ${sub.id}:`, err)
      details.push({ userId: sub.userId, plan: sub.plan, status: 'failed' })
    }
  }

  // Audit the overall run
  await prisma.auditEvent.create({
    data: {
      action:    'subscription_expiry_cron',
      sessionId: 'cron-subscription-expiry',
      meta:      { expired, failed, details, runAt: now.toISOString() },
    },
  }).catch(console.error)

  return NextResponse.json({
    ok: true,
    data: { expired, failed, details },
  })
}
