import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/image-prompts/list
 *
 * Returns paginated list of image prompts.
 * Query params:
 *   - page: number (default 1)
 *   - limit: number (default 20, max 50)
 *   - category: filter by category
 *   - favourites: 'true' to show only favourites
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const page       = Math.max(1, parseInt(searchParams.get('page')  ?? '1', 10))
  const limit      = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const category   = searchParams.get('category') ?? undefined
  const favOnly    = searchParams.get('favourites') === 'true'

  const where = {
    ...(category ? { category } : {}),
    ...(favOnly  ? { isFavourite: true } : {}),
  }

  const [total, items] = await Promise.all([
    prisma.imagePrompt.count({ where }),
    prisma.imagePrompt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      select: {
        id:          true,
        title:       true,
        category:    true,
        promptJson:  true,
        tags:        true,
        batchId:     true,
        generatedBy: true,
        isFavourite: true,
        imageData:   true,
        imageMime:   true,
        imageGenAt:  true,
        createdAt:   true,
      },
    }),
  ])

  return NextResponse.json({
    ok: true,
    data: {
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
    },
  })
}
