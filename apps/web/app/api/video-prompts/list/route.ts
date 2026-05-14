import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const page      = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit     = Math.min(20, Math.max(1, parseInt(searchParams.get('limit') ?? '12')))
  const hookType  = searchParams.get('hookType')  ?? undefined
  const icpTarget = searchParams.get('icpTarget') ?? undefined
  const favOnly   = searchParams.get('favourites') === 'true'

  const where = {
    ...(hookType  ? { hookType }  : {}),
    ...(icpTarget ? { targetICP: icpTarget } : {}),
    ...(favOnly   ? { isFavourite: true } : {}),
  }

  const [total, items] = await Promise.all([
    prisma.videoPrompt.count({ where }),
    prisma.videoPrompt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      select: {
        id: true, title: true, hookType: true, targetICP: true,
        painPoint: true, promptJson: true, voiceoverText: true,
        ctaText: true, tags: true, generatedBy: true,
        isFavourite: true, createdAt: true,
      },
    }),
  ])

  return NextResponse.json({ ok: true, data: { items, total, page, pages: Math.ceil(total / limit) } })
}
