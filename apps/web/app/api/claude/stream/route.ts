import Anthropic from '@anthropic-ai/sdk'
import { aiStream } from '@/lib/ai'
import { NextRequest, NextResponse } from 'next/server'
import { checkTokenQuota, incrementTokenQuota } from '@/lib/quota'
import { checkRateLimit } from '@/lib/ratelimit'
import { requireSession, getPlan } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { computeFatigueZone } from '@/lib/fatigueZone'
import { killThreshold, pipelineCap } from '@/lib/crCompute'

const MODEL = 'claude-sonnet-4-20250514'

// AAS v4 — build GOVERNOR context string from live system state.
// Called only when the {{aasContext}} placeholder is detected in the system prompt.
// Fails silently (returns empty string) so existing sessions never break.
async function buildAASContext(plan: string): Promise<string> {
  try {
    const [regime, fatigue, latestCR] = await Promise.all([
      prisma.systemRegime.findFirst({ orderBy: { classifiedAt: 'desc' } }).catch(() => null),
      computeFatigueZone(plan).catch(() => null),
      prisma.cRSnapshot.findFirst({ orderBy: { computedAt: 'desc' } }).catch(() => null),
    ])

    const regimeClass = regime?.regimeClass ?? 'unknown'
    const fatigueZone = fatigue?.zone ?? 'green'
    const cr          = latestCR?.cr ?? null
    const ktX         = killThreshold(regimeClass, 'X')
    const cap         = pipelineCap(regimeClass)

    const crLine = cr !== null
      ? `CR: ${cr.toFixed(3)} (${cr >= 0.95 ? 'healthy' : 'below target — Phase 09 audit pending'})`
      : 'CR: not yet computed'

    const fatigueLine = fatigueZone === 'red'
      ? 'FATIGUE: RED — strategic decisions blocked. Proceed with review tasks only.'
      : fatigueZone === 'yellow'
      ? 'FATIGUE: YELLOW — irreversible decisions blocked. Reversible analysis permitted.'
      : 'FATIGUE: GREEN — full capacity.'

    return `
AAS v4 SYSTEM STATE (injected by GOVERNOR):
- Regime: ${regimeClass.toUpperCase()} (confidence: ${((regime?.confidence ?? 0) * 100).toFixed(0)}%)
- Kill threshold (X-track): EV/C ≥ ${ktX} | Pipeline cap: ${cap} signals
- ${crLine}
- ${fatigueLine}
- Regime rules: ${
      regimeClass === 'contraction'
        ? 'graceful degradation active — no new exploration, survival mode'
        : regimeClass === 'transition'
        ? 'pause rule updates — prioritise exploit over explore (80/20)'
        : regimeClass === 'expansion'
        ? 'explore ratio elevated (60%) — high signal density, relaxed kill floor'
        : 'unknown regime — default to transition rules, human review before irreversible actions'
    }

Apply these constraints when setting session parameters. In red fatigue: recommend halting non-critical sessions. In contraction: reduce iteration depth to surface or standard maximum.`
  } catch {
    return ''
  }
}

