/**
 * GET /api/hermes/status
 *
 * Returns a summary of the current NEXUS OS autonomous system state.
 * Used by Hermes Workspace to display live status in its dashboard.
 *
 * Auth: x-hermes-secret header (or CRON_SECRET / INTERNAL_API_SECRET).
 *
 * Response:
 *   {
 *     ok, timestamp,
 *     system: { db, ai, redis },
 *     recentActivity: AuditEvent[],
 *     crons: { total, schedules: string[] },
 *     circuitBreakers: { [step]: { open, failures } }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'

export const runtime   = 'nodejs'
export const dynamic   = 'force-dynamic'

function isAuthorized(req: NextRequest): boolean {
  const hermesSecret = process.env.HERMES_SECRET
  const cronSecret   = process.env.INTERNAL_API_SECRET ?? process.env.CRON_SECRET
  if (!hermesSecret && !cronSecret) return true

  const auth   = req.headers.get('authorization') ?? ''
  const hermes = req.headers.get('x-hermes-secret') ?? ''
  const xCron  = req.headers.get('x-cron-secret') ?? ''
  const query  = req.nextUrl.searchParams.get('secret') ?? ''

  if (hermesSecret && (hermes === hermesSecret || auth === `Bearer ${hermesSecret}`)) return true
  if (cronSecret && (xCron === cronSecret || auth === `Bearer ${cronSecret}` || query === cronSecret)) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const [dbCheck, recentEvents] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    prisma.auditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take:    20,
      select:  { id: true, action: true, sessionId: true, meta: true, createdAt: true },
    }),
  ])

  const dbOk           = dbCheck.status === 'fulfilled'
  const events         = recentEvents.status === 'fulfilled' ? recentEvents.value : []
  const hasAnthropic   = !!process.env.ANTHROPIC_API_KEY?.trim()
  const hasGemini      = !!process.env.GEMINI_API_KEY?.trim()
  const hasGroq        = !!process.env.GROQ_API_KEY?.trim()
  const hasVercel      = !!process.env.VERCEL_TOKEN?.trim()
  const hasHermes      = !!process.env.HERMES_SECRET?.trim()

  // Cron schedules from known routes
  const cronSchedules = [
    { path: '/api/cron/trending',         schedule: 'every 6h' },
    { path: '/api/learning/cycle',        schedule: 'daily 02:00' },
    { path: '/api/monitor',               schedule: 'daily 08:00' },
    { path: '/api/eval',                  schedule: 'weekly Mon 03:00' },
    { path: '/api/cron/lead-dlq-retry',  schedule: 'hourly' },
    { path: '/api/cron/lead-digest',      schedule: 'weekly Mon 09:00' },
    { path: '/api/cron/lead-retention',   schedule: 'daily 00:00' },
    { path: '/api/cron/growth-drip',      schedule: 'daily 10:00' },
    { path: '/api/cron/self-heal',        schedule: 'every 30m' },
  ]

  return NextResponse.json({
    ok:        true,
    timestamp: new Date().toISOString(),
    system: {
      db:       { ok: dbOk },
      ai: {
        ok:        hasAnthropic || hasGemini || hasGroq,
        providers: { anthropic: hasAnthropic, gemini: hasGemini, groq: hasGroq },
      },
      vercel:   { configured: hasVercel },
      hermes:   { configured: hasHermes },
    },
    recentActivity: events.map(e => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
    crons: {
      total:     cronSchedules.length,
      schedules: cronSchedules,
    },
    capabilities: [
      'pipeline/trigger',
      'claude/deploy',
      'cron/self-heal',
      'hermes/dispatch',
      'hermes/status',
      'hermes/agents',
    ],
  })
}
