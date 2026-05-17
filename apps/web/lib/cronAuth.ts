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

export function verifyCronRequest(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return null   // dev/test — allow through

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null

  // Also accept x-nexus-internal for internal server→server calls
  const internal = req.headers.get('x-nexus-internal')
  const internalSecret = process.env.INTERNAL_API_SECRET

  if (token === secret) return null
  if (internalSecret && internal === internalSecret) return null

  return NextResponse.json(
    { ok: false, error: 'Unauthorized — invalid cron secret' },
    { status: 401 },
  )
}
