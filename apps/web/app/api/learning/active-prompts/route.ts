/**
 * GET /api/learning/active-prompts
 *
 * Returns the most recent active (non-quarantined) learned prompt for each agent.
 * Called at the start of every pipeline run so agents benefit from accumulated
 * improvements without needing to redeploy the codebase.
 *
 * Response shape: { ok: true, data: Record<agentId, promptText> }
 * Only agents that have at least one active learned prompt are included —
 * agents not in the map fall back to hardcoded prompts in the pipeline.
 *
 * Public within the app (session-gated via cookie in middleware), no CRON_SECRET needed.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Minimum run count before a learned prompt is trusted enough to replace hardcoded one.
// Prompts with fewer runs are still experimental — don't expose them to production pipeline.
const MIN_RUN_COUNT = 3

// Minimum score improvement delta before using learned over hardcoded.
// If the learned prompt's avgScore is only marginally better, stick with the known-good hardcoded.
const MIN_SCORE_DELTA = 0.3

export async function GET() {
  try {
    const auth = await requireSession()
    if (auth.error) return auth.error

    // Fetch the most recent active, non-quarantined prompt per agent
    // where the prompt has been exercised enough to be trusted
    const activeVersions = await prisma.promptVersion.findMany({
      where: {
        active:       true,
        quarantined:  false,
        runCount:     { gte: MIN_RUN_COUNT },
        avgScore:     { gte: MIN_SCORE_DELTA },   // avgScore stores absolute score, not delta — must be >0 at minimum
      },
      orderBy: { createdAt: 'desc' },
      select:  { agentId: true, prompt: true, avgScore: true, runCount: true, createdAt: true },
    })

    // De-duplicate: keep only the latest version per agentId
    const seen   = new Set<string>()
    const result: Record<string, string> = {}

    for (const v of activeVersions) {
      if (!seen.has(v.agentId) && v.prompt.trim().length > 50) {
        seen.add(v.agentId)
        result[v.agentId] = v.prompt
      }
    }

    return NextResponse.json({ ok: true, data: result })
  } catch (err) {
    console.error('[learning/active-prompts]', err)
    // Return empty map — pipeline falls back to hardcoded prompts. Never 500 here.
    return NextResponse.json({ ok: true, data: {} })
  }
}
