/**
 * GET /api/cron/lead-sequence
 *
 * Processes due follow-up sequence steps for all active lead sequences.
 * Runs every hour. Sends the next email in each sequence if the day offset is due.
 *
 * Auth: CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest }         from '@/lib/cronAuth'
import { processDueSequenceSteps }   from '@/lib/leadSequence'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req)
  if (authError) return authError

  const result = await processDueSequenceSteps()

  console.log(`[lead-sequence] processed=${result.processed} sent=${result.sent} errors=${result.errors.length}`)

  return NextResponse.json({
    ok:        true,
    processed: result.processed,
    sent:      result.sent,
    errors:    result.errors,
  })
}
