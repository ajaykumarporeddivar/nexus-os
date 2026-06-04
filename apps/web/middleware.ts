import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { timingSafeEqual } from '@/lib/cronAuth'

// Public API routes that never require auth (webhooks, health, public data)
const PUBLIC_API = new Set([
  '/api/ping',
  '/api/health',
  '/api/pipeline-stats',
  '/api/demo-booking',
  '/api/checkout',
  '/api/checkout/verify',
  '/api/whatsapp/send',
  '/api/groq/stream',
  '/api/categories',        // industry taxonomy — public static data
  '/api/lead-capture',      // pre-auth email capture — no login required
  '/api/lead-event',        // behavioral event sink — client-side, no login required
  '/api/pipeline/showcase', // public showcase of daily-generated apps
  // NOTE: /api/leads POST is allowed below via method-check (G5) — GET stays admin-only
])

// Webhook routes — Razorpay posts here with its own signature, no session
const WEBHOOK_PREFIXES = ['/api/webhook/', '/api/webhooks/']


// Public page routes
const PUBLIC_PAGES = new Set([
  '/',
  '/auth/signin',
  '/terms',
  '/privacy',
  '/og',
  '/unsubscribe',
])

// Query-param-based public pages on /shell — accessible without login
// Public onboarding path: browse ideas -> pipeline demo -> pricing.
const PUBLIC_SHELL_PAGES = new Set(['pricing', 'pipeline', 'overview', 'trending'])

