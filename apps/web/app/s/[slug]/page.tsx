/**
 * /s/[slug] — Public shareable run card
 *
 * No authentication required. Shows project name, QA score, elapsed time,
 * vertical, and a CTA to build with NEXUS OS.
 * Designed to be shared on X, LinkedIn, WhatsApp.
 */

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma }   from '@/lib/prisma'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const run = await prisma.sharedRun.findUnique({ where: { slug } })
  if (!run) return { title: 'NEXUS OS' }

  const elapsed = run.elapsedSec
    ? run.elapsedSec >= 60
      ? `${Math.floor(run.elapsedSec / 60)}m ${run.elapsedSec % 60}s`
      : `${run.elapsedSec}s`
    : null

  const desc = [
    `"${run.projectName}" — built by ${run.agentCount} AI agents`,
    elapsed ? `in ${elapsed}` : null,
    run.qaScore ? `QA ${run.qaScore.toFixed(1)}/10` : null,
  ].filter(Boolean).join(' · ')

  return {
    title:       `${run.projectName} — Built with NEXUS OS`,
    description: desc,
    openGraph: {
      title:       `${run.projectName} — Built with NEXUS OS`,
      description: desc,
      type:        'website',
    },
    twitter: {
      card:        'summary',
      title:       `${run.projectName} — Built with NEXUS OS`,
      description: desc,
    },
  }
}

const VERTICAL_LABEL: Record<string, string> = {
  saas:        'SaaS',
  marketplace: 'Marketplace',
  dashboard:   'Dashboard',
  social:      'Social',
  mobile:      'Mobile',
  ecommerce:   'E-commerce',
}

export default async function SharedRunPage({ params }: Props) {
  const { slug } = await params
  const run = await prisma.sharedRun.findUnique({ where: { slug } })
  if (!run) notFound()

  // Increment view count
  await prisma.sharedRun.update({ where: { slug }, data: { viewCount: { increment: 1 } } }).catch(() => {})

  const elapsed = run.elapsedSec
    ? run.elapsedSec >= 60
      ? `${Math.floor(run.elapsedSec / 60)}m ${run.elapsedSec % 60}s`
      : `${run.elapsedSec}s`
    : null

  const shareUrl  = run.liveUrl || run.appRepoUrl || ''
  const baseUrl   = process.env.NEXTAUTH_URL ?? 'https://web-xi-vert-58.vercel.app'
  const pageUrl   = `${baseUrl}/s/${slug}`
  const signupUrl = run.refCode ? `${baseUrl}?ref=${run.refCode}` : baseUrl

  const tweetText = encodeURIComponent(
    `Just built "${run.projectName}" with NEXUS OS — ${run.agentCount} AI agents took my brief to a live app${elapsed ? ` in ${elapsed}` : ''}.${run.qaScore ? ` QA: ${run.qaScore.toFixed(1)}/10` : ''}\n\nWatch it go 👇\n${pageUrl}`
  )
  const liText = encodeURIComponent(
    `Just shipped "${run.projectName}" using NEXUS OS's One-Click Pipeline.\n\n${run.agentCount} AI agents — FORGE spec + BUILD code + live deployment.\n${elapsed ? `Total time: ${elapsed}.` : ''} ${run.qaScore ? `QA score: ${run.qaScore.toFixed(1)}/10.` : ''}\n\nThis is what AI-native product delivery looks like.\n\n${pageUrl}`
  )
  const waText = encodeURIComponent(
    `Check this out — built "${run.projectName}" with AI in ${elapsed ?? 'minutes'}. Live here: ${shareUrl || pageUrl}`
  )

  return (
    <div className="min-h-screen bg-[#050607] text-zinc-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#c8f23c]/30 bg-[#c8f23c]/5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c8f23c] animate-pulse" />
            <p className="text-[10px] font-black font-mono tracking-[0.16em] text-zinc-200 uppercase">NEXUS OS · Pipeline Output</p>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">{run.projectName}</h1>
          <p className="text-zinc-400 text-sm max-w-sm mx-auto">{run.brief.slice(0, 120)}{run.brief.length > 120 ? '…' : ''}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Agents',   value: `${run.agentCount}` },
            { label: 'Time',     value: elapsed ?? '—' },
            { label: 'QA Score', value: run.qaScore ? `${run.qaScore.toFixed(1)}/10` : '—' },
            { label: 'Vertical', value: VERTICAL_LABEL[run.vertical] ?? run.vertical },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
              <p className="text-[8px] font-mono uppercase tracking-widest text-zinc-500">{s.label}</p>
              <p className="mt-1 text-sm font-black text-zinc-100">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Live URL */}
        {shareUrl && (
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#c8f23c] text-black text-sm font-black hover:bg-[#d4f74a] transition-all shadow-[0_0_20px_rgba(200,242,60,0.3)]"
          >
            Open Live App ↗
          </a>
        )}

        {/* Share strip */}
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 text-center">Share this build</p>
          <div className="flex gap-2">
            <a
              href={`https://twitter.com/intent/tweet?text=${tweetText}`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10 text-xs font-black hover:bg-white/5 transition-all"
            >𝕏 Tweet</a>
            <a
              href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(pageUrl)}&title=${encodeURIComponent(run.projectName)}&summary=${liText}`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10 text-xs font-black hover:bg-white/5 transition-all"
            >in LinkedIn</a>
            <a
              href={`https://wa.me/?text=${waText}`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10 text-xs font-black hover:bg-white/5 transition-all"
            >WhatsApp</a>
          </div>
        </div>

        {/* CTA */}
        <div className="rounded-2xl border border-[#c8f23c]/20 bg-[#c8f23c]/5 p-5 text-center space-y-3">
          <p className="text-sm font-black text-white">Build your SaaS in minutes with AI</p>
          <p className="text-xs text-zinc-400">23 agents. Brief → FORGE spec → BUILD code → live URL. No code required.</p>
          <a
            href={signupUrl}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#c8f23c] text-black text-sm font-black hover:bg-[#d4f74a] transition-all"
          >
            Try NEXUS OS free →
          </a>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-zinc-600">
          {run.viewCount} view{run.viewCount !== 1 ? 's' : ''} · Built {new Date(run.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
    </div>
  )
}
