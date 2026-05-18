'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { clsx } from 'clsx'
import { useWorkspace } from '@/lib/workspaceContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrendingItem {
  id:         string
  title:      string
  url:        string | null
  source:     string
  category:   string
  audience:   string
  summary:    string
  useCase:    string
  tags:       string[]
  hnScore:    number
  fetchedAt:  string
  confidence?: number
  regimeClass?: string
}

interface WorkspaceIdea {
  id:              string
  workspaceId:     string
  title:           string
  niche:           string
  problem:         string
  targetMarket:    string
  revenueModel:    string
  trendReason:     string
  buildComplexity: string
  tags:            string[]
  opportunityScore: number
  confidence:      number
  status:          string
  freshUntil:      string
  convertedAt:     string | null
  createdAt:       string
}

interface GlobalData {
  items:       TrendingItem[]
  lastFetched: string | null
  nextFetch:   string | null
  batchCount:  number
}

interface WorkspaceData {
  items:       WorkspaceIdea[]
  lastFetched: string | null
  nextFetch:   string | null
  industry:    string
}

type FeedScope = 'global' | 'workspace'

// ─── Constants ─────────────────────────────────────────────────────────────────

const NICHE_META: Record<string, { label: string; icon: string }> = {
  productivity:  { label: 'Productivity',  icon: '⚡' },
  finance:       { label: 'Finance',       icon: '◈'  },
  creator:       { label: 'Creator',       icon: '✦'  },
  b2b:           { label: 'B2B SaaS',      icon: '▣'  },
  health:        { label: 'Health',        icon: '○'  },
  education:     { label: 'Education',     icon: '◎'  },
  'ai-tools':    { label: 'AI Tools',      icon: '◆'  },
  ecommerce:     { label: 'E-commerce',    icon: '▲'  },
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  fresh:     { label: 'Fresh',     color: 'text-emerald-600 border-emerald-200 bg-emerald-50' },
  stale:     { label: 'Stale',     color: 'text-amber-600 border-amber-200 bg-amber-50' },
  archived:  { label: 'Archived',  color: 'text-ink3 border-border' },
  converted: { label: 'Built',     color: 'text-blue-600 border-blue-200 bg-blue-50' },
  bookmarked:{ label: 'Saved',     color: 'text-purple-600 border-purple-200 bg-purple-50' },
}

const COMPLEXITY_BADGE: Record<string, string> = {
  low:    'border-border text-ink3',
  medium: 'border-border text-ink2',
  high:   'border-border text-ink3',
}

const NICHE_FILTERS = [
  { id: '', label: 'All niches' },
  { id: 'ai-tools',    label: 'AI Tools' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'b2b',         label: 'B2B SaaS' },
  { id: 'creator',     label: 'Creator' },
  { id: 'finance',     label: 'Finance' },
  { id: 'ecommerce',   label: 'E-commerce' },
  { id: 'health',      label: 'Health' },
  { id: 'education',   label: 'Education' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor(diff / 60000)
  if (h >= 1) return `${h}h ago`
  if (m >= 1) return `${m}m ago`
  return 'just now'
}

function timeUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'soon'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function parseItemTags(tags: string[]) {
  const buildTag   = tags.find(t => t.startsWith('build:'))
  const complexity = buildTag ? buildTag.replace('build:', '') : 'medium'
  const cleanTags  = tags.filter(t => !t.startsWith('build:') && !t.startsWith('regime:'))
  const topicTags  = cleanTags.slice(0, -1)
  const market     = cleanTags.at(-1) ?? ''
  return { complexity, topicTags, market }
}

function parseUseCase(useCase: string) {
  const pivot = useCase.indexOf('· Revenue:')
  if (pivot === -1) return { trend: useCase, revenue: '' }
  return {
    trend:   useCase.slice(0, pivot).trim(),
    revenue: useCase.slice(pivot + 10).trim(),
  }
}

function compactSentence(value: string, fallback: string): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (!clean) return fallback
  return clean.endsWith('.') ? clean.slice(0, -1) : clean
}

