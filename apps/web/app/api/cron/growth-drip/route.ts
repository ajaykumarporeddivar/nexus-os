/**
 * GET /api/cron/growth-drip
 *
 * Runs daily. Sends Day 1, Day 3, and Day 7 growth emails to users
 * who completed pipeline runs but haven't received each drip yet.
 *
 * Day 1: "Your app is live — here's your launch playbook"
 * Day 3: "Distribution checklist — 5 places to post today"
 * Day 7: "Week 1 review — what the top builders do next"
 *
 * Secured by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest }         from '@/lib/cronAuth'
import { prisma }                    from '@/lib/prisma'
import { Resend }                    from 'resend'
import { appUrl }                    from '@/lib/brand'

const DRIP_DAYS = [1, 3, 7] as const

function getDripHtml(opts: {
  name:        string
  projectName: string
  liveUrl:     string
  shareUrl:    string
  refUrl:      string
  day:         1 | 3 | 7
}): { subject: string; html: string } {
  const { name, projectName, liveUrl, shareUrl, refUrl, day } = opts

  const base = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;margin:0;padding:40px 20px}
    .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
    .logo{font-size:11px;letter-spacing:.15em;color:#888;margin-bottom:24px;text-transform:uppercase}
    h1{font-size:20px;font-weight:700;margin:0 0 12px;color:#fff}
    .accent{color:#c8ff00}
    p{font-size:14px;color:#aaa;line-height:1.7;margin:10px 0}
    ul{color:#aaa;font-size:14px;line-height:1.8;padding-left:20px;margin:12px 0}
    li{margin:4px 0}
    .cta{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px}
    .cta-secondary{display:inline-block;background:#222;color:#aaa;font-weight:600;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:8px;border:1px solid #333}
    .box{background:#111;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:13px;border-left:3px solid #c8ff0050}
    .footer{font-size:11px;color:#555;margin-top:28px;border-top:1px solid #222;padding-top:16px}
  </style></head><body><div class="card">`

  const footer = `<div class="footer">NEXUS OS · <a href="${appUrl}" style="color:#555">nexus-os.ai</a> · <a href="${appUrl}/unsubscribe" style="color:#555">Unsubscribe</a></div></div></body></html>`

  if (day === 1) {
    return {
      subject: `Day 1: Your "${projectName}" launch playbook`,
      html: base + `
  <div class="logo">NEXUS OS · Day 1 Growth Drip</div>
  <h1>Your app is live. Now make it <span class="accent">visible</span>.</h1>
  <p>Hi ${name} — "${projectName}" is built and deployed. Most builders stop here. The top 10% do this in the next 24 hours:</p>

  <div class="box">
    <strong style="color:#c8ff00">Today's checklist</strong>
    <ul>
      <li>Post a 30-second screen recording on X — no editing needed, just share the screen</li>
      <li>Drop a "just shipped" post in 2 communities you're already in (r/SaaS, IndieHackers, etc.)</li>
      <li>Send the live URL to 5 people who'd genuinely benefit — ask for raw feedback, not praise</li>
      <li>Set up one free analytics tool (Vercel Analytics or PostHog) — you can't improve what you don't measure</li>
    </ul>
  </div>

  ${shareUrl ? `<p>Your shareable build page — designed to convert visitors into signups:</p><a href="${shareUrl}" class="cta">View your build page ↗</a>` : ''}
  ${liveUrl  ? `<a href="${liveUrl}" class="cta-secondary" style="margin-left:8px">Open live app ↗</a>` : ''}

  <p style="margin-top:20px">Share your build page and watch who clicks. Tomorrow's drip covers the top 5 distribution channels that work for AI tools in 2026.</p>

  ${refUrl ? `<p style="font-size:12px;color:#666;margin-top:16px">Your referral link: <a href="${refUrl}" style="color:#c8ff00">${refUrl}</a> — every signup earns you a free pipeline run.</p>` : ''}
  ${footer}`,
    }
  }

  if (day === 3) {
    return {
      subject: `Day 3: 5 places to post "${projectName}" today`,
      html: base + `
  <div class="logo">NEXUS OS · Day 3 Growth Drip</div>
  <h1>Distribution is the <span class="accent">product</span> now.</h1>
  <p>Hi ${name} — the apps that win aren't always the best built. They're the best distributed. Here are 5 places to post "${projectName}" today, each taking under 10 minutes:</p>

  <div class="box">
    <strong style="color:#c8ff00">1. X (Twitter)</strong><br>
    Post the before/after: "Brief → live app in 15 minutes." Show the pipeline screenshot. Use the share page link.
  </div>
  <div class="box">
    <strong style="color:#c8ff00">2. LinkedIn</strong><br>
    Write 150 words about what you built and why you used AI. Tag 3 people who'd care. First 3 lines are the hook — make them count.
  </div>
  <div class="box">
    <strong style="color:#c8ff00">3. r/SaaS or r/entrepreneur</strong><br>
    "I built X in Y minutes using AI agents — here's what the pipeline actually produced." Authentic process posts perform best.
  </div>
  <div class="box">
    <strong style="color:#c8ff00">4. Relevant Slack/Discord communities</strong><br>
    Drop the live URL in #show-and-tell or #projects channels. Ask for feedback, not upvotes.
  </div>
  <div class="box">
    <strong style="color:#c8ff00">5. Product Hunt (if ready)</strong><br>
    Schedule a PH launch for next Tuesday-Thursday. Even without promotion, a PH listing drives ongoing discovery.
  </div>

  ${shareUrl ? `<a href="${shareUrl}" class="cta">Copy your shareable page ↗</a>` : ''}
  <a href="${appUrl}/shell?page=pipeline" class="cta-secondary" style="margin-left:8px">Build another app ↗</a>
  ${footer}`,
    }
  }

  // day === 7
  return {
    subject: `Week 1 done: what's next for "${projectName}"`,
    html: base + `
  <div class="logo">NEXUS OS · Day 7 Growth Drip</div>
  <h1>Week 1 is done. Here's the <span class="accent">next move</span>.</h1>
  <p>Hi ${name} — it's been 7 days since "${projectName}" went live. If you posted and distributed, you should have early signal by now. Here's how to read it:</p>

  <div class="box">
    <strong style="color:#c8ff00">If you have traffic but no signups:</strong><br>
    The problem is messaging, not the product. Rewrite your headline. Make the value concrete in 8 words or less.
  </div>
  <div class="box">
    <strong style="color:#c8ff00">If you have signups but no activation:</strong><br>
    The onboarding is broken. Cut the first-run experience to 3 steps max. The "wow moment" must happen in 90 seconds.
  </div>
  <div class="box">
    <strong style="color:#c8ff00">If you have no traffic:</strong><br>
    Distribution hasn't started yet. Pick one channel — just one — and post every day for 14 days before judging it.
  </div>

  <p>The builders who succeed with AI-native products iterate the narrative faster than the product. Ship the story, then ship the fix.</p>

  <a href="${appUrl}/shell?page=pipeline" class="cta">Run another pipeline ↗</a>
  ${shareUrl ? `<a href="${shareUrl}" class="cta-secondary" style="margin-left:8px">View build page ↗</a>` : ''}
  ${footer}`,
  }
}

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req)
  if (authError) return authError

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  if (!resend) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'RESEND_API_KEY not set' })
  }

  const now    = new Date()
  const sent: string[] = []
  const errors: string[] = []

  for (const day of DRIP_DAYS) {
    // Find SharedRuns created ~`day` days ago that haven't received this drip
    const windowStart = new Date(now.getTime() - (day + 0.5) * 86400000)
    const windowEnd   = new Date(now.getTime() - (day - 0.5) * 86400000)

    const runs = await prisma.sharedRun.findMany({
      where: {
        userId:    { not: null },
        createdAt: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true, slug: true, userId: true, projectName: true, liveUrl: true },
    })

    for (const run of runs) {
      if (!run.userId) continue

      // Check if this drip was already sent
      const alreadySent = await prisma.growthDrip.findUnique({
        where: { userId_runSlug_day: { userId: run.userId, runSlug: run.slug, day } },
      })
      if (alreadySent) continue

      // Get user details
      const user = await prisma.user.findUnique({
        where:  { id: run.userId },
        select: { email: true, name: true },
      })
      if (!user?.email) continue

      // Get referral code
      const ref = await prisma.referralCode.findUnique({
        where:  { userId: run.userId },
        select: { code: true },
      })

      const shareUrl = `${appUrl}/s/${run.slug}`
      const refUrl   = ref?.code ? `${appUrl}?ref=${ref.code}` : ''
      const name     = user.name ?? user.email.split('@')[0]
      const { subject, html } = getDripHtml({
        name, projectName: run.projectName, liveUrl: run.liveUrl ?? '', shareUrl, refUrl, day,
      })

      try {
        await resend.emails.send({
          from:    process.env.EMAIL_FROM ?? 'NEXUS OS <noreply@resend.dev>',
          to:      user.email,
          subject,
          html,
        })
        await prisma.growthDrip.create({
          data: { userId: run.userId, runSlug: run.slug, day },
        })
        sent.push(`day${day}:${user.email}`)
      } catch (e) {
        errors.push(`day${day}:${user.email}:${(e as Error).message?.slice(0, 60)}`)
      }
    }
  }

  return NextResponse.json({ ok: true, sent: sent.length, errors: errors.length, detail: { sent, errors } })
}
