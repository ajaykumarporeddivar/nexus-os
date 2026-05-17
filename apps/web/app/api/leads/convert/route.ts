/**
 * POST /api/leads/convert
 *
 * Conversion event: links CRM/payment conversion back to the originating lead
 * record and pipeline run for ROI attribution.
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { brand, appUrl } from '@/lib/brand'
import { verifyRazorpayWebhookSignature } from '@/lib/leadSecurity'

export const runtime     = 'nodejs'
export const maxDuration = 15

const FROM          = () => process.env.EMAIL_FROM ?? `${brand.name} <noreply@${brand.domain}>`
const FOUNDER_EMAIL = () => process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'

type ConvertBody = {
  email?: string
  leadId?: string
  plan?: string
  amountUsd?: number
  orderId?: string
  pipelineRunId?: string
  source?: 'stripe' | 'razorpay' | 'admin' | 'crm'
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  let body: ConvertBody
  try {
    body = JSON.parse(rawBody) as ConvertBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const internalSecret = process.env.INTERNAL_API_SECRET
  const webhookSecret  = process.env.WEBHOOK_SECRET ?? process.env.INTERNAL_API_SECRET
  const internalHeader = req.headers.get('x-nexus-internal') ?? ''
  const webhookHeader  = req.headers.get('x-webhook-secret') ?? ''
  const bearerToken    = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const razorpaySignature = req.headers.get('x-razorpay-signature')

  const isAuthorized =
    (internalSecret && timingSafeEqual(internalHeader, internalSecret)) ||
    verifyRazorpayWebhookSignature(rawBody, razorpaySignature) ||
    (webhookSecret && timingSafeEqual(webhookHeader, webhookSecret)) ||
    (internalSecret && bearerToken && timingSafeEqual(bearerToken, internalSecret))

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!body.email && !body.leadId) {
    return NextResponse.json({ ok: false, error: 'email or leadId required' }, { status: 400 })
  }

  const conversionKey = body.orderId ?? body.pipelineRunId ?? body.leadId ?? body.email
  const sessionId = `conv_${conversionKey}`
  const existingConversion = await prisma.auditEvent.findFirst({
    where: { action: 'lead_converted', sessionId },
    select: { id: true },
  })
  if (existingConversion) {
    return NextResponse.json({ ok: true, duplicate: true, status: 'converted' })
  }

  const lead = body.leadId
    ? await prisma.lead.findUnique({ where: { id: body.leadId } })
    : await prisma.lead.findFirst({ where: { email: body.email }, orderBy: { createdAt: 'desc' } })

  if (!lead) {
    if (body.email) {
      await prisma.lead.create({
        data: {
          email:           body.email,
          source:          body.source ?? 'checkout',
          status:          'converted',
          consentCaptured: true,
          pipelineRunId:   body.pipelineRunId ?? null,
        },
      })
    }
    await prisma.auditEvent.create({
      data: {
        action: 'lead_converted',
        sessionId,
        userId: null,
        meta: { email: body.email, orderId: body.orderId, source: body.source, createdMinimalLead: true } as never,
      },
    })
    return NextResponse.json({ ok: true, created: true })
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status:        'converted',
      pipelineRunId: body.pipelineRunId ?? lead.pipelineRunId,
    },
  })

  await prisma.auditEvent.create({
    data: {
      action:    'lead_converted',
      sessionId,
      userId:    null,
      meta: {
        leadId:        lead.id,
        email:         lead.email,
        icpScore:      lead.icpScore,
        plan:          body.plan,
        amountUsd:     body.amountUsd,
        orderId:       body.orderId,
        pipelineRunId: body.pipelineRunId ?? lead.pipelineRunId,
        source:        body.source,
        leadAgeHours:  Math.round((Date.now() - lead.createdAt.getTime()) / 3_600_000),
        scoringCostUsd: lead.scoringCostUsd,
        roiMultiple:   body.amountUsd && lead.scoringCostUsd && lead.scoringCostUsd > 0
                         ? Math.round(body.amountUsd / lead.scoringCostUsd)
                         : null,
      } as never,
    },
  })

  if (process.env.RESEND_API_KEY && body.amountUsd) {
    const r = new Resend(process.env.RESEND_API_KEY)
    const roiMultiple = lead.scoringCostUsd && lead.scoringCostUsd > 0
      ? Math.round(body.amountUsd / lead.scoringCostUsd)
      : null

    r.emails.send({
      from:    FROM(),
      to:      FOUNDER_EMAIL(),
      subject: `Conversion - ${lead.email} - ${body.plan ?? 'paid'} - $${body.amountUsd}`,
      html: `<div style="font-family:monospace;background:#0a0a0a;color:#e5e5e5;padding:24px;border-radius:8px;max-width:480px">
        <div style="color:#c8ff00;font-weight:700;font-size:16px;margin-bottom:16px">Conversion Event</div>
        <div>Email: <strong>${lead.email}</strong></div>
        <div>Plan: ${body.plan ?? '-'} - Amount: $${body.amountUsd}</div>
        <div>ICP Score at conversion: <strong style="color:#4ade80">${lead.icpScore ?? '-'}/100</strong></div>
        <div>Lead age: ${Math.round((Date.now() - lead.createdAt.getTime()) / 3_600_000)}h from signup to payment</div>
        ${roiMultiple ? `<div>ROI multiple: <strong style="color:#c8ff00">${roiMultiple}x</strong> vs scoring cost</div>` : ''}
        ${lead.pipelineRunId ? `<div>Pipeline run: ${lead.pipelineRunId}</div>` : ''}
        <a href="${appUrl}/shell/leads" style="display:inline-block;margin-top:16px;background:#c8ff00;color:#000;font-weight:700;padding:10px 20px;border-radius:6px;text-decoration:none">View Dashboard</a>
      </div>`,
    }).catch(console.error)
  }

  // ── P7 FIX: Lead→Proposal handoff ────────────────────────────────────────
  // When a high-ICP lead converts, auto-create a Proposal intake so the
  // proposal pipeline can begin immediately without manual RFP entry.
  if (lead.icpScore && lead.icpScore >= 70 && lead.consentCaptured) {
    try {
      await prisma.proposal.create({
        data: {
          rfpTitle:        `Inbound: ${lead.company ?? lead.email} — ${body.plan ?? 'Enterprise'}`,
          rfpText:         `Auto-generated from converted lead ${lead.id}. Plan: ${body.plan ?? 'unknown'}. ICP score: ${lead.icpScore}.`,
          clientEmail:     lead.email ?? null,
          clientName:      lead.name ?? lead.company ?? null,
          clientCompany:   lead.company ?? null,
          consentCaptured: true,
          ndaActive:       false,
          stage:           'intake',
          pipelineRunId:   lead.pipelineRunId ?? null,
          dealValueInr:    body.amountUsd ? String(Math.round(body.amountUsd * 85)) : null, // USD→INR ~85x
        },
      })
    } catch (e) {
      console.error('[convert] proposal handoff failed (non-fatal):', e)
    }
  }

  return NextResponse.json({ ok: true, leadId: lead.id, status: 'converted' })
}
