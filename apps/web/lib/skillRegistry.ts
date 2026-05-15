// ─── ACORA Skill Registry ─────────────────────────────────────────────────────
// Autonomous Capability-Oriented Runtime Architecture — Phase 1-9 type contracts
// Applied to the NEXUS OS One Click Pipeline (FORGE + BUILD agents)
// See apps/web/lib/skills/INDEX.md for human-readable documentation.

// ─── Phase 2: Canonical skill taxonomy (9 types) ──────────────────────────────
export type SkillType =
  | 'orchestrator'  // coordinates other skills, sets session context
  | 'planner'       // produces structured work breakdown / task sequences
  | 'transformer'   // converts input from one format to another
  | 'executor'      // generates primary artifacts (code, content, files)
  | 'validator'     // asserts quality gates; read-only; emits score + pass/fail
  | 'retriever'     // fetches or synthesises reference knowledge
  | 'observer'      // monitors outputs from multiple upstream agents
  | 'router'        // decides which downstream path to activate
  | 'memory'        // persists and retrieves cross-session state

// ─── Phase 8: Execution algebra primitives ────────────────────────────────────
export type ExecutionMode =
  | 'sequential'  // must run after all dependencies complete
  | 'parallel'    // can run concurrently with agents sharing the same parallelGroup

// ─── Phase 9: Trust fabric ────────────────────────────────────────────────────
export type TrustLevel =
  | 'isolated'    // output is validated before being injected into other prompts
  | 'trusted'     // output can be used as context for peer agents
  | 'privileged'  // output can drive system-level configuration and phase routing

// ─── Phase 5: Failure semantics ───────────────────────────────────────────────
export type FailureBehavior =
  | 'fallback'    // inject degraded output via createForgeFallbackOutput(), continue
  | 'skip'        // omit output, allow pipeline to continue without it
  | 'abort'       // stop the pipeline immediately (used for structural validators)
  | 'degrade'     // use partial/empty output, log warning, continue

// ─── Phase 3: Core skill metadata ─────────────────────────────────────────────
// Embedded on every ForgeAgent and BuildAgent record.
export interface SkillMeta {
  skillType:       SkillType
  executionMode:   ExecutionMode
  /** null = sequential. Same integer = agents run together via Promise.all */
  parallelGroup:   number | null
  /** Topological position within the phase. Lower = runs first. */
  executionOrder:  number
  /** Max context tokens this agent receives (replaces the old AGENT_CTX_CAPS Record) */
  tokenBudget:     number
  /** Phase 5 — hard per-agent deadline in ms. 0 = no timeout. */
  timeoutMs:       number
  /** Phase 9 — trust level governing how output is used by downstream agents */
  trustLevel:      TrustLevel
  /** Phase 5 — what to do when all retry attempts are exhausted */
  failureBehavior: FailureBehavior
  /** Phase 6 — alert (log warn) if a single agent's estimated cost exceeds this */
  costCeilingUsd:  number
  /** Phase 1 — agent IDs whose output must be available before this agent starts */
  dependencies:    string[]
  retryPolicy: {
    maxAttempts: number
    /** Base backoff in ms. Actual delay = backoffMs * 2^attempt */
    backoffMs:   number
  }
}

// ─── Phase 5: Circuit breaker state ───────────────────────────────────────────
// One entry per agent. Reset (clear the Map) at the start of each pipeline run.
export interface CircuitBreaker {
  agentId:      string
  failureCount: number
  openedAt:     number | null  // Date.now() when breaker opened
  state:        'closed' | 'open' | 'half-open'
}

/** Open the breaker after this many consecutive permanent failures */
export const CIRCUIT_BREAKER_THRESHOLD = 3

/** After this many ms, allow one probe attempt (half-open state) */
export const CIRCUIT_BREAKER_RESET_MS = 60_000

// ─── Phase 6: Cost attribution ────────────────────────────────────────────────
// Accumulates across the full pipeline run per agent.
export interface AgentCostEntry {
  agentId:      string
  tokens:       number
  estimatedUsd: number
  durationMs:   number
  attempts:     number
}

/**
 * Claude Sonnet blended input/output pricing approximation.
 * $3 per 1M tokens → $0.000003 per token.
 * Update this constant if switching models or pricing tiers.
 */
export const COST_PER_TOKEN_USD = 0.000003
