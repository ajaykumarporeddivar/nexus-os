/**
 * Unified AI client — 3-provider chain with smart key rotation on Gemini + Groq.
 *
 * Chain (non-streaming and streaming):
 *   1. Anthropic   — claude-sonnet (primary, best quality)
 *   2. Gemini      — gemini-2.0-flash, rotates GEMINI_API_KEY…GEMINI_API_KEY50
 *   3. Groq        — llama-3.3-70b → 8b, rotates GROQ_API_KEY…GROQ_API_KEY50
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
  gemini:       'gemini-2.0-flash',
  geminiFast:   'gemini-1.5-flash',
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

function getGeminiKeys(): string[] {
  const keys: string[] = []
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY)
  for (let i = 1; i <= 50; i++) {
    const k = process.env[`GEMINI_API_KEY${i}`]
    if (k) keys.push(k)
  }
  return [...new Set(keys)]
}

function getGroqKeys(): string[] {
  const keys: string[] = []
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY)
  for (let i = 1; i <= 50; i++) {
    const k = process.env[`GROQ_API_KEY${i}`]
    if (k) keys.push(k)
  }
  return [...new Set(keys)]
}

/** Returns keys in round-robin order, cooled-down keys moved to end of list */
function orderedKeys(keys: string[], startIndex: number): string[] {
  const n      = keys.length
  const rotated = Array.from({ length: n }, (_, i) => keys[(startIndex + i) % n])
  const ready   = rotated.filter(k => !isKeyCooledDown(k))
  const cooling = rotated.filter(k => isKeyCooledDown(k))
  return [...ready, ...cooling]
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
  const keys  = orderedKeys(allKeys, geminiRoundRobin)
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

  throw Object.assign(new Error('All Gemini keys exhausted — quota or rate limit on all accounts'), { status: 429 })
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
  const keys  = orderedKeys(allKeys, geminiRoundRobin)
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

  throw Object.assign(new Error('All Gemini stream keys exhausted'), { status: 429 })
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

  const keys = orderedKeys(allKeys, groqRoundRobin)
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

  throw new Error('All Groq keys rate-limited — add your own Anthropic key in the Runtime page, or wait 1 min and retry')
}

async function* groqStream(
  model: string,
  cap: number,
  system: string,
  messages: AIMessage[],
): AsyncGenerator<string> {
  const allKeys = getGroqKeys()
  if (allKeys.length === 0) throw new Error('No Groq keys configured')

  const keys = orderedKeys(allKeys, groqRoundRobin)
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

  throw new Error('All Groq keys rate-limited')
}

// ─── Non-streaming completion ─────────────────────────────────────────────────

export async function aiComplete(opts: AICompleteOptions): Promise<AICompleteResult> {
  const { system, messages, maxTokens = 1200, model, fastMode = false } = opts
  const anthropicModel = model ?? (fastMode ? AI_MODELS.fast : AI_MODELS.primary)
  const anthropicKey   = process.env.ANTHROPIC_API_KEY

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
      const shouldFallback = e.status === 429 || (e.status ?? 0) >= 500 ||
        isAnthropicFallback(e.message ?? '')
      if (!shouldFallback) throw err
      console.warn('[ai] Gemini → Groq fallback:', String(e.message).slice(0, 100))
    }
  }

  // 3️⃣ Groq (up to 51 keys with cooldown-aware rotation)
  if (getGroqKeys().length === 0) {
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
        if (anthropicChars === 0) console.warn('[ai] Anthropic stream returned 0 chars (empty response)')
        else console.log(`[ai] Anthropic stream OK — ${anthropicChars} chars`)
        return
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!isAnthropicFallback(msg)) throw err
        errored = true
        console.warn('[ai] Anthropic stream → Gemini fallback:', msg.slice(0, 100))
      }
      if (!errored) return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!isAnthropicFallback(msg)) throw err
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
      const shouldFallback = e.status === 429 || (e.status ?? 0) >= 500 ||
        isAnthropicFallback(e.message ?? '')
      if (!shouldFallback) throw err
      console.warn('[ai] Gemini stream → Groq fallback:', String(e.message).slice(0, 100))
    }
  }

  // 3️⃣ Groq streaming (up to 51 keys with cooldown-aware rotation)
  if (getGroqKeys().length === 0) throw new Error('No AI provider available')

  const groqStreamCap = Math.min(maxTokens, 8192)
  try {
    const groqModel = fastMode ? AI_MODELS.fallbackFast : AI_MODELS.fallback
    yield* groqStream(groqModel, groqStreamCap, system, messages)
    return
  } catch {
    yield* groqStream(AI_MODELS.fallbackFast, Math.min(groqStreamCap, 4096), system, messages)
  }
}
