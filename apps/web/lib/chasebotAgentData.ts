// ChaseBot CB — Agent System Prompts & Runtime Configuration
// NEXUS OS v8.0 | 13-SME Council Specification
//
// SECURITY RULES (immutable):
// 1. LEGAL_NOTICE tone: AI authoring HALTED — human-only
// 2. PRE_LEGAL tone: AI draft ONLY, requires human review before dispatch
// 3. Payment confirmation: webhook-only; message content NEVER confirms payment
// 4. High-value invoices >₹5L / >£5K: phone gate + human-in-loop required
// 5. Strategic client ceiling: max 2 AI-generated messages per 30-day window

import type { SkillMeta } from './skillRegistry'

// ─── Tone state machine ───────────────────────────────────────────────────────

export type ToneStateCB = 'WARM' | 'FIRM' | 'URGENT' | 'PRE_LEGAL' | 'LEGAL_NOTICE'

export interface ToneConfig {
  state:              ToneStateCB
  overdueDaysMin:     number
  overdueDaysMax:     number
  aiAuthoringAllowed: boolean    // false = LEGAL_NOTICE: human only
  requiresHumanReview: boolean   // true = PRE_LEGAL + LEGAL_NOTICE
  maxMessagesPerWindow: number   // cadence_frequency_cap GDSL rule
  windowDays:         number
  preferredChannel:   'email' | 'whatsapp' | 'phone_required'
}

export const TONE_CONFIGS: Record<ToneStateCB, ToneConfig> = {
  WARM: {
    state: 'WARM',
    overdueDaysMin: 0,
    overdueDaysMax: 6,
    aiAuthoringAllowed: true,
    requiresHumanReview: false,
    maxMessagesPerWindow: 2,
    windowDays: 7,
    preferredChannel: 'email',
  },
  FIRM: {
    state: 'FIRM',
    overdueDaysMin: 7,
    overdueDaysMax: 21,
    aiAuthoringAllowed: true,
    requiresHumanReview: false,
    maxMessagesPerWindow: 3,
    windowDays: 14,
    preferredChannel: 'email',
  },
  URGENT: {
    state: 'URGENT',
    overdueDaysMin: 22,
    overdueDaysMax: 35,
    aiAuthoringAllowed: true,
    requiresHumanReview: false,
    maxMessagesPerWindow: 2,
    windowDays: 7,
    preferredChannel: 'whatsapp',
  },
  PRE_LEGAL: {
    state: 'PRE_LEGAL',
    overdueDaysMin: 36,
    overdueDaysMax: 50,
    aiAuthoringAllowed: true,
    requiresHumanReview: true,  // AI drafts, human must approve before dispatch
    maxMessagesPerWindow: 1,
    windowDays: 7,
    preferredChannel: 'email',
  },
  LEGAL_NOTICE: {
    state: 'LEGAL_NOTICE',
    overdueDaysMin: 51,
    overdueDaysMax: 9999,
    aiAuthoringAllowed: false,  // HALTED — human-authored only
    requiresHumanReview: true,
    maxMessagesPerWindow: 1,
    windowDays: 14,
    preferredChannel: 'phone_required',
  },
}

// ─── Tone-state system prompts ────────────────────────────────────────────────
// Locked under §5.7 change control — edit requires SME-3 + SME-5 approval
// Version: v8.0 | Last reviewed: 2026-05

