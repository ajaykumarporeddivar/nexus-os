import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { Resend } from 'resend'
import type { ClientBrief } from '../stream/route'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { brief, outputs }: {
    brief:   ClientBrief
    outputs: Record<string, string>
  } = await req.json()

  if (!brief?.clientEmail) {
    return NextResponse.json({ error: 'Client email required' }, { status: 400 })
  }

  const senderName  = session.user?.name  ?? 'Your Consultant'
  const senderEmail = process.env.EMAIL_FROM ?? 'noreply@nexus-os.ai'

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d0d12; color: #e2e8f0; margin: 0; padding: 0; }
  .wrapper { max-width: 680px; margin: 0 auto; padding: 40px 24px; }
  .header { border-bottom: 1px solid #1e2433; padding-bottom: 24px; margin-bottom: 32px; }
  .logo { font-size: 11px; font-family: monospace; color: #6366f1; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 8px; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin: 0 0 8px; }
  .subtitle { font-size: 14px; color: #94a3b8; margin: 0; }
  .section { background: #131825; border: 1px solid #1e2433; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
  .section-label { font-size: 10px; font-family: monospace; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 12px; }
  .section-content { font-size: 13px; color: #cbd5e1; line-height: 1.7; white-space: pre-wrap; }
  .highlight { background: #1a1f2e; border-left: 3px solid #6366f1; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
  .footer { margin-top: 40px; padding-top: 24px; border-top: 1px solid #1e2433; font-size: 12px; color: #64748b; }
  .badge { display: inline-block; background: #6366f1/10; border: 1px solid #6366f140; color: #818cf8; font-size: 10px; font-family: monospace; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.1em; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="logo">NEXUS OS — AI Delivery</div>
    <h1>Project Proposal &amp; Spec</h1>
    <p class="subtitle">Prepared for ${brief.clientName} at ${brief.clientCompany}</p>
  </div>

  ${outputs.proposal ? `
  <div class="section">
    <div class="section-label">📄 Client Proposal</div>
    <div class="section-content">${outputs.proposal.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
  </div>` : ''}

  ${outputs.architect ? `
  <div class="section">
    <div class="section-label">🏗️ System Architecture</div>
    <div class="section-content">${outputs.architect.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
  </div>` : ''}

  ${outputs.planner ? `
  <div class="section">
    <div class="section-label">📋 Feature Specifications</div>
    <div class="section-content">${outputs.planner.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
  </div>` : ''}

  ${outputs.qa ? `
  <div class="section">
    <div class="section-label">🔐 QA &amp; Delivery Review</div>
    <div class="section-content">${outputs.qa.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
  </div>` : ''}

  <div class="highlight">
    <div style="font-size:11px;color:#6366f1;font-family:monospace;margin-bottom:6px;">BUILT WITH NEXUS OS AI DELIVERY</div>
    <div style="font-size:12px;color:#94a3b8;">This specification was generated using 6 AI agents running in sequence — territory mapping, assumption analysis, system design, feature planning, QA scoring, and proposal writing. Total build time: ~3 minutes.</div>
  </div>

  <div class="footer">
    <p>Sent by ${senderName} via NEXUS OS AI Delivery Infrastructure</p>
    <p>To discuss this proposal, reply directly to this email.</p>
  </div>
</div>
</body>
</html>`

  try {
    const { data, error } = await resend.emails.send({
      from:      `NEXUS OS <${senderEmail}>`,
      replyTo:   session.user?.email ? [session.user.email] : undefined,
      to:        [brief.clientEmail],
      subject:   `Project Proposal — ${brief.clientCompany}`,
      html,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Also notify the sender
    await resend.emails.send({
      from:    `NEXUS OS <${senderEmail}>`,
      to:      [session.user?.email ?? senderEmail],
      subject: `Proposal sent to ${brief.clientName} (${brief.clientCompany})`,
      html: `<p style="font-family:sans-serif;color:#1e293b;">Your proposal for <strong>${brief.clientCompany}</strong> has been sent to <strong>${brief.clientEmail}</strong>.</p><p style="font-family:sans-serif;color:#64748b;font-size:13px;">Client: ${brief.clientName} · Project: ${brief.problem.slice(0, 80)}</p>`,
    }).catch(() => {/* non-critical */})

    return NextResponse.json({ ok: true, emailId: data?.id })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
