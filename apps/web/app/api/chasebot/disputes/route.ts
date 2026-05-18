// POST /api/chasebot/disputes — classify a dispute and pause chase
// GET  /api/chasebot/disputes?invoiceId=... — get open disputes for an invoice

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'

const VALID_DISPUTE_CLASSES = ['quality', 'billing', 'admin', 'ghost'] as const

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const invoiceId = new URL(req.url).searchParams.get('invoiceId')
    const disputes = await prisma.disputeRecord.findMany({
      where: {
        userId:    user.id,
        ...(invoiceId ? { invoiceId } : {}),
        resolvedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ disputes, count: disputes.length })
  } catch (err) {
    console.error('[chasebot/disputes GET]', err)
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
    const { invoiceId, disputeClass, description } = body

    if (!invoiceId || !disputeClass) {
      return NextResponse.json({ error: 'Required fields: invoiceId, disputeClass' }, { status: 400 })
    }

    if (!VALID_DISPUTE_CLASSES.includes(disputeClass)) {
      return NextResponse.json(
        { error: `Invalid disputeClass. Valid: ${VALID_DISPUTE_CLASSES.join(', ')}` },
        { status: 400 }
      )
    }

    const invoice = await prisma.invoiceRecord.findFirst({
      where: { id: invoiceId, userId: user.id },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    // Create dispute and pause chase
    const [dispute] = await prisma.$transaction([
      prisma.disputeRecord.create({
        data: {
          invoiceId,
          userId:      user.id,
          disputeClass,
          description: description ?? null,
          pausedChase: true,
        },
      }),
      prisma.invoiceRecord.update({
        where: { id: invoiceId },
        data:  { disputeFlag: true, chaseActive: false },
      }),
    ])

    return NextResponse.json({ dispute, chasePaused: true }, { status: 201 })
  } catch (err) {
    console.error('[chasebot/disputes POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/chasebot/disputes?id=... — resolve a dispute and optionally resume chase
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id param required' }, { status: 400 })

    const body = await req.json()
    const { resolution, resumeChase = false } = body

    const dispute = await prisma.disputeRecord.findFirst({
      where: { id, userId: user.id },
    })
    if (!dispute) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })

    const [updated] = await prisma.$transaction([
      prisma.disputeRecord.update({
        where: { id },
        data: {
          resolvedAt: new Date(),
          resolvedBy: user.id,
          resolution: resolution ?? null,
        },
      }),
      prisma.invoiceRecord.update({
        where: { id: dispute.invoiceId },
        data: {
          disputeFlag: false,
          chaseActive: resumeChase,
        },
      }),
    ])

    return NextResponse.json({ dispute: updated, chaseResumed: resumeChase })
  } catch (err) {
    console.error('[chasebot/disputes PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
