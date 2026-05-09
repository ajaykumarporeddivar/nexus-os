import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()
  const checks: Record<string, { ok: boolean; label?: string; latencyMs?: number; error?: string }> = {}

  // DB check
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.db = { ok: true, label: 'Database (Prisma)', latencyMs: Date.now() - start }
  } catch (err) {
    checks.db = { ok: false, label: 'Database offline — check DATABASE_URL', error: (err as Error).message }
  }

  // Anthropic key check (presence only — don't call API)
  checks.anthropic = {
    ok: !!process.env.ANTHROPIC_API_KEY,
    label: process.env.ANTHROPIC_API_KEY
      ? 'Anthropic API'
      : 'ANTHROPIC_API_KEY missing — pipeline agents will not run',
  }

  // Razorpay key check
  checks.razorpay = {
    ok: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    label: (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
      ? 'Razorpay'
      : 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing — payments disabled',
  }

  // GitHub token check
  checks.github = {
    ok: !!process.env.GITHUB_TOKEN,
    label: process.env.GITHUB_TOKEN
      ? 'GitHub token'
      : 'GITHUB_TOKEN missing — pipeline GitHub push will fail',
  }

  // Vercel deploy token check
  checks.vercel_token = {
    ok: !!process.env.VERCEL_TOKEN,
    label: process.env.VERCEL_TOKEN
      ? 'Vercel deploy token'
      : 'VERCEL_TOKEN missing — pipeline Vercel deploy will fail',
  }

  // Encryption secret check — required for KeysPage (AES-256-GCM)
  const encOk = !!(process.env.ENCRYPTION_SECRET && process.env.ENCRYPTION_SECRET.length === 64)
  checks.encryption = {
    ok: encOk,
    label: encOk
      ? 'Encryption secret'
      : 'ENCRYPTION_SECRET missing or invalid — API Key management page will crash (must be 64-char hex string)',
  }

  // Upstash Redis check
  checks.upstash = {
    ok: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    label: (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
      ? 'Upstash Redis'
      : 'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing — quota + rate limiting disabled',
  }

  // Resend email check
  checks.resend = {
    ok: !!process.env.RESEND_API_KEY,
    label: process.env.RESEND_API_KEY
      ? 'Resend email'
      : 'RESEND_API_KEY missing — transactional emails (welcome, receipts) disabled',
  }

  const allOk = Object.values(checks).every(c => c.ok)

  return NextResponse.json(
    { ok: allOk, version: '11.0.0', timestamp: new Date().toISOString(), checks },
    { status: allOk ? 200 : 503 }
  )
}
