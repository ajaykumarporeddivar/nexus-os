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
import { recordProviderRequest, recordProviderRateLimit, shouldSkipProvider } from './quotaTracker'

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

const GEMINI_COOLDOWN_MS = 62_000  // free tier resets every 60s; extra 2s buffer
const GROQ_COOLDOWN_MS   = 32_000  // groq free tier is per-minute; extra 1s buffer

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

// ─── Error Classifier (Hermes-inspired) ──────────────────────────────────────
//
// Four error classes drive distinct retry strategies:
//   QUOTA_EXHAUSTED   — monthly/daily quota gone; skip provider entirely this request
//   TOKEN_QUOTA_EXCEEDED — per-request token limit hit; skip ALL retries immediately
//   RETRYABLE         — transient (timeout, 503, network blip); retry same provider
//   HARD_FAIL         — auth failure, bad request, model gone; throw immediately
//
// This replaces the previous flat ANTHROPIC_FALLBACK string list with structured
// triage so TOKEN_QUOTA_EXCEEDED never wastes time on downstream provider calls.

export type ErrorClass = 'QUOTA_EXHAUSTED' | 'TOKEN_QUOTA_EXCEEDED' | 'RETRYABLE' | 'HARD_FAIL'

const TOKEN_QUOTA_PATTERNS = [
  'token_quota_exceeded',   // NEXUS OS internal tag
  'context_length_exceeded',
  'maximum context length',
  'input too long',
  'prompt is too long',
  'exceeds the maximum',
  'tokens per',             // "N tokens per minute" quota messages
  'tpm',                    // tokens-per-minute abbreviation
  'maximum token',
]

const QUOTA_EXHAUSTED_PATTERNS = [
  'credit balance',
  'insufficient credits',
  'billing',
  'quota exceeded',
  'daily quota',
  'monthly quota',
  'rate_limit_exceeded',
  'overloaded',
  'resource exhausted',
  'too many requests',
  'rate limit',
  'quota',
]

const RETRYABLE_PATTERNS = [
  'connection error',
  'connection timeout',
  'econnrefused',
  'etimedout',
  'enotfound',
  'fetch failed',
  'network',
  'socket',
  'upstream',
  'overload',
  'service unavailable',
  'bad gateway',
  'gateway timeout',
]

export function classifyError(msg: string, status?: number): ErrorClass {
  const l = msg.toLowerCase()

  // TOKEN_QUOTA_EXCEEDED is highest priority — check first to skip all retries
  if (TOKEN_QUOTA_PATTERNS.some(p => l.includes(p))) return 'TOKEN_QUOTA_EXCEEDED'

  // HTTP 401/403 = auth failures → HARD_FAIL immediately
  if (status === 401 || status === 403) return 'HARD_FAIL'

  // HTTP 400/404 on model endpoints = model gone or bad request → HARD_FAIL
  if (status === 400 || status === 404) return 'HARD_FAIL'

  // HTTP 429 = rate limit → QUOTA_EXHAUSTED (try next provider/key)
  if (status === 429) return 'QUOTA_EXHAUSTED'

  // 5xx except 503 transient = likely quota/overload → QUOTA_EXHAUSTED
  if (status !== undefined && status >= 500 && status !== 503) return 'QUOTA_EXHAUSTED'

  // 503 = service temporarily unavailable → RETRYABLE
  if (status === 503) return 'RETRYABLE'

  // Pattern-based classification on message text
  if (QUOTA_EXHAUSTED_PATTERNS.some(p => l.includes(p))) return 'QUOTA_EXHAUSTED'
  if (RETRYABLE_PATTERNS.some(p => l.includes(p))) return 'RETRYABLE'

  // Unknown errors — treat as HARD_FAIL to surface them rather than silently swallow
  return 'HARD_FAIL'
}

