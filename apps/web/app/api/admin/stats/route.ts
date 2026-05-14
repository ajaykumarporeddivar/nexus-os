import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 30

/**
 * GET /api/admin/stats
 *
 * Returns platform-wide stats for the admin dashboard.
 * Requires isAdmin === true in the session JWT.
 */
export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const now     = new Date()
  const day7ago = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)
  const day1ago = new Date(now.getTime() - 1  * 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    planCounts,
    recentSignups,
    totalWorkspaces,
    staleWorkspaces,
    schedulerRun,
    jobStats,
    recentJobs,
    recentAudit,
    ideaStats,
    activeSubscriptions,
  ] = await Promise.all([
    // ── Users ─────────────────────────────────────────────────────────────────
    prisma.user.count(),

    prisma.user.groupBy({
      by:      ['plan'],
      _count:  { plan: true },
      orderBy: { _count: { plan: 'desc' } },
    }),

    prisma.user.count({
      where: { createdAt: { gte: day7ago } },
    }),

    // ── Workspaces ────────────────────────────────────────────────────────────
    prisma.workspace.count(),

    prisma.workspaceIntelligenceProfile.count({
      where: {
        OR: [
          { lastGeneratedAt: null },
          {
            lastGeneratedAt: {
              lt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            },
          },
        ],
      },
    }),

    // Most recent scheduler audit event
    prisma.auditEvent.findFirst({
      where:   { action: 'workspace_scheduler_run' },
      orderBy: { createdAt: 'desc' },
      select:  { createdAt: true, meta: true },
    }),

    // ── Generation jobs (last 24h) ─────────────────────────────────────────
    prisma.workspaceGenerationJob.groupBy({
      by:     ['status'],
      _count: { status: true },
      where:  { startedAt: { gte: day1ago } },
    }),

    prisma.workspaceGenerationJob.findMany({
      take:    10,
      orderBy: { startedAt: 'desc' },
      select: {
        id:             true,
        workspaceId:    true,
        status:         true,
        startedAt:      true,
        completedAt:    true,
        ideasGenerated: true,
        workspace: { select: { name: true } },
      },
    }),

    // ── Audit events (last 20) ────────────────────────────────────────────
    prisma.auditEvent.findMany({
      take:    20,
      orderBy: { createdAt: 'desc' },
      select: {
        id:        true,
        action:    true,
        userId:    true,
        createdAt: true,
        meta:      true,
      },
    }),

    // ── Ideas ─────────────────────────────────────────────────────────────
    prisma.workspaceIdea.groupBy({
      by:     ['status'],
      _count: { status: true },
    }),

    // ── Active subscriptions ──────────────────────────────────────────────
    prisma.subscription.count({
      where: { status: 'active', expiresAt: { gte: now } },
    }),
  ])

  // Shape plan counts into a plain object
  const plans: Record<string, number> = {}
  for (const p of planCounts) {
    plans[p.plan ?? 'free'] = p._count.plan
  }

  // Shape job status counts
  const jobs24h: Record<string, number> = {}
  for (const j of jobStats) {
    jobs24h[j.status] = j._count.status
  }

  // Shape idea status counts
  const ideas: Record<string, number> = {}
  for (const i of ideaStats) {
    ideas[i.status ?? 'unknown'] = i._count.status
  }

  return NextResponse.json({
    ok: true,
    data: {
      users: {
        total:         totalUsers,
        newLast7Days:  recentSignups,
        byPlan:        plans,
        activeSubs:    activeSubscriptions,
      },
      workspaces: {
        total:           totalWorkspaces,
        staleForRefresh: staleWorkspaces,
      },
      scheduler: {
        lastRun:    schedulerRun?.createdAt ?? null,
        lastResult: schedulerRun?.meta      ?? null,
      },
      jobs24h,
      recentJobs,
      ideas,
      recentAudit,
    },
  })
}
