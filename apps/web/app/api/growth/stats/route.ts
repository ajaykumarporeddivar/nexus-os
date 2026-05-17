/**
 * GET /api/growth/stats
 *
 * Returns growth analytics for the authenticated user:
 * - Total shared runs and view counts
 * - Referral clicks, signups, conversions
 * - Content items generated and posted
 * - Top performing runs (by views)
 * - Drips sent
 *
 * Auth required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { prisma }                    from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId  = (session?.user as { id?: string } | null)?.id
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const [
    sharedRuns,
    referral,
    contentItems,
    drips,
    topRuns,
  ] = await Promise.all([
    prisma.sharedRun.aggregate({
      where:  { userId },
      _count: { id: true },
      _sum:   { viewCount: true },
    }),
    prisma.referralCode.findUnique({
      where:  { userId },
      select: { code: true, clicks: true, signups: true, conversions: true },
    }),
    prisma.contentItem.aggregate({
      where:  { userId },
      _count: { id: true },
    }),
    prisma.growthDrip.count({ where: { userId } }),
    prisma.sharedRun.findMany({
      where:   { userId },
      orderBy: { viewCount: 'desc' },
      take:    5,
      select:  { slug: true, projectName: true, viewCount: true, createdAt: true, qaScore: true },
    }),
  ])

  return NextResponse.json({
    ok: true,
    stats: {
      sharedRuns:   sharedRuns._count.id,
      totalViews:   sharedRuns._sum.viewCount ?? 0,
      referral: referral ?? { code: null, clicks: 0, signups: 0, conversions: 0 },
      contentItems: contentItems._count.id,
      dripsSent:    drips,
      topRuns,
    },
  })
}
