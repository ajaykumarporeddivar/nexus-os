/**
 * GET /api/leads/activity?leadId=<id>&take=50
 *
 * Returns the activity timeline for a lead.
 * Auth: session (admin or owner) required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSession }            from '@/lib/session'
import { prisma }                    from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const leadId = req.nextUrl.searchParams.get('leadId')
  if (!leadId) return NextResponse.json({ ok: false, error: 'leadId required' }, { status: 400 })

  const take = Math.min(parseInt(req.nextUrl.searchParams.get('take') ?? '50', 10), 200)

  const activities = await prisma.leadActivity.findMany({
    where:   { leadId },
    orderBy: { createdAt: 'desc' },
    take,
  })

  return NextResponse.json({ ok: true, data: activities })
}
