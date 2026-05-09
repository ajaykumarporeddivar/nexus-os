import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { Resend } from 'resend'
import { requireSession } from '@/lib/session'
import { appUrl } from '@/lib/brand'

const rzp = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  if (!rzp) {
    return NextResponse.json({ ok: false, error: 'Payment not configured' }, { status: 503 })
  }

  const {
    amountINR,     // number — full project value in INR (e.g. 50000)
    depositPct,    // number — percent to collect now (e.g. 50)
    clientName,
    clientEmail,
    clientCompany,
    projectSummary,
    sendEmail,     // boolean — also email the link to the client
  } = await req.json()

  if (!amountINR || !clientName || !clientEmail) {
    return NextResponse.json({ ok: false, error: 'amountINR, clientName, clientEmail required' }, { status: 400 })
  }

  const pct        = Math.min(100, Math.max(10, Number(depositPct) || 50))
  const deposit    = Math.round((amountINR * pct) / 100)
  const paise      = deposit * 100

  try {
    // Razorpay Payment Links API
    const link = await (rzp as any).paymentLink.create({
      amount:           paise,
      currency:         'INR',
      accept_partial:   false,
      description:      `${clientCompany} — ${projectSummary?.slice(0, 60) ?? 'Project deposit'}`,
      customer: {
        name:  clientName,
        email: clientEmail,
      },
      notify:           { email: true, sms: false },
      reminder_enable:  true,
      callback_url:     `${appUrl}/shell?page=client-delivery`,
      callback_method:  'get',
      notes: {
        agency_user: auth.user.id ?? '',
        full_amount: String(amountINR),
        deposit_pct: String(pct),
      },
    })

    const paymentUrl: string = link.short_url

    // Optionally email the link to the client
    if (sendEmail && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      const senderEmail = process.env.EMAIL_FROM
      await resend.emails.send({
        from:    `NEXUS OS <${senderEmail}>`,
        to:      [clientEmail],
        subject: `Payment request — ${clientCompany} project deposit`,
        html: `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:32px 0}
  .wrap{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0}
  .head{background:#0d0d12;padding:32px;color:#fff}
  .logo{font-size:10px;font-family:monospace;color:#818cf8;letter-spacing:.15em;text-transform:uppercase;margin-bottom:12px}
  h1{margin:0;font-size:20px;font-weight:700}
  .body{padding:32px}
  .amount{background:#f1f5f9;border-radius:8px;padding:20px;margin:20px 0;text-align:center}
  .amt-num{font-size:32px;font-weight:800;color:#0f172a}
  .amt-label{font-size:12px;color:#64748b;margin-top:4px}
  .cta{display:block;background:#0f172a;color:#fff!important;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-align:center;margin:24px 0}
  .note{font-size:12px;color:#94a3b8;line-height:1.6}
  .footer{padding:20px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8}
</style>
</head><body>
<div class="wrap">
  <div class="head">
    <div class="logo">NEXUS OS · AI Delivery</div>
    <h1>Project payment request</h1>
  </div>
  <div class="body">
    <p style="color:#334155">Hi ${clientName},</p>
    <p style="color:#334155">A deposit payment has been requested for your project with <strong>${clientCompany}</strong>.</p>
    <p style="color:#64748b;font-size:13px">${projectSummary?.slice(0, 120) ?? ''}</p>
    <div class="amount">
      <div class="amt-num">₹${deposit.toLocaleString('en-IN')}</div>
      <div class="amt-label">${pct}% deposit · Full project value ₹${amountINR.toLocaleString('en-IN')}</div>
    </div>
    <a href="${paymentUrl}" class="cta">Pay now →</a>
    <p class="note">Secure payment via Razorpay. UPI, cards, and net banking accepted.<br>Once received, your project will be scheduled and we will confirm within 24 hours.</p>
  </div>
  <div class="footer">Sent via NEXUS OS AI Delivery Infrastructure</div>
</div>
</body></html>`,
      }).catch(() => {/* non-critical — link already returned */})
    }

    return NextResponse.json({
      ok: true,
      data: {
        paymentUrl,
        depositINR: deposit,
        fullINR:    amountINR,
        depositPct: pct,
        linkId:     link.id,
      },
    })
  } catch (err) {
    console.error('[payment-link]', err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
