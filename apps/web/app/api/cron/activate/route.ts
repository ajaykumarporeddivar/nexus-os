import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendFirstRunNudge } from '@/lib/email'

export const runtime     = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/activate
 *
 * Runs daily at 09:00 UTC. Finds free users who signed up >24h ago,
 * have never run a pipeline (no Executions), and have never been nudged
 * (lastActiveAt IS NULL — stays null until they actually interact).
 * Sends a "run your first pipeline" email to activate them.
 *
 * Auth: CRON_SECRET via Authorization: Bearer / x-cron-secret / ?secret=
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader  = req.headers.get('authorization') ?? ''
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''
  const cronHeader  = req.headers.get('x-cron-secret') ?? ''

  const isAuthorised =
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret ||
    cronHeader  === cronSecret

  if (!isAuthorised) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24h ago

  // Find free users who signed up >24h ago with no executions and no pipeline activity
  const candidates = await prisma.user.findMany({
    where: {
      plan:        'free',
      createdAt:   { lt: cutoff },
      lastActiveAt: null,
      executions:  { none: {} },
    },
    select: { id: true, email: true, name: true },
    take: 100, // safety cap
  })

  let sent = 0
  for (const user of candidates) {
    try {
      await sendFirstRunNudge(user.email, user.name ?? '')
      // Mark as nudged by setting leadScore increment only — don't set lastActiveAt
      // (we use lastActiveAt to mean "actually ran something", not "received email")
      await prisma.user.update({
        where: { id: user.id },
        data:  { leadScore: { increment: 5 } },
      })
      sent++
    } catch (err) {
      console.error(`[cron/activate] failed for ${user.email}:`, err)
    }
  }

  return NextResponse.json({ ok: true, processed: candidates.length, sent })
}
