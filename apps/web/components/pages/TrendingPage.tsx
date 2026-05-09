'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'

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
}

interface TrendingData {
  items:       TrendingItem[]
  lastFetched: string | null
  nextFetch:   string | null
  batchCount:  number
}

// Niche metadata
const NICHE_META: Record<string, { label: string; icon: string; desc: string }> = {
  productivity:  { label: 'Productivity',    icon: '⚡', desc: 'Workflow & time tools' },
  finance:       { label: 'Finance',         icon: '◈',  desc: 'Billing, accounting, money' },
  creator:       { label: 'Creator',         icon: '✦',  desc: 'Content & audience tools' },
  b2b:           { label: 'B2B SaaS',        icon: '▣',  desc: 'Business software' },
  health:        { label: 'Health',          icon: '○',  desc: 'Wellness & fitness' },
  education:     { label: 'Education',       icon: '◎',  desc: 'Learning & coaching' },
  'ai-tools':    { label: 'AI Tools',        icon: '◆',  desc: 'AI-powered utilities' },
  ecommerce:     { label: 'E-commerce',      icon: '▲',  desc: 'Store & selling tools' },
}

const COMPLEXITY_META: Record<string, { label: string; badge: string }> = {
  low:    { label: 'Quick build',  badge: 'border-border text-ink3' },
  medium: { label: 'Mid effort',   badge: 'border-border text-ink2' },
  high:   { label: 'Complex',      badge: 'border-border text-ink3' },
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

// Extract targetMarket and buildComplexity from tags (stored during generation)
function parseItemTags(tags: string[]) {
  const buildTag   = tags.find(t => t.startsWith('build:'))
  const complexity = buildTag ? buildTag.replace('build:', '') : 'medium'
  const cleanTags  = tags.filter(t => !t.startsWith('build:') && !t.startsWith('regime:') && !t.startsWith('E:') && !t.startsWith('X:'))
  // Last clean tag after the main tags is targetMarket
  const topicTags  = cleanTags.slice(0, -1)
  const market     = cleanTags.at(-1) ?? ''
  return { complexity, topicTags, market }
}

// Parse the useCase field back into trendReason and revenueModel
function parseUseCase(useCase: string) {
  const pivot = useCase.indexOf('· Revenue:')
  if (pivot === -1) return { trend: useCase, revenue: '' }
  return {
    trend:   useCase.slice(0, pivot).trim(),
    revenue: useCase.slice(pivot + 10).trim(),
  }
}

function buildForgePrompt(item: TrendingItem): string {
  const { trend, revenue } = parseUseCase(item.useCase)
  const { market }         = parseItemTags(item.tags)
  const niche = NICHE_META[item.category]?.label ?? item.category

  return `Build a micro-SaaS product: ${item.title}

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

DELIVERABLES
Build this as a complete, production-ready SaaS product. Include:
- User authentication and role-based access
- Core feature set that directly solves the problem above
- Clean, modern dashboard UI tailored for ${market || 'the target market'}
- Full REST API with documented endpoints
- Database schema with migrations
- Billing integration supporting the ${revenue || 'subscription'} model
- Onboarding flow for new users`.trim()
}

export default function TrendingPage() {
  const router = useRouter()
  const [data,       setData]       = useState<TrendingData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [niche,      setNiche]      = useState('')
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [triggerMsg, setTriggerMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (niche) params.set('category', niche)
      const r = await fetch(`/api/trending?${params}`)
      const d = await r.json()
      if (d.ok) setData(d.data)
    } finally {
      setLoading(false)
    }
  }, [niche])

  useEffect(() => { load() }, [load])

  const triggerFetch = async () => {
    setRefreshing(true)
    setTriggerMsg('')
    try {
      const r = await fetch(`/api/trending`, { method: 'POST' })
      const d = await r.json()
      if (d.ok) {
        setTriggerMsg(`Generated ${d.data.count} opportunities (batch ${d.data.batchId})`)
        await load()
      } else {
        setTriggerMsg(d.error ?? 'Failed')
      }
    } finally {
      setRefreshing(false)
    }
  }

  const buildInForge = useCallback((item: TrendingItem) => {
    sessionStorage.setItem('nexus-prefill-forge-input',  buildForgePrompt(item))
    sessionStorage.setItem('nexus-prefill-forge-client', item.title)
    router.push('/shell?page=forge')
  }, [router])

  const buildInPipeline = useCallback((item: TrendingItem) => {
    // Write to both sessionStorage and localStorage so page-refresh preserves the brief
    const brief  = buildForgePrompt(item)
    const client = item.title
    sessionStorage.setItem('nexus-prefill-pipeline-brief',  brief)
    sessionStorage.setItem('nexus-prefill-pipeline-client', client)
    try {
      localStorage.setItem('nexus-prefill-pipeline-brief',  brief)
      localStorage.setItem('nexus-prefill-pipeline-client', client)
    } catch { /* storage full — sessionStorage is enough */ }
    router.push('/shell?page=pipeline')
  }, [router])

  const empty = !loading && (!data?.items || data.items.length === 0)

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-black font-mono tracking-widest text-ink3 uppercase mb-1">
            NEXUS OS · AI-Generated · Updated every 5 hours
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Trending Micro-SaaS
          </h1>
          <p className="text-sm text-ink3 mt-1">
            Viral niche opportunities — analysed, scored, and ready to build in FORGE
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {data?.lastFetched && (
            <span className="text-xs text-ink3 font-mono">
              Updated {timeAgo(data.lastFetched)}
              {data.nextFetch && ` · next in ${timeUntil(data.nextFetch)}`}
            </span>
          )}
          <button
            onClick={triggerFetch}
            disabled={refreshing}
            className="btn btn-ghost text-xs py-1.5 px-3 disabled:opacity-50"
          >
            {refreshing ? 'Generating…' : '↻ Refresh Now'}
          </button>
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

      {/* Empty state */}
      {empty && (
        <div className="panel text-center py-16 space-y-4">
          <div className="w-12 h-12 rounded-2xl border border-border bg-paper2 flex items-center justify-center text-xl mx-auto">◆</div>
          <div>
            <p className="font-semibold text-ink">No opportunities generated yet</p>
            <p className="text-sm text-ink3 mt-1">
              Trigger a fresh batch to populate NEXUS OS micro-SaaS insights.
            </p>
          </div>
          <button onClick={triggerFetch} className="btn btn-primary text-sm px-6 py-2">
            Generate Now
          </button>
        </div>
      )}

      {/* Grid */}
      {!loading && data && data.items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.items.map(item => {
            const nischeMeta = NICHE_META[item.category] ?? { label: item.category, icon: '▣', desc: '' }
            const { complexity, topicTags, market } = parseItemTags(item.tags)
            const complexityMeta = COMPLEXITY_META[complexity] ?? COMPLEXITY_META.medium
            const { trend, revenue } = parseUseCase(item.useCase)
            const isOpen   = expanded === item.id
            const score    = item.hnScore

            return (
              <div
                key={item.id}
                className={clsx(
                  'panel flex flex-col gap-3 transition-all cursor-pointer',
                  isOpen ? 'border-ink/20' : 'hover:border-ink/15'
                )}
                onClick={() => setExpanded(isOpen ? null : item.id)}
              >
                {/* Top row: niche badge + score */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold font-mono text-ink2 border border-border rounded-lg px-2 py-1">
                    <span>{nischeMeta.icon}</span>
                    <span className="uppercase tracking-wider">{nischeMeta.label}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      'text-[9px] font-bold font-mono px-2 py-0.5 rounded border',
                      complexityMeta.badge
                    )}>
                      {complexityMeta.label.toUpperCase()}
                    </span>
                    <div className="text-right">
                      <p className="text-sm font-black tabular-nums text-ink leading-none">{score}</p>
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

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-border pt-3 space-y-3">
                    {trend && (
                      <div>
                        <p className="text-[9px] font-black font-mono uppercase tracking-widest text-ink3 mb-1">Why it's trending</p>
                        <p className="text-xs text-ink2 leading-relaxed">{trend}</p>
                      </div>
                    )}
                    {revenue && (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-ink3 uppercase tracking-widest">Revenue model</span>
                        <span className="text-xs font-semibold text-ink border border-border rounded px-2 py-0.5">{revenue}</span>
                      </div>
                    )}
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
                    onClick={e => { e.stopPropagation(); buildInPipeline(item) }}
                    className="flex-1 text-[10px] py-1.5 px-2 rounded-lg bg-ink text-paper font-black text-center transition-all hover:bg-ink/80 flex items-center justify-center gap-1"
                    title="Brief → FORGE → BUILD → Live URL in one click"
                  >
                    ▶ One-Click
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); buildInForge(item) }}
                    className="btn btn-ghost text-[10px] py-1 px-2 font-semibold"
                    title="Build spec only in FORGE Engine"
                  >
                    FORGE
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setExpanded(isOpen ? null : item.id) }}
                    className="text-[10px] text-ink3 hover:text-ink transition-colors px-1.5 font-medium flex-shrink-0"
                  >
                    {isOpen ? '▲' : '▼'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      {data && data.items.length > 0 && (
        <div className="flex items-center justify-between text-xs text-ink3 pt-2 border-t border-border">
          <span>{data.items.length} opportunities · {data.batchCount} batch{data.batchCount !== 1 ? 'es' : ''} stored</span>
          <span className="font-mono">AI-generated every 5 hours · Powered by NEXUS OS</span>
        </div>
      )}
    </div>
  )
}
