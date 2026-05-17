/**
 * Proposal Governance Engine — SME-11 GDSL rule catalogue
 *
 * 10 compiled rules enforced at runtime across the proposal pipeline:
 *   proposal_pii_gate         BLOCK — PII encrypted before write
 *   nda_access_gate           BLOCK — NDA restricts agent access
 *   groundedness_credential   BLOCK+FLAG — credentials must resolve to team registry
 *   pricing_floor_gate        BLOCK+ALERT — no pricing below approved floor
 *   proposal_mutation_gate    BLOCK — post-approval edits re-trigger approval
 *   margin_leak_guard         BLOCK+AUDIT — internal margin absent from client draft
 *   deadline_dlq_monitor      ALERT+DLQ — no proposal lost near deadline
 *   revision_depth_halt       HALT+ESCALATE — draft-review loop max depth 3
 *   high_value_review_gate    BLOCK — deals >₹10L require second human reviewer
 *   no_bid_reason_required    BLOCK — no-bid must log reason code
 */

// ── Constants (SME-11 / SME-9) ────────────────────────────────────────────────

export const PRICING_FLOOR_INR        = 50_000    // ₹50K minimum engagement
export const HIGH_VALUE_THRESHOLD_INR = 1_000_000 // ₹10L = requires 2nd reviewer
export const REVISION_DEPTH_MAX       = 3
export const DEADLINE_WARNING_HOURS   = 6         // alert when <6h remaining
export const DEADLINE_DLQ_PCT         = 0.5       // alert if >50% of window elapsed in DLQ