function buildMvpPainPoints(title: string, summary: string, market: string): string[] {
  const cleanTitle = title.replace(/^AI-powered\s+/i, '')
  const audience   = market || 'target users'
  const problem    = compactSentence(summary, `${audience} need a faster way to operate ${cleanTitle}`)
  return [
    `${audience} cannot quickly turn messy intake, requests, or source material into a clean working queue: ${problem}`,
    `${audience} lack a single dashboard to prioritize the highest-value work and see what needs action now`,
    `${audience} need exportable, client-ready outputs that prove ROI without manual reporting or spreadsheet cleanup`,
  ]
}

function buildDeferredRoadmap(tags: string[]): string[] {
  const tagRoadmap = tags
    .filter(t => !t.startsWith('build:') && !t.startsWith('regime:'))
    .slice(0, 4)
    .map(tag => `${tag.replace(/[-_]/g, ' ')} automation`)
  const base = [
    'Team roles and approval permissions',
    'Real database persistence and workspace accounts',
    'Billing, entitlement checks, and upgrade flows',
    'Advanced analytics and benchmark reports',
    'Integrations with the buyer workflow stack',
    'Enterprise audit logs and SLA controls',
  ]
  return [...tagRoadmap, ...base]
    .filter((item, i, arr) => item && arr.findIndex(v => v.toLowerCase() === item.toLowerCase()) === i)
    .slice(0, 8)
}

function buildBriefFromGlobalItem(item: TrendingItem): { brief: string; client: string } {
  const { trend, revenue } = parseUseCase(item.useCase)
  const { market, topicTags } = parseItemTags(item.tags)
  const niche = NICHE_META[item.category]?.label ?? item.category
  const painPoints = buildMvpPainPoints(item.title, item.summary, market)
  const roadmap = buildDeferredRoadmap(item.tags)

  const brief = `Build a micro-SaaS product: ${item.title}

PROBLEM TO SOLVE
${item.summary}

TARGET MARKET
${market || 'Small businesses and entrepreneurs'}

NICHE / CATEGORY
${niche}

REVENUE MODEL
${revenue || '$29/mo per user'}

WHY IT IS TRENDING NOW
${trend || 'High market demand and underserved niche.'}

MVP SCOPE STRATEGY
Build a production-grade MVP that solves exactly the 3 most urgent pain points first. Do not attempt a bloated all-feature platform in the first generated application.

TOP 3 PAIN POINTS TO BUILD NOW
1. ${painPoints[0]}
2. ${painPoints[1]}
3. ${painPoints[2]}

MVP WORKFLOWS TO IMPLEMENT
- Intake / input workflow: capture the core user input and normalize it into structured records.
- Operating dashboard: show priorities, status, metrics, and next actions for the ${market || 'target user'}.
- Output / export workflow: produce a useful handoff, report, or action pack the buyer can use immediately.

DEFERRED ROADMAP / SELLING POINTS
Highlight these as locked expansion features, not half-built pages:
${roadmap.map((r, i) => `${i + 1}. ${r}`).join('\n')}

POST-PAYMENT ONE-CLICK EXPANSION
Include an upgrade CTA such as "Unlock full roadmap". After payment, one button click should be presented as the mechanism that delivers the deferred roadmap features for users, agencies, and enterprises. Do not integrate a real payment SDK in this generated MVP; represent it as a credible locked roadmap and upgrade flow.

PRODUCTION QUALITY BAR
- The generated app must be interactive, not static: forms, filters, stateful dashboard actions, modals, and CSV/export behavior.
- Use realistic local TypeScript data with at least 10 records per main entity.
- Avoid placeholder copy, demo-only language, TODOs, lorem ipsum, or generic screenshots.
- Build for a paid buyer evaluating whether this can become their operational workflow today.`.trim()

  return { brief, client: item.title }
}

