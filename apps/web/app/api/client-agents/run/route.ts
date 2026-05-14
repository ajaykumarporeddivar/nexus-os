import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { aiComplete } from '@/lib/ai'
import {
  isValidClientAgentType,
  buildClientAgentPrompt,
  type ClientAgentType,
} from '@/lib/clientAgentData'
import { buildAgentUserMessage } from '@/lib/agentContext'

export const runtime     = 'nodejs'
export const maxDuration = 120
export const dynamic     = 'force-dynamic'

/**
 * POST /api/client-agents/run
 *
 * Run a single client agent and return its output.
 * Can be called:
 *   a) Manually by the NEXUS user (session auth) with an input payload
 *   b) By the scheduler (cron-secret auth) for scheduled runs
 *
 * Body:
 *   - agentId: ClientAgent.id (DB id of the configured agent)
 *   - inputText: string — the raw input pasted by user or injected by scheduler
 *   - force?: boolean — skip last-run recency check
 */
export async function POST(req: NextRequest) {
  // ── Auth: session OR cron secret ──────────────────────────────────────────
  const cronSecret   = process.env.CRON_SECRET
  const incomingCron = req.headers.get('x-cron-secret')
  const isCronCall   = !!(cronSecret && incomingCron === cronSecret)

  let resolvedUserId = 'system'

  if (!isCronCall) {
    const auth = await requireSession()
    if (auth.error) return auth.error
    resolvedUserId = auth.user.id!
  }

  const body = await req.json().catch(() => ({})) as {
    agentId?:   string
    inputText?: string
    force?:     boolean
  }

  if (!body.agentId) {
    return NextResponse.json({ ok: false, error: 'agentId required' }, { status: 400 })
  }

  // ── Load agent + workspace ────────────────────────────────────────────────
  const clientAgent = await prisma.clientAgent.findUnique({
    where:   { id: body.agentId },
    include: {
      workspace: {
        select: {
          id:              true,
          name:            true,
          context:         true,
          ownerId:         true,
          industryCategory: true,
        },
      },
    },
  })

  if (!clientAgent) {
    return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 })
  }

  // Non-cron: verify ownership
  if (!isCronCall && clientAgent.workspace.ownerId !== resolvedUserId) {
    return NextResponse.json({ ok: false, error: 'Not authorised' }, { status: 403 })
  }

  if (!isValidClientAgentType(clientAgent.agentType)) {
    return NextResponse.json({ ok: false, error: 'Invalid agent type in DB' }, { status: 400 })
  }

  const agentType = clientAgent.agentType as ClientAgentType

  // ── Create job record ─────────────────────────────────────────────────────
  const job = await prisma.clientAgentJob.create({
    data: {
      clientAgentId: clientAgent.id,
      workspaceId:   clientAgent.workspaceId,
      status:        'running',
      inputPayload:  body.inputText ?? null,
      startedAt:     new Date(),
    },
  })

  const startedAt = Date.now()

  try {
    // ── Build prompt ──────────────────────────────────────────────────────────
    const systemPrompt = buildClientAgentPrompt(agentType, {
      workspaceName:    clientAgent.workspace.name,
      industry:         clientAgent.workspace.industryCategory ?? undefined,
      workspaceContext: clientAgent.workspace.context ?? undefined,
    })

    // ── Build enriched user message (integrations + manual input) ──────────────
    const { message: userMessage, integrationSummary } = await buildAgentUserMessage({
      workspaceId:   clientAgent.workspaceId,
      agentType,
      workspaceName: clientAgent.workspace.name,
      inputText:     body.inputText,
    })

    // ── Call AI directly via aiComplete ──────────────────────────────────────
    const result = await aiComplete({
      system:    systemPrompt,
      messages:  [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
    })

    const output = result.text

    // ── Update job as done ────────────────────────────────────────────────────
    await prisma.clientAgentJob.update({
      where: { id: job.id },
      data: {
        status:      'done',
        outputText:  output,
        completedAt: new Date(),
      },
    })

    // ── Update agent's lastRunAt + lastOutput ────────────────────────────────
    await prisma.clientAgent.update({
      where: { id: clientAgent.id },
      data: {
        lastRunAt:  new Date(),
        lastOutput: output,
      },
    })

    // ── Audit log ─────────────────────────────────────────────────────────────
    await prisma.auditEvent.create({
      data: {
        action:    'client_agent_run',
        userId:    isCronCall ? clientAgent.workspace.ownerId : resolvedUserId,
        sessionId: `client-agent-${job.id}`,
        meta: {
          agentId:            clientAgent.id,
          agentType,
          workspaceId:        clientAgent.workspaceId,
          jobId:              job.id,
          durationMs:         Date.now() - startedAt,
          isCronCall,
          integrationSources: integrationSummary.map(s => s.split('\n')[0]),
        },
      },
    }).catch(console.error)

    return NextResponse.json({
      ok: true,
      data: {
        jobId:     job.id,
        agentType,
        output,
        durationMs: Date.now() - startedAt,
      },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    await prisma.clientAgentJob.update({
      where: { id: job.id },
      data: {
        status:       'failed',
        errorMessage: msg,
        completedAt:  new Date(),
      },
    }).catch(console.error)

    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
