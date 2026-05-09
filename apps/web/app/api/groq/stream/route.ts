import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'GROQ_API_KEY not configured' }, { status: 503 })
  }

  const { systemPrompt, userMessage, model = 'llama-3.3-70b-versatile', maxTokens = 1200 } = await req.json()

  const groqRes = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  })

  if (!groqRes.ok) {
    const err = await groqRes.text()
    return NextResponse.json({ ok: false, error: err }, { status: groqRes.status })
  }

  const encoder = new TextEncoder()
  let tokenCount = 0

  const stream = new ReadableStream({
    async start(controller) {
      const reader = groqRes.body!.getReader()
      const dec = new TextDecoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const lines = dec.decode(value).split('\n').filter(l => l.startsWith('data: '))
          for (const line of lines) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', tokens: tokenCount })}\n\n`))
              continue
            }
            try {
              const chunk = JSON.parse(data)
              const content = chunk.choices?.[0]?.delta?.content
              if (content) {
                tokenCount += Math.ceil(content.length / 4)
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`))
              }
            } catch { /* partial JSON */ }
          }
        }
      } finally {
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
}
