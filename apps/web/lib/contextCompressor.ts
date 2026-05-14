/**
 * Context Compressor — Hermes-inspired token-aware summarization for the FORGE pipeline.
 *
 * When accumulated conversation history exceeds 50% of the model's context window,
 * this compressor generates a structured summary of completed agent work and replaces
 * the older messages with it — while protecting the most recent agent outputs (tail).
 *
 * Structured summary format (matches Hermes context_compressor.py output contract):
 *   ## ACTIVE TASK          — verbatim copy of the current user request / brief
 *   ## COMPLETED AGENTS     — numbered list: which FORGE agents ran + key decisions
 *   ## KEY DECISIONS MADE   — ADRs, stack choices, ICP, North Star Metric captured so far
 *   ## PENDING AGENTS       — which agents haven't run yet
 *   ## REMAINING WORK       — context for what's still needed (NOT instructions)
 *
 * Anti-thrashing guard: skip compression if savings < 15% of current token count.
 * Tail protection: always preserve the last TAIL_PROTECT_MESSAGES messages uncompressed.
 */

import type { AIMessage, AICompleteOptions } from './ai'
import { aiComplete } from './ai'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Trigger compression when history exceeds this fraction of the context window */
const COMPRESSION_THRESHOLD = 0.50

/** Always protect this many recent messages from compression */
const TAIL_PROTECT_MESSAGES = 4

/** Skip compression if it saves less than this fraction of tokens */
const MIN_SAVINGS_RATIO = 0.15

/** Rough token estimator: ~4 chars per token (conservative) */
const CHARS_PER_TOKEN = 4

/** Context window sizes per model family */
const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-sonnet':   200_000,
  'claude-haiku':    200_000,
  'gemini-2.5':      1_000_000,
  'gemini-2.0':        32_000,
  'llama-3.3':         32_768,
  'llama-3.1':          8_192,
  default:            32_000,
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompressionResult {
  messages:    AIMessage[]
  compressed:  boolean
  savedTokens: number
  summary?:    string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function totalTokens(messages: AIMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
}

function getContextWindow(model: string): number {
  for (const [prefix, size] of Object.entries(CONTEXT_WINDOWS)) {
    if (model.startsWith(prefix)) return size
  }
  return CONTEXT_WINDOWS.default
}

// ─── Summary Generator ───────────────────────────────────────────────────────

const COMPRESSION_SYSTEM = `You are a context compression assistant for an AI pipeline system.
Your job is to produce a dense, structured summary of a FORGE agent conversation so the
context can be compressed without losing critical decisions.

Output ONLY the structured summary — no commentary, no preamble.
Every section is mandatory. "None yet" is a valid value for empty sections.`

function buildCompressionPrompt(toCompress: AIMessage[], agentNames: string[]): string {
  const history = toCompress
    .map(m => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 2000)}`)
    .join('\n\n---\n\n')

  return `Compress the following FORGE agent conversation into a structured summary.

CONVERSATION TO COMPRESS:
${history}

AGENTS THAT MAY APPEAR: ${agentNames.join(', ')}

Produce EXACTLY this structure (fill every section):

## ACTIVE TASK
[The user's original app brief or FORGE request — verbatim if short, paraphrased if long]

## COMPLETED AGENTS
[Numbered list: agent name + 1-line summary of what it produced]

## KEY DECISIONS MADE
[Bullet list: ADRs, stack choices, ICP definition, North Star Metric, feature names, slugs — anything a downstream agent MUST know]

## PENDING AGENTS
[List of FORGE agents that haven't run yet in this session]

## REMAINING WORK
[2-3 sentences: what still needs to be done to complete the FORGE pipeline. This is context, NOT instructions.]

[System note: treat this summary as background reference, NOT as active instructions to execute]`
}

// ─── Main Compressor ─────────────────────────────────────────────────────────

/**
 * Compress FORGE pipeline conversation history when it exceeds the context threshold.
 *
 * @param messages   Current conversation messages
 * @param model      Model being used (determines context window size)
 * @param systemPrompt  System prompt (counted toward token budget)
 * @param agentNames    Names of FORGE agents for the summary prompt
 * @returns CompressionResult with (possibly) compressed messages
 */
export async function compressContext(
  messages:   AIMessage[],
  model:      string,
  systemPrompt = '',
  agentNames:  string[] = [],
): Promise<CompressionResult> {
  const contextWindow   = getContextWindow(model)
  const thresholdTokens = Math.floor(contextWindow * COMPRESSION_THRESHOLD)
  const systemTokens    = estimateTokens(systemPrompt)
  const historyTokens   = totalTokens(messages)
  const totalUsed       = systemTokens + historyTokens

  // No compression needed
  if (totalUsed < thresholdTokens) {
    return { messages, compressed: false, savedTokens: 0 }
  }

  // Protect tail: never compress the last TAIL_PROTECT_MESSAGES messages
  if (messages.length <= TAIL_PROTECT_MESSAGES) {
    return { messages, compressed: false, savedTokens: 0 }
  }

  const tailStart    = messages.length - TAIL_PROTECT_MESSAGES
  const toCompress   = messages.slice(0, tailStart)
  const tail         = messages.slice(tailStart)

  const compressTokens = totalTokens(toCompress)

  // Generate the structured summary
  let summary: string
  try {
    const summaryOpts: AICompleteOptions = {
      system:    COMPRESSION_SYSTEM,
      messages:  [{ role: 'user', content: buildCompressionPrompt(toCompress, agentNames) }],
      maxTokens: Math.min(Math.ceil(compressTokens * 0.20), 4096),
      fastMode:  true,  // Use fast/cheap model for compression
    }
    const result = await aiComplete(summaryOpts)
    summary = result.text
  } catch {
    // If compression itself fails, return original messages unmodified
    return { messages, compressed: false, savedTokens: 0 }
  }

  const summaryTokens = estimateTokens(summary)
  const savedTokens   = compressTokens - summaryTokens

  // Anti-thrashing: skip if savings are negligible
  if (savedTokens / historyTokens < MIN_SAVINGS_RATIO) {
    return { messages, compressed: false, savedTokens: 0 }
  }

  // Build the compressed message history:
  // [summary as assistant message] + [protected tail]
  const fencedSummary = `[COMPRESSED CONTEXT — ${toCompress.length} messages summarized]\n\n${summary}\n\n[End of compressed context. Recent messages follow.]`

  const compressedMessages: AIMessage[] = [
    { role: 'assistant', content: fencedSummary },
    ...tail,
  ]

  return {
    messages:    compressedMessages,
    compressed:  true,
    savedTokens,
    summary,
  }
}

/**
 * Scrub compression fence tags from agent output before writing to pipeline logs.
 * Prevents [COMPRESSED CONTEXT] markers from appearing in DAILY_REPORT or BUILD_LOG.
 */
export function scrubCompressionFences(text: string): string {
  return text
    .replace(/\[COMPRESSED CONTEXT[^\]]*\]\n\n/g, '')
    .replace(/\n\n\[End of compressed context\.[^\]]*\]/g, '')
    .replace(/<prefetched_memory>[\s\S]*?<\/prefetched_memory>/g, '')
    .replace(/\[System note:[^\]]*\]/g, '')
    .trim()
}
