// POST /api/chasebot/chase — trigger a chase sequence for an invoice
// Pipeline: tone-selector → message-composer (AI) → GDSL compliance → dispatch/queue
//
// SECURITY RULES (immutable):
// - LEGAL_NOTICE: AI authoring HALTED — returns 422 + escalation record
// - PRE_LEGAL: AI draft created, requiresHumanReview=true, dispatched=false
// - Payment halt is webhook-only; never inferred from message content
// - High-value (>₹5L): URGENT/PRE_LEGAL routed to human phone queue

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'
import { aiComplete } from '@/lib/ai'
import {
  computeToneState,
  TONE_PROMPTS,
  TONE_CONFIGS,
  runGDSLRules,
  type GDSLContext,
  type ToneStateCB,
} from '@/lib/chasebotAgentData'

// ─── Message composition ──────────────────────────────────────────────────────

async function composeMessage(
  toneState: Exclude<ToneStateCB, 'LEGAL_NOTICE'>,
  templateVars: Record<string, string>,
): Promise<{
  subject: string
  body: string
  toneRationale: string
  humanReviewNotes?: string
  tokensUsed: number
}> {
  let systemPrompt = TONE_PROMPTS[toneState]
  for (const [k, v] of Object.entries(templateVars)) {
    systemPrompt = systemPrompt.replaceAll(`{{${k}}}`, v)
  }

  const result = await aiComplete({
    system:    systemPrompt,
    messages:  [{ role: 'user', content: 'Compose the chase message now.' }],
    maxTokens: 700,
    fastMode:  false,
  })

  const text = result.text ?? ''
  // Extract JSON — try fenced block first, then bare object
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/)
  if (!jsonMatch) throw new Error(`AI response missing JSON. Raw: ${text.slice(0, 200)}`)

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0])
  } catch {
    throw new Error(`AI returned malformed JSON: ${(jsonMatch[1] ?? jsonMatch[0]).slice(0, 200)}`)
  }

  if (!parsed.subject || !parsed.body) {
    throw new Error(`AI JSON missing required fields (subject/body). Got: ${Object.keys(parsed).join(', ')}`)
  }

  return {
    subject:          String(parsed.subject),
    body:             String(parsed.body),
    toneRationale:    String(parsed.toneRationale ?? ''),
    humanReviewNotes: parsed.humanReviewNotes ? String(parsed.humanReviewNotes) : undefined,
    tokensUsed:       result.tokens ?? Math.ceil(text.length / 4),
  }
}

// ─── Cost estimation ──────────────────────────────────────────────────────────

const COST_PER_TOKEN_USD = 0.000003  // $3/1M blended (sonnet ~$3 input + $15 output → blended ~$9/1M)

