// POST /api/chasebot/payment-halt — confirm payment and halt chase
// SECURITY: Payment confirmation comes from webhook only.
// Message content NEVER confirms payment — this endpoint validates source field.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'

const VALID_WEBHOOK_SOURCES = ['stripe_webhook', 'razorpay_webhook', 'manual_admin']

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await req.json()
    const { invoiceId, source, amount, currency = 'INR', webhookId } = body

    if (!invoiceId || !source || !amount) {
      return NextResponse.json(
        { error: 'Required fields: invoiceId, source, amount' },
        { status: 400 }
      )
    }

    // Validate source — never accept message-content-based confirmation
    if (!VALID_WEBHOOK_SOURCES.includes(source)) {
      return NextResponse.json({
        error: `Invalid payment source "${source}". Payment must be confirmed by webhook only. Valid sources: ${VALID_WEBHOOK_SOURCES.join(', ')}`,
      }, { status: 400 })
    }

    const invoice = await prisma.invoiceRecord.findFirst({
      where: { id: invoiceId, userId: user.id },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    // Idempotency: don't re-record the same webhook event
    if (webhookId) {
      const existing = await prisma.paymentEvent.findUnique({
        where: { invoiceId_webhookId: { invoiceId, webhookId } },
      })
      if (existing) {
        return NextResponse.json({
          message: 'Payment event already recorded (idempotent)',
          paymentEvent: existing,
        })
      }
    }

    // Record payment event
    const paymentEvent = await prisma.paymentEvent.create({
      data: {
        invoiceId,
        userId: user.id,
        source,
        amount,
        currency,
        webhookId: webhookId ?? null,
      },
    })

    // Halt chase on invoice
    await prisma.invoiceRecord.update({
      where: { id: invoiceId },
      data: {
        chaseActive:  false,
        paidAt:       new Date(),
        paidAmount:   amount,
        updatedAt:    new Date(),
      },
    })

    return NextResponse.json({ paymentEvent, chaseHalted: true }, { status: 201 })
  } catch (err) {
    console.error('[chasebot/payment-halt POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
