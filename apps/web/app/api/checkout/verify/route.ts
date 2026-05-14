import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendPlanUpgradeEmail } from '@/lib/email'

const PLAN_AMOUNTS: Record<string, number> = {
  starter:    4900,
  agency:     19900,
  enterprise: 0,
}

// Subscription duration: 30 days for monthly plans
function expiresAt(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d
}

export async function POST(req: NextRequest) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, email } = await req.json()

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ ok: false, error: 'Missing payment fields' }, { status: 400 })
    }

    // Verify HMAC signature
    const secret = process.env.RAZORPAY_KEY_SECRET
    if (!secret) return NextResponse.json({ ok: false, error: 'Payment verification not configured' }, { status: 500 })
    const body = `${razorpay_order_id}|${razorpay_payment_id}`
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')

    if (expected !== razorpay_signature) {
      return NextResponse.json({ ok: false, error: 'Signature mismatch — payment not verified' }, { status: 400 })
    }

    const resolvedPlan = plan === 'agency' ? 'agency' : 'starter'
    const amount = PLAN_AMOUNTS[resolvedPlan] ?? 4900

    // Persist: upsert user plan + create subscription record
    if (email) {
      try {
        const user = await prisma.user.upsert({
          where: { email },
          create: {
            email,
            plan: resolvedPlan,
            planActivatedAt: new Date(),
            razorpayOrderId: razorpay_order_id,
          },
          update: {
            plan: resolvedPlan,
            planActivatedAt: new Date(),
            razorpayOrderId: razorpay_order_id,
          },
        })

        // Write subscription record (idempotent via unique paymentId)
        await prisma.subscription.upsert({
          where: { paymentId: razorpay_payment_id },
          create: {
            userId: user.id,
            plan: resolvedPlan,
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            amount,
            status: 'active',
            expiresAt: expiresAt(),
          },
          update: { status: 'active' },
        })
      } catch (dbErr) {
        // Non-fatal: log but still return success — plan in JWT is the fallback
        console.error('[checkout/verify] DB write failed:', dbErr)
      }
    }

    // Send plan upgrade + receipt email (non-blocking)
    if (email) {
      const user = await prisma.user.findUnique({ where: { email }, select: { name: true } }).catch(() => null)
      sendPlanUpgradeEmail({
        to: email,
        name: user?.name ?? '',
        email,
        plan: resolvedPlan,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        amount,
      }).catch(console.error)
    }

    // Audit event
    await prisma.auditEvent.create({
      data: {
        action: 'payment_verified',
        sessionId: req.headers.get('x-session-id') ?? crypto.randomUUID(),
        meta: {
          type: 'payment_verified',
          plan: resolvedPlan,
          email,
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
        },
      },
    }).catch(console.error)

    return NextResponse.json({
      ok: true,
      data: { verified: true, paymentId: razorpay_payment_id, plan: resolvedPlan },
    })
  } catch (err) {
    console.error('[checkout/verify POST]', err)
    return NextResponse.json({ ok: false, error: 'Verification failed' }, { status: 500 })
  }
}
