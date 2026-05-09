import { NextResponse } from 'next/server'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexus-os.ai'

const PAGES = [
  { path: '/shell?page=overview',   priority: '1.0', changefreq: 'weekly' },
  { path: '/shell?page=pricing',    priority: '0.9', changefreq: 'monthly' },
  { path: '/shell?page=forge',      priority: '0.8', changefreq: 'weekly' },
  { path: '/shell?page=reasoning',  priority: '0.8', changefreq: 'weekly' },
  { path: '/shell?page=vault',      priority: '0.7', changefreq: 'weekly' },
  { path: '/shell?page=dashboard',  priority: '0.6', changefreq: 'daily' },
  { path: '/shell?page=deploy',     priority: '0.5', changefreq: 'monthly' },
  { path: '/shell?page=runtime',    priority: '0.5', changefreq: 'monthly' },
]

export async function GET() {
  const now = new Date().toISOString().split('T')[0]

  const urls = PAGES.map(p => `
  <url>
    <loc>${BASE}${p.path}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
