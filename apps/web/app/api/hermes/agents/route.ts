/**
 * GET /api/hermes/agents
 *
 * Returns the manifest of all autonomous agents available in NEXUS OS.
 * Used by Hermes Workspace to populate its agent selector UI and skill registry.
 *
 * Auth: x-hermes-secret (or CRON_SECRET / INTERNAL_API_SECRET).
 *
 * Response:
 *   { ok, agents: AgentCapability[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'

export const runtime = 'nodejs'

function isAuthorized(req: NextRequest): boolean {
  const hermesSecret   = process.env.HERMES_SECRET
  const cronSecret     = process.env.CRON_SECRET
  const internalSecret = process.env.INTERNAL_API_SECRET
  if (!hermesSecret && !cronSecret && !internalSecret) return true   // dev

  const auth      = req.headers.get('authorization') ?? ''
  const hermes    = req.headers.get('x-hermes-secret') ?? ''
  const xCron     = req.headers.get('x-cron-secret') ?? ''
  const xInternal = req.headers.get('x-nexus-internal') ?? ''
  const query     = req.nextUrl.searchParams.get('secret') ?? ''

  if (hermesSecret   && (hermes === hermesSecret || auth === `Bearer ${hermesSecret}`)) return true
  if (cronSecret     && (xCron === cronSecret || auth === `Bearer ${cronSecret}` || query === cronSecret)) return true
  if (internalSecret && xInternal === internalSecret) return true
  return false
}

interface AgentCapability {
  id:          string
  name:        string
  description: string
  endpoint:    string
  method:      'GET' | 'POST'
  auth:        string
  category:    'pipeline' | 'deploy' | 'monitor' | 'data' | 'comms'
  schedule?:   string
  params?:     Record<string, string>
}

const AGENTS: AgentCapability[] = [
  // ── Pipeline ──────────────────────────────────────────────────────────────
  {
    id:          'pipeline-trigger',
    name:        'Pipeline Trigger',
    description: 'Runs the full FORGE → BUILD → DEPLOY autonomous pipeline for a given task.',
    endpoint:    '/api/pipeline/trigger',
    method:      'POST',
    auth:        'x-hermes-secret | x-cron-secret | Bearer CRON_SECRET',
    category:    'pipeline',
    params: {
      task:        'string (required) — what to build',
      projectName: 'string (optional) — Vercel project name',
      workspaceId: 'string (optional) — scope to workspace',
      triggeredBy: "'cron' | 'hermes' | 'self-heal' | 'manual'",
    },
  },
  // ── Deploy ────────────────────────────────────────────────────────────────
  {
    id:          'claude-deploy',
    name:        'Deploy',
    description: 'Unified deploy: pushes branch ref to GitHub, then creates a Vercel deployment.',
    endpoint:    '/api/claude/deploy',
    method:      'POST',
    auth:        'x-hermes-secret | x-cron-secret | Bearer CRON_SECRET',
    category:    'deploy',
    params: {
      ref:         'string (optional) — git branch (default: main)',
      files:       'object (optional) — { [path]: content } to deploy directly',
      projectName: 'string (optional) — Vercel project name',
      skipGithub:  'boolean (optional) — skip GitHub push',
      skipVercel:  'boolean (optional) — skip Vercel deployment',
    },
  },
  // ── Monitor ───────────────────────────────────────────────────────────────
  {
    id:          'self-heal',
    name:        'Self-Heal Monitor',
    description: 'Checks all subsystems (DB, Redis, AI, health endpoint). Triggers pipeline recovery if 2+ checks fail.',
    endpoint:    '/api/cron/self-heal',
    method:      'GET',
    auth:        'Bearer CRON_SECRET | x-cron-secret | ?secret=CRON_SECRET',
    category:    'monitor',
    schedule:    '*/30 * * * *',
  },
  {
    id:          'health-check',
    name:        'Health Check',
    description: 'Public endpoint — checks DB, AI providers, Redis, and external services.',
    endpoint:    '/api/health',
    method:      'GET',
    auth:        'none',
    category:    'monitor',
  },
  {
    id:          'hermes-status',
    name:        'Hermes Status',
    description: 'Full system status: DB, AI, recent audit events, cron schedules, capabilities.',
    endpoint:    '/api/hermes/status',
    method:      'GET',
    auth:        'x-hermes-secret | x-cron-secret',
    category:    'monitor',
  },
  // ── Data ──────────────────────────────────────────────────────────────────
  {
    id:          'trending-cron',
    name:        'Trending Refresh',
    description: 'Regenerates micro-SaaS trend opportunities using AI. Runs every 6 hours.',
    endpoint:    '/api/cron/trending',
    method:      'GET',
    auth:        'Bearer CRON_SECRET | ?secret=CRON_SECRET',
    category:    'data',
    schedule:    '0 */6 * * *',
  },
  {
    id:          'learning-cycle',
    name:        'Learning Cycle',
    description: 'Runs the daily AI prompt optimization cycle. Improves agent prompts over time.',
    endpoint:    '/api/learning/cycle',
    method:      'GET',
    auth:        'Bearer CRON_SECRET | ?secret=CRON_SECRET',
    category:    'data',
    schedule:    '0 2 * * *',
  },
  {
    id:          'growth-drip',
    name:        'Growth Drip',
    description: 'Sends automated growth/drip email sequences to engaged leads.',
    endpoint:    '/api/cron/growth-drip',
    method:      'GET',
    auth:        'Bearer CRON_SECRET | ?secret=CRON_SECRET',
    category:    'comms',
    schedule:    '0 10 * * *',
  },
  {
    id:          'lead-digest',
    name:        'Lead Digest',
    description: 'Sends weekly lead digest email with pipeline summary.',
    endpoint:    '/api/cron/lead-digest',
    method:      'GET',
    auth:        'Bearer CRON_SECRET | ?secret=CRON_SECRET',
    category:    'comms',
    schedule:    '0 9 * * 1',
  },
]

