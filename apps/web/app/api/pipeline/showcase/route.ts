/**
 * GET /api/pipeline/showcase
 *
 * Returns recent NEXUS-generated SharedRuns for the Trending showcase.
 * Includes niche metadata from NicheVault for richer display.
 *
 * Public — no auth required. Cache-friendly (revalidate every hour).
 */

import { NextResponse }     from 'next/server'
import { prisma }           from '@/lib/prisma'
import { getNicheById }     from '@/lib/nicheVault'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'

export async function GET() {
  try {
    // Fetch SharedRuns that were created by the daily niche generator
    // (slugs follow the pattern "niche-<nicheId>-<dateKey>")
    const runs = await prisma.sharedRun.findMany({
      where: {
        slug: { startsWith: 'niche-' },
      },
      orderBy: { createdAt: 'desc' },
      take:    20,
      select: {
        id:          true,
        slug:        true,
        projectName: true,
        brief:       true,
        vertical:    true,
        liveUrl:     true,
        qaScore:     true,
        elapsedSec:  true,
        viewCount:   true,
        createdAt:   true,
      },
    })

    // Enrich with NicheVault metadata
    const enriched = runs.map(run => {
      // Extract nicheId from slug: "niche-{nicheId}-{dateKey}"
      const parts   = run.slug.split('-')
      // Remove first ("niche") and last (date "YYYY-MM-DD" → 3 parts)
      const nicheId = parts.slice(1, -3).join('-')
      const niche   = getNicheById(nicheId)
      return {
        ...run,
        nicheId:      nicheId || null,
        tagline:      niche?.tagline      ?? null,
        tier:         niche?.tier         ?? null,
        pricing:      niche?.pricing      ?? null,
        mrrPotential: niche?.mrrPotential ?? null,
        targetICPs:   niche?.targetICPs   ?? [],
        category:     niche?.category     ?? run.vertical,
        tags:         niche?.tags         ?? [],
        painPoint:    niche?.painPoint    ?? null,
        dateKey:      run.slug.slice(-10), // last 10 chars = "YYYY-MM-DD"
      }
    })

    return NextResponse.json(
      { ok: true, data: enriched, total: enriched.length },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' } }
    )
  } catch (err) {
    console.error('[showcase] error:', err)
    return NextResponse.json({ ok: false, error: 'Failed to load showcase' }, { status: 500 })
  }
}
