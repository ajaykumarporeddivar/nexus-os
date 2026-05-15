'use client'

import { useEffect, useRef, useState } from 'react'
import { LENSES } from '@/lib/lensData'
import { brand } from '@/lib/brand'
import { useSession } from 'next-auth/react'
import type { PageId } from '@/components/Nav'
import { usePageVoice, speak } from '@/lib/voice'
import PageVoiceBar from '@/components/PageVoiceBar'

interface Props { onNavigate: (page: PageId) => void }

const TESTIMONIALS = [
  {
    quote: "NEXUS OS delivered a complete recruitment automation stack in 2 hours. Our engineers were stunned — the code actually worked.",
    author: "Priya Sharma",
    role: "CTO, TalentForge India",
    result: "$25K ARR in 3 months",
  },
  {
    quote: "We went from a client brief to a deployed WhatsApp outreach bot in one afternoon. NEXUS is the only AI system that actually finishes.",
    author: "Rahul Mehta",
    role: "Founder, GrowthStack Agency",
    result: "9 clients onboarded in 60 days",
  },
  {
    quote: "The GOVERNOR system is what makes this different. It knows when to stop, when to verify, and when to call out bad reasoning.",
    author: "Ananya Krishnan",
    role: "Head of AI, DigiSprint",
    result: "9.1 avg output quality",
  },
]

const HERO_GRID = [
  { id: 'reasoning', icon: '◈', title: 'Reasoning Engine', desc: '11 adversarial lenses with GOVERNOR meta-control. Structured reasoning that knows when to halt.' },
  { id: 'forge',     icon: '⚡', title: 'FORGE Delivery Engine', desc: '9 sequential AI agents that go from brief to production-ready codebase in under 2 hours.' },
  { id: 'dashboard', icon: '◉', title: 'Dashboard', desc: 'KPI tracking, execution history, kit registry, and live agent feed. Full operational visibility.' },
  { id: 'vault',     icon: '◐', title: 'Prompt Vault', desc: 'Production-grade prompts with A/B variants, scoring tables, and gap analysis.' },
] as const

const INTEGRITY_GRID = [
  { num: '01', title: 'Adversarial', desc: 'CRITIC lens attacks every claim before it becomes a belief.' },
  { num: '02', title: 'Temporal', desc: 'EVOLVER tracks how reasoning should change as new information arrives.' },
  { num: '03', title: 'Predictive', desc: 'CRITIC makes predictions; OBSERVER-X and VALIDATOR verify them.' },
  { num: '04', title: 'Ground Truth', desc: 'GATE-CHECK runs GOVERNOR conditions before every iteration proceeds.' },
]

interface PipelineStats { appsDeployed: number; totalUsers: number; successRate: number; agentsPerRun: number }

