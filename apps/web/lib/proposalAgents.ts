/**
 * Proposal AI Agents — SME-5 §5.11 / SME-4 §4.11B
 *
 * 5 agents wired to Groq (speed) with Claude Sonnet fallback (accuracy):
 *   intakeAgent        — structured rfp_record extraction
 *   bidDecisionAgent   — go/no-go fit scoring + rationale
 *   draftingAgent      — grounded section generation
 *   pricingAgent       — effort-based line-item pricing
 *   reviewAgent        — quality gate (score ≥ 7.0 to pass)
 *
 * All agents: consent-gated, no PII in prompts beyond what the agent needs,
 * no internal margin data emitted, hallucination risk flagged.
 */

import { aiComplete } from './ai'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RfpRecord {
  title:        string
  clientName:   string
  deadline:     string | null   // ISO date string or null
  budgetInr:    number | null
  scopeSummary: string
  requirements: string[]
  contactEmail: string | null
}

export interface BidDecisionResult {
  decision:          'bid' | 'no_bid'
  bidFitScore:       number    // 0–100
  winProbabilityPct: number    // 0–100
  rationale:         string[]  // exactly 3 bullet points
  noBidReason:       string | null
}

export interface DraftingResult {
  sectionText:          string
  sourceReferences:     string[]
  hallucinationRiskFlags: string[]
}

export interface PricingResult {
  lineItems: Array<{
    item:       string
    qty:        number
    rateInr:    number
    rateSource: string
  }>
  totalInr:    number
  floorMet:    boolean
}

export interface ReviewResult {
  qualityScore: number     // 0–10
  passed:       boolean    // score ≥ 7.0
  issues: Array<{
    section:  string
    severity: 'high' | 'medium' | 'low'
    note:     string
  }>
  summaryVerdict: string
}

// ── Shared helper ─────────────────────────────────────────────────────────────

async function callAI(system: string, user: string, maxTokens = 1500): Promise<string> {
  const result = await aiComplete({
    system,
    messages:  [{ role: 'user', content: user }],
    maxTokens,
    fastMode:  true,
  })
  return result.text.trim()
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    // strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '')
    return JSON.parse(cleaned) as T
  } catch {
    return fallback
  }
}

// ── AGENT 1: intakeAgent ──────────────────────────────────────────────────────
// SME-3 §3.8 — Structured extraction from raw RFP text
// Output is rfp_record used downstream by all agents

export async function intakeAgent(rfpText: string): Promise<RfpRecord> {
  const system = `You are an RFP intake specialist. Extract structured fields from the provided RFP text.
Return ONLY valid JSON matching this schema:
{
  "title": string,
  "clientName": string,
  "deadline": "YYYY-MM-DD" or null,
  "budgetInr": number or null,
  "scopeSummary": string (max 3 sentences),
  "requirements": string[] (top 5 bullet points),
  "contactEmail": string or null
}
Never invent data not present in the RFP. Use null for missing fields.`

  const user = `Extract structured fields from this RFP:\n\n${rfpText.slice(0, 6000)}`
  const raw  = await callAI(system, user, 800)

  return parseJson<RfpRecord>(raw, {
    title:        'Untitled RFP',
    clientName:   'Unknown',
    deadline:     null,
    budgetInr:    null,
    scopeSummary: rfpText.slice(0, 300),
    requirements: [],
    contactEmail: null,
  })
}

// ── AGENT 2: bidDecisionAgent ─────────────────────────────────────────────────
// SME-9 §9.3 — Go/no-go with fit score, win probability, rationale
// GDSL: no_bid_reason_required — noBidReason must be ≥10 chars when decision=no_bid

export async function bidDecisionAgent(
  rfpRecord: RfpRecord,
  companyCapabilities: string = 'Full-stack product engineering, AI/ML integration, cloud-native architecture, SaaS platform development',
  historicalWinRate?: number | null,  // P13 FIX: fed from WinLossEvent aggregate
): Promise<BidDecisionResult> {
  const system = `You are a bid/no-bid decision specialist at a technology consulting firm.
Evaluate the RFP against company capabilities. Return ONLY valid JSON:
{
  "decision": "bid" | "no_bid",
  "bidFitScore": 0-100,
  "winProbabilityPct": 0-100,
  "rationale": ["point1", "point2", "point3"],
  "noBidReason": string (min 10 chars) or null
}
Set noBidReason to null if decision is "bid".
Scoring guide: 80+ = strong fit; 60-79 = viable; 40-59 = stretch; <40 = no_bid.`

  const user = `
RFP Summary:
- Title: ${rfpRecord.title}
- Client: ${rfpRecord.clientName}
- Deadline: ${rfpRecord.deadline ?? 'not specified'}
- Budget: ${rfpRecord.budgetInr ? `₹${rfpRecord.budgetInr.toLocaleString('en-IN')}` : 'not specified'}
- Scope: ${rfpRecord.scopeSummary}
- Requirements: ${rfpRecord.requirements.slice(0, 5).join('; ')}

Our capabilities: ${companyCapabilities}
${historicalWinRate != null ? `Historical win rate (last 90d): ${historicalWinRate}% — factor this into confidence calibration.` : ''}

Provide bid/no-bid decision with fit score and 3-point rationale.`

  const raw = await callAI(system, user, 600)

  return parseJson<BidDecisionResult>(raw, {
    decision:          'no_bid',
    bidFitScore:       0,
    winProbabilityPct: 0,
    rationale:         ['Unable to assess fit', 'Insufficient RFP data', 'Manual review required'],
    noBidReason:       'Automated analysis failed — requires manual review',
  })
}

