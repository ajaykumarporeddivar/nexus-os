import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

function streamResponse(text: string) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  }), { status: 200 })
}

describe('aiStream Groq fallback payload handling', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    process.env = {
      ...ORIGINAL_ENV,
      ANTHROPIC_API_KEY: '',
      GEMINI_API_KEY:    '',
      GROQ_API_KEY:      'test-groq-key',
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...ORIGINAL_ENV }
  })

  it('shrinks and retries Groq stream requests after 413 until accepted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('too large', { status: 413 }))
      .mockResolvedValueOnce(new Response('still too large', { status: 413 }))
      .mockResolvedValueOnce(streamResponse('accepted after shrink'))
    vi.stubGlobal('fetch', fetchMock)

    const { aiStream } = await import('@/lib/ai')
    const chunks: string[] = []
    for await (const chunk of aiStream({
      system: 'system '.repeat(4_000),
      messages: [{ role: 'user', content: 'message '.repeat(8_000) }],
      maxTokens: 8000,
    })) {
      chunks.push(chunk)
    }

    expect(chunks.join('')).toBe('accepted after shrink')
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    const thirdBody = JSON.parse(fetchMock.mock.calls[2][1].body as string)

    expect(secondBody.messages[1].content.length).toBeLessThan(firstBody.messages[1].content.length)
    expect(thirdBody.messages[1].content.length).toBeLessThan(secondBody.messages[1].content.length)
    expect(thirdBody.max_tokens).toBe(4096)
  })
})
