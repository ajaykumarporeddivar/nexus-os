/**
 * GET /api/cron/lead-retention
 * Cron: daily midnight — "0 0 * * *"
 *
 * SME-6 / §6.16: DPDP Act 2023 data retention enforcement
 *   - phone: delete if uncontacted ≥ 90 days
 *   - email + name: delete (anonymise) if uncontacted ≥ 180 days
 *   - Hard delete disqualified leads with no pipeline run after 365 days
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyCronRequest } from '@/lib/cronAuth'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const authErr = verifyCronRequest(req)
  if (authErr) return authErr

  const now        = new Date()
  const day90ago   = new Date(now.getTime() - 90  * 24 * 60 * 60 * 1000)
  const day180ago  = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
  const day365ago  = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)

  // ── Phase 1: Wipe phone after 90 days if uncontacted ──────────────────────
  const phoneWipe = await prisma.lead.updateMany({
    where: {
      phone:     { not: null },
      status:    { notIn: ['in_outreach', 'converted'] },
      createdAt: { lte: day90ago },
    },
    data: { phone: null },
  })

  // ── Phase 2: Anonymise email + name after 180 days if uncontacted ──────────
  const staleLeads = await prisma.lead.findMany({
    where: {
      status:    { notIn: ['in_outreach', 'converted'] },
      createdAt: { lte: day180ago },
      email:     { not: { startsWith: 'deleted_' } },  // not already anonymised
    },
    select: { id: true },
  })

  let emailWipe = 0
  for (const lead of staleLeads) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        email:                     `deleted_${lead.id}@redacted`,
        name:                      null,
        phone:                     null,
        disqualificationReason:    'DPDP 180-day retention policy — PII redacted automatically',
      },
    })
    emailWipe++
  }

  // ── Phase 3: Hard delete junk leads (disqualified, no pipeline, >365 days) ─
  const hardDelete = await prisma.lead.deleteMany({
    where: {
      status:        'disqualified',
      pipelineRunId: null,
      createdAt:     { lte: day365ago },
      email:         { startsWith: 'deleted_' },  // already anonymised
    },
  })

  // Audit log
  if (phoneWipe.count + emailWipe + hardDelete.count > 0) {
    await prisma.auditEvent.create({
      data: {
        action:    'lead_retention_cron',
        sessionId: `retention_${now.toISOString().split('T')[0]}`,
        userId:    null,
        meta: {
          phoneWiped:   phoneWipe.count,
          emailWiped:   emailWipe,
          hardDeleted:  hardDelete.count,
          runAt:        now.toISOString(),
          policy:       'DPDP Act 2023 §6.16',
        } as never,
      },
    })
  }

  console.log(`[lead-retention] phone=${phoneWipe.count} email=${emailWipe} deleted=${hardDelete.count}`)
  return NextResponse.json({
    ok: true,
    phoneFieldsWiped:  phoneWipe.count,
    emailsAnonymised:  emailWipe,
    hardDeleted:       hardDelete.count,
  })
}
