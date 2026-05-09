/**
 * AAS v4 — Daily AI Upgrade Agent
 *
 * POST /api/agent/run  — run full health check + AI analysis + apply safe fixes
 * GET  /api/agent/run  — last N agent run reports
 *
 * Flow:
 *   1. Run all internal health checks (DB, APIs, regime, learning)
 *   2. Collect failures and warnings
 *   3. Ask Claude to classify severity and propose fixes
 *   4. Apply "safe" fixes automatically (DB-level, config-level)
 *   5. Log to AuditEvent with full diff
 *   6. Alert via email if critical failures found
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { brand } from '@/lib/brand'
import { computeRPScore } from '@/lib/timingAdvantage'
import { killThreshold, pipelineCap } from '@/lib/crCompute'

const resend   = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const ALERT_TO = process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'
const BASE_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
const CRON_H   = { 'x-cron-secret': process.env.CRON_SECRET ?? '' }

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const bearer = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  return !!(secret && (header === secret || bearer === secret))
}

// ─── Health probe helpers ────────────────────────────────────────────────────

interface Probe { name: string; ok: boolean; detail?: string; severity: 'critical' | 'warn' | 'info' }

async function probeDB(): Promise<Probe> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { name: 'database', ok: true, severity: 'critical' }
  } catch (e) {
    return { name: 'database', ok: false, detail: String(e), severity: 'critical' }
  }
}

async function probeRegime(): Promise<Probe> {
  try {
    const r = await prisma.systemRegime.findFirst({ orderBy: { classifiedAt: 'desc' } })
    if (!r) return { name: 'regime', ok: false, detail: 'No regime classified yet', severity: 'warn' }
    const ageMs = Date.now() - r.classifiedAt.getTime()
    const stale = ageMs > 25 * 60 * 60 * 1000 // > 25 hours
    return {
      name:     'regime',
      ok:       !stale,
      detail:   stale
        ? `Last classification ${Math.round(ageMs / 3600000)}h ago — re-classify needed`
        : `${r.regimeClass} (conf: ${(r.confidence * 100).toFixed(0)}%)`,
      severity: 'warn',
    }
  } catch (e) {
    return { name: 'regime', ok: false, detail: String(e), severity: 'warn' }
  }
}

async function probeLearning(): Promise<Probe> {
  try {
    const recent = await prisma.cRSnapshot.findFirst({ orderBy: { computedAt: 'desc' } })
    if (!recent) return { name: 'learning', ok: false, detail: 'No CR snapshot found', severity: 'warn' }
    const ageMs = Date.now() - recent.computedAt.getTime()
    const stale = ageMs > 25 * 60 * 60 * 1000
    const cr    = recent.cr
    return {
      name:     'learning',
      ok:       !stale && cr >= 0.85,
      detail:   `CR=${cr.toFixed(3)}, age=${Math.round(ageMs / 3600000)}h`,
      severity: cr < 0.7 ? 'critical' : 'warn',
    }
  } catch (e) {
    return { name: 'learning', ok: false, detail: String(e), severity: 'warn' }
  }
}

async function probeRPScore(): Promise<Probe> {
  try {
    const rp = await computeRPScore(30)
    const ok  = rp.total < 10 || rp.rpScore >= 0.6
    return {
      name:     'rp_score',
      ok,
      detail:   `${(rp.rpScore * 100).toFixed(0)}% ahead-of-field (${rp.aheadOfField}/${rp.total} runs) — target ≥60%`,
      severity: 'warn',
    }
  } catch (e) {
    return { name: 'rp_score', ok: false, detail: String(e), severity: 'warn' }
  }
}

async function probeAgents(): Promise<Probe> {
  try {
    const quarantined = await prisma.promptVersion.count({ where: { quarantined: true } })
    const total       = await prisma.promptVersion.count()
    const ratio       = total > 0 ? quarantined / total : 0
    return {
      name:     'agents',
      ok:       ratio < 0.5,
      detail:   `${quarantined}/${total} versions quarantined (${(ratio * 100).toFixed(0)}%)`,
      severity: ratio >= 0.5 ? 'critical' : 'warn',
    }
  } catch (e) {
    return { name: 'agents', ok: false, detail: String(e), severity: 'warn' }
  }
}

async function probeFatigue(): Promise<Probe> {
  try {
    const res = await fetch(`${BASE_URL}/api/regime`, { headers: CRON_H })
    const data = await res.json()
    const zone = data?.data?.fatigue?.zone ?? 'unknown'
    return {
      name:     'fatigue_zone',
      ok:       zone !== 'red',
      detail:   `zone=${zone}`,
      severity: zone === 'red' ? 'warn' : 'info',
    }
  } catch (e) {
    return { name: 'fatigue_zone', ok: false, detail: String(e), severity: 'warn' }
  }
}

async function probeAnthropicKey(): Promise<Probe> {
  const key = process.env.ANTHROPIC_API_KEY
  return { name: 'anthropic_key', ok: !!key, detail: key ? `...${key.slice(-4)}` : 'missing', severity: 'critical' }
}

// ─── Auto-fix actions (safe, idempotent) ────────────────────────────────────

interface Fix { action: string; applied: boolean; result?: string }

async function fixRegimeStale(): Promise<Fix> {
  try {
    const res  = await fetch(`${BASE_URL}/api/regime`, { method: 'POST', headers: CRON_H })
    const data = await res.json()
    return { action: 'reclassify_regime', applied: true, result: data.data?.regime?.regimeClass ?? 'ok' }
  } catch (e) {
    return { action: 'reclassify_regime', applied: false, result: String(e) }
  }
}

async function fixLearningCycle(): Promise<Fix> {
  try {
    const res  = await fetch(`${BASE_URL}/api/learning/cycle`, { method: 'POST', headers: CRON_H })
    const data = await res.json()
    return { action: 'run_learning_cycle', applied: true, result: `mCR=${data.data?.mCR?.toFixed(4)}` }
  } catch (e) {
    return { action: 'run_learning_cycle', applied: false, result: String(e) }
  }
}

async function fixUpdateDeltas(): Promise<Fix> {
  try {
    const res  = await fetch(`${BASE_URL}/api/learning/update-deltas`, { method: 'POST', headers: CRON_H })
    const data = await res.json()
    return { action: 'update_deltas', applied: true, result: `updated=${data.data?.deltaResult?.updated}` }
  } catch (e) {
    return { action: 'update_deltas', applied: false, result: String(e) }
  }
}

async function fixQuarantineScan(): Promise<Fix> {
  try {
    const res  = await fetch(`${BASE_URL}/api/learning/quarantine`, { method: 'POST', headers: CRON_H })
    const data = await res.json()
    return { action: 'quarantine_scan', applied: true, result: `scanned=${data.data?.scanned}` }
  } catch (e) {
    return { action: 'quarantine_scan', applied: false, result: String(e) }
  }
}

async function fixTrending(): Promise<Fix> {
  try {
    const res  = await fetch(`${BASE_URL}/api/cron/trending`, {
      headers: { ...CRON_H, Authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    const data = await res.json()
    return { action: 'refresh_trending', applied: data.ok, result: `count=${data.data?.count}` }
  } catch (e) {
    return { action: 'refresh_trending', applied: false, result: String(e) }
  }
}

// ─── AI analysis ─────────────────────────────────────────────────────────────

async function aiAnalyzeViaGroq(systemPrompt: string, userMessage: string): Promise<string | null> {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return null
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:      'llama-3.3-70b-versatile',
        max_tokens: 400,
        messages:   [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      }),
    })
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

async function aiAnalyze(probes: Probe[], fixes: Fix[], regime: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY

  const failedProbes = probes.filter(p => !p.ok)
  if (failedProbes.length === 0) {
    return 'All probes healthy — no issues to analyze.'
  }

  const systemPrompt = `You are the NEXUS AUTO-UPGRADE AGENT — an AI maintenance system.
Your job is to analyze production health check results and provide a concise diagnostic + action plan.

Rules:
- Be specific. Reference probe names and metrics.
- Prioritize CRITICAL > WARN > INFO.
- Suggest only safe, reversible actions.
- Keep response under 200 words.
- Output in this format:
  SEVERITY: [CRITICAL|DEGRADED|HEALTHY]
  DIAGNOSIS: <what's wrong and why>
  AUTO-FIXES APPLIED: <list what was fixed>
  REMAINING ACTIONS: <what needs human intervention>
  NEXT-CHECK: <when to re-check>`

  const userMessage = `
NEXUS OS Health Check Report — ${new Date().toISOString()}
Regime: ${regime} | Kill threshold: ${killThreshold(regime, 'X')} | Pipeline cap: ${pipelineCap(regime)}

PROBES:
${probes.map(p => `${p.ok ? '✓' : '✗'} ${p.name}: ${p.detail ?? ''} [${p.severity}]`).join('\n')}

AUTO-FIXES APPLIED THIS RUN:
${fixes.map(f => `${f.applied ? '✓' : '✗'} ${f.action}: ${f.result ?? ''}`).join('\n')}

Analyze and prescribe.`

  // Try Anthropic first, fall back to Groq on credit/quota errors
  if (key) {
    const client = new Anthropic({ apiKey: key })
    try {
      const msg = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
      })
      return (msg.content[0] as { text: string }).text
    } catch (e) {
      const msg = String(e)
      // Only fall back on credit/quota errors — re-throw other failures
      if (!msg.includes('credit') && !msg.includes('quota') && !msg.includes('billing')) {
        return `AI analysis failed: ${msg}`
      }
      // Fall through to Groq
    }
  }

  // Groq fallback (free tier, fast)
  const groqResult = await aiAnalyzeViaGroq(systemPrompt, userMessage)
  if (groqResult) return `[via Groq] ${groqResult}`

  return 'AI analysis unavailable — add Anthropic credits or GROQ_API_KEY'
}

// ─── Email alert ─────────────────────────────────────────────────────────────

async function sendAlert(probes: Probe[], analysis: string, fixes: Fix[]) {
  if (!resend) return
  const criticals = probes.filter(p => !p.ok && p.severity === 'critical')
  if (criticals.length === 0) return

  await resend.emails.send({
    from:    process.env.EMAIL_FROM ?? `${brand.name} <noreply@${brand.domain}>`,
    to:      ALERT_TO,
    subject: `${brand.name} ALERT — ${criticals.length} critical issue(s) detected`,
    html: `
<div style="font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;padding:32px;border-radius:12px;max-width:600px">
  <div style="font-size:11px;letter-spacing:.15em;color:#888;margin-bottom:16px">NEXUS OS AUTO-AGENT</div>
  <h2 style="color:#ff4444;margin:0 0 16px">🚨 ${criticals.length} Critical Issue${criticals.length > 1 ? 's' : ''}</h2>
  <div style="background:#1a1a1a;border-radius:8px;padding:16px;margin-bottom:16px">
    ${probes.map(p => `<div style="margin:4px 0;color:${p.ok ? '#22c55e' : p.severity === 'critical' ? '#ff4444' : '#f59e0b'}">${p.ok ? '✓' : '✗'} <strong>${p.name}</strong>: ${p.detail ?? ''}</div>`).join('')}
  </div>
  <div style="background:#111;border-radius:8px;padding:16px;margin-bottom:16px;font-family:monospace;font-size:13px;white-space:pre-wrap">${analysis}</div>
  <div style="font-size:12px;color:#666">Auto-fixes applied: ${fixes.filter(f => f.applied).length}/${fixes.length}</div>
</div>`,
  }).catch(console.error)
}

// ─── POST — run agent ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const startMs = Date.now()

  // Step 1 — run all probes in parallel
  const [dbProbe, regimeProbe, learningProbe, rpProbe, agentsProbe, fatigueProbe, keyProbe] =
    await Promise.all([probeDB(), probeRegime(), probeLearning(), probeRPScore(), probeAgents(), probeFatigue(), probeAnthropicKey()])

  const probes: Probe[] = [dbProbe, regimeProbe, learningProbe, rpProbe, agentsProbe, fatigueProbe, keyProbe]
  const failedProbes    = probes.filter(p => !p.ok)

  // Step 2 — auto-fix what we can (only if DB is healthy)
  const fixes: Fix[] = []
  if (dbProbe.ok) {
    if (!regimeProbe.ok)   fixes.push(await fixRegimeStale())
    if (!learningProbe.ok) fixes.push(await fixLearningCycle())
    fixes.push(await fixUpdateDeltas())
    fixes.push(await fixQuarantineScan())
    if (failedProbes.length > 0) fixes.push(await fixTrending())
  }

  // Step 3 — get current regime for context
  const regime = await prisma.systemRegime.findFirst({ orderBy: { classifiedAt: 'desc' } })
    .then(r => r?.regimeClass ?? 'unknown').catch(() => 'unknown')

  // Step 4 — AI analysis
  const analysis = await aiAnalyze(probes, fixes, regime)

  // Step 5 — alert if critical
  await sendAlert(probes, analysis, fixes)

  // Step 6 — log to audit
  const score = probes.filter(p => p.ok).length / probes.length
  await prisma.auditEvent.create({
    data: {
      action:    'agent_run',
      sessionId: 'auto-agent',
      meta: {
        probes:        probes.map(p => ({ name: p.name, ok: p.ok, detail: p.detail })),
        fixes:         fixes.map(f => ({ action: f.action, applied: f.applied })),
        score:         Math.round(score * 100),
        durationMs:    Date.now() - startMs,
        analysisSnip:  analysis.slice(0, 300),
        failedCount:   failedProbes.length,
      },
    },
  }).catch(console.error)

  return NextResponse.json({
    ok:   true,
    data: {
      timestamp:    new Date().toISOString(),
      durationMs:   Date.now() - startMs,
      healthScore:  `${Math.round(score * 100)}%`,
      probes:       probes.map(p => ({ name: p.name, ok: p.ok, detail: p.detail, severity: p.severity })),
      failedCount:  failedProbes.length,
      autoFixes:    fixes,
      analysis,
      regime,
    },
  })
}

// ─── GET — last N agent run reports ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 10), 50)

  const runs = await prisma.auditEvent.findMany({
    where:   { action: 'agent_run' },
    orderBy: { createdAt: 'desc' },
    take:    limit,
    select:  { id: true, createdAt: true, meta: true },
  })

  return NextResponse.json({
    ok:   true,
    data: runs.map(r => ({
      id:          r.id,
      runAt:       r.createdAt.toISOString(),
      healthScore: (r.meta as Record<string, unknown>)?.score,
      failedCount: (r.meta as Record<string, unknown>)?.failedCount,
      durationMs:  (r.meta as Record<string, unknown>)?.durationMs,
      analysisSnip:(r.meta as Record<string, unknown>)?.analysisSnip,
    })),
  })
}
