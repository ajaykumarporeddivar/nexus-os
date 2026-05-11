// Quota tracker: Upstash Redis when configured, in-memory Map as fallback.
// Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to enable persistence.

import { Redis } from '@upstash/redis'

// In-memory fallback — resets on restart, fine for dev / non-persistent workloads
const mem = new Map<string, { count: number; expires: number }>()

// Monthly TTL in seconds
function monthTTL(): number {
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return Math.ceil((nextMonth.getTime() - now.getTime()) / 1000)
}

// Upstash client — lazily instantiated, null if env vars are missing
let _redis: Redis | null = null
function getRedis(): Redis | null {
  if (_redis) return _redis
  const url   = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (url && token && url.startsWith('https://')) {
    _redis = new Redis({ url, token })
    return _redis
  }
  return null
}

async function redisGet(key: string): Promise<number> {
  const redis = getRedis()
  if (!redis) {
    const entry = mem.get(key)
    if (!entry || Date.now() > entry.expires) return 0
    return entry.count
  }
  const val = await redis.get<number>(key)
  return val ?? 0
}

async function redisIncr(key: string, delta: number, ttlSeconds: number): Promise<number> {
  const redis = getRedis()
  if (!redis) {
    const entry = mem.get(key)
    const now = Date.now()
    if (!entry || now > entry.expires) {
      mem.set(key, { count: delta, expires: now + ttlSeconds * 1000 })
      return delta
    }
    entry.count += delta
    return entry.count
  }
  // INCRBY + EXPIRE — atomic incrby, then conditionally set TTL on first write
  const newCount = await redis.incrby(key, delta)
  if (newCount === delta) {
    // First write in this period — set expiry
    await redis.expire(key, ttlSeconds)
  }
  return newCount
}

// Run limits per month
export const PLAN_RUN_LIMITS: Record<string, number> = {
  free:       3,
  starter:    20,
  agency:     Infinity,
  enterprise: Infinity,
}

// Token limits per month — a 21-agent pipeline run uses ~25–35K tokens.
// Free (3 runs) → 3 × 35K = ~105K needed; set to 150K to give headroom.
// Starter (20 runs) → 20 × 35K = ~700K needed.
// Agency → unlimited.
export const PLAN_TOKEN_LIMITS: Record<string, number> = {
  free:       150_000,
  starter:    750_000,
  agency:     Infinity,
  enterprise: Infinity,
}

// Legacy alias
export const PLAN_LIMITS = PLAN_RUN_LIMITS

export async function checkQuota(
  sessionId: string,
  plan = 'free',
  isAdmin = false,
): Promise<{ ok: boolean; count: number; limit: number; remaining: number }> {
  if (isAdmin) return { ok: true, count: 0, limit: Infinity, remaining: Infinity }
  const limit = PLAN_RUN_LIMITS[plan] ?? PLAN_RUN_LIMITS.free
  if (limit === Infinity) return { ok: true, count: 0, limit: Infinity, remaining: Infinity }
  const count = await redisGet(`quota:runs:${sessionId}`)
  const remaining = Math.max(0, limit - count)
  return { ok: count < limit, count, limit, remaining }
}

export async function resetQuota(sessionId: string): Promise<void> {
  const redis = getRedis()
  if (redis) {
    await redis.set(`quota:runs:${sessionId}`, 0)
    await redis.set(`quota:tokens:${sessionId}`, 0)
  } else {
    mem.delete(`quota:runs:${sessionId}`)
    mem.delete(`quota:tokens:${sessionId}`)
  }
}

export async function incrementQuota(
  sessionId: string,
  plan = 'free',
): Promise<{ count: number; limit: number; exceeded: boolean }> {
  const limit = PLAN_RUN_LIMITS[plan] ?? PLAN_RUN_LIMITS.free
  if (limit === Infinity) return { count: 0, limit: Infinity, exceeded: false }
  const count = await redisIncr(`quota:runs:${sessionId}`, 1, monthTTL())
  return { count, limit, exceeded: count > limit }
}

export async function checkTokenQuota(
  sessionId: string,
  plan = 'free',
  isAdmin = false,
): Promise<{ ok: boolean; used: number; limit: number; remaining: number }> {
  if (isAdmin) return { ok: true, used: 0, limit: Infinity, remaining: Infinity }
  const limit = PLAN_TOKEN_LIMITS[plan] ?? PLAN_TOKEN_LIMITS.free
  if (limit === Infinity) return { ok: true, used: 0, limit: Infinity, remaining: Infinity }
  const used = await redisGet(`quota:tokens:${sessionId}`)
  const remaining = Math.max(0, limit - used)
  return { ok: used < limit, used, limit, remaining }
}

export async function incrementTokenQuota(
  sessionId: string,
  tokens: number,
  plan = 'free',
): Promise<void> {
  const limit = PLAN_TOKEN_LIMITS[plan] ?? PLAN_TOKEN_LIMITS.free
  if (limit === Infinity || tokens <= 0) return
  await redisIncr(`quota:tokens:${sessionId}`, tokens, monthTTL())
}
