/**
 * AAS v4 — Phase 05: Fatigue Zone computation
 *
 * Zones (hard stops — no override):
 *   green  — full capacity. All decision types permitted.
 *   yellow — restricted. Block: irreversible decisions, new pipeline additions.
 *            Permit: reversible actions, review tasks, scheduled execution.
 *   red    — hard stop. Block ALL strategic decisions. Queue everything.
 *
 * Inputs derived from live DB data — no additional infrastructure required.
 */

import { prisma } from '@/lib/prisma'

export type FatigueZone = 'green' | 'yellow' | 'red'

export interface FatigueState {
  zone:            FatigueZone
  reason:          string
  metrics: {
    runsToday:       number
    dailyCap:        number
    utilizationPct:  number
    recentFailures:  number   // failures in last 60 min
    cascadeFlag:     boolean  // true if 3+ phase-early exits in last hour
  }
}

// Daily run caps per plan (separate from monthly quota — daily throughput limit)
const DAILY_CAP: Record<string, number> = {
  free:       5,
  starter:    15,
  agency:     60,
  enterprise: 500,
}

// A run is considered a "failure" if it exited before phase 4 (pipeline collapsed early)
const FAILURE_PHASE_THRESHOLD = 4
const CASCADE_THRESHOLD       = 3   // 3+ failures in 60 min → cascade flag
const YELLOW_UTILIZATION      = 0.6 // 60% of daily cap
const RED_UTILIZATION         = 0.85

export async function computeFatigueZone(plan = 'free'): Promise<FatigueState> {
  const dailyCap = DAILY_CAP[plan] ?? DAILY_CAP.free

  const now        = new Date()
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  // Parallel: today's run count + recent failures in last hour
  const [runsToday, recentExecs] = await Promise.all([
    prisma.execution.count({
      where: { createdAt: { gte: startOfDay } },
    }),
    prisma.execution.findMany({
      where:  { createdAt: { gte: oneHourAgo } },
      select: { phases: true },
    }),
  ])

  const recentFailures = recentExecs.filter(
    e => e.phases.length < FAILURE_PHASE_THRESHOLD
  ).length
  const cascadeFlag    = recentFailures >= CASCADE_THRESHOLD

  const utilizationPct = dailyCap === Infinity ? 0 : runsToday / dailyCap

  const metrics = { runsToday, dailyCap, utilizationPct, recentFailures, cascadeFlag }

  // Red: hard stop
  if (cascadeFlag) {
    return { zone: 'red', reason: `cascade_flag: ${recentFailures} pipeline failures in last 60 min`, metrics }
  }
  if (utilizationPct >= RED_UTILIZATION) {
    return { zone: 'red', reason: `utilization_cap: ${runsToday}/${dailyCap} daily runs (${Math.round(utilizationPct * 100)}%)`, metrics }
  }

  // Yellow: restricted
  if (utilizationPct >= YELLOW_UTILIZATION || recentFailures >= 2) {
    const reason = recentFailures >= 2
      ? `recent_failures: ${recentFailures} failures in last 60 min`
      : `utilization_high: ${Math.round(utilizationPct * 100)}% of daily cap`
    return { zone: 'yellow', reason, metrics }
  }

  // Green: full capacity
  return {
    zone:    'green',
    reason:  'nominal',
    metrics,
  }
}

// Enforce zone gate. Returns null if allowed, or an error object to return immediately.
export function enforceZoneGate(
  state:       FatigueState,
  irreversible: boolean,
): { blocked: true; zone: FatigueZone; reason: string } | null {
  if (state.zone === 'red') {
    return { blocked: true, zone: 'red', reason: state.reason }
  }
  if (state.zone === 'yellow' && irreversible) {
    return { blocked: true, zone: 'yellow', reason: `irreversible_blocked_in_yellow: ${state.reason}` }
  }
  return null
}
