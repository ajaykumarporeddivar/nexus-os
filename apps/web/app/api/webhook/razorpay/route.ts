/**
 * POST /api/webhook/razorpay
 *
 * Razorpay server-to-server payment webhook — backup confirmation for any
 * payment that completes but the client callback is missed (network drop,
 * tab closed, etc.).
 *
 * Configure in Razorpay Dashboard → Settings → Webhooks:
 *   URL:    https://web-xi-vert-58.vercel.app/api/webhook/razorpay
 *   Secret: <RAZORPAY_WEBHOOK_SECRET>
 *   Events: payment.captured, order.paid
 *
 * Signature verification: X-Razorpay-Signature header (HMAC-SHA256 of raw body).
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto                        from 'crypto'
import { prisma }                    from '@/lib/prisma'
import { sendPlanUpgradeEmail }      from '@/lib/email'

export const runtime = 'nodejs'

// Subscription expiry: 30 days
function expiresAt(): Date {
  const d = new Date(); d.setDate(d.getDate() + 30); return d
}

const PLAN_AMOUNTS: Record<string, number> = {
  starter:  4100_00,
  agency:   16600_00,
}

function planFromAmount(paise: number): 'starter' | 'agency' {
  if (paise >= 16600_00) return 'agency'
  return 'starter'
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[webhook/razorpay] RAZORPAY_WEBHOOK_SECRET not configured')
    return NextResponse.json({ ok: false, error: 'Webhook not configured' }, { status: 500 })
  }

  // Read raw body for signature verification
  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature') ?? ''

  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex')

  if (expected !== signature) {
    console.warn('[webhook/razorpay] Signature mismatch — rejecting')
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = event.event as string
  console.log(`[webhook/razorpay] event=${eventType}`)

  // Handle payment.captured and order.paid
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const payload = event.payload as Record<string, unknown>

    // payment.captured: payload.payment.entity
    // order.paid: payload.payment.entity and payload.order.entity
    const paymentEntity = (
      (payload?.payment as Record<string, unknown>)?.entity as Record<string, unknown>
    ) ?? {}

    const paymentId = paymentEntity.id         as string | undefined
    const orderId   = paymentEntity.order_id   as string | undefined
    const amount    = paymentEntity.amount      as number | undefined  // in paise
    const email     = (paymentEntity.email ?? (paymentEntity.notes as Record<string,string>)?.email) as string | undefined
    const name      = ((paymentEntity.notes as Record<string,string>)?.name) as string | undefined

    if (!paymentId || !orderId) {
      return NextResponse.json({ ok: true, skipped: 'missing paymentId/orderId' })
    }

    const plan = planFromAmount(amount ?? 0)

    // Idempotent: upsert subscription — skips if paymentId already exists
    try {
      if (email) {
        const user = await prisma.user.upsert({
          where:  { email },
          create: { email, name: name ?? '', plan, planActivatedAt: new Date(), razorpayOrderId: orderId },
          update: { plan, planActivatedAt: new Date(), razorpayOrderId: orderId },
        })

        await prisma.subscription.upsert({
          where:  { paymentId },
          create: {
            userId:    user.id,
            plan,
            orderId,
            paymentId,
            amount:    amount ?? PLAN_AMOUNTS[plan],
            status:    'active',
            expiresAt: expiresAt(),
          },
          update: { status: 'active' },
        })

        // Send upgrade email if not already sent (check audit log)
        const alreadySent = await prisma.auditEvent.findFirst({
          where: { action: 'payment_verified', meta: { path: ['paymentId'], equals: paymentId } },
        }).catch(() => null)

        if (!alreadySent) {
          await sendPlanUpgradeEmail({ to: email, name: name ?? '', email, plan, paymentId, orderId, amount: amount ?? 0 }).catch(console.error)
        }
      }

      await prisma.auditEvent.create({
        data: {
          action:    'webhook_payment_captured',
          sessionId: `webhook-${paymentId}`,
          meta:      { eventType, paymentId, orderId, plan, email: email ?? null, amount },
        },
      }).catch(console.error)

      console.log(`[webhook/razorpay] ✅ ${plan} plan activated for ${email ?? 'unknown'} paymentId=${paymentId}`)
      return NextResponse.json({ ok: true, plan, paymentId })
    } catch (err) {
      console.error('[webhook/razorpay] DB error:', err)
      return NextResponse.json({ ok: false, error: 'DB error' }, { status: 500 })
    }
  }

  // Acknowledge all other events
  return NextResponse.json({ ok: true, skipped: eventType })
}
