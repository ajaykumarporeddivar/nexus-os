/**
 * POST /api/arbflow/validate-niche
 *
 * Scores a niche or business idea 0–100 using the same AI stack as Trending.
 * Returns: score, status, summary, strengths[], risks[], recommendation.
 *
 * Auth required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { aiComplete }                from '@/lib/ai'

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 30

interface NicheResult {
  score:          number
  status:         'validated' | 'borderline' | 'rejected'
  summary:        string
  strengths:      string[]
  risks:          string[]
  recommendation: string
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, error: 'Auth required' }, { status: 401 })
    }

    const body = await req.json() as { idea?: string }
    const idea = (body.idea ?? '').trim()
    if (!idea) return NextResponse.json({ ok: false, error: 'idea required' }, { status: 400 })

    const result = await aiComplete({
      system: `You are a micro-SaaS market analyst for NEXUS OS. Your job is to objectively score whether a niche or business idea is worth pursuing RIGHT NOW in 2026.

Evaluate along these axes:
1. Market demand — are people actively searching for and paying for this today?
2. Competition density — is there room for a focused, well-positioned new entrant?
3. Monetisation potential — can this realistically charge $50–$500/mo or $500–$5,000 one-time?
4. Build feasibility — can a solo founder ship an MVP in 4–8 weeks?
5. Distribution clarity — is there a clear channel to reach the first 10 customers?

Score 0–100:
  0–49  = rejected (too crowded, too vague, or no monetisation path)
  50–74 = borderline (fixable with tighter ICP or niche-down)
  75–100 = validated (clear pain, clear buyer, clear price point)

Return ONLY valid JSON — no markdown, no prose outside the JSON:
{
  "score": integer 0-100,
  "status": "validated" | "borderline" | "rejected",
  "summary": "1 sentence explaining the market position of this idea",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "risks": ["risk 1", "risk 2"],
  "recommendation": "1 concrete next step the founder should take this week"
}`,
      messages: [{ role: 'user', content: `Score this niche idea: "${idea}"` }],
      maxTokens: 600,
      fastMode: true,
    })

    const match = result.text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in AI response')

    let data: NicheResult
    try {
      data = JSON.parse(match[0]) as NicheResult
    } catch {
      const retry = await aiComplete({
        system: 'You are a JSON repair tool. Return ONLY valid JSON, no markdown.',
        messages: [{ role: 'user', content: `Fix this JSON: ${match[0]}` }],
        maxTokens: 600,
        fastMode: true,
      })
      const retryMatch = retry.text.match(/\{[\s\S]*\}/)
      if (!retryMatch) throw new Error('AI returned malformed JSON twice')
      data = JSON.parse(retryMatch[0]) as NicheResult
    }

    // Clamp and normalise
    data.score  = Math.min(100, Math.max(0, Math.round(data.score ?? 50)))
    data.status = data.score >= 75 ? 'validated' : data.score >= 50 ? 'borderline' : 'rejected'
    data.strengths  = Array.isArray(data.strengths)  ? data.strengths.slice(0, 4)  : []
    data.risks      = Array.isArray(data.risks)      ? data.risks.slice(0, 3)      : []

    return NextResponse.json({ ok: true, ...data })
  } catch (err) {
    console.error('[arbflow/validate-niche]', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
