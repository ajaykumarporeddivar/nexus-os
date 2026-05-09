import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsApp, sendWhatsAppTemplate } from '@/lib/wati'
import { prisma } from '@/lib/prisma'

// Simple in-process rate limit: max 5 sends per phone per 10 min
const phoneRateMap = new Map<string, number[]>()

function isPhoneRateLimited(phone: string): boolean {
  const now = Date.now()
  const window = 10 * 60 * 1000
  const hits = (phoneRateMap.get(phone) ?? []).filter(t => now - t < window)
  if (hits.length >= 5) return true
  phoneRateMap.set(phone, [...hits, now])
  return false
}

export async function POST(req: NextRequest) {
  try {
    // Allow internal server calls (via x-cron-secret) or require auth header presence
    const cronSecret = req.headers.get('x-cron-secret')
    const isInternal = !!cronSecret && cronSecret === process.env.CRON_SECRET

    const { phone, message, templateName, parameters, source } = await req.json()

    if (!phone || !/^\d{10,15}$/.test(phone.replace(/^\+/, ''))) {
      return NextResponse.json({ ok: false, error: 'Valid phone number required' }, { status: 400 })
    }
    if (!message && !templateName) {
      return NextResponse.json({ ok: false, error: 'message or templateName required' }, { status: 400 })
    }
    if (!isInternal && isPhoneRateLimited(phone)) {
      return NextResponse.json({ ok: false, error: 'Rate limit exceeded' }, { status: 429 })
    }

    const ok = templateName
      ? await sendWhatsAppTemplate({ phone, templateName, parameters })
      : await sendWhatsApp({ phone, message })

    await prisma.auditEvent.create({
      data: {
        action: 'whatsapp_sent',
        sessionId: req.headers.get('x-session-id') ?? crypto.randomUUID(),
        meta: { phone: phone.slice(-4).padStart(phone.length, '*'), ok, source: source ?? 'api', templateName: templateName ?? null },
      },
    }).catch(console.error)

    return NextResponse.json({ ok, data: { delivered: ok } })
  } catch (err) {
    console.error('[whatsapp/send POST]', err)
    return NextResponse.json({ ok: false, error: 'Failed to send message' }, { status: 500 })
  }
}
