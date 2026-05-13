'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { nexusStore } from '@/lib/nexusStore'
import type { Build } from '@nexus-os/shared-types'
import type { PageId as NavPageId } from '@/components/Nav'

const KITS = [
  { id: 'screening', icon: '🎯', title: 'Candidate Screening Kit', desc: 'AI-powered screening, scoring, and shortlisting for any role. CV parsing + fit scoring + PII compliance.', score: '9.2/10', tags: ['Phase 1', 'Active'] },
  { id: 'followup',  icon: '📤', title: 'Follow-Up Automation Kit', desc: 'Multi-touch candidate follow-up sequences. LinkedIn + email + WhatsApp. GDPR-compliant.', score: '8.9/10', tags: ['Phase 1', 'Active'] },
  { id: 'jd',        icon: '✍',  title: 'JD Generator Kit', desc: 'Role-specific job descriptions from intake form. 3 tone variants. ATS-optimised keywords.', score: '8.7/10', tags: ['Phase 2'] },
  { id: 'analytics', icon: '◈',  title: 'Analytics & Reporting Kit', desc: 'Weekly performance reports: submissions, interviews, conversions, time-to-fill.', score: '8.5/10', tags: ['Phase 2'] },
]

const AGENT_LOG_DEMO = [
  '[✓] Analyst: feature extraction complete — 6 features, 3 entities',
  '[→] Planner: generating feature cards with acceptance criteria',
  '[✓] Test Writer: TDD specs written for auth, dashboard, billing',
  '[→] Builder: generating backend controllers and API handlers',
  '[✓] Security: JWT implementation audited — no vulnerabilities found',
  '[→] DB Optimizer: indexing strategy for user_sessions table',
  '[✓] QA Gate: coverage 94% · 0 type errors · lint clean',
]

interface AgentScore {
  id: string; name: string; avgScore: number | null; runCount: number; versionCount: number
}

interface LearningData {
  agents: AgentScore[]; topAgent: AgentScore | null; lowAgent: AgentScore | null; lastCycle: string | null
}

interface AnalyticsData {
  kpis: {
    totalRuns: number; totalTokens: number; totalCalls: number
    passedRuns: number; passRate: number; avgScore: number | null
    fullPipeline: number; auditEvents: number; activeSessions: number
  }
  deltas: { runs: number | null; tokens: number | null; score: number | null }
  trend: { date: string; runs: number; tokens: number; passed: number }[]
  byStatus: Record<string, number>
  scoreDist: { label: string; count: number }[]
  topActions: { action: string; count: number }[]
  window: string
}

type Section = 'overview' | 'executions' | 'kits' | 'feed' | 'funnel'

function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function fmtStatus(raw: string) {
  if (raw === 'NEEDS_REVISION') return { label: 'Quality Review', cls: 'warn' }
  if (raw === 'APPROVED')       return { label: 'Approved',       cls: 'ok' }
  if (raw === 'COMPLETE')       return { label: 'Complete',       cls: 'acid' }
  return { label: raw, cls: '' }
}

