import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { jsonPromptToText } from '@/lib/imageRender'

export const runtime     = 'nodejs'
export const maxDuration = 120
export const dynamic     = 'force-dynamic'

/**
 * POST /api/image-prompts/render-free
 *
 * Generates an image using free, no-cost providers:
 *   1. Pollinations.ai  — zero API key, public endpoint
 *   2. HuggingFace FLUX.1-schnell — free tier (HF_TOKEN env, optional)
 *   3. HuggingFace SDXL — second HF fallback
 *
 * Body: { id: string, aspectRatio?: '9:16' | '1:1' | '16:9' }
 * Saves base64 result to ImagePrompt.imageData.
 * Returns: { ok, data: { id, imageData, imageMime, provider } }
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const { id, aspectRatio = '9:16' } = await req.json().catch(() => ({})) as {
    id?: string
    aspectRatio?: '9:16' | '1:1' | '16:9'
  }

  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const record = await prisma.imagePrompt.findUnique({ where: { id } })
  if (!record) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

  const promptText = jsonPromptToText(record.promptJson)

  // Dimensions by aspect ratio
  const dims: Record<string, [number, number]> = {
    '9:16': [832, 1472],
    '1:1':  [1024, 1024],
    '16:9': [1472, 832],
  }
  const [width, height] = dims[aspectRatio] ?? [832, 1472]

  let base64 = ''
  let mime   = 'image/jpeg'
  let provider = ''

  // ── 1. Pollinations.ai (zero API key) ────────────────────────────────────────
  try {
    const seed = Math.floor(Math.random() * 999999)
    const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}` +
                 `?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true&model=flux`

    const res = await fetch(url, {
      signal: AbortSignal.timeout(90_000),
      headers: { 'User-Agent': 'NEXUS-OS/1.0' },
    })

    if (res.ok) {
      const ct = res.headers.get('content-type') ?? 'image/jpeg'
      if (ct.startsWith('image/')) {
        const buf = await res.arrayBuffer()
        base64   = Buffer.from(buf).toString('base64')
        mime     = ct.split(';')[0].trim()
        provider = 'pollinations'
      }
    }
  } catch (_) { /* fall through */ }

  // ── 2. HuggingFace FLUX.1-schnell (free tier) ────────────────────────────────
  if (!base64) {
    const hfToken = process.env.HF_TOKEN
    const model   = 'black-forest-labs/FLUX.1-schnell'
    const hfUrl   = `https://api-inference.huggingface.co/models/${model}`

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`

      const res = await fetch(hfUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          inputs: promptText.slice(0, 500), // FLUX.1-schnell token limit
          parameters: { width, height, num_inference_steps: 4 },
        }),
        signal: AbortSignal.timeout(90_000),
      })

      if (res.ok) {
        const ct = res.headers.get('content-type') ?? 'image/jpeg'
        if (ct.startsWith('image/')) {
          const buf = await res.arrayBuffer()
          base64   = Buffer.from(buf).toString('base64')
          mime     = ct.split(';')[0].trim()
          provider = 'huggingface-flux'
        }
      }
    } catch (_) { /* fall through */ }
  }

  // ── 3. HuggingFace Stable Diffusion XL ───────────────────────────────────────
  if (!base64) {
    const hfToken = process.env.HF_TOKEN
    const model   = 'stabilityai/stable-diffusion-xl-base-1.0'
    const hfUrl   = `https://api-inference.huggingface.co/models/${model}`

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`

      const res = await fetch(hfUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          inputs: promptText.slice(0, 500),
          parameters: { width, height },
        }),
        signal: AbortSignal.timeout(90_000),
      })

      if (res.ok) {
        const ct = res.headers.get('content-type') ?? 'image/jpeg'
        if (ct.startsWith('image/')) {
          const buf = await res.arrayBuffer()
          base64   = Buffer.from(buf).toString('base64')
          mime     = ct.split(';')[0].trim()
          provider = 'huggingface-sdxl'
        }
      }
    } catch (_) { /* fall through */ }
  }

  if (!base64) {
    return NextResponse.json(
      { ok: false, error: 'All free providers failed or timed out. Try again in a moment.' },
      { status: 503 }
    )
  }

  // Persist to DB
  await prisma.imagePrompt.update({
    where: { id },
    data:  { imageData: base64, imageMime: mime, imageGenAt: new Date() },
  })

  return NextResponse.json({ ok: true, data: { id, imageData: base64, imageMime: mime, provider } })
}

/**
 * GET /api/image-prompts/render-free?id=xxx
 * Serves stored free-generated image as a download.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const record = await prisma.imagePrompt.findUnique({ where: { id } })
  if (!record?.imageData) return NextResponse.json({ ok: false, error: 'no image' }, { status: 404 })

  const buffer = Buffer.from(record.imageData, 'base64')
  const ext    = (record.imageMime ?? 'image/png').split('/')[1] ?? 'png'

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        record.imageMime ?? 'image/png',
      'Content-Disposition': `attachment; filename="nexus-free-${id.slice(0, 8)}.${ext}"`,
      'Cache-Control':       'private, max-age=3600',
    },
  })
}
