/**
 * GET /api/share/[slug] — Fetch a public shared run card (no auth required)
 * Also increments the view counter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'

type Params = { params: Promise<{ slug: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params

  const run = await prisma.sharedRun.findUnique({ where: { slug } })
  if (!run) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }

  // Increment view count (fire-and-forget, non-blocking)
  prisma.sharedRun.update({ where: { slug }, data: { viewCount: { increment: 1 } } }).catch(() => {})

  return NextResponse.json({ ok: true, run })
}
