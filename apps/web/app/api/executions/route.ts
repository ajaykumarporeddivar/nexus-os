import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Build, ExecutionStatus } from '@nexus-os/shared-types'
import { computeFatigueZone, enforceZoneGate } from '@/lib/fatigueZone'
import { computeTimingAdvantage } from '@/lib/timingAdvantage'
import { requireSession } from '@/lib/session'

function mapToBuild(e: {
  id: number; createdAt: Date; inputSnippet: string; clientName: string
  phases: string[]; tokens: number; calls: number; score: number | null
  passed: boolean | null; status: string; fileCount: number
}): Build {
  return {
    id: e.id,
    date: e.createdAt.toLocaleDateString('en-IN'),
    time: e.createdAt.toLocaleTimeString('en-IN', { hour12: false }),
    input: e.inputSnippet,
    client: e.clientName,
    phases: e.phases,
    tokens: e.tokens,
    calls: e.calls,
    score: e.score,
    passed: e.passed,
    status: e.status as ExecutionStatus,
    files: e.fileCount,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const isAdmin = auth.user.isAdmin ?? false

  try {
    const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') ?? 50), 200)
    // Admin sees all; regular users see only their own executions (matched by userId/sessionId)
    const where = isAdmin ? {} : { sessionId: auth.user.id ?? 'none' }
    const rows = await prisma.execution.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, createdAt: true, inputSnippet: true, clientName: true,
        phases: true, tokens: true, calls: true, score: true,
        passed: true, status: true, fileCount: true,
      },
    })
    return NextResponse.json({ ok: true, data: rows.map(mapToBuild) })
  } catch (err) {
    console.error('[executions GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to fetch executions' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  try {
    const body: Build & {
      causalMechanism?: string | null
      irreversible?: boolean
      plan?: string
    } = await req.json()

    // Always use the authenticated user's ID as the session — never trust the header
    const sessionId = auth.user.id ?? 'anonymous'
    // Plan comes from the verified JWT, not the request body
    const verifiedPlan = auth.user.plan ?? 'free'

    // AAS v4 Phase 02 — causal mechanism hard gate.
    const isAnonymous = sessionId === 'anonymous' || sessionId.startsWith('eval:')
    if (!isAnonymous) {
      const cm = body.causalMechanism?.trim()
      if (!cm) {
        return NextResponse.json({
          ok:    false,
          error: 'AAS v4 Phase 02: causalMechanism is required and must not be null. Provide a one-sentence explanation of why this signal/run exists.',
          code:  'missing_causal_mechanism',
        }, { status: 400 })
      }
    }

    // AAS v4 Phase 05 — fatigue zone gate (non-anonymous sessions only)
    let fatigueZone = 'green'
    if (!isAnonymous) {
      const fatigue = await computeFatigueZone(verifiedPlan)
      fatigueZone   = fatigue.zone
      const irreversible = body.irreversible ?? false
      const block   = enforceZoneGate(fatigue, irreversible)
      if (block) {
        return NextResponse.json({
          ok:    false,
          error: `AAS v4 fatigue gate: ${block.zone} zone — ${block.reason}`,
          code:  `fatigue_${block.zone}`,
          aas:   { fatigueZone: fatigue.zone, metrics: fatigue.metrics },
        }, { status: 429 })
      }
    }

    // AAS v4 Phase 06: compute timing advantage before persisting
    const phases = body.phases ?? []
    const { timingAdv } = phases.length > 0
      ? await computeTimingAdvantage(phases).catch(() => ({ timingAdv: 0.5 }))
      : { timingAdv: 0.5 }

    const execution = await prisma.execution.create({
      data: {
        sessionId,
        inputSnippet:   (body.input ?? '').slice(0, 500),
        clientName:     body.client ?? 'Unknown',
        phases,
        tokens:         body.tokens ?? 0,
        calls:          body.calls ?? 0,
        score:          body.score ?? null,
        passed:         body.passed ?? null,
        status:         body.status ?? 'COMPLETE',
        fileCount:      body.files ?? 0,
        fatigueZone,
        irreversible:   body.irreversible ?? false,
        timingAdv,                                // AAS v4 Phase 06
      },
    })
    return NextResponse.json({ ok: true, data: mapToBuild({ ...execution }) }, { status: 201 })
  } catch (err) {
    console.error('[executions POST]', err)
    return NextResponse.json({ ok: false, error: 'Failed to save execution' }, { status: 500 })
  }
}