export class ProposalGovError extends Error {
  constructor(
    public readonly rule: string,
    public readonly message: string,
    public readonly severity: 'P0' | 'P1' | 'P2' = 'P1',
  ) {
    super(message)
    this.name = 'ProposalGovError'
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GovCheckResult {
  passed: boolean
  rule:   string
  reason: string | null
}

// ── RULE 1: proposal_pii_gate ─────────────────────────────────────────────────
// SME-6 §6.11 — Client PII must have consent before processing
// Enforced: POST /api/proposals

export function checkPiiGate(input: { clientEmail?: string; consentCaptured: boolean }): GovCheckResult {
  if (input.clientEmail && !input.consentCaptured) {
    return { passed: false, rule: 'proposal_pii_gate', reason: 'Client PII (email) provided without consent flag — set consentCaptured:true to confirm DPDP §6.16 compliance' }
  }
  return { passed: true, rule: 'proposal_pii_gate', reason: null }
}

// ── RULE 2: nda_access_gate ───────────────────────────────────────────────────
// SME-6 §6.16 — NDA-flagged RFP restricts drafting-agent access
// Enforced: PATCH /api/proposals/[id]/draft trigger

export function checkNdaAccessGate(input: { ndaActive: boolean; consentCaptured: boolean }): GovCheckResult {
  if (input.ndaActive && !input.consentCaptured) {
    return { passed: false, rule: 'nda_access_gate', reason: 'RFP has ndaActive:true — NDA consent must be captured before drafting-agent can access rfp_record' }
  }
  return { passed: true, rule: 'nda_access_gate', reason: null }
}

// ── RULE 3: groundedness_credential ──────────────────────────────────────────
// SME-5 §5.11 — Every credential claim must resolve to verified team registry
// Enforced: Review stage — scans draft text for credential patterns

const CREDENTIAL_PATTERNS = [
  /AWS\s+certified/i, /Google\s+certified/i, /PMP\s+certified/i,
  /ISO\s+\d{4,5}/i, /CISSP/i, /CISA/i, /Scrum\s+Master/i,
  /SOC\s*2/i, /GDPR\s+certified/i, /years?\s+of\s+experience/i,
]

// Known/approved credentials — in production this would be a DB lookup
const TEAM_REGISTRY_CREDENTIALS = [
  'AWS certified', 'Google certified', 'Scrum Master',
]

export function checkGroundednessCredential(draftText: string): GovCheckResult {
  const unverifiedClaims: string[] = []

  for (const pattern of CREDENTIAL_PATTERNS) {
    const match = draftText.match(pattern)
    if (match) {
      const claim = match[0]
      const isVerified = TEAM_REGISTRY_CREDENTIALS.some(c =>
        claim.toLowerCase().includes(c.toLowerCase())
      )
      if (!isVerified) {
        unverifiedClaims.push(claim)
      }
    }
  }

  if (unverifiedClaims.length > 0) {
    return {
      passed: false,
      rule:   'groundedness_credential',
      reason: `Unverified credential claims in draft: ${unverifiedClaims.join(', ')} — resolve against team registry before approval`,
    }
  }
  return { passed: true, rule: 'groundedness_credential', reason: null }
}

// ── RULE 4: pricing_floor_gate ────────────────────────────────────────────────
// SME-9 §9.3 — No proposal below approved floor rate
// Enforced: Pricing stage

export function checkPricingFloor(pricingTotalInr: number): GovCheckResult {
  if (pricingTotalInr < PRICING_FLOOR_INR) {
    return {
      passed: false,
      rule:   'pricing_floor_gate',
      reason: `Pricing ₹${pricingTotalInr.toLocaleString('en-IN')} is below floor rate ₹${PRICING_FLOOR_INR.toLocaleString('en-IN')} — requires manual override with justification`,
    }
  }
  return { passed: true, rule: 'pricing_floor_gate', reason: null }
}

// ── RULE 5: proposal_mutation_gate ────────────────────────────────────────────
// SME-4 §4.11B / SME-11 — Post-approval edits to pricing/scope/delivery re-trigger approval
// Enforced: PATCH /api/proposals/[id]

export function checkMutationGate(
  currentStage: string,
  patchFields: string[],
): GovCheckResult {
  const PROTECTED_FIELDS = ['pricingModel', 'pricingTotalInr', 'scopeOutline', 'effortEstimateDays', 'deadline']
  if (currentStage === 'approved' || currentStage === 'delivered') {
    const protectedMutations = patchFields.filter(f => PROTECTED_FIELDS.includes(f))
    if (protectedMutations.length > 0) {
      return {
        passed: false,
        rule:   'proposal_mutation_gate',
        reason: `POST_APPROVAL_MUTATION: fields [${protectedMutations.join(', ')}] cannot be edited after approval — reset to 'review' stage first`,
      }
    }
  }
  return { passed: true, rule: 'proposal_mutation_gate', reason: null }
}

// ── RULE 6: margin_leak_guard ─────────────────────────────────────────────────
// SME-11 §6.14 red team — Internal margin % must not appear in client-facing draft
// Enforced: After draft generation, before saving

const MARGIN_LEAK_PATTERNS = [
  /margin\s*[=:]\s*\d+%/i,
  /profit\s*margin\s*[=:]/i,
  /internal\s+rate/i,
  /our\s+cost\s+is/i,
  /cost\s+to\s+us/i,
  /\bmargin\b.*\b\d+%/i,
  /markup\s*[=:]\s*\d+%/i,
]

export function checkMarginLeak(draftText: string): GovCheckResult {
  for (const pattern of MARGIN_LEAK_PATTERNS) {
    if (pattern.test(draftText)) {
      return {
        passed: false,
        rule:   'margin_leak_guard',
        reason: `MARGIN_DATA_IN_CLIENT_DRAFT: Pattern "${pattern.source}" detected — internal financial data must not appear in client proposals`,
      }
    }
  }
  return { passed: true, rule: 'margin_leak_guard', reason: null }
}

// ── RULE 7: deadline_dlq_monitor ─────────────────────────────────────────────
// SME-8 §8.11 — No proposal lost near deadline
// Enforced: Cron hourly (proposal-deadline-monitor)

export function checkDeadlineDlq(proposal: {
  id:       string
  deadline: Date | null
  stage:    string
  dlqAt:    Date | null
  createdAt: Date
}): { needsAlert: boolean; urgency: 'critical' | 'warning' | null; hoursRemaining: number | null } {
  if (!proposal.deadline) return { needsAlert: false, urgency: null, hoursRemaining: null }

  const now            = Date.now()
  const deadlineMs     = proposal.deadline.getTime()
  const createdMs      = proposal.createdAt.getTime()
  const totalWindowMs  = deadlineMs - createdMs
  const elapsedMs      = now - createdMs
  const remainingMs    = deadlineMs - now
  const hoursRemaining = remainingMs / 3_600_000

  // Already past deadline
  if (remainingMs <= 0) {
    return { needsAlert: true, urgency: 'critical', hoursRemaining: 0 }
  }

  // In DLQ + >50% of window elapsed → P0 alert
  if (proposal.dlqAt && totalWindowMs > 0 && elapsedMs / totalWindowMs > DEADLINE_DLQ_PCT) {
    return { needsAlert: true, urgency: 'critical', hoursRemaining }
  }

  // Approaching deadline (<6h) and not yet delivered/approved
  if (hoursRemaining < DEADLINE_WARNING_HOURS && !['approved', 'delivered', 'no_bid'].includes(proposal.stage)) {
    return { needsAlert: true, urgency: 'warning', hoursRemaining }
  }

  return { needsAlert: false, urgency: null, hoursRemaining }
}

// ── RULE 8: revision_depth_halt ──────────────────────────────────────────────
// SME-4 §4.11B / SME-11 — Draft-review loop max depth 3; escalate to human at depth 2
// Enforced: Review loop in drafting pipeline

export function checkRevisionDepth(revisionDepth: number): GovCheckResult {
  if (revisionDepth >= REVISION_DEPTH_MAX) {
    return {
      passed: false,
      rule:   'revision_depth_halt',
      reason: `Revision depth ${revisionDepth} has reached maximum (${REVISION_DEPTH_MAX}) — proposal escalated to human reviewer, automated loop halted`,
    }
  }
  return { passed: true, rule: 'revision_depth_halt', reason: null }
}

export function needsHumanEscalation(revisionDepth: number): boolean {
  return revisionDepth >= REVISION_DEPTH_MAX - 1 // escalate at depth 2 (one before halt)
}

// ── RULE 9: high_value_review_gate ───────────────────────────────────────────
// SME-9 §9.3 / SME-11 — Deals >₹10L require second human reviewer before delivery
// Enforced: Approval stage / PATCH to 'delivered'

export function checkHighValueReview(input: {
  dealValueInr:    number | null
  approvalStatus:  string
  secondApprovedBy: string | null
}): GovCheckResult {
  const value = input.dealValueInr ?? 0
  if (value > HIGH_VALUE_THRESHOLD_INR && !input.secondApprovedBy) {
    return {
      passed: false,
      rule:   'high_value_review_gate',
      reason: `Deal value ₹${value.toLocaleString('en-IN')} exceeds ₹10L threshold — second human reviewer sign-off required before delivery`,
    }
  }
  return { passed: true, rule: 'high_value_review_gate', reason: null }
}

// ── RULE 10: no_bid_reason_required ──────────────────────────────────────────
// SME-9 §9.3 / SME-11 — No-bid decisions must log a reason code
// Enforced: PATCH bid decision to 'no_bid'

export function checkNoBidReason(bidDecision: string, reason: string | undefined | null): GovCheckResult {
  if (bidDecision === 'no_bid' && (!reason || reason.trim().length < 10)) {
    return {
      passed: false,
      rule:   'no_bid_reason_required',
      reason: 'No-bid decision requires a reason code (min 10 chars) — feeds win-rate model and tribal registry',
    }
  }
  return { passed: true, rule: 'no_bid_reason_required', reason: null }
}

// ── Composite gate: run all applicable rules, return first failure ────────────
export function runGovGates(gates: GovCheckResult[]): GovCheckResult | null {
  return gates.find(g => !g.passed) ?? null
}
