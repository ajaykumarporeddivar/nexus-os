import { NextRequest, NextResponse } from 'next/server'
import { checkQuota, incrementQuota, PLAN_RUN_LIMITS, PLAN_TOKEN_LIMITS } from '@/lib/quota'
import { requireSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const sessionId = auth.user.id!
  const plan = auth.user.plan ?? 'free'
  const status = await checkQuota(sessionId, plan)
  return NextResponse.json({
    ok: true,
    data: {
      ...status,
      plan,
      runLimit:   PLAN_RUN_LIMITS[plan]  ?? 3,
      tokenLimit: PLAN_TOKEN_LIMITS[plan] ?? 10_000,
    },
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const sessionId = auth.user.id!
  const plan = auth.user.plan ?? 'free'
  const status = await checkQuota(sessionId, plan)
  if (!status.ok) {
    return NextResponse.json(
      { ok: false, error: `Monthly limit reached (${status.count}/${status.limit} runs). Upgrade to Agency for unlimited runs.`, data: status },
      { status: 429 }
    )
  }
  const result = await incrementQuota(sessionId, plan)
  return NextResponse.json({ ok: true, data: result })
}
