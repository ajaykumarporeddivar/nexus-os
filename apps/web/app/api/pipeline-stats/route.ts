import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Public endpoint — no auth required. Used on landing pages and OG images.
export async function GET() {
  try {
    const [totalRuns, successRuns, totalUsers] = await Promise.all([
      prisma.execution.count(),
      prisma.execution.count({ where: { status: 'COMPLETE' } }),
      prisma.user.count(),
    ])

    // Avg files per successful run (proxy for output quality)
    const avgFilesResult = await prisma.execution.aggregate({
      _avg: { fileCount: true },
      where: { status: 'COMPLETE' },
    })
    const avgFiles = Math.round(avgFilesResult._avg.fileCount ?? 0)

    const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0

    return NextResponse.json({
      ok: true,
      data: {
        totalRuns,
        successRuns,
        successRate,
        totalUsers,
        avgFiles,
        // Human-readable social proof stats
        appsDeployed: successRuns,
        agentsPerRun: 19,
        avgBuildTime: '8–14 min',
      },
    })
  } catch {
    // Return safe defaults if DB is unavailable — never 500 on public endpoint
    return NextResponse.json({
      ok: true,
      data: {
        totalRuns: 0, successRuns: 0, successRate: 0,
        totalUsers: 0, avgFiles: 0,
        appsDeployed: 0, agentsPerRun: 19, avgBuildTime: '8–14 min',
      },
    })
  }
}
