'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useWorkspace } from '@/lib/workspaceContext'
import { accessForPage, planRank } from '@/lib/featureAccess'

// ─── Page registry ────────────────────────────────────────────────────────────
// ALL_PAGES drives PageId — keep every route here even if removed from sidebar

const ALL_PAGES = [
  'journey', 'client-delivery', 'overview', 'reasoning', 'forge',
  'runtime', 'dashboard', 'vault', 'agent-editor', 'audit',
  'trending', 'workspaces', 'pricing', 'deploy', 'build', 'pipeline', 'evolve',
  'higgs-ai', 'keys', 'admin', 'client-agents', 'image-prompts', 'branding-sovereign', 'prompt-architect', 'visual-compiler', 'cognitive-os', 'claude-tag-playbook', 'video-prompts',
  'community-posts', 'orbital-mission-control', 'signaldesk-pro', 'agrios-kisan', 'sales-os',
  'leads', 'proposals', 'growth', 'chasebot', 'arbflow', 'agentic-career', 'neon-drift', 'pcb-agent-os', 'freelancer-os', 'agent-os', 'client-command-center',
  'problem-solver', 'structure-os', 'daily-health-5',
] as const

export type PageId = typeof ALL_PAGES[number]

// ─── Nav group / item types ───────────────────────────────────────────────────

interface NavItemDef {
  id:          PageId
  label:       string
  icon:        string
  description: string
  flowNext?:   PageId   // shows a subtle "→ next" connector below this item
  isNew?:      boolean  // shows NEW badge (used for recently added features)
  href?:       string   // if set, renders as external <a> link (opens in new tab)
}

interface NavGroup {
  label:   string | null
  items:   NavItemDef[]
}

// ─── Nav groups ───────────────────────────────────────────────────────────────
// Overview is intentionally absent — logo click navigates there.
// Live Runtime is relabelled "Auto-Loop" to clarify it's the automated mode.
// Deploy is renamed "Export & Deploy" to reflect what it actually does.
// Agent Editor and Audit Log are gated at agency+ — shown locked below that plan.

const GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      {
        id: 'journey',
        label: 'Demo Journey',
        icon: '▶',
        description: 'Guided walkthrough — start here',
      },
      {
        id: 'client-command-center',
        label: 'Client Command',
        icon: 'CC',
        description: 'LinkedIn leads, outreach scripts and booked-call pipeline',
        isNew: true,
      },
      {
        id: 'client-delivery',
        label: 'Client Delivery',
        icon: '⚡',
        description: '6 agents → proposal, spec & analysis',
        flowNext: 'forge',
      },
    ],
  },
  {
    label: 'Build Pipeline',
    items: [
      {
        id: 'pipeline',
        label: 'One-Click Pipeline',
        icon: '▶',
        description: 'Brief → FORGE → BUILD → live URL',
        isNew: true,
      },
      {
        id: 'forge',
        label: 'FORGE Engine',
        icon: '⚙',
        description: '23 agents → deploy-ready application',
        flowNext: 'build',
      },
      {
        id: 'build',
        label: 'BUILD ENGINE',
        icon: '⚡',
        description: 'Spec → real Next.js app code',
      },
      {
        id: 'deploy',
        label: 'Export & Deploy',
        icon: '↗',
        description: 'GitHub push + live Vercel URL',
      },
      {
        id: 'evolve',
        label: 'Evolution Hub',
        icon: '↻',
        description: 'Feedback → AI changes → redeploy',
        isNew: true,
      },
    ],
  },
  {
    label: 'Research',
    items: [
      {
        id: 'problem-solver',
        label: '9 Solutions Engine',
        icon: '⚡',
        description: '60+ problems · 4-stage AI chain · one-click FORGE build',
        isNew: true,
      },
      {
        id: 'trending',
        label: 'Trending',
        icon: '↑',
        description: 'Live micro-SaaS opportunities',
      },
      {
        id: 'reasoning',
        label: 'Reasoning Engine',
        icon: '◎',
        description: '11 adversarial AI lenses',
      },
      {
        id: 'runtime',
        label: 'Auto-Loop',
        icon: '▷',
        description: 'GOVERNOR loop — runs until signal drops',
      },
      {
        id: 'vault',
        label: 'Prompt Vault',
        icon: '◈',
        description: 'Scored, versioned prompt templates',
      },
    ],
  },
  {
    label: 'Creative Lab',
    items: [
      {
        id: 'higgs-ai',
        label: 'Higgs AI',
        icon: 'HA',
        description: 'Generate images with 6 AI models',
        isNew: true,
      },
      {
        id: 'image-prompts',
        label: 'Image Prompts',
        icon: 'IP',
        description: 'AI-generated brand visual prompts',
        isNew: true,
      },
      {
        id: 'branding-sovereign',
        label: 'Branding Sovereign',
        icon: 'BR',
        description: 'Brand systems, packaging and 10X prompts',
        isNew: true,
      },
      {
        id: 'prompt-architect',
        label: 'Prompt Architect',
        icon: 'PA',
        description: 'Compile visual specs into image prompts',
        isNew: true,
      },
      {
        id: 'visual-compiler',
        label: 'Visual Compiler',
        icon: 'VC',
        description: 'NEXUS art direction prompts',
        isNew: true,
      },
      {
        id: 'video-prompts',
        label: 'Video Prompts',
        icon: 'VP',
        description: '8-sec UGC ad prompts',
        isNew: true,
      },
      {
        id: 'community-posts',
        label: 'Community Posts',
        icon: 'CP',
        description: 'Founder posts in 15 styles',
        isNew: true,
      },
      {
        id: 'claude-tag-playbook',
        label: 'Claude Tag Playbook',
        icon: '@C',
        description: 'Enterprise Slack delegation plays',
        isNew: true,
      },
      {
        id: 'cognitive-os',
        label: 'Cognitive OS',
        icon: 'CO',
        description: 'Enterprise intelligence architecture',
        isNew: true,
      },
    ],
  },
  {
    label: 'Applications',
    items: [
      {
        id: 'structure-os',
        label: 'Structure OS',
        icon: 'SO',
        description: 'Command structure, execution layers and operator dashboard',
        href: '/structure-os.html',
        isNew: true,
      },
      {
        id: 'agent-os',
        label: 'Claude Agent OS',
        icon: 'OS',
        description: '12-layer autonomous execution runtime',
        href: '/agent-os',
        isNew: true,
      },
      {
        id: 'arbflow',
        label: 'ArbFlow',
        icon: 'AF',
        description: 'Niche validator, offer builder and content engine',
        isNew: true,
      },
      {
        id: 'agentic-career',
        label: 'Agentic Career OS',
        icon: 'AI',
        description: 'FDE career agents, proof engine and war room',
        isNew: true,
      },
      {
        id: 'neon-drift',
        label: 'Neon Drift',
        icon: 'ND',
        description: '3D arcade racer with mastery and touch controls',
        isNew: true,
      },
      {
        id: 'pcb-agent-os',
        label: 'PCB Agent OS',
        icon: 'PCB',
        description: 'Manufacturing intelligence and DFM gates',
        isNew: true,
      },
      {
        id: 'freelancer-os',
        label: 'FreelancerOS',
        icon: 'FO',
        description: 'GST, CRM, milestones and KitOS agents',
        isNew: true,
      },
      {
        id: 'sales-os',
        label: 'Sales OS',
        icon: '💰',
        description: 'Governor-orchestrated multi-agent sales engine with KnowledgeOS',
        isNew: true,
      },
      {
        id: 'orbital-mission-control',
        label: 'Orbital Mission Control',
        icon: 'OM',
        description: 'N-body orbital physics lab and mission controls',
        isNew: true,
      },
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: '▣',
        description: 'Runs, tokens, QA scores & analytics',
      },
      {
        id: 'overview',           // dummy — href overrides navigation
        label: "Newton's Cradle",
        icon: '⬡',
        description: 'Live 3D physics sim — Three.js demo',
        href: '/newtons-cradle-3d.html',
        isNew: true,
      },
      {
        id: 'signaldesk-pro',
        label: 'SignalDesk Pro',
        icon: '$',
        description: 'Live crypto signal desk with paper trading, risk and backtests',
        isNew: true,
      },
      {
        id: 'agrios-kisan',
        label: 'AgriOS — Kisan Guide',
        icon: '🌾',
        description: '₹3,500 → 10/10 Farm OS — step-by-step deploy guide for Indian farmers',
        href: '/agrios-kisan-deploy.html',
        isNew: true,
      },
      {
        id: 'daily-health-5',
        label: 'Daily Health 5',
        icon: '♥',
        description: 'Two daily reminders — water, movement, sunlight, screen-free, sleep',
        href: '/daily-health-5.html',
        isNew: true,
      },
    ],
  },
  {
    label: 'Configure',
    items: [
      {
        id: 'client-agents',
        label: 'Client Agents',
        icon: '🤖',
        description: '6 AI employees — run & deliver on schedule',
        isNew: true,
      },
      {
        id: 'workspaces',
        label: 'Workspaces',
        icon: '⊟',
        description: 'Project folders & context',
      },
      {
        id: 'agent-editor',
        label: 'Agent Editor',
        icon: '✎',
        description: 'Tune AI agent prompts & versions',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        id: 'pricing',
        label: 'Pricing',
        icon: '◇',
        description: 'Plans & billing',
      },
      {
        id: 'audit',
        label: 'Audit Log',
        icon: '≡',
        description: 'Full system event trace',
      },
      {
        id: 'keys',
        label: 'API Keys',
        icon: '⚿',
        description: 'Manage your Anthropic API keys',
      },
      {
        id: 'leads',
        label: 'Lead Pipeline',
        icon: '◎',
        description: 'AI-scored leads, routing & ROI',
        isNew: true,
      },
      {
        id: 'proposals',
        label: 'Proposals',
        icon: '◉',
        description: '13-SME AI proposal pipeline — RFP to delivery',
        isNew: true,
      },
      {
        id: 'chasebot',
        label: 'ChaseBot CB',
        icon: '⚡',
        description: 'AI invoice follow-up & payment recovery',
        isNew: true,
      },
      {
        id: 'growth',
        label: 'Growth Engine',
        icon: '▲',
        description: 'Share analytics, referral stats, content engine',
        isNew: true,
      },
      {
        id: 'admin',
        label: 'Admin',
        icon: '⬡',
        description: 'Platform stats, users & scheduler',
      },
    ],
  },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface NavProps {
  currentPage:      PageId
  onNavigate:       (page: PageId) => void
  collapsed:        boolean
  onToggleCollapse: () => void
  apiConnected?:    boolean
  theme:            'light' | 'dark' | 'system'
  onThemeToggle:    () => void
}

