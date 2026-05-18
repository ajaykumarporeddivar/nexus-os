// POST /api/chasebot/invoices — ingest/sync an invoice
// GET  /api/chasebot/invoices — list invoices with tone states for current user
//   ?tab=active|dlq|paid  (default: active)
//   ?tone=WARM|FIRM|URGENT|PRE_LEGAL|LEGAL_NOTICE
//   ?page=1&limit=25

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'
import { computeToneState } from '@/lib/chasebotAgentData'

const VALID_TONES  = ['WARM', 'FIRM', 'URGENT', 'PRE_LEGAL', 'LEGAL_NOTICE'] as const
const MAX_PAGE_SIZE = 100

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(req.url)
    const tab       = searchParams.get('tab') ?? 'active'  // active | dlq | paid
    const toneFilter = searchParams.get('tone')
    const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit     = Math.min(parseInt(searchParams.get('limit') ?? '25'), MAX_PAGE_SIZE)
    const skip      = (page - 1) * limit

    // Validate tone filter
    if (toneFilter && !VALID_TONES.includes(toneFilter as never)) {
      return NextResponse.json({ error: `Invalid tone. Valid: ${VALID_TONES.join(', ')}` }, { status: 400 })
    }

    // Build where clause per tab
    const tabWhere =
      tab === 'paid' ? { paidAt: { not: null as never } } :
      tab === 'dlq'  ? { dlqFlag: true, paidAt: null }   :
                       { chaseActive: true, paidAt: null, dlqFlag: false }  // active

    const where = {
      userId: user.id,
      ...tabWhere,
      ...(toneFilter ? { toneState: toneFilter as never } : {}),
    }

    const [invoices, total] = await Promise.all([
      prisma.invoiceRecord.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        take: limit,
        skip,
        include: {
          chaseEvents: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true, toneState: true, channel: true,
              messageSubject: true, dispatched: true,
              requiresHumanReview: true, createdAt: true,
            },
          },
          disputes: {
            where: { resolvedAt: null },
            take: 1,
            select: { id: true, disputeClass: true, resolvedAt: true },
          },
          escalations: {
            where: { resolvedAt: null },
            take: 1,
            select: { id: true, escalationType: true },
          },
        },
      }),
      prisma.invoiceRecord.count({ where }),
    ])

    return NextResponse.json({
      invoices,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('[chasebot/invoices GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await req.json()
    const {
      externalId,
      clientId,
      clientName,
      clientEmail,
      clientPhone,
      amount,
      currency = 'INR',
      invoiceDate,
      dueDate,
      workspaceId,
      notes,
    } = body

    // ── Input validation (FIX #17 + #18) ──────────────────────────────────────
    if (!clientId || typeof clientId !== 'string' || clientId.trim().length === 0) {
      return NextResponse.json({ error: 'clientId is required and must be a non-empty string' }, { status: 400 })
    }
    if (!clientName || typeof clientName !== 'string' || clientName.trim().length === 0) {
      return NextResponse.json({ error: 'clientName is required and must be a non-empty string' }, { status: 400 })
    }
    if (!amount && amount !== 0) {
      return NextResponse.json({ error: 'amount is required' }, { status: 400 })
    }
    const amountNum = Number(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }
    if (!invoiceDate || !dueDate) {
      return NextResponse.json({ error: 'invoiceDate and dueDate are required' }, { status: 400 })
    }
    const invoiceDateParsed = new Date(invoiceDate)
    const dueDateParsed     = new Date(dueDate)
    if (isNaN(invoiceDateParsed.getTime())) {
      return NextResponse.json({ error: 'invoiceDate is not a valid date' }, { status: 400 })
    }
    if (isNaN(dueDateParsed.getTime())) {
      return NextResponse.json({ error: 'dueDate is not a valid date' }, { status: 400 })
    }
    if (dueDateParsed < invoiceDateParsed) {
      return NextResponse.json({ error: 'dueDate must be on or after invoiceDate' }, { status: 400 })
    }
    if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return NextResponse.json({ error: 'clientEmail is not a valid email address' }, { status: 400 })
    }
    // ──────────────────────────────────────────────────────────────────────────

    const now = new Date()
    const overdueDays = Math.max(0, Math.floor((now.getTime() - dueDateParsed.getTime()) / 86_400_000))

    const relationship = await prisma.clientRelationshipScore.findUnique({
      where: { clientId_userId: { clientId: clientId.trim(), userId: user.id } },
    })
    const strategicFlag = relationship?.strategicFlag ?? false

    const highValueFlag =
      currency === 'INR' ? amountNum >= 500_000 :
      currency === 'GBP' ? amountNum >= 5_000   :
      amountNum >= 6_000

    const toneState           = computeToneState(overdueDays, false)
    const requiresHumanReview = toneState === 'PRE_LEGAL' || toneState === 'LEGAL_NOTICE'
    const dlqFlag             = overdueDays > 90

    // Upsert by externalId if provided
    if (externalId) {
      const existing = await prisma.invoiceRecord.findFirst({
        where: { externalId, userId: user.id },
      })
      if (existing) {
        const updated = await prisma.invoiceRecord.update({
          where: { id: existing.id },
          data: { overdueDays, toneState, highValueFlag, requiresHumanReview, dlqFlag, updatedAt: new Date() },
        })
        return NextResponse.json({ invoice: updated, created: false })
      }
    }

    const invoice = await prisma.invoiceRecord.create({
      data: {
        userId:                   user.id,
        workspaceId:              workspaceId ?? null,
        externalId:               externalId ?? null,
        clientId:                 clientId.trim(),
        clientName:               clientName.trim(),
        clientEmail:              clientEmail?.trim() ?? null,
        clientPhone:              clientPhone?.trim() ?? null,
        amount:                   amountNum,
        currency,
        invoiceDate:              invoiceDateParsed,
        dueDate:                  dueDateParsed,
        overdueDays,
        toneState,
        chaseActive:              !dlqFlag,  // auto-DLQ invoices start inactive
        requiresHumanReview,
        highValueFlag,
        dlqFlag,
        relationshipTier:         strategicFlag ? 'STRATEGIC' : 'STANDARD',
        strategic_ceiling_active: strategicFlag,
        notes:                    notes?.trim() ?? null,
      },
    })

    return NextResponse.json({ invoice, created: true }, { status: 201 })
  } catch (err) {
    console.error('[chasebot/invoices POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