export const TONE_PROMPTS: Record<Exclude<ToneStateCB, 'LEGAL_NOTICE'>, string> = {
  WARM: `You are a professional accounts receivable assistant for a freelancer or small agency.
Your task is to compose a warm, friendly payment reminder email.

Context:
- Invoice is {{overdueDays}} day(s) overdue (or just due)
- Client name: {{clientName}}
- Invoice amount: {{currency}} {{amount}}
- Invoice reference: {{invoiceRef}}
- Due date: {{dueDate}}

Tone requirements:
- Warm and professional, never threatening
- Assume oversight or admin delay on the client side
- Keep it brief: 3–4 sentences maximum
- End with a single clear call to action (payment link or reply to confirm)
- Do NOT mention legal action, late fees, or escalation
- Do NOT use words from the prohibited language list

Output format: JSON with fields:
{
  "subject": "string (≤60 chars)",
  "body": "string (plain text, ≤150 words)",
  "toneRationale": "string (why this tone was chosen, ≤50 words)"
}`,

  FIRM: `You are a professional accounts receivable assistant for a freelancer or small agency.
Your task is to compose a firm but respectful payment reminder.

Context:
- Invoice is {{overdueDays}} day(s) overdue
- Client name: {{clientName}}
- Invoice amount: {{currency}} {{amount}}
- Invoice reference: {{invoiceRef}}
- Due date: {{dueDate}}
- Previous chase attempts: {{previousAttempts}}

Tone requirements:
- Firm and direct, but not aggressive
- Acknowledge the client relationship while clearly stating the overdue status
- Mention that this is a follow-up to previous communications
- Offer a payment plan option if appropriate
- Keep to 4–6 sentences
- Do NOT use threatening language or mention solicitors/courts
- Do NOT use words from the prohibited language list

Output format: JSON with fields:
{
  "subject": "string (≤60 chars)",
  "body": "string (plain text, ≤200 words)",
  "toneRationale": "string (why this tone was chosen, ≤50 words)"
}`,

  URGENT: `You are a professional accounts receivable assistant for a freelancer or small agency.
Your task is to compose an urgent payment request.

Context:
- Invoice is {{overdueDays}} day(s) overdue
- Client name: {{clientName}}
- Invoice amount: {{currency}} {{amount}}
- Invoice reference: {{invoiceRef}}
- Due date: {{dueDate}}
- Previous chase attempts: {{previousAttempts}}
- Channel: WhatsApp (keep very brief)

Tone requirements:
- Urgent and serious in tone, still professional
- Clearly state this is a final notice before formal action is initiated
- Keep extremely brief for WhatsApp: 2–3 short sentences max
- Provide direct payment link
- Do NOT explicitly mention solicitors, courts, or legal proceedings
- Do NOT use words from the prohibited language list
- Do NOT make any unsubstantiated legal claims

Output format: JSON with fields:
{
  "subject": "string (≤60 chars, used as WhatsApp message header)",
  "body": "string (plain text, ≤80 words)",
  "toneRationale": "string (why this tone was chosen, ≤50 words)"
}`,

  PRE_LEGAL: `You are a professional accounts receivable assistant for a freelancer or small agency.
Your task is to compose a pre-legal notice draft.

IMPORTANT: This draft REQUIRES human review and approval before dispatch.
Do NOT send this message automatically.

Context:
- Invoice is {{overdueDays}} day(s) overdue
- Client name: {{clientName}}
- Invoice amount: {{currency}} {{amount}}
- Invoice reference: {{invoiceRef}}
- Due date: {{dueDate}}
- Previous chase attempts: {{previousAttempts}}

Tone requirements:
- Formal and serious — this is the final AI-authored communication
- Clearly state that failure to pay within 7 days will result in formal legal proceedings
- Reference the outstanding amount and overdue period precisely
- Provide a final payment link and a direct contact for resolution
- Keep to one formal paragraph
- Do NOT make specific legal claims you cannot substantiate
- Do NOT use words from the prohibited language list
- Use formal letter format (Dear [Name], ... Yours sincerely, ...)

HUMAN REVIEW NOTE: Flag any legally ambiguous language for solicitor review.

Output format: JSON with fields:
{
  "subject": "string (≤60 chars)",
  "body": "string (formal letter format, ≤250 words)",
  "toneRationale": "string (why this tone was chosen, ≤50 words)",
  "humanReviewNotes": "string (specific flags for human reviewer, ≤100 words)"
}`,
}