function DeltaChip({ delta, unit = '' }: { delta: number | null; unit?: string }) {
  if (delta === null) return null
  const up = delta >= 0
  return (
    <span className={`text-[10px] font-mono mt-1 inline-block ${up ? 'text-green' : 'text-rose-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(delta)}{unit} vs last period
    </span>
  )
}

interface Props { onNavigate: (page: NavPageId) => void }

export default function DashboardPage({ onNavigate }: Props) {
  const [section,         setSection]         = useState<Section>('overview')
  const [builds,          setBuilds]          = useState<Build[]>([])
  const [totalTokens,     setTotalTokens]     = useState(0)
  const [agentLogLines,   setAgentLogLines]   = useState<string[]>([])
  const [toast,           setToast]           = useState<string | null>(null)
  const [healthStatus,    setHealthStatus]    = useState<Record<string, { ok: boolean }>>({})
  const [activatedKitIds, setActivatedKitIds] = useState<Set<string>>(new Set())
  const [analytics,       setAnalytics]       = useState<AnalyticsData | null>(null)
  const [analyticsWindow, setAnalyticsWindow] = useState<'7d' | '30d' | '90d'>('7d')
  const [learning,        setLearning]        = useState<LearningData | null>(null)
  const [kitLoading,      setKitLoading]      = useState<string | null>(null)
  const [healthLoading,   setHealthLoading]   = useState(true)
  const logRef  = useRef<HTMLDivElement>(null)
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  useEffect(() => {
    const update = () => { setBuilds([...nexusStore.builds]); setTotalTokens(nexusStore.totalTokens) }
    const unsub = nexusStore.subscribe(update)
    nexusStore.restore(); update()
    return unsub
  }, [])

  useEffect(() => {
    setHealthLoading(true)
    fetch('/api/health')
      .then(r => r.json())
      .then(d => { if (d.checks) setHealthStatus(d.checks) })
      .catch(() => {})
      .finally(() => setHealthLoading(false))
  }, [])

  useEffect(() => {
    fetch(`/api/analytics?window=${analyticsWindow}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setAnalytics(d as AnalyticsData) })
      .catch(() => {})
  }, [analyticsWindow])

  useEffect(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => {
        if (!d.ok) return
        const agents: AgentScore[] = d.data.map((a: AgentScore) => a)
        const scored = agents.filter(a => a.avgScore !== null && a.runCount > 0)
        const sorted = [...scored].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
        setLearning({ agents, topAgent: sorted[0] ?? null, lowAgent: sorted[sorted.length - 1] ?? null, lastCycle: null })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/kits')
      .then(r => r.json())
      .then(d => { if (d.ok) setActivatedKitIds(new Set(d.data.activations.map((a: { kitId: string }) => a.kitId))) })
      .catch(() => {})
  }, [])

  // Demo log only when no real build data
  useEffect(() => {
    if (builds.length > 0) return
    let idx = 0
    let handle: ReturnType<typeof setTimeout>
    const playNext = () => {
      const line = AGENT_LOG_DEMO[idx % AGENT_LOG_DEMO.length]
      const ts = new Date().toLocaleTimeString('en', { hour12: false })
      setAgentLogLines(ls => [...ls.slice(-50), `${ts} ${line}`])
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      idx++
      handle = setTimeout(playNext, 2200 + Math.random() * 1000)
    }
    handle = setTimeout(playNext, 1000)
    return () => clearTimeout(handle)
  }, [builds.length])

  // Resolved KPIs: prefer analytics (DB-backed) over ephemeral nexusStore
  const totalRuns   = analytics?.kpis.totalRuns  ?? builds.length
  const usedTokens  = analytics?.kpis.totalTokens ?? totalTokens
  const rawAvg      = analytics?.kpis.avgScore ?? (builds.length ? builds.filter(b => b.score !== null).reduce((s, b) => s + (b.score ?? 0), 0) / (builds.filter(b => b.score !== null).length || 1) : null)
  const passRate    = analytics?.kpis.passRate ?? null
  const allHealthOk = Object.keys(healthStatus).length > 0 && Object.values(healthStatus).every(c => c.ok)
  const healthOkCount  = Object.values(healthStatus).filter(c => c.ok).length
  const healthTotal    = Object.keys(healthStatus).length || 4

  const showToast = useCallback((msg: string) => {
    setToast(msg); setTimeout(() => setToast(null), 3000)
  }, [])

  const toggleKit = useCallback(async (kitId: string) => {
    setKitLoading(kitId)
    const isActive = activatedKitIds.has(kitId)
    try {
      if (isActive) {
        const res = await fetch(`/api/kits?kitId=${encodeURIComponent(kitId)}`, { method: 'DELETE' })
        const data = await res.json()
        if (data.ok) setActivatedKitIds(prev => { const s = new Set(prev); s.delete(kitId); return s })
        else showToast(data.error ?? 'Failed to deactivate kit')
      } else {
        const res = await fetch('/api/kits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kitId }) })
        const data = await res.json()
        if (data.ok) setActivatedKitIds(prev => new Set([...prev, kitId]))
        else showToast(data.error ?? 'Failed to activate kit')
      }
    } catch { showToast('Network error — please try again') }
    finally { setKitLoading(null) }
  }, [activatedKitIds, showToast])

  const SIDEBAR: { id: Section; label: string }[] = [
    { id: 'overview',   label: 'Overview'      },
    { id: 'executions', label: 'Execution Log' },
    { id: 'kits',       label: 'Kit Registry'  },
    { id: 'feed',       label: 'Agent Feed'    },
    { id: 'funnel',     label: 'Analytics'     },
  ]

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">

      {/* ── Health strip — always visible at top ── */}
      {!healthLoading && Object.keys(healthStatus).length > 0 && (
        <div className={`mb-6 flex items-center gap-3 px-4 py-2.5 rounded-xl text-[11px] font-mono border ${
          allHealthOk
            ? 'bg-green/5 border-green/20 text-green'
            : 'bg-amber/5 border-amber/20 text-amber'
        }`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${allHealthOk ? 'bg-green' : 'bg-amber'} animate-pulse`} />
          <span className="font-semibold">{allHealthOk ? 'All systems operational' : `${healthOkCount}/${healthTotal} services OK`}</span>
          <div className="flex gap-3 ml-2 flex-wrap">
            {Object.entries(healthStatus).map(([svc, s]) => (
              <span key={svc} className={s.ok ? 'text-green/70' : 'text-amber font-bold'}>
                {svc} {s.ok ? '✓' : '✗'}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>{getGreeting()}</h2>
        <p className="text-sm text-ink3 mt-1">{dateStr}</p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0">
          <div className="space-y-1 sticky top-20">
            {SIDEBAR.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  section === id ? 'nav-tab-active font-semibold' : 'text-ink3 hover:text-ink hover:bg-paper2'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0">

          {/* ── OVERVIEW ── */}
          {section === 'overview' && (
            <div className="space-y-8 animate-fadein">

              {/* First-run CTA when no data at all */}
              {totalRuns === 0 && (
                <div className="border border-dashed border-acid/30 bg-acid/5 rounded-xl p-8 text-center space-y-3">
                  <p className="text-xs font-mono text-ink3 uppercase tracking-widest">Getting started</p>
                  <p className="text-base font-semibold text-ink">No builds yet — your dashboard populates after your first FORGE run</p>
                  <p className="text-sm text-ink3 max-w-md mx-auto">Pick a trending idea or describe a product, launch the 21-agent one-click pipeline, and your metrics will appear here automatically.</p>
                  <div className="flex gap-3 justify-center pt-2 flex-wrap">
                    <button onClick={() => onNavigate('forge')} className="btn btn-primary text-sm px-6">⚡ Launch FORGE Engine</button>
                    <button onClick={() => onNavigate('trending' as NavPageId)} className="btn btn-ghost text-sm px-6">↑ Browse Trending Ideas</button>
                  </div>
                </div>
              )}

              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Total Builds */}
                <div className="kpi-card flex flex-col">
                  <p className="text-xs text-ink3 mb-1">Total Builds</p>
                  <p className="text-2xl font-bold flex-1" style={{ fontFamily: 'var(--ff-d)' }}>
                    {totalRuns > 0 ? totalRuns : '—'}
                  </p>
                  <DeltaChip delta={analytics?.deltas.runs ?? null} />
                  {totalRuns === 0 && <p className="text-[10px] text-ink3 mt-1">Run FORGE to start</p>}
                  <button onClick={() => setSection('executions')} className="text-[10px] text-ink3 hover:text-ink mt-2 text-left transition-colors">
                    View log →
                  </button>
                </div>

                {/* QA Score — reframed */}
                <div className="kpi-card flex flex-col">
                  <p className="text-xs text-ink3 mb-1">
                    {rawAvg !== null && rawAvg >= 5 ? 'Avg QA Score' : 'QA Status'}
                  </p>
                  <p className={`text-2xl font-bold flex-1 ${rawAvg !== null && rawAvg >= 8 ? 'text-green' : rawAvg !== null && rawAvg >= 6 ? 'text-amber' : ''}`} style={{ fontFamily: 'var(--ff-d)' }}>
                    {rawAvg === null || totalRuns === 0
                      ? '—'
                      : rawAvg < 5
                      ? 'Baseline'
                      : `${rawAvg.toFixed(1)}/10`}
                  </p>
                  {rawAvg !== null && rawAvg < 5 && totalRuns > 0 && (
                    <p className="text-[10px] text-ink3 mt-1">Building quality baseline across runs</p>
                  )}
                  <DeltaChip delta={analytics?.deltas.score ?? null} />
                  {passRate !== null && (
                    <p className="text-[10px] text-ink3 mt-1">{passRate}% pass rate</p>
                  )}
                </div>

                {/* Tokens */}
                <div className="kpi-card flex flex-col">
                  <p className="text-xs text-ink3 mb-1">Tokens Used</p>
                  <p className="text-2xl font-bold flex-1" style={{ fontFamily: 'var(--ff-d)' }}>
                    {usedTokens > 0 ? `${(usedTokens / 1000).toFixed(1)}K` : '—'}
                  </p>
                  <DeltaChip delta={analytics?.deltas.tokens ?? null} unit="K" />
                  <button onClick={() => setSection('funnel')} className="text-[10px] text-ink3 hover:text-ink mt-2 text-left transition-colors">
                    View analytics →
                  </button>
                </div>

                {/* Services */}
                <div className="kpi-card flex flex-col">
                  <p className="text-xs text-ink3 mb-1">Services</p>
                  <p className={`text-2xl font-bold flex-1 ${allHealthOk ? 'text-green' : 'text-amber'}`} style={{ fontFamily: 'var(--ff-d)' }}>
                    {healthLoading ? '…' : `${healthOkCount}/${healthTotal}`}
                  </p>
                  <p className="text-[10px] text-ink3 mt-1">
                    {healthLoading ? 'Checking…' : allHealthOk ? 'All operational' : 'Degraded — check health'}
                  </p>
                </div>
              </div>

              {/* Active Kits */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="sec-label">Active Kits {activatedKitIds.size > 0 && <span className="font-normal text-ink3">({activatedKitIds.size})</span>}</p>
                  <button onClick={() => setSection('kits')} className="text-xs text-ink3 hover:text-ink transition-colors">Browse all →</button>
                </div>
                <div className="space-y-2">
                  {(activatedKitIds.size > 0 ? KITS.filter(k => activatedKitIds.has(k.id)) : KITS.slice(0, 2)).map(kit => (
                    <div key={kit.id} className="panel flex items-center gap-3">
                      <span className="text-xl">{kit.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{kit.title}</p>
                        <div className="flex gap-1 mt-1">{kit.tags.map(t => <span key={t} className="chip">{t}</span>)}</div>
                      </div>
                      <span className="chip ok">{kit.score}</span>
                    </div>
                  ))}
                  {activatedKitIds.size === 0 && (
                    <p className="text-xs text-ink3 py-2">No kits activated.{' '}
                      <button className="underline hover:text-ink transition-colors" onClick={() => setSection('kits')}>Browse Kit Registry →</button>
                    </p>
                  )}
                </div>
              </div>

              {/* AI Learning Cycle */}
              {learning && learning.agents.filter(a => a.runCount > 0).length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="sec-label">AI Learning Cycle</p>
                    <button onClick={() => onNavigate('agent-editor' as NavPageId)} className="text-xs text-ink3 underline hover:text-ink transition-colors">
                      Edit prompts →
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    {learning.agents.filter(a => a.runCount > 0).slice(0, 4).map(agent => {
                      const score = agent.avgScore ?? 0
                      const color = score >= 8 ? 'text-green' : score >= 6 ? 'text-amber' : 'text-rose-400'
                      return (
                        <div key={agent.id} className="panel py-2.5 text-center">
                          <p className={`text-xl font-bold ${color}`} style={{ fontFamily: 'var(--ff-d)' }}>
                            {score > 0 ? score.toFixed(1) : '—'}
                          </p>
                          <p className="text-[10px] text-ink3 mt-0.5 truncate">{agent.name}</p>
                          <p className="text-[9px] text-ink3">{agent.runCount} runs · v{agent.versionCount}</p>
                        </div>
                      )
                    })}
                  </div>
                  {learning.lowAgent && (learning.lowAgent.avgScore ?? 10) < 7.5 && (
                    <div className="border border-amber/30 bg-amber/5 rounded-lg px-3 py-2 text-xs text-amber flex items-start gap-2">
                      <span className="flex-shrink-0 mt-0.5">⚠</span>
                      <span><strong>{learning.lowAgent.name}</strong> scoring {learning.lowAgent.avgScore?.toFixed(1)}/10 — will auto-improve at next learning cycle.</span>
                    </div>
                  )}
                  {learning.topAgent && (learning.topAgent.avgScore ?? 0) >= 9 && (
                    <div className="border border-green/30 bg-green/5 rounded-lg px-3 py-2 text-xs text-green flex items-start gap-2">
                      <span className="flex-shrink-0 mt-0.5">✓</span>
                      <span><strong>{learning.topAgent.name}</strong> at {learning.topAgent.avgScore?.toFixed(1)}/10 — top performer.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Recent Builds */}
              {builds.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="sec-label">Recent Builds</p>
                    <button onClick={() => setSection('executions')} className="text-xs text-ink3 hover:text-ink transition-colors">All builds →</button>
                  </div>
                  <ExecTable builds={builds.slice(0, 5)} onNavigate={onNavigate} />
                </div>
              )}
            </div>
          )}

          {/* ── EXECUTION LOG ── */}
          {section === 'executions' && (
            <div className="animate-fadein">
              <p className="sec-label mb-4">Execution Log</p>
              {builds.length === 0
                ? (
                  <div className="border border-dashed border-acid/30 bg-acid/5 rounded-xl p-12 text-center space-y-3">
                    <p className="text-ink3 text-sm">No executions yet. Run the FORGE engine to create your first build.</p>
                    <button className="btn btn-primary" onClick={() => onNavigate('forge')}>⚡ Launch FORGE Engine →</button>
                  </div>
                )
                : <ExecTable builds={builds} onNavigate={onNavigate} />
              }
            </div>
          )}

          {/* ── KIT REGISTRY ── */}
          {section === 'kits' && (
            <div className="animate-fadein space-y-4">
              <div className="flex items-center justify-between mb-4">
                <p className="sec-label">Kit Registry</p>
                <span className="chip">{activatedKitIds.size} / {KITS.length} active</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {KITS.map(kit => {
                  const isActive  = activatedKitIds.has(kit.id)
                  const isLoading = kitLoading === kit.id
                  return (
                    <div key={kit.id} className={`card space-y-3 transition-colors ${isActive ? 'border-acid/40 bg-acid/5' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-2xl">{kit.icon}</span>
                          <h3 className="font-bold text-sm mt-1">{kit.title}</h3>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="chip ok">{kit.score}</span>
                          {isActive && <span className="chip acid text-xs">Active</span>}
                        </div>
                      </div>
                      <p className="text-xs text-ink3 leading-relaxed">{kit.desc}</p>
                      <div className="flex gap-1 flex-wrap">
                        {kit.tags.map(t => <span key={t} className="chip">{t}</span>)}
                      </div>
                      <button
                        onClick={() => toggleKit(kit.id)}
                        disabled={isLoading}
                        className={`btn text-xs py-1.5 w-full ${isActive ? 'btn-ghost border-acid/30' : 'btn-primary'}`}
                      >
                        {isLoading ? 'Updating…' : isActive ? 'Deactivate Kit' : 'Activate Kit →'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── AGENT FEED ── */}
          {section === 'feed' && (
            <div className="animate-fadein space-y-6">
              <div>
                <p className="sec-label mb-3">Agent Workers</p>
                <div className="space-y-2">
                  {['Orchestrator', 'Analyst', 'Architect', 'Planner', 'Builder', 'Security', 'DB Optimizer', 'QA Gate', 'Deliverer'].map(name => (
                    <div key={name} className="panel flex items-center gap-3">
                      <span className="status-dot sd-ok" />
                      <span className="text-sm font-medium">{name} Agent</span>
                      <span className="chip acid ml-auto text-[10px]">READY</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="sec-label mb-3">
                  Activity Log
                  {builds.length > 0 && <span className="text-ink3 font-normal ml-1">(from {builds.length} build{builds.length !== 1 ? 's' : ''})</span>}
                </p>
                <div ref={logRef} className="stream-box h-72 overflow-y-auto">
                  {/* Real execution data first */}
                  {builds.slice(0, 5).flatMap((b, bi) =>
                    b.phases.map((phase, pi) => (
                      <div key={`real-${bi}-${pi}`} className="al-ok">
                        <span className="text-ink3 mr-2">{b.time ?? ''}</span>
                        [✓] {phase}: {b.client} · Score {b.score?.toFixed(1) ?? '—'}
                      </div>
                    ))
                  )}
                  {/* Demo animation only when no real data */}
                  {builds.length === 0 && agentLogLines.map((line, i) => (
                    <div
                      key={`demo-${i}`}
                      className={line.includes('[✓]') ? 'al-ok' : line.includes('[→]') ? 'al-info' : 'al-warn'}
                    >{line}</div>
                  ))}
                  {builds.length === 0 && agentLogLines.length === 0 && (
                    <div className="al-info">Waiting for first FORGE run…</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── ANALYTICS ── */}
          {section === 'funnel' && (
            <div className="animate-fadein space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="sec-label">Analytics</p>
                <div className="flex gap-1">
                  {(['7d', '30d', '90d'] as const).map(w => (
                    <button
                      key={w}
                      onClick={() => setAnalyticsWindow(w)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${analyticsWindow === w ? 'nav-tab-active' : 'text-ink3 hover:text-ink hover:bg-paper2'}`}
                    >{w}</button>
                  ))}
                </div>
              </div>

              {analytics ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: 'Total Runs',  val: analytics.kpis.totalRuns || '—',   delta: analytics.deltas.runs,   chip: '' },
                      { label: 'Pass Rate',   val: analytics.kpis.totalRuns ? `${analytics.kpis.passRate}%` : '—', delta: null, chip: analytics.kpis.passRate >= 80 ? 'ok' : analytics.kpis.passRate >= 50 ? '' : 'warn' },
                      { label: 'Avg Score',   val: analytics.kpis.avgScore !== null ? (analytics.kpis.avgScore < 5 ? 'Baseline' : `${analytics.kpis.avgScore}/10`) : '—', delta: analytics.deltas.score, chip: (analytics.kpis.avgScore ?? 0) >= 8 ? 'ok' : '' },
                      { label: 'Tokens Used', val: analytics.kpis.totalTokens > 0 ? `${(analytics.kpis.totalTokens / 1000).toFixed(1)}K` : '—', delta: analytics.deltas.tokens, chip: 'acid' },
                    ].map(({ label, val, delta, chip }) => (
                      <div key={label} className="kpi-card">
                        <p className="text-xs text-ink3 mb-1">{label}</p>
                        <p className="text-2xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>{String(val)}</p>
                        <DeltaChip delta={delta ?? null} />
                        {chip && <span className={`chip ${chip} text-xs mt-1`}>{chip === 'ok' ? 'On track' : chip === 'warn' ? 'Needs attention' : chip}</span>}
                      </div>
                    ))}
                  </div>

                  {analytics.trend.length > 0 && (
                    <div>
                      <p className="sec-label mb-3">Daily Runs — {analytics.window}</p>
                      <div className="border border-border rounded-xl p-4 bg-paper2 overflow-x-auto">
                        <div className="flex items-end gap-1 h-20 min-w-max">
                          {analytics.trend.map(({ date, runs }) => {
                            const maxRuns = Math.max(...analytics.trend.map(t => t.runs), 1)
                            const pct = Math.round((runs / maxRuns) * 100)
                            return (
                              <div key={date} className="flex flex-col items-center gap-1 w-8 group">
                                <div
                                  className="w-6 rounded-t bg-acid/60 group-hover:bg-acid transition-colors"
                                  style={{ height: `${Math.max(pct, 4)}%` }}
                                  title={`${date}: ${runs} run${runs !== 1 ? 's' : ''}`}
                                />
                                <span className="text-[9px] text-ink3 rotate-45 origin-left hidden sm:block">{date.slice(5)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="sec-label mb-4">Execution Pipeline</p>
                    {analytics.kpis.totalRuns === 0 ? (
                      <div className="border border-dashed border-acid/30 bg-acid/5 rounded-xl p-8 text-center space-y-3">
                        <p className="text-ink3 text-sm">No builds yet — run FORGE to populate the funnel.</p>
                        <button className="btn btn-primary text-sm" onClick={() => onNavigate('forge')}>⚡ Launch FORGE →</button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {[
                          { label: 'Runs Started',           count: analytics.kpis.totalRuns,    color: 'var(--acid)'   },
                          { label: 'Full Pipeline (7+ phases)', count: analytics.kpis.fullPipeline, color: 'var(--cyan)'   },
                          { label: 'QA Approved',            count: analytics.kpis.passedRuns,   color: 'var(--green)'  },
                          { label: 'Audit Events',           count: analytics.kpis.auditEvents,  color: 'var(--violet)' },
                        ].map(stage => {
                          const total = analytics.kpis.totalRuns || 1
                          const pct = Math.round((stage.count / total) * 100)
                          return (
                            <div key={stage.label} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">{stage.label}</span>
                                <span className="font-mono text-ink3">{stage.count} ({pct}%)</span>
                              </div>
                              <div className="h-4 rounded-md bg-paper3 w-full overflow-hidden">
                                <div className="h-full rounded-md transition-all duration-700" style={{ width: `${pct}%`, background: stage.color }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {analytics.scoreDist.some(d => d.count > 0) && (
                    <div>
                      <p className="sec-label mb-3">Score Distribution</p>
                      <div className="grid grid-cols-5 gap-2 text-center">
                        {analytics.scoreDist.map(({ label, count }) => (
                          <div key={label} className="panel py-3">
                            <p className="text-lg font-bold" style={{ fontFamily: 'var(--ff-d)' }}>{count}</p>
                            <p className="text-xs text-ink3 mt-1">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analytics.topActions.length > 0 && (
                    <div>
                      <p className="sec-label mb-3">Top Actions</p>
                      <div className="space-y-2">
                        {analytics.topActions.slice(0, 5).map(({ action, count }) => {
                          const maxCount = analytics.topActions[0]?.count || 1
                          return (
                            <div key={action} className="flex items-center gap-3">
                              <span className="text-xs font-mono w-44 truncate text-ink3">{action.replace(/_/g, ' ')}</span>
                              <div className="flex-1 h-3 rounded bg-paper3 overflow-hidden">
                                <div className="h-full rounded bg-acid/50 transition-all duration-500" style={{ width: `${Math.round((count / maxCount) * 100)}%` }} />
                              </div>
                              <span className="text-xs font-mono w-8 text-right text-ink2">{count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16">
                  <div className="text-ink3 text-sm animate-pulse">Loading analytics…</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg animate-fadein bg-paper2 text-ink border border-border max-w-xs">
          {toast}
        </div>
      )}
    </div>
  )
}

function ExecTable({ builds, onNavigate }: { builds: Build[]; onNavigate: (p: NavPageId) => void }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-paper2 border-b border-border">
            {['Build', 'Client', 'Date', 'Score', 'Status'].map(h => (
              <th key={h} className="text-left py-2.5 px-3 text-[10px] font-semibold text-ink3 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {builds.map(b => {
            const { label: statusLabel, cls: statusCls } = fmtStatus(b.status ?? '')
            return (
              <tr key={b.id} className="border-b border-border last:border-0 hover:bg-paper2 transition-colors">
                <td className="py-2.5 px-3">
                  <div className="text-xs font-medium">FORGE · {b.phases.length}/9 phases</div>
                  <div className="text-[10px] text-ink3 truncate max-w-[140px]">{b.input}</div>
                </td>
                <td className="py-2.5 px-3 text-xs text-ink2">{b.client}</td>
                <td className="py-2.5 px-3">
                  <div className="text-xs">{b.date}</div>
                  <div className="text-[10px] text-ink3">{b.time}</div>
                </td>
                <td className="py-2.5 px-3">
                  {b.score !== null ? (
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold tabular-nums ${b.score >= 8 ? 'text-green' : b.score >= 6 ? 'text-amber' : 'text-rose-400'}`}>
                        {b.score.toFixed(1)}
                      </span>
                      <div className="w-12 h-1.5 rounded-full bg-paper3 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${b.score >= 8 ? 'bg-green' : b.score >= 6 ? 'bg-amber' : 'bg-rose-400'}`}
                          style={{ width: `${(b.score / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                  ) : <span className="text-ink3 text-xs">—</span>}
                </td>
                <td className="py-2.5 px-3">
                  <span className={`chip ${statusCls}`}>{statusLabel}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
