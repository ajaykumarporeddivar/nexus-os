import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { generateImage } from '@/lib/imageRender'

export const runtime     = 'nodejs'
export const maxDuration = 60
export const dynamic     = 'force-dynamic'

/**
 * POST /api/image-prompts/render
 *
 * Generates an actual image from a stored JSON prompt using Gemini Imagen 3.
 * Saves base64 back to the ImagePrompt row so it persists across sessions.
 *
 * Body: { id: string, aspectRatio?: '9:16' | '1:1' | '16:9' }
 * Returns: { ok, data: { id, base64, mimeType, flatPrompt, durationMs } }
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({})) as {
    id?:          string
    aspectRatio?: '9:16' | '1:1' | '16:9'
  }

  if (!body.id) {
    return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  }

  // Load the prompt
  const record = await prisma.imagePrompt.findUnique({
    where:  { id: body.id },
    select: { id: true, promptJson: true, title: true },
  })
  if (!record) {
    return NextResponse.json({ ok: false, error: 'Prompt not found' }, { status: 404 })
  }

  const startedAt   = Date.now()
  const aspectRatio = body.aspectRatio ?? '9:16'

  try {
    const result = await generateImage(record.promptJson, aspectRatio)
    const durationMs = Date.now() - startedAt

    // Persist image back to the prompt record
    await prisma.imagePrompt.update({
      where: { id: record.id },
      data: {
        imageData:  result.base64,
        imageMime:  result.mimeType,
        imageGenAt: new Date(),
      },
    })

    // Audit log
    await prisma.auditEvent.create({
      data: {
        action:    'image_rendered',
        userId:    auth.user.id!,
        sessionId: `img-render-${record.id}`,
        meta: {
          promptId:    record.id,
          model:       result.model,
          aspectRatio,
          durationMs,
        },
      },
    }).catch(console.error)

    return NextResponse.json({
      ok: true,
      data: {
        id:          record.id,
        base64:      result.base64,
        mimeType:    result.mimeType,
        flatPrompt:  result.prompt,
        durationMs,
      },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

/**
 * GET /api/image-prompts/render?id=xxx
 *
 * Returns the stored image for a prompt (if already generated).
 * Returns the raw image bytes with correct Content-Type for <img src> usage.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const record = await prisma.imagePrompt.findUnique({
    where:  { id },
    select: { imageData: true, imageMime: true, title: true },
  })

  if (!record?.imageData) {
    return NextResponse.json({ ok: false, error: 'No image generated yet' }, { status: 404 })
  }

  // Serve as raw image bytes — browser can use as download src
  const buffer = Buffer.from(record.imageData, 'base64')
  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        record.imageMime ?? 'image/png',
      'Content-Disposition': `attachment; filename="nexus-${id.slice(0, 8)}.png"`,
      'Cache-Control':       'private, max-age=3600',
    },
  })
}