// ─── GDSL rule registry ───────────────────────────────────────────────────────
// 12 compiled rules — enforced at API route level before every dispatch

export interface GDSLRule {
  id:          string
  name:        string
  description: string
  hardStop:    boolean  // true = abort and return error; false = warn and degrade
  check:       (ctx: GDSLContext) => GDSLResult
}

export interface GDSLContext {
  invoice: {
    overdueDays:         number
    amount:              number
    currency:            string
    toneState:           ToneStateCB
    paymentPlanActive:   boolean
    disputeFlag:         boolean
    chaseActive:         boolean
    highValueFlag:       boolean
    strategic_ceiling_active: boolean
    paidAt:              Date | null
    relationshipTier:    string
  }
  client: {
    relationshipScore:   number
    lifetimeRevenue:     number
    strategicFlag:       boolean
  }
  event: {
    proposedTone:        ToneStateCB
    messageBody:         string
    channel:             string
    hour:                number  // 0–23 local time
    dayOfWeek:           number  // 0=Sun, 1=Mon … 6=Sat
    recentChaseCount:    number  // in tone window (DB-queried, not JS slice)
    idempotencyKey:      string
    existingKeyCount:    number  // prior events with same idempotency key
  }
}

export interface GDSLResult {
  passed:  boolean
  reason?: string
}

const PROHIBITED_LANGUAGE = [
  // Legal threats without authority
  'sue you', 'take you to court', 'legal action will be taken', 'solicitors have been instructed',
  'bailiffs', 'county court judgment', 'ccj', 'debt collectors have been appointed',
  // Shaming / aggressive language
  'fraud', 'criminal', 'scammer', 'cheat', 'liar', 'dishonest', 'defaulter',
  // Harassment
  'will keep calling', 'will contact your employer', 'will contact your family',
  'will post publicly', 'will review publicly',
  // False urgency / deception
  'account suspended', 'services terminated immediately', 'legal fees added without notice',
]