// ── AGENT 3: draftingAgent ────────────────────────────────────────────────────
// SME-5 §5.11 — Grounded section generation with hallucination risk flags
// GDSL: margin_leak_guard — no internal cost/margin data in output
//       groundedness_credential — credential claims must reference team registry

export async function draftingAgent(
  rfpRecord:  RfpRecord,
  sectionKey: 'executive_summary' | 'technical_approach' | 'team_credentials' | 'timeline' | 'commercials',
  scopeContext: string = '',
): Promise<DraftingResult> {
  const sectionInstructions: Record<string, string> = {
    executive_summary:  'Write a compelling 2-paragraph executive summary. Lead with client value, not our capabilities.',
    technical_approach: 'Write a structured technical approach with: solution architecture, tech stack rationale, key risks and mitigations.',
    team_credentials:   'Write team credentials section. Only mention AWS certified, Google certified, and Scrum Master certifications (verified). Do NOT invent other certifications.',
    timeline:           'Write a phased delivery timeline with milestones. Be conservative — pad estimates by 20%.',
    commercials:        'Write a commercials section with payment terms and SLA. Do NOT include any margin percentages, markup figures, or internal cost data.',
  }

  const system = `You are a senior proposal writer at a technology firm. Generate a specific proposal section.
CRITICAL RULES:
1. Never include internal margin %, markup, or cost-to-us figures
2. Only claim these certifications as verified: AWS certified, Google certified, Scrum Master
3. Flag any claim you're less than 80% confident about as a hallucination risk
4. Return ONLY valid JSON:
{
  "sectionText": "the section content in markdown",
  "sourceReferences": ["ref1", "ref2"],
  "hallucinationRiskFlags": ["flag1 if any"]
}`

  const user = `
Client: ${rfpRecord.clientName}
Scope: ${rfpRecord.scopeSummary}
${scopeContext ? `Additional context: ${scopeContext}` : ''}

Section to write: ${sectionKey}
Instructions: ${sectionInstructions[sectionKey]}

Generate the section content.`

  const raw = await callAI(system, user, 1200)

  return parseJson<DraftingResult>(raw, {
    sectionText:           `## ${sectionKey.replace(/_/g, ' ').toUpperCase()}\n\n[Draft generation failed — manual authoring required]`,
    sourceReferences:      [],
    hallucinationRiskFlags: ['Draft generation failed — full manual review required'],
  })
}

// ── AGENT 4: pricingAgent ─────────────────────────────────────────────────────
// SME-9 §9.3 — Effort-based line-item pricing, floor enforcement
// GDSL: pricing_floor_gate — total must be ≥ PRICING_FLOOR_INR (₹50K)
// CRITICAL: never expose internal rates or margins in output

export async function pricingAgent(
  scopeSummary:    string,
  effortDays:      number,
  seniorityMix:    '60:40' | '50:50' | '40:60' = '50:50', // senior:junior
): Promise<PricingResult> {
  // ₹25K/day blended (SME-9 approved rate band: ₹20K–₹35K/day)
  const BLENDED_RATE_PER_DAY = 25_000
  const PRICING_FLOOR_INR    = 50_000

  const system = `You are a pricing specialist. Generate a line-item pricing breakdown for a technology project.
Use approved day-rate of ₹25,000/day blended. DO NOT invent other rates.
Return ONLY valid JSON:
{
  "lineItems": [
    { "item": "string", "qty": number, "rateInr": number, "rateSource": "approved-rate-card" }
  ],
  "totalInr": number,
  "floorMet": boolean
}
Minimum total must be ₹50,000. Flag floorMet:true only if total >= 50000.`

  const user = `
Scope: ${scopeSummary}
Effort: ${effortDays} person-days
Seniority mix: ${seniorityMix} (senior:junior)
Blended rate: ₹25,000/day

Break down into logical line items (Discovery, Design, Development, Testing, PM, etc.).`

  const raw = await callAI(system, user, 600)

  const result = parseJson<PricingResult>(raw, {
    lineItems: [{ item: 'Engineering effort', qty: effortDays, rateInr: BLENDED_RATE_PER_DAY, rateSource: 'approved-rate-card' }],
    totalInr:  effortDays * BLENDED_RATE_PER_DAY,
    floorMet:  effortDays * BLENDED_RATE_PER_DAY >= PRICING_FLOOR_INR,
  })

  // Enforce floor even if agent returns lower value
  result.floorMet  = result.totalInr >= PRICING_FLOOR_INR
  return result
}

// ── AGENT 5: reviewAgent ──────────────────────────────────────────────────────
// SME-4 §4.11B — Quality gate; passes only if score ≥ 7.0
// GDSL: revision_depth_halt — caller enforces max depth 3

export async function reviewAgent(proposalDraft: string): Promise<ReviewResult> {
  const system = `You are a senior proposal reviewer. Evaluate the proposal draft for quality.
Score from 0–10. A score ≥ 7.0 means the proposal passes for client delivery.
Evaluate: clarity, completeness, credibility, commercial soundness, compliance.
Return ONLY valid JSON:
{
  "qualityScore": 0.0-10.0,
  "passed": boolean,
  "issues": [
    { "section": "string", "severity": "high"|"medium"|"low", "note": "string" }
  ],
  "summaryVerdict": "one sentence verdict"
}`

  const user = `Review this proposal draft for quality:\n\n${proposalDraft.slice(0, 5000)}`
  const raw  = await callAI(system, user, 800)

  const result = parseJson<ReviewResult>(raw, {
    qualityScore:   0,
    passed:         false,
    issues:         [{ section: 'all', severity: 'high', note: 'Review agent failed — manual review required' }],
    summaryVerdict: 'Automated review failed — escalate to human reviewer',
  })

  // Enforce passed = score >= 7.0 regardless of agent output
  result.passed = result.qualityScore >= 7.0
  return result
}
