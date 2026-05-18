// GET /api/cron/chasebot-overdue — daily overdue detection at 08:00 IST (02:30 UTC)
// Recomputes overdueDays + toneState for all active invoices
// Sets dlqFlag for >90 days, sets requiresHumanReview for PRE_LEGAL+
// Batch-updates in groups of 100 to avoid N individual round-trips

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeToneState } from '@/lib/chasebotAgentData'

const BATCH_SIZE = 100

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    let cursor: string | undefined
    let totalProcessed  = 0
    let dlqFlagged      = 0
    let humanReviewFlagged = 0
    let toneEscalated   = 0

    // Paginate in batches to avoid memory blow-up on large datasets
    while (true) {
      const batch = await prisma.invoiceRecord.findMany({
        where:   { paidAt: null, chaseActive: true },
        select:  { id: true, dueDate: true, paymentPlanActive: true, toneState: true },
        take:    BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      })

      if (batch.length === 0) break

      // Compute new states for each invoice in this batch
      const updates = batch.map(inv => {
        const overdueDays         = Math.max(0, Math.floor((now.getTime() - inv.dueDate.getTime()) / 86_400_000))
        const newToneState        = computeToneState(overdueDays, inv.paymentPlanActive)
        const dlqFlag             = overdueDays > 90
        const requiresHumanReview = newToneState === 'PRE_LEGAL' || newToneState === 'LEGAL_NOTICE'
        return { id: inv.id, overdueDays, toneState: newToneState, dlqFlag, requiresHumanReview, prevTone: inv.toneState }
      })

      // Batch update using $transaction for atomicity
      await prisma.$transaction(
        updates.map(u =>
          prisma.invoiceRecord.update({
            where: { id: u.id },
            data: {
              overdueDays:         u.overdueDays,
              toneState:           u.toneState,
              dlqFlag:             u.dlqFlag,
              requiresHumanReview: u.requiresHumanReview,
              // Halt chase for DLQ invoices
              ...(u.dlqFlag ? { chaseActive: false } : {}),
            },
          })
        )
      )

      // Tally metrics
      for (const u of updates) {
        totalProcessed++
        if (u.dlqFlag) dlqFlagged++
        if (u.requiresHumanReview) humanReviewFlagged++
        if (u.toneState !== u.prevTone) toneEscalated++
      }

      cursor = batch[batch.length - 1].id
      if (batch.length < BATCH_SIZE) break
    }

    return NextResponse.json({
      ok: true,
      processed: totalProcessed,
      dlqFlagged,
      humanReviewFlagged,
      toneEscalated,
      runAt: now.toISOString(),
    })
  } catch (err) {
    console.error('[cron/chasebot-overdue]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
