/**
 * Lead Outreach Engine — SME-4 / SME-9 / SME-11
 *
 * Handles:
 *   1. Internal founder alert on hot lead (score ≥ 70) with discovery call context
 *   2. WhatsApp alert to founder via WATI (if WATI_API_KEY + WATI_PHONE set)
 *   3. Slack webhook ping (if SLACK_WEBHOOK_URL set)
 *   4. Personalised outreach email to the lead (consent required)
 *   5. Nurture email for score 40–69 with scarcity touch
 */

import { Resend } from 'resend'
import { brand, appUrl } from './brand'
import type { ScoreRationaleItem } from './leadScoring'
import { enrollLeadInSequence, writeActivity } from './leadSequence'

const FROM           = () => process.env.EMAIL_FROM          ?? `${brand.name} <noreply@${brand.domain}>`
const FOUNDER_EMAIL  = () => process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'
const CALENDLY_URL   = () => process.env.CALENDLY_URL          ?? 'https://calendly.com/nexus-os/demo'
const WATI_API_KEY   = () => process.env.WATI_API_KEY          ?? ''
const WATI_PHONE     = () => process.env.WATI_PHONE            ?? '' // your WhatsApp number without +
const WATI_API_URL   = () => process.env.WATI_API_URL          ?? 'https://live-server.wati.io'

function getResend(): Resend | null {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
}

export interface LeadOutreachPayload {
  leadId:          string
  email:           string
  name:            string | null
  company:         string | null
  role:            string | null
  icpScore:        number
  routingDecision: string
  rationale:       ScoreRationaleItem[]
  source:          string | null
  platform?:       string | null
  messageText?:    string | null
  consentCaptured: boolean
  pipelineRunId:   string | null
  firmographic?:   Record<string, unknown> | null
}

// ── Platform display labels ───────────────────────────────────────────────────
const PLATFORM_LABEL: Record<string, string> = {
  upwork:    'Upwork',
  linkedin:  'LinkedIn',
  instagram: 'Instagram DM',
  whatsapp:  'WhatsApp',
  direct:    'Direct / organic',
}

// ── Discovery call context block (pre-fill from enrichment) ──────────────────
function buildDiscoveryContext(payload: LeadOutreachPayload): string {
  const firmo    = payload.firmographic ?? {}
  const industry = (firmo.industry as string | null) ?? null
  const size     = (firmo.companySize as number | null) ?? null
  const location = (firmo.location as string | null) ?? null

  const lines: string[] = [
    `<b>Lead context for your 15-min discovery call:</b>`,
    `<br><b>Pain probe:</b> "How quickly do you currently ${industry?.includes('real') ? 'reply to property enquiries' : 'follow up with inbound leads'}?"`,
    `<br><b>Loss question:</b> "How many ${industry?.includes('consult') ? 'consultations' : 'leads'} per week do you think slip through without a response?"`,
    `<br><b>Demo trigger:</b> Show them the 90-second Loom of the system running — their exact use-case.`,
    `<br><b>Close script:</b> "Based on what you've told me, the Growth plan covers exactly this. I can start this week — 50% now, 50% on delivery. Want to go ahead?"`,
  ]

  if (size)     lines.push(`<br><b>Company size:</b> ~${size} employees`)
  if (location) lines.push(`<br><b>Location:</b> ${location}`)
  if (industry) lines.push(`<br><b>Industry signal:</b> ${industry}`)
  if (payload.messageText) {
    lines.push(`<br><b>Their message:</b> <i>"${payload.messageText.slice(0, 200)}${payload.messageText.length > 200 ? '…' : ''}"</i>`)
  }

  return lines.join('')
}