// Rate limiting: 40 req/min per session (pipeline runs need 9 FORGE + 10 BUILD + up to 4 revision agents)

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession()
    if (auth.error) return auth.error

    const sid     = auth.user.id!
    const isAdmin = auth.user.isAdmin ?? false
    const [plan, body] = await Promise.all([getPlan(req), req.json()])
    const { systemPrompt, userMessage, apiKey } = body

    if (!systemPrompt || !userMessage) {
      return NextResponse.json({ ok: false, error: 'Missing systemPrompt or userMessage' }, { status: 400 })
    }
    if (typeof systemPrompt !== 'string' || typeof userMessage !== 'string') {
      return NextResponse.json({ ok: false, error: 'systemPrompt and userMessage must be strings' }, { status: 400 })
    }
    // Strip ASCII control chars (except \t \n \r) to prevent prompt injection via malicious brief content
    const sanitise = (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 24 000 chars ≈ ~6 000 tokens — safe headroom below Groq's per-request body limit.
    // Anthropic can handle 32k chars fine; Groq returns 413 above ~20k chars in the user message.
    // System prompt is kept at 20k to leave room for the user message.
    const safeSystem  = sanitise(systemPrompt).slice(0, 20_000)
    const safeMessage = sanitise(userMessage).slice(0, 24_000)
    if (safeMessage.trim().length < 10) {
      return NextResponse.json({ ok: false, error: 'userMessage too short (min 10 chars after sanitisation)' }, { status: 400 })
    }

    const rl = await checkRateLimit(sid)
    if (!rl.success) {
      return NextResponse.json(
        { ok: false, error: `Rate limit exceeded. Max ${40} requests/min. Try again shortly.` },
        { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.ceil(rl.reset / 1000)) } }
      )
    }

    // Token quota check — run quota is managed at pipeline level, not per-agent-call.
    // Checking run quota here would exhaust a 3-run free plan after 3 FORGE agent calls
    // (out of 21 total). Only token quota is enforced at the stream level.
    const tokenQuota = await checkTokenQuota(sid, plan, isAdmin)
    if (!tokenQuota.ok) {
      return NextResponse.json(
        { ok: false, error: `Monthly token limit reached (${tokenQuota.used.toLocaleString()}/${tokenQuota.limit.toLocaleString()} tokens). Upgrade to Agency for unlimited tokens.` },
        { status: 429 }
      )
    }

    // AAS v4 — resolve {{aasContext}} in GOVERNOR prompt if present (other lenses unaffected)
    let resolvedSystemPrompt: string = safeSystem
    if (safeSystem.includes('{{aasContext}}')) {
      const aasContext = await buildAASContext(plan)
      resolvedSystemPrompt = safeSystem.replace('{{aasContext}}', aasContext)
    }

    const userProvidedKey = !!apiKey
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY

    if (userProvidedKey && !key) {
      return NextResponse.json({ ok: false, error: 'No API key provided' }, { status: 401 })
    }

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let totalTokens = 0

          if (userProvidedKey && key) {
            // User's own Anthropic key — direct, no fallback (their budget)
            const client = new Anthropic({ apiKey: key })
            const anthropicStream = client.messages.stream({
              model: MODEL,
              max_tokens: 8000,
              system: resolvedSystemPrompt,
              messages: [{ role: 'user', content: safeMessage }],
            })

            for await (const event of anthropicStream) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content: event.delta.text })}\n\n`))
              }
            }

            const final = await anthropicStream.finalMessage()
            totalTokens = final.usage.input_tokens + final.usage.output_tokens
          } else {
            // Server key — use aiStream() with Anthropic primary + Groq fallback
            let charCount = 0
            const sysLen = resolvedSystemPrompt.length
            const msgLen = safeMessage.length
            try {
              for await (const text of aiStream({
                system:    resolvedSystemPrompt,
                messages:  [{ role: 'user', content: safeMessage }],
                maxTokens: 8000,
              })) {
                charCount += text.length
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content: text })}\n\n`))
              }
            } catch (streamErr) {
              const streamMsg = streamErr instanceof Error ? streamErr.message : 'aiStream error'
              console.error(`[stream] aiStream error — sys=${sysLen} msg=${msgLen} err=${streamMsg.slice(0, 200)}`)
              throw streamErr
            }
            if (charCount === 0) {
              console.warn(`[stream] aiStream yielded 0 chars — sys=${sysLen} msg=${msgLen}`)
              throw new Error('AI provider returned an empty response. This is treated as a failed agent call and will be retried.')
            }
            totalTokens = Math.ceil(charCount / 4)
          }

          incrementTokenQuota(sid, totalTokens, plan).catch(console.error)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', tokens: totalTokens })}\n\n`))
          controller.close()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Stream error'
          console.error(`[stream] outer catch: ${msg.slice(0, 200)}`)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}


