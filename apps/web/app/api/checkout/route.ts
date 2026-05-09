import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { checkPublicRateLimit, rateLimitHeaders } from '@/lib/ratelimit'

const B = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'NEXUS OS'

const PLANS = {
  starter:    { amount: 4900000,  name: `${B} Starter`,    currency: 'INR' },
  agency:     { amount: 12000000, name: `${B} Agency`,     currency: 'INR' },
  enterprise: { amount: 0,        name: `${B} Enterprise`, currency: 'INR' },
} as const

type PlanId = keyof typeof PLANS

const rzp = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null

export async function POST(req: NextRequest) {
  try {
    const rl = await checkPublicRateLimit(req)
    if (!rl.success) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests. Please wait and try again.' },
        { status: 429, headers: rateLimitHeaders(rl) }
      )
    }

    const { plan, email, name } = await req.json()

    if (!plan || !(plan in PLANS)) {
      return NextResponse.json({ ok: false, error: 'Invalid plan' }, { status: 400 })
    }

    const tier = PLANS[plan as PlanId]

    if (plan === 'enterprise') {
      return NextResponse.json({ ok: true, data: { redirect: '/shell?page=pricing#book-form', type: 'contact' } })
    }

    if (!rzp) {
      return NextResponse.json({ ok: false, error: 'Payment not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' }, { status: 503 })
    }

    const order = await rzp.orders.create({
      amount: tier.amount,
      currency: tier.currency,
      receipt: `nexus_${plan}_${Date.now()}`,
      notes: { plan, email: email ?? '', name: name ?? '' },
    })

    return NextResponse.json({
      ok: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        planName: tier.name,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    })
  } catch (err) {
    console.error('[checkout POST]', err)
    return NextResponse.json({ ok: false, error: 'Failed to create order' }, { status: 500 })
  }
}
