/**
 * GET /api/cron/self-heal
 *
 * Autonomous health monitor + self-healing cron — runs every 30 minutes.
 * Checks all critical subsystems, and if 2+ fail, triggers the pipeline
 * orchestrator to attempt recovery.
 *
 * Auth: Vercel cron (Authorization: Bearer <CRON_SECRET>), or manual
 *       (?secret=<CRON_SECRET> or x-cron-secret header).
 *
 * Response:
 *   { ok, healed, checks, actions, durationMs }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'

export const runtime     = 'nodejs'
export const maxDuration = 120

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true   // dev: allow

  const auth  = req.headers.get('authorization') ?? ''
  const query = req.nextUrl.searchParams.get('secret') ?? ''
  const xCron = req.headers.get('x-cron-secret') ?? ''

  return auth === `Bearer ${secret}` || query === secret || xCron === secret
}

// ─── Subsystem checks ─────────────────────────────────────────────────────────

interface CheckResult {
  ok:        boolean
  latencyMs: number
  detail?:   string
}

async function checkDatabase(): Promise<CheckResult> {
  const t0 = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, detail: (err as Error).message?.slice(0, 120) }
  }
}

async function checkAiProviders(): Promise<CheckResult> {
  const t0 = Date.now()
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY?.trim()
  const hasGemini    = !!process.env.GEMINI_API_KEY?.trim()
  const hasGroq      = !!process.env.GROQ_API_KEY?.trim()
  const ok           = hasAnthropic || hasGemini || hasGroq
  return {
    ok,
    latencyMs: Date.now() - t0,
    detail: ok
      ? `Providers: ${[hasAnthropic && 'Anthropic', hasGemini && 'Gemini', hasGroq && 'Groq'].filter(Boolean).join(', ')}`
      : 'No AI provider API keys configured',
  }
}

async function checkHealthEndpoint(baseUrl: string): Promise<CheckResult> {
  const t0 = Date.now()
  try {
    const res  = await fetch(`${baseUrl}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    const data = await res.json() as { ok?: boolean; checks?: Record<string, { ok: boolean }> }
    const ok   = res.ok && (data.ok !== false)
    return { ok, latencyMs: Date.now() - t0, detail: ok ? 'healthy' : 'health endpoint returned error' }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, detail: (err as Error).message?.slice(0, 120) }
  }
}

async function checkRedis(): Promise<CheckResult> {
  const t0  = Date.now()
  const url  = process.env.UPSTASH_REDIS_REST_URL
  const tok  = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !tok) {
    return { ok: false, latencyMs: Date.now() - t0, detail: 'UPSTASH_REDIS_REST_URL or TOKEN not configured' }
  }
  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${tok}` },
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json() as { result?: string }
    const ok   = data.result === 'PONG'
    return { ok, latencyMs: Date.now() - t0, detail: ok ? 'PONG' : JSON.stringify(data) }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, detail: (err as Error).message?.slice(0, 120) }
  }
}

// ─── Healing actions ──────────────────────────────────────────────────────────

async function attemptRecovery(
  baseUrl:        string,
  failedChecks:   string[],
  cronSecret?:    string,
): Promise<{ healed: boolean; action: string; result?: unknown }> {
  // If DB is down, we can't heal — escalate immediately
  if (failedChecks.includes('database')) {
    return { healed: false, action: 'db_down_escalate' }
  }

  // If AI providers are down, log and continue (no action possible without keys)
  if (failedChecks.includes('ai_providers') && failedChecks.length === 1) {
    return { healed: false, action: 'ai_keys_missing_no_action' }
  }

  // Otherwise: trigger a minimal pipeline run to warm up the stack
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (cronSecret) headers['x-cron-secret'] = cronSecret

    const res = await fetch(`${baseUrl}/api/pipeline/trigger`, {
      method:  'POST',
      headers,
      body: JSON.stringify({
        task:        'health check recovery — run a minimal pipeline warm-up',
        triggeredBy: 'self-heal',
        projectName: `nexus-heal-${Date.now().toString(36)}`,
      }),
      signal: AbortSignal.timeout(90_000),
    })

    const data = await res.json()
    return {
      healed: res.ok,
      action: 'pipeline_trigger',
      result: data,
    }
  } catch (err) {
    return {
      healed: false,
      action: 'pipeline_trigger_failed',
      result: (err as Error).message,
    }
  }
}

// ─── Audit log helper ─────────────────────────────────────────────────────────

async function writeHealAudit(
  runId:   string,
  summary: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action:    'agent_run',
        sessionId: `self-heal-${runId}`,
        meta:      { type: 'self_heal', ...summary },
      },
    })
  } catch {
    // Non-blocking
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const t0      = Date.now()
  const runId   = `sh-${Date.now().toString(36)}`
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXTAUTH_URL ?? 'http://localhost:3000')

  console.log(`[self-heal] Starting run ${runId} at ${new Date().toISOString()}`)

  // ── Run all checks in parallel ──────────────────────────────────────────────
  const [dbCheck, aiCheck, healthCheck, redisCheck] = await Promise.all([
    checkDatabase(),
    checkAiProviders(),
    checkHealthEndpoint(baseUrl),
    checkRedis(),
  ])

  const checks = {
    database:       dbCheck,
    ai_providers:   aiCheck,
    health_endpoint: healthCheck,
    redis:          redisCheck,
  }

  const failedChecks = Object.entries(checks)
    .filter(([, v]) => !v.ok)
    .map(([k]) => k)

  const allOk      = failedChecks.length === 0
  const needsHeal  = failedChecks.length >= 2 && !allOk

  console.log(`[self-heal] ${runId}: ${failedChecks.length} checks failing: ${failedChecks.join(', ') || 'none'}`)

  let healResult: { healed: boolean; action: string; result?: unknown } | null = null

  if (needsHeal) {
    console.log(`[self-heal] ${runId}: Triggering recovery (${failedChecks.length} checks down)`)
    healResult = await attemptRecovery(baseUrl, failedChecks, process.env.CRON_SECRET)
    console.log(`[self-heal] ${runId}: Recovery ${healResult.healed ? 'SUCCESS' : 'FAILED'}: ${healResult.action}`)
  }

  const durationMs = Date.now() - t0

  const summary = {
    runId,
    ok:         allOk,
    healed:     healResult?.healed ?? false,
    failCount:  failedChecks.length,
    failedChecks,
    healAction: healResult?.action ?? null,
    durationMs,
  }

  await writeHealAudit(runId, summary)

  return NextResponse.json({
    ok:          allOk,
    runId,
    healed:      healResult?.healed ?? false,
    checks,
    failedChecks,
    healAction:  healResult?.action ?? null,
    healResult:  healResult?.result ?? null,
    durationMs,
  })
}
