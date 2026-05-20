/**
 * leadScoring.ts — AI-powered ICP scoring for captured leads.
 * Stubs are safe fallbacks; replace with full implementation when scoring budget is allocated.
 */

export const DAILY_SCORING_BUDGET_USD = 2.00

export interface ScoreRationaleItem {
  dimension: string
  score:     number
  reason:    string
}

export interface IcpScoreResult {
  score:      number        // 0–100
  confidence: number        // 0–1
  rationale:  ScoreRationaleItem[]
  costUsd:    number
}

export interface RoutingResult {
  decision:    'hot_queue' | 'nurture' | 'disqualified' | 'watch'
  assignedRep: string | null
}

export interface LeadInput {
  email:        string
  name:         string | null
  company?:     string | null
  role?:        string | null
  source:       string | null
  utmSource:    string | null
  firmographic?: unknown
}

/** ICP definition — tune per-segment. */
export const ICP = {
  segments:    ['agency', 'saas', 'ecommerce', 'consulting'],
  minRevenue:  50_000,
  targetRoles: ['founder', 'cto', 'ceo', 'head of product', 'vp engineering'],
  hotScore:    75,   // icpScore threshold for hot_queue routing
  nurtureScore: 45,  // icpScore threshold for nurture routing
}

/** Guard against runaway daily scoring spend. Throws if budget exceeded. */
export async function checkScoringBudget(): Promise<void> {
  // Stub: no-op — implement with DB cost ledger when ready
}

/** Score a lead against the ICP using LLM signals. */
export async function llmScore(input: LeadInput): Promise<IcpScoreResult> {
  // Stub: returns a neutral mid-score so downstream routing still works
  const domain = input.email.split('@')[1] ?? ''
  const isFreeEmail = /gmail|yahoo|hotmail|outlook|proton/i.test(domain)
  const baseScore = isFreeEmail ? 30 : 55

  return {
    score:      baseScore,
    confidence: 0.5,
    rationale:  [
      { dimension: 'email_domain', score: isFreeEmail ? 10 : 40, reason: isFreeEmail ? 'Free email provider' : 'Business domain' },
      { dimension: 'utm_source',   score: input.utmSource ? 20 : 10, reason: input.utmSource ? `Attributed: ${input.utmSource}` : 'Direct / unknown source' },
    ],
    costUsd: 0,
  }
}

/** Route a scored lead to the appropriate pipeline stage. */
export function routeLead(score: number): RoutingResult {
  if (score >= 75) return { decision: 'hot_queue', assignedRep: null }
  if (score >= 45) return { decision: 'nurture',   assignedRep: null }
  if (score >= 20) return { decision: 'watch',     assignedRep: null }
  return { decision: 'disqualified', assignedRep: null }
}