// ─── Flow connector ───────────────────────────────────────────────────────────
// Tiny visual bridge shown below "Client Delivery" pointing to FORGE

function FlowConnector({ nextLabel, collapsed }: { nextLabel: string; collapsed: boolean }) {
  if (collapsed) return null
  return (
    <div className="flex items-center gap-1.5 pl-10 py-0.5 opacity-40">
      <div className="w-px h-3 bg-border ml-0.5" />
      <span className="text-[9px] font-mono text-ink3">then → {nextLabel}</span>
    </div>
  )
}

// ─── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({
  item, isActive, collapsed, locked, onNavigate, onLocked,
}: {
  item:       NavItemDef
  isActive:   boolean
  collapsed:  boolean
  locked:     boolean
  onNavigate: (id: PageId) => void
  onLocked:   () => void
}) {
  const isJourney  = item.id === 'journey'
  const isDelivery = item.id === 'client-delivery'

  const activeCls = isJourney  ? 'bg-acid/12 text-ink font-semibold'
                  : isDelivery ? 'bg-violet-500/10 text-ink font-semibold'
                  : 'bg-paper3 text-ink font-semibold'

  const idleCls = locked
    ? 'text-ink3/40 hover:bg-paper2/60'
    : isJourney  ? 'text-acid hover:bg-acid/8 hover:text-ink'
    : isDelivery ? 'text-violet-500 hover:bg-violet-500/8 hover:text-ink'
    : 'text-ink3 hover:bg-paper2 hover:text-ink'

  const handleClick = () => {
    if (item.href) { window.open(item.href, '_blank', 'noopener,noreferrer'); return }
    locked ? onLocked() : onNavigate(item.id)
  }

  if (collapsed) {
    return (
      <button
        onClick={handleClick}
        title={locked ? `${item.label} — upgrade required` : `${item.label}${item.description ? ` — ${item.description}` : ''}`}
        aria-label={locked ? `${item.label} — upgrade required` : item.label}
        aria-current={isActive && !locked ? 'page' : undefined}
        className={`relative w-full flex items-center justify-center py-2 rounded-lg transition-[background,color] duration-fast ease-out group ${isActive && !locked ? activeCls : idleCls}`}
      >
        <span className={`text-sm leading-none ${locked ? 'opacity-30' : ''}`}>
          {locked ? '🔒' : item.icon}
        </span>
        {isActive && !locked && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-current opacity-60" />
        )}
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      aria-current={isActive && !locked ? 'page' : undefined}
      aria-label={locked ? `${item.label} — upgrade required` : item.label}
      className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-[background,color] duration-fast ease-out group ${isActive && !locked ? activeCls : idleCls}`}
    >
      {isActive && !locked && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-current opacity-50" />
      )}
      <span className={`text-sm leading-none flex-shrink-0 w-4 text-center ${locked ? 'opacity-30' : ''}`}>
        {item.icon}
      </span>
      <span className={`text-[13px] truncate flex-1 ${locked ? 'opacity-40' : ''}`}>
        {item.label}
      </span>
      {locked && (
        <span className="text-[8px] font-bold font-mono text-ink3/50 border border-border/40 rounded px-1 flex-shrink-0">
          LOCK
        </span>
      )}
      {item.href && !locked && !item.isNew && (
        <span className="text-[9px] text-ink3/60 flex-shrink-0">↗</span>
      )}
      {item.isNew && !locked && (
        <span className="text-[8px] font-bold font-mono text-acid bg-acid/10 border border-acid/30 rounded px-1 flex-shrink-0">
          {item.href ? '↗' : 'NEW'}
        </span>
      )}
    </button>
  )
}

// ─── Workflow guide tooltip ───────────────────────────────────────────────────
// Shown in collapsed sidebar when hovering a section — explains the sequence

function WorkflowBadge({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <div className="absolute left-full ml-2 top-0 z-50 bg-paper border border-border rounded-lg shadow-xl px-3 py-2 whitespace-nowrap pointer-events-none">
      <p className="text-[9px] font-mono text-ink3 uppercase tracking-widest mb-0.5">
        Step {step} of {total}
      </p>
      <p className="text-xs font-semibold text-ink">{label}</p>
    </div>
  )
}

// Suppress unused warning — WorkflowBadge kept for future use
void WorkflowBadge

// ─── Main sidebar ─────────────────────────────────────────────────────────────

export default function Nav({
  currentPage, onNavigate, collapsed, onToggleCollapse,
  apiConnected = false, theme, onThemeToggle,
}: NavProps) {
  const [wsOpen,       setWsOpen]       = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [subDays,      setSubDays]      = useState<number | null>(null)
  const [quota,        setQuota]        = useState<{ used: number; limit: number } | null>(null)
  const { data: session, status }       = useSession()
  const { workspaces, active, setActive } = useWorkspace()

  const user    = session?.user as { name?: string; email?: string; image?: string; plan?: string; isAdmin?: boolean } | undefined
  const plan    = user?.plan ?? 'free'
  const isAdmin = user?.isAdmin ?? false
  const rank    = isAdmin ? 99 : planRank(plan)  // admin always passes all gates

  useEffect(() => {
    if (!userMenuOpen || !session || plan === 'free') return
    fetch('/api/subscription')
      .then(r => r.json())
      .then(d => { if (d.ok) setSubDays(d.data.activeSub?.daysRemaining ?? null) })
      .catch(() => null)
  }, [userMenuOpen, session, plan])

  // Quota bar — fetch run usage for free users
  useEffect(() => {
    if (!session || plan !== 'free') return
    fetch('/api/quota')
      .then(r => r.json())
      .then((d: { ok?: boolean; data?: { count?: number; limit?: number; runLimit?: number } }) => {
        if (d.ok && d.data) setQuota({
          used:  d.data.count    ?? 0,
          limit: d.data.runLimit ?? d.data.limit ?? 3,
        })
      })
      .catch(() => null)
  }, [session, plan])

  const handleNav = useCallback((id: PageId) => {
    onNavigate(id)
    setWsOpen(false)
    setUserMenuOpen(false)
  }, [onNavigate])

  const handleLocked = useCallback(() => {
    onNavigate('pricing')
    setWsOpen(false)
    setUserMenuOpen(false)
  }, [onNavigate])

  const userName    = user?.name ?? user?.email?.split('@')[0] ?? 'User'
  const userInitial = userName[0].toUpperCase()

  // Label lookup for flow connector
  const labelById = Object.fromEntries(
    GROUPS.flatMap(g => g.items).map(i => [i.id, i.label])
  )

  return (
    <aside
      className={`
        flex flex-col h-screen sticky top-0 flex-shrink-0
        border-r border-border bg-paper
        transition-[width] duration-normal ease-out
        ${collapsed ? 'w-[52px]' : 'w-[220px]'}
      `}
    >
      {/* ── Logo row ────────────────────────────────────────────────────────── */}
      <div className={`flex items-center border-b border-border flex-shrink-0 ${collapsed ? 'justify-center px-0 h-[52px]' : 'justify-between px-4 h-[52px]'}`}>
        {!collapsed && (
          <button
            onClick={() => handleNav('overview')}
            className="text-sm font-black tracking-wider text-ink"
            style={{ fontFamily: 'var(--ff-d)' }}
          >
            NEXUS <span style={{ color: 'var(--acid)' }}>OS</span>
          </button>
        )}
        <button
          onClick={onToggleCollapse}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-ink3 hover:text-ink hover:bg-paper2 transition-colors text-[11px] flex-shrink-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* ── Workspace picker ─────────────────────────────────────────────────── */}
      <div className={`border-b border-border flex-shrink-0 ${collapsed ? 'px-2 py-2' : 'px-3 py-2'}`}>
        {collapsed ? (
          <button
            onClick={() => handleNav('workspaces')}
            title={active?.name ?? 'Workspaces'}
            className="w-full flex items-center justify-center py-1.5 rounded-lg hover:bg-paper2 transition-colors"
          >
            <span className="text-base leading-none">{active?.emoji ?? '📁'}</span>
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={() => setWsOpen(o => !o)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border hover:bg-paper2 transition-colors text-left"
            >
              <span className="text-sm flex-shrink-0">{active?.emoji ?? '📁'}</span>
              <span className="text-[12px] text-ink3 truncate flex-1">
                {active?.name ?? 'No workspace'}
              </span>
              <span className="text-[9px] text-ink3 flex-shrink-0">▾</span>
            </button>

            {wsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setWsOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-full bg-paper border border-border rounded-xl shadow-xl overflow-hidden">
                  <p className="px-3 py-2 text-[9px] font-bold font-mono text-ink3 uppercase tracking-widest border-b border-border">
                    Switch workspace
                  </p>
                  <div className="max-h-48 overflow-y-auto">
                    {workspaces.length === 0 ? (
                      <p className="px-3 py-2.5 text-xs text-ink3">No workspaces yet</p>
                    ) : workspaces.map(w => (
                      <button
                        key={w.id}
                        onClick={() => { setActive(w); setWsOpen(false) }}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 text-xs hover:bg-paper2 transition-colors ${active?.id === w.id ? 'text-ink font-semibold' : 'text-ink3'}`}
                      >
                        <span>{w.emoji}</span>
                        <span className="truncate flex-1">{w.name}</span>
                        {active?.id === w.id && <span className="text-[10px] text-ink3">✓</span>}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-border">
                    <button
                      onClick={() => { setWsOpen(false); handleNav('workspaces') }}
                      className="w-full text-left px-3 py-2 text-[11px] text-ink3 hover:bg-paper2 transition-colors"
                    >
                      + Manage workspaces
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Navigation groups ────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-4 min-h-0" aria-label="Main navigation">

        {/* ── Free plan workflow hint (collapsed = icon, expanded = banner) ── */}
        {plan === 'free' && !isAdmin && !collapsed && (
          <div className="mx-1 px-3 py-2.5 rounded-xl border border-acid/20 bg-acid/5 space-y-1">
            <p className="text-[9px] font-black font-mono text-acid uppercase tracking-widest">
              Start here
            </p>
            <p className="text-[10px] text-ink3 leading-relaxed">
              Run Demo Journey → Client Delivery → FORGE
            </p>
          </div>
        )}

        {/* ── Free plan quota progress bar ── */}
        {plan === 'free' && !isAdmin && !collapsed && quota && (
          <div className="mx-1 px-3 py-2.5 rounded-xl border border-border bg-paper2 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-ink3">
                <span className="font-semibold text-ink">{quota.used}</span> / {quota.limit} pipeline runs
              </p>
              <button
                onClick={() => handleNav('pricing')}
                className="text-[9px] font-bold text-acid hover:underline"
              >
                Upgrade →
              </button>
            </div>
            <div style={{ background: 'var(--ink2)', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
              <div style={{
                background:   'var(--acid)',
                borderRadius: '4px',
                height:       '100%',
                width:        `${Math.min(100, (quota.used / quota.limit) * 100)}%`,
                transition:   'width var(--dur-slow) var(--ease-out)',
              }} />
            </div>
            {quota.used >= quota.limit && (
              <p className="text-[9px] text-red-400 font-mono">Limit reached — upgrade to keep shipping</p>
            )}
          </div>
        )}

        {GROUPS.map((group, gi) => (
          <div key={gi} className="space-y-0.5">
            {/* Group label */}
            {group.label && !collapsed && (
              <p className="px-3 pb-1 text-[9px] font-bold font-mono text-ink3/60 uppercase tracking-widest">
                {group.label}
              </p>
            )}
            {group.label && collapsed && gi > 0 && (
              <div className="h-px bg-border mx-1 my-2" />
            )}

            {group.items.map(item => {
              const access = accessForPage(item.id)
              if (access === 'admin' && !isAdmin) return null
              const locked = access !== 'admin' && rank < planRank(access)
              return (
                <div key={item.id}>
                  <NavItem
                    item={item}
                    isActive={currentPage === item.id}
                    collapsed={collapsed}
                    locked={locked}
                    onNavigate={handleNav}
                    onLocked={handleLocked}
                  />
                  {/* Flow connector: Client Delivery → FORGE */}
                  {item.flowNext && !collapsed && (
                    <FlowConnector
                      nextLabel={labelById[item.flowNext] ?? item.flowNext}
                      collapsed={collapsed}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {/* ── Upgrade nudge for locked features ─────────────────────────────── */}
        {rank < planRank('agency') && !isAdmin && !collapsed && (
          <div className="mx-1 mt-2">
            <button
              onClick={() => handleNav('pricing')}
              className="w-full text-left px-3 py-2.5 rounded-xl border border-border/60 hover:border-border hover:bg-paper2 transition-[background,border-color] duration-fast ease-out group"
            >
              <p className="text-[9px] font-bold font-mono text-ink3/60 uppercase tracking-widest mb-0.5 group-hover:text-ink3">
                Unlock Agency+
              </p>
              <p className="text-[10px] text-ink3/50 group-hover:text-ink3">
                Agent Editor · Audit Log · Unlimited runs
              </p>
            </button>
          </div>
        )}
      </nav>

      {/* ── Bottom controls ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-border">

        {/* API + Theme row */}
        <div className={`flex items-center gap-1 px-2 py-2 border-b border-border ${collapsed ? 'justify-center flex-col gap-1' : 'justify-between'}`}>
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-mono font-bold transition-colors ${
              apiConnected
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-amber-300 bg-amber-50 text-amber-700'
            } ${collapsed ? 'text-center' : ''}`}
            title={apiConnected
              ? 'AI provider connected - pipeline ready'
              : 'No AI provider key detected - configure Anthropic, Gemini, or Groq'}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              apiConnected ? 'bg-green sd-ok' : 'bg-amber sd-warn'
            }`} />
            {!collapsed && <span>API {apiConnected ? 'KEY SET' : 'OFF'}</span>}
          </div>

          <button
            onClick={onThemeToggle}
            title={`Theme: ${theme}`}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-ink3 hover:text-ink hover:bg-paper2 transition-colors text-sm"
          >
            {theme === 'dark' ? '☀' : theme === 'light' ? '◐' : '⬡'}
          </button>
        </div>

        {/* User profile */}
        <div className="relative px-2 py-2">
          {status === 'loading' ? (
            <div className={`h-9 rounded-lg bg-paper2 animate-blink ${collapsed ? 'w-9 mx-auto' : 'w-full'}`} />
          ) : session ? (
            <>
              <button
                onClick={() => setUserMenuOpen(o => !o)}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-paper2 transition-colors ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? `${userName} · ${plan} plan` : undefined}
              >
                <div className="w-6 h-6 rounded-full bg-paper3 border border-border flex items-center justify-center text-[11px] font-bold text-ink2 flex-shrink-0 overflow-hidden">
                  {user?.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={user.image} alt="" className="w-full h-full object-cover" />
                    : userInitial
                  }
                </div>
                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[12px] font-semibold text-ink truncate">{userName}</p>
                        {isAdmin && (
                          <span className="text-[8px] font-black font-mono bg-ink text-paper px-1.5 py-0.5 rounded flex-shrink-0">
                            ADMIN
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] font-mono text-ink3 uppercase tracking-wide">
                        {isAdmin ? 'Owner · All access' : `${plan} plan`}
                      </p>
                    </div>
                    <span className="text-[9px] text-ink3">▾</span>
                  </>
                )}
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className={`absolute z-50 bottom-full mb-1 bg-paper border border-border rounded-xl shadow-xl overflow-hidden w-52 ${collapsed ? 'left-full ml-2' : 'left-0 right-0'}`}>
                    {/* User info */}
                    <div className="px-3 py-2.5 border-b border-border">
                      <p className="text-xs font-semibold text-ink truncate">{user?.name ?? 'User'}</p>
                      <p className="text-[10px] text-ink3 truncate mt-0.5">{user?.email}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] font-mono uppercase tracking-wider text-ink3 border border-border rounded px-1.5 py-0.5">
                          {plan}
                        </span>
                        {subDays !== null && (
                          <span className="text-[10px] text-ink3">{subDays}d remaining</span>
                        )}
                      </div>
                    </div>

                    {/* Plan action */}
                    {isAdmin ? (
                      <div className="px-3 py-2 flex items-center gap-2">
                        <span className="text-[8px] font-black font-mono bg-ink text-paper px-1.5 py-0.5 rounded">ADMIN</span>
                        <span className="text-[10px] text-ink3">Full platform access</span>
                      </div>
                    ) : plan === 'free' || plan === 'starter' ? (
                      <button
                        onClick={() => { setUserMenuOpen(false); handleNav('pricing') }}
                        className="w-full text-left px-3 py-2 text-xs text-ink2 hover:bg-paper2 transition-colors"
                      >
                        Upgrade plan →
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          if (!confirm('Cancel your subscription? Plan downgrades to free immediately.')) return
                          const r = await fetch('/api/subscription', { method: 'DELETE' })
                          const d = await r.json()
                          if (d.ok) { setUserMenuOpen(false); window.location.reload() }
                          else alert(d.error ?? 'Failed to cancel')
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-ink3 hover:bg-paper2 transition-colors"
                      >
                        Cancel subscription
                      </button>
                    )}

                    {/* Workflow guide — visible in menu */}
                    <div className="px-3 py-2 border-t border-border space-y-1">
                      <p className="text-[9px] font-bold font-mono text-ink3/60 uppercase tracking-widest">
                        Recommended flow
                      </p>
                      {[
                        { step: '1', label: 'Demo Journey', id: 'journey' },
                        { step: '2', label: 'Client Delivery', id: 'client-delivery' },
                        { step: '3', label: 'FORGE Engine', id: 'forge' },
                        { step: '4', label: 'BUILD ENGINE', id: 'build' },
                        { step: '5', label: 'Export & Deploy', id: 'deploy' },
                      ].map(({ step, label, id }) => (
                        <button
                          key={id}
                          onClick={() => { setUserMenuOpen(false); handleNav(id as PageId) }}
                          className="w-full text-left flex items-center gap-2 py-0.5 group"
                        >
                          <span className="w-4 h-4 rounded border border-border bg-paper2 flex items-center justify-center text-[8px] font-black font-mono text-ink3 flex-shrink-0 group-hover:bg-paper3">
                            {step}
                          </span>
                          <span className="text-[10px] text-ink3 group-hover:text-ink transition-colors">{label}</span>
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => signOut({ callbackUrl: '/shell' })}
                      className="w-full text-left px-3 py-2 text-xs text-ink3 hover:bg-paper2 transition-colors border-t border-border"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <button
              onClick={() => signIn(undefined, { callbackUrl: '/shell' })}
              className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg border border-border text-xs text-ink3 hover:text-ink hover:bg-paper2 transition-colors"
            >
              {!collapsed && 'Sign in'}
              {collapsed && '→'}
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
