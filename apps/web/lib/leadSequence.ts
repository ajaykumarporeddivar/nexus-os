/**
 * Lead Follow-Up Sequence Engine
 *
 * 3 hard-coded sequence templates, each with day-offset steps.
 * The processor cron evaluates active sequences and fires emails when due.
 *
 * Exit conditions (any stops the sequence):
 *   - Lead replied (status: replied)
 *   - Demo booked (status: meeting_booked)
 *   - Converted
 *   - Disqualified / DLQ
 *   - Explicit unsubscribe
 */

import { prisma } from '@/lib/prisma'
import { Resend }  from 'resend'

const APP_URL   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://web-xi-vert-58.vercel.app'
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'NEXUS OS <noreply@resend.dev>'

// ─── Sequence step definition ─────────────────────────────────────────────────

interface SequenceStep {
  dayOffset:  number     // days after enrollment
  subject:    (name: string) => string
  html:       (name: string, email: string) => string
}

// ─── Template: Hot Lead ───────────────────────────────────────────────────────

const HOT_LEAD_STEPS: SequenceStep[] = [
  {
    dayOffset: 3,
    subject: (n) => `${n}, here's a real example of what NEXUS just built`,
    html: (n, email) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:40px 20px}
.card{background:#141414;border:1px solid #242424;border-radius:16px;padding:40px;max-width:520px;margin:0 auto}
h1{font-size:20px;font-weight:800;margin:0 0 16px;color:#fff}
.accent{color:#c8ff00}
p{font-size:14px;color:#999;line-height:1.7;margin:12px 0}
.cta{display:inline-block;background:#c8ff00;color:#000;font-weight:800;font-size:14px;padding:14px 28px;border-radius:8px;text-decoration:none;margin-top:20px}
.footer{font-size:11px;color:#444;margin-top:24px}
.footer a{color:#555}
</style></head><body><div class="card">
<h1>Here's what NEXUS built for a <span class="accent">SaaS agency</span> in 90 seconds</h1>
<p>Hey ${n},</p>
<p>One of our agency users submitted the brief: <em>"build a project management SaaS for freelancers."</em></p>
<p>NEXUS ran 22 AI agents, generated 14 React components, a working Prisma schema, Stripe integration, and deployed it live to Vercel — in under 2 minutes.</p>
<p>The live URL was shared with their client before the call ended.</p>
<p>That's what the Agency plan unlocks: unlimited runs, unlimited clients, $199/month.</p>
<a href="${APP_URL}/shell?page=pricing" class="cta">See Agency Plan →</a>
<div class="footer">NEXUS OS · <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}">Unsubscribe</a></div>
</div></body></html>`,
  },
  {
    dayOffset: 7,
    subject: (n) => `${n} — live demo in 15 min?`,
    html: (n, email) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:40px 20px}
.card{background:#141414;border:1px solid #242424;border-radius:16px;padding:40px;max-width:520px;margin:0 auto}
h1{font-size:20px;font-weight:800;margin:0 0 16px;color:#fff}
.accent{color:#c8ff00}
p{font-size:14px;color:#999;line-height:1.7;margin:12px 0}
.cta{display:inline-block;background:#c8ff00;color:#000;font-weight:800;font-size:14px;padding:14px 28px;border-radius:8px;text-decoration:none;margin-top:20px}
.cta-ghost{display:inline-block;background:transparent;color:#999;font-size:13px;padding:10px 20px;border-radius:8px;text-decoration:none;border:1px solid #2a2a2a;margin-left:8px}
.footer{font-size:11px;color:#444;margin-top:24px}
.footer a{color:#555}
</style></head><body><div class="card">
<h1>Want a live <span class="accent">15-minute walkthrough</span>?</h1>
<p>Hey ${n},</p>
<p>I can walk you through the pipeline live — you describe your client's project, I show you what NEXUS generates in real time.</p>
<p>No prep needed. Just pick a slot and we go.</p>
<a href="${APP_URL}/shell?page=pipeline" class="cta">Try it yourself →</a>
<a href="${APP_URL}/demo" class="cta-ghost">Book 15 min →</a>
<div class="footer">NEXUS OS · <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}">Unsubscribe</a></div>
</div></body></html>`,
  },
  {
    dayOffset: 14,
    subject: (n) => `One last note, ${n}`,
    html: (n, email) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:40px 20px}
.card{background:#141414;border:1px solid #242424;border-radius:16px;padding:40px;max-width:520px;margin:0 auto}
h1{font-size:20px;font-weight:800;margin:0 0 16px;color:#fff}
p{font-size:14px;color:#999;line-height:1.7;margin:12px 0}
.cta{display:inline-block;background:#c8ff00;color:#000;font-weight:800;font-size:14px;padding:14px 28px;border-radius:8px;text-decoration:none;margin-top:20px}
.footer{font-size:11px;color:#444;margin-top:24px}
.footer a{color:#555}
</style></head><body><div class="card">
<h1>Closing your file — unless you want one more look</h1>
<p>Hey ${n},</p>
<p>I won't keep pinging you. If the timing isn't right, totally understand.</p>
<p>If you ever want to see what NEXUS can do for your next client project, the free trial is always open — no card, no friction.</p>
<a href="${APP_URL}/shell?page=pipeline" class="cta">Try it free →</a>
<div class="footer">NEXUS OS · <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}">Unsubscribe</a></div>
</div></body></html>`,
  },
]

// ─── Template: Nurture ────────────────────────────────────────────────────────

const NURTURE_STEPS: SequenceStep[] = [
  {
    dayOffset: 5,
    subject: (n) => `${n}, how one agency cut delivery time by 90%`,
    html: (n, email) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:40px 20px}
.card{background:#141414;border:1px solid #242424;border-radius:16px;padding:40px;max-width:520px;margin:0 auto}
h1{font-size:20px;font-weight:800;margin:0 0 16px;color:#fff}
.accent{color:#c8ff00}
p{font-size:14px;color:#999;line-height:1.7;margin:12px 0}
.cta{display:inline-block;background:#c8ff00;color:#000;font-weight:800;font-size:14px;padding:14px 28px;border-radius:8px;text-decoration:none;margin-top:20px}
.footer{font-size:11px;color:#444;margin-top:24px}
.footer a{color:#555}
</style></head><body><div class="card">
<h1>From <span class="accent">2 weeks to 90 seconds</span></h1>
<p>Hey ${n},</p>
<p>A digital agency was quoting $4,500 and 2 weeks per SaaS MVP. Their average was 3 per month.</p>
<p>After switching to NEXUS, they quote $1,500 (higher margin), deliver in 48 hours, and handle 12 clients a month with the same team.</p>
<p>The difference is the pipeline doing the spec, the architecture, the code, and the deployment — autonomously.</p>
<a href="${APP_URL}/shell?page=pipeline" class="cta">See it live →</a>
<div class="footer">NEXUS OS · <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}">Unsubscribe</a></div>
</div></body></html>`,
  },
  {
    dayOffset: 12,
    subject: (n) => `${n} — the ROI math on NEXUS`,
    html: (n, email) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:40px 20px}
.card{background:#141414;border:1px solid #242424;border-radius:16px;padding:40px;max-width:520px;margin:0 auto}
h1{font-size:20px;font-weight:800;margin:0 0 16px;color:#fff}
.accent{color:#c8ff00}
p{font-size:14px;color:#999;line-height:1.7;margin:12px 0}
.highlight{background:#1a1a1a;border-left:3px solid #c8ff00;padding:14px 16px;margin:20px 0;border-radius:0 8px 8px 0}
.cta{display:inline-block;background:#c8ff00;color:#000;font-weight:800;font-size:14px;padding:14px 28px;border-radius:8px;text-decoration:none;margin-top:20px}
.footer{font-size:11px;color:#444;margin-top:24px}
.footer a{color:#555}
</style></head><body><div class="card">
<h1>The <span class="accent">ROI math</span> is embarrassing</h1>
<p>Hey ${n},</p>
<div class="highlight">
<p><strong style="color:#c8ff00">Agency plan: $199/month</strong></p>
<p>One extra client project billed at $1,500 = $1,301 net profit in month 1.</p>
<p>Run it for 10 clients/month = $13,000+ incremental revenue.</p>
</div>
<p>The $199 pays for itself in the first 2 hours of use.</p>
<a href="${APP_URL}/shell?page=pricing" class="cta">Get Agency — $199/mo →</a>
<div class="footer">NEXUS OS · <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}">Unsubscribe</a></div>
</div></body></html>`,
  },
  {
    dayOffset: 21,
    subject: (n) => `${n} — founder note`,
    html: (n, email) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:40px 20px}
.card{background:#141414;border:1px solid #242424;border-radius:16px;padding:40px;max-width:520px;margin:0 auto}
h1{font-size:20px;font-weight:800;margin:0 0 16px;color:#fff}
p{font-size:14px;color:#999;line-height:1.7;margin:12px 0}
.cta{display:inline-block;background:#c8ff00;color:#000;font-weight:800;font-size:14px;padding:14px 28px;border-radius:8px;text-decoration:none;margin-top:20px}
.footer{font-size:11px;color:#444;margin-top:24px}
.footer a{color:#555}
</style></head><body><div class="card">
<h1>Personal note from the founder</h1>
<p>Hey ${n},</p>
<p>I built NEXUS because I was tired of spending 80% of my agency time on boilerplate. Now I spend it on clients and strategy.</p>
<p>If you're ever curious what your agency could look like running on autonomous infrastructure, I'm always happy to talk — just reply to this email.</p>
<p>Or try the free tier — no card, just go.</p>
<a href="${APP_URL}/shell?page=pipeline" class="cta">Try free →</a>
<div class="footer">NEXUS OS · <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}">Unsubscribe</a></div>
</div></body></html>`,
  },
]

// ─── Template: Proposal Follow-Up ─────────────────────────────────────────────

const PROPOSAL_STEPS: SequenceStep[] = [
  {
    dayOffset: 3,
    subject: (n) => `${n}, did you get a chance to review the proposal?`,
    html: (n, email) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:40px 20px}
.card{background:#141414;border:1px solid #242424;border-radius:16px;padding:40px;max-width:520px;margin:0 auto}
h1{font-size:20px;font-weight:800;margin:0 0 16px;color:#fff}
p{font-size:14px;color:#999;line-height:1.7;margin:12px 0}
.cta{display:inline-block;background:#c8ff00;color:#000;font-weight:800;font-size:14px;padding:14px 28px;border-radius:8px;text-decoration:none;margin-top:20px}
.footer{font-size:11px;color:#444;margin-top:24px}
.footer a{color:#555}
</style></head><body><div class="card">
<h1>Quick check-in on the proposal</h1>
<p>Hey ${n},</p>
<p>Just wanted to check in — did you get a chance to look through the proposal I sent over?</p>
<p>Happy to jump on a quick 15-minute call to walk through any questions, or adjust scope if needed.</p>
<p>Just reply to this email and we'll sort it out.</p>
<div class="footer">NEXUS OS · <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}">Unsubscribe</a></div>
</div></body></html>`,
  },
  {
    dayOffset: 7,
    subject: (n) => `${n} — any objections I can help with?`,
    html: (n, email) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:40px 20px}
.card{background:#141414;border:1px solid #242424;border-radius:16px;padding:40px;max-width:520px;margin:0 auto}
h1{font-size:20px;font-weight:800;margin:0 0 16px;color:#fff}
p{font-size:14px;color:#999;line-height:1.7;margin:12px 0}
.footer{font-size:11px;color:#444;margin-top:24px}
.footer a{color:#555}
</style></head><body><div class="card">
<h1>Is there a blocker I can help remove?</h1>
<p>Hey ${n},</p>
<p>Usually when a proposal stalls it's one of three things: budget, timeline, or a question that hasn't been answered yet.</p>
<p>If it's any of those, just reply — I can often adjust scope or structure to make it work.</p>
<p>If the timing is off, no problem — just let me know and I'll follow up next month.</p>
<div class="footer">NEXUS OS · <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}">Unsubscribe</a></div>
</div></body></html>`,
  },
  {
    dayOffset: 14,
    subject: (n) => `${n} — last follow-up on this proposal`,
    html: (n, email) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:40px 20px}
.card{background:#141414;border:1px solid #242424;border-radius:16px;padding:40px;max-width:520px;margin:0 auto}
h1{font-size:20px;font-weight:800;margin:0 0 16px;color:#fff}
p{font-size:14px;color:#999;line-height:1.7;margin:12px 0}
.footer{font-size:11px;color:#444;margin-top:24px}
.footer a{color:#555}
</style></head><body><div class="card">
<h1>Closing this out</h1>
<p>Hey ${n},</p>
<p>I'll stop following up after this — I don't want to clutter your inbox.</p>
<p>If you want to revisit this in the future, just reply to any of my emails and I'll pick it right back up.</p>
<p>Good luck with whatever direction you choose.</p>
<div class="footer">NEXUS OS · <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}">Unsubscribe</a></div>
</div></body></html>`,
  },
]

const TEMPLATES: Record<string, SequenceStep[]> = {
  hot_lead:           HOT_LEAD_STEPS,
  nurture:            NURTURE_STEPS,
  proposal_followup:  PROPOSAL_STEPS,
}

// ─── Exit conditions ───────────────────────────────────────────────────────────

const EXIT_STATUSES = new Set(['replied', 'meeting_booked', 'converted', 'disqualified', 'dlq', 'unsubscribed'])

// ─── Enroll a lead in a sequence ──────────────────────────────────────────────

export async function enrollLeadInSequence(
  leadId: string,
  type: 'hot_lead' | 'nurture' | 'proposal_followup',
): Promise<void> {
  const steps = TEMPLATES[type]
  if (!steps || steps.length === 0) return

  const nextSendAt = new Date()
  nextSendAt.setDate(nextSendAt.getDate() + steps[0].dayOffset)

  await prisma.leadSequence.upsert({
    where:  { leadId_type: { leadId, type } },
    create: { leadId, type, status: 'active', currentStep: 0, nextSendAt },
    update: { status: 'active', currentStep: 0, nextSendAt, pausedAt: null, cancelReason: null },
  })

  await prisma.leadActivity.create({
    data: { leadId, type: 'sequence_enrolled', actor: 'system', subject: type },
  })
}

// ─── Cancel / pause a sequence ────────────────────────────────────────────────

export async function exitLeadSequences(leadId: string, reason: string): Promise<void> {
  await prisma.leadSequence.updateMany({
    where:  { leadId, status: 'active' },
    data:   { status: 'cancelled', cancelReason: reason },
  })
  await prisma.leadActivity.create({
    data: { leadId, type: 'sequence_exited', actor: 'system', subject: reason },
  })
}

// ─── Write a lead activity ─────────────────────────────────────────────────────

export async function writeActivity(
  leadId: string,
  type: string,
  opts: { actor?: string; channel?: string; subject?: string; body?: string; meta?: Record<string, unknown> } = {},
): Promise<void> {
  await prisma.leadActivity.create({
    data: { leadId, type, actor: opts.actor ?? 'system', channel: opts.channel, subject: opts.subject, body: opts.body, meta: opts.meta as never },
  })
}

// ─── Process due sequence steps (called by cron) ──────────────────────────────

export async function processDueSequenceSteps(): Promise<{ processed: number; sent: number; errors: string[] }> {
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  const errors: string[] = []
  let processed = 0
  let sent = 0

  const due = await prisma.leadSequence.findMany({
    where: {
      status:    'active',
      nextSendAt: { lte: new Date() },
    },
    include: { lead: { select: { id: true, email: true, name: true, status: true } } },
    take: 50,
  })

  for (const seq of due) {
    processed++
    const { lead } = seq

    // Exit if lead is in a terminal state
    if (EXIT_STATUSES.has(lead.status)) {
      await exitLeadSequences(lead.id, `lead_status_${lead.status}`)
      continue
    }

    const steps = TEMPLATES[seq.type]
    if (!steps) continue

    const stepIdx = seq.currentStep
    const step = steps[stepIdx]
    if (!step) {
      // No more steps — sequence complete
      await prisma.leadSequence.update({
        where: { id: seq.id },
        data:  { status: 'completed' },
      })
      continue
    }

    const firstName = (lead.name || lead.email.split('@')[0]).split(' ')[0]

    if (resend) {
      try {
        await resend.emails.send({
          from:    FROM_EMAIL,
          to:      lead.email,
          subject: step.subject(firstName),
          html:    step.html(firstName, lead.email),
        })
        sent++

        await writeActivity(lead.id, 'email_sent', {
          channel: 'email',
          subject: step.subject(firstName),
          meta:    { sequenceType: seq.type, stepIndex: stepIdx },
        })
      } catch (err) {
        errors.push(`${lead.email}: ${(err as Error).message?.slice(0, 80)}`)
      }
    }

    // Advance to next step or mark complete
    const nextIdx = stepIdx + 1
    const nextStep = steps[nextIdx]
    if (nextStep) {
      const nextSendAt = new Date()
      nextSendAt.setDate(nextSendAt.getDate() + (nextStep.dayOffset - step.dayOffset))
      await prisma.leadSequence.update({
        where: { id: seq.id },
        data:  { currentStep: nextIdx, nextSendAt },
      })
    } else {
      await prisma.leadSequence.update({
        where: { id: seq.id },
        data:  { status: 'completed', nextSendAt: null },
      })
      await prisma.leadActivity.create({
        data: { leadId: lead.id, type: 'sequence_exited', actor: 'system', subject: 'completed' },
      })
    }
  }

  return { processed, sent, errors }
}
