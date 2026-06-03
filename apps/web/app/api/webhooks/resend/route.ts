/**
 * POST /api/webhooks/resend
 *
 * Inbound Resend webhook — captures email events (delivered, opened, clicked, bounced)
 * and reply notifications.
 *
 * Configure at: resend.com/webhooks
 * Events to subscribe: email.delivered, email.opened, email.clicked, email.bounced, email.complained
 *
 * Signature verification: Svix webhook signature (Resend uses Svix under the hood).
 * Header: svix-id, svix-timestamp, svix-signature
 *
 * For inbound replies: set Resend "Reply-To" to a catch-all address that forwards
 * to this webhook, or use Resend's inbound routing when available.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto                        from 'crypto'
import { prisma }                    from '@/lib/prisma'
import { exitLeadSequences, writeActivity } from '@/lib/leadSequence'
import { Resend }                    from 'resend'

export const runtime = 'nodejs'

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? ''
const OWNER_EMAIL           = process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'
const APP_URL               = process.env.NEXT_PUBLIC_APP_URL   ?? 'https://web-xi-vert-58.vercel.app'

// Svix signature verification for Resend webhooks
function verifySvixSignature(req: NextRequest, rawBody: string): boolean {
  if (!RESEND_WEBHOOK_SECRET) return true  // dev: skip

  const msgId        = req.headers.get('svix-id')        ?? ''
  const msgTimestamp = req.headers.get('svix-timestamp') ?? ''
  const msgSignature = req.headers.get('svix-signature') ?? ''

  if (!msgId || !msgTimestamp || !msgSignature) return false

  // Prevent replay attacks: reject events older than 5 minutes
  const ts = parseInt(msgTimestamp, 10)
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false

  const toSign  = `${msgId}.${msgTimestamp}.${rawBody}`
  const secret  = RESEND_WEBHOOK_SECRET.startsWith('whsec_')
    ? Buffer.from(RESEND_WEBHOOK_SECRET.slice(6), 'base64')
    : Buffer.from(RESEND_WEBHOOK_SECRET)
  const hmac    = crypto.createHmac('sha256', secret).update(toSign).digest('base64')
  const expected = `v1,${hmac}`

  // Svix may send multiple signatures
  return msgSignature.split(' ').some(sig => sig === expected)
}

async function notifyOwnerOfReply(email: string, leadId: string | null, preview: string): Promise<void> {
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  if (!resend) return

  const leadUrl = leadId ? `${APP_URL}/shell?page=leads&leadId=${leadId}` : APP_URL

  await resend.emails.send({
    from:    process.env.EMAIL_FROM ?? 'NEXUS OS <noreply@resend.dev>',
    to:      OWNER_EMAIL,
    subject: `🔔 Lead replied: ${email}`,
    html: `<div style="font-family:sans-serif;padding:24px;background:#0a0a0a;color:#e5e5e5">
<h2 style="color:#c8ff00;margin:0 0 16px">Lead replied</h2>
<p><strong>From:</strong> ${email}</p>
<p><strong>Preview:</strong> ${preview}</p>
<p><a href="${leadUrl}" style="color:#c8ff00">View lead →</a></p>
</div>`,
  }).catch(console.error)
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  if (!verifySvixSignature(req, rawBody)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const type = event.type as string
  const data = (event.data ?? {}) as Record<string, unknown>
  const toEmail = (data.to as string | undefined) ?? ''

  console.log(`[webhook/resend] type=${type} to=${toEmail}`)

  // Match lead by email
  const lead = toEmail
    ? await prisma.lead.findFirst({ where: { email: toEmail }, select: { id: true, email: true } }).catch(() => null)
    : null

  switch (type) {
    case 'email.opened': {
      if (lead) {
        await writeActivity(lead.id, 'email_opened', {
          channel: 'email',
          meta:    { messageId: data.email_id },
        }).catch(console.error)
      }
      break
    }

    case 'email.clicked': {
      if (lead) {
        await writeActivity(lead.id, 'link_clicked', {
          channel: 'email',
          meta:    { link: (data.click as Record<string, unknown>)?.link, messageId: data.email_id },
        }).catch(console.error)
      }
      break
    }

    case 'email.bounced':
    case 'email.complained': {
      if (lead) {
        // Mark lead as DLQ to stop further emails
        await prisma.lead.update({
          where: { id: lead.id },
          data:  { status: 'dlq' as never, dlqReason: type, dlqAt: new Date() },
        }).catch(console.error)
        await exitLeadSequences(lead.id, type).catch(console.error)
        await writeActivity(lead.id, 'status_changed', {
          meta: { from: 'active', to: 'dlq', reason: type },
        }).catch(console.error)
      }
      break
    }

    case 'email.replied':
    case 'inbound.email': {
      // Strip quoted thread to keep only the new content
      const fullText = (data.text ?? data.html ?? '') as string
      const preview  = fullText
        .replace(/<[^>]+>/g, ' ')         // strip HTML tags
        .replace(/^>.*$/gm, '')           // strip quoted lines
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300)

      if (lead) {
        // Pause sequences — reply is the strongest buying signal
        await exitLeadSequences(lead.id, 'lead_replied').catch(console.error)

        // Update lead status to replied
        await prisma.lead.update({
          where: { id: lead.id },
          data:  { status: 'replied' as never },
        }).catch(console.error)

        await writeActivity(lead.id, 'reply_received', {
          channel: 'email',
          subject: data.subject as string | undefined,
          body:    preview,
          meta:    { from: data.from, messageId: data.email_id },
        }).catch(console.error)
      }

      // Notify founder within 60 seconds
      await notifyOwnerOfReply(
        toEmail || (data.from as string) || 'unknown',
        lead?.id ?? null,
        preview || '(no preview available)',
      )
      break
    }
  }

  return NextResponse.json({ ok: true, type })
}