// ── 1. Founder hot-lead alert ─────────────────────────────────────────────────
export async function sendHotLeadAlert(payload: LeadOutreachPayload): Promise<void> {
  const r = getResend()
  if (!r) return

  const rationaleHtml = payload.rationale.map(f =>
    `<tr>
      <td style="padding:4px 8px;color:${f.direction === 'positive' ? '#4ade80' : '#f87171'}">${f.direction === 'positive' ? '▲' : '▼'}</td>
      <td style="padding:4px 8px;color:#e5e5e5">${f.factor ?? f.dimension}</td>
      <td style="padding:4px 8px;color:#888;text-align:right">${Math.round(f.weight * 100)}%</td>
    </tr>`
  ).join('')

  const scoreColor      = payload.icpScore >= 80 ? '#4ade80' : '#facc15'
  const platformLabel   = PLATFORM_LABEL[payload.platform?.toLowerCase() ?? ''] ?? payload.platform ?? 'Direct'
  const discoveryBlock  = buildDiscoveryContext(payload)

  await r.emails.send({
    from:    FROM(),
    to:      FOUNDER_EMAIL(),
    subject: `🔥 Hot lead — ${payload.name ?? payload.email} · ${payload.icpScore}/100 · ${platformLabel}`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:32px 16px}
  .card{background:#111;border:1px solid #222;border-radius:12px;padding:28px;max-width:520px;margin:0 auto}
  h1{font-size:20px;font-weight:700;margin:0 0 4px}
  .score{font-size:36px;font-weight:800;color:${scoreColor}}
  .meta{font-size:13px;color:#888;margin:4px 0}
  table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
  .btn{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:11px 22px;border-radius:8px;text-decoration:none;margin:8px 8px 0 0}
  .btn-outline{display:inline-block;background:transparent;color:#c8ff00;border:1px solid #c8ff00;font-weight:700;font-size:13px;padding:10px 20px;border-radius:8px;text-decoration:none;margin:8px 0 0 0}
  .tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:#c8ff0020;color:#c8ff00;border:1px solid #c8ff0040}
  .call-box{background:#0d1a00;border:1px solid #4ade8040;border-radius:8px;padding:14px;margin:16px 0;font-size:13px;color:#aaa;line-height:1.7}
</style></head>
<body><div class="card">
  <div style="font-size:11px;color:#555;margin-bottom:16px;letter-spacing:.1em">${brand.name} · LEAD INTELLIGENCE · ${platformLabel}</div>
  <h1>Hot Lead Routed</h1>
  <div class="score">${payload.icpScore}/100</div>
  <div class="meta"><strong style="color:#fff">${payload.name ?? 'Unknown'}</strong> · ${payload.email}</div>
  ${payload.company ? `<div class="meta">${payload.company}${payload.role ? ` · ${payload.role}` : ''}</div>` : ''}
  <div class="meta" style="margin-top:8px">Source: <span style="color:#c8ff00">${payload.source ?? 'direct'}</span> · Platform: <span style="color:#c8ff00">${platformLabel}</span> · Routing: <span style="color:#4ade80">${payload.routingDecision}</span></div>
  ${payload.pipelineRunId ? `<div class="meta">Pipeline run: <code style="color:#888">${payload.pipelineRunId}</code></div>` : ''}

  <div style="font-size:11px;color:#555;margin-top:20px;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em">Score Rationale</div>
  <table>${rationaleHtml}</table>

  <div class="call-box">${discoveryBlock}</div>

  <a href="${CALENDLY_URL()}" class="btn">Book Discovery Call →</a>
  <a href="${appUrl}/shell/leads" class="btn-outline">View Lead Dashboard →</a>
  <div style="font-size:11px;color:#444;margin-top:20px">${brand.name} · Lead Intelligence · ${new Date().toISOString()}</div>
</div></body></html>`,
  })

  // G17: Slack webhook ping
  const slackUrl = process.env.SLACK_WEBHOOK_URL
  if (slackUrl) {
    const rationaleText = payload.rationale.slice(0, 3).map(r => `• ${r.factor ?? r.dimension}: ${r.direction}`).join('\n')
    await fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🔥 *Hot Lead* — ${payload.icpScore}/100`,
        blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🔥 Hot Lead Routed — ${payload.icpScore}/100*\n*${payload.name ?? 'Unknown'}* · ${payload.email}\n${payload.company ? `${payload.company}${payload.role ? ` · ${payload.role}` : ''}` : ''}\nPlatform: \`${platformLabel}\` · Routing: \`${payload.routingDecision}\`\n\n*Rationale:*\n${rationaleText}\n\n<${appUrl}/shell/leads|View Lead Dashboard →>  <${CALENDLY_URL()}|Book call →>`,
          },
        }],
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(e => console.error('[outreach] Slack ping failed:', e))
  }

  // WhatsApp alert via WATI
  await sendWatiAlert(payload)
}

// ── 2. WATI WhatsApp alert to founder ────────────────────────────────────────
async function sendWatiAlert(payload: LeadOutreachPayload): Promise<void> {
  const apiKey = WATI_API_KEY()
  const phone  = WATI_PHONE()
  if (!apiKey || !phone) return

  const msg = [
    `🔥 *Hot Lead — ${payload.icpScore}/100*`,
    `*Name:* ${payload.name ?? 'Unknown'}`,
    `*Email:* ${payload.email}`,
    payload.company ? `*Company:* ${payload.company}` : '',
    `*Platform:* ${PLATFORM_LABEL[payload.platform?.toLowerCase() ?? ''] ?? 'Direct'}`,
    `*Routing:* ${payload.routingDecision}`,
    payload.messageText ? `\n*Message:* "${payload.messageText.slice(0, 150)}…"` : '',
    `\nBook demo: ${CALENDLY_URL()}`,
    `Dashboard: ${appUrl}/shell/leads`,
  ].filter(Boolean).join('\n')

  try {
    await fetch(`${WATI_API_URL()}/api/v1/sendSessionMessage/${phone}`, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageText: msg }),
      signal: AbortSignal.timeout(6000),
    })
  } catch (e) {
    console.error('[outreach] WATI WhatsApp alert failed:', e)
  }
}

