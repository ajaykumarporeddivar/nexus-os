/**
 * POST /api/referral/track
 *
 * Tracks a referral event: click | signup | conversion
 * Called client-side when a user lands with ?ref=CODE or upgrades.
 *
 * Body: { code, event: 'click' | 'signup' | 'conversion' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'

export async function POST(req: NextRequest) {
  let body: { code?: string; event?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const { code, event } = body
  if (!code || !['click', 'signup', 'conversion'].includes(event ?? '')) {
    return NextResponse.json({ ok: false, error: 'code and event (click|signup|conversion) required' }, { status: 400 })
  }

  const ref = await prisma.referralCode.findUnique({ where: { code } })
  if (!ref) {
    return NextResponse.json({ ok: false, error: 'Unknown referral code' }, { status: 404 })
  }

  const field = event === 'click' ? 'clicks' : event === 'signup' ? 'signups' : 'conversions'
  await prisma.referralCode.update({
    where: { code },
    data:  { [field]: { increment: 1 } },
  })

  return NextResponse.json({ ok: true })
}
