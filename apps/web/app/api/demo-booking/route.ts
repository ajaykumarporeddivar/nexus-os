import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/wati'
import { brand, appUrl } from '@/lib/brand'
import { checkPublicRateLimit, rateLimitHeaders } from '@/lib/ratelimit'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

interface BookingBody {
  name: string
  agency?: string
  email: string
  phone?: string
  usecase?: string
}

function confirmationHtml(data: BookingBody): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; background: #0f0f0f; color: #e5e5e5; margin: 0; padding: 40px 20px; }
  .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 32px; max-width: 520px; margin: 0 auto; }
  .logo { font-size: 11px; letter-spacing: 0.15em; color: #888; margin-bottom: 24px; }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 8px; color: #fff; }
  .accent { color: #c8ff00; }
  p { font-size: 14px; color: #aaa; line-height: 1.6; margin: 8px 0; }
  .detail { background: #111; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; }
  .detail span { color: #888; }
  .detail strong { color: #e5e5e5; display: block; margin-top: 2px; }
  .cta { display: inline-block; background: #c8ff00; color: #000; font-weight: 700; font-size: 13px; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; }
  .footer { font-size: 11px; color: #555; margin-top: 28px; }
</style></head>
<body>
  <div class="card">
    <div class="logo">${brand.name} · ${brand.version}</div>
    <h1>Demo confirmed <span class="accent">✓</span></h1>
    <p>Hi ${data.name}, we've received your request and will WhatsApp you within <strong style="color:#c8ff00">24 hours</strong> to schedule your ${brand.name} demo.</p>
    <div class="detail">
      ${data.agency ? `<span>Agency</span><strong>${data.agency}</strong>` : ''}
      ${data.phone  ? `<span>WhatsApp</span><strong>${data.phone}</strong>` : ''}
      ${data.usecase ? `<span>Use case</span><strong>${data.usecase}</strong>` : ''}
    </div>
    <p>While you wait — try the FORGE Engine with a real brief. No setup needed.</p>
    <a href="${appUrl}/shell?page=forge" class="cta">Launch FORGE Engine →</a>
    <div class="footer">${brand.name} · ${brand.tagline} · ${brand.domain}</div>
  </div>
</body>
</html>`
}

function internalHtml(data: BookingBody): string {
  return `
<div style="font-family:monospace;font-size:13px;background:#0f0f0f;color:#e5e5e5;padding:24px;border-radius:8px">
  <strong style="color:#c8ff00">New demo booking</strong><br><br>
  Name: ${data.name}<br>
  Agency: ${data.agency ?? '—'}<br>
  Email: ${data.email}<br>
  Phone: ${data.phone ?? '—'}<br>
  Use case: ${data.usecase ?? '—'}<br>
  Time: ${new Date().toISOString()}
</div>`
}

export async function POST(req: NextRequest) {
  try {
    const rl = await checkPublicRateLimit(req)
    if (!rl.success) {
      return NextResponse.json(
        { ok: false, error: 'Too many booking requests. Please wait a moment and try again.' },
        { status: 429, headers: rateLimitHeaders(rl) }
      )
    }

    const body: BookingBody = await req.json()

    if (!body.name || !body.email) {
      return NextResponse.json({ ok: false, error: 'name and email required' }, { status: 400 })
    }

    // 1. Fire webhook (non-blocking)
    if (process.env.DEMO_WEBHOOK_URL) {
      fetch(process.env.DEMO_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, source: brand.domain, timestamp: new Date().toISOString() }),
      }).catch(console.error)
    }

    // 2. Persist to audit log
    await prisma.auditEvent.create({
      data: {
        action: 'demo_booking',
        sessionId: req.headers.get('x-session-id') ?? crypto.randomUUID(),
        meta: { name: body.name, agency: body.agency, email: body.email, usecase: body.usecase },
      },
    }).catch(console.error)

    // 3. Send WhatsApp confirmation (non-blocking)
    if (body.phone) {
      sendWhatsApp({
        phone: body.phone,
        message: `Hi ${body.name}! Your ${brand.name} demo request is confirmed ✓\n\nWe'll WhatsApp you within 24 hours to schedule. While you wait — try FORGE Engine at ${brand.domain}/shell\n\n— ${brand.name} Team`,
      }).catch(console.error)
    }

    // 4. Send confirmation + internal notification via Resend
    if (resend) {
      const fromAddr = process.env.EMAIL_FROM ?? `${brand.name} <noreply@${brand.domain}>`
      const internalEmail = process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'

      await Promise.all([
        resend.emails.send({
          from: fromAddr,
          to: body.email,
          subject: `Your ${brand.name} demo is confirmed ✓`,
          html: confirmationHtml(body),
        }),
        resend.emails.send({
          from: fromAddr,
          to: internalEmail,
          subject: `New demo booking — ${body.name} (${body.agency ?? 'No agency'})`,
          html: internalHtml(body),
        }),
      ]).catch(err => console.error('[demo-booking] email send failed:', err))
    }

    // 5. Build wa.me link for frontend redirect (pre-filled message)
    const waPhone = process.env.WHATSAPP_BUSINESS_PHONE ?? '918919843305'
    const waMsg = encodeURIComponent(`Hi! I just booked a ${brand.name} demo (${body.name}${body.agency ? `, ${body.agency}` : ''}). Looking forward to connecting!`)
    const whatsappUrl = `https://wa.me/${waPhone}?text=${waMsg}`

    return NextResponse.json({ ok: true, data: { queued: true, email: resend ? 'sent' : 'skipped', whatsappUrl } })
  } catch (err) {
    console.error('[demo-booking POST]', err)
    return NextResponse.json({ ok: false, error: 'Booking failed' }, { status: 500 })
  }
}