/** True when Anthropic should fall through to the next provider */
function isAnthropicFallback(msg: string, status?: number): boolean {
  const cls = classifyError(msg, status)
  // Never fall through on TOKEN_QUOTA_EXCEEDED — throw immediately so the caller sees it
  if (cls === 'TOKEN_QUOTA_EXCEEDED') return false
  return cls === 'QUOTA_EXHAUSTED' || cls === 'RETRYABLE'
}

/** True when Gemini should fall through to the next provider */
function isGeminiFallback(msg: string, status?: number): boolean {
  const cls = classifyError(msg, status)
  if (cls === 'TOKEN_QUOTA_EXCEEDED') return false
  return cls === 'QUOTA_EXHAUSTED' || cls === 'RETRYABLE'
}

// ─── Schema Normalizer (Hermes-inspired) ─────────────────────────────────────
//
// Anthropic rejects tool schemas that contain anyOf with null unions, top-level
// oneOf, or allOf patterns. This utility strips/normalizes those patterns before
// sending to the Anthropic API. Zero-cost on schemas that are already valid.

type JSONSchemaNode = Record<string, unknown>

function normalizeSchemaNode(node: JSONSchemaNode): JSONSchemaNode {
  const result: JSONSchemaNode = { ...node }

  // Collapse anyOf: [{"type":"X"}, {"type":"null"}]  →  {"type":"X"}
  if (Array.isArray(result.anyOf)) {
    const nonNull = (result.anyOf as JSONSchemaNode[]).filter(
      s => s.type !== 'null' && s !== null,
    )
    if (nonNull.length === 1) {
      const unwrapped = normalizeSchemaNode(nonNull[0])
      delete result.anyOf
      Object.assign(result, unwrapped)
    } else if (nonNull.length === 0) {
      delete result.anyOf
    } else {
      result.anyOf = nonNull.map(normalizeSchemaNode)
    }
  }

  // Strip top-level oneOf / allOf (Anthropic doesn't support them)
  if (Array.isArray(result.oneOf)) {
    const first = (result.oneOf as JSONSchemaNode[])[0]
    if (first) Object.assign(result, normalizeSchemaNode(first))
    delete result.oneOf
  }
  if (Array.isArray(result.allOf)) {
    // Merge all allOf schemas into result properties
    for (const schema of result.allOf as JSONSchemaNode[]) {
      const normalized = normalizeSchemaNode(schema)
      if (normalized.properties) {
        result.properties = { ...(result.properties as object ?? {}), ...(normalized.properties as object) }
      }
    }
    delete result.allOf
  }

  // Recursively normalize nested properties
  if (result.properties && typeof result.properties === 'object') {
    const props = result.properties as Record<string, JSONSchemaNode>
    result.properties = Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, normalizeSchemaNode(v)]),
    )
  }

  // Recursively normalize array items
  if (result.items && typeof result.items === 'object' && !Array.isArray(result.items)) {
    result.items = normalizeSchemaNode(result.items as JSONSchemaNode)
  }

  return result
}

/**
 * Normalize an OpenAI-style tool schema for Anthropic compatibility.
 * Strips anyOf/null unions, oneOf, and allOf patterns that Anthropic rejects.
 * Safe to call on already-valid schemas — returns them unchanged.
 */
