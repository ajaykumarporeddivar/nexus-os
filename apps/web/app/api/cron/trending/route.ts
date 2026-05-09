import { NextRequest, NextResponse } from 'next/server'

export const runtime   = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/trending
 *
 * Vercel Cron Jobs always call GET. This endpoint:
 *   1. Accepts Vercel's auto-injected  Authorization: Bearer <CRON_SECRET>  header
 *   2. Also accepts  ?secret=<CRON_SECRET>  for manual curl triggers
 *   3. Internally calls POST /api/trending to generate + persist new micro-SaaS opportunities
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  // Vercel sends:  Authorization: Bearer <CRON_SECRET>
  const authHeader  = req.headers.get('authorization') ?? ''
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''

  const validVercel = authHeader === `Bearer ${cronSecret}`
  const validManual = querySecret === cronSecret

  if (!validVercel && !validManual) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve base URL — Vercel sets VERCEL_URL, local dev falls back to localhost
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXTAUTH_URL ?? 'http://localhost:3000')

  try {
    const res = await fetch(`${baseUrl}/api/trending?secret=${encodeURIComponent(cronSecret)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    console.log('[cron/trending]', data)
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cron/trending] failed:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
