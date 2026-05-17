/**
 * GET  /api/referral        — Get (or create) current user's referral code
 * POST /api/referral/click  — Track a referral link click (handled separately)
 *
 * Referral codes: "NEXUS-XXXXXX" where X is alphanumeric.
 * One code per user, created lazily on first request.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { prisma }                    from '@/lib/prisma'

function makeRefCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const suffix = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `NEXUS-${suffix}`
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId  = (session?.user as { id?: string } | null)?.id
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Find or create
  let ref = await prisma.referralCode.findUnique({ where: { userId } })
  if (!ref) {
    let code = makeRefCode()
    // Ensure uniqueness
    for (let i = 0; i < 5; i++) {
      const existing = await prisma.referralCode.findUnique({ where: { code } })
      if (!existing) break
      code = makeRefCode()
    }
    ref = await prisma.referralCode.create({ data: { userId, code } })
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://web-xi-vert-58.vercel.app'
  return NextResponse.json({
    ok:   true,
    code: ref.code,
    url:  `${baseUrl}?ref=${ref.code}`,
    stats: { clicks: ref.clicks, signups: ref.signups, conversions: ref.conversions },
  })
}
