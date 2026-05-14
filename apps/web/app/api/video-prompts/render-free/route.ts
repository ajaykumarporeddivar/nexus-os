import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

export const runtime     = 'nodejs'
export const maxDuration = 300
export const dynamic     = 'force-dynamic'

/**
 * POST /api/video-prompts/render-free
 *
 * Generates a short video from a VideoPrompt using free, open-source providers:
 *   1. HuggingFace CogVideoX-2b  — open-source text-to-video (HF_TOKEN optional for higher rate limits)
 *   2. HuggingFace damo-vilab/text-to-video-ms-1.7b — ModelScope T2V fallback
 *   3. Replicate (REPLICATE_API_TOKEN if configured) — Wan2.1 / CogVideoX
 *
 * Body: { id: string }   — VideoPrompt record id
 * Returns: binary MP4 directly as a download (not stored in DB due to size).
 *
 * NOTE: Free HF inference API for video can be slow (60–180s) and may be
 * unavailable during peak load. Results are streamed directly to the browser.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const { id } = await req.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const record = await prisma.videoPrompt.findUnique({ where: { id } })
  if (!record) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

  // Build a concise text prompt from the stored JSON
  const videoPrompt = buildVideoTextPrompt(record.promptJson, record.voiceoverText ?? '')

  let videoBuffer: ArrayBuffer | null = null
  let provider = ''

  // ── 1. HuggingFace CogVideoX-2b (open-source, Apache 2.0) ───────────────────
  // Model: THUDM/CogVideoX-2b — 6-second clips, 720×480, ~60s on HF serverless
  if (!videoBuffer) {
    videoBuffer = await hfVideoInference(
      'THUDM/CogVideoX-2b',
      videoPrompt,
    )
    if (videoBuffer) provider = 'huggingface-cogvideox-2b'
  }

  // ── 2. HuggingFace ModelScope text-to-video-ms-1.7b ──────────────────────────
  // Model: ali-vilab/text-to-video-ms-1.7b — lighter, faster, shorter clips
  if (!videoBuffer) {
    videoBuffer = await hfVideoInference(
      'ali-vilab/text-to-video-ms-1.7b',
      videoPrompt,
    )
    if (videoBuffer) provider = 'huggingface-modescope'
  }

  // ── 3. Replicate (REPLICATE_API_TOKEN env, free credits on new accounts) ──────
  if (!videoBuffer && process.env.REPLICATE_API_TOKEN) {
    videoBuffer = await replicateVideoInference(videoPrompt)
    if (videoBuffer) provider = 'replicate-cogvideox'
  }

  if (!videoBuffer) {
    return NextResponse.json(
      {
        ok: false,
        error: 'All free video providers are busy or unavailable. Try again in a few minutes.',
        hint: 'Add HF_TOKEN env var (free at huggingface.co) for higher rate limits.',
      },
      { status: 503 }
    )
  }

  // Log the generation
  await prisma.auditEvent.create({
    data: {
      action:    'video_prompt_free_render',
      userId:    auth.user.id!,
      sessionId: `vid-free-${id}`,
      meta:      { promptId: id, provider },
    },
  }).catch(console.error)

  // Stream MP4 binary back as download
  return new NextResponse(videoBuffer, {
    headers: {
      'Content-Type':        'video/mp4',
      'Content-Disposition': `attachment; filename="nexus-ugc-${id.slice(0, 8)}.mp4"`,
      'X-Provider':          provider,
      'Cache-Control':       'no-store',
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildVideoTextPrompt(promptJson: string, voiceover: string): string {
  try {
    const p = JSON.parse(promptJson) as Record<string, unknown>
    const brief = p.brief as Record<string, string> | undefined
    const shots = p.shots as Array<Record<string, unknown>> | undefined

    const parts: string[] = []

    if (brief?.core_message) parts.push(brief.core_message)
    if (brief?.visual_style) parts.push(`Style: ${brief.visual_style}`)

    if (shots?.length) {
      const s = shots[0] as Record<string, unknown>
      const scene = s.scene as string | undefined
      const char  = (s.character as Record<string, string> | undefined)?.description
      if (scene)  parts.push(scene)
      if (char)   parts.push(`Subject: ${char}`)

      const motion = s.motion_keywords as string[] | undefined
      if (motion?.length) parts.push(`Motion: ${motion.slice(0, 4).join(', ')}`)
    }

    if (voiceover) parts.push(`VO: ${voiceover.slice(0, 100)}`)

    const result = parts.filter(Boolean).join('. ')
    return result.slice(0, 400) || `UGC ad video for NEXUS OS, modern tech aesthetic, clean studio`
  } catch {
    return voiceover?.slice(0, 300) || `UGC ad video, modern tech startup, clean aesthetic, cinematic`
  }
}

async function hfVideoInference(model: string, prompt: string): Promise<ArrayBuffer | null> {
  const hfToken = process.env.HF_TOKEN
  const url     = `https://api-inference.huggingface.co/models/${model}`

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs: prompt }),
      signal: AbortSignal.timeout(240_000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      // If model is loading (503 with estimated_time), we don't retry — just fall through
      console.warn(`HF ${model} responded ${res.status}: ${errText.slice(0, 200)}`)
      return null
    }

    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('video') || ct.includes('octet-stream')) {
      return await res.arrayBuffer()
    }

    // Some HF models return JSON with a URL
    const json = await res.json().catch(() => null) as { url?: string } | null
    if (json?.url) {
      const videoRes = await fetch(json.url, { signal: AbortSignal.timeout(60_000) })
      if (videoRes.ok) return await videoRes.arrayBuffer()
    }

    return null
  } catch (err) {
    console.warn(`HF ${model} error:`, err)
    return null
  }
}

async function replicateVideoInference(prompt: string): Promise<ArrayBuffer | null> {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) return null

  try {
    // Use CogVideoX-5b via Replicate (has free credits on new accounts)
    // Model version: THUDM/cogvideox-5b
    const createRes = await fetch('https://api.replicate.com/v1/models/chenxwh/cogvideox-5b/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Prefer':        'wait=120',
      },
      body: JSON.stringify({
        input: {
          prompt,
          num_frames: 49,     // ~6s at 8fps
          num_inference_steps: 50,
        },
      }),
      signal: AbortSignal.timeout(240_000),
    })

    if (!createRes.ok) return null

    const prediction = await createRes.json() as {
      id: string
      status: string
      output?: string | string[]
      urls?: { get: string }
    }

    // If not done yet, poll (up to 3 minutes total)
    let output = prediction.output
    if (!output && prediction.urls?.get) {
      const pollUrl = prediction.urls.get
      for (let i = 0; i < 18; i++) {
        await new Promise(r => setTimeout(r, 10_000))
        const pollRes = await fetch(pollUrl, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        })
        const pollData = await pollRes.json() as { status: string; output?: string | string[] }
        if (pollData.status === 'succeeded') { output = pollData.output; break }
        if (pollData.status === 'failed')    { return null }
      }
    }

    const videoUrl = Array.isArray(output) ? output[0] : output
    if (!videoUrl) return null

    const videoRes = await fetch(videoUrl as string, { signal: AbortSignal.timeout(60_000) })
    if (!videoRes.ok) return null

    return await videoRes.arrayBuffer()
  } catch (err) {
    console.warn('Replicate video error:', err)
    return null
  }
}
