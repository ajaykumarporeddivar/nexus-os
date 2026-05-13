/**
 * Unified AI client — 3-provider chain with smart key rotation on Gemini + Groq.
 *
 * Chain (non-streaming and streaming):
 *   1. Anthropic   — claude-sonnet (primary, best quality)
 *   2. Gemini      — gemini-2.5-flash, rotates GEMINI_API_KEY plus GEMINI_API_KEY1…GEMINI_API_KEY50
 *   3. Groq        — llama-3.3-70b → 8b, rotates GROQ_API_KEY plus GROQ_API_KEY1…GROQ_API_KEY50
 *
 * Key manager features:
 *   - Per-key cooldown: a 429'd key is skipped for 60s (Gemini) / 30s (Groq)
 *   - Round-robin start: each request begins at a rotating index, spreading load evenly
 *   - Supports up to 51 keys per provider (base + KEY1…KEY50)
 */

import Anthropic from '@anthropic-ai/sdk'

// ─── Constants ────────────────────────────────────────────────────────────────

export const AI_MODELS = {
  primary:      'claude-sonnet-4-20250514',
  fast:         'claude-haiku-4-5-20251001',
  gemini:       'gemini-2.5-flash',
  geminiFast:   'gemini-2.5-flash-lite',
  fallback:     'llama-3.3-70b-versatile',
  fallbackFast: 'llama-3.1-8b-instant',
} as const

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

const GEMINI_COOLDOWN_MS = 61_000  // free tier resets every 60s
const GROQ_COOLDOWN_MS   = 31_000  // groq free tier is per-minute

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AICompleteOptions {
  system:     string
  messages:   AIMessage[]
  maxTokens?: number
  model?:     string
  fastMode?:  boolean
}

export interface AICompleteResult {
  text:     string
  provider: 'anthropic' | 'gemini' | 'groq'
  model:    string
  tokens?:  number
}

// ─── Smart key pool ───────────────────────────────────────────────────────────
// Module-level so cooldown state persists across requests within the same
// server process (Next.js route handlers share the module instance).

const keyCooldowns = new Map<string, number>()  // key → cooldown-expiry timestamp
let geminiRoundRobin = 0
let groqRoundRobin   = 0

function isKeyCooledDown(key: string): boolean {
  const expiry = keyCooldowns.get(key)
  if (!expiry) return false
  if (Date.now() >= expiry) { keyCooldowns.delete(key); return false }
  return true
}

function setCooldown(key: string, ms: number) {
  keyCooldowns.set(key, Date.now() + ms)
}

function getProviderKeys(prefix: 'GEMINI_API_KEY' | 'GROQ_API_KEY'): string[] {
  const keys: string[] = []
  const base = process.env[prefix]?.trim()
  if (base) keys.push(base)
  for (let i = 1; i <= 50; i++) {
    const key = process.env[`${prefix}${i}`]?.trim()
    if (key) keys.push(key)
  }
  return [...new Set(keys)]
}

function getGeminiKeys(): string[] {
  return getProviderKeys('GEMINI_API_KEY')
}

function getGroqKeys(): string[] {
  return getProviderKeys('GROQ_API_KEY')
}

