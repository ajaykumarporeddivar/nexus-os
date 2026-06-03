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
  const newCount = await redis.incrby(key, delta)
  if (newCount === delta) await redis.expire(key, ttlSeconds)
  return newCount
}

// Atomic check-and-increment via Lua — returns new count or -1 if limit exceeded.
// Prevents TOCTOU race where two concurrent requests both pass the quota check.
const CHECK_AND_INCR_LUA = `
local current = tonumber(redis.call('GET', KEYS[1])) or 0
local limit = tonumber(ARGV[1])
if current >= limit then return -1 end
local newval = redis.call('INCRBY', KEYS[1], 1)
if newval == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return newval
`

// Atomic bounded decrement — never goes below 0.
const BOUNDED_DECR_LUA = `
local current = tonumber(redis.call('GET', KEYS[1])) or 0
if current <= 0 then return 0 end
return redis.call('DECRBY', KEYS[1], 1)
`

async function atomicCheckAndIncr(key: string, limit: number, ttlSeconds: number): Promise<number> {
  const redis = getRedis()
  if (!redis) {
    // In-memory: JS is single-threaded, so Map operations are safe
    const entry = mem.get(key)
    const now = Date.now()
    const current = (!entry || now > entry.expires) ? 0 : entry.count
    if (current >= limit) return -1
    const newCount = current + 1
    mem.set(key, { count: newCount, expires: now + ttlSeconds * 1000 })
    return newCount
  }
  const result = await redis.eval(CHECK_AND_INCR_LUA, [key], [String(limit), String(ttlSeconds)]) as number
  return result
}

async function atomicBoundedDecr(key: string): Promise<number> {
  const redis = getRedis()
  if (!redis) {
    const entry = mem.get(key)
    const now = Date.now()
    if (!entry || now > entry.expires || entry.count <= 0) return 0
    entry.count = Math.max(0, entry.count - 1)
    return entry.count
  }
  const result = await redis.eval(BOUNDED_DECR_LUA, [key], []) as number
  return result
}

// Run limits per month
export const PLAN_RUN_LIMITS: Record<string, number> = {
  free:       3,
  starter:    20,
  agency:     Infinity,
  enterprise: Infinity,
}

// Token limits per month — a 22-agent pipeline run uses ~55–80K tokens.
// Free (3 runs) → 3 × 80K = ~240K needed; set to 300K with buffer.
// Starter (20 runs) → 20 × 80K = ~1.6M needed.
// Agency / Enterprise → unlimited.
export const PLAN_TOKEN_LIMITS: Record<string, number> = {
  free:       300_000,
  starter:    2_000_000,
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

export async function resetQuota(sessionId: string, target: 'all' | 'runs' | 'tokens' = 'all'): Promise<void> {
  const redis = getRedis()
  const resetRuns   = target === 'all' || target === 'runs'
  const resetTokens = target === 'all' || target === 'tokens'
  if (redis) {
    if (resetRuns)   await redis.set(`quota:runs:${sessionId}`, 0)
    if (resetTokens) await redis.set(`quota:tokens:${sessionId}`, 0)
  } else {
    if (resetRuns)   mem.delete(`quota:runs:${sessionId}`)
    if (resetTokens) mem.delete(`quota:tokens:${sessionId}`)
  }
}

// Atomically checks quota AND increments in one Redis operation.
// Returns exceeded=true if the limit was already reached (count returned as -1).
export async function incrementQuota(
  sessionId: string,
  plan = 'free',
  isAdmin = false,
): Promise<{ count: number; limit: number; exceeded: boolean }> {
  if (isAdmin) return { count: 0, limit: Infinity, exceeded: false }
  const limit = PLAN_RUN_LIMITS[plan] ?? PLAN_RUN_LIMITS.free
  if (limit === Infinity) return { count: 0, limit: Infinity, exceeded: false }
  const result = await atomicCheckAndIncr(`quota:runs:${sessionId}`, limit, monthTTL())
  if (result === -1) {
    const current = await redisGet(`quota:runs:${sessionId}`)
    return { count: current, limit, exceeded: true }
  }
  return { count: result, limit, exceeded: false }
}

// Atomically decrements quota without going below 0.
export async function decrementQuota(
  sessionId: string,
  plan = 'free',
  isAdmin = false,
): Promise<{ count: number; limit: number }> {
  if (isAdmin) return { count: 0, limit: Infinity }
  const limit = PLAN_RUN_LIMITS[plan] ?? PLAN_RUN_LIMITS.free
  if (limit === Infinity) return { count: 0, limit }
  const count = await atomicBoundedDecr(`quota:runs:${sessionId}`)
  return { count, limit }
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
