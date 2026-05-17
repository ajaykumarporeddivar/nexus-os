/**
 * POST /api/leads/convert
 *
 * SME-13: Conversion event — links CRM/payment conversion back to the
 * originating lead record + pipeline run for ROI attribution.
 *
 * Called by:
 *   - Stripe/Razorpay webhook after successful payment
 *   - Admin marking a lead as converted in the dashboard
 *   - CRM webhook (future)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { brand, appUrl } from '@/lib/brand'

export const runtime     = 'nodejs'
export const maxDuration = 15

const FROM          = () => process.env.EMAIL_FROM ?? `${brand.name} <noreply@${brand.domain}>`
const FOUNDER_EMAIL = () => process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'

export async function POST(req: NextRequest) {
  // N1 fix: auth gate — accept internal server calls OR webhook shared secret
  // Internal: x-nexus-internal header (checkout/verify → leads/convert)
  // Webhook: x-webhook-secret header (Stripe/Razorpay webhooks)
  const internalSecret = process.env.INTERNAL_API_SECRET
  const webhookSecret  = process.env.WEBHOOK_SECRET ?? process.env.INTERNAL_API_SECRET
  const internalHeader = req.headers.get('x-nexus-internal')
  const webhookHeader  = req.headers.get('x-webhook-secret')
  const bearerToken    = (req.headers.get('authorization') ?? '').replace('Bearer ', '')

  const isAuthorized =
    (internalSecret && internalHeader === internalSecret) ||
    (webhookSecret  && webhookHeader  === webhookSecret)  ||
    (internalSecret && bearerToken    === internalSecret)

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Accepts both internal (admin) and webhook calls
  const body = await req.json() as {
    email?:         string
    leadId?:        string
    plan?:          string
    amountUsd?:     number
    orderId?:       string
    pipelineRunId?: string
    source?:        'stripe' | 'razorpay' | 'admin' | 'crm'
  }

  if (!body.email && !body.leadId) {
    return NextResponse.json({ ok: false, error: 'email or leadId required' }, { status: 400 })
  }

  // Find lead
  const lead = body.leadId
    ? await prisma.lead.findUnique({ where: { id: body.leadId } })
    : await prisma.lead.findFirst({ where: { email: body.email }, orderBy: { createdAt: 'desc' } })

  if (!lead) {
    // Lead didn't go through scoring pipeline — create a minimal converted record
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
    return NextResponse.json({ ok: true, created: true })
  }

  // Mark converted + link pipeline run for ROI attribution
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status:        'converted',
      pipelineRunId: body.pipelineRunId ?? lead.pipelineRunId,
    },
  })

  // Audit
  await prisma.auditEvent.create({
    data: {
      action:    'lead_converted',
      sessionId: `conv_${lead.id}`,
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

  // Internal founder conversion alert
  if (process.env.RESEND_API_KEY && body.amountUsd) {
    const r = new Resend(process.env.RESEND_API_KEY)
    const roiMultiple = lead.scoringCostUsd && lead.scoringCostUsd > 0
      ? Math.round(body.amountUsd / lead.scoringCostUsd)
      : null

    r.emails.send({
      from:    FROM(),
      to:      FOUNDER_EMAIL(),
      subject: `💰 Conversion — ${lead.email} · ${body.plan ?? 'paid'} · $${body.amountUsd}`,
      html: `<div style="font-family:monospace;background:#0a0a0a;color:#e5e5e5;padding:24px;border-radius:8px;max-width:480px">
        <div style="color:#c8ff00;font-weight:700;font-size:16px;margin-bottom:16px">Conversion Event</div>
        <div>Email: <strong>${lead.email}</strong></div>
        <div>Plan: ${body.plan ?? '—'} · Amount: $${body.amountUsd}</div>
        <div>ICP Score at conversion: <strong style="color:#4ade80">${lead.icpScore ?? '—'}/100</strong></div>
        <div>Lead age: ${Math.round((Date.now() - lead.createdAt.getTime()) / 3_600_000)}h from signup to payment</div>
        ${roiMultiple ? `<div>ROI multiple: <strong style="color:#c8ff00">${roiMultiple}×</strong> vs scoring cost</div>` : ''}
        ${lead.pipelineRunId ? `<div>Pipeline run: ${lead.pipelineRunId}</div>` : ''}
        <a href="${appUrl}/shell/leads" style="display:inline-block;margin-top:16px;background:#c8ff00;color:#000;font-weight:700;padding:10px 20px;border-radius:6px;text-decoration:none">View Dashboard →</a>
      </div>`,
    }).catch(console.error)
  }

  return NextResponse.json({ ok: true, leadId: lead.id, status: 'converted' })
}
