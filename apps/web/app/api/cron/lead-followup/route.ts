/**
 * GET /api/cron/lead-followup
 * Cron: daily 10 AM — "0 10 * * *"
 *
 * Processes multi-touch follow-up sequence for in_outreach leads.
 * Touch schedule: Day 3 / Day 6 / Day 9 (scarcity) / Day 12 (archive).
 * Max 50 leads per run to stay within maxDuration.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cronAuth'
import { getDueFollowUpLeads, processLeadFollowUp } from '@/lib/leadFollowUp'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authErr = verifyCronRequest(req)
  if (authErr) return authErr

  const dueIds = await getDueFollowUpLeads()

  if (dueIds.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No follow-ups due' })
  }

  const results = await Promise.allSettled(dueIds.map(id => processLeadFollowUp(id)))

  const summary = { sent: 0, archived: 0, skipped: 0, errors: 0 }
  const details: unknown[] = []

  for (const r of results) {
    if (r.status === 'fulfilled') {
      summary[r.value.action]++
      details.push(r.value)
    } else {
      summary.errors++
      console.error('[lead-followup] processLeadFollowUp error:', r.reason)
    }
  }

  console.log(`[lead-followup] sent=${summary.sent} archived=${summary.archived} skipped=${summary.skipped} errors=${summary.errors}`)
  return NextResponse.json({ ok: true, ...summary, details })
}