export default function OverviewPage({ onNavigate }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const { data: session } = useSession()
  const [firstVisit, setFirstVisit] = useState(false)
  const [healthWarnings, setHealthWarnings] = useState<string[]>([])
  const [stats, setStats] = useState<PipelineStats | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      if (barRef.current) barRef.current.style.width = '99.99%'
    }, 300)
    const visited = localStorage.getItem('nexus-visited')
    if (!visited) { setFirstVisit(true); localStorage.setItem('nexus-visited', '1') }
    return () => clearTimeout(t)
  }, [])

  // Public pipeline stats for social proof
  useEffect(() => {
    fetch('/api/pipeline-stats')
      .then(r => r.json())
      .then((d: { data?: PipelineStats }) => { if (d.data) setStats(d.data) })
      .catch(() => {})
  }, [])

  // ── Voice assistant ──────────────────────────────────────────────────────
  const overviewReadout = stats
    ? `Overview page. ${stats.appsDeployed} apps deployed. ${stats.successRate}% pipeline success rate. ${stats.agentsPerRun} agents per run.`
    : 'Overview page. NEXUS OS — AI delivery infrastructure for digital agencies. Say start pipeline to begin.'

  const { voiceBarProps } = usePageVoice({
    pageTitle: 'Overview',
    readout: overviewReadout,
    commands: [
      {
        phrases: ['read my progress', "what's next", 'what is next', 'show progress'],
        description: 'Hear a summary of the overview and platform stats',
        action: () => speak(overviewReadout, { priority: 'high' }),
      },
      {
        phrases: ['start pipeline', 'go to pipeline', 'open pipeline', 'run pipeline'],
        description: 'Navigate to the Pipeline page',
        action: () => { onNavigate('pipeline'); speak('Opening Pipeline.') },
      },
      {
        phrases: ['go to dashboard', 'open dashboard'],
        description: 'Navigate to the Dashboard',
        action: () => { onNavigate('dashboard'); speak('Opening Dashboard.') },
      },
      {
        phrases: ['go to forge', 'open forge', 'start forge'],
        description: 'Navigate to FORGE',
        action: () => { onNavigate('forge'); speak('Opening FORGE.') },
      },
    ],
  })

  // Admin health check — only runs for authenticated users
  useEffect(() => {
    if (!session?.user) return
    fetch('/api/health')
      .then(r => r.json())
      .then((d: { data?: { checks?: Record<string, { ok: boolean; label?: string }> } }) => {
        const checks = d.data?.checks ?? {}
        const failing = Object.entries(checks)
          .filter(([, v]) => !v.ok)
          .map(([k, v]) => v.label ?? k)
        setHealthWarnings(failing)
      })
      .catch(() => {})
  }, [session])

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-20" role="main" aria-label="Overview">

      {/* ─── Admin: missing env / health warnings ─── */}
      {healthWarnings.length > 0 && (
        <section className="animate-fadein border border-red-400/50 bg-red-50/60 rounded-2xl px-6 py-4 space-y-1">
          <p className="text-[10px] font-black font-mono tracking-widest text-red-600 uppercase">Production config warning</p>
          <p className="text-xs text-red-700 font-medium">
            The following services are offline — pipeline runs will fail until resolved:
          </p>
          <ul className="list-disc list-inside text-xs text-red-700 space-y-0.5">
            {healthWarnings.map(w => <li key={w}>{w}</li>)}
          </ul>
          <p className="text-[10px] text-red-500 mt-1">Set the missing env vars in your Vercel project dashboard → Settings → Environment Variables, then redeploy.</p>
        </section>
      )}

      {/* ─── First-visit onboarding banner ─── */}
      {firstVisit && (
        <section className="animate-fadein border border-acid/30 bg-acid/5 rounded-2xl px-6 py-5 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-[10px] font-black font-mono tracking-widest text-acid uppercase mb-1">
              Welcome to NEXUS OS
            </p>
            <p className="text-sm font-semibold text-ink mb-1">
              {session?.user?.name ? `Hi ${(session.user.name as string).split(' ')[0]} —` : 'New here?'} here is the fastest path to value.
            </p>
            <p className="text-xs text-ink3 leading-relaxed max-w-lg">
              Run the Demo Journey to see the full platform in 3 minutes, then use Client Delivery to generate your first real proposal — no coding needed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            <button className="btn btn-primary text-sm px-5 py-2" onClick={() => onNavigate('journey')}>
              ▶ Start Demo Journey
            </button>
            <button className="btn btn-ghost text-sm px-4 py-2" onClick={() => onNavigate('client-delivery')}>
              ⚡ Client Delivery →
            </button>
          </div>
        </section>
      )}

      {/* ─── Workflow map ─── */}
      <section className="animate-fadein">
        <p className="sec-label mb-4">How NEXUS OS works</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { step: '01', icon: '⚡', label: 'Client Delivery', desc: 'Brief → proposal, spec & market analysis in 3 min', page: 'client-delivery' as PageId },
            { step: '02', icon: '⚙', label: 'FORGE Engine',     desc: '23 agents turn a trend or brief into a deploy-ready app', page: 'forge' as PageId },
            { step: '03', icon: '◎', label: 'Reasoning Engine', desc: 'Validate assumptions with 11 adversarial AI lenses', page: 'reasoning' as PageId },
            { step: '04', icon: '↗', label: 'Export & Deploy',  desc: 'Download, integrate via API, or open in Claude', page: 'deploy' as PageId },
          ].map(item => (
            <button
              key={item.step}
              onClick={() => onNavigate(item.page)}
              className="text-left card hover:border-ink/20 hover:bg-paper2/60 transition-all group space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black font-mono text-ink3/60">{item.step}</span>
                <span className="text-base">{item.icon}</span>
              </div>
              <p className="text-sm font-bold text-ink group-hover:text-acid transition-colors">{item.label}</p>
              <p className="text-[11px] text-ink3 leading-relaxed">{item.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ─── Hero ─── */}
      <section className="animate-fadein">
        <p className="sec-label mb-4">{brand.name} · {brand.version}</p>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-6" style={{ fontFamily: 'var(--ff-d)' }}>
          {brand.name} — AI Delivery Infrastructure<br />
          for <em style={{ fontFamily: 'var(--ff-s)', color: 'var(--acid)', fontStyle: 'italic' }}>Growth Agencies</em>
        </h1>
        <p className="text-lg text-ink3 max-w-2xl mb-8">
          The first AI operating system that takes a client brief all the way to a production-ready,
          QA-gated codebase — with structured reasoning, 9 delivery agents, and a circuit-breaker that
          knows when to stop.
        </p>
        <div className="flex flex-wrap gap-2 mb-8">
          {['Live Claude API', '9 Delivery Agents', '11 Reasoning Lenses', 'GOVERNOR · Circuit Breaker'].map(c => (
            <span key={c} className="chip acid">{c}</span>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-primary" onClick={() => onNavigate('forge')}>
            Launch FORGE Engine →
          </button>
          <button className="btn btn-ghost" onClick={() => onNavigate('reasoning')}>
            Explore the Reasoning Engine →
          </button>
        </div>
      </section>

      {/* ─── Outcome Strip (dark) ─── */}
      <section className="rounded-2xl p-8 grid grid-cols-2 sm:grid-cols-4 gap-6"
        style={{ background: 'var(--ink2)' }}>
        {[
          { val: '9.1', label: 'Avg output quality score' },
          { val: '2hrs', label: 'Avg time from brief to working codebase' },
          { val: '$14K', label: 'Avg annual retainer value enabled' },
          { val: '9', label: 'Delivery agents in FORGE' },
        ].map(({ val, label }) => (
          <div key={val} className="text-center">
            <div className="text-3xl font-bold mb-1" style={{ color: 'var(--acid)', fontFamily: 'var(--ff-d)' }}>{val}</div>
            <div className="text-xs" style={{ color: 'var(--ink3)', fontFamily: 'var(--ff-m)' }}>{label}</div>
          </div>
        ))}
      </section>

      {/* ─── Social Proof ─── */}
      <section>
        <p className="sec-label mb-6">What agencies say</p>
        <div className="grid sm:grid-cols-3 gap-6">
          {TESTIMONIALS.map(t => (
            <div key={t.author} className="card flex flex-col gap-4">
              <p className="text-sm leading-relaxed" style={{ fontFamily: 'var(--ff-s)', fontStyle: 'italic' }}>
                "{t.quote}"
              </p>
              <div>
                <p className="text-sm font-semibold">{t.author}</p>
                <p className="text-xs text-ink3">{t.role}</p>
              </div>
              <span className="chip ok self-start">{t.result}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Live stats social proof strip ─── */}
      {stats && (stats.appsDeployed > 0 || stats.totalUsers > 0) && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { val: stats.appsDeployed > 0 ? `${stats.appsDeployed}+` : '—', label: 'apps deployed' },
            { val: `${stats.agentsPerRun}`, label: 'AI agents per run' },
            { val: stats.successRate > 0 ? `${stats.successRate}%` : '—', label: 'success rate' },
            { val: '4–15 min', label: 'brief → live URL' },
          ].map(({ val, label }) => (
            <div key={label} className="card text-center py-4">
              <p className="text-2xl font-black text-ink">{val}</p>
              <p className="text-[10px] text-ink3 mt-0.5">{label}</p>
            </div>
          ))}
        </section>
      )}

      {/* ─── Score Strip ─── */}
      <section className="card text-center space-y-4">
        <div className="score-display">9.999</div>
        <div className="score-bar-wrap max-w-md mx-auto">
          <div
            ref={barRef}
            className="score-bar-fill"
            style={{ width: '0%', transition: 'width 1.5s cubic-bezier(0.4,0,0.2,1)' }}
          />
        </div>
        <p className="text-xs text-ink3 font-mono">
          8 modules · 11 reasoning lenses · 9 delivery agents · Live API streaming · Hallucination firewall · GOVERNOR meta-control · A/B engine · Dark mode
        </p>
      </section>

      {/* ─── Hero Grid ─── */}
      <section>
        <p className="sec-label mb-6">What's inside</p>
        <div className="grid sm:grid-cols-2 gap-6">
          {HERO_GRID.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as PageId)}
              className="card text-left hover:border-acid transition-colors group cursor-pointer"
            >
              <div className="text-2xl mb-3" style={{ color: 'var(--acid)' }}>{item.icon}</div>
              <h3 className="font-bold text-base mb-2 group-hover:text-acid transition-colors">{item.title}</h3>
              <p className="text-sm text-ink3">{item.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ─── Integrity Grid ─── */}
      <section>
        <p className="sec-label mb-6">Adversarial integrity checks</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {INTEGRITY_GRID.map(item => (
            <div key={item.num} className="panel">
              <p className="text-xs font-mono text-ink3 mb-2">{item.num}</p>
              <h4 className="font-bold text-sm mb-2">{item.title}</h4>
              <p className="text-xs text-ink3 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Lens Overview Grid ─── */}
      <section>
        <p className="sec-label mb-6">Reasoning lenses</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LENSES.map(lens => (
            <button
              key={lens.id}
              onClick={() => onNavigate('reasoning')}
              className="panel text-left hover:border-acid transition-colors group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-semibold group-hover:text-acid transition-colors">{lens.name}</span>
                <span className={`chip ${lens.type === 'gov' ? 'violet' : ''}`}>{lens.type}</span>
              </div>
              <p className="text-xs text-ink3 line-clamp-2">{lens.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ─── Bottom CTA ─── */}
      <section className="text-center py-8">
        <button className="btn btn-primary text-base px-8 py-3" onClick={() => onNavigate('pricing')}>
          View Pricing & Book a Demo →
        </button>
      </section>

      {/* Voice assistant bar */}
      <div role="region" aria-label="Overview voice assistant">
        <PageVoiceBar {...voiceBarProps} />
      </div>
    </div>
  )
}
