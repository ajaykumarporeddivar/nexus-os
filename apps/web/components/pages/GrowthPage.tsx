'use client'

/**
 * GrowthPage — Growth analytics dashboard for NEXUS OS.
 *
 * Shows:
 * - Phase scores vs framework (Positioning/Demo/Distribution/Capture/Retention)
 * - Referral stats (clicks, signups, conversions)
 * - Share stats (runs shared, total views, top runs)
 * - Content items generated
 * - Growth drips sent
 * - Actionable next steps per phase
 */

import { useState, useEffect } from 'react'

interface GrowthStats {
  sharedRuns:   number
  totalViews:   number
  referral: {
    code:        string | null
    clicks:      number
    signups:     number
    conversions: number
  }
  contentItems: number
  dripsSent:    number
  topRuns: Array<{
    slug:        string
    projectName: string
    viewCount:   number
    createdAt:   string
    qaScore:     number | null
  }>
}

const PHASES = [
  {
    id: 'positioning',
    label: 'Phase 1 — Positioning',
    score: 40,
    status: 'gap' as const,
    items: [
      { done: false, text: 'Define WHO in one sentence (not "businesses")' },
      { done: false, text: 'Define WHAT pain — make it sting' },
      { done: false, text: 'Define WHY NOW — what shifted in 2026' },
      { done: false, text: 'Define WHY AI-native — not just "faster"' },
      { done: false, text: 'Compare head-to-head vs Lovable, Bolt, v0' },
    ],
    cta: 'Answer all 5 questions — add to landing page hero',
  },
  {
    id: 'demo',
    label: 'Phase 2 — Demo Engine',
    score: 65,
    status: 'partial' as const,
    items: [
      { done: true,  text: 'Public shareable run pages at /s/[slug]' },
      { done: true,  text: 'Auto-generate X/LinkedIn/Reddit content via Content Engine' },
      { done: false, text: 'Record a 60-second screen capture of a live pipeline run' },
      { done: false, text: 'Post DAILY — one piece of content per completed run' },
      { done: false, text: 'Before/after: brief text → live deployed app' },
    ],
    cta: 'Record one screen capture this week and post it',
  },
  {
    id: 'distribution',
    label: 'Phase 3 — Distribution',
    score: 35,
    status: 'gap' as const,
    items: [
      { done: true,  text: 'Share buttons (X, LinkedIn, WhatsApp) on every run' },
      { done: false, text: 'Post on X — use Content Engine output' },
      { done: false, text: 'Post on Reddit (r/SaaS, r/entrepreneur)' },
      { done: false, text: 'Post on LinkedIn' },
      { done: false, text: 'Submit to 3 newsletters / communities' },
      { done: false, text: 'Get a real domain (not web-xi-vert-58.vercel.app)' },
    ],
    cta: 'Use the Content Engine below every pipeline run — copy and post',
  },
  {
    id: 'capture',
    label: 'Phase 4 — Capture',
    score: 70,
    status: 'partial' as const,
    items: [
      { done: true,  text: 'Referral system with NEXUS-XXXXXX codes' },
      { done: true,  text: 'Referral click/signup tracking' },
      { done: true,  text: 'Completion email with share CTA + referral link' },
      { done: true,  text: 'Shareable run pages with signup CTA' },
      { done: false, text: 'Referral reward: free run for each signup (hook in, credit not yet granted)' },
      { done: false, text: 'Waitlist page with social proof count' },
    ],
    cta: 'Wire referral reward: grant 1 free run when ref signup completes first pipeline',
  },
  {
    id: 'retention',
    label: 'Phase 5 — Retention',
    score: 65,
    status: 'partial' as const,
    items: [
      { done: true,  text: 'Day 1/3/7 growth drip emails' },
      { done: true,  text: 'Fast onboarding — pipeline starts in <30s' },
      { done: true,  text: 'Instant value — brief → live app in 15 min' },
      { done: false, text: '"Your app has been live 30 days" milestone email' },
      { done: false, text: 'In-product success metric — show user their ROI' },
      { done: false, text: 'Re-engagement: ping users after 7 days idle' },
    ],
    cta: 'Add 30-day milestone email + ROI metric to pipeline completion',
  },
]