function buildBriefFromWorkspaceIdea(idea: WorkspaceIdea): { brief: string; client: string } {
  const niche      = NICHE_META[idea.niche]?.label ?? idea.niche
  const roadmap    = buildDeferredRoadmap(idea.tags)
  const painPoints = buildMvpPainPoints(idea.title, idea.problem, idea.targetMarket)

  const brief = `Build a micro-SaaS product: ${idea.title}

PROBLEM TO SOLVE
${idea.problem}

TARGET MARKET
${idea.targetMarket}

NICHE / CATEGORY
${niche}

REVENUE MODEL
${idea.revenueModel}

WHY IT IS TRENDING NOW
${idea.trendReason}

MVP SCOPE STRATEGY
Build a production-grade MVP that solves exactly the 3 most urgent pain points first.

TOP 3 PAIN POINTS TO BUILD NOW
1. ${painPoints[0]}
2. ${painPoints[1]}
3. ${painPoints[2]}

MVP WORKFLOWS TO IMPLEMENT
- Intake / input workflow: capture the core user input and normalize it into structured records.
- Operating dashboard: show priorities, status, metrics, and next actions for ${idea.targetMarket}.
- Output / export workflow: produce a useful handoff, report, or action pack the buyer can use immediately.

DEFERRED ROADMAP / SELLING POINTS
${roadmap.map((r, i) => `${i + 1}. ${r}`).join('\n')}

PRODUCTION QUALITY BAR
- Interactive, not static: forms, filters, stateful dashboard actions, modals, CSV export.
- Realistic local TypeScript data with at least 10 records per main entity.
- Build complexity preference: ${idea.buildComplexity}.`.trim()

  return { brief, client: idea.title }
}

// ─── Global Item Card ─────────────────────────────────────────────────────────

