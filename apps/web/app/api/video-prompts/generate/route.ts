import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { aiComplete } from '@/lib/ai'
import {
  buildVideoPromptSystemPrompt,
  buildVideoPromptUserMessage,
  HOOK_TYPES,
  ICP_TARGETS,
  VIDEO_SEEDS,
  type HookType,
  type ICPTarget,
} from '@/lib/videoPromptData'

export const runtime     = 'nodejs'
export const maxDuration = 60
export const dynamic     = 'force-dynamic'

/**
 * POST /api/video-prompts/generate
 *
 * Generates a single 8-second UGC video prompt JSON on demand.
 * Auth: session required.
 *
 * Body (all optional):
 *   - hookType:  HookType
 *   - icpTarget: ICPTarget
 *   - seed:      string
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({})) as {
    hookType?:  HookType
    icpTarget?: ICPTarget
    seed?:      string
  }

  const hookType  = body.hookType  ?? HOOK_TYPES[Math.floor(Math.random() * HOOK_TYPES.length)].id
  const icpTarget = body.icpTarget ?? ICP_TARGETS[Math.floor(Math.random() * ICP_TARGETS.length)].id
  const seed      = body.seed?.trim() || VIDEO_SEEDS[Math.floor(Math.random() * VIDEO_SEEDS.length)]

  const startedAt = Date.now()

  try {
    const result = await aiComplete({
      system:   buildVideoPromptSystemPrompt(),
      messages: [{ role: 'user', content: buildVideoPromptUserMessage(hookType, icpTarget, seed) }],
      maxTokens: 6000,
    })

    const rawText  = result.text.trim()
    const jsonText = extractJson(rawText)
    const parsed   = JSON.parse(jsonText) as Record<string, unknown>

    const title         = (parsed.title as string)          || `NEXUS UGC — ${hookType} — ${icpTarget}`
    const voiceoverText = extractVO(parsed)
    const ctaText       = extractCTA(parsed)
    const tags          = buildTags(parsed, hookType, icpTarget)

    const record = await prisma.videoPrompt.create({
      data: {
        title,
        hookType,
        targetICP:    icpTarget,
        painPoint:    (parsed.pain_point as string)        ?? null,
        promptJson:   jsonText,
        voiceoverText,
        ctaText,
        tags,
        generatedBy: 'manual',
      },
    })

    await prisma.auditEvent.create({
      data: {
        action:    'video_prompt_generated',
        userId:    auth.user.id!,
        sessionId: `vid-prompt-${record.id}`,
        meta: { promptId: record.id, hookType, icpTarget, durationMs: Date.now() - startedAt, seed },
      },
    }).catch(console.error)

    return NextResponse.json({
      ok: true,
      data: { ...record, durationMs: Date.now() - startedAt },
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const s = text.indexOf('{'), e = text.lastIndexOf('}')
  return s !== -1 && e !== -1 ? text.slice(s, e + 1) : text
}

function extractVO(p: Record<string, unknown>): string {
  const vs = p.voiceover_script as Record<string, string> | undefined
  return vs?.full_text ?? ''
}

function extractCTA(p: Record<string, unknown>): string {
  const vs = p.voiceover_script as Record<string, string> | undefined
  if (vs?.cta_line) return vs.cta_line
  const shots = p.shots as Array<Record<string, Record<string, string>>> | undefined
  const lastShot = shots?.[shots.length - 1]
  return lastShot?.audio?.voiceover ?? ''
}

function buildTags(p: Record<string, unknown>, hookType: string, icpTarget: string): string[] {
  const tags = [hookType, icpTarget]
  const ls = p.lead_strategy as Record<string, string> | undefined
  if (ls?.funnel_stage) tags.push(ls.funnel_stage)
  if (ls?.awareness_level) tags.push(ls.awareness_level)
  return [...new Set(tags)].slice(0, 8)
}
