import { NextRequest, NextResponse } from 'next/server'
import { checkQuota, checkTokenQuota, decrementQuota, incrementQuota, resetQuota, PLAN_RUN_LIMITS, PLAN_TOKEN_LIMITS } from '@/lib/quota'
import { requireSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const sessionId = auth.user.id!
  const plan    = auth.user.plan    ?? 'free'
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
  const plan    = auth.user.plan    ?? 'free'
  const isAdmin = auth.user.isAdmin ?? false

  // Admin users have unlimited runs — skip quota check
  if (!isAdmin) {
    const status = await checkQuota(sessionId, plan, false)
    if (!status.ok) {
      return NextResponse.json(
        { ok: false, error: `Monthly limit reached (${status.count}/${status.limit} runs). Upgrade to Agency for unlimited runs.`, data: status },
        { status: 429 }
      )
    }
    await incrementQuota(sessionId, plan, isAdmin)
  }

  return NextResponse.json({ ok: true, data: { incremented: !isAdmin } })
}

// Refund one reserved pipeline run when launch fails before any AI call succeeds.
export async function PATCH(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const sessionId = auth.user.id!
  const plan    = auth.user.plan    ?? 'free'
  const isAdmin = auth.user.isAdmin ?? false

  const status = await decrementQuota(sessionId, plan, isAdmin)
  return NextResponse.json({ ok: true, data: { refunded: !isAdmin, ...status } })
}

// Admin or self: reset quota counters (clears inflated counters from bugs)
export async function DELETE(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const sessionId = auth.user.id!
  const isAdmin   = auth.user.isAdmin ?? false

  // Allow admin to reset any user, or user to reset their own quota
  const body    = await req.json().catch(() => ({}))
  const targetId = (isAdmin && body.userId) ? body.userId : sessionId

  await resetQuota(targetId)
  return NextResponse.json({ ok: true, message: `Quota reset for ${targetId}` })
}
