/**
 * GET /api/cron/daily-niche-generator
 *
 * Runs once per day. Picks the niche of the day from the NicheVault,
 * triggers the server-side pipeline orchestrator with a production-quality brief,
 * persists the result as a SharedRun, and logs to AuditEvent.
 *
 * This is NEXUS OS's daily "product factory" — every morning a new
 * high-ticket micro-SaaS is built and deployed, ready to showcase to leads.
 *
 * Auth: CRON_SECRET
 * Schedule: 0 1 * * * (1am UTC = 6:30am IST)
 * Max duration: 300s (Vercel Pro / full pipeline run)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest }         from '@/lib/cronAuth'
import { prisma }                    from '@/lib/prisma'
import { getNicheOfTheDay, type Niche } from '@/lib/nicheVault'
import { triggerPipeline }           from '@/lib/orchestrator'

export const runtime    = 'nodejs'
export const maxDuration = 300  // full pipeline can take up to 4 minutes

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req)
  if (authError) return authError

  // Allow override: ?nicheId=soc2-compliance-tracker for manual triggers
  const nicheIdOverride = req.nextUrl.searchParams.get('nicheId')

  const today = new Date()
  const niche: Niche = nicheIdOverride
    ? (await import('@/lib/nicheVault').then(m => m.getNicheById(nicheIdOverride))) ?? getNicheOfTheDay(today)
    : getNicheOfTheDay(today)

  const dateKey = today.toISOString().slice(0, 10)  // e.g. "2026-06-04"

  // Idempotent: skip if today's niche was already generated
  const alreadyGenerated = await prisma.auditEvent.findFirst({
    where: {
      action: 'daily_niche_generated',
      meta:   { path: ['dateKey'], equals: dateKey },
    },
  }).catch(() => null)

  if (alreadyGenerated && !nicheIdOverride) {
    return NextResponse.json({
      ok:      true,
      skipped: true,
      reason:  `Niche "${niche.title}" already generated for ${dateKey}`,
      nicheId: niche.id,
    })
  }

  console.log(`[daily-niche-generator] date=${dateKey} niche=${niche.id}`)

  const started = Date.now()

  try {
    // Trigger the server-side pipeline orchestrator directly
    const result = await triggerPipeline({
      task:        niche.brief,
      projectName: niche.title,
      vertical:    niche.vertical,
      triggeredBy: 'cron',
      skipGates:   false,   // run all L2.75 quality gates
    })

    const elapsed = Math.round((Date.now() - started) / 1000)

    if (!result.ok) {
      await prisma.auditEvent.create({
        data: {
          action:    'daily_niche_generation_failed',
          sessionId: `daily-niche-${dateKey}`,
          meta:      {
            dateKey,
            nicheId:   niche.id,
            nicheTitle: niche.title,
            error:     result.error ?? 'Pipeline returned ok=false',
            elapsedSec: elapsed,
          },
        },
      }).catch(console.error)

      return NextResponse.json({
        ok:      false,
        error:   result.error ?? 'Pipeline failed',
        nicheId: niche.id,
        elapsed,
      }, { status: 500 })
    }

    // Persist as SharedRun so TrendingPage and showcase can display it
    const slug = `niche-${niche.id}-${dateKey}`
    const sharedRun = await prisma.sharedRun.upsert({
      where:  { slug },
      create: {
        slug,
        projectName: niche.title,
        brief:       niche.brief,
        vertical:    niche.vertical,
        liveUrl:     result.liveUrl ?? null,
        qaScore:     result.qaScore ?? null,
        elapsedSec:  elapsed,
        agentCount:  23,
      },
      update: {
        liveUrl:    result.liveUrl    ?? undefined,
        qaScore:    result.qaScore    ?? undefined,
        elapsedSec: elapsed,
      },
    }).catch(err => {
      console.error('[daily-niche-generator] SharedRun upsert failed:', err)
      return null
    })

    // Audit log — used by idempotency check above
    await prisma.auditEvent.create({
      data: {
        action:    'daily_niche_generated',
        sessionId: `daily-niche-${dateKey}`,
        meta:      {
          dateKey,
          nicheId:    niche.id,
          nicheTitle: niche.title,
          tier:       niche.tier,
          pricing:    niche.pricing,
          mrrPotential: niche.mrrPotential,
          liveUrl:    result.liveUrl ?? null,
          slug,
          sharedRunId: sharedRun?.id ?? null,
          elapsedSec: elapsed,
        },
      },
    }).catch(console.error)

    // Notify owner if email configured
    if (process.env.RESEND_API_KEY && process.env.INTERNAL_NOTIFY_EMAIL) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const liveUrl = result.liveUrl
      await resend.emails.send({
        from:    process.env.EMAIL_FROM ?? 'NEXUS OS <noreply@resend.dev>',
        to:      process.env.INTERNAL_NOTIFY_EMAIL,
        subject: `✅ Today's SaaS built: ${niche.title}`,
        html:    `<div style="font-family:sans-serif;padding:24px;background:#0a0a0a;color:#e5e5e5">
<h2 style="color:#c8ff00;margin:0 0 12px">Daily Niche Generator ✅</h2>
<p><strong>Niche:</strong> ${niche.title}</p>
<p><strong>Tier:</strong> ${niche.tier} · ${niche.pricing} · ${niche.mrrPotential} MRR potential</p>
<p><strong>Target:</strong> ${niche.targetICPs.join(', ')}</p>
<p><strong>Elapsed:</strong> ${elapsed}s</p>
${liveUrl ? `<p><strong>Live URL:</strong> <a href="${liveUrl}" style="color:#c8ff00">${liveUrl}</a></p>` : ''}
<p><strong>Showcase:</strong> <a href="${process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? 'https://nexus-os.ai'}/shell?page=trending" style="color:#c8ff00">View on Trending page →</a></p>
</div>`,
      }).catch(console.error)
    }

    return NextResponse.json({
      ok:          true,
      nicheId:     niche.id,
      nicheTitle:  niche.title,
      dateKey,
      slug,
      liveUrl:     result.liveUrl ?? null,
      elapsedSec:  elapsed,
    })

  } catch (err) {
    const elapsed = Math.round((Date.now() - started) / 1000)
    console.error('[daily-niche-generator] Fatal error:', err)

    await prisma.auditEvent.create({
      data: {
        action:    'daily_niche_generation_failed',
        sessionId: `daily-niche-${dateKey}`,
        meta:      {
          dateKey,
          nicheId:   niche.id,
          error:     err instanceof Error ? err.message : String(err),
          elapsedSec: elapsed,
        },
      },
    }).catch(console.error)

    return NextResponse.json({
      ok:    false,
      error: err instanceof Error ? err.message : 'Unexpected error',
      elapsed,
    }, { status: 500 })
  }
}