export default withAuth(
  function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl

    // ── UTM cookie capture ─────────────────────────────────────────────────────
    // Store UTM params in a 30-day cookie so they survive the OAuth redirect.
    // The signIn callback reads `nexus_utm` and persists it to the User row.
    const utmSource = req.nextUrl.searchParams.get('utm_source')
    if (utmSource) {
      const utmPayload = JSON.stringify({
        source:   utmSource,
        medium:   req.nextUrl.searchParams.get('utm_medium')   ?? '',
        campaign: req.nextUrl.searchParams.get('utm_campaign') ?? '',
        content:  req.nextUrl.searchParams.get('utm_content')  ?? '',
        term:     req.nextUrl.searchParams.get('utm_term')     ?? '',
      })
      const res = NextResponse.next()
      res.cookies.set('nexus_utm', utmPayload, {
        maxAge:   60 * 60 * 24 * 30, // 30 days
        sameSite: 'lax',
        path:     '/',
        httpOnly: false, // readable by client JS for pre-auth capture form
      })
      // If it's a public route, return early with the cookie set
      if (
        PUBLIC_PAGES.has(pathname) ||
        PUBLIC_API.has(pathname) ||
        pathname.startsWith('/api/auth')
      ) return res
    }

    // Allow all /api/auth routes (NextAuth internals)
    if (pathname.startsWith('/api/auth')) {
      return NextResponse.next()
    }

    // Allow explicitly public API routes
    if (PUBLIC_API.has(pathname)) {
      return NextResponse.next()
    }

    // Allow all webhook routes (Razorpay etc.) — they carry their own HMAC signatures
    if (WEBHOOK_PREFIXES.some(p => pathname.startsWith(p))) {
      return NextResponse.next()
    }

    // Public Trending page needs the global feed before login. POST remains
    // protected below so only authenticated users/cron can refresh data.
    if (pathname === '/api/trending' && req.method === 'GET') {
      return NextResponse.next()
    }

    // Public pipeline pages call these during preflight. Let the route handlers
    // return JSON 401/health payloads instead of middleware redirect HTML.
    if (pathname === '/api/quota') {
      return NextResponse.next()
    }
    if (pathname === '/api/deploy/vercel' && req.method === 'GET') {
      return NextResponse.next()
    }

    // G5: /api/leads POST — allow unauthenticated external CRM/webhook ingestion
    // GET stays auth-required (admin list). Route handler enforces its own rate-limit.
    if (pathname === '/api/leads' && req.method === 'POST') {
      return NextResponse.next()
    }

    // P1: /api/proposals POST — allow internal CRM/webhook ingestion (route handles its own auth)
    if (pathname === '/api/proposals' && req.method === 'POST') {
      return NextResponse.next()
    }

    // N1: /api/leads/convert — auth handled by route itself (INTERNAL_API_SECRET / WEBHOOK_SECRET)
    // Webhook callers (Stripe, Razorpay) have no session cookie — let route check its own secret
    if (pathname === '/api/leads/convert' && req.method === 'POST') {
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

    // Strict cron-only routes: pass if CRON_SECRET present, otherwise fall through to auth check
    if (
      pathname === '/api/monitor' ||
      pathname === '/api/learning/quarantine' ||
      pathname === '/api/learning/update-deltas' ||
      pathname === '/api/eval' ||
      pathname === '/api/cron/trending' ||
      pathname === '/api/cron/workspace-scheduler' ||
      pathname === '/api/cron/subscription-expiry' ||
      pathname === '/api/cron/activate' ||
      pathname === '/api/cron/digest' ||
      pathname === '/api/cron/winback' ||
      pathname === '/api/cron/lead-dlq-retry' ||
      pathname === '/api/cron/lead-digest' ||
      pathname === '/api/cron/lead-retention' ||
      pathname === '/api/cron/proposal-deadline-monitor' ||
      pathname === '/api/cron/proposal-digest' ||
      pathname === '/api/cron/proposal-dlq-retry' ||
      pathname === '/api/cron/proposal-retention' ||
      pathname === '/api/cron/self-heal' ||
      pathname === '/api/cron/reactivate' ||
      pathname === '/api/cron/lead-sequence' ||
      pathname === '/api/cron/daily-niche-generator'
    ) {
      const cronSecret = process.env.CRON_SECRET
      const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
      if (cronSecret && timingSafeEqual(secret, cronSecret)) return NextResponse.next()
      // Fall through — no secret, withAuth callback will block
    }

    // Autonomous pipeline + Hermes routes: allow with CRON_SECRET, INTERNAL_API_SECRET, or HERMES_SECRET
    if (
      pathname === '/api/pipeline/trigger' ||
      pathname.startsWith('/api/pipeline/status/') ||
      pathname === '/api/pipeline/reputation' ||
      pathname === '/api/claude/deploy' ||
      pathname.startsWith('/api/hermes/')
    ) {
      const cronSecret     = process.env.CRON_SECRET
      const internalSecret = process.env.INTERNAL_API_SECRET
      const hermesSecret   = process.env.HERMES_SECRET
      const bearer    = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
      const xCron     = req.headers.get('x-cron-secret') ?? ''
      const xInternal = req.headers.get('x-nexus-internal') ?? ''
      const xHermes   = req.headers.get('x-hermes-secret') ?? ''
      const query     = req.nextUrl.searchParams.get('secret') ?? ''
      if (
        (cronSecret     && (timingSafeEqual(xCron, cronSecret) || timingSafeEqual(bearer, cronSecret) || timingSafeEqual(query, cronSecret))) ||
        (internalSecret && timingSafeEqual(xInternal, internalSecret)) ||
        (hermesSecret   && (timingSafeEqual(xHermes, hermesSecret) || timingSafeEqual(bearer, hermesSecret))) ||
        (!cronSecret && !internalSecret && !hermesSecret)   // dev: no secrets → allow
      ) return NextResponse.next()
      // Fall through — invalid secret, withAuth will block
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
          pathname === '/api/ping' ||
          pathname === '/api/health' ||
          pathname === '/api/pipeline-stats' ||
          pathname.startsWith('/api/checkout') ||
          pathname.startsWith('/api/webhook/') ||
          pathname.startsWith('/api/webhooks/') ||
          pathname === '/api/demo-booking' ||
          pathname === '/api/whatsapp/send' ||
          pathname === '/api/groq/stream' ||
          pathname === '/api/categories' ||
          pathname === '/api/lead-capture' ||
          pathname === '/api/lead-event' ||
          (pathname === '/api/trending' && req.method === 'GET') ||
          pathname === '/api/quota' ||
          (pathname === '/api/deploy/vercel' && req.method === 'GET') ||
          pathname === '/auth/signin' ||
          pathname === '/' ||
          pathname === '/terms' ||
          pathname === '/privacy' ||
          pathname === '/unsubscribe' ||
          pathname === '/og'
        ) return true

        // G5: /api/leads POST — unauthenticated external ingest (route enforces its own secret)
        if (pathname === '/api/leads' && req.method === 'POST') return true

        // P1: /api/proposals POST — unauthenticated internal ingest (route enforces its own secret)
        if (pathname === '/api/proposals' && req.method === 'POST') return true

        // N1: /api/leads/convert POST — webhook from payment processors (no session)
        if (pathname === '/api/leads/convert' && req.method === 'POST') return true

        // Allow /shell?page=pricing and other public shell pages without login
        if (pathname === '/shell') {
          const page = req.nextUrl.searchParams.get('page')
          if (page && PUBLIC_SHELL_PAGES.has(page)) return true
        }

        // Cron/mixed-access routes: allow if (a) valid CRON_SECRET is present,
        // OR (b) the caller has a valid authenticated session.
        // Pure cron-only routes (cycle, weekly, quarantine, eval) still require
        // CRON_SECRET — they must never be triggered by a regular browser session.
        if (
          pathname === '/api/monitor' ||
          pathname === '/api/learning/quarantine' ||
          pathname === '/api/learning/update-deltas' ||
          pathname === '/api/eval' ||
          pathname === '/api/cron/trending' ||
          pathname === '/api/cron/workspace-scheduler' ||
          pathname === '/api/cron/subscription-expiry' ||
          pathname === '/api/cron/activate' ||
          pathname === '/api/cron/digest' ||
          pathname === '/api/cron/winback' ||
          pathname === '/api/cron/lead-dlq-retry' ||
          pathname === '/api/cron/lead-digest' ||
          pathname === '/api/cron/lead-retention' ||
          pathname === '/api/cron/proposal-deadline-monitor' ||
          pathname === '/api/cron/proposal-digest' ||
          pathname === '/api/cron/proposal-dlq-retry' ||
          pathname === '/api/cron/proposal-retention' ||
          pathname === '/api/cron/self-heal' ||
          pathname === '/api/cron/reactivate' ||
          pathname === '/api/cron/lead-sequence' ||
          pathname === '/api/cron/daily-niche-generator'
        ) {
          // Strict: CRON_SECRET only (no session bypass)
          const cronSecret = process.env.CRON_SECRET
          if (!cronSecret) return false
          const headerSecret = req.headers.get('x-cron-secret') ?? ''
          const querySecret  = req.nextUrl.searchParams.get('secret') ?? ''
          const bearerToken  = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
          return (
            timingSafeEqual(headerSecret, cronSecret) ||
            timingSafeEqual(querySecret,  cronSecret) ||
            timingSafeEqual(bearerToken,  cronSecret)
          )
        }

        // Mixed: CRON_SECRET OR authenticated session (browser users + cron jobs)
        // These endpoints have their own internal auth guards on the POST method.
        if (
          pathname === '/api/trending' ||
          pathname === '/api/learning/cycle' ||
          pathname === '/api/learning/weekly' ||
          pathname === '/api/regime' ||
          pathname === '/api/agent/run'
        ) {
          if (!!token) return true   // authenticated user — pass through, route handles auth internally
          const cronSecret = process.env.CRON_SECRET
          if (!cronSecret) return false
          const headerSecret = req.headers.get('x-cron-secret') ?? ''
          const querySecret  = req.nextUrl.searchParams.get('secret') ?? ''
          const bearerToken  = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
          return (
            timingSafeEqual(headerSecret, cronSecret) ||
            timingSafeEqual(querySecret,  cronSecret) ||
            timingSafeEqual(bearerToken,  cronSecret)
          )
        }

        // Autonomous pipeline + Hermes routes: CRON_SECRET | INTERNAL_API_SECRET | HERMES_SECRET
        if (
          pathname === '/api/pipeline/trigger' ||
          pathname.startsWith('/api/pipeline/status/') ||
          pathname === '/api/pipeline/reputation' ||
          pathname === '/api/claude/deploy' ||
          pathname.startsWith('/api/hermes/')
        ) {
          const cronSecret     = process.env.CRON_SECRET
          const internalSecret = process.env.INTERNAL_API_SECRET
          const hermesSecret   = process.env.HERMES_SECRET
          if (!cronSecret && !internalSecret && !hermesSecret) return true   // dev
          const bearer    = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
          const xCron     = req.headers.get('x-cron-secret') ?? ''
          const xInternal = req.headers.get('x-nexus-internal') ?? ''
          const xHermes   = req.headers.get('x-hermes-secret') ?? ''
          const query     = req.nextUrl.searchParams.get('secret') ?? ''
          return (
            (!!cronSecret     && (timingSafeEqual(xCron, cronSecret) || timingSafeEqual(bearer, cronSecret) || timingSafeEqual(query, cronSecret))) ||
            (!!internalSecret && timingSafeEqual(xInternal, internalSecret)) ||
            (!!hermesSecret   && (timingSafeEqual(xHermes, hermesSecret) || timingSafeEqual(bearer, hermesSecret)))
          )
        }

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
