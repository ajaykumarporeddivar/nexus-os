/**
 * Lead Outreach Engine — SME-4 / SME-9 / SME-11
 *
 * Handles:
 *   1. Internal founder alert on hot lead (score ≥ 70)
 *   2. Personalised outreach email to the lead (consent required)
 *   3. Consent gate enforcement (SME-11)
 */

import { Resend } from 'resend'
import { brand, appUrl } from './brand'
import type { ScoreRationaleItem } from './leadScoring'

const FROM = () => process.env.EMAIL_FROM ?? `${brand.name} <noreply@${brand.domain}>`
const FOUNDER_EMAIL = () => process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'

function getResend(): Resend | null {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
}

export interface LeadOutreachPayload {
  leadId:         string
  email:          string
  name:           string | null
  company:        string | null
  role:           string | null
  icpScore:       number
  routingDecision: string
  rationale:      ScoreRationaleItem[]
  source:         string | null
  consentCaptured: boolean
  pipelineRunId:  string | null
}

// ── 1. Founder hot-lead alert ──────────────────────────────────────────────────
export async function sendHotLeadAlert(payload: LeadOutreachPayload): Promise<void> {
  const r = getResend()
  if (!r) return

  const rationaleHtml = payload.rationale.map(f =>
    `<tr>
      <td style="padding:4px 8px;color:${f.direction === 'positive' ? '#4ade80' : '#f87171'}">${f.direction === 'positive' ? '▲' : '▼'}</td>
      <td style="padding:4px 8px;color:#e5e5e5">${f.factor}</td>
      <td style="padding:4px 8px;color:#888;text-align:right">${Math.round(f.weight * 100)}%</td>
    </tr>`
  ).join('')

  const scoreColor = payload.icpScore >= 80 ? '#4ade80' : '#facc15'

  await r.emails.send({
    from:    FROM(),
    to:      FOUNDER_EMAIL(),
    subject: `🔥 Hot lead — ${payload.name ?? payload.email} · ${payload.icpScore}/100`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:32px 16px}
  .card{background:#111;border:1px solid #222;border-radius:12px;padding:28px;max-width:500px;margin:0 auto}
  h1{font-size:20px;font-weight:700;margin:0 0 4px}
  .score{font-size:36px;font-weight:800;color:${scoreColor}}
  .meta{font-size:13px;color:#888;margin:4px 0}
  table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
  .btn{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:11px 22px;border-radius:8px;text-decoration:none;margin-top:16px}
  .tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:#c8ff0020;color:#c8ff00;border:1px solid #c8ff0040}
</style></head>
<body><div class="card">
  <div style="font-size:11px;color:#555;margin-bottom:16px;letter-spacing:.1em">${brand.name} · LEAD INTELLIGENCE</div>
  <h1>Hot Lead Routed</h1>
  <div class="score">${payload.icpScore}/100</div>
  <div class="meta"><strong style="color:#fff">${payload.name ?? 'Unknown'}</strong> · ${payload.email}</div>
  ${payload.company ? `<div class="meta">${payload.company}${payload.role ? ` · ${payload.role}` : ''}</div>` : ''}
  <div class="meta" style="margin-top:8px">Source: <span style="color:#c8ff00">${payload.source ?? 'direct'}</span> · Routing: <span style="color:#4ade80">${payload.routingDecision}</span></div>
  ${payload.pipelineRunId ? `<div class="meta">Pipeline run: <code style="color:#888">${payload.pipelineRunId}</code></div>` : ''}

  <div style="font-size:11px;color:#555;margin-top:20px;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em">Score Rationale</div>
  <table>${rationaleHtml}</table>

  <a href="${appUrl}/shell/leads" class="btn">View in Lead Dashboard →</a>
  <div style="font-size:11px;color:#444;margin-top:20px">${brand.name} · Lead Intelligence · ${new Date().toISOString()}</div>
</div></body></html>`,
  })

  // G17: Slack webhook ping (optional — set SLACK_WEBHOOK_URL env var)
  const slackUrl = process.env.SLACK_WEBHOOK_URL
  if (slackUrl) {
    const rationaleText = payload.rationale.slice(0, 3)
      .map(r => `• ${r.factor}: ${r.direction}`)
      .join('\n')
    await fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🔥 *Hot Lead* — ${payload.icpScore}/100`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*🔥 Hot Lead Routed — ${payload.icpScore}/100*\n*${payload.name ?? 'Unknown'}* · ${payload.email}\n${payload.company ? `${payload.company}${payload.role ? ` · ${payload.role}` : ''}` : ''}\nSource: \`${payload.source ?? 'direct'}\` · Routing: \`${payload.routingDecision}\`\n\n*Rationale:*\n${rationaleText}\n\n<${appUrl}/shell/leads|View Lead Dashboard →>`,
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(e => console.error('[outreach] Slack ping failed:', e))
  }
}

// ── 2. Personalised lead outreach email (consent required — SME-11) ───────────
export async function sendLeadOutreachEmail(payload: LeadOutreachPayload): Promise<void> {
  // SME-11 consent_gate enforcement
  if (!payload.consentCaptured) {
    console.warn(`[consent_gate] BLOCK: outreach to ${payload.email} blocked — consent not captured`)
    return
  }
  // Only reach out to hot leads
  if (payload.icpScore < 70) return

  const r = getResend()
  if (!r) return

  const { prisma } = await import('./prisma')

  const firstName = payload.name?.split(' ')[0] ?? 'there'
  const companyContext = payload.company ? ` at ${payload.company}` : ''

  await r.emails.send({
    from:    FROM(),
    to:      payload.email,
    subject: `${firstName}, your ${brand.name} pipeline results are ready`,
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
  <p>I noticed you${companyContext} ran a pipeline on ${brand.name}. In 15 minutes, 23 AI agents produced a full project spec, architecture, security audit, and GTM playbook.</p>
  <div class="box">
    <p style="color:#888;font-size:12px;margin:0 0 8px">What teams like yours use it for:</p>
    <p style="color:#e5e5e5;margin:4px 0;font-size:13px">→ Validate new product ideas in an afternoon, not a week</p>
    <p style="color:#e5e5e5;margin:4px 0;font-size:13px">→ Generate client-ready specs and architecture docs instantly</p>
    <p style="color:#e5e5e5;margin:4px 0;font-size:13px">→ Ship GTM playbooks before your next standup</p>
  </div>
  <p>Want to see what it can do for your next project? I'll personally walk you through a run.</p>
  <a href="mailto:${FOUNDER_EMAIL()}?subject=NEXUS OS demo — ${encodeURIComponent(payload.email)}" class="cta">Book a 20-min demo →</a>
  <div class="footer">
    ${brand.name} · Built by Ajay<br>
    <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(payload.email)}" style="color:#444">Unsubscribe</a>
  </div>
</div></body></html>`,
  })

  await prisma.lead.updateMany({
    where: { id: payload.leadId, status: { notIn: ['converted', 'disqualified'] } },
    data:  { status: 'in_outreach' as never },
  }).catch(e => console.error('[outreach] status update failed:', e))
}

// ── 3. Nurture email for score 40–69 leads (N4 fix) ──────────────────────────
export async function sendNurtureEmail(payload: LeadOutreachPayload): Promise<void> {
  if (!payload.consentCaptured) return
  if (payload.icpScore < 40 || payload.icpScore >= 70) return  // only nurture band

  const r = getResend()
  if (!r) return

  const firstName = payload.name?.split(' ')[0] ?? 'there'

  const { prisma } = await import('./prisma')

  await r.emails.send({
    from:    FROM(),
    to:      payload.email,
    subject: `${firstName}, here's what ${brand.name} can build for you`,
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
  <h1>Hi ${firstName} — still exploring ${brand.name}?</h1>
  <p>You signed up but haven't run a pipeline yet. In 15 minutes our 23-agent system can produce a full product spec, architecture, security audit, and GTM playbook for any idea.</p>
  <p>No prompt engineering needed — just describe what you want to build.</p>
  <a href="${appUrl}/shell?page=pipeline" class="cta">Try it free →</a>
  <div class="footer">
    ${brand.name}<br>
    <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(payload.email)}" style="color:#444">Unsubscribe</a>
  </div>
</div></body></html>`,
  }).catch(e => console.error('[outreach] nurture email failed:', e))

  // L4 FIX: mark lead as in_outreach after nurture email is sent
  await prisma.lead.updateMany({
    where: { id: payload.leadId, status: { notIn: ['converted', 'disqualified', 'in_outreach'] } },
    data:  { status: 'in_outreach' as never },
  }).catch(e => console.error('[outreach] nurture status update failed:', e))
}

// ── 4. Orchestrate all outreach for a freshly-routed hot lead ─────────────────
export async function triggerHotLeadOutreach(payload: LeadOutreachPayload): Promise<void> {
  const tasks = [
    sendHotLeadAlert(payload).catch(e => console.error('[outreach] founder alert failed:', e)),
  ]
  // G9 fix: send to ALL hot leads with consent (not just pipeline_complete)
  // Consent is the only gate — score ≥ 70 + consentCaptured = always outreach
  if (payload.consentCaptured) {
    tasks.push(
      sendLeadOutreachEmail(payload).catch(e => console.error('[outreach] lead email failed:', e))
    )
  }
  await Promise.all(tasks)
}
