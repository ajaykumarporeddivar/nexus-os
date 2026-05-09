import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from './authOptions'
import { prisma } from './prisma'
import { brand } from './brand'

export type Plan = 'free' | 'starter' | 'agency' | 'enterprise'

export function isValidPlan(p: string): p is Plan {
  return ['free', 'starter', 'agency', 'enterprise'].includes(p)
}

export function planRank(p: Plan): number {
  return { free: 0, starter: 1, agency: 2, enterprise: 3 }[p]
}

export function requiresPlan(userPlan: Plan, minPlan: Plan): boolean {
  return planRank(userPlan) >= planRank(minPlan)
}

export function planLimitError(feature: string, required: Plan) {
  const labels: Record<Plan, string> = {
    free:       'a free account',
    starter:    'Starter (₹49,000/mo)',
    agency:     'Agency (₹1,20,000/mo)',
    enterprise: 'Enterprise',
  }
  return {
    ok: false,
    error: `${feature} requires ${labels[required]}. Upgrade at ${brand.domain}/pricing.`,
    upgrade: required,
  }
}

// Check if the user's active subscription is still valid (within 30-day window).
// Returns their plan if valid, 'free' if expired.
async function resolveSubscriptionPlan(userId: string, jwtPlan: string): Promise<Plan> {
  // Enterprise is managed manually — never auto-expire
  if (jwtPlan === 'enterprise') return 'enterprise'
  // free never needs a subscription record
  if (jwtPlan === 'free') return 'free'

  try {
    const active = await prisma.subscription.findFirst({
      where: {
        userId,
        status: 'active',
        expiresAt: { gte: new Date() },
      },
      orderBy: { activatedAt: 'desc' },
      select: { plan: true, expiresAt: true },
    })

    if (active && isValidPlan(active.plan)) return active.plan as Plan

    // No valid subscription — downgrade to free and update DB
    await prisma.user.update({
      where: { id: userId },
      data: { plan: 'free' },
    }).catch(console.error)

    return 'free'
  } catch {
    // DB unavailable — trust JWT plan as fallback
    return isValidPlan(jwtPlan) ? jwtPlan as Plan : 'free'
  }
}

// Plans stored in session.user.plan (set after payment verification).
// Falls back to header x-plan (for API-key-based access) then 'free'.
// Always validates subscription expiry for paid plans.
export async function getPlan(req?: NextRequest): Promise<Plan> {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; plan?: string } | null
    const sessionPlan = user?.plan
    const userId = user?.id

    if (sessionPlan && isValidPlan(sessionPlan) && userId) {
      // Validate subscription is still active (non-free plans only)
      if (sessionPlan !== 'free') {
        return await resolveSubscriptionPlan(userId, sessionPlan)
      }
      return sessionPlan as Plan
    }
  } catch {
    // getServerSession may fail in edge/non-auth contexts
  }

  return 'free'
}

// ─── Server-side auth helpers ─────────────────────────────────────────────────

type SessionUser = { id?: string; plan?: string; isAdmin?: boolean }

/** Returns the session user or a 401 response. */
export async function requireSession(): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const session = await getServerSession(authOptions)
  const user = session?.user as SessionUser | null
  if (!user?.id) {
    return {
      user: null,
      error: NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 }),
    }
  }
  return { user, error: null }
}

/** Returns the session user (admin only) or a 401/403 response. */
export async function requireAdmin(): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const result = await requireSession()
  if (result.error) return result
  if (!result.user.isAdmin) {
    return {
      user: null,
      error: NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 }),
    }
  }
  return result
}
