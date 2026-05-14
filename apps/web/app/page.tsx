import type { Metadata } from 'next'
import LandingPage from '@/components/LandingPage'

export const metadata: Metadata = {
  title: 'NEXUS OS — Build AI Software in 10 Minutes',
  description: '23 specialized AI agents generate complete software: spec, architecture, code, DB schema, security audit, and GTM playbook from one prompt.',
  keywords: ['AI software builder', 'code generation', 'software architecture AI', 'AI agents', 'developer tools'],
  openGraph: {
    title: 'NEXUS OS — 23 AI Agents. One Prompt. Production-Ready Software.',
    description: 'Describe your idea. NEXUS OS runs 23 AI agents in parallel — spec, architecture, code, security audit, GTM playbook — in under 10 minutes.',
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexus-os.ai',
    siteName: 'NEXUS OS',
    images: [{ url: '/og', width: 1200, height: 630, alt: 'NEXUS OS — AI Software Builder' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NEXUS OS — Build AI Software in 10 Minutes',
    description: '23 AI agents: spec, architecture, code, security audit, GTM playbook from one prompt.',
    images: ['/og'],
  },
}

export default function RootPage() {
  return <LandingPage />
}
