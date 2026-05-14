import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { aiComplete } from '@/lib/ai'
import {
  buildVideoPromptSystemPrompt,
  buildVideoPromptUserMessage,
  HOOK_TYPES,
  ICP_TARGETS,
  VIDEO_SEEDS,
} from '@/lib/videoPromptData'

export const runtime     = 'nodejs'
export const maxDuration = 300
export const dynamic     = 'force-dynamic'

/**
 * GET /api/video-prompts/batch
 *
 * Generates 10 diverse UGC video prompt JSONs every 6 hours.
 * Covers all 6 hook types + all 4 ICP targets with no repeats in a batch.
 * Auth: CRON_SECRET only.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 })

  const auth = req.headers.get('authorization') ?? ''
  const qs   = req.nextUrl.searchParams.get('secret') ?? ''
  const ch   = req.headers.get('x-cron-secret') ?? ''
  if (auth !== `Bearer ${cronSecret}` && qs !== cronSecret && ch !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const BATCH_SIZE = 10
  const batchId    = `vid-batch-${Date.now()}`
  const startedAt  = Date.now()

  // Distribute: 2× each of first 5 hook types (10 total), cycling ICPs
  const hookSequence  = [...HOOK_TYPES, ...HOOK_TYPES].slice(0, BATCH_SIZE).map(h => h.id)
  const icpSequence   = Array.from({ length: BATCH_SIZE }, (_, i) => ICP_TARGETS[i % ICP_TARGETS.length].id)
  const shuffledSeeds = shuffle([...VIDEO_SEEDS]).slice(0, BATCH_SIZE)

  const systemPrompt = buildVideoPromptSystemPrompt()
  let generated = 0, failed = 0
  const results: Array<{ index: number; id?: string; status: string; error?: string }> = []

  for (let i = 0; i < BATCH_SIZE; i++) {
    const hookType  = hookSequence[i]
    const icpTarget = icpSequence[i]
    const seed      = shuffledSeeds[i]

    try {
      const res = await aiComplete({
        system:    systemPrompt,
        messages:  [{ role: 'user', content: buildVideoPromptUserMessage(hookType, icpTarget, seed, i) }],
        maxTokens: 6000,
      })

      const jsonText = extractJson(res.text.trim())
      const parsed   = JSON.parse(jsonText) as Record<string, unknown>
      const title    = (parsed.title as string) || `NEXUS UGC ${i + 1} — ${hookType}`
      const vs       = parsed.voiceover_script as Record<string, string> | undefined
      const ls       = parsed.lead_strategy    as Record<string, string> | undefined
      const tags     = [hookType, icpTarget, ls?.funnel_stage, ls?.awareness_level].filter(Boolean) as string[]

      const record = await prisma.videoPrompt.create({
        data: {
          title,
          hookType,
          targetICP:    icpTarget,
          painPoint:    (parsed.pain_point as string) ?? null,
          promptJson:   jsonText,
          voiceoverText: vs?.full_text ?? '',
          ctaText:       vs?.cta_line  ?? '',
          tags:          [...new Set(tags)].slice(0, 8),
          batchId,
          generatedBy: 'scheduled',
        },
      })
      generated++
      results.push({ index: i, id: record.id, status: 'done' })
    } catch (err) {
      failed++
      results.push({ index: i, status: 'failed', error: String(err) })
    }
  }

  await prisma.auditEvent.create({
    data: {
      action:    'video_prompt_batch_run',
      sessionId: `cron-vid-batch-${batchId}`,
      meta: { batchId, generated, failed, durationMs: Date.now() - startedAt, results },
    },
  }).catch(console.error)

  return NextResponse.json({ ok: true, data: { batchId, generated, failed, durationMs: Date.now() - startedAt } })
}

function extractJson(text: string): string {
  const f = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (f) return f[1].trim()
  const s = text.indexOf('{'), e = text.lastIndexOf('}')
  return s !== -1 && e !== -1 ? text.slice(s, e + 1) : text
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