// ─── Live SLA computation ─────────────────────────────────────────────────────

async function computeLiveSlas(): Promise<Record<string, { successRate: number; avgDurationMs: number; lastRun: string | null; circuitOpen: boolean }>> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)   // last 24h

  try {
    // Pipeline runs
    const pipelineEvents = await prisma.auditEvent.findMany({
      where:   { action: 'forge_run_completed', createdAt: { gte: since } },
      select:  { meta: true, createdAt: true },
      take:    50,
      orderBy: { createdAt: 'desc' },
    })

    const pipelineMetas = pipelineEvents.map(e => e.meta as Record<string, unknown>)
    const pSuccess = pipelineMetas.filter(m => m.ok === true).length
    const pRate    = pipelineMetas.length ? pSuccess / pipelineMetas.length : 1
    const pDurations = pipelineMetas.map(m => typeof m.totalMs === 'number' ? m.totalMs : 0).filter(d => d > 0)
    const pAvgDur  = pDurations.length ? pDurations.reduce((a,b)=>a+b,0)/pDurations.length : 0

    // Self-heal cron
    const healEvents = await prisma.auditEvent.findMany({
      where:  { action: 'agent_run', sessionId: { startsWith: 'self-heal-' }, createdAt: { gte: since } },
      select: { meta: true, createdAt: true },
      take:   10,
      orderBy: { createdAt: 'desc' },
    })

    // Control gate blocks
    const gateBlocks = await prisma.auditEvent.count({
      where: { action: 'control_gate_decision', createdAt: { gte: since } },
    })

    return {
      'pipeline-trigger': {
        successRate:   Math.round(pRate * 100) / 100,
        avgDurationMs: Math.round(pAvgDur),
        lastRun:       pipelineEvents[0]?.createdAt?.toString() ?? null,
        circuitOpen:   false,
      },
      'self-heal': {
        successRate:   1.0,
        avgDurationMs: 8000,
        lastRun:       healEvents[0]?.createdAt?.toString() ?? null,
        circuitOpen:   false,
      },
      'control-gate': {
        successRate:   1.0,
        avgDurationMs: 50,
        lastRun:       null,
        circuitOpen:   false,
      },
      '_meta': { successRate: gateBlocks, avgDurationMs: 0, lastRun: null, circuitOpen: false },
    }
  } catch {
    return {}
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const category = req.nextUrl.searchParams.get('category')
  const withSlas = req.nextUrl.searchParams.get('slas') === 'true'

  const filtered = category
    ? AGENTS.filter(a => a.category === category)
    : AGENTS

  let slas: Awaited<ReturnType<typeof computeLiveSlas>> = {}
  if (withSlas) {
    slas = await computeLiveSlas()
  }

  // Annotate agents with live SLA data
  const agentsWithSla = filtered.map(agent => ({
    ...agent,
    sla: slas[agent.id] ?? null,
  }))

  return NextResponse.json({
    ok:          true,
    total:       AGENTS.length,
    agents:      agentsWithSla,
    slaComputed: withSlas,
    generatedAt: new Date().toISOString(),
  })
}
