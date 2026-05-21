/**
 * GET /api/cron/lead-post-conversion
 * Cron: daily 11 AM — "0 11 * * *"
 *
 * Handles three post-conversion lifecycle triggers:
 *   1. Onboarding questionnaire — converted leads not yet sent the form
 *   2. Referral CTA             — 3 days after onboarding form
 *   3. Retainer pitch           — 30 days after deliveredAt
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cronAuth'
import { prisma } from '@/lib/prisma'
import {
  sendOnboardingQuestionnaire,
  sendRetainerPitch,
  sendReferralCta,
} from '@/lib/leadOnboarding'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authErr = verifyCronRequest(req)
  if (authErr) return authErr

  const now         = new Date()
  const day30ago    = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const day3ago     = new Date(now.getTime() -  3 * 24 * 60 * 60 * 1000)

  // 1. Onboarding: converted leads without onboardingFormSentAt
  const needsOnboarding = await prisma.lead.findMany({
    where: { status: 'converted', onboardingFormSentAt: null, consentCaptured: true },
    select: { id: true },
    take: 20,
  })

  // 2. Retainer pitch: delivered 30+ days ago, not yet pitched
  const needsRetainerPitch = await prisma.lead.findMany({
    where: {
      status:            { in: ['converted', 'retainer_active'] },
      deliveredAt:       { lte: day30ago },
      retainerPitchedAt: null,
      consentCaptured:   true,
    },
    select: { id: true },
    take: 20,
  })

  // 3. Referral CTA: onboarding form sent 3+ days ago, not yet referred
  const needsReferral = await prisma.lead.findMany({
    where: {
      status:               { in: ['converted', 'retainer_active'] },
      onboardingFormSentAt: { lte: day3ago },
      consentCaptured:      true,
    },
    select: { id: true },
    take: 20,
  })

  const results = {
    onboarding: { sent: 0, skipped: 0 },
    retainer:   { sent: 0, skipped: 0 },
    referral:   { sent: 0, skipped: 0 },
  }

  await Promise.allSettled([
    ...needsOnboarding.map(async ({ id }) => {
      const ok = await sendOnboardingQuestionnaire(id).catch(e => { console.error('[post-conv] onboarding failed:', e); return false })
      ok ? results.onboarding.sent++ : results.onboarding.skipped++
    }),
    ...needsRetainerPitch.map(async ({ id }) => {
      const ok = await sendRetainerPitch(id).catch(e => { console.error('[post-conv] retainer failed:', e); return false })
      ok ? results.retainer.sent++ : results.retainer.skipped++
    }),
    ...needsReferral.map(async ({ id }) => {
      const ok = await sendReferralCta(id).catch(e => { console.error('[post-conv] referral failed:', e); return false })
      ok ? results.referral.sent++ : results.referral.skipped++
    }),
  ])

  console.log('[lead-post-conversion]', JSON.stringify(results))
  return NextResponse.json({ ok: true, ...results })
}
