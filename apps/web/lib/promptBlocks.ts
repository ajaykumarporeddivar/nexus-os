/**
 * Prompt Block Builder — Hermes-inspired modular system prompt assembly.
 *
 * Replaces raw string interpolation with named, independently-overridable slots.
 * Each slot has a default value and can be overridden at call time — enabling
 * vertical-specific ADR injection, model-specific guidance, and A/B testing
 * of individual prompt sections without touching the full system prompt.
 *
 * Slot execution order (matches Hermes prompt_builder.py slot order):
 *   1. identity   — who the agent is and its core mission
 *   2. stack      — technology constraints (Next.js, Tailwind, Prisma, etc.)
 *   3. contract   — output format rules (FILE: path / <<< content >>> contract)
 *   4. design     — visual/UX design tokens and style rules
 *   5. guidance   — mandatory tool use, act-don't-ask, model-specific rules
 *   6. context    — dynamic injections: vertical ADRs, memory output, domain glossary
 *   7. budget     — iteration budget state (injected when budget < 50% remaining)
 *
 * Usage:
 *   const prompt = new PromptBlockBuilder()
 *     .identity('You are NEXUS SCAFFOLD...')
 *     .stack(STACK)
 *     .contract(CONTRACT)
 *     .context('Vertical: HealthTech. ADR: HIPAA compliance required.')
 *     .build()
 */

export interface PromptBlocks {
  identity?:  string
  stack?:     string
  contract?:  string
  design?:    string
  guidance?:  string
  context?:   string
  budget?:    string
}

// ─── Default guidance block (Hermes mandatory-tool-use pattern) ───────────────

export const DEFAULT_GUIDANCE = `
MANDATORY TOOL USE:
• Never assert "file exists" without reading it
• Never assert "TypeScript passes" without running tsc --noEmit
• Never assert "no imports broken" without running grep or glob
• Act, don't ask — when the spec is clear, implement immediately

OUTPUT DISCIPLINE:
• Generate only what the spec requires — no bonus features
• Every file block must use the exact FILE: path / <<< / >>> contract
• Do not truncate any file — output the complete content
`.trim()

// ─── Default budget guidance (injected when budget is low) ───────────────────

export const LOW_BUDGET_GUIDANCE = `
ITERATION BUDGET WARNING: Budget is low. Switch to minimal-implementation mode:
• Satisfy BLOCKING acceptance criteria only
• Skip optional improvements and refactors
• Output the minimum files required for a passing build
`.trim()

// ─── Builder class ────────────────────────────────────────────────────────────

export class PromptBlockBuilder {
  private blocks: PromptBlocks = {}

  identity(text: string):  this { this.blocks.identity  = text; return this }
  stack(text: string):     this { this.blocks.stack      = text; return this }
  contract(text: string):  this { this.blocks.contract   = text; return this }
  design(text: string):    this { this.blocks.design     = text; return this }
  guidance(text: string):  this { this.blocks.guidance   = text; return this }
  context(text: string):   this { this.blocks.context    = text; return this }
  budget(text: string):    this { this.blocks.budget     = text; return this }

  /** Append additional context to the context slot (accumulate vertical ADRs etc.) */
  appendContext(text: string): this {
    this.blocks.context = this.blocks.context
      ? `${this.blocks.context}\n\n${text}`
      : text
    return this
  }

  /** Inject iteration budget state. Adds LOW_BUDGET_GUIDANCE when remaining < half. */
  injectBudget(remaining: number, max: number): this {
    const pct = remaining / max
    if (pct < 0.5) {
      this.blocks.budget = `${LOW_BUDGET_GUIDANCE}\nBudget: ${remaining}/${max} remaining.`
    }
    return this
  }

  build(): string {
    const parts: string[] = []

    if (this.blocks.identity)  parts.push(this.blocks.identity)
    if (this.blocks.stack)     parts.push(this.blocks.stack)
    if (this.blocks.contract)  parts.push(this.blocks.contract)
    if (this.blocks.design)    parts.push(this.blocks.design)
    // Always include guidance — use default if not explicitly set
    parts.push(this.blocks.guidance ?? DEFAULT_GUIDANCE)
    if (this.blocks.context)   parts.push(this.blocks.context)
    if (this.blocks.budget)    parts.push(this.blocks.budget)

    return parts.join('\n\n')
  }

  /** Return the assembled blocks as an object for inspection / testing */
  toObject(): Readonly<PromptBlocks> {
    return { ...this.blocks }
  }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

/**
 * Build a FORGE agent system prompt from named blocks.
 * Equivalent to the previous `${STACK}\n${CONTRACT}\n${agent-specific}` pattern
 * but explicitly structured so individual blocks can be overridden per-call.
 */
export function buildForgePrompt(
  agentIdentity: string,
  stack: string,
  contract: string,
  options?: { design?: string; context?: string; budgetRemaining?: number; budgetMax?: number },
): string {
  const builder = new PromptBlockBuilder()
    .identity(agentIdentity)
    .stack(stack)
    .contract(contract)

  if (options?.design)   builder.design(options.design)
  if (options?.context)  builder.context(options.context)
  if (options?.budgetRemaining !== undefined && options?.budgetMax !== undefined) {
    builder.injectBudget(options.budgetRemaining, options.budgetMax)
  }

  return builder.build()
}

/**
 * Build a BUILD agent system prompt from named blocks.
 */
export function buildBuildPrompt(
  agentIdentity: string,
  stack: string,
  design: string,
  contract: string,
  options?: { context?: string; budgetRemaining?: number; budgetMax?: number },
): string {
  const builder = new PromptBlockBuilder()
    .identity(agentIdentity)
    .stack(stack)
    .design(design)
    .contract(contract)

  if (options?.context) builder.context(options.context)
  if (options?.budgetRemaining !== undefined && options?.budgetMax !== undefined) {
    builder.injectBudget(options.budgetRemaining, options.budgetMax)
  }

  return builder.build()
}
