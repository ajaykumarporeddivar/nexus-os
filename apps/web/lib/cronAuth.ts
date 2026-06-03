/**
 * Vercel Cron authentication helper.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` on every cron invocation.
 * In local dev (CRON_SECRET unset) we skip the check so `curl` calls still work.
 *
 * Usage:
 *   import { verifyCronRequest } from '@/lib/cronAuth'
 *   export async function GET(req: NextRequest) {
 *     const err = verifyCronRequest(req)
 *     if (err) return err
 *     ...
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'

// Constant-time string comparison — prevents timing-attack secret enumeration.
// Works in both Node.js and Edge Runtime (uses TextEncoder, a standard Web API).
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const aBytes = enc.encode(a)
  const bBytes = enc.encode(b)
  if (aBytes.length !== bBytes.length) {
    // Still scan to avoid length-based timing leak
    let dummy = 0
    for (let i = 0; i < aBytes.length; i++) dummy |= aBytes[i]
    return false
  }
  let result = 0
  for (let i = 0; i < aBytes.length; i++) result |= aBytes[i] ^ bBytes[i]
  return result === 0
}

export function verifyCronRequest(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return null   // dev/test — allow through

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''

  const internal = req.headers.get('x-nexus-internal') ?? ''
  const internalSecret = process.env.INTERNAL_API_SECRET ?? ''

  if (timingSafeEqual(token, secret)) return null
  if (internalSecret && timingSafeEqual(internal, internalSecret)) return null

  return NextResponse.json(
    { ok: false, error: 'Unauthorized — invalid cron secret' },
    { status: 401 },
  )
}
