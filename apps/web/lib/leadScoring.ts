/**
 * leadScoring.ts — AI-powered ICP scoring for captured leads.
 *
 * Scoring chain:
 *   1. GPT-4o-mini prompt (hot/warm/cold + rationale) — costs ~$0.0002/lead
 *   2. Heuristic fallback if OpenAI unavailable
 *
 * Platform multipliers applied AFTER LLM score:
 *   upwork +10, linkedin +8, instagram/whatsapp 0, direct -5
 *
 * Thresholds are configurable via env vars (default: hot=75, nurture=45, watch=20)
 */

export const DAILY_SCORING_BUDGET_USD = 2.00

export interface ScoreRationaleItem {
  dimension:  string
  score:      number
  reason:     string
  direction?: 'positive' | 'negative' | 'neutral'
  factor?:    string
  weight:     number
}

export interface IcpScoreResult {
  score:      number        // 0–100
  confidence: number        // 0–1
  rationale:  ScoreRationaleItem[]
  costUsd:    number
  method?:    string
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
  platform?:    string | null    // instagram|whatsapp|upwork|linkedin|direct
  messageText?: string | null    // raw enquiry message for AI classification
  firmographic?: unknown
}

/** ICP definition — configurable via env vars. */
export const ICP = {
  segments:    ['agency', 'saas', 'ecommerce', 'consulting'],
  minRevenue:  50_000,
  targetRoles: ['founder', 'cto', 'ceo', 'head of product', 'vp engineering'],
  hotScore:    parseInt(process.env.ICP_HOT_SCORE    ?? '75', 10),
  nurtureScore: parseInt(process.env.ICP_NURTURE_SCORE ?? '45', 10),
  watchScore:  parseInt(process.env.ICP_WATCH_SCORE  ?? '20', 10),
}

/** Platform bonus scores applied after LLM scoring. */
const PLATFORM_BONUS: Record<string, number> = {
  upwork:    10,
  linkedin:   8,
  instagram:  0,
  whatsapp:   0,
  direct:    -5,
}

/** Free-email domains — lower base score but don't auto-disqualify. */
const FREE_EMAIL_RE = /gmail|yahoo|hotmail|outlook|proton|icloud|rediffmail/i

/** Guard against runaway daily scoring spend. Throws if budget exceeded. */
export async function checkScoringBudget(): Promise<void> {
  // Stub: no-op — implement with DB cost ledger when ready
}

// ── GPT-4o-mini scoring ───────────────────────────────────────────────────────
async function openaiScore(input: LeadInput): Promise<IcpScoreResult | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const domain      = input.email.split('@')[1] ?? ''
  const isFreeEmail = FREE_EMAIL_RE.test(domain)
  const firmo       = input.firmographic as Record<string, unknown> | null | undefined

  const systemPrompt = `You are a lead scoring expert for NEXUS OS, a B2B AI automation platform serving agencies, SaaS founders, and tech-savvy operators.

ICP (Ideal Customer Profile):
- Roles: founder, CTO, CEO, Head of Product, VP Engineering, agency owner
- Company: 10–500 employees, SaaS / agency / ecomm / consulting
- Budget signals: business email domain, specific tech questions, mentions of team/project/deadline
- Warm signals: references a use-case, asks about pricing, mentions a competitor
- Cold signals: vague message, free email with no context, student language

Score from 0–100:
- 80–100: hot — clear ICP fit, immediate buy intent
- 55–79: warm — likely ICP, nurture with value content
- 30–54: watch — possible fit, low intent
- 0–29: cold — poor fit or spam

Respond with ONLY valid JSON, no markdown:
{"score": <number>, "confidence": <0.0-1.0>, "classification": "hot|warm|watch|cold", "rationale": [{"factor": "string", "direction": "positive|negative|neutral", "reason": "string"}]}`

  const userContent = [
    `Email: ${input.email}`,
    `Name: ${input.name ?? 'unknown'}`,
    `Company: ${input.company ?? 'unknown'}`,
    `Role: ${input.role ?? 'unknown'}`,
    `Source/Platform: ${input.platform ?? input.utmSource ?? input.source ?? 'direct'}`,
    `Free email domain: ${isFreeEmail}`,
    `Company size (enriched): ${firmo?.companySize ?? 'unknown'}`,
    `Industry (enriched): ${firmo?.industry ?? 'unknown'}`,
    `Location (enriched): ${firmo?.location ?? 'unknown'}`,
    input.messageText ? `Enquiry message: "${input.messageText.slice(0, 500)}"` : '',
  ].filter(Boolean).join('\n')

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        messages:    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
        temperature: 0.1,
        max_tokens:  500,
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return null
    const data = await res.json() as {
      choices: { message: { content: string } }[]
      usage?: { prompt_tokens: number; completion_tokens: number }
    }

    const raw  = data.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(raw) as {
      score: number
      confidence: number
      rationale: { factor: string; direction: 'positive' | 'negative' | 'neutral'; reason: string }[]
    }

    // Apply platform bonus BEFORE clamping
    const platformBonus = PLATFORM_BONUS[input.platform?.toLowerCase() ?? ''] ?? 0
    const rawScore      = Math.min(100, Math.max(0, (parsed.score ?? 50) + platformBonus))

    // Cost: gpt-4o-mini $0.00015/1K input + $0.0006/1K output
    const inTokens  = data.usage?.prompt_tokens     ?? 250
    const outTokens = data.usage?.completion_tokens ?? 100
    const costUsd   = (inTokens / 1000) * 0.00015 + (outTokens / 1000) * 0.0006

    const rationale: ScoreRationaleItem[] = (parsed.rationale ?? []).map(r => ({
      dimension: r.factor,
      score:     rawScore,
      reason:    r.reason,
      direction: r.direction,
      factor:    r.factor,
      weight:    1 / Math.max(1, parsed.rationale.length),
    }))

    if (platformBonus !== 0) {
      rationale.push({
        dimension: 'platform_bonus',
        score:     platformBonus,
        reason:    `Platform "${input.platform}" ${platformBonus > 0 ? 'adds' : 'removes'} ${Math.abs(platformBonus)} points`,
        direction: platformBonus > 0 ? 'positive' : 'negative',
        factor:    'Platform',
        weight:    0,
      })
    }

    return {
      score:      rawScore,
      confidence: parsed.confidence ?? 0.8,
      rationale,
      costUsd,
      method:     'gpt-4o-mini',
    }
  } catch {
    return null
  }
}

