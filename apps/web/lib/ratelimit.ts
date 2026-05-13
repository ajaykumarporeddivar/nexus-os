// Burst rate limiter — Upstash Ratelimit when Redis is configured, Map-based fallback otherwise.
// Two limiters:
//   checkRateLimit(id)       — authenticated routes: 40 req / 60 s per userId
//   checkPublicRateLimit(ip) — public/unauthenticated routes: 5 req / 60 s per IP

import { NextRequest } from 'next/server'
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

// ─── Config ───────────────────────────────────────────────────────────────────

const AUTH_REQUESTS   = 40
const AUTH_WINDOW     = '60 s'
const PUBLIC_REQUESTS = 5
const PUBLIC_WINDOW   = '60 s'
const WINDOW_MS       = 60_000

// ─── In-memory fallback ───────────────────────────────────────────────────────

const memWindows = new Map<string, { count: number; resetAt: number }>()

function memCheck(identifier: string, max: number): RateLimitResult {
  const now   = Date.now()
  const entry = memWindows.get(identifier)
  if (!entry || now > entry.resetAt) {
    memWindows.set(identifier, { count: 1, resetAt: now + WINDOW_MS })
    return { success: true, remaining: max - 1, reset: now + WINDOW_MS }
  }
  entry.count++
  return { success: entry.count <= max, remaining: Math.max(0, max - entry.count), reset: entry.resetAt }
}

// ─── Upstash limiters (lazy) ──────────────────────────────────────────────────

let _rlAuth:   Ratelimit | null = null
let _rlPublic: Ratelimit | null = null

function getRedis(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (url && token && url.startsWith('https://')) return new Redis({ url, token })
  return null
}

function getAuthLimiter(): Ratelimit | null {
  if (_rlAuth) return _rlAuth
  const r = getRedis()
  if (!r) return null
  _rlAuth = new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(AUTH_REQUESTS, AUTH_WINDOW), prefix: 'rl:auth', analytics: false })
  return _rlAuth
}

function getPublicLimiter(): Ratelimit | null {
  if (_rlPublic) return _rlPublic
  const r = getRedis()
  if (!r) return null
  _rlPublic = new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(PUBLIC_REQUESTS, PUBLIC_WINDOW), prefix: 'rl:pub', analytics: false })
  return _rlPublic
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type RateLimitResult = { success: boolean; remaining: number; reset: number }

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const rl = getAuthLimiter()
  if (!rl) return memCheck(identifier, AUTH_REQUESTS)
  const { success, remaining, reset } = await rl.limit(identifier)
  return { success, remaining, reset: reset * 1000 }
}

export async function checkPublicRateLimit(req: NextRequest): Promise<RateLimitResult> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
         ?? req.headers.get('x-real-ip')
         ?? 'unknown'
  const rl = getPublicLimiter()
  if (!rl) return memCheck(`pub:${ip}`, PUBLIC_REQUESTS)
  const { success, remaining, reset } = await rl.limit(ip)
  return { success, remaining, reset: reset * 1000 }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset':     String(Math.ceil(result.reset / 1000)),
    ...(result.success ? {} : { 'Retry-After': '60' }),
  }
}
