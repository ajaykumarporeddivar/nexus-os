import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { aiComplete } from '@/lib/ai'
import {
  buildImagePromptSystemPrompt,
  buildImagePromptUserMessage,
  VARIATION_SEEDS,
  PROMPT_CATEGORIES,
  type PromptCategory,
} from '@/lib/imagePromptData'

export const runtime     = 'nodejs'
export const maxDuration = 60
export const dynamic     = 'force-dynamic'

/**
 * POST /api/image-prompts/generate
 *
 * Generates a single NEXUS OS image prompt JSON on demand.
 * Auth: session required.
 *
 * Body (all optional):
 *   - category: PromptCategory  — defaults to random weighted pick
 *   - seed: string             — custom variation seed
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({})) as {
    category?: PromptCategory
    seed?:     string
  }

  // Pick category — use provided or random weighted
  const category: PromptCategory = body.category ?? pickWeightedCategory()

  // Pick seed — use provided or random from pool
  const seed = body.seed?.trim()
    || VARIATION_SEEDS[Math.floor(Math.random() * VARIATION_SEEDS.length)]

  const systemPrompt = buildImagePromptSystemPrompt()
  const userMessage  = buildImagePromptUserMessage(category, seed)

  const startedAt = Date.now()

  try {
    const result = await aiComplete({
      system:    systemPrompt,
      messages:  [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
    })

    // Parse and validate JSON
    const rawText   = result.text.trim()
    const jsonText  = extractJson(rawText)
    const parsed    = JSON.parse(jsonText)
    const title     = (parsed.title as string) || `NEXUS Prompt — ${category} — ${new Date().toLocaleDateString()}`
    const tags      = extractTags(parsed)

    // Save to DB
    const prompt = await prisma.imagePrompt.create({
      data: {
        title,
        category,
        promptJson:  jsonText,
        tags,
        generatedBy: 'manual',
      },
    })

    // Audit log
    await prisma.auditEvent.create({
      data: {
        action:    'image_prompt_generated',
        userId:    auth.user.id!,
        sessionId: `img-prompt-${prompt.id}`,
        meta: {
          promptId:   prompt.id,
          category,
          durationMs: Date.now() - startedAt,
          seed,
        },
      },
    }).catch(console.error)

    return NextResponse.json({
      ok: true,
      data: {
        id:         prompt.id,
        title:      prompt.title,
        category:   prompt.category,
        promptJson: prompt.promptJson,
        tags:       prompt.tags,
        createdAt:  prompt.createdAt,
        durationMs: Date.now() - startedAt,
      },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickWeightedCategory(): PromptCategory {
  const pool: PromptCategory[] = []
  for (const c of PROMPT_CATEGORIES) {
    for (let i = 0; i < c.weight; i++) pool.push(c.id)
  }
  return pool[Math.floor(Math.random() * pool.length)]
}

function extractJson(text: string): string {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  // Find first { to last }
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) return text.slice(start, end + 1)
  return text
}

function extractTags(parsed: Record<string, unknown>): string[] {
  const tags: string[] = []
  if (parsed.category)      tags.push(String(parsed.category))
  if (Array.isArray(parsed.mood)) {
    tags.push(...(parsed.mood as string[]).slice(0, 3))
  }
  return [...new Set(tags)].slice(0, 8)
}