/** Returns non-cooled keys in round-robin order. Cooled-down keys are skipped for this request. */
function orderedReadyKeys(keys: string[], startIndex: number): string[] {
  const n = keys.length
  return Array.from({ length: n }, (_, i) => keys[(startIndex + i) % n])
    .filter(k => !isKeyCooledDown(k))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ANTHROPIC_FALLBACK = [
  'credit balance', 'quota', 'billing', 'overload', 'rate_limit', 'too many requests',
  'connection error', 'connection timeout', 'econnrefused', 'etimedout', 'enotfound',
  'fetch failed', 'network', 'socket', 'upstream',
]
function isAnthropicFallback(msg: string): boolean {
  const l = msg.toLowerCase()
  return ANTHROPIC_FALLBACK.some(t => l.includes(t))
}

function isGeminiFallback(msg: string, status?: number): boolean {
  const l = msg.toLowerCase()
  return status === 404 || status === 429 || (status ?? 0) >= 500 ||
    l.includes('not found') ||
    l.includes('no longer available') ||
    l.includes('not supported') ||
    l.includes('quota') ||
    l.includes('rate limit') ||
    l.includes('resource exhausted')
}

// ─── Gemini helpers ───────────────────────────────────────────────────────────

function geminiBody(system: string, messages: AIMessage[], maxTokens: number) {
  return {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: messages.map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: { maxOutputTokens: Math.min(maxTokens, 8192) },
  }
}

async function geminiComplete(
  system: string,
  messages: AIMessage[],
  maxTokens: number,
  fastMode: boolean,
): Promise<{ text: string; model: string }> {
  const allKeys = getGeminiKeys()
  if (allKeys.length === 0) throw new Error('No GEMINI_API_KEY configured')

  const model = fastMode ? AI_MODELS.geminiFast : AI_MODELS.gemini
  const keys  = orderedReadyKeys(allKeys, geminiRoundRobin)
  geminiRoundRobin = (geminiRoundRobin + 1) % allKeys.length

  for (const apiKey of keys) {
    const res = await fetch(`${GEMINI_URL}/${model}:generateContent?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(geminiBody(system, messages, maxTokens)),
    })

    if (res.status === 429 || res.status === 503) {
      console.warn(`[ai] Gemini key …${apiKey.slice(-6)} rate-limited (${res.status}), trying next key`)
      setCooldown(apiKey, GEMINI_COOLDOWN_MS)
      continue
    }
    if (!res.ok) {
      const err = await res.text()
      throw Object.assign(new Error(`Gemini error ${res.status}: ${err}`), { status: res.status })
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return { text, model }
  }

  throw Object.assign(new Error('All Gemini keys exhausted or cooling down. Configured keys are GEMINI_API_KEY plus GEMINI_API_KEY1…GEMINI_API_KEY50; wait 61s or add more keys.'), { status: 429 })
}

async function* geminiStream(
  system: string,
  messages: AIMessage[],
  maxTokens: number,
  fastMode: boolean,
): AsyncGenerator<string> {
  const allKeys = getGeminiKeys()
  if (allKeys.length === 0) throw new Error('No GEMINI_API_KEY configured')

  const model = fastMode ? AI_MODELS.geminiFast : AI_MODELS.gemini
  const keys  = orderedReadyKeys(allKeys, geminiRoundRobin)
  geminiRoundRobin = (geminiRoundRobin + 1) % allKeys.length

  for (const apiKey of keys) {
    const res = await fetch(
      `${GEMINI_URL}/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(geminiBody(system, messages, maxTokens)),
      },
    )

    if (res.status === 429 || res.status === 503) {
      console.warn(`[ai] Gemini stream key …${apiKey.slice(-6)} rate-limited, trying next key`)
      setCooldown(apiKey, GEMINI_COOLDOWN_MS)
      continue
    }
    if (!res.ok) {
      const err = await res.text()
      throw Object.assign(new Error(`Gemini stream error ${res.status}: ${err}`), { status: res.status })
    }

    const reader = res.body!.getReader()
    const dec    = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of dec.decode(value).split('\n')) {
        if (!line.startsWith('data:') || line.includes('[DONE]')) continue
        try {
          const chunk = JSON.parse(line.replace(/^data:\s*/, ''))
          const text  = chunk.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) yield text
        } catch { /* partial SSE line */ }
      }
    }
    return
  }

  throw Object.assign(new Error('All Gemini stream keys exhausted or cooling down. Configured keys are GEMINI_API_KEY plus GEMINI_API_KEY1…GEMINI_API_KEY50; wait 61s or add more keys.'), { status: 429 })
}

