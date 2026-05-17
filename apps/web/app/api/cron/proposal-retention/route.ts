/**
 * GET /api/cron/proposal-retention
 * Cron: daily "0 1 * * *"
 *
 * SME-6 §6.16: DPDP Act 2023 — Proposal PII retention enforcement
 *   Phase 1 (180d): Anonymise clientEmail + clientName for closed proposals
 *   Phase 2 (365d): Hard delete no_bid/dlq proposals with zero activity
 *
 * Protected fields that are NOT wiped:
 *   - rfpTitle, rfpRef, bidFitScore, pricingTotalInr (business records)
 *   - WinLossEvent records (ROI data, anonymised)
 *
 * Secured by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest }         from '@/lib/cronAuth'
import { prisma }                    from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req)
  if (authError) return authError

  const now       = new Date()
  const day180ago = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
  const day365ago = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)

  // ── Phase 1: Anonymise PII at 180 days for closed proposals ──────────────
  const anonymised = await prisma.proposal.updateMany({
    where: {
      stage:       { in: ['delivered', 'no_bid'] },
      updatedAt:   { lte: day180ago },
      clientEmail: { not: null },
    },
    data: {
      clientEmail: null,
      clientName:  'ANONYMISED',
    },
  })

  // ── Phase 2: Hard delete DLQ/no_bid proposals with no activity ≥365d ─────
  const toDelete = await prisma.proposal.findMany({
    where: {
      stage:     { in: ['dlq', 'no_bid'] },
      updatedAt: { lte: day365ago },
    },
    select: { id: true },
  })

  let hardDeleted = 0
  for (const p of toDelete) {
    await prisma.proposal.delete({ where: { id: p.id } }).catch(() => {})
    hardDeleted++
  }

  // ── Phase 3: Wipe rfpText (raw RFP document) at 180d — may contain PII ──
  const rfpTextWipe = await prisma.proposal.updateMany({
    where: {
      updatedAt: { lte: day180ago },
      rfpText:   { not: '' },
    },
    data: { rfpText: '[REDACTED — DPDP §6.16 180-day retention]' },
  })

  return NextResponse.json({
    ok:          true,
    anonymised:  anonymised.count,
    hardDeleted,
    rfpTextWipe: rfpTextWipe.count,
  })
}
