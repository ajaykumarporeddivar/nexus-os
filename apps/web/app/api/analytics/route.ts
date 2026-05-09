import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession, requiresPlan } from '@/lib/session'
import {
  computeSQI,
  computePAcc,
  computeKPrec,
  computeEVel,
  computeLSM,
  computeCR,
} from '@/lib/crCompute'

function startOf(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(req: NextRequest) {
  // Require at minimum a session; admin sees all, agency sees their own data
  const auth = await requireSession()
  if (auth.error) return auth.error

  const isAdmin = auth.user.isAdmin ?? false
  const plan    = (auth.user.plan ?? 'free') as string
  if (!isAdmin && !requiresPlan(plan as Parameters<typeof requiresPlan>[0], 'agency')) {
    return NextResponse.json(
      { ok: false, error: 'Analytics requires Agency plan or higher.' },
      { status: 403 }
    )
  }

  // Non-admin users scope analytics to their own session (their userId)
  const scopeId = isAdmin ? undefined : auth.user.id

  try {
    const url = new URL(req.url)
    const window = url.searchParams.get('window') ?? '7d'
    const days = window === '30d' ? 30 : window === '90d' ? 90 : 7
    const since = startOf(days)
    const prevSince = startOf(days * 2)

    // Parallel queries — scoped to user's sessionId for non-admin accounts
    const execFilter = scopeId
      ? { createdAt: { gte: since }, sessionId: scopeId }
      : { createdAt: { gte: since } }
    const execPrevFilter = scopeId
      ? { createdAt: { gte: prevSince, lt: since }, sessionId: scopeId }
      : { createdAt: { gte: prevSince, lt: since } }
    const auditFilter = scopeId
      ? { createdAt: { gte: since }, sessionId: scopeId }
      : { createdAt: { gte: since } }

    const [
      execsCurrent,
      execsPrev,
      auditCurrent,
      auditByAction,
      topSessions,
      latestRegime,
      latestCRSnapshot,
      priorCRSnapshot,
      recentAuditCycles,
      baselineExecs,
    ] = await Promise.all([
      prisma.execution.findMany({
        where: execFilter,
        select: { id: true, createdAt: true, tokens: true, calls: true, score: true, passed: true, status: true, phases: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.execution.aggregate({
        where: execPrevFilter,
        _count: { id: true },
        _sum: { tokens: true },
        _avg: { score: true },
      }),
      prisma.auditEvent.count({ where: auditFilter }),
      prisma.auditEvent.groupBy({
        by: ['action'],
        where: auditFilter,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.auditEvent.groupBy({
        by: ['sessionId'],
        where: auditFilter,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      // AAS v4 additions — admin only (system-wide regime intelligence is private)
      isAdmin ? prisma.systemRegime.findFirst({ orderBy: { classifiedAt: 'desc' } }).catch(() => null) : Promise.resolve(null),
      isAdmin ? prisma.cRSnapshot.findFirst({ orderBy: { computedAt: 'desc' } }).catch(() => null) : Promise.resolve(null),
      isAdmin ? prisma.cRSnapshot.findFirst({ orderBy: { computedAt: 'desc' }, skip: 1 }).catch(() => null) : Promise.resolve(null),
      prisma.auditEvent.findMany({
        where: scopeId
          ? { action: 'learning_cycle', createdAt: { gte: startOf(30) }, sessionId: scopeId }
          : { action: 'learning_cycle', createdAt: { gte: startOf(30) } },
        select: { meta: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }).catch(() => [] as Array<{ meta: unknown }>),
      prisma.execution.aggregate({
        where: scopeId
          ? { createdAt: { gte: startOf(30), lt: since }, sessionId: scopeId }
          : { createdAt: { gte: startOf(30), lt: since } },
        _count: { id: true },
      }).catch(() => ({ _count: { id: 0 } })),
    ])

    // KPIs — current window
    const totalRuns = execsCurrent.length
    const totalTokens = execsCurrent.reduce((s, e) => s + e.tokens, 0)
    const totalCalls = execsCurrent.reduce((s, e) => s + e.calls, 0)
    const passedRuns = execsCurrent.filter(e => e.passed === true).length
    const scoredRuns = execsCurrent.filter(e => e.score !== null)
    const avgScore = scoredRuns.length
      ? scoredRuns.reduce((s, e) => s + (e.score ?? 0), 0) / scoredRuns.length
      : null
    const fullPipeline = execsCurrent.filter(e => e.phases.length >= 7).length

    // AAS v4 — 5-dimensional CR computation (additive, never throws)
    let crBlock: Record<string, unknown> = {}
    try {
      const execSamples = execsCurrent.map(e => ({
        score: e.score, passed: e.passed, phases: e.phases, createdAt: e.createdAt,
      }))

      const cycleSamples: Array<{ avgScoreBefore: number; avgScoreAfter: number }> = []
      for (const evt of recentAuditCycles) {
        const meta = evt.meta as Record<string, unknown>
        if (Array.isArray(meta?.improved)) {
          for (const item of meta.improved as Array<{ oldAvg?: number; newAvg?: number }>) {
            if (typeof item.oldAvg === 'number' && typeof item.newAvg === 'number') {
              cycleSamples.push({ avgScoreBefore: item.oldAvg, avgScoreAfter: item.newAvg })
            }
          }
        }
      }

      const dims = {
        sqi:   computeSQI(execSamples),
        pAcc:  computePAcc(execSamples),
        kPrec: computeKPrec(execSamples),
        evel:  computeEVel(execsCurrent.length, days, baselineExecs._count.id, 30 - days),
        lsm:   computeLSM(cycleSamples),
      }
      const cr  = computeCR(dims)
      const mCR = latestCRSnapshot ? cr - latestCRSnapshot.cr : 0
      const prevCR = priorCRSnapshot?.cr ?? null

      const crAlerts: string[] = []
      if (cr < 0.95)  crAlerts.push('cr_red')
      if (mCR < 0)    crAlerts.push('mcr_negative')

      crBlock = {
        dims: {
          sqi:   Math.round(dims.sqi   * 1000) / 1000,
          pAcc:  Math.round(dims.pAcc  * 1000) / 1000,
          kPrec: Math.round(dims.kPrec * 1000) / 1000,
          evel:  Math.round(dims.evel  * 1000) / 1000,
          lsm:   Math.round(dims.lsm   * 1000) / 1000,
        },
        cr:          Math.round(cr  * 1000) / 1000,
        mCR:         Math.round(mCR * 1000) / 1000,
        prevCR,
        loopVersion: latestCRSnapshot?.loopVersion ?? 0,
        alerts:      crAlerts,
        regime:      latestRegime?.regimeClass ?? 'unknown',
        regimeConf:  latestRegime?.confidence  ?? 0,
      }
    } catch (crErr) {
      console.error('[analytics CR]', crErr)
      crBlock = { error: 'cr_compute_failed' }
    }

    // WoW deltas
    const prevRuns = execsPrev._count.id
    const prevTokens = execsPrev._sum.tokens ?? 0
    const prevAvgScore = execsPrev._avg.score ?? null

    // Daily bucketed trend (last `days` days)
    const buckets: Record<string, { runs: number; tokens: number; passed: number }> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      buckets[key] = { runs: 0, tokens: 0, passed: 0 }
    }
    for (const e of execsCurrent) {
      const key = e.createdAt.toISOString().slice(0, 10)
      if (buckets[key]) {
        buckets[key].runs++
        buckets[key].tokens += e.tokens
        if (e.passed) buckets[key].passed++
      }
    }
    const trend = Object.entries(buckets).map(([date, v]) => ({ date, ...v }))

    // Status breakdown
    const byStatus = execsCurrent.reduce<Record<string, number>>((acc, e) => {
      acc[e.status] = (acc[e.status] ?? 0) + 1
      return acc
    }, {})

    // Score distribution buckets
    const scoreDist = [
      { label: '< 6',  count: scoredRuns.filter(e => (e.score ?? 0) < 6).length },
      { label: '6–7',  count: scoredRuns.filter(e => { const s = e.score ?? 0; return s >= 6 && s < 7 }).length },
      { label: '7–8',  count: scoredRuns.filter(e => { const s = e.score ?? 0; return s >= 7 && s < 8 }).length },
      { label: '8–9',  count: scoredRuns.filter(e => { const s = e.score ?? 0; return s >= 8 && s < 9 }).length },
      { label: '≥ 9',  count: scoredRuns.filter(e => (e.score ?? 0) >= 9).length },
    ]

    return NextResponse.json({
      ok: true,
      window,
      days,
      kpis: {
        totalRuns,
        totalTokens,
        totalCalls,
        passedRuns,
        passRate: totalRuns ? Math.round((passedRuns / totalRuns) * 100) : 0,
        avgScore: avgScore !== null ? Math.round(avgScore * 10) / 10 : null,
        fullPipeline,
        auditEvents: auditCurrent,
        activeSessions: topSessions.length,
      },
      deltas: {
        runs: prevRuns > 0 ? Math.round(((totalRuns - prevRuns) / prevRuns) * 100) : null,
        tokens: prevTokens > 0 ? Math.round(((totalTokens - prevTokens) / prevTokens) * 100) : null,
        score: prevAvgScore !== null && avgScore !== null
          ? Math.round((avgScore - prevAvgScore) * 10) / 10
          : null,
      },
      trend,
      byStatus,
      scoreDist,
      topActions: auditByAction.map(a => ({ action: a.action, count: a._count.id })),
      topSessions: isAdmin
        ? topSessions.map(s => ({ sessionId: s.sessionId, events: s._count.id }))
        : [],
      // AAS v4 — Compound Rate block (new, additive — won't break existing consumers)
      aas: crBlock,
    })
  } catch (err) {
    console.error('[analytics GET]', err)
    return NextResponse.json({ ok: false, error: 'Failed to compute analytics' }, { status: 500 })
  }
}