// ─── Groq helpers ──────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function groqComplete(
  model: string,
  cap: number,
  system: string,
  messages: AIMessage[],
  retryOnExhaust = true,
): Promise<{ text: string; key: string }> {
  const allKeys = getGroqKeys()
  if (allKeys.length === 0) throw new Error('No Groq keys configured')

  const keys = orderedReadyKeys(allKeys, groqRoundRobin)
  groqRoundRobin = (groqRoundRobin + 1) % allKeys.length

  for (const key of keys) {
    const res = await fetch(GROQ_URL, {
      method:  'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model,
        max_tokens: cap,
        messages:   [{ role: 'system', content: system }, ...messages],
      }),
    })

    if (res.status === 429) {
      console.warn(`[ai] Groq key …${key.slice(-6)} rate-limited, trying next key`)
      setCooldown(key, GROQ_COOLDOWN_MS)
      continue
    }
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Groq error ${res.status}: ${err}`)
    }

    const data = await res.json()
    return { text: data.choices?.[0]?.message?.content ?? '', key }
  }

  // All keys exhausted — wait 18s and retry once before failing
  if (retryOnExhaust) {
    console.warn('[ai] All Groq keys rate-limited — waiting 18s then retrying')
    await sleep(18000)
    return groqComplete(model, cap, system, messages, false)
  }

  throw new Error('All Groq keys exhausted or cooling down (' + allKeys.length + ' configured). Wait 31s or add GROQ_API_KEY16-GROQ_API_KEY50.')
}

async function* groqStream(
  model: string,
  cap: number,
  system: string,
  messages: AIMessage[],
): AsyncGenerator<string> {
  const allKeys = getGroqKeys()
  if (allKeys.length === 0) throw new Error('No Groq keys configured')

  const keys = orderedReadyKeys(allKeys, groqRoundRobin)
  groqRoundRobin = (groqRoundRobin + 1) % allKeys.length

  for (const key of keys) {
    const res = await fetch(GROQ_URL, {
      method:  'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model,
        max_tokens: cap,
        stream:     true,
        messages:   [{ role: 'system', content: system }, ...messages],
      }),
    })

    if (res.status === 429) {
      console.warn(`[ai] Groq stream key …${key.slice(-6)} rate-limited, trying next key`)
      setCooldown(key, GROQ_COOLDOWN_MS)
      continue
    }
    if (!res.ok) throw new Error(`Groq stream error ${res.status}`)

    const reader = res.body!.getReader()
    const dec    = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of dec.decode(value).split('\n')) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
        try {
          const delta = JSON.parse(line.slice(6))?.choices?.[0]?.delta?.content
          if (delta) yield delta
        } catch { /* partial chunk */ }
      }
    }
    return
  }

  throw new Error('All Groq stream keys exhausted or cooling down (' + allKeys.length + ' configured). Wait 31s or add GROQ_API_KEY16-GROQ_API_KEY50.')
}

// ─── Non-streaming completion ─────────────────────────────────────────────────

export async function aiComplete(opts: AICompleteOptions): Promise<AICompleteResult> {
  const { system, messages, maxTokens = 1200, model, fastMode = false } = opts
  const anthropicModel = model ?? (fastMode ? AI_MODELS.fast : AI_MODELS.primary)
  const anthropicKey   = process.env.ANTHROPIC_API_KEY
  let lastProviderError = ''

  // 1️⃣ Anthropic
  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey })
      const res    = await client.messages.create({
        model: anthropicModel, max_tokens: maxTokens, system, messages,
      })
      const text = (res.content[0] as { text: string }).text
      return { text, provider: 'anthropic', model: anthropicModel,
               tokens: res.usage.input_tokens + res.usage.output_tokens }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!isAnthropicFallback(msg)) throw err
      lastProviderError = msg
      console.warn('[ai] Anthropic → Gemini fallback:', msg.slice(0, 100))
    }
  }

  // 2️⃣ Gemini (up to 51 keys with cooldown-aware rotation)
  if (getGeminiKeys().length > 0) {
    try {
      const { text, model: gModel } = await geminiComplete(system, messages, maxTokens, fastMode)
      return { text, provider: 'gemini', model: gModel }
    } catch (err) {
      const e = err as { status?: number; message?: string }
      const shouldFallback = isGeminiFallback(e.message ?? '', e.status)
      if (!shouldFallback) throw err
      lastProviderError = e.message ?? lastProviderError
      console.warn('[ai] Gemini → Groq fallback:', String(e.message).slice(0, 100))
    }
  }

  // 3️⃣ Groq (up to 51 keys with cooldown-aware rotation)
  if (getGroqKeys().length === 0) {
    if (lastProviderError) {
      throw new Error(`Primary AI provider unavailable (${lastProviderError.slice(0, 160)}). Configure GEMINI_API_KEY or GROQ_API_KEY fallback keys, or restore Anthropic credits.`)
    }
    throw new Error('No AI provider available — set ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY')
  }

  // llama-3.3-70b supports up to 32768 output tokens; 8192 covers heavy BUILD agents
  const groqCap = Math.min(maxTokens, 8192)
  try {
    const groqModel = fastMode ? AI_MODELS.fallbackFast : AI_MODELS.fallback
    const { text }  = await groqComplete(groqModel, groqCap, system, messages)
    return { text, provider: 'groq', model: groqModel }
  } catch {
    const { text } = await groqComplete(AI_MODELS.fallbackFast, Math.min(groqCap, 4096), system, messages)
    return { text, provider: 'groq', model: AI_MODELS.fallbackFast }
  }
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export async function* aiStream(opts: AICompleteOptions): AsyncGenerator<string> {
  const { system, messages, maxTokens = 2000, model, fastMode = false } = opts
  const anthropicModel = model ?? (fastMode ? AI_MODELS.fast : AI_MODELS.primary)
  const anthropicKey   = process.env.ANTHROPIC_API_KEY
  let lastProviderError = ''

  // 1️⃣ Anthropic streaming
  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey })
      const stream = client.messages.stream({
        model: anthropicModel, max_tokens: maxTokens, system, messages,
      })
      let errored = false
      let anthropicChars = 0
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            anthropicChars += event.delta.text.length
            yield event.delta.text
          }
        }
        if (anthropicChars === 0) console.warn('[ai] Anthropic stream returned 0 chars (empty response — will be retried by caller)')
        return
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!isAnthropicFallback(msg)) throw err
        lastProviderError = msg
        errored = true
        console.warn('[ai] Anthropic stream → Gemini fallback:', msg.slice(0, 100))
      }
      if (!errored) return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!isAnthropicFallback(msg)) throw err
      lastProviderError = msg
      console.warn('[ai] Anthropic outer catch → fallback:', msg.slice(0, 100))
    }
  }

  // 2️⃣ Gemini streaming (up to 51 keys with cooldown-aware rotation)
  if (getGeminiKeys().length > 0) {
    try {
      yield* geminiStream(system, messages, maxTokens, fastMode)
      return
    } catch (err) {
      const e = err as { status?: number; message?: string }
      const shouldFallback = isGeminiFallback(e.message ?? '', e.status)
      if (!shouldFallback) throw err
      lastProviderError = e.message ?? lastProviderError
      console.warn('[ai] Gemini stream → Groq fallback:', String(e.message).slice(0, 100))
    }
  }

  // 3️⃣ Groq streaming (up to 51 keys with cooldown-aware rotation)
  if (getGroqKeys().length === 0) {
    if (lastProviderError) {
      throw new Error(`Primary AI provider unavailable (${lastProviderError.slice(0, 160)}). Configure GEMINI_API_KEY or GROQ_API_KEY fallback keys, or restore Anthropic credits.`)
    }
    throw new Error('No AI provider available')
  }

  const groqStreamCap = Math.min(maxTokens, 8192)
  try {
    const groqModel = fastMode ? AI_MODELS.fallbackFast : AI_MODELS.fallback
    yield* groqStream(groqModel, groqStreamCap, system, messages)
    return
  } catch {
    yield* groqStream(AI_MODELS.fallbackFast, Math.min(groqStreamCap, 4096), system, messages)
  }
}