// ── 3. Personalised lead outreach email (consent required) ───────────────────
export async function sendLeadOutreachEmail(payload: LeadOutreachPayload): Promise<void> {
  if (!payload.consentCaptured) {
    console.warn(`[consent_gate] BLOCK: outreach to ${payload.email} blocked — consent not captured`)
    return
  }
  if (payload.icpScore < 70) return

  const r = getResend()
  if (!r) return

  const { prisma } = await import('./prisma')
  const firstName    = payload.name?.split(' ')[0] ?? 'there'
  const companyCtx   = payload.company ? ` at ${payload.company}` : ''
  const platform     = payload.platform?.toLowerCase() ?? ''

  // Platform-specific subject and opener
  const subjects: Record<string, string> = {
    upwork:    `${firstName}, your Upwork enquiry — let's talk`,
    linkedin:  `${firstName}, saw your LinkedIn message — quick question`,
    instagram: `${firstName}, re: your Instagram DM`,
    whatsapp:  `${firstName}, following up on your WhatsApp message`,
  }
  const openers: Record<string, string> = {
    upwork:    `I saw you reached out on Upwork${companyCtx}. In 15 minutes, our 23 AI agents can produce a full project spec, architecture, and GTM playbook.`,
    linkedin:  `Thanks for connecting on LinkedIn${companyCtx}. One thing I hear from teams like yours: specs and architecture take weeks. We cut that to 15 minutes.`,
    instagram: `Hey ${firstName} — glad you reached out${companyCtx}. I'll keep this short: 15 minutes, 23 AI agents, full product spec + GTM playbook.`,
    whatsapp:  `Hi ${firstName} — saw your WhatsApp message${companyCtx}. Here's the short version: 15 minutes with NEXUS OS = full product spec, architecture, and GTM playbook.`,
  }

  const subject = subjects[platform] ?? `${firstName}, your ${brand.name} pipeline results are ready`
  const opener  = openers[platform]  ?? `I noticed you${companyCtx} ran a pipeline on ${brand.name}. In 15 minutes, 23 AI agents produced a full project spec, architecture, security audit, and GTM playbook.`

  await r.emails.send({
    from:    FROM(),
    to:      payload.email,
    subject,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;margin:0;padding:40px 20px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
  .logo{font-size:11px;letter-spacing:.15em;color:#888;margin-bottom:24px}
  h1{font-size:20px;font-weight:700;margin:0 0 8px}
  .accent{color:#c8ff00}
  p{font-size:14px;color:#aaa;line-height:1.6;margin:8px 0}
  .box{background:#111;border-radius:8px;padding:16px;margin:20px 0}
  .cta{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:20px}
  .footer{font-size:11px;color:#555;margin-top:28px}
</style></head>
<body><div class="card">
  <div class="logo">${brand.name}</div>
  <h1>Hi ${firstName} — let's build something <span class="accent">remarkable</span></h1>
  <p>${opener}</p>
  <div class="box">
    <p style="color:#888;font-size:12px;margin:0 0 8px">What teams like yours use it for:</p>
    <p style="color:#e5e5e5;margin:4px 0;font-size:13px">→ Validate new product ideas in an afternoon, not a week</p>
    <p style="color:#e5e5e5;margin:4px 0;font-size:13px">→ Generate client-ready specs and architecture docs instantly</p>
    <p style="color:#e5e5e5;margin:4px 0;font-size:13px">→ Ship GTM playbooks before your next standup</p>
  </div>
  <p>I have 2 demo slots open this week. 15 minutes — I'll walk you through a live run for your exact use-case.</p>
  <a href="${CALENDLY_URL()}" class="cta">Book a 15-min demo →</a>
  <div class="footer">
    ${brand.name} · Built by Ajay<br>
    <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(payload.email)}" style="color:#444">Unsubscribe</a>
  </div>
</div></body></html>`,
  })

  await prisma.lead.updateMany({
    where: { id: payload.leadId, status: { notIn: ['converted', 'disqualified'] } },
    data:  { status: 'in_outreach' as never, touchCount: { increment: 1 }, lastTouchAt: new Date() },
  }).catch(e => console.error('[outreach] status update failed:', e))
}

// ── 4. Nurture email for score 40–69 ─────────────────────────────────────────
export async function sendNurtureEmail(payload: LeadOutreachPayload): Promise<void> {
  if (!payload.consentCaptured) return
  if (payload.icpScore < 40 || payload.icpScore >= 70) return

  const r = getResend()
  if (!r) return

  const { prisma } = await import('./prisma')
  const firstName  = payload.name?.split(' ')[0] ?? 'there'
  const touch      = (payload as LeadOutreachPayload & { touchCount?: number }).touchCount ?? 0
  const isScarcity = touch >= 2 // Day 9 touch onwards → add scarcity

  const subject = isScarcity
    ? `${firstName}, 1 slot left at the early-access rate — this week only`
    : `${firstName}, here's what ${brand.name} can build for you`

  const body = isScarcity
    ? `<p>I have one remaining early-access slot at the <strong style="color:#c8ff00">founder rate</strong> before we move to standard pricing. It's reserved for teams who can start this week.</p>
       <p>15 minutes, live demo, your exact use-case. If it's not a fit, I'll tell you straight.</p>`
    : `<p>You signed up but haven't run a pipeline yet. In 15 minutes our 23-agent system produces a full product spec, architecture, security audit, and GTM playbook for any idea.</p>
       <p>No prompt engineering needed — just describe what you want to build.</p>`

  await r.emails.send({
    from:    FROM(),
    to:      payload.email,
    subject,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;margin:0;padding:40px 20px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
  .logo{font-size:11px;letter-spacing:.15em;color:#888;margin-bottom:24px}
  h1{font-size:18px;font-weight:700;margin:0 0 8px}
  p{font-size:14px;color:#aaa;line-height:1.6;margin:8px 0}
  .cta{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:20px}
  .footer{font-size:11px;color:#555;margin-top:28px}
</style></head>
<body><div class="card">
  <div class="logo">${brand.name}</div>
  <h1>Hi ${firstName}${isScarcity ? ' — last slot this week' : ' — still exploring?'}</h1>
  ${body}
  <a href="${CALENDLY_URL()}" class="cta">${isScarcity ? 'Claim your slot →' : 'Try it free →'}</a>
  <div class="footer">
    ${brand.name}<br>
    <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(payload.email)}" style="color:#444">Unsubscribe</a>
  </div>
</div></body></html>`,
  }).catch(e => console.error('[outreach] nurture email failed:', e))

  await prisma.lead.updateMany({
    where: { id: payload.leadId, status: { notIn: ['converted', 'disqualified', 'in_outreach'] } },
    data:  { status: 'in_outreach' as never, touchCount: { increment: 1 }, lastTouchAt: new Date() },
  }).catch(e => console.error('[outreach] nurture status update failed:', e))
}

// ── 5. Orchestrate all outreach for a freshly-routed hot lead ─────────────────
export async function triggerHotLeadOutreach(payload: LeadOutreachPayload): Promise<void> {
  const tasks = [
    sendHotLeadAlert(payload).catch(e => console.error('[outreach] founder alert failed:', e)),
  ]
  if (payload.consentCaptured) {
    tasks.push(
      sendLeadOutreachEmail(payload).catch(e => console.error('[outreach] lead email failed:', e))
    )
  }
  await Promise.all(tasks)

  // Enroll in follow-up sequence after first-touch
  const seqType = payload.icpScore >= 70 ? 'hot_lead' : 'nurture'
  enrollLeadInSequence(payload.leadId, seqType).catch(e =>
    console.error('[outreach] sequence enroll failed:', e)
  )

  writeActivity(payload.leadId, 'email_sent', {
    channel: 'email',
    subject: 'first_touch',
    meta:    { icpScore: payload.icpScore, routingDecision: payload.routingDecision },
  }).catch(() => undefined)
}
