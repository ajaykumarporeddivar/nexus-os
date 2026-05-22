/**
 * POST /api/arbflow/build-offer
 *
 * Given a validated niche, generates a complete premium digital offer:
 * title, format, price range, target buyer, deliverables, USP, CTA.
 *
 * Same AI stack as Trending + One-Click Pipeline.
 * Auth required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { aiComplete }                from '@/lib/ai'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 30

interface OfferResult {
  title:        string
  format:       string
  price:        string
  targetBuyer:  string
  deliverables: string[]
  usp:          string
  cta:          string
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, error: 'Auth required' }, { status: 401 })
    }

    const body = await req.json() as { niche?: string }
    const niche = (body.niche ?? '').trim()
    if (!niche) return NextResponse.json({ ok: false, error: 'niche required' }, { status: 400 })

    const result = await aiComplete({
      system: `You are a premium offer designer for solo founders and small agencies in 2026.
Your job: turn a validated niche into a specific, high-converting digital offer that can be sold TODAY.

Rules:
- Format must be one of: Template Bundle, Strategy Intensive, Done-For-You Package, Cohort Course, Retainer, or Toolkit + Call
- Price must be realistic for the niche — solo buyers pay $97–$497, B2B buyers pay $500–$5,000
- Deliverables must be concrete and countable — no vague "ongoing support"
- USP must contain the phrase "the only [niche] [offer type] that..."
- CTA must include a specific action (e.g. "Book a 15-min audit", "DM the word SYSTEM")
- targetBuyer must name a specific person, not "businesses" or "people"

Return ONLY valid JSON — no markdown, no prose:
{
  "title":        "Offer name (5–8 words, punchy)",
  "format":       "e.g. Template Bundle + 60-min Strategy Call",
  "price":        "e.g. $297 – $497 one-time",
  "targetBuyer":  "e.g. Solo freelance copywriters charging under $3k/project",
  "deliverables": ["item 1", "item 2", "item 3", "item 4"],
  "usp":          "The only [niche] [offer] that ...",
  "cta":          "Specific action the buyer takes to get started"
}`,
      messages: [{ role: 'user', content: `Build a premium digital offer for this niche: "${niche}"` }],
      maxTokens: 600,
      fastMode: true,
    })

    const match = result.text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in AI response')

    let data: OfferResult
    try {
      data = JSON.parse(match[0]) as OfferResult
    } catch {
      const retry = await aiComplete({
        system: 'You are a JSON repair tool. Return ONLY valid JSON, no markdown.',
        messages: [{ role: 'user', content: `Fix this JSON: ${match[0]}` }],
        maxTokens: 600,
        fastMode: true,
      })
      const retryMatch = retry.text.match(/\{[\s\S]*\}/)
      if (!retryMatch) throw new Error('AI returned malformed JSON twice')
      data = JSON.parse(retryMatch[0]) as OfferResult
    }

    data.deliverables = Array.isArray(data.deliverables) ? data.deliverables.slice(0, 6) : []

    return NextResponse.json({ ok: true, ...data })
  } catch (err) {
    console.error('[arbflow/build-offer]', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
