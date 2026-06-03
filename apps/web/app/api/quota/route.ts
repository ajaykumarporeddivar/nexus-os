import { NextRequest, NextResponse } from 'next/server'
import { checkQuota, checkTokenQuota, decrementQuota, incrementQuota, resetQuota, PLAN_RUN_LIMITS, PLAN_TOKEN_LIMITS } from '@/lib/quota'
import { requireSession, getPlan } from '@/lib/session'

export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const sessionId = auth.user.id!
  const plan    = await getPlan(req)
  const isAdmin = auth.user.isAdmin ?? false

  // ?tokens=1 — return token quota status instead of run quota
  const url = new URL(req.url)
  if (url.searchParams.get('tokens') === '1') {
    const tokenStatus = await checkTokenQuota(sessionId, plan, isAdmin)
    return NextResponse.json({ ok: true, data: tokenStatus })
  }

  const status  = await checkQuota(sessionId, plan, isAdmin)
  return NextResponse.json({
    ok: true,
    data: {
      ...status,
      plan,
      runLimit:   isAdmin ? Infinity : (PLAN_RUN_LIMITS[plan]   ?? 3),
      tokenLimit: isAdmin ? Infinity : (PLAN_TOKEN_LIMITS[plan]  ?? 300_000),
    },
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const sessionId = auth.user.id!
  const plan    = await getPlan(req)
  const isAdmin = auth.user.isAdmin ?? false

  // Admin users have unlimited runs — skip quota check.
  // incrementQuota is atomic: checks AND increments in one Redis operation.
  if (!isAdmin) {
    const result = await incrementQuota(sessionId, plan, false)
    if (result.exceeded) {
      return NextResponse.json(
        { ok: false, error: `Monthly limit reached (${result.count}/${result.limit} runs). Upgrade to Agency for unlimited runs.`, data: result },
        { status: 429 }
      )
    }
  }

  return NextResponse.json({ ok: true, data: { incremented: !isAdmin } })
}

// Refund one reserved pipeline run when launch fails before any AI call succeeds.
export async function PATCH(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const sessionId = auth.user.id!
  const plan    = await getPlan(req)
  const isAdmin = auth.user.isAdmin ?? false

  const status = await decrementQuota(sessionId, plan, isAdmin)
  return NextResponse.json({ ok: true, data: { refunded: !isAdmin, ...status } })
}

// Admin or self: reset quota counters (clears inflated counters from bugs)
// ?target=runs  — reset run counter only (token usage preserved)
// ?target=tokens — reset token counter only
// ?target=all   — reset both (default for admin; 'runs' default for self to avoid wiping token history)
export async function DELETE(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const sessionId = auth.user.id!
  const isAdmin   = auth.user.isAdmin ?? false

  const url    = new URL(req.url)
  const body   = await req.json().catch(() => ({}))
  const targetId = (isAdmin && body.userId) ? body.userId : sessionId

  // Non-admin auto-resets (inflation detection) should only clear run counter,
  // preserving accurate token usage history.
  const rawTarget = url.searchParams.get('target') ?? (isAdmin ? 'all' : 'runs')
  const target = (['all', 'runs', 'tokens'] as const).includes(rawTarget as 'all' | 'runs' | 'tokens')
    ? rawTarget as 'all' | 'runs' | 'tokens'
    : 'runs'

  await resetQuota(targetId, target)
  return NextResponse.json({ ok: true, message: `Quota (${target}) reset for ${targetId}` })
}