function GlobalIdeaCard({
  item, expanded, onExpand, onBuildPipeline, onBuildForge,
}: {
  item: TrendingItem
  expanded: boolean
  onExpand: () => void
  onBuildPipeline: (item: TrendingItem) => void
  onBuildForge: (item: TrendingItem) => void
}) {
  const nicheMeta    = NICHE_META[item.category] ?? { label: item.category, icon: '▣' }
  const { complexity, topicTags, market } = parseItemTags(item.tags)
  const { trend, revenue } = parseUseCase(item.useCase)

  return (
    <div
      className={clsx(
        'panel flex flex-col gap-3 transition-all cursor-pointer',
        expanded ? 'border-ink/20' : 'hover:border-ink/15'
      )}
      onClick={onExpand}
    >
      {/* Top row */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold font-mono text-ink2 border border-border rounded-lg px-2 py-1">
          <span>{nicheMeta.icon}</span>
          <span className="uppercase tracking-wider">{nicheMeta.label}</span>
        </span>
        <div className="flex items-center gap-2">
          <span className={clsx('text-[9px] font-bold font-mono px-2 py-0.5 rounded border', COMPLEXITY_BADGE[complexity] ?? COMPLEXITY_BADGE.medium)}>
            {complexity === 'low' ? 'QUICK' : complexity === 'high' ? 'COMPLEX' : 'MID'}
          </span>
          <div className="text-right">
            <p className="text-sm font-black tabular-nums text-ink leading-none">{item.hnScore}</p>
            <p className="text-[8px] font-mono text-ink3 leading-none mt-0.5">SCORE</p>
          </div>
        </div>
      </div>

      {/* Title */}
      <p className="text-sm font-bold text-ink leading-snug">{item.title}</p>

      {/* Problem */}
      <p className="text-xs text-ink3 leading-relaxed">{item.summary}</p>

      {/* Target market */}
      {market && (
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono text-ink3 uppercase tracking-widest">For</span>
          <span className="text-[10px] text-ink2 font-medium">{market}</span>
        </div>
      )}

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-border pt-3 space-y-3">
          {trend && (
            <div>
              <p className="text-[9px] font-black font-mono uppercase tracking-widest text-ink3 mb-1">Why it&apos;s trending</p>
              <p className="text-xs text-ink2 leading-relaxed">{trend}</p>
            </div>
          )}
          {revenue && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-ink3 uppercase tracking-widest">Revenue model</span>
              <span className="text-xs font-semibold text-ink border border-border rounded px-2 py-0.5">{revenue}</span>
            </div>
          )}
          <div className="rounded-lg border border-border bg-paper2/50 p-3">
            <p className="text-[9px] font-black font-mono uppercase tracking-widest text-ink3 mb-1">One-Click build scope</p>
            <p className="text-xs text-ink2 leading-relaxed">
              Builds the 3 highest-value MVP workflows first, then presents the remaining roadmap as locked paid expansion features.
            </p>
          </div>
          {topicTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {topicTags.map(tag => (
                <span key={tag} className="chip text-[10px] border border-border/60">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-border/50">
        <button
          onClick={e => { e.stopPropagation(); onBuildPipeline(item) }}
          className="flex-1 text-[10px] py-1.5 px-2 rounded-lg bg-ink text-paper font-black text-center transition-all hover:bg-ink/80 flex items-center justify-center gap-1"
          title="Brief → FORGE → BUILD → Live URL in one click"
        >
          ▶ One-Click
        </button>
        <button
          onClick={e => { e.stopPropagation(); onBuildForge(item) }}
          className="btn btn-ghost text-[10px] py-1 px-2 font-semibold"
          title="Build spec only in FORGE Engine"
        >
          FORGE
        </button>
        <button
          onClick={e => { e.stopPropagation(); onExpand() }}
          className="text-[10px] text-ink3 hover:text-ink transition-colors px-1.5 font-medium flex-shrink-0"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>
    </div>
  )
}

// ─── Workspace Idea Card ───────────────────────────────────────────────────────

function WorkspaceIdeaCard({
  idea, expanded, onExpand, onBuildPipeline, onBuildForge, onBookmark, onArchive,
}: {
  idea: WorkspaceIdea
  expanded: boolean
  onExpand: () => void
  onBuildPipeline: (idea: WorkspaceIdea) => void
  onBuildForge: (idea: WorkspaceIdea) => void
  onBookmark: (idea: WorkspaceIdea) => void
  onArchive: (idea: WorkspaceIdea) => void
}) {
  const nicheMeta  = NICHE_META[idea.niche] ?? { label: idea.niche, icon: '▣' }
  const statusMeta = STATUS_META[idea.status] ?? STATUS_META.fresh
  const isFresh    = idea.status === 'fresh'
  const isExpired  = new Date(idea.freshUntil) < new Date()

  return (
    <div
      className={clsx(
        'panel flex flex-col gap-3 transition-all cursor-pointer',
        expanded ? 'border-ink/20' : 'hover:border-ink/15',
        idea.status === 'converted' && 'opacity-70',
      )}
      onClick={onExpand}
    >
      {/* Top row: niche + status + score */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="flex items-center gap-1 text-[10px] font-bold font-mono text-ink2 border border-border rounded-lg px-2 py-1">
            <span>{nicheMeta.icon}</span>
            <span className="uppercase tracking-wider">{nicheMeta.label}</span>
          </span>
          <span className={clsx(
            'text-[9px] font-bold font-mono px-2 py-0.5 rounded border',
            statusMeta.color,
          )}>
            {statusMeta.label.toUpperCase()}
          </span>
          {isExpired && isFresh && (
            <span className="text-[9px] font-mono text-amber-600 border border-amber-200 bg-amber-50 px-1.5 py-0.5 rounded">EXPIRING</span>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-black tabular-nums text-ink leading-none">{idea.opportunityScore}</p>
          <p className="text-[8px] font-mono text-ink3 leading-none mt-0.5">SCORE</p>
        </div>
      </div>

      {/* Title */}
      <p className="text-sm font-bold text-ink leading-snug">{idea.title}</p>

      {/* Problem */}
      <p className="text-xs text-ink3 leading-relaxed">{idea.problem}</p>

      {/* Target market */}
      {idea.targetMarket && (
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono text-ink3 uppercase tracking-widest">For</span>
          <span className="text-[10px] text-ink2 font-medium">{idea.targetMarket}</span>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border pt-3 space-y-3">
          {idea.trendReason && (
            <div>
              <p className="text-[9px] font-black font-mono uppercase tracking-widest text-ink3 mb-1">Why it&apos;s trending</p>
              <p className="text-xs text-ink2 leading-relaxed">{idea.trendReason}</p>
            </div>
          )}
          {idea.revenueModel && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-ink3 uppercase tracking-widest">Revenue model</span>
              <span className="text-xs font-semibold text-ink border border-border rounded px-2 py-0.5">{idea.revenueModel}</span>
            </div>
          )}
          <div className="text-[9px] font-mono text-ink3">
            Generated {timeAgo(idea.createdAt)} · Fresh until {new Date(idea.freshUntil).toLocaleDateString()}
          </div>
          {idea.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {idea.tags.slice(0, 6).map(tag => (
                <span key={tag} className="chip text-[10px] border border-border/60">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-border/50">
        {idea.status !== 'converted' ? (
          <>
            <button
              onClick={e => { e.stopPropagation(); onBuildPipeline(idea) }}
              className="flex-1 text-[10px] py-1.5 px-2 rounded-lg bg-ink text-paper font-black text-center transition-all hover:bg-ink/80 flex items-center justify-center gap-1"
              title="Pre-fill pipeline brief from this idea"
            >
              ▶ Build This
            </button>
            <button
              onClick={e => { e.stopPropagation(); onBuildForge(idea) }}
              className="btn btn-ghost text-[10px] py-1 px-2 font-semibold"
              title="Build spec in FORGE Engine"
            >
              FORGE
            </button>
            {idea.status !== 'bookmarked' ? (
              <button
                onClick={e => { e.stopPropagation(); onBookmark(idea) }}
                className="text-[10px] text-ink3 hover:text-ink transition-colors px-1.5 font-medium"
                title="Bookmark this idea"
              >
                ☆
              </button>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); onArchive(idea) }}
                className="text-[10px] text-amber-600 hover:text-ink transition-colors px-1.5 font-medium"
                title="Archive this idea"
              >
                ★
              </button>
            )}
          </>
        ) : (
          <div className="flex-1 text-[10px] text-blue-600 font-semibold font-mono text-center py-1">
            ✓ Built — pipeline run started
          </div>
        )}
        <button
          onClick={e => { e.stopPropagation(); onExpand() }}
          className="text-[10px] text-ink3 hover:text-ink transition-colors px-1.5 font-medium flex-shrink-0"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TrendingPage() {
  const router  = useRouter()
  const { data: session } = useSession()
  const { active: activeWorkspace, activeProfile } = useWorkspace()

  const [scope,      setScope]      = useState<FeedScope>('global')
  const [globalData, setGlobalData] = useState<GlobalData | null>(null)
  const [wsData,     setWsData]     = useState<WorkspaceData | null>(null)
  const [wsIdeas,    setWsIdeas]    = useState<WorkspaceIdea[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [niche,      setNiche]      = useState('')
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [triggerMsg, setTriggerMsg] = useState('')

  const isLoggedIn = !!session?.user

  // ── Load global feed ───────────────────────────────────────────────────────
  const loadGlobal = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '20', scope: 'global' })
      if (niche) params.set('category', niche)
      const r = await fetch(`/api/trending?${params}`)
      const d = await r.json()
      if (d.ok) setGlobalData(d.data)
    } finally {
      setLoading(false)
    }
  }, [niche])

  // ── Load workspace feed ────────────────────────────────────────────────────
  const loadWorkspace = useCallback(async () => {
    if (!activeWorkspace?.id) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ scope: 'workspace', ws: activeWorkspace.id })
      if (niche) params.set('category', niche)
      const r = await fetch(`/api/trending?${params}`)
      const d = await r.json()
      if (d.ok) {
        setWsData(d.data)
        setWsIdeas(d.data.items ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace?.id, niche])

  useEffect(() => {
    if (scope === 'global') loadGlobal()
    else loadWorkspace()
  }, [scope, loadGlobal, loadWorkspace])

  // Switch to global if no workspace active
  useEffect(() => {
    if (scope === 'workspace' && !activeWorkspace?.id) setScope('global')
  }, [activeWorkspace?.id, scope])

  // ── Actions ────────────────────────────────────────────────────────────────

  const triggerGlobalFetch = async () => {
    setRefreshing(true)
    setTriggerMsg('')
    try {
      const r = await fetch('/api/trending', { method: 'POST' })
      const d = await r.json()
      if (d.ok) {
        setTriggerMsg(`Generated ${d.data.count} opportunities`)
        await loadGlobal()
      } else {
        setTriggerMsg(d.error ?? 'Failed')
      }
    } finally {
      setRefreshing(false)
    }
  }

  const triggerWorkspaceGenerate = async (force = false) => {
    if (!activeWorkspace?.id) return
    setGenerating(true)
    setTriggerMsg('')
    try {
      const r = await fetch(`/api/workspaces/${activeWorkspace.id}/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ force }),
      })
      const d = await r.json()
      if (d.ok) {
        if (d.data.skipped) {
          setTriggerMsg(`Ideas are still fresh. Next refresh ${timeUntil(d.data.nextRefresh)}.`)
        } else {
          setTriggerMsg(`Generated ${d.data.ideasGenerated} new ideas (${d.data.deDupedCount} deduped)`)
          await loadWorkspace()
        }
      } else {
        setTriggerMsg(d.error ?? 'Generation failed')
      }
    } finally {
      setGenerating(false)
    }
  }

  const buildInPipeline = useCallback((brief: string, client: string, ideaId?: string) => {
    sessionStorage.setItem('nexus-prefill-pipeline-brief',  brief)
    sessionStorage.setItem('nexus-prefill-pipeline-client', client)
    try {
      localStorage.setItem('nexus-prefill-pipeline-brief',  brief)
      localStorage.setItem('nexus-prefill-pipeline-client', client)
    } catch { /* storage full */ }
    // When launched from a WorkspaceIdea, write source keys so PipelinePage can
    // mark the idea as 'converted' after the pipeline completes successfully.
    if (ideaId && activeWorkspace?.id) {
      sessionStorage.setItem('nexus-pipeline-source-idea-id',      ideaId)
      sessionStorage.setItem('nexus-pipeline-source-workspace-id', activeWorkspace.id)
    } else {
      sessionStorage.removeItem('nexus-pipeline-source-idea-id')
      sessionStorage.removeItem('nexus-pipeline-source-workspace-id')
    }
    router.push('/shell?page=pipeline')
  }, [router, activeWorkspace?.id])

  const buildInForge = useCallback((brief: string, client: string) => {
    sessionStorage.setItem('nexus-prefill-forge-input',  brief)
    sessionStorage.setItem('nexus-prefill-forge-client', client)
    router.push('/shell?page=forge')
  }, [router])

  const handleBookmarkIdea = async (idea: WorkspaceIdea) => {
    if (!activeWorkspace?.id) return
    try {
      await fetch(`/api/workspaces/${activeWorkspace.id}/ideas/${idea.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'bookmarked' }),
      })
      setWsIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, status: 'bookmarked' } : i))
    } catch { /* non-fatal */ }
  }

  const handleArchiveIdea = async (idea: WorkspaceIdea) => {
    if (!activeWorkspace?.id) return
    try {
      await fetch(`/api/workspaces/${activeWorkspace.id}/ideas/${idea.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'archived' }),
      })
      setWsIdeas(prev => prev.filter(i => i.id !== idea.id))
    } catch { /* non-fatal */ }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const profileConfigured = activeProfile?.primaryIndustry && activeProfile.primaryIndustry !== 'unconfigured'

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-black font-mono tracking-widest text-ink3 uppercase mb-1">
            NEXUS OS · AI Intelligence Feed
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Trending Opportunities
          </h1>
          <p className="text-sm text-ink3 mt-1">
            {scope === 'global'
              ? 'Global micro-SaaS opportunities — analysed, scored, and ready to build'
              : `${activeProfile?.primaryIndustry !== 'unconfigured' ? (activeProfile?.primaryIndustry ?? activeWorkspace?.name) : activeWorkspace?.name} — workspace-specific opportunities`
            }
          </p>
        </div>

        {/* Scope switcher */}
        {isLoggedIn && activeWorkspace && (
          <div className="flex items-center gap-1 border border-border rounded-xl p-1 bg-paper2/60">
            <button
              onClick={() => setScope('global')}
              className={clsx(
                'text-xs font-semibold px-3 py-1.5 rounded-lg transition-all',
                scope === 'global' ? 'bg-ink text-paper' : 'text-ink3 hover:text-ink'
              )}
            >
              Global
            </button>
            <button
              onClick={() => setScope('workspace')}
              className={clsx(
                'text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5',
                scope === 'workspace' ? 'bg-ink text-paper' : 'text-ink3 hover:text-ink'
              )}
            >
              <span>{activeWorkspace.emoji}</span>
              <span>{activeWorkspace.name}</span>
            </button>
          </div>
        )}
      </div>

      {/* Workspace profile status banner */}
      {scope === 'workspace' && activeWorkspace && !profileConfigured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-800">Set up your workspace intelligence profile</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Configure your industry to get workspace-specific opportunities instead of generic ideas.
            </p>
          </div>
          <button
            onClick={() => router.push('/shell?page=workspaces')}
            className="text-xs font-bold text-amber-800 border border-amber-300 bg-white hover:bg-amber-50 rounded-lg px-3 py-1.5 flex-shrink-0 transition-all"
          >
            Configure →
          </button>
        </div>
      )}

      {/* Refresh bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {scope === 'global' && globalData?.lastFetched && (
          <span className="text-xs text-ink3 font-mono">
            Updated {timeAgo(globalData.lastFetched)}
            {globalData.nextFetch && ` · next in ${timeUntil(globalData.nextFetch)}`}
          </span>
        )}
        {scope === 'workspace' && wsData?.lastFetched && (
          <span className="text-xs text-ink3 font-mono">
            Generated {timeAgo(wsData.lastFetched)}
            {wsData.nextFetch && ` · next in ${timeUntil(wsData.nextFetch)}`}
          </span>
        )}
        {!globalData?.lastFetched && !wsData?.lastFetched && <span />}

        <div className="flex gap-2">
          {scope === 'global' ? (
            <button
              onClick={triggerGlobalFetch}
              disabled={refreshing}
              className="btn btn-ghost text-xs py-1.5 px-3 disabled:opacity-50"
            >
              {refreshing ? 'Generating…' : '↻ Refresh Now'}
            </button>
          ) : (
            <>
              <button
                onClick={() => triggerWorkspaceGenerate(false)}
                disabled={generating}
                className="btn btn-ghost text-xs py-1.5 px-3 disabled:opacity-50"
              >
                {generating ? 'Generating…' : '↻ Generate'}
              </button>
              {wsIdeas.length > 0 && (
                <button
                  onClick={() => triggerWorkspaceGenerate(true)}
                  disabled={generating}
                  className="btn btn-ghost text-xs py-1.5 px-3 disabled:opacity-50 text-ink3"
                  title="Force regeneration even if ideas are still fresh"
                >
                  Force Refresh
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {triggerMsg && (
        <div className="border border-border rounded-xl px-4 py-2.5 text-sm text-ink2 bg-paper2/60">
          {triggerMsg}
        </div>
      )}

      {/* Niche filters */}
      <div className="flex flex-wrap gap-1.5">
        {NICHE_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setNiche(f.id)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              niche === f.id
                ? 'bg-ink text-paper border-ink'
                : 'border-border text-ink3 hover:text-ink hover:bg-paper2'
            )}
          >
            {f.id && NICHE_META[f.id] ? `${NICHE_META[f.id].icon} ${f.label}` : f.label}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="panel space-y-3 animate-pulse">
              <div className="flex gap-2 items-center">
                <div className="h-8 w-8 bg-paper3 rounded-lg" />
                <div className="h-4 w-20 bg-paper3 rounded" />
              </div>
              <div className="h-5 bg-paper3 rounded w-full" />
              <div className="h-4 bg-paper3 rounded w-3/4" />
              <div className="h-3 bg-paper3 rounded w-1/2" />
              <div className="flex gap-1 pt-2">
                <div className="h-5 w-14 bg-paper3 rounded-full" />
                <div className="h-5 w-14 bg-paper3 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Global feed ── */}
      {!loading && scope === 'global' && (
        <>
          {(!globalData?.items || globalData.items.length === 0) ? (
            <div className="panel text-center py-16 space-y-4">
              <div className="w-12 h-12 rounded-2xl border border-border bg-paper2 flex items-center justify-center text-xl mx-auto">◆</div>
              <div>
                <p className="font-semibold text-ink">No opportunities generated yet</p>
                <p className="text-sm text-ink3 mt-1">Trigger a fresh batch to populate NEXUS OS micro-SaaS insights.</p>
              </div>
              <button onClick={triggerGlobalFetch} className="btn btn-primary text-sm px-6 py-2">Generate Now</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {globalData.items.map(item => (
                <GlobalIdeaCard
                  key={item.id}
                  item={item}
                  expanded={expanded === item.id}
                  onExpand={() => setExpanded(expanded === item.id ? null : item.id)}
                  onBuildPipeline={item => {
                    const { brief, client } = buildBriefFromGlobalItem(item)
                    buildInPipeline(brief, client)
                  }}
                  onBuildForge={item => {
                    const { brief, client } = buildBriefFromGlobalItem(item)
                    buildInForge(brief, client)
                  }}
                />
              ))}
            </div>
          )}
          {globalData && globalData.items.length > 0 && (
            <div className="flex items-center justify-between text-xs text-ink3 pt-2 border-t border-border">
              <span>{globalData.items.length} opportunities · {globalData.batchCount} batch{globalData.batchCount !== 1 ? 'es' : ''} stored</span>
              <span className="font-mono">AI-generated every 6 hours · NEXUS OS</span>
            </div>
          )}
        </>
      )}

      {/* ── Workspace feed ── */}
      {!loading && scope === 'workspace' && activeWorkspace && (
        <>
          {wsIdeas.length === 0 ? (
            <div className="panel text-center py-16 space-y-4">
              <div className="w-12 h-12 rounded-2xl border border-border bg-paper2 flex items-center justify-center text-xl mx-auto">
                {activeWorkspace.emoji}
              </div>
              <div>
                <p className="font-semibold text-ink">No workspace ideas yet</p>
                <p className="text-sm text-ink3 mt-1">
                  {profileConfigured
                    ? `Generate ${activeProfile?.primaryIndustry}-specific opportunities for ${activeWorkspace.name}.`
                    : `Configure your workspace intelligence profile first, then generate ideas.`
                  }
                </p>
              </div>
              <div className="flex items-center gap-3 justify-center flex-wrap">
                {!profileConfigured && (
                  <button
                    onClick={() => router.push('/shell?page=workspaces')}
                    className="btn btn-ghost text-sm px-4 py-2"
                  >
                    Configure Profile
                  </button>
                )}
                <button
                  onClick={() => triggerWorkspaceGenerate(true)}
                  disabled={generating}
                  className="btn btn-primary text-sm px-6 py-2 disabled:opacity-50"
                >
                  {generating ? 'Generating…' : 'Generate Ideas'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {wsIdeas.map(idea => (
                <WorkspaceIdeaCard
                  key={idea.id}
                  idea={idea}
                  expanded={expanded === idea.id}
                  onExpand={() => setExpanded(expanded === idea.id ? null : idea.id)}
                  onBuildPipeline={idea => {
                    const { brief, client } = buildBriefFromWorkspaceIdea(idea)
                    buildInPipeline(brief, client, idea.id)
                  }}
                  onBuildForge={idea => {
                    const { brief, client } = buildBriefFromWorkspaceIdea(idea)
                    buildInForge(brief, client)
                  }}
                  onBookmark={handleBookmarkIdea}
                  onArchive={handleArchiveIdea}
                />
              ))}
            </div>
          )}
          {wsIdeas.length > 0 && (
            <div className="flex items-center justify-between text-xs text-ink3 pt-2 border-t border-border">
              <span>{wsIdeas.length} ideas · workspace-scoped · {activeWorkspace.name}</span>
              <span className="font-mono">
                {profileConfigured ? `${activeProfile?.primaryIndustry} · ` : ''}refreshes every {activeProfile?.refreshCadenceHours ?? 24}h
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