export function normalizeToolSchema(schema: JSONSchemaNode): JSONSchemaNode {
  return normalizeSchemaNode(schema)
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
    // 413 = payload too large. Shrink until Groq accepts the request.
    if (res.status === 413) {
      console.warn(`[ai] Groq 413 on key …${key.slice(-6)} — shrinking and retrying`)
      for (const ratio of [0.45, 0.28, 0.16, 0.09, 0.05]) {
        const truncated = messages.map(m => ({
          ...m,
          content: typeof m.content === 'string'
            ? m.content.slice(0, Math.max(600, Math.floor(m.content.length * ratio)))
            : m.content,
        }))
        const retryRes = await fetch(GROQ_URL, {
          method:  'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            model,
            max_tokens: Math.min(cap, ratio <= 0.16 ? 1536 : 3072),
            messages:   [{ role: 'system', content: system.slice(0, Math.max(1000, Math.floor(system.length * ratio))) }, ...truncated],
          }),
        })
        if (retryRes.status === 413) continue
        if (retryRes.ok) {
          const retryData = await retryRes.json()
          return { text: retryData.choices?.[0]?.message?.content ?? '', key }
        }
        console.warn(`[ai] Groq 413 retry failed (${retryRes.status}) — trying next key`)
        break
      }
      continue
    }
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Groq error ${res.status}: ${err}`)
    }

    const data = await res.json()
    return { text: data.choices?.[0]?.message?.content ?? '', key }
  }

  // All keys exhausted — try the fastest model immediately before sleeping.
  // llama-3.1-8b-instant uses a separate TPM bucket so it may succeed when 70b is fully rate-limited.
  if (retryOnExhaust && model !== AI_MODELS.fallbackFast) {
    console.warn('[ai] All Groq 70b keys rate-limited — retrying immediately with 8b-instant')
    return groqComplete(AI_MODELS.fallbackFast, Math.min(cap, 4096), system, messages, false)
  }

  // True last resort: short 8s sleep then one final attempt (was 18s — reduced to 8s)
  if (retryOnExhaust) {
    console.warn('[ai] All Groq keys rate-limited — short 8s cooldown then final retry')
    await sleep(8000)
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
    // 413 = request payload too large. Shrink until Groq accepts the request;
    // retrying the same payload only repeats the failure.
    if (res.status === 413) {
      console.warn(`[ai] Groq stream 413 on key …${key.slice(-6)} — payload too large, shrinking and retrying`)
      for (const ratio of [0.45, 0.28, 0.16, 0.09, 0.05]) {
        const truncated = messages.map(m => ({
          ...m,
          content: typeof m.content === 'string'
            ? m.content.slice(0, Math.max(600, Math.floor(m.content.length * ratio)))
            : m.content,
        }))
        const retryRes = await fetch(GROQ_URL, {
          method:  'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            model,
            max_tokens: Math.min(cap, ratio <= 0.16 ? 1536 : 3072),
            stream:     true,
            messages:   [{ role: 'system', content: system.slice(0, Math.max(1000, Math.floor(system.length * ratio))) }, ...truncated],
          }),
        })
        if (retryRes.status === 413) {
          console.warn(`[ai] Groq stream 413 retry still too large at ratio ${ratio}`)
          continue
        }
        if (!retryRes.ok) {
          console.warn(`[ai] Groq stream 413 retry failed (${retryRes.status}) — trying next key`)
          break
        }
        const retryReader = retryRes.body!.getReader()
        const retryDec    = new TextDecoder()
        while (true) {
          const { done, value } = await retryReader.read()
          if (done) break
          for (const line of retryDec.decode(value).split('\n')) {
            if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
            try {
              const delta = JSON.parse(line.slice(6))?.choices?.[0]?.delta?.content
              if (delta) yield delta
            } catch { /* partial chunk */ }
          }
        }
        return
      }
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
  if (anthropicKey && !shouldSkipProvider('anthropic')) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey })
      const res    = await client.messages.create({
        model: anthropicModel, max_tokens: maxTokens, system, messages,
      })
      const usedTokens = res.usage.input_tokens + res.usage.output_tokens
      recordProviderRequest('anthropic', usedTokens)
      const text = (res.content[0] as { text: string }).text
      return { text, provider: 'anthropic', model: anthropicModel, tokens: usedTokens }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const cls = classifyError(msg)
      if (cls === 'TOKEN_QUOTA_EXCEEDED') throw Object.assign(err instanceof Error ? err : new Error(msg), { code: 'TOKEN_QUOTA_EXCEEDED' })
      if (cls === 'QUOTA_EXHAUSTED') recordProviderRateLimit('anthropic')
      if (!isAnthropicFallback(msg)) throw err
      lastProviderError = msg
      console.warn('[ai] Anthropic → Gemini fallback:', msg.slice(0, 100))
    }
  } else if (anthropicKey && shouldSkipProvider('anthropic')) {
    console.info('[ai] Anthropic pre-emptively skipped (near quota limit) — routing to Gemini')
  }

  // 2️⃣ Gemini (up to 51 keys with cooldown-aware rotation)
  if (getGeminiKeys().length > 0 && !shouldSkipProvider('gemini')) {
    try {
      const { text, model: gModel } = await geminiComplete(system, messages, maxTokens, fastMode)
      recordProviderRequest('gemini', Math.ceil(text.length / 4))
      return { text, provider: 'gemini', model: gModel }
    } catch (err) {
      const e = err as { status?: number; message?: string }
      const shouldFallback = isGeminiFallback(e.message ?? '', e.status)
      if (e.status === 429) recordProviderRateLimit('gemini')
      if (!shouldFallback) throw err
      lastProviderError = e.message ?? lastProviderError
      console.warn('[ai] Gemini → Groq fallback:', String(e.message).slice(0, 100))
    }
  } else if (getGeminiKeys().length > 0 && shouldSkipProvider('gemini')) {
    console.info('[ai] Gemini pre-emptively skipped (near quota limit) — routing to Groq')
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
    recordProviderRequest('groq', Math.ceil(text.length / 4))
    return { text, provider: 'groq', model: groqModel }
  } catch {
    const { text } = await groqComplete(AI_MODELS.fallbackFast, Math.min(groqCap, 4096), system, messages)
    recordProviderRequest('groq', Math.ceil(text.length / 4))
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
  if (anthropicKey && !shouldSkipProvider('anthropic')) {
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
        const cls = classifyError(msg)
        if (cls === 'TOKEN_QUOTA_EXCEEDED') throw Object.assign(err instanceof Error ? err : new Error(msg), { code: 'TOKEN_QUOTA_EXCEEDED' })
        if (cls === 'QUOTA_EXHAUSTED') recordProviderRateLimit('anthropic')
        if (!isAnthropicFallback(msg)) throw err
        lastProviderError = msg
        errored = true
        console.warn('[ai] Anthropic stream → Gemini fallback:', msg.slice(0, 100))
      }
      if (!errored) return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const cls = classifyError(msg)
      if (cls === 'TOKEN_QUOTA_EXCEEDED') throw Object.assign(err instanceof Error ? err : new Error(msg), { code: 'TOKEN_QUOTA_EXCEEDED' })
      if (cls === 'QUOTA_EXHAUSTED') recordProviderRateLimit('anthropic')
      if (!isAnthropicFallback(msg)) throw err
      lastProviderError = msg
      console.warn('[ai] Anthropic outer catch → fallback:', msg.slice(0, 100))
    }
  }

  // 2️⃣ Gemini streaming (up to 51 keys with cooldown-aware rotation)
  if (anthropicKey && shouldSkipProvider('anthropic')) {
    console.info('[ai] Anthropic stream pre-emptively skipped (near quota limit) - routing to Gemini')
  }

  if (getGeminiKeys().length > 0 && !shouldSkipProvider('gemini')) {
    try {
      yield* geminiStream(system, messages, maxTokens, fastMode)
      recordProviderRequest('gemini', maxTokens)
      return
    } catch (err) {
      const e = err as { status?: number; message?: string }
      const shouldFallback = isGeminiFallback(e.message ?? '', e.status)
      if (e.status === 429) recordProviderRateLimit('gemini')
      if (!shouldFallback) throw err
      lastProviderError = e.message ?? lastProviderError
      console.warn('[ai] Gemini stream → Groq fallback:', String(e.message).slice(0, 100))
    }
  } else if (getGeminiKeys().length > 0 && shouldSkipProvider('gemini')) {
    console.info('[ai] Gemini stream pre-emptively skipped (near quota limit) - routing to Groq')
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
