/**
 * pipelineState.ts — Redis-backed save/resume for server-side pipeline runs.
 *
 * Key format : pipeline:{runId}
 * TTL        : PIPELINE_STATE_TTL_SECONDS env var (default 3600 = 1 hour)
 * Fallback   : in-memory Map (dev / no Redis) — lost on restart, fine for single-process dev
 *
 * Used by:
 *   - apps/web/lib/orchestrator.ts  — saves state after each step
 *   - apps/web/app/api/pipeline/status/[runId]/route.ts — reads state for polling
 *   - apps/web/app/api/cron/self-heal/route.ts — reads stalled runs for recovery
 */

import { Redis } from '@upstash/redis'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PipelineStep = 'forge' | 'build' | 'deploy'
export type PipelineRunStatus = 'running' | 'completed' | 'failed' | 'stalled'

export interface StepState {
  status:     'pending' | 'running' | 'done' | 'failed'
  startedAt?: string
  doneAt?:    string
  durationMs?: number
  error?:     string
  data?:      unknown
}

export interface PipelineRunState {
  runId:       string
  task:        string
  projectName: string
  triggeredBy: string
  createdAt:   string
  updatedAt:   string
  status:      PipelineRunStatus
  currentStep: PipelineStep | 'done'
  steps: {
    forge:  StepState
    build:  StepState
    deploy: StepState
  }
  error?:    string
  totalMs?:  number
}

// ─── Redis client ──────────────────────────────────────────────────────────────

let _redis: Redis | null = null
function getRedis(): Redis | null {
  if (_redis) return _redis
  const url   = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (url && token && url.startsWith('https://')) {
    _redis = new Redis({ url, token })
  }
  return _redis
}

function stateTtl(): number {
  const v = parseInt(process.env.PIPELINE_STATE_TTL_SECONDS ?? '', 10)
  return Number.isFinite(v) && v > 0 ? v : 3600   // default: 1 hour
}

function redisKey(runId: string): string {
  return `pipeline:${runId}`
}

// Sorted set that tracks active run IDs by createdAt timestamp.
// Lets getStalledRuns scan just the active set instead of KEYS pipeline:*.
const ACTIVE_RUNS_KEY = 'pipeline:_active_runs'

// ─── In-memory fallback ────────────────────────────────────────────────────────

const memStore = new Map<string, { state: PipelineRunState; expiresAt: number }>()

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new run entry (call at pipeline start).
 */
export async function createPipelineRun(
  runId:       string,
  task:        string,
  projectName: string,
  triggeredBy: string,
): Promise<PipelineRunState> {
  const now   = new Date().toISOString()
  const state: PipelineRunState = {
    runId, task, projectName, triggeredBy,
    createdAt:   now,
    updatedAt:   now,
    status:      'running',
    currentStep: 'forge',
    steps: {
      forge:  { status: 'pending' },
      build:  { status: 'pending' },
      deploy: { status: 'pending' },
    },
  }
  await savePipelineState(state)
  // Register in active-runs sorted set (score = epoch ms for range queries)
  const redis = getRedis()
  if (redis) {
    const score = Date.now()
    await redis.zadd(ACTIVE_RUNS_KEY, { score, member: runId }).catch(() => {})
    // Expire the set itself in 24h so it doesn't accumulate forever
    await redis.expire(ACTIVE_RUNS_KEY, 86400).catch(() => {})
  }
  return state
}

/**
 * Save / overwrite full run state in Redis (or in-memory fallback).
 */
export async function savePipelineState(state: PipelineRunState): Promise<void> {
  state.updatedAt = new Date().toISOString()
  const redis = getRedis()
  const ttl   = stateTtl()
  try {
    if (redis) {
      await redis.set(redisKey(state.runId), JSON.stringify(state), { ex: ttl })
    } else {
      memStore.set(state.runId, { state: structuredClone(state), expiresAt: Date.now() + ttl * 1000 })
    }
  } catch (err) {
    console.error('[pipelineState] save failed:', err)
  }
}

/**
 * Load run state by runId.  Returns null if not found or expired.
 */
export async function getPipelineState(runId: string): Promise<PipelineRunState | null> {
  const redis = getRedis()
  try {
    if (redis) {
      const raw = await redis.get<string>(redisKey(runId))
      if (!raw) return null
      return typeof raw === 'string' ? JSON.parse(raw) as PipelineRunState : raw as PipelineRunState
    }
    const entry = memStore.get(runId)
    if (!entry || Date.now() > entry.expiresAt) return null
    return structuredClone(entry.state)
  } catch (err) {
    console.error('[pipelineState] get failed:', err)
    return null
  }
}

/**
 * Update a single step's state (merges into existing state).
 */
export async function updatePipelineStep(
  runId:  string,
  step:   PipelineStep,
  update: Partial<StepState>,
): Promise<void> {
  const state = await getPipelineState(runId)
  if (!state) return
  state.steps[step] = { ...state.steps[step], ...update }
  if (update.status === 'running') state.currentStep = step
  await savePipelineState(state)
}

/**
 * Mark the run as completed (ok or failed).
 */
export async function completePipelineRun(
  runId:    string,
  ok:       boolean,
  totalMs:  number,
  error?:   string,
): Promise<void> {
  const state = await getPipelineState(runId)
  if (!state) return
  state.status      = ok ? 'completed' : 'failed'
  state.currentStep = 'done'
  state.totalMs     = totalMs
  if (error) state.error = error
  await savePipelineState(state)
  // Remove from active-runs sorted set
  const redis = getRedis()
  if (redis) await redis.zrem(ACTIVE_RUNS_KEY, runId).catch(() => {})
}

/**
 * Return all stalled runs (running but updatedAt > stalledAfterMs ago).
 *
 * Uses a sorted set (pipeline:_active_runs) so we only scan runs that were
 * registered as active — avoids the O(N) KEYS pipeline:* scan.
 * Runs created before this sorted-set approach (legacy) are not found here,
 * but they will naturally expire via their individual TTLs.
 */
export async function getStalledRuns(stalledAfterMs = 300_000): Promise<PipelineRunState[]> {
  const redis  = getRedis()
  const cutoff = new Date(Date.now() - stalledAfterMs).toISOString()
  const stalled: PipelineRunState[] = []

  if (redis) {
    try {
      // Fetch all members of the active-runs set (bounded: completed runs remove themselves)
      const runIds = await redis.zrange(ACTIVE_RUNS_KEY, 0, -1) as string[]
      await Promise.all(runIds.map(async (runId) => {
        try {
          const raw = await redis.get<string>(redisKey(runId))
          if (!raw) {
            // Key expired but set entry wasn't cleaned up — remove stale member
            await redis.zrem(ACTIVE_RUNS_KEY, runId).catch(() => {})
            return
          }
          const s: PipelineRunState = typeof raw === 'string' ? JSON.parse(raw) : raw
          if (s.status === 'running' && s.updatedAt < cutoff) stalled.push(s)
        } catch {
          // Skip malformed entries
        }
      }))
    } catch (err) {
      console.error('[pipelineState] getStalledRuns failed:', err)
    }
  } else {
    for (const [, entry] of memStore) {
      if (Date.now() > entry.expiresAt) continue
      const s = entry.state
      if (s.status === 'running' && s.updatedAt < cutoff) stalled.push(s)
    }
  }
  return stalled
}
