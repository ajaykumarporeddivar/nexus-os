import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Bricolage_Grotesque, Instrument_Serif, Geist_Mono } from 'next/font/google'
import './globals.css'
import Providers from '@/components/Providers'
import { ReferralTracker } from '@/components/ReferralTracker'

const displayFont = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz', 'wght'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--ff-d',
  display: 'swap',
  preload: true,
})

const serifFont = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--ff-s',
  display: 'swap',
  preload: false,
})

const monoFont = Geist_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--ff-m',
  display: 'swap',
  preload: false,
})

const brandName = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'NEXUS OS'
const brandTagline = process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? 'AI Delivery Infrastructure for Digital Agencies'
const brandDomain = process.env.NEXT_PUBLIC_BRAND_DOMAIN ?? 'nexus-os.ai'
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${brandDomain}`

const title = `${brandName} — ${brandTagline}`
const description = `${brandName} is an AI operating system for digital growth agencies. 21-agent autonomous delivery pipeline (FORGE + BUILD), 11-lens reasoning engine with hallucination firewall, and a production-grade prompt vault with A/B scoring. Ship client work in hours.`

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL(appUrl),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: appUrl,
    siteName: brandName,
    title,
    description,
    locale: 'en_IN',
    images: [{ url: `${appUrl}/og`, width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    site: `@${brandDomain.split('.')[0]}`,
    images: [`${appUrl}/og`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${displayFont.variable} ${serifFont.variable} ${monoFont.variable}`}>
      <body>
        {/* Skip navigation for keyboard users (WCAG 2.4.1) */}
        <a href="#main-content" className="skip-link">Skip to main content</a>
        {/* Global screen-reader live region — updated by shell on page navigation */}
        <div
          id="global-sr-announce"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        />
        <Suspense fallback={null}><ReferralTracker /></Suspense>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
