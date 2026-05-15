import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'
import { sendUpgradeIntent } from '@/lib/email'
import { checkPublicRateLimit, rateLimitHeaders } from '@/lib/ratelimit'

// Lead scoring points per event
const EVENT_SCORES: Record<string, number> = {
  plan_gate_hit:     5,
  pipeline_run:     20,
  pipeline_run_3x:  15,
  quota_warning:     0, // informational — no score change
  upgrade_intent:    5,
}

export async function POST(req: NextRequest) {
  try {
    const rl = await checkPublicRateLimit(req)
    if (!rl.success) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests' },
        { status: 429, headers: rateLimitHeaders(rl) }
      )
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      // Unauthenticated events are silently accepted (no-op) — avoids leaking user state
      return NextResponse.json({ ok: true })
    }

    const body = await req.json() as { event?: string; meta?: Record<string, unknown> }
    const event = body.event ?? ''

    if (!event) {
      return NextResponse.json({ ok: false, error: 'event required' }, { status: 400 })
    }

    const scoreIncrement = EVENT_SCORES[event] ?? 0
    const email = session.user.email

    const user = await prisma.user.findUnique({
      where:  { email },
      select: { id: true, leadScore: true, name: true, plan: true },
    })
    if (!user) return NextResponse.json({ ok: true })

    // Update score + lastActiveAt
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastActiveAt: new Date(),
        leadScore:    { increment: scoreIncrement },
      },
    })

    const newScore = (user.leadScore ?? 0) + scoreIncrement

    // Hot lead threshold: notify via internal alert when score crosses 76
    if ((user.leadScore ?? 0) < 76 && newScore >= 76) {
      const internalEmail = process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'
      // Fire-and-forget internal Resend notification
      try {
        const { Resend } = await import('resend')
        if (process.env.RESEND_API_KEY) {
          const r = new Resend(process.env.RESEND_API_KEY)
          await r.emails.send({
            from:    process.env.EMAIL_FROM ?? 'NEXUS OS <noreply@nexus-os.ai>',
            to:      internalEmail,
            subject: `Hot lead — ${email} (score: ${newScore})`,
            html:    `<div style="font-family:monospace;background:#0f0f0f;color:#e5e5e5;padding:24px;border-radius:8px">
              <strong style="color:#c8ff00">Hot lead threshold reached</strong><br><br>
              Email: ${email}<br>Plan: ${user.plan}<br>Lead score: ${newScore}<br>
              Last event: ${event}<br>Time: ${new Date().toISOString()}
            </div>`,
          })
        }
      } catch { /* non-fatal */ }
    }

    // Upgrade intent: fire email if user hit plan gate 3+ times (tracked by caller via meta.gateHits)
    if (event === 'plan_gate_hit') {
      const gateHits = (body.meta?.gateHits as number) ?? 0
      const feature  = (body.meta?.feature  as string) ?? 'this feature'
      if (gateHits >= 3) {
        sendUpgradeIntent(email, user.name ?? '', feature).catch(console.error)
      }
    }

    return NextResponse.json({ ok: true, newScore })
  } catch (err) {
    console.error('[lead-event POST]', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
