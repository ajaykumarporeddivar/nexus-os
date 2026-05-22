/**
 * POST /api/arbflow/content-engine
 *
 * Given an offer description, generates ready-to-post hooks and captions
 * for Instagram, LinkedIn, and X (Twitter) — same AI stack as content/generate.
 *
 * Auth required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { aiComplete }                from '@/lib/ai'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 30

interface ContentPost {
  platform: string
  hook:     string
  body:     string
  cta:      string
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, error: 'Auth required' }, { status: 401 })
    }

    const body = await req.json() as { offer?: string }
    const offer = (body.offer ?? '').trim()
    if (!offer) return NextResponse.json({ ok: false, error: 'offer required' }, { status: 400 })

    const result = await aiComplete({
      system: `You are a world-class social media copywriter for solo founders in 2026.
You write viral, authentic content that drives DMs, saves, and sales — not likes.

Rules:
- Every hook must stop the scroll in 1 line — specific, surprising, or counterintuitive
- Body must be scannable: short paragraphs or line-breaks, never a wall of text
- CTA must be specific: tell the reader exactly what to do and what they'll get
- Never use: "game-changer", "revolutionary", "in today's world", "I'm excited to share"
- Instagram: casual, story-driven, relatable pain → transformation
- LinkedIn: professional but genuine, founder POV, insight-first
- X/Twitter: punchy, specific, one strong idea per tweet

Return ONLY valid JSON — no markdown:
{
  "posts": [
    {
      "platform": "Instagram",
      "hook": "Opening line that stops the scroll",
      "body": "2-4 short paragraphs or line-break list. Conversational.",
      "cta": "Specific action (comment a word, DM, click link)"
    },
    {
      "platform": "LinkedIn",
      "hook": "Professional opening statement or question",
      "body": "3-4 paragraphs. Founder insight tone. Data or specific detail.",
      "cta": "Professional CTA (follow, comment, share)"
    },
    {
      "platform": "X / Twitter",
      "hook": "Single punchy opening tweet (max 200 chars)",
      "body": "2-3 supporting points (can be a short thread format 1/ 2/ 3/)",
      "cta": "RT / reply / follow CTA"
    }
  ]
}`,
      messages: [{ role: 'user', content: `Generate 3 platform-specific social posts to sell this offer: "${offer}"` }],
      maxTokens: 1200,
      fastMode: false,
    })

    const match = result.text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in AI response')

    let data: { posts: ContentPost[] }
    try {
      data = JSON.parse(match[0]) as { posts: ContentPost[] }
    } catch {
      const retry = await aiComplete({
        system: 'You are a JSON repair tool. Return ONLY valid JSON, no markdown.',
        messages: [{ role: 'user', content: `Fix this JSON: ${match[0]}` }],
        maxTokens: 1200,
        fastMode: true,
      })
      const retryMatch = retry.text.match(/\{[\s\S]*\}/)
      if (!retryMatch) throw new Error('AI returned malformed JSON twice')
      data = JSON.parse(retryMatch[0]) as { posts: ContentPost[] }
    }

    const posts = Array.isArray(data.posts) ? data.posts.slice(0, 3) : []

    return NextResponse.json({ ok: true, posts })
  } catch (err) {
    console.error('[arbflow/content-engine]', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
