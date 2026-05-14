import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { Resend } from 'resend'

export const runtime     = 'nodejs'
export const maxDuration = 30
export const dynamic     = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * POST /api/client-agents/deliver
 *
 * Deliver the output of a completed ClientAgentJob to the client.
 * Supports: email | whatsapp | portal (portal = just mark as delivered, stored in DB)
 *
 * Body: { jobId: string }
 */
export async function POST(req: NextRequest) {
  // Auth: session OR cron secret
  const cronSecret   = process.env.CRON_SECRET
  const incomingCron = req.headers.get('x-cron-secret')
  const isCronCall   = !!(cronSecret && incomingCron === cronSecret)

  let resolvedUserId = 'system'

  if (!isCronCall) {
    const auth = await requireSession()
    if (auth.error) return auth.error
    resolvedUserId = auth.user.id!
  }

  const body = await req.json().catch(() => ({})) as { jobId?: string }
  if (!body.jobId) {
    return NextResponse.json({ ok: false, error: 'jobId required' }, { status: 400 })
  }

  const job = await prisma.clientAgentJob.findUnique({
    where:   { id: body.jobId },
    include: {
      clientAgent: {
        include: {
          workspace: {
            select: { id: true, name: true, ownerId: true },
          },
        },
      },
    },
  })

  if (!job) {
    return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })
  }

  if (job.status !== 'done' || !job.outputText) {
    return NextResponse.json({ ok: false, error: 'Job not ready for delivery' }, { status: 400 })
  }

  if (!isCronCall && job.clientAgent.workspace.ownerId !== resolvedUserId) {
    return NextResponse.json({ ok: false, error: 'Not authorised' }, { status: 403 })
  }

  const agent  = job.clientAgent
  const output = job.outputText

  let delivered = false
  let method    = agent.deliveryMethod

  // ── Email delivery ─────────────────────────────────────────────────────────
  if (method === 'email' && agent.deliveryEmail) {
    try {
      await resend.emails.send({
        from:    `NEXUS AI <${process.env.RESEND_FROM_EMAIL ?? 'noreply@nexus-os.app'}>`,
        to:      [agent.deliveryEmail],
        subject: `[${agent.workspace.name}] ${agent.label ?? agent.agentType} — ${new Date().toLocaleDateString()}`,
        html: `
          <div style="font-family: monospace; max-width: 680px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #e8e8e8; border-radius: 12px;">
            <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #222;">
              <span style="font-size: 11px; letter-spacing: 0.12em; color: #c9f31a; text-transform: uppercase;">NEXUS AI · ${agent.workspace.name}</span>
              <h2 style="margin: 8px 0 0; font-size: 18px; color: #fff;">${agent.label ?? agent.agentType}</h2>
              <span style="font-size: 11px; color: #666;">${new Date().toLocaleString()}</span>
            </div>
            <div style="white-space: pre-wrap; font-size: 13px; line-height: 1.7; color: #ccc;">
              ${output
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#fff">$1</strong>')
                .replace(/^## (.+)$/gm, '<h3 style="color:#c9f31a;margin:20px 0 8px;font-size:14px;letter-spacing:0.08em;text-transform:uppercase">$1</h3>')
                .replace(/^### (.+)$/gm, '<h4 style="color:#e8e8e8;margin:16px 0 6px;font-size:13px">$1</h4>')
              }
            </div>
            <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #222; font-size: 10px; color: #444; letter-spacing: 0.08em; text-transform: uppercase;">
              Delivered by NEXUS AI · Managed by your agent operator
            </div>
          </div>
        `,
      })
      delivered = true
    } catch (e) {
      console.error('[deliver] email failed:', e)
    }
  }

  // ── WhatsApp delivery ──────────────────────────────────────────────────────
  else if (method === 'whatsapp' && agent.deliveryPhone) {
    try {
      const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
      const waRes = await fetch(`${baseUrl}/api/whatsapp/send`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'x-cron-secret': cronSecret ?? '',
        },
        body: JSON.stringify({
          phone:   agent.deliveryPhone,
          message: `*[${agent.workspace.name}] ${agent.label ?? agent.agentType}*\n\n${output.substring(0, 1500)}${output.length > 1500 ? '\n\n_[truncated — full report available in portal]_' : ''}`,
        }),
      })
      delivered = waRes.ok
    } catch (e) {
      console.error('[deliver] whatsapp failed:', e)
    }
  }

  // ── Portal delivery (just mark as delivered — output stored in DB) ─────────
  else if (method === 'portal') {
    delivered = true  // portal reads directly from ClientAgentJob.outputText
  }

  // ── Mark job as delivered ──────────────────────────────────────────────────
  if (delivered) {
    await prisma.clientAgentJob.update({
      where: { id: job.id },
      data:  { delivered: true },
    })

    await prisma.auditEvent.create({
      data: {
        action:    'client_agent_delivery',
        userId:    isCronCall ? agent.workspace.ownerId : resolvedUserId,
        sessionId: `delivery-${job.id}`,
        meta: {
          jobId:     job.id,
          agentType: agent.agentType,
          method,
          workspaceId: agent.workspaceId,
        },
      },
    }).catch(console.error)
  }

  return NextResponse.json({
    ok: true,
    data: { delivered, method },
  })
}