function PhaseCard({ phase }: { phase: typeof PHASES[0] }) {
  const [open, setOpen] = useState(false)
  const doneCount = phase.items.filter(i => i.done).length
  const total     = phase.items.length
  const pct       = Math.round((doneCount / total) * 100)

  const statusColor = phase.status === 'gap'     ? 'text-red-400 border-red-400/30 bg-red-400/5'
    : phase.status === 'partial' ? 'text-amber-400 border-amber-400/30 bg-amber-400/5'
    : 'text-green-400 border-green-400/30 bg-green-400/5'

  return (
    <div className="border border-border rounded-2xl bg-paper overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-paper2 transition-all text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-ink">{phase.label}</p>
            <span className={`text-[9px] font-black font-mono px-2 py-0.5 rounded-full border ${statusColor}`}>
              {phase.status === 'gap' ? 'GAP' : phase.status === 'partial' ? 'PARTIAL' : 'DONE'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-acid transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-ink3">{doneCount}/{total}</span>
          </div>
        </div>
        <span className="text-ink3 text-sm flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-border">
          <ul className="space-y-2 mt-3">
            {phase.items.map((item, i) => (
              <li key={i} className={`flex items-start gap-2 text-xs ${item.done ? 'text-ink3' : 'text-ink2'}`}>
                <span className={`flex-shrink-0 mt-px font-black ${item.done ? 'text-green-400' : 'text-ink3'}`}>
                  {item.done ? '✓' : '○'}
                </span>
                {item.text}
              </li>
            ))}
          </ul>
          <div className="rounded-xl border border-acid/20 bg-acid/5 px-4 py-3">
            <p className="text-[10px] font-black font-mono uppercase tracking-widest text-acid mb-1">Next action</p>
            <p className="text-xs text-ink2">{phase.cta}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function GrowthPage() {
  const [stats, setStats]   = useState<GrowthStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refCopied, setRefCopied] = useState(false)

  useEffect(() => {
    fetch('/api/growth/stats').then(r => r.json()).then(d => {
      if (d.ok) setStats(d.stats)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const baseUrl  = typeof window !== 'undefined' ? window.location.origin : ''
  const refUrl   = stats?.referral.code ? `${baseUrl}/?ref=${stats.referral.code}` : null

  const copyRef = () => {
    if (!refUrl) return
    navigator.clipboard.writeText(refUrl).then(() => {
      setRefCopied(true)
      setTimeout(() => setRefCopied(false), 2000)
    }).catch(() => {})
  }

  const overallScore = Math.round(PHASES.reduce((s, p) => s + p.score, 0) / PHASES.length)

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8" role="main" aria-label="Growth Engine">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] text-ink3 uppercase tracking-widest font-mono mb-1">Growth Engine</p>
          <h1 className="text-3xl font-bold text-ink" style={{ fontFamily: 'var(--ff-d)' }}>Growth Dashboard</h1>
          <p className="text-sm text-ink3 mt-1">5-phase framework. Build growth like engineering.</p>
        </div>
        <div className="text-right kpi-card px-5 py-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink3 mb-1">Overall Score</p>
          <p className="text-3xl font-bold text-acid" style={{ fontFamily: 'var(--ff-d)' }}>{overallScore}%</p>
        </div>
      </div>

      {/* Live stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {loading ? (
          <div className="col-span-full text-xs text-ink3 font-mono">Loading stats…</div>
        ) : stats ? [
          { label: 'Runs shared',    value: stats.sharedRuns },
          { label: 'Total views',    value: stats.totalViews },
          { label: 'Ref clicks',     value: stats.referral.clicks },
          { label: 'Ref signups',    value: stats.referral.signups },
          { label: 'Content items',  value: stats.contentItems },
          { label: 'Drips sent',     value: stats.dripsSent },
        ].map(s => (
          <div key={s.label} className="kpi-card text-center">
            <p className="text-[8px] font-mono uppercase tracking-widest text-ink3">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-ink" style={{ fontFamily: 'var(--ff-d)' }}>{s.value}</p>
          </div>
        )) : null}
      </div>

      {/* Referral code */}
      {stats?.referral.code && (
        <div className="border border-acid/20 bg-acid/5 rounded-2xl px-5 py-4 space-y-2">
          <p className="text-[9px] font-black font-mono uppercase tracking-widest text-acid">Your referral link</p>
          <div className="flex items-center gap-2">
            <span className="flex-1 font-mono text-xs text-ink2 truncate">{refUrl}</span>
            <button
              onClick={copyRef}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                refCopied ? 'border-green-400/60 bg-green-400/10 text-green-400' : 'border-border text-ink3 hover:text-ink hover:border-ink/30'
              }`}
            >{refCopied ? '✓ Copied' : '⎘ Copy'}</button>
          </div>
          <div className="flex gap-4 text-xs text-ink3">
            <span>{stats.referral.clicks} clicks</span>
            <span>{stats.referral.signups} signups</span>
            <span>{stats.referral.conversions} conversions</span>
          </div>
        </div>
      )}

      {/* Top runs */}
      {stats && stats.topRuns.length > 0 && (
        <div className="border border-border rounded-2xl bg-paper p-5 space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink3 font-black">Top performing runs (by views)</p>
          <div className="space-y-2 divide-y divide-border">
            {stats.topRuns.map(run => (
              <div key={run.slug} className="flex items-center gap-3 pt-2 first:pt-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-ink truncate">{run.projectName}</p>
                  <p className="text-[10px] text-ink3 font-mono">/s/{run.slug}</p>
                </div>
                <span className="text-xs font-bold text-ink2">{run.viewCount} views</span>
                {run.qaScore && (
                  <span className="text-[10px] font-mono text-acid">{run.qaScore.toFixed(1)}/10</span>
                )}
                <a
                  href={`/s/${run.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-ink3 hover:text-ink transition-colors"
                >↗</a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase cards */}
      <div className="space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-widest text-ink3 font-black">5-Phase framework status</p>
        {PHASES.map(phase => (
          <PhaseCard key={phase.id} phase={phase} />
        ))}
      </div>

      {/* Quick links */}
      <div className="border border-border rounded-2xl bg-paper p-5 space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-widest text-ink3 font-black">Quick actions</p>
        <div className="flex flex-wrap gap-2">
          <a href="/shell?page=pipeline" className="btn btn-primary text-xs px-4 py-2">
            Run pipeline ↗
          </a>
          <a href="/shell?page=trending" className="btn btn-ghost text-xs px-4 py-2">
            Browse ideas
          </a>
          <a href="https://twitter.com/intent/tweet?text=Just%20built%20an%20app%20with%20NEXUS%20OS%20%E2%80%94%2023%20AI%20agents%2C%20brief%20to%20live%20app.%20Try%20it%3A%20https%3A%2F%2Fweb-xi-vert-58.vercel.app" target="_blank" rel="noopener noreferrer" className="btn btn-ghost text-xs px-4 py-2">
            𝕏 Tweet now
          </a>
          <a href="https://www.reddit.com/r/SaaS/submit" target="_blank" rel="noopener noreferrer" className="btn btn-ghost text-xs px-4 py-2">
            Post on Reddit
          </a>
        </div>
      </div>
    </div>
  )
}
