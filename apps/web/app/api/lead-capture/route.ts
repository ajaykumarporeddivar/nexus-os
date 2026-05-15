import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWelcomeEmail } from '@/lib/email'
import { checkPublicRateLimit, rateLimitHeaders } from '@/lib/ratelimit'

export async function POST(req: NextRequest) {
  try {
    const rl = await checkPublicRateLimit(req)
    if (!rl.success) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests. Please wait and try again.' },
        { status: 429, headers: rateLimitHeaders(rl) }
      )
    }

    const body = await req.json() as {
      email?: string
      name?: string
      utmSource?: string
      utmMedium?: string
      utmCampaign?: string
      utmContent?: string
    }

    const email = (body.email ?? '').trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400 })
    }

    // Also check the nexus_utm cookie as fallback for UTM data
    let utmSource   = body.utmSource
    let utmMedium   = body.utmMedium
    let utmCampaign = body.utmCampaign
    let utmContent  = body.utmContent

    if (!utmSource) {
      try {
        const raw = req.cookies.get('nexus_utm')?.value
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, string>
          utmSource   = parsed.source   || undefined
          utmMedium   = parsed.medium   || undefined
          utmCampaign = parsed.campaign || undefined
          utmContent  = parsed.content  || undefined
        }
      } catch { /* malformed cookie — ignore */ }
    }

    const existing = await prisma.user.findUnique({
      where:  { email },
      select: { id: true, leadScore: true, utmSource: true },
    })

    const isNew = !existing

    await prisma.user.upsert({
      where:  { email },
      create: {
        email,
        name:        body.name ?? null,
        plan:        'free',
        leadScore:   10,
        lastActiveAt: new Date(),
        utmSource:   utmSource   ?? null,
        utmMedium:   utmMedium   ?? null,
        utmCampaign: utmCampaign ?? null,
        utmContent:  utmContent  ?? null,
      },
      update: {
        lastActiveAt: new Date(),
        // Only increment score if this is effectively a re-capture (idempotent)
        ...(existing ? {} : { leadScore: { increment: 0 } }),
        // Persist UTM only if not previously captured
        ...(existing && !existing.utmSource ? {
          utmSource:   utmSource   ?? undefined,
          utmMedium:   utmMedium   ?? undefined,
          utmCampaign: utmCampaign ?? undefined,
          utmContent:  utmContent  ?? undefined,
        } : {}),
      },
    })

    // Send welcome email only to genuinely new leads
    if (isNew) {
      sendWelcomeEmail(email, body.name ?? '').catch(console.error)
    }

    return NextResponse.json({ ok: true, isNew })
  } catch (err) {
    console.error('[lead-capture POST]', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
