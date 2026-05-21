/**
 * leadFollowUp.ts — Multi-touch follow-up sequence
 *
 * Touch schedule (from lastTouchAt or createdAt):
 *   Touch 1 — immediate (sendLeadOutreachEmail)
 *   Touch 2 — Day 3: "Did you get a chance to see this?"
 *   Touch 3 — Day 6: value-add case study result
 *   Touch 4 — Day 9: scarcity — "1 slot left at early-access rate"
 *   Touch 5 — Day 12: archive if no response
 *
 * Called by GET /api/cron/lead-followup (daily 10 AM)
 */

import { Resend } from 'resend'
import { brand, appUrl } from './brand'
import { prisma } from './prisma'

const FROM          = () => process.env.EMAIL_FROM          ?? `${brand.name} <noreply@${brand.domain}>`
const CALENDLY_URL  = () => process.env.CALENDLY_URL          ?? 'https://calendly.com/nexus-os/demo'

function getResend(): Resend | null {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
}

/** Days between touches */
const TOUCH_DAYS = [0, 3, 6, 9, 12] // index = touchCount (0=initial already sent)

/** Build email HTML for a given touch number */
function buildFollowUpHtml(
  firstName: string,
  email: string,
  touch: number,
  platform: string | null,
): { subject: string; html: string } {
  const platformHint = platform ? ` (via ${platform})` : ''

  if (touch === 2) {
    return {
      subject: `${firstName}, just checking in${platformHint}`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;margin:0;padding:40px 20px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
  .logo{font-size:11px;letter-spacing:.15em;color:#888;margin-bottom:24px}
  p{font-size:14px;color:#aaa;line-height:1.6;margin:8px 0}
  .cta{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:20px}
  .footer{font-size:11px;color:#555;margin-top:28px}
</style></head>
<body><div class="card">
  <div class="logo">${brand.name}</div>
  <p>Hi ${firstName},</p>
  <p>Just following up — did you get a chance to see my last message about ${brand.name}?</p>
  <p>No pressure at all. If the timing isn't right, just say so and I'll get out of your inbox.</p>
  <p>If you're still curious: 15 minutes, I'll walk you through a live run. You'll see a full product spec, architecture, and GTM playbook generated in real time.</p>
  <a href="${CALENDLY_URL()}" class="cta">Book a 15-min demo →</a>
  <div class="footer">
    ${brand.name}<br>
    <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(email)}" style="color:#444">Unsubscribe</a>
  </div>
</div></body></html>`,
    }
  }

  if (touch === 3) {
    return {
      subject: `${firstName}, a result you might find interesting`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;margin:0;padding:40px 20px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
  .logo{font-size:11px;letter-spacing:.15em;color:#888;margin-bottom:24px}
  p{font-size:14px;color:#aaa;line-height:1.6;margin:8px 0}
  .result-box{background:#0d1a00;border:1px solid #4ade8040;border-radius:8px;padding:16px;margin:20px 0}
  .cta{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:20px}
  .footer{font-size:11px;color:#555;margin-top:28px}
</style></head>
<body><div class="card">
  <div class="logo">${brand.name}</div>
  <p>Hi ${firstName},</p>
  <p>One more thing before I leave you alone — a team we worked with last month used ${brand.name} to go from "idea" to investor-ready product spec in a single afternoon.</p>
  <div class="result-box">
    <p style="color:#4ade80;font-weight:600;margin:0 0 8px">Before → After</p>
    <p style="color:#aaa;font-size:13px;margin:4px 0">❌ Spec doc: 2 weeks of back-and-forth</p>
    <p style="color:#4ade80;font-size:13px;margin:4px 0">✓ Full spec + architecture + GTM: 14 minutes</p>
    <p style="color:#aaa;font-size:13px;margin:4px 0">❌ First client pitch: 3 weeks out</p>
    <p style="color:#4ade80;font-size:13px;margin:4px 0">✓ Pitched the same week</p>
  </div>
  <p>Happy to share the exact breakdown on a 15-min call if that's useful.</p>
  <a href="${CALENDLY_URL()}" class="cta">Book a 15-min call →</a>
  <div class="footer">
    ${brand.name}<br>
    <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(email)}" style="color:#444">Unsubscribe</a>
  </div>
</div></body></html>`,
    }
  }

  if (touch === 4) {
    return {
      subject: `${firstName}, 1 slot left this week — then I'm pausing outreach`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;margin:0;padding:40px 20px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
  .logo{font-size:11px;letter-spacing:.15em;color:#888;margin-bottom:24px}
  p{font-size:14px;color:#aaa;line-height:1.6;margin:8px 0}
  .cta{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:20px}
  .footer{font-size:11px;color:#555;margin-top:28px}
</style></head>
<body><div class="card">
  <div class="logo">${brand.name}</div>
  <p>Hi ${firstName},</p>
  <p>Last message from me — I don't want to clutter your inbox.</p>
  <p>I have <strong style="color:#c8ff00">one demo slot remaining this week</strong> at the early-access rate. After that I'm focusing on active projects and won't have space until next month.</p>
  <p>If ${brand.name} was even slightly interesting, this is the moment to see it live. 15 minutes. If it's not a fit after that, I'll tell you straight.</p>
  <a href="${CALENDLY_URL()}" class="cta">Claim the last slot →</a>
  <div class="footer">
    ${brand.name}<br>
    <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(email)}" style="color:#444">Unsubscribe / don't contact me again</a>
  </div>
</div></body></html>`,
    }
  }

  // Touch 5+ → archive (no email sent, handled by caller)
  return { subject: '', html: '' }
}

export interface FollowUpResult {
  leadId: string
  action: 'sent' | 'archived' | 'skipped'
  touch:  number
}

/** Process a single lead's follow-up. Returns action taken. */
export async function processLeadFollowUp(leadId: string): Promise<FollowUpResult> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead) return { leadId, action: 'skipped', touch: 0 }

  // Only follow up on in_outreach leads with consent
  if (!lead.consentCaptured)                         return { leadId, action: 'skipped', touch: lead.touchCount }
  if (lead.status === 'converted')                   return { leadId, action: 'skipped', touch: lead.touchCount }
  if (lead.status === 'disqualified')                return { leadId, action: 'skipped', touch: lead.touchCount }

  const currentTouch = lead.touchCount  // how many touches already sent
  const nextTouch    = currentTouch + 1 // what we're about to send

  // Touch 5 (Day 12) = archive
  if (nextTouch >= 5) {
    await prisma.lead.update({
      where: { id: leadId },
      data:  { status: 'disqualified', disqualifiedAt: new Date(), disqualificationReason: 'No response after 5-touch sequence (Day 12)' },
    })
    return { leadId, action: 'archived', touch: currentTouch }
  }

  const r = getResend()
  if (!r) return { leadId, action: 'skipped', touch: currentTouch }

  const firstName = lead.name?.split(' ')[0] ?? 'there'
  const { subject, html } = buildFollowUpHtml(firstName, lead.email, nextTouch, lead.platform)
  if (!subject) return { leadId, action: 'skipped', touch: currentTouch }

  try {
    await r.emails.send({ from: FROM(), to: lead.email, subject, html })

    // Schedule next touch
    const daysToNext = TOUCH_DAYS[nextTouch + 1] - TOUCH_DAYS[nextTouch] // gap to touch after this
    const nextTouchAt = daysToNext
      ? new Date(Date.now() + daysToNext * 24 * 60 * 60 * 1000)
      : null

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        touchCount:  nextTouch,
        lastTouchAt: new Date(),
        nextTouchAt: nextTouchAt,
      },
    })

    return { leadId, action: 'sent', touch: nextTouch }
  } catch (e) {
    console.error(`[followup] email failed for lead ${leadId}:`, e)
    return { leadId, action: 'skipped', touch: currentTouch }
  }
}

/** Find all leads whose nextTouchAt is due. Called by cron. */
export async function getDueFollowUpLeads(): Promise<string[]> {
  const leads = await prisma.lead.findMany({
    where: {
      status:          { in: ['in_outreach', 'routed'] },
      consentCaptured: true,
      nextTouchAt:     { lte: new Date() },
      touchCount:      { lt: 5 },
    },
    select: { id: true },
    take: 50, // max 50 per cron run
  })
  return leads.map(l => l.id)
}
