import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { aiComplete } from '@/lib/ai'
import {
  buildImagePromptSystemPrompt,
  buildImagePromptUserMessage,
  VARIATION_SEEDS,
  PROMPT_CATEGORIES,
  type PromptCategory,
} from '@/lib/imagePromptData'

export const runtime     = 'nodejs'
export const maxDuration = 300
export const dynamic     = 'force-dynamic'

/**
 * GET /api/image-prompts/batch
 *
 * Scheduled endpoint — generates 10 diverse NEXUS OS image prompt JSONs.
 * Called every 6 hours by Vercel cron.
 * Auth: CRON_SECRET only.
 *
 * Diversity strategy:
 *   - Cycles through all 5 categories (2 brand, 2 campaign, 2 product, 2 social, 2 poster)
 *   - Uses 10 distinct variation seeds (no repeats in a batch)
 *   - Each prompt is generated with sequential index so AI knows to differentiate
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader  = req.headers.get('authorization') ?? ''
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''
  const cronHeader  = req.headers.get('x-cron-secret') ?? ''

  const isAuthorised =
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret             ||
    cronHeader  === cronSecret

  if (!isAuthorised) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const BATCH_SIZE = 10
  const batchId    = `img-batch-${Date.now()}`
  const startedAt  = Date.now()

  // Build category sequence — distribute evenly across all 5 categories
  const categorySequence: PromptCategory[] = [
    'brand', 'campaign', 'product', 'social', 'poster',
    'brand', 'campaign', 'product', 'social', 'poster',
  ]

  // Pick 10 distinct seeds — shuffle and take first 10
  const shuffledSeeds = shuffleArray([...VARIATION_SEEDS]).slice(0, BATCH_SIZE)

  const systemPrompt = buildImagePromptSystemPrompt()

  let generated = 0
  let failed    = 0
  const results: Array<{ index: number; id?: string; title?: string; status: string; error?: string }> = []

  for (let i = 0; i < BATCH_SIZE; i++) {
    const category = categorySequence[i]
    const seed     = shuffledSeeds[i]

    try {
      const userMessage = buildImagePromptUserMessage(category, seed, i)

      const result = await aiComplete({
        system:    systemPrompt,
        messages:  [{ role: 'user', content: userMessage }],
        maxTokens: 4096,
      })

      const rawText  = result.text.trim()
      const jsonText = extractJson(rawText)
      const parsed   = JSON.parse(jsonText) as Record<string, unknown>
      const title    = (parsed.title as string) || `NEXUS Prompt ${i + 1} — ${category}`
      const tags     = extractTags(parsed)

      const prompt = await prisma.imagePrompt.create({
        data: {
          title,
          category,
          promptJson:  jsonText,
          tags,
          batchId,
          generatedBy: 'scheduled',
        },
      })

      generated++
      results.push({ index: i, id: prompt.id, title: prompt.title, status: 'done' })

    } catch (err) {
      failed++
      results.push({ index: i, status: 'failed', error: String(err) })
    }
  }

  // Audit log
  await prisma.auditEvent.create({
    data: {
      action:    'image_prompt_batch_run',
      sessionId: `cron-img-batch-${batchId}`,
      meta: {
        batchId,
        generated,
        failed,
        durationMs: Date.now() - startedAt,
        results,
      },
    },
  }).catch(console.error)

  return NextResponse.json({
    ok: true,
    data: {
      batchId,
      generated,
      failed,
      durationMs: Date.now() - startedAt,
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) return text.slice(start, end + 1)
  return text
}

function extractTags(parsed: Record<string, unknown>): string[] {
  const tags: string[] = []
  if (parsed.category) tags.push(String(parsed.category))
  if (Array.isArray(parsed.mood)) {
    tags.push(...(parsed.mood as string[]).slice(0, 3))
  }
  return [...new Set(tags)].slice(0, 8)
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
