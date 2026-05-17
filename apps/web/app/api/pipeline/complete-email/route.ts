import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { Resend } from 'resend'
import { brand, appUrl } from '@/lib/brand'

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  return key ? new Resend(key) : null
}

function from(): string {
  return process.env.EMAIL_FROM ?? `${brand.name} <noreply@${brand.domain}>`
}

function pipelineCompleteHtml(opts: {
  name:        string
  projectName: string
  brief:       string
  score:       number | null
  liveUrl:     string
  deployReady: boolean
  specRepoUrl: string
  appRepoUrl:  string
  shareSlug?:  string | null
  refCode?:    string | null
}): string {
  const scoreStr   = opts.score !== null ? opts.score.toFixed(1) : '—'
  const scoreColor = opts.score !== null && opts.score >= 8 ? '#22c55e' : opts.score !== null && opts.score >= 7 ? '#c8ff00' : '#f59e0b'
  const hasLive    = opts.deployReady && !!opts.liveUrl
  const hasRepo    = !!opts.appRepoUrl
  const shareUrl   = opts.shareSlug ? `${appUrl}/s/${opts.shareSlug}` : null
  const refUrl     = opts.refCode   ? `${appUrl}?ref=${opts.refCode}` : null

  const headline = hasLive
    ? `<h1><span class="accent">${opts.projectName}</span> is live</h1>`
    : `<h1><span class="accent">${opts.projectName}</span> deployment submitted</h1>`
  const intro = hasLive
    ? `<p>Hi ${opts.name} — your One-Click Pipeline just completed. 23 AI agents took your brief to a live app.</p>`
    : `<p>Hi ${opts.name} — generation completed and deployment was submitted. Public readiness is still being verified.</p>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;margin:0;padding:40px 20px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
  .logo{font-size:11px;letter-spacing:.15em;color:#888;margin-bottom:24px;text-transform:uppercase}
  h1{font-size:22px;font-weight:700;margin:0 0 8px;color:#fff}
  .accent{color:#c8ff00}
  p{font-size:14px;color:#aaa;line-height:1.6;margin:8px 0}
  .score-chip{display:inline-block;padding:4px 12px;border-radius:6px;font-size:13px;font-weight:800;font-family:monospace;border:1px solid;margin-bottom:20px}
  .box{background:#111;border-radius:8px;padding:16px;margin:16px 0;font-size:13px}
  .box-label{color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
  .box-val{color:#e5e5e5;word-break:break-all}
  .cta{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:8px}
  .cta-secondary{display:inline-block;background:#222;color:#aaa;font-weight:600;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:8px;border:1px solid #333}
  .share-row{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
  .share-btn{display:inline-block;padding:10px 20px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;border:1px solid #333;color:#aaa;background:#181818}
  .ref-box{background:#0f1a00;border:1px solid #c8ff0030;border-radius:8px;padding:16px;margin-top:16px}
  .ref-label{color:#c8ff0080;font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}
  .ref-val{color:#c8ff00;font-family:monospace;font-size:13px;word-break:break-all}
  .footer{font-size:11px;color:#555;margin-top:28px;border-top:1px solid #222;padding-top:16px}
</style></head>
<body><div class="card">
  <div class="logo">${brand.name} · ${hasLive ? 'Pipeline Complete' : 'Deployment Submitted'}</div>
  ${headline}
  ${intro}

  <div class="score-chip" style="color:${scoreColor};border-color:${scoreColor}40;background:${scoreColor}15">
    QA Score: ${scoreStr}/10
  </div>

  <div class="box">
    <div class="box-label">Brief</div>
    <div class="box-val">${opts.brief.slice(0, 200).replace(/</g, '&lt;').replace(/>/g, '&gt;')}${opts.brief.length > 200 ? '…' : ''}</div>
  </div>

  ${hasLive ? `
  <div class="box">
    <div class="box-label">Live App</div>
    <div class="box-val"><a href="${opts.liveUrl}" style="color:#c8ff00">${opts.liveUrl}</a></div>
  </div>
  <a href="${opts.liveUrl}" class="cta">Open Live App ↗</a>
  ` : ''}

  ${hasRepo && !hasLive ? `
  <a href="${opts.appRepoUrl}" class="cta-secondary">View Repo ↗</a>
  ` : ''}

  ${shareUrl ? `
  <div class="box" style="margin-top:20px">
    <div class="box-label">Your shareable build page</div>
    <div class="box-val"><a href="${shareUrl}" style="color:#c8ff00">${shareUrl}</a></div>
  </div>
  <div class="share-row">
    <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just built "${opts.projectName}" with @NexusOS — 23 AI agents, brief to live app. ${shareUrl}`)}" class="share-btn">𝕏 Tweet this</a>
    <a href="https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(shareUrl)}" class="share-btn">in Share</a>
    <a href="https://wa.me/?text=${encodeURIComponent(`Check this out — built "${opts.projectName}" with AI: ${shareUrl}`)}" class="share-btn">WhatsApp</a>
  </div>
  ` : ''}

  ${refUrl ? `
  <div class="ref-box">
    <div class="ref-label">Your referral link — share to earn credits</div>
    <div class="ref-val"><a href="${refUrl}" style="color:#c8ff00">${refUrl}</a></div>
    <p style="font-size:12px;color:#666;margin:8px 0 0">Every signup through your link earns you a free pipeline run.</p>
  </div>
  ` : ''}

  <p style="margin-top:24px">Ready to run another pipeline?</p>
  <a href="${appUrl}/shell?page=pipeline" class="cta-secondary">← Back to Pipeline</a>

  <div class="footer">${brand.name} · ${brand.tagline} · <a href="https://${brand.domain}" style="color:#555">${brand.domain}</a></div>
</div></body></html>`
}

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const resend = getResend()
  if (!resend) {
    // Resend not configured — silently succeed so it never blocks the pipeline
    return NextResponse.json({ ok: true, data: { skipped: true } })
  }

  try {
    const body = await req.json() as {
      to:          string
      name:        string
      projectName: string
      brief:       string
      score:       number | null
      liveUrl:     string
      deployReady: boolean
      specRepoUrl: string
      appRepoUrl:  string
      shareSlug?:  string | null
      refCode?:    string | null
    }

    if (!body.to || !body.projectName) {
      return NextResponse.json({ ok: false, error: 'to and projectName are required' }, { status: 400 })
    }

    // Verify the recipient matches the authenticated user — never send to an arbitrary address
    const session    = await getServerSession(authOptions)
    const authedEmail = (session?.user as { email?: string } | null)?.email ?? ''
    if (!authedEmail || body.to !== authedEmail) {
      return NextResponse.json({ ok: false, error: 'Recipient mismatch' }, { status: 403 })
    }

    await resend.emails.send({
      from:    from(),
      to:      body.to,
      subject: `✓ ${body.projectName} pipeline complete — QA ${body.score?.toFixed(1) ?? '—'}/10`,
      html:    pipelineCompleteHtml(body),
    })

    return NextResponse.json({ ok: true, data: { sent: true } })
  } catch (err) {
    // Log but return 200 — email failure must never surface to the user
    console.error('[pipeline-complete-email]', err)
    return NextResponse.json({ ok: true, data: { sent: false, error: (err as Error).message } })
  }
}
