import Anthropic from '@anthropic-ai/sdk'
import { aiComplete } from '@/lib/ai'
import { NextRequest, NextResponse } from 'next/server'
import { checkTokenQuota, incrementTokenQuota } from '@/lib/quota'
import { checkRateLimit } from '@/lib/ratelimit'
import { requireSession } from '@/lib/session'

export const runtime    = 'nodejs'
export const maxDuration = 120

const MODEL = 'claude-sonnet-4-20250514'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession()
    if (auth.error) return auth.error

    const sid     = auth.user.id!
    const plan    = auth.user.plan ?? 'free'
    const isAdmin = auth.user.isAdmin ?? false

    const body = await req.json()
    const { systemPrompt, userMessage, apiKey } = body

    if (!systemPrompt || !userMessage) {
      return NextResponse.json({ ok: false, error: 'Missing systemPrompt or userMessage' }, { status: 400 })
    }
    if (typeof systemPrompt !== 'string' || typeof userMessage !== 'string') {
      return NextResponse.json({ ok: false, error: 'systemPrompt and userMessage must be strings' }, { status: 400 })
    }
    const sanitise = (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    const safeSystem  = sanitise(systemPrompt).slice(0, 32_000)
    const safeMessage = sanitise(userMessage).slice(0, 32_000)
    if (safeMessage.trim().length < 10) {
      return NextResponse.json({ ok: false, error: 'userMessage too short (min 10 chars after sanitisation)' }, { status: 400 })
    }

    const rl = await checkRateLimit(sid)
    if (!rl.success) {
      return NextResponse.json(
        { ok: false, error: `Rate limit exceeded. Max 40 requests/min. Try again shortly.` },
        { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.ceil(rl.reset / 1000)) } }
      )
    }

    const userProvidedKey = !!apiKey
    if (userProvidedKey && !apiKey) {
      return NextResponse.json({ ok: false, error: 'No API key provided' }, { status: 401 })
    }
    const tokenQuota = await checkTokenQuota(sid, plan, isAdmin)
    if (!tokenQuota.ok) {
      return NextResponse.json(
        { ok: false, error: `Monthly token limit reached (${tokenQuota.used.toLocaleString()}/${tokenQuota.limit.toLocaleString()} tokens). Upgrade to Agency for 100K tokens/month.` },
        { status: 429 }
      )
    }

    let content: string
    let tokens: number
    let modelUsed: string

    if (userProvidedKey) {
      // User's own Anthropic key — direct, no fallback (their budget)
      const client = new Anthropic({ apiKey })
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 8096,
        system: safeSystem,
        messages: [{ role: 'user', content: safeMessage }],
      })
      content  = message.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('\n')
      tokens   = message.usage.input_tokens + message.usage.output_tokens
      modelUsed = MODEL
    } else {
      // Server key — Anthropic primary + Groq fallback
      const result = await aiComplete({
        system:    safeSystem,
        messages:  [{ role: 'user', content: safeMessage }],
        maxTokens: 8096,
      })
      content   = result.text
      tokens    = result.tokens ?? Math.ceil(result.text.length / 4)
      modelUsed = result.model
    }

    if (tokens <= 0 || content.trim().length < 20) {
      return NextResponse.json({ ok: false, error: 'AI provider returned an empty response. Please retry.' }, { status: 502 })
    }

    incrementTokenQuota(sid, tokens, plan).catch(console.error)

    return NextResponse.json({
      ok: true,
      data: { content, tokens, model: modelUsed },
    })
  } catch (err) {
    const anthropicErr = err as { status?: number; message?: string }
    if (anthropicErr.status === 401) {
      return NextResponse.json({ ok: false, error: 'Invalid API key' }, { status: 401 })
    }
    if (anthropicErr.status === 429) {
      return NextResponse.json(
        { ok: false, error: 'Rate limit reached. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
