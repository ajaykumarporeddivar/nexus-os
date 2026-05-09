import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkWatiHealth } from '@/lib/wati'
import { sendWhatsApp } from '@/lib/wati'
import { Resend } from 'resend'
import { brand } from '@/lib/brand'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const ALERT_PHONE = process.env.ALERT_PHONE ?? ''
const ALERT_EMAIL = process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'

interface CheckResult {
  ok: boolean
  latencyMs?: number
  error?: string
}

async function checkDb(): Promise<CheckResult> {
  const t0 = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, error: String(e) }
  }
}

async function checkAnthropic(): Promise<CheckResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, error: 'ANTHROPIC_API_KEY missing' }
  if (!key.startsWith('sk-ant-')) return { ok: false, error: 'ANTHROPIC_API_KEY invalid format' }
  const t0 = Date.now()
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(5000),
    })
    // 400 (credit) or 200 both mean the key is valid and Anthropic is reachable
    const reachable = res.status !== 401 && res.status !== 403
    return { ok: reachable, latencyMs: Date.now() - t0, error: reachable ? undefined : `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, error: String(e) }
  }
}

async function checkResend(): Promise<CheckResult> {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY missing' }
  return { ok: true }
}

async function alertAdmin(failures: string[]) {
  const msg = `${brand.name} ALERT [${new Date().toISOString()}]\n\nFailing checks:\n${failures.map(f => `• ${f}`).join('\n')}\n\nCheck /api/health for details.`

  if (ALERT_PHONE) {
    sendWhatsApp({ phone: ALERT_PHONE, message: msg }).catch(console.error)
  }

  if (resend) {
    resend.emails.send({
      from: process.env.EMAIL_FROM ?? `${brand.name} <noreply@${brand.domain}>`,
      to: ALERT_EMAIL,
      subject: `${brand.name} Alert — ${failures.length} check(s) failing`,
      html: `<pre style="font-family:monospace;background:#1a1a1a;color:#e5e5e5;padding:20px;border-radius:8px">${msg}</pre>`,
    }).catch(console.error)
  }
}

export async function GET(req: NextRequest) {
  const cronSecret  = process.env.CRON_SECRET
  const secret      = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const bearerToken = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  const isAuthed    = !!(cronSecret && (secret === cronSecret || bearerToken === cronSecret))

  const [db, anthropic, wati, email] = await Promise.all([
    checkDb(),
    checkAnthropic(),
    checkWatiHealth(),
    checkResend(),
  ])

  const checks = { db, anthropic, wati, email }
  const failures = Object.entries(checks)
    .filter(([, v]) => !v.ok)
    .map(([k]) => k)

  const allOk = failures.length === 0

  if (!allOk && isAuthed) {
    await alertAdmin(failures)
  }

  await prisma.auditEvent.create({
    data: {
      action: 'monitor_run',
      sessionId: 'cron',
      meta: { checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { ok: v.ok, latencyMs: v.latencyMs }])), failures },
    },
  }).catch(console.error)

  return NextResponse.json(
    { ok: allOk, checks, failures, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  )
}
