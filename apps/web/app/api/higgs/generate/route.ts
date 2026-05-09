import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'

const HIGGSFIELD_API = 'https://api.higgsfield.ai'

// Supported models and their Higgsfield API endpoint model IDs
const MODEL_MAP: Record<string, string> = {
  cinematic_studio_2_5: 'cinematic_studio_2_5',
  marketing_studio_image: 'marketing_studio_image',
  nano_banana_2: 'nano_banana_2',
  flux_2: 'flux_2',
  gpt_image_2: 'gpt_image_2',
  soul_cast: 'soul_cast',
}

// Poll interval and max attempts for async job completion
const POLL_INTERVAL_MS = 2500
const POLL_MAX         = 60   // 60 × 2.5s = 2.5 min max wait

async function pollJob(
  jobId:   string,
  token:   string,
): Promise<{ url: string }[]> {
  for (let i = 0; i < POLL_MAX; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    const res = await fetch(`${HIGGSFIELD_API}/v1/asset/job/${jobId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept:        'application/json',
      },
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as { message?: string }).message ?? `Poll ${res.status}`)
    }

    const data = await res.json() as {
      status:  string
      assets?: { url: string }[]
      error?:  string
    }

    if (data.status === 'COMPLETED' && data.assets?.length) {
      return data.assets.map(a => ({ url: a.url }))
    }
    if (data.status === 'FAILED') {
      throw new Error(data.error ?? 'Generation job failed')
    }
    // PENDING / PROCESSING — keep polling
  }
  throw new Error('Generation timed out — the job is still processing. Try again in a moment.')
}

export async function POST(req: NextRequest) {
  // Auth gate — must be signed in
  const auth = await requireSession()
  if (auth.error) return auth.error

  const body = await req.json() as {
    prompt:      string
    model:       string
    aspect:      string
    resolution?: string
    count?:      number
    apiKey?:     string
  }

  const { prompt, model, aspect, resolution = '1k', count = 1, apiKey: bodyKey } = body

  if (!prompt?.trim()) {
    return NextResponse.json({ ok: false, error: 'prompt is required' }, { status: 400 })
  }

  const modelId = MODEL_MAP[model]
  if (!modelId) {
    return NextResponse.json({ ok: false, error: `Unknown model: ${model}` }, { status: 400 })
  }

  // API key resolution: client-supplied key takes priority, then server env
  const token = bodyKey?.trim() || process.env.HIGGSFIELD_API_KEY?.trim()
  if (!token) {
    return NextResponse.json(
      {
        ok:    false,
        error: 'Higgsfield API key not configured. Add your key in the UI (⚿ Add API key button) or set HIGGSFIELD_API_KEY in your environment.',
      },
      { status: 401 },
    )
  }

  try {
    // Step 1 — submit generation job
    const submitRes = await fetch(`${HIGGSFIELD_API}/v1/image/generation`, {
      method:  'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify({
        model:        modelId,
        prompt:       prompt.trim(),
        aspect_ratio: aspect,
        resolution,
        count:        Math.min(Math.max(count, 1), 4),
      }),
    })

    if (!submitRes.ok) {
      const errBody = await submitRes.json().catch(() => ({ message: submitRes.statusText }))
      const msg     = (errBody as { message?: string; error?: string }).message
                   ?? (errBody as { error?: string }).error
                   ?? `Higgsfield API error (${submitRes.status})`
      return NextResponse.json({ ok: false, error: msg }, { status: submitRes.status })
    }

    const submitData = await submitRes.json() as {
      job_id?:  string
      jobId?:   string
      assets?:  { url: string }[]
      images?:  { url: string }[]
      status?:  string
    }

    // Some endpoints return images synchronously
    const syncAssets = submitData.assets ?? submitData.images
    if (syncAssets?.length) {
      return NextResponse.json({
        ok:     true,
        images: syncAssets.map((a, i) => ({
          id:  `${Date.now()}-${i}`,
          url: a.url,
        })),
      })
    }

    // Async job — poll until done
    const jobId = submitData.job_id ?? submitData.jobId
    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'No job ID returned from Higgsfield' }, { status: 500 })
    }

    const assets = await pollJob(jobId, token)

    return NextResponse.json({
      ok:     true,
      images: assets.map((a, i) => ({
        id:  `${jobId}-${i}`,
        url: a.url,
      })),
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[higgs/generate]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