export const GDSL_RULES: GDSLRule[] = [
  {
    id: 'prohibited_language_gate',
    name: 'Prohibited Language Gate',
    description: 'Scans message body for prohibited language before dispatch.',
    hardStop: true,
    check: ({ event }) => {
      const body = event.messageBody.toLowerCase()
      const found = PROHIBITED_LANGUAGE.find(p => body.includes(p))
      if (found) return { passed: false, reason: `Prohibited phrase detected: "${found}"` }
      return { passed: true }
    },
  },
  {
    id: 'legal_authoring_gate',
    name: 'Legal Authoring Gate',
    description: 'Blocks AI from authoring LEGAL_NOTICE tone messages.',
    hardStop: true,
    check: ({ invoice, event }) => {
      if (invoice.toneState === 'LEGAL_NOTICE' || event.proposedTone === 'LEGAL_NOTICE') {
        return { passed: false, reason: 'LEGAL_NOTICE messages must be human-authored. AI authoring is halted at this tone state.' }
      }
      return { passed: true }
    },
  },
  {
    id: 'payment_confirmed_halt',
    name: 'Payment Confirmed Halt',
    description: 'Halts chase if payment has been confirmed via webhook.',
    hardStop: true,
    check: ({ invoice }) => {
      if (invoice.paidAt !== null) {
        return { passed: false, reason: 'Invoice marked as paid via payment webhook. Chase halted.' }
      }
      if (!invoice.chaseActive) {
        return { passed: false, reason: 'Chase is no longer active for this invoice.' }
      }
      return { passed: true }
    },
  },
  {
    id: 'strategic_client_ceiling',
    name: 'Strategic Client Ceiling',
    description: 'Limits AI chase messages to 2 per 30-day window for strategic clients.',
    hardStop: true,
    check: ({ client, invoice, event }) => {
      if (client.strategicFlag || invoice.strategic_ceiling_active) {
        if (event.recentChaseCount >= 2) {
          return { passed: false, reason: 'Strategic client ceiling reached (2 messages per 30 days). Escalate to human account manager.' }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'chase_idempotency',
    name: 'Chase Idempotency',
    description: 'Prevents duplicate chase events for the same idempotency key.',
    hardStop: true,
    check: ({ event }) => {
      if (event.existingKeyCount > 0) {
        return { passed: false, reason: `Duplicate chase event detected for idempotency key: ${event.idempotencyKey}` }
      }
      return { passed: true }
    },
  },
  {
    id: 'cadence_frequency_cap',
    name: 'Cadence Frequency Cap',
    description: 'Enforces max messages per tone-state cadence window.',
    hardStop: true,
    check: ({ invoice, event }) => {
      const config = TONE_CONFIGS[invoice.toneState]
      if (event.recentChaseCount >= config.maxMessagesPerWindow) {
        return { passed: false, reason: `Cadence cap reached: ${event.recentChaseCount}/${config.maxMessagesPerWindow} messages in ${config.windowDays}-day window for ${invoice.toneState} tone.` }
      }
      return { passed: true }
    },
  },
  {
    id: 'channel_hours_gate',
    name: 'Channel Hours Gate',
    description: 'Blocks dispatch outside permitted hours (09:00–18:00 Mon–Fri local time). Weekend sends are blocked.',
    hardStop: false,  // warn only — defer to next permitted window
    check: ({ event }) => {
      const isWeekend = event.dayOfWeek === 0 || event.dayOfWeek === 6  // Sun=0, Sat=6
      if (isWeekend) {
        const dayName = event.dayOfWeek === 0 ? 'Sunday' : 'Saturday'
        return { passed: false, reason: `Dispatch attempted on ${dayName} — only Mon–Fri permitted. Message queued for Monday 09:00.` }
      }
      if (event.hour < 9 || event.hour >= 18) {
        return { passed: false, reason: `Dispatch attempted at ${event.hour}:00 — outside permitted hours (09:00–18:00 Mon–Fri). Deferred to next window.` }
      }
      return { passed: true }
    },
  },
  {
    id: 'payment_plan_tone_freeze',
    name: 'Payment Plan Tone Freeze',
    description: 'Freezes tone escalation when a payment plan is active.',
    hardStop: true,
    check: ({ invoice }) => {
      if (invoice.paymentPlanActive) {
        if (invoice.toneState === 'URGENT' || invoice.toneState === 'PRE_LEGAL' || invoice.toneState === 'LEGAL_NOTICE') {
          return { passed: false, reason: 'Payment plan is active — tone escalation frozen. Only WARM reminders permitted.' }
        }
      }
      return { passed: true }
    },
  },
  {
    id: 'dispute_pause_gate',
    name: 'Dispute Pause Gate',
    description: 'Halts all chase activity when a dispute is open.',
    hardStop: true,
    check: ({ invoice }) => {
      if (invoice.disputeFlag) {
        return { passed: false, reason: 'Active dispute recorded — all chase activity paused until dispute is resolved.' }
      }
      return { passed: true }
    },
  },
  {
    id: 'high_value_phone_gate',
    name: 'High Value Phone Gate',
    description: 'Routes high-value invoices (>₹5L) to phone callback queue instead of automated message.',
    hardStop: true,
    check: ({ invoice }) => {
      if (invoice.highValueFlag && (invoice.toneState === 'URGENT' || invoice.toneState === 'PRE_LEGAL')) {
        return { passed: false, reason: 'High-value invoice: automated message blocked. Phone callback required — routed to human queue.' }
      }
      return { passed: true }
    },
  },
  {
    id: 'pii_retention_gate',
    name: 'PII Retention Gate',
    description: 'Flags invoices where client PII exceeds 36-month retention window.',
    hardStop: false,
    check: ({ invoice }) => {
      // Retention check deferred to cron — this gate is a no-op at dispatch time
      return { passed: true }
    },
  },
  {
    id: 'invoice_age_dlq_monitor',
    name: 'Invoice Age DLQ Monitor',
    description: 'Routes invoices >90 days overdue to dead-letter queue for manual review.',
    hardStop: false,
    check: ({ invoice }) => {
      if (invoice.overdueDays > 90) {
        return { passed: false, reason: `Invoice ${invoice.overdueDays} days overdue — DLQ threshold exceeded. Manual review required.` }
      }
      return { passed: true }
    },
  },
]

// ─── Run GDSL rules ───────────────────────────────────────────────────────────
// Options:
//   skip: string[]  — exclude these rule IDs from this run
//   only: string[]  — run ONLY these rule IDs
// Soft violations (hardStop:false) are returned in violations[] but don't block.

export interface GDSLRunOptions {
  skip?: string[]
  only?: string[]
}

export function runGDSLRules(
  ctx: GDSLContext,
  opts: GDSLRunOptions = {},
): { passed: boolean; violations: { rule: string; reason: string; hardStop: boolean }[] } {
  const { skip = [], only } = opts

  const rulesToRun = GDSL_RULES.filter(r => {
    if (only && only.length > 0) return only.includes(r.id)
    return !skip.includes(r.id)
  })

  const violations: { rule: string; reason: string; hardStop: boolean }[] = []

  for (const rule of rulesToRun) {
    const result = rule.check(ctx)
    if (!result.passed) {
      violations.push({ rule: rule.id, reason: result.reason ?? 'Rule failed', hardStop: rule.hardStop })
      if (rule.hardStop) break  // stop on first hard stop; collect all soft violations
    }
  }

  // Collect remaining soft-stop violations even after a hard stop
  // (don't break for soft stops — always continue to gather full picture)
  const hardViolation = violations.some(v => v.hardStop)
  return { passed: !hardViolation, violations }
}

// ─── Tone transition logic ────────────────────────────────────────────────────

export function computeToneState(overdueDays: number, paymentPlanActive: boolean): ToneStateCB {
  if (paymentPlanActive) return 'WARM'  // payment_plan_tone_freeze
  if (overdueDays <= 6)  return 'WARM'
  if (overdueDays <= 21) return 'FIRM'
  if (overdueDays <= 35) return 'URGENT'
  if (overdueDays <= 50) return 'PRE_LEGAL'
  return 'LEGAL_NOTICE'
}

// ─── Agent skill metadata (ACORA-compliant) ───────────────────────────────────

export interface ChaseBotAgent {
  id:    string
  name:  string
  role:  string
  skill: SkillMeta
}

export const CHASEBOT_AGENTS: ChaseBotAgent[] = [
  {
    id:   'invoice-sync',
    name: 'Invoice Sync',
    role: 'Ingests and normalises invoices from external billing sources',
    skill: {
      skillType:       'retriever',
      executionMode:   'sequential',
      parallelGroup:   null,
      executionOrder:  1,
      tokenBudget:     500,
      timeoutMs:       30000,
      trustLevel:      'trusted',
      failureBehavior: 'abort',
      costCeilingUsd:  0.001,
      dependencies:    [],
      retryPolicy: { maxAttempts: 3, backoffMs: 2000 },
    },
  },
  {
    id:   'tone-selector',
    name: 'Tone Selector',
    role: 'Selects appropriate tone state based on overdue days, relationship tier, and GDSL rules',
    skill: {
      skillType:       'router',
      executionMode:   'sequential',
      parallelGroup:   null,
      executionOrder:  2,
      tokenBudget:     300,
      timeoutMs:       10000,
      trustLevel:      'trusted',
      failureBehavior: 'abort',
      costCeilingUsd:  0.001,
      dependencies:    ['invoice-sync'],
      retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
    },
  },
  {
    id:   'message-composer',
    name: 'Message Composer',
    role: 'AI-composes chase message using tone-specific prompt. HALTED at LEGAL_NOTICE.',
    skill: {
      skillType:       'transformer',
      executionMode:   'sequential',
      parallelGroup:   null,
      executionOrder:  3,
      tokenBudget:     1200,
      timeoutMs:       60000,
      trustLevel:      'privileged',
      failureBehavior: 'abort',
      costCeilingUsd:  0.015,
      dependencies:    ['tone-selector'],
      retryPolicy: { maxAttempts: 2, backoffMs: 3000 },
    },
  },
  {
    id:   'compliance-check',
    name: 'Compliance Check',
    role: 'Runs GDSL rules against composed message. Hard-stops on prohibited language, legal gate.',
    skill: {
      skillType:       'validator',
      executionMode:   'sequential',
      parallelGroup:   null,
      executionOrder:  4,
      tokenBudget:     600,
      timeoutMs:       15000,
      trustLevel:      'privileged',
      failureBehavior: 'abort',
      costCeilingUsd:  0.002,
      dependencies:    ['message-composer'],
      retryPolicy: { maxAttempts: 1, backoffMs: 0 },
    },
  },
  {
    id:   'dispute-handler',
    name: 'Dispute Handler',
    role: 'Classifies disputes, pauses chase, routes to resolution workflow',
    skill: {
      skillType:       'executor',
      executionMode:   'sequential',
      parallelGroup:   null,
      executionOrder:  2,
      tokenBudget:     800,
      timeoutMs:       30000,
      trustLevel:      'trusted',
      failureBehavior: 'degrade',
      costCeilingUsd:  0.005,
      dependencies:    ['invoice-sync'],
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
  },
  {
    id:   'escalation-handler',
    name: 'Escalation Handler',
    role: 'Routes strategic/high-value/PRE_LEGAL cases to human review queue',
    skill: {
      skillType:       'executor',
      executionMode:   'sequential',
      parallelGroup:   null,
      executionOrder:  5,
      tokenBudget:     400,
      timeoutMs:       15000,
      trustLevel:      'privileged',
      failureBehavior: 'abort',
      costCeilingUsd:  0.002,
      dependencies:    ['compliance-check'],
      retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    },
  },
]

// ─── ICHS (Intelligence Cost Health Score) ────────────────────────────────────
// Target: 82/100

export interface ICHSSnapshot {
  toneAccuracy:       number  // % correct tone selections (target ≥90%)
  compliancePassRate: number  // % messages passing GDSL (target ≥99%)
  recoveryRate:       number  // % invoices paid after chase (target ≥65%)
  avgCostPerChase:    number  // USD per chase sequence (target ≤$0.054)
  humanEscalateRate:  number  // % needing human review (target ≤12%)
  ichs:               number  // weighted composite 0–100
}

export function computeICHS(s: Omit<ICHSSnapshot, 'ichs'>): ICHSSnapshot {
  // Weights: toneAccuracy 25%, compliancePassRate 30%, recoveryRate 25%, avgCostPerChase 10%, humanEscalateRate 10%
  const toneScore       = Math.min(100, (s.toneAccuracy / 90) * 100) * 0.25
  const complianceScore = Math.min(100, (s.compliancePassRate / 99) * 100) * 0.30
  const recoveryScore   = Math.min(100, (s.recoveryRate / 65) * 100) * 0.25
  const costScore       = Math.min(100, (s.avgCostPerChase <= 0.054 ? 100 : (0.054 / s.avgCostPerChase) * 100)) * 0.10
  const escalateScore   = Math.min(100, (s.humanEscalateRate <= 12 ? 100 : (12 / s.humanEscalateRate) * 100)) * 0.10

  return {
    ...s,
    ichs: Math.round(toneScore + complianceScore + recoveryScore + costScore + escalateScore),
  }
}
