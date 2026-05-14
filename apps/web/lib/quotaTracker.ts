/**
 * Aggregate Provider Quota Tracker — Hermes rate_limit_tracker.py adaptation.
 *
 * Tracks per-provider aggregate request counts and estimated token consumption
 * within rolling time windows. When a provider's window fills to 80% capacity,
 * it is pre-emptively marked as NEAR_EXHAUSTED so the caller can route to the
 * next provider without waiting for a 429 response.
 *
 * This complements lib/ai.ts's per-key cooldowns:
 *   - Per-key cooldowns: individual key is 429'd → skip that key for 30-62s
 *   - Aggregate tracker:  all keys for a provider are near quota → skip provider
 *
 * Design:
 *   - Module-level Maps: state persists across requests in the same server process
 *   - No Redis required: in-memory is fine for single-instance deployments
 *   - Thread-safe reads: no concurrent mutation risk in Node.js single-threaded event loop
 *   - Window-based: counters reset after WINDOW_MS (60s)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Provider = 'anthropic' | 'gemini' | 'groq'
export type ProviderStatus = 'AVAILABLE' | 'NEAR_EXHAUSTED' | 'EXHAUSTED'

interface ProviderWindow {
  requests:       number
  tokens:         number
  windowStart:    number
}

// ─── Limits (conservative estimates based on free/standard tier defaults) ─────

const WINDOW_MS = 60_000  // 1-minute rolling window

const PROVIDER_LIMITS: Record<Provider, { requestsPerMin: number; tokensPerMin: number }> = {
  anthropic: { requestsPerMin: 50,  tokensPerMin: 40_000  },  // Sonnet tier-1
  gemini:    { requestsPerMin: 60,  tokensPerMin: 32_000  },  // Flash free tier (per key; aggregate lower)
  groq:      { requestsPerMin: 30,  tokensPerMin: 14_400  },  // llama-3.3-70b free tier
}

/** Pre-emptive routing threshold: skip provider at this fraction of limit */
const NEAR_EXHAUSTED_THRESHOLD = 0.80

// ─── State ────────────────────────────────────────────────────────────────────

const providerWindows = new Map<Provider, ProviderWindow>()

function getWindow(provider: Provider): ProviderWindow {
  const now = Date.now()
  const existing = providerWindows.get(provider)

  // Reset if window expired
  if (!existing || now - existing.windowStart > WINDOW_MS) {
    const fresh: ProviderWindow = { requests: 0, tokens: 0, windowStart: now }
    providerWindows.set(provider, fresh)
    return fresh
  }
  return existing
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a completed request to a provider.
 * Call this after a successful AI response.
 */
export function recordProviderRequest(provider: Provider, tokensUsed: number): void {
  const window = getWindow(provider)
  window.requests += 1
  window.tokens   += tokensUsed
}

/**
 * Record a 429 response from a provider.
 * Bumps the request counter to the exhaustion threshold immediately.
 */
export function recordProviderRateLimit(provider: Provider): void {
  const window  = getWindow(provider)
  const limits  = PROVIDER_LIMITS[provider]
  // Mark as fully exhausted by setting counters to limit
  window.requests = limits.requestsPerMin
  window.tokens   = limits.tokensPerMin
}

/**
 * Get the current status of a provider.
 * Returns EXHAUSTED / NEAR_EXHAUSTED / AVAILABLE.
 */
export function getProviderStatus(provider: Provider): ProviderStatus {
  const window = getWindow(provider)
  const limits = PROVIDER_LIMITS[provider]

  const requestRatio = window.requests / limits.requestsPerMin
  const tokenRatio   = window.tokens   / limits.tokensPerMin
  const maxRatio     = Math.max(requestRatio, tokenRatio)

  if (maxRatio >= 1.0)                   return 'EXHAUSTED'
  if (maxRatio >= NEAR_EXHAUSTED_THRESHOLD) return 'NEAR_EXHAUSTED'
  return 'AVAILABLE'
}

/**
 * Returns true if a provider should be skipped before attempting a request.
 * Pre-emptive routing: avoid 429s by checking quota state first.
 */
export function shouldSkipProvider(provider: Provider): boolean {
  const status = getProviderStatus(provider)
  return status === 'EXHAUSTED' || status === 'NEAR_EXHAUSTED'
}

/**
 * Return a summary of all provider statuses for logging/debugging.
 */
export function getProviderSummary(): Record<Provider, { status: ProviderStatus; requests: number; tokens: number; requestsRemaining: number; tokensRemaining: number }> {
  const providers: Provider[] = ['anthropic', 'gemini', 'groq']
  return Object.fromEntries(
    providers.map(p => {
      const window = getWindow(p)
      const limits = PROVIDER_LIMITS[p]
      return [p, {
        status:            getProviderStatus(p),
        requests:          window.requests,
        tokens:            window.tokens,
        requestsRemaining: Math.max(0, limits.requestsPerMin - window.requests),
        tokensRemaining:   Math.max(0, limits.tokensPerMin   - window.tokens),
      }]
    }),
  ) as Record<Provider, { status: ProviderStatus; requests: number; tokens: number; requestsRemaining: number; tokensRemaining: number }>
}

/**
 * Reset a specific provider's window (e.g., after adding more API keys).
 */
export function resetProviderWindow(provider: Provider): void {
  providerWindows.delete(provider)
}

/**
 * Reset all provider windows. Use at the start of a new pipeline cycle
 * to ensure quota from the previous cycle doesn't bleed into this one.
 */
export function resetAllProviderWindows(): void {
  providerWindows.clear()
}
