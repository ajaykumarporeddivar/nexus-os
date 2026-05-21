/**
 * leadOnboarding.ts — Post-conversion lifecycle emails
 *
 * Three triggers (all called by /api/cron/lead-post-conversion daily):
 *   1. Onboarding questionnaire — sent immediately on status → converted (if not yet sent)
 *   2. Retainer pitch           — sent 30 days after deliveredAt (if not yet sent)
 *   3. Referral CTA             — sent 3 days after onboarding form (if not yet sent)
 *
 * All are consent-gated.
 */

import { Resend } from 'resend'
import { brand, appUrl } from './brand'
import { prisma } from './prisma'

const FROM          = () => process.env.EMAIL_FROM          ?? `${brand.name} <noreply@${brand.domain}>`
const FOUNDER_EMAIL = () => process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'
const CALENDLY_URL  = () => process.env.CALENDLY_URL          ?? 'https://calendly.com/nexus-os/demo'
const ONBOARDING_FORM_URL = () => process.env.ONBOARDING_FORM_URL ?? `${appUrl}/onboarding`

function getResend(): Resend | null {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
}

// ── 1. Client onboarding questionnaire ───────────────────────────────────────
export async function sendOnboardingQuestionnaire(leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead || !lead.consentCaptured)         return false
  if (lead.status !== 'converted')            return false
  if (lead.onboardingFormSentAt)              return false  // already sent

  const r = getResend()
  if (!r) return false

  const firstName = lead.name?.split(' ')[0] ?? 'there'

  await r.emails.send({
    from:    FROM(),
    to:      lead.email,
    subject: `${firstName}, one quick form before we start — takes 3 minutes`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;margin:0;padding:40px 20px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
  .logo{font-size:11px;letter-spacing:.15em;color:#888;margin-bottom:24px}
  h1{font-size:18px;font-weight:700;margin:0 0 8px}
  p{font-size:14px;color:#aaa;line-height:1.6;margin:8px 0}
  .field-list{background:#111;border-radius:8px;padding:16px;margin:16px 0}
  .field{font-size:13px;color:#888;padding:5px 0;border-bottom:1px solid #222}
  .field:last-child{border-bottom:none}
  .cta{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:20px}
  .footer{font-size:11px;color:#555;margin-top:28px}
</style></head>
<body><div class="card">
  <div class="logo">${brand.name}</div>
  <h1>Hi ${firstName} — let's get started</h1>
  <p>Thanks for coming on board. Before I build anything, I need 3 minutes of your time to understand your setup. This replaces 5–8 back-and-forth emails.</p>
  <div class="field-list">
    <div class="field">1. Which platforms do you get leads from?</div>
    <div class="field">2. What information do leads typically provide?</div>
    <div class="field">3. Your current CRM / lead tracking method</div>
    <div class="field">4. Your WhatsApp number for owner notifications</div>
    <div class="field">5. Preferred time for daily summary email</div>
    <div class="field">6. Website URL (if you have a contact form)</div>
  </div>
  <p>Takes 3 minutes. Once I have this, I start building immediately.</p>
  <a href="${ONBOARDING_FORM_URL()}?lead=${encodeURIComponent(leadId)}" class="cta">Fill in the quick form →</a>
  <div class="footer">
    ${brand.name} · Reply to this email if you prefer to share details directly.<br>
    <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(lead.email)}" style="color:#444">Unsubscribe</a>
  </div>
</div></body></html>`,
  })

  await prisma.lead.update({
    where: { id: leadId },
    data:  { onboardingFormSentAt: new Date() },
  })

  return true
}

// ── 2. Monthly retainer pitch (30 days post-delivery) ────────────────────────
export async function sendRetainerPitch(leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead || !lead.consentCaptured)  return false
  if (lead.retainerPitchedAt)          return false  // already pitched
  if (!lead.deliveredAt)               return false  // not yet delivered

  const r = getResend()
  if (!r) return false

  const firstName = lead.name?.split(' ')[0] ?? 'there'

  await r.emails.send({
    from:    FROM(),
    to:      lead.email,
    subject: `${firstName}, your system's been live 30 days — want to keep improving it?`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;margin:0;padding:40px 20px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
  .logo{font-size:11px;letter-spacing:.15em;color:#888;margin-bottom:24px}
  h1{font-size:18px;font-weight:700;margin:0 0 8px}
  p{font-size:14px;color:#aaa;line-height:1.6;margin:8px 0}
  .plans{background:#111;border-radius:8px;padding:16px;margin:16px 0}
  .plan{padding:10px 0;border-bottom:1px solid #222;font-size:13px}
  .plan:last-child{border-bottom:none}
  .plan-name{color:#c8ff00;font-weight:600}
  .plan-desc{color:#888;margin-top:3px}
  .cta{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:20px}
  .footer{font-size:11px;color:#555;margin-top:28px}
</style></head>
<body><div class="card">
  <div class="logo">${brand.name}</div>
  <h1>Hi ${firstName} — 30 days in</h1>
  <p>Your automation system has been live for a month. The warranty period is ending soon.</p>
  <p>Most clients at this point move to a monthly plan so the system keeps improving — new integrations, optimisations, priority support — without needing to start a new project each time.</p>
  <div class="plans">
    <div class="plan">
      <div class="plan-name">Maintenance · ₹5,000/mo</div>
      <div class="plan-desc">Monthly health check, minor edits, error monitoring</div>
    </div>
    <div class="plan">
      <div class="plan-name">Growth · ₹12,000/mo <span style="color:#4ade80;font-size:11px">most popular</span></div>
      <div class="plan-desc">Weekly optimisation, 1 new automation/month, 4hr priority support</div>
    </div>
    <div class="plan">
      <div class="plan-name">Full Management · ₹25,000/mo</div>
      <div class="plan-desc">Complete AI workflow management, new integrations, monthly ROI report</div>
    </div>
  </div>
  <p>Even 1 extra lead recovered per week from your existing system pays for the Growth plan 3x over.</p>
  <a href="${CALENDLY_URL()}" class="cta">Book a 10-min retainer chat →</a>
  <div class="footer">
    ${brand.name} · Reply to this email to add a retainer directly.<br>
    <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(lead.email)}" style="color:#444">Unsubscribe</a>
  </div>
</div></body></html>`,
  })

  // Also alert founder so they can follow up in person
  const fr = getResend()
  if (fr) {
    await fr.emails.send({
      from:    FROM(),
      to:      FOUNDER_EMAIL(),
      subject: `Retainer pitch sent — ${lead.name ?? lead.email}`,
      html:    `<p style="font-family:sans-serif">Retainer pitch sent to <strong>${lead.email}</strong>. Follow up with a personal message within 24 hours for best close rate.</p><p style="font-family:sans-serif"><a href="${appUrl}/shell/leads">View lead →</a></p>`,
    }).catch(() => null)
  }

  await prisma.lead.update({
    where: { id: leadId },
    data:  { retainerPitchedAt: new Date() },
  })

  return true
}

// ── 3. Referral CTA (3 days after onboarding form sent) ──────────────────────
export async function sendReferralCta(leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead || !lead.consentCaptured)  return false
  if (lead.status !== 'converted' && lead.status !== ('retainer_active' as never)) return false
  if (!lead.onboardingFormSentAt)      return false  // only after onboarding

  // Only send once — use a referral CTA flag proxy: check if retainerPitchedAt is set in
  // a different way. We use the absence of referredBy on the lead as a signal that
  // *this* lead hasn't sent referrals yet. We track via a dedicated audit event instead.
  const alreadySent = await prisma.auditEvent.findFirst({
    where: { action: 'referral_cta_sent', meta: { path: ['leadId'], equals: leadId } },
  })
  if (alreadySent) return false

  const r = getResend()
  if (!r) return false

  const firstName      = lead.name?.split(' ')[0] ?? 'there'
  const referralAmount = 6000  // ₹6,000 = 15% of ₹40K Growth package

  await r.emails.send({
    from:    FROM(),
    to:      lead.email,
    subject: `${firstName}, earn ₹${referralAmount.toLocaleString('en-IN')} per referral — here's how`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;margin:0;padding:40px 20px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
  .logo{font-size:11px;letter-spacing:.15em;color:#888;margin-bottom:24px}
  h1{font-size:18px;font-weight:700;margin:0 0 8px}
  p{font-size:14px;color:#aaa;line-height:1.6;margin:8px 0}
  .highlight{background:#111;border:1px solid #c8ff0040;border-radius:8px;padding:16px;margin:16px 0;font-size:13px;color:#c8ff00}
  .msg-box{background:#111;border-radius:8px;padding:14px;margin:16px 0;font-size:13px;color:#888;font-style:italic;border-left:3px solid #c8ff00}
  .cta{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:20px}
  .footer{font-size:11px;color:#555;margin-top:28px}
</style></head>
<body><div class="card">
  <div class="logo">${brand.name}</div>
  <h1>Hi ${firstName} — one more thing</h1>
  <p>If you know 2–3 other business owners who might benefit from an AI lead follow-up system, I'd love an introduction.</p>
  <div class="highlight">
    I pay <strong>15% commission</strong> on whatever they spend — ₹${referralAmount.toLocaleString('en-IN')} if they take the Growth package. Paid via UPI immediately when they pay.
  </div>
  <p>Here's a message you can forward on WhatsApp right now:</p>
  <div class="msg-box">
    "Hey [Name], I recently got an AI system set up that automatically replies to every business enquiry in under 90 seconds and books calls while I sleep. Built by a guy who specialises in this for [your city]. Might be worth a 15-min demo — ${appUrl}"
  </div>
  <p>Just forward that, and CC me at <a href="mailto:${FOUNDER_EMAIL()}" style="color:#c8ff00">${FOUNDER_EMAIL()}</a> so I know where to send the commission.</p>
  <a href="mailto:${FOUNDER_EMAIL()}?subject=Referral from ${encodeURIComponent(lead.name ?? lead.email)}" class="cta">Send me an intro →</a>
  <div class="footer">
    ${brand.name}<br>
    <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(lead.email)}" style="color:#444">Unsubscribe</a>
  </div>
</div></body></html>`,
  })

  await prisma.auditEvent.create({
    data: {
      action:    'referral_cta_sent',
      sessionId: `referral_${leadId}`,
      meta:      { leadId, sentAt: new Date().toISOString() } as never,
    },
  })

  return true
}
