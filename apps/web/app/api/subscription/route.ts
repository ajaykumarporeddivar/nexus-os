import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'
import { sendPlanUpgradeEmail } from '@/lib/email'

// GET — current subscription status for the signed-in user
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; email?: string; plan?: string } | null
    if (!user?.email) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: user.email },
      select: { id: true, plan: true, planActivatedAt: true, email: true, name: true },
    })
    if (!dbUser) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 })
    }

    const activeSub = await prisma.subscription.findFirst({
      where: { userId: dbUser.id, status: 'active' },
      orderBy: { activatedAt: 'desc' },
      select: { id: true, plan: true, amount: true, currency: true, activatedAt: true, expiresAt: true, orderId: true, paymentId: true },
    })

    const allSubs = await prisma.subscription.findMany({
      where: { userId: dbUser.id },
      orderBy: { activatedAt: 'desc' },
      take: 10,
      select: { id: true, plan: true, amount: true, status: true, activatedAt: true, expiresAt: true, paymentId: true },
    })

    return NextResponse.json({
      ok: true,
      data: {
        plan: dbUser.plan,
        planActivatedAt: dbUser.planActivatedAt?.toISOString() ?? null,
        activeSub: activeSub
          ? {
              ...activeSub,
              activatedAt: activeSub.activatedAt.toISOString(),
              expiresAt: activeSub.expiresAt.toISOString(),
              daysRemaining: Math.max(0, Math.ceil((activeSub.expiresAt.getTime() - Date.now()) / 86400000)),
            }
          : null,
        history: allSubs.map(s => ({
          ...s,
          activatedAt: s.activatedAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          amountStr: s.amount > 0 ? `$${(s.amount / 100).toFixed(2)}` : '$0.00',
        })),
      },
    })
  } catch (err) {
    console.error('[subscription GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to fetch subscription' }, { status: 500 })
  }
}

// DELETE — cancel active subscription (downgrade to free at period end)
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; email?: string } | null
    if (!user?.email) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: user.email },
      select: { id: true, name: true, plan: true },
    })
    if (!dbUser) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 })
    }

    if (dbUser.plan === 'free') {
      return NextResponse.json({ ok: false, error: 'No active paid subscription to cancel' }, { status: 400 })
    }

    // Mark subscription as cancelled — plan expires at period end (expiresAt stays)
    const updated = await prisma.subscription.updateMany({
      where: { userId: dbUser.id, status: 'active' },
      data: { status: 'cancelled' },
    })

    if (updated.count === 0) {
      return NextResponse.json({ ok: false, error: 'No active subscription found' }, { status: 404 })
    }

    // Downgrade user plan to free immediately
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { plan: 'free' },
    })

    await prisma.auditEvent.create({
      data: {
        action: 'subscription_cancelled',
        sessionId: dbUser.id,
        userId: dbUser.id,
        meta: { type: 'subscription_cancelled', previousPlan: dbUser.plan },
      },
    }).catch(console.error)

    return NextResponse.json({
      ok: true,
      data: { cancelled: true, message: 'Subscription cancelled. Your plan has been downgraded to free.' },
    })
  } catch (err) {
    console.error('[subscription DELETE]', err)
    return NextResponse.json({ ok: false, error: 'Failed to cancel subscription' }, { status: 500 })
  }
}

// POST — renew (extend) active subscription by 30 days (admin/manual use)
export async function POST(req: NextRequest) {
  try {
    const { userId, plan, paymentId, orderId, amount } = await req.json()

    // Only callable with valid cron secret (admin renewal flow)
    const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!userId || !plan || !paymentId || !orderId) {
      return NextResponse.json({ ok: false, error: 'userId, plan, paymentId, orderId required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
    if (!user) return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 })

    const expiresAt = new Date(Date.now() + 30 * 86400000)

    await prisma.subscription.upsert({
      where: { paymentId },
      create: { userId, plan, orderId, paymentId, amount: amount ?? 0, status: 'active', expiresAt },
      update: { status: 'active', expiresAt },
    })

    await prisma.user.update({ where: { id: userId }, data: { plan, planActivatedAt: new Date() } })

    if (user.email) {
      sendPlanUpgradeEmail({
        to: user.email,
        name: user.name ?? '',
        email: user.email,
        plan,
        paymentId,
        orderId,
        amount: amount ?? 0,
      }).catch(console.error)
    }

    return NextResponse.json({ ok: true, data: { renewed: true, plan, expiresAt: expiresAt.toISOString() } })
  } catch (err) {
    console.error('[subscription POST]', err)
    return NextResponse.json({ ok: false, error: 'Failed to renew subscription' }, { status: 500 })
  }
}
