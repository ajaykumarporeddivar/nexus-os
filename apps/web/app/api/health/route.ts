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

  // AI provider check (presence only — don't call external APIs)
  const countProviderKeys = (prefix: string) => {
    let count = process.env[prefix]?.trim() ? 1 : 0
    for (let i = 1; i <= 50; i++) {
      if (process.env[`${prefix}${i}`]?.trim()) count++
    }
    return count
  }
  const anthropicCount = process.env.ANTHROPIC_API_KEY?.trim() ? 1 : 0
  const geminiCount    = countProviderKeys('GEMINI_API_KEY')
  const groqCount      = countProviderKeys('GROQ_API_KEY')
  const aiProviderOk   = anthropicCount + geminiCount + groqCount > 0

  checks.ai = {
    ok: aiProviderOk,
    label: aiProviderOk
      ? `AI providers ready: Anthropic ${anthropicCount}, Gemini ${geminiCount}, Groq ${groqCount}`
      : 'No AI provider keys configured — set ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY',
  }
  checks.anthropic = {
    ok: !!anthropicCount,
    label: anthropicCount ? 'Anthropic API' : 'ANTHROPIC_API_KEY missing — fallback providers will be used if configured',
  }
  checks.gemini = {
    ok: geminiCount > 0,
    label: geminiCount > 0 ? `Gemini API key pool (${geminiCount})` : 'No Gemini fallback keys configured',
  }
  checks.groq = {
    ok: groqCount > 0,
    label: groqCount > 0 ? `Groq API key pool (${groqCount})` : 'No Groq fallback keys configured',
  }

  // Razorpay key check
  checks.razorpay = {
    ok: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    label: (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
      ? 'Razorpay'
      : 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing — payments disabled',
  }

  // GitHub token check (also accepts legacy GUTHUB_TOKEN typo)
  const ghToken = process.env.GITHUB_TOKEN || process.env.GUTHUB_TOKEN
  checks.github = {
    ok: !!ghToken,
    label: ghToken
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

  // Auth check
  checks.auth = {
    ok: !!(process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_SECRET.length > 20),
    label: process.env.NEXTAUTH_SECRET
      ? 'NextAuth secret'
      : 'NEXTAUTH_SECRET missing — auth will fail',
  }

  const requiredChecks = ['db', 'ai', 'auth']
  const allOk = requiredChecks.every(key => checks[key]?.ok)

  // Machine-readable setup tiers for the setup wizard and CI
  const setup = {
    minimal:     checks.db.ok && checks.ai.ok && checks.auth.ok,
    recommended: checks.db.ok && checks.ai.ok && checks.auth.ok && checks.groq.ok && checks.resend.ok,
    production:  checks.db.ok && checks.ai.ok && checks.auth.ok && checks.groq.ok && checks.resend.ok
                 && checks.vercel_token.ok && checks.github.ok && checks.upstash.ok,
  }

  return NextResponse.json(
    { ok: allOk, version: '11.0.0', timestamp: new Date().toISOString(), checks, setup },
    { status: 200 }
  )
}