function estimateCost(tokens: number): number {
  return Math.round(tokens * COST_PER_TOKEN_USD * 10_000) / 10_000
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await req.json()
    const { invoiceId, forceChannel } = body

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }

    // Load invoice
    const invoice = await prisma.invoiceRecord.findFirst({
      where: { id: invoiceId, userId: user.id },
      include: {
        disputes: { where: { resolvedAt: null }, take: 1 },
      },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    // Recompute overdue days
    const now = new Date()
    const overdueDays = Math.max(0, Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86_400_000))
    const toneState = computeToneState(overdueDays, invoice.paymentPlanActive)

    // Update tone state on invoice
    await prisma.invoiceRecord.update({
      where: { id: invoice.id },
      data: {
        overdueDays,
        toneState,
        requiresHumanReview: toneState === 'PRE_LEGAL' || toneState === 'LEGAL_NOTICE',
      },
    })

    // Fetch client relationship
    const relationship = await prisma.clientRelationshipScore.findUnique({
      where: { clientId_userId: { clientId: invoice.clientId, userId: user.id } },
    })

    // Cadence count — DB query, not JS array slice (fixes P0 #3)
    const windowStart = new Date(now.getTime() - TONE_CONFIGS[toneState].windowDays * 86_400_000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000)

    const [recentCadenceCount, recentStrategicCount] = await Promise.all([
      prisma.chaseEvent.count({
        where: { invoiceId: invoice.id, createdAt: { gte: windowStart } },
      }),
      prisma.chaseEvent.count({
        where: { invoiceId: invoice.id, createdAt: { gte: thirtyDaysAgo } },
      }),
    ])

    // Idempotency key — one per invoice+tone+day
    const idempotencyKey = `chase:${invoiceId}:${toneState}:${now.toISOString().slice(0, 10)}`
    const existingKeyCount = await prisma.chaseEvent.count({ where: { idempotencyKey } })

    // Determine channel
    const toneConfig = TONE_CONFIGS[toneState]
    const channel    = (forceChannel ?? toneConfig.preferredChannel) as 'email' | 'whatsapp' | 'phone_required'

    // Build GDSL context (message body empty — filled after compose)
    const gdslCtx: GDSLContext = {
      invoice: {
        overdueDays,
        amount:                   Number(invoice.amount),
        currency:                 invoice.currency,
        toneState,
        paymentPlanActive:        invoice.paymentPlanActive,
        disputeFlag:              invoice.disputeFlag || invoice.disputes.length > 0,
        chaseActive:              invoice.chaseActive,
        highValueFlag:            invoice.highValueFlag,
        strategic_ceiling_active: invoice.strategic_ceiling_active,
        paidAt:                   invoice.paidAt,
        relationshipTier:         invoice.relationshipTier,
      },
      client: {
        relationshipScore: relationship?.score ?? 50,
        lifetimeRevenue:   Number(relationship?.lifetimeRevenue ?? 0),
        strategicFlag:     relationship?.strategicFlag ?? false,
      },
      event: {
        proposedTone:     toneState,
        messageBody:      '',
        channel,
        hour:             now.getHours(),
        dayOfWeek:        now.getDay(),    // 0=Sun, 6=Sat — NEW: passed to channel_hours_gate
        recentChaseCount: invoice.strategic_ceiling_active ? recentStrategicCount : recentCadenceCount,
        idempotencyKey,
        existingKeyCount,
      },
    }

    // Run GDSL pre-compose rules via runGDSLRules helper (fixes #8 — no more manual loop)
    // legal_authoring_gate and prohibited_language_gate are run separately
    const preRunResult = runGDSLRules(gdslCtx, { skip: ['prohibited_language_gate'] })
    if (!preRunResult.passed) {
      const hardViolation = preRunResult.violations.find(v => v.hardStop)!
      return NextResponse.json({
        blocked:    true,
        rule:       hardViolation.rule,
        reason:     hardViolation.reason,
        hardStop:   true,
        warnings:   preRunResult.violations.filter(v => !v.hardStop),
      }, { status: 422 })
    }

    // Surface soft violations as warnings even when passed (fixes #6 — channel hours visible)
    const warnings = preRunResult.violations.filter(v => !v.hardStop)

    // LEGAL_NOTICE: AI authoring halted
    if (toneState === 'LEGAL_NOTICE') {
      // Deduplicated escalation creation
      const existingEscalation = await prisma.escalationRecord.findFirst({
        where: { invoiceId: invoice.id, escalationType: 'legal_notice', resolvedAt: null },
      })
      if (!existingEscalation) {
        await prisma.escalationRecord.create({
          data: {
            invoiceId:      invoice.id,
            userId:         user.id,
            escalationType: 'legal_notice',
            escalatedTo:    'human_review_queue',
            reason:         `Invoice ${overdueDays} days overdue. LEGAL_NOTICE tone requires human-authored notice.`,
          },
        })
      }
      return NextResponse.json({
        blocked:             true,
        rule:                'legal_authoring_gate',
        reason:              'LEGAL_NOTICE messages must be human-authored. Escalated to human review queue.',
        requiresHumanAction: true,
        toneState,
        warnings,
      }, { status: 422 })
    }

    // Compose via AI (3-provider chain: Anthropic → Gemini → Groq)
    const templateVars: Record<string, string> = {
      overdueDays:      String(overdueDays),
      clientName:       invoice.clientName,
      currency:         invoice.currency,
      amount:           Number(invoice.amount).toLocaleString('en-IN'),
      invoiceRef:       invoice.externalId ?? invoice.id.slice(-8).toUpperCase(),
      dueDate:          invoice.dueDate.toLocaleDateString('en-GB'),
      previousAttempts: String(await prisma.chaseEvent.count({ where: { invoiceId: invoice.id } })),
    }

    let composed: Awaited<ReturnType<typeof composeMessage>>
    try {
      composed = await composeMessage(toneState as Exclude<ToneStateCB, 'LEGAL_NOTICE'>, templateVars)
    } catch (err) {
      console.error('[chasebot/chase] AI compose failed:', String(err).slice(0, 300))
      return NextResponse.json({ error: 'AI composition failed', detail: String(err).slice(0, 200) }, { status: 500 })
    }

    // Run prohibited_language_gate with the composed body
    gdslCtx.event.messageBody = composed.body
    const prohibitedResult = runGDSLRules(gdslCtx, { only: ['prohibited_language_gate'] })
    if (!prohibitedResult.passed) {
      const v = prohibitedResult.violations[0]
      return NextResponse.json({
        blocked:  true,
        rule:     v.rule,
        reason:   v.reason,
        hardStop: true,
        draft:    { subject: composed.subject, body: composed.body },
      }, { status: 422 })
    }

    // Determine dispatch status
    const requiresHumanReview = toneState === 'PRE_LEGAL'
    const dispatched = !requiresHumanReview && channel !== 'phone_required'

    // Real cost from token count (fixes #9)
    const agentCostUsd = estimateCost(composed.tokensUsed)

    const chaseEvent = await prisma.chaseEvent.create({
      data: {
        invoiceId:          invoice.id,
        userId:             user.id,
        toneState,
        toneRationale:      composed.toneRationale,
        channel,
        messageSubject:     composed.subject,
        messageBody:        composed.body,
        complianceCleared:  true,
        prohibitedFlagged:  false,
        requiresHumanReview,
        dispatched,
        dispatchedAt:       dispatched ? new Date() : null,
        idempotencyKey,
        agentCostUsd,
      },
    })

    // Escalation for high-value phone gate (only when not already returning 422 above)
    if (invoice.highValueFlag && (toneState === 'URGENT' || toneState === 'PRE_LEGAL')) {
      const existingEsc = await prisma.escalationRecord.findFirst({
        where: { invoiceId: invoice.id, escalationType: 'high_value_phone', resolvedAt: null },
      })
      if (!existingEsc) {
        await prisma.escalationRecord.create({
          data: {
            invoiceId:      invoice.id,
            userId:         user.id,
            escalationType: 'high_value_phone',
            escalatedTo:    'human_review_queue',
            reason:         `High-value invoice ${invoice.currency} ${invoice.amount} at ${toneState} — phone callback required`,
          },
        })
      }
    }

    return NextResponse.json({
      chaseEvent,
      toneState,
      composed: { subject: composed.subject, body: composed.body, toneRationale: composed.toneRationale, humanReviewNotes: composed.humanReviewNotes },
      requiresHumanReview,
      dispatched,
      agentCostUsd,
      tokensUsed: composed.tokensUsed,
      warnings,
    }, { status: 201 })

  } catch (err) {
    console.error('[chasebot/chase POST]', String(err).slice(0, 300))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
