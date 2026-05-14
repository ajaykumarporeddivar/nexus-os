import { NextResponse } from 'next/server'
import { INDUSTRY_TAXONOMY } from '@/lib/industryTaxonomy'

/**
 * GET /api/categories
 * Returns the full industry taxonomy tree.
 * Public endpoint — no auth required (static data).
 */
export async function GET() {
  return NextResponse.json(
    { ok: true, data: { taxonomy: INDUSTRY_TAXONOMY } },
    {
      headers: {
        // Cache for 24 hours — taxonomy changes infrequently
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      },
    },
  )
}