// ── Heuristic fallback ────────────────────────────────────────────────────────
function heuristicScore(input: LeadInput): IcpScoreResult {
  const domain      = input.email.split('@')[1] ?? ''
  const isFreeEmail = FREE_EMAIL_RE.test(domain)
  const firmo       = input.firmographic as Record<string, unknown> | null | undefined
  const platform    = input.platform?.toLowerCase() ?? ''

  let score = isFreeEmail ? 30 : 55

  // Role boost
  const role = (input.role ?? '').toLowerCase()
  if (ICP.targetRoles.some(r => role.includes(r))) score += 15

  // Company size boost
  const size = (firmo?.companySize as number | null) ?? null
  if (size && size >= 10 && size <= 500) score += 10

  // Industry boost
  const industry = ((firmo?.industry as string | null) ?? '').toLowerCase()
  if (ICP.segments.some(s => industry.includes(s))) score += 10

  // UTM source boost
  if (input.utmSource) score += 5

  // Platform bonus
  score += PLATFORM_BONUS[platform] ?? 0

  // Message signal
  if (input.messageText) {
    const msg = input.messageText.toLowerCase()
    if (/budget|price|cost|how much/.test(msg)) score += 10
    if (/timeline|deadline|urgent|asap/.test(msg))  score += 8
    if (/team|company|project/.test(msg))           score += 5
    if (/student|learning|practice|hobby/.test(msg)) score -= 15
  }

  score = Math.min(100, Math.max(0, score))

  const rationale: ScoreRationaleItem[] = [
    { dimension: 'email_domain', score: isFreeEmail ? 10 : 40, reason: isFreeEmail ? 'Free email provider' : 'Business domain', direction: isFreeEmail ? 'negative' : 'positive', factor: 'Email domain', weight: 0.4 },
    { dimension: 'utm_source',   score: input.utmSource ? 20 : 10, reason: input.utmSource ? `Attributed: ${input.utmSource}` : 'Direct / unknown', direction: input.utmSource ? 'positive' : 'neutral', factor: 'Attribution', weight: 0.2 },
    { dimension: 'platform',     score: PLATFORM_BONUS[platform] ?? 0, reason: `Platform: ${platform || 'unknown'}`, direction: (PLATFORM_BONUS[platform] ?? 0) >= 0 ? 'positive' : 'negative', factor: 'Platform', weight: 0.2 },
    { dimension: 'firmographic', score: size ? 30 : 10, reason: size ? `${size} employees, ${firmo?.industry ?? 'unknown'} industry` : 'No firmographic data', direction: size ? 'positive' : 'neutral', factor: 'Company data', weight: 0.2 },
  ]

  return { score, confidence: 0.5, rationale, costUsd: 0, method: 'heuristic' }
}

/** Score a lead against the ICP. Tries GPT-4o-mini first, falls back to heuristics. */
export async function llmScore(input: LeadInput): Promise<IcpScoreResult> {
  try {
    await checkScoringBudget()
  } catch {
    return heuristicScore(input)
  }

  const ai = await openaiScore(input)
  if (ai) return ai

  return heuristicScore(input)
}

/** Route a scored lead to the appropriate pipeline stage. */
export function routeLead(score: number): RoutingResult {
  if (score >= ICP.hotScore)     return { decision: 'hot_queue', assignedRep: null }
  if (score >= ICP.nurtureScore) return { decision: 'nurture',   assignedRep: null }
  if (score >= ICP.watchScore)   return { decision: 'watch',     assignedRep: null }
  return { decision: 'disqualified', assignedRep: null }
}
