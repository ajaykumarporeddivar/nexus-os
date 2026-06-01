/**
 * GET /api/cron/reactivate
 *
 * One-shot re-engagement blast — sends a compelling "we've upgraded" email
 * to all leads and free users who haven't converted yet.
 *
 * Links directly to /shell?page=pricing (PUBLIC — no login needed).
 * Checkout + payment works without auth, so recipients can pay immediately.
 *
 * Auth: CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest }         from '@/lib/cronAuth'
import { prisma }                    from '@/lib/prisma'
import { Resend }                    from 'resend'

const APP_URL = 'https://web-xi-vert-58.vercel.app'

function buildEmail(name: string, email: string) {
  const pricingUrl = `${APP_URL}/shell?page=pricing`
  const demoUrl    = `${APP_URL}/shell?page=pipeline`
  const firstName  = (name || email.split('@')[0]).split(' ')[0]

  const subject = `${firstName}, your NEXUS OS app is ready — try it free right now`

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:40px 20px}
    .card{background:#141414;border:1px solid #242424;border-radius:16px;padding:40px;max-width:520px;margin:0 auto}
    .logo{font-size:10px;letter-spacing:.2em;color:#666;margin-bottom:28px;text-transform:uppercase;font-weight:700}
    h1{font-size:22px;font-weight:800;margin:0 0 16px;color:#fff;line-height:1.3}
    .accent{color:#c8ff00}
    p{font-size:14px;color:#999;line-height:1.7;margin:12px 0}
    .highlight{background:#1a1a1a;border-left:3px solid #c8ff00;border-radius:0 8px 8px 0;padding:14px 16px;margin:20px 0}
    .highlight p{color:#ccc;margin:4px 0;font-size:13px}
    .cta{display:inline-block;background:#c8ff00;color:#000;font-weight:800;font-size:14px;padding:14px 28px;border-radius:8px;text-decoration:none;margin-top:20px;letter-spacing:.02em}
    .cta-ghost{display:inline-block;background:transparent;color:#999;font-weight:600;font-size:13px;padding:10px 20px;border-radius:8px;text-decoration:none;margin-top:8px;border:1px solid #2a2a2a}
    .badge{background:#c8ff0015;color:#c8ff00;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;display:inline-block;margin-bottom:16px;letter-spacing:.05em;border:1px solid #c8ff0030}
    .divider{border:none;border-top:1px solid #1e1e1e;margin:24px 0}
    .footer{font-size:11px;color:#444;margin-top:24px;line-height:1.6}
    .footer a{color:#555;text-decoration:none}
  </style></head><body>
  <div class="card">
    <div class="logo">NEXUS OS · Autonomous SaaS Builder</div>
    <div class="badge">⚡ MAJOR UPGRADE</div>
    <h1>We fixed everything.<br>Your SaaS app is <span class="accent">90 seconds away</span>.</h1>
    <p>Hi ${firstName},</p>
    <p>Since you last visited, we've shipped a complete overhaul of the NEXUS pipeline. The app that was generating generic output before? Now generates <strong style="color:#fff">your exact domain</strong> — real entity names, real status values, real workflows — and deploys it live to Vercel.</p>

    <div class="highlight">
      <p><strong style="color:#c8ff00">What's new:</strong></p>
      <p>✅ Domain-specific AI output (vet clinic → appointments, patients, billing)</p>
      <p>✅ 13-agent FORGE pipeline + 10-agent BUILD engine</p>
      <p>✅ One-click Vercel deploy — live URL in 90 seconds</p>
      <p>✅ 15 Gemini + 16 Groq AI keys — zero API limits</p>
    </div>

    <p>The <strong style="color:#fff">Agency plan ($199/mo)</strong> gives you unlimited pipeline runs, unlimited projects, and everything deployed live. Most agencies charge $5,000+ for what this generates in 90 seconds.</p>

    <a href="${pricingUrl}" class="cta">Get Agency Plan — $199 ↗</a><br>
    <a href="${demoUrl}" class="cta-ghost">Try free first ↗</a>

    <hr class="divider">
    <p style="font-size:12px;color:#666">No account needed to pay — just enter your email at checkout. Your plan activates immediately after payment. Questions? Reply to this email.</p>

    <div class="footer">
      NEXUS OS · Autonomous SaaS Builder<br>
      <a href="${APP_URL}/unsubscribe">Unsubscribe</a>
    </div>
  </div>
  </body></html>`

  return { subject, html }
}

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req)
  if (authError) return authError

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  if (!resend) return NextResponse.json({ ok: false, error: 'RESEND_API_KEY not configured' })

  const fromEmail = process.env.EMAIL_FROM ?? 'NEXUS OS <noreply@resend.dev>'
  const sent: string[] = []
  const failed: string[] = []
  const skipped: string[] = []

  // ── 1. Leads who haven't converted ─────────────────────────────────────────
  const leads = await prisma.lead.findMany({
    where: {
      status:    { notIn: ['converted', 'dlq'] },
      email:     { not: { startsWith: 'deleted_' } },
    },
    select: { id: true, email: true, name: true },
    take: 100,
  })

  // ── 2. Free users who haven't upgraded ─────────────────────────────────────
  const freeUsers = await prisma.user.findMany({
    where: {
      OR: [{ plan: 'free' }, { plan: { equals: undefined } }],
    },
    select: { id: true, email: true, name: true },
    take: 100,
  })

  // Deduplicate by email
  const seen = new Set<string>()
  const recipients: Array<{ email: string; name: string | null }> = []

  for (const r of [...leads, ...freeUsers]) {
    if (!r.email || seen.has(r.email.toLowerCase())) continue
    seen.add(r.email.toLowerCase())
    recipients.push({ email: r.email, name: r.name })
  }

  console.log(`[reactivate] Sending to ${recipients.length} recipients`)

  for (const { email, name } of recipients) {
    // Check if we already sent this blast to them (idempotent)
    const alreadySent = await prisma.auditEvent.findFirst({
      where: { action: 'reactivation_email_sent', meta: { path: ['email'], equals: email } },
    }).catch(() => null)

    if (alreadySent) { skipped.push(email); continue }

    const { subject, html } = buildEmail(name ?? '', email)

    try {
      await resend.emails.send({ from: fromEmail, to: email, subject, html })
      await prisma.auditEvent.create({
        data: {
          action:    'reactivation_email_sent',
          sessionId: `reactivate-${Date.now()}`,
          meta:      { email, name, sentAt: new Date().toISOString() },
        },
      }).catch(console.error)
      sent.push(email)
      // Small delay to respect Resend rate limits
      await new Promise(r => setTimeout(r, 150))
    } catch (err) {
      failed.push(`${email}: ${(err as Error).message?.slice(0, 60)}`)
    }
  }

  return NextResponse.json({
    ok:      true,
    total:   recipients.length,
    sent:    sent.length,
    skipped: skipped.length,
    failed:  failed.length,
    detail:  { sent, failed },
  })
}
