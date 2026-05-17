/**
 * POST /api/share — Create a public shareable run card
 * GET  /api/share/[slug] handled in /app/api/share/[slug]/route.ts
 *
 * Creates a SharedRun record with a short slug.
 * Returns { ok, slug, url } — caller appends to base URL for /s/[slug].
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { prisma }                    from '@/lib/prisma'

function makeSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId  = (session?.user as { id?: string } | null)?.id ?? null

  let body: {
    projectName: string
    brief:       string
    vertical?:   string
    qaScore?:    number | null
    elapsedSec?: number | null
    agentCount?: number
    fileCount?:  number
    liveUrl?:    string
    appRepoUrl?: string
    refCode?:    string
  }

  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.projectName || !body.brief) {
    return NextResponse.json({ ok: false, error: 'projectName and brief are required' }, { status: 400 })
  }

  // Generate a unique slug (retry up to 5 times on collision — extremely unlikely)
  let slug = makeSlug()
  for (let i = 0; i < 5; i++) {
    const existing = await prisma.sharedRun.findUnique({ where: { slug } })
    if (!existing) break
    slug = makeSlug()
  }

  const run = await prisma.sharedRun.create({
    data: {
      slug,
      userId,
      projectName: body.projectName.slice(0, 200),
      brief:       body.brief.slice(0, 2000),
      vertical:    body.vertical ?? 'saas',
      qaScore:     body.qaScore    ?? null,
      elapsedSec:  body.elapsedSec ?? null,
      agentCount:  body.agentCount ?? 23,
      fileCount:   body.fileCount  ?? 0,
      liveUrl:     body.liveUrl    ?? null,
      appRepoUrl:  body.appRepoUrl ?? null,
      refCode:     body.refCode    ?? null,
    },
  })

  return NextResponse.json({ ok: true, slug: run.slug })
}
