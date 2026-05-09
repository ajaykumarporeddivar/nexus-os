import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Public API routes that never require auth (webhooks, health, public data)
const PUBLIC_API = new Set([
  '/api/health',
  '/api/pipeline-stats',
  '/api/demo-booking',
  '/api/checkout',
  '/api/checkout/verify',
  '/api/whatsapp/send',
  '/api/groq/stream',
])

// Public page routes
const PUBLIC_PAGES = new Set([
  '/',
  '/auth/signin',
])

// Query-param-based public pages on /shell — accessible without login
// 'pricing' lets anyone pay; 'pipeline' lets anyone see the pipeline demo
const PUBLIC_SHELL_PAGES = new Set(['pricing', 'pipeline', 'overview'])

export default withAuth(
  function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl

    // Allow all /api/auth routes (NextAuth internals)
    if (pathname.startsWith('/api/auth')) {
      return NextResponse.next()
    }

    // Allow explicitly public API routes
    if (PUBLIC_API.has(pathname)) {
      return NextResponse.next()
    }

    // Allow public pages
    if (PUBLIC_PAGES.has(pathname)) {
      return NextResponse.next()
    }

    // Allow /shell with public page query params (e.g. ?page=pricing for shared links)
    if (pathname === '/shell') {
      const page = req.nextUrl.searchParams.get('page')
      if (page && PUBLIC_SHELL_PAGES.has(page)) return NextResponse.next()
    }

    // Cron/eval routes: require CRON_SECRET header, not a user session
    if (
      pathname === '/api/monitor' ||
      pathname === '/api/learning/cycle' ||
      pathname === '/api/learning/weekly' ||
      pathname === '/api/learning/quarantine' ||
      pathname === '/api/learning/update-deltas' ||
      pathname === '/api/eval' ||
      pathname === '/api/trending' ||
      pathname === '/api/cron/trending' ||
      pathname === '/api/regime' ||
      pathname === '/api/agent/run'
    ) {
      const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
      if (secret === process.env.CRON_SECRET) return NextResponse.next()
      // Fall through to auth check — block if no cron secret and no session
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      // Allow the request if:
      // 1. It's a public API/page (handled above by early returns, but withAuth also checks)
      // 2. There's a valid session token
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl

        // Always allow NextAuth routes
        if (pathname.startsWith('/api/auth')) return true

        // Always allow health + checkout + public APIs (payment flow must work even logged-out)
        if (
          pathname === '/api/health' ||
          pathname === '/api/pipeline-stats' ||
          pathname.startsWith('/api/checkout') ||
          pathname === '/api/demo-booking' ||
          pathname === '/api/whatsapp/send' ||
          pathname === '/api/groq/stream' ||
          pathname === '/auth/signin' ||
          pathname === '/'
        ) return true

        // Allow /shell?page=pricing and other public shell pages without login
        if (pathname === '/shell') {
          const page = req.nextUrl.searchParams.get('page')
          if (page && PUBLIC_SHELL_PAGES.has(page)) return true
        }

        // Cron routes: allow if they have a valid cron secret (checked inside middleware fn)
        if (
          pathname === '/api/monitor' ||
          pathname === '/api/learning/cycle' ||
          pathname === '/api/learning/weekly' ||
          pathname === '/api/learning/quarantine' ||
          pathname === '/api/learning/update-deltas' ||
          pathname === '/api/eval' ||
          pathname === '/api/trending' ||
          pathname === '/api/cron/trending' ||
          pathname === '/api/regime' ||
          pathname === '/api/agent/run'
        ) return true

        // Everything else — require a session
        return !!token
      },
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
)

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml, llms.txt (public files)
     * - /public/ files
     */
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|llms\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)$).*)',
  ],
}
