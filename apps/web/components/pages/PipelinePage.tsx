'use client'

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { useSession } from 'next-auth/react'
import { AGENTS, agentFileMap } from '@/lib/agentData'
import { BUILD_AGENTS, BUILD_AGENT_SYSTEMS, parseAgentFiles } from '@/lib/buildAgentData'
import { FORGE_AGENTS, FORGE_AGENT_SYSTEMS, extractQAScore, detectVertical, VERTICAL_CONTEXTS } from '@/lib/forgeAgentData'
import { VoiceTextarea } from '@/components/VoiceButton'
import { speak, stopSpeaking, useVoice, waitForSpeech, _activeVoiceName } from '@/lib/voice'

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'done' | 'error'

interface PipelineStep {
  id:     string
  label:  string
  detail: string
  status: StepStatus
  error?: string
}

interface ForgeBuild {
  projectName: string
  brief:       string
  score:       number | null
  files:       Record<string, string>
  builtAt:     string
}

interface DeployResult {
  specRepoUrl:    string
  appRepoUrl:     string
  proposalUrl:    string
  vercelImport:   string
  deploymentId?:  string
  deployReady:    boolean
}

// G3: plan run limits (mirrors server-side quota.ts — used for UI only)
const PLAN_RUN_LIMITS: Record<string, number> = {
  free:       3,
  starter:    20,
  agency:     Infinity,
  enterprise: Infinity,
}

// G6: estimated pipeline duration by key type
const PLAN_ETA: Record<string, string> = {
  free:       '8–14 min',
  starter:    '8–14 min',
  agency:     '4–8 min',
  enterprise: '4–8 min',
}

// G4: brief validation
const BRIEF_MIN = 40
const BRIEF_MAX = 4000

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'nexus-app'
}

// Strip ASCII control characters (except \t \n \r) from user-provided strings before
// they enter LLM system prompts — prevents prompt injection via malicious brief content.
function sanitiseBrief(s: string): string {
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim()
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDot({ status, n }: { status: StepStatus; n: number }) {
  const base = 'w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-black font-mono flex-shrink-0 transition-all duration-300'
  if (status === 'done')
    return <div className={`${base} border-green-500 bg-green-500 text-white shadow-[0_0_12px_2px_rgba(34,197,94,0.3)]`}>✓</div>
  if (status === 'running')
    return <div className={`${base} border-[#c8f23c] bg-[#c8f23c]/20 text-ink shadow-[0_0_18px_4px_rgba(200,242,60,0.40)] animate-[pulse_1s_ease-in-out_infinite]`}>{n}</div>
  if (status === 'error')
    return <div className={`${base} border-red-400 bg-red-50 text-red-500`}>✗</div>
  return <div className={`${base} border-border/40 bg-paper2 text-ink3/50`}>{n}</div>
}

function StepRow({
  step, n, isLast, onRetry,
}: {
  step: PipelineStep
  n: number
  isLast: boolean
  onRetry?: () => void
}) {
  const isActive = step.status === 'running'
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <StepDot status={step.status} n={n} />
        {!isLast && (
          <div className={`w-0.5 flex-1 min-h-[40px] mt-1 rounded-full transition-all duration-700 ${
            step.status === 'done' ? 'bg-green-400' : 'bg-border/40'
          }`} />
        )}
      </div>
      <div className="pb-8 flex-1 min-w-0 pt-1">
        <div className="flex items-center gap-2.5 mb-1">
          <span className={`text-sm font-black tracking-wide transition-colors ${
            isActive ? 'text-[#c8f23c]' :
            step.status === 'done' ? 'text-ink' :
            step.status === 'error' ? 'text-red-500' : 'text-ink3/60'
          }`}>{step.label}</span>
          {isActive && (
            <span className="inline-flex items-center gap-1 text-[9px] font-black font-mono text-[#c8f23c] bg-[#c8f23c]/10 border border-[#c8f23c]/30 rounded px-1.5 py-0.5 animate-pulse uppercase tracking-widest">
              <span className="w-1 h-1 rounded-full bg-[#c8f23c] inline-block" />
              RUNNING
            </span>
          )}
          {step.status === 'done' && (
            <span className="text-[9px] font-bold font-mono text-green-600 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 uppercase tracking-widest">✓ DONE</span>
          )}
        </div>
        <p className="text-xs text-ink3 leading-relaxed">{step.detail}</p>
        {step.error && (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] font-mono text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 leading-relaxed">{step.error}</p>
            {step.error.toLowerCase().includes('rate-limit') && (
              <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                Fix: add your own Anthropic key in <button onClick={() => window.location.href='/shell?page=runtime'} className="underline font-semibold">Runtime page</button>, or click Retry to wait &amp; retry with server keys.
              </p>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-[10px] font-mono font-bold px-3 py-1.5 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 transition-colors"
              >
                ↺ Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Brief templates ─────────────────────────────────────────────────────────

const BRIEF_TEMPLATES = [
  {
    label: 'B2B SaaS Dashboard',
    icon: '◈',
    brief: 'Build a B2B analytics dashboard for marketing teams (10–200 employees). Core features: campaign performance tracking (impressions, clicks, CPC, ROAS), multi-channel attribution (Google/Meta/LinkedIn), automated weekly reports, and team workspace with role-based access (admin/analyst/viewer). Revenue: per-seat at $49/month. Target persona: Head of Growth at a scale-up spending $10K–$100K/month on ads. Key differentiator: AI-generated campaign insights and anomaly detection alerts.',
    client: 'AdPulse Analytics',
  },
  {
    label: 'Services Marketplace',
    icon: '◎',
    brief: 'Build a two-sided marketplace connecting freelance designers with startups. Buyer flow: post project brief, receive proposals from vetted designers, hire and pay via escrow. Seller flow: create portfolio profile, browse open briefs, submit proposals with timeline and price. Revenue: 12% commission on completed projects. Trust signals: verified portfolio, completion rate, 5-star rating. Target: early-stage founders needing design work ($500–$5,000 per project).',
    client: 'DesignMatch',
  },
  {
    label: 'AI Proposal Tool',
    icon: '⚡',
    brief: 'Build an AI-powered proposal generation tool for agency owners and consultants. Input: paste client brief + select tone and length. Output: structured proposal with executive summary, scope, timeline, pricing tiers, and terms. Core features: template library by industry, brand voice settings, one-click PDF export, proposal tracking (opened/viewed/signed). Revenue: $29/month for 50 proposals, $99/month unlimited. Target: solo consultants and small agencies closing $5K–$50K deals.',
    client: 'ProposalAI',
  },
  {
    label: 'E-Commerce Store',
    icon: '◆',
    brief: 'Build a premium skincare e-commerce store targeting women aged 28–45. Product catalog: 20 SKUs across cleanser, serum, moisturizer, SPF categories. Features: filtering by skin type and concern, product bundles with 15% discount, subscription option (save 20%), loyalty points, before/after gallery, ingredient transparency page. Revenue target: $50K MRR via DTC. AOV target: $120. Differentiator: AI skin-type quiz that recommends a personalized routine from your catalog.',
    client: 'GlowLab',
  },
  {
    label: 'Paid Community',
    icon: '◉',
    brief: 'Build a paid community platform for indie hackers and bootstrapped founders. Features: threaded discussions with voting, weekly build showcases, resource library (templates, tools), member directory filterable by stage and revenue, event calendar, direct messaging. Revenue: $29/month or $249/year. Target: solo founders making $0–$10K MRR who want accountability and peer learning. Differentiator: revenue-verified member badges and public milestone tracking.',
    client: 'BuilderCircle',
  },
  {
    label: 'Agency Client Portal',
    icon: '▣',
    brief: 'Build a white-label client portal for digital agencies. Clients see: project status board (Kanban), weekly progress reports auto-generated by AI, invoice history and payment status, file delivery hub with approve/reject, and direct message thread with account manager. Agency admin view: client list, billing status, project health across all accounts, team assignment. Revenue: $199/month per agency seat. Target: agencies managing 5–50 active clients.',
    client: 'AgencyOS Portal',
  },
]

function BriefTemplatesModal({ onSelect, onClose }: {
  onSelect: (brief: string, client: string) => void
  onClose:  () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-paper border border-border rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-5 animate-fadein max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Quick Start</p>
            <h2 className="text-lg font-black text-ink mt-0.5">Choose a brief template</h2>
          </div>
          <button onClick={onClose} className="text-ink3 hover:text-ink text-xl leading-none transition-colors">✕</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BRIEF_TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => { onSelect(t.brief, t.client); onClose() }}
              className="text-left p-4 rounded-xl border border-border bg-paper2 hover:border-[#c8f23c]/60 hover:bg-[#c8f23c]/5 transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{t.icon}</span>
                <span className="text-xs font-black text-ink group-hover:text-[#5a6e00] transition-colors">{t.label}</span>
              </div>
              <p className="text-[11px] text-ink3 leading-relaxed line-clamp-3">{t.brief.slice(0, 140)}…</p>
              <p className="text-[10px] font-mono text-ink3/60 mt-2">Client: {t.client}</p>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-ink3 text-center">Templates are starting points — edit the brief to match your client's specific needs</p>
      </div>
    </div>
  )
}

// ─── Generated files viewer ───────────────────────────────────────────────────

function FilesViewerModal({ files, onClose }: {
  files:   Record<string, string>
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [search,   setSearch]   = useState('')

  const entries = Object.entries(files)
  const filtered = search
    ? entries.filter(([p]) => p.toLowerCase().includes(search.toLowerCase()))
    : entries

  // Group by directory
  const groups: Record<string, string[]> = {}
  for (const [path] of filtered) {
    const parts = path.split('/')
    const dir   = parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)'
    if (!groups[dir]) groups[dir] = []
    groups[dir].push(path)
  }

  const selectedContent = selected ? (files[selected] ?? '') : ''
  const ext = selected?.split('.').pop() ?? ''
  const isCode = ['ts', 'tsx', 'js', 'jsx', 'css', 'json', 'sql', 'md', 'sh'].includes(ext)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-paper border border-border rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-fadein">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <p className="text-sm font-black text-ink">Generated Files</p>
            <span className="text-[10px] font-mono font-bold text-ink3 bg-paper2 border border-border rounded px-2 py-0.5">{entries.length} files</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter files…"
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-paper2 outline-none focus:border-[#c8f23c] w-44 transition-all"
            />
            <button onClick={onClose} className="text-ink3 hover:text-ink text-xl leading-none transition-colors">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* File tree */}
          <div className="w-56 flex-shrink-0 border-r border-border overflow-y-auto py-2 scrollbar-thin">
            {Object.entries(groups).map(([dir, paths]) => (
              <div key={dir}>
                <p className="px-3 py-1 text-[9px] font-black font-mono tracking-widest text-ink3 uppercase sticky top-0 bg-paper">{dir}</p>
                {paths.map(p => (
                  <button
                    key={p}
                    onClick={() => setSelected(p)}
                    className={`w-full text-left px-3 py-1.5 text-[11px] font-mono truncate transition-colors ${
                      selected === p
                        ? 'bg-[#c8f23c]/15 text-ink font-bold'
                        : 'text-ink3 hover:bg-paper2 hover:text-ink'
                    }`}
                  >
                    {p.split('/').pop()}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Content pane */}
          <div className="flex-1 min-w-0 flex flex-col">
            {selected ? (
              <>
                <div className="px-4 py-2 border-b border-border bg-paper2 flex-shrink-0 flex items-center justify-between">
                  <p className="text-[11px] font-mono text-ink2 truncate">{selected}</p>
                  <span className="text-[9px] font-mono text-ink3 ml-2 flex-shrink-0">{selectedContent.split('\n').length} lines</span>
                </div>
                <div className="flex-1 overflow-auto">
                  <pre className={`text-[11px] leading-relaxed p-4 min-h-full whitespace-pre-wrap break-words ${
                    isCode ? 'font-mono text-ink2' : 'font-sans text-ink3'
                  }`}>{selectedContent}</pre>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-ink3">
                <div className="text-center space-y-2">
                  <p className="text-3xl">◈</p>
                  <p className="text-sm font-medium">Select a file to view its content</p>
                  <p className="text-xs text-ink3/60">{entries.length} files generated by BUILD ENGINE</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-agent progress grid ──────────────────────────────────────────────────

function AgentGrid({
  agents,
  activeIds,
  doneIds,
  label,
}: {
  agents:    { id: string; name: string; role: string }[]
  activeIds: Set<string>
  doneIds:   Set<string>
  label:     string
}) {
  if (activeIds.size === 0 && doneIds.size === 0) return null
  const doneCount = doneIds.size
  const total     = agents.length
  return (
    <div className="mt-3 space-y-2 bg-paper2/50 border border-border/50 rounded-xl p-3">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">{label}</p>
        <span className="text-[9px] font-mono text-ink3">{doneCount}/{total} done</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {agents.map(a => {
          const isDone   = doneIds.has(a.id)
          const isActive = activeIds.has(a.id)
          return (
            <div
              key={a.id}
              className={`border rounded-lg p-2 transition-all duration-300 text-left ${
                isActive
                  ? 'border-[#c8f23c]/70 bg-[#c8f23c]/8 shadow-[0_0_12px_2px_rgba(200,242,60,0.25)]'
                  : isDone
                  ? 'border-green-300/50 bg-green-50/40'
                  : 'border-border/30 bg-paper/60 opacity-50'
              }`}
            >
              <p className={`text-[9px] font-black font-mono leading-tight truncate ${
                isActive ? 'text-[#c8f23c]' : isDone ? 'text-green-700' : 'text-ink3'
              }`}>{a.name}</p>
              <p className="text-[8px] text-ink3/70 leading-tight mt-0.5 truncate">{a.role}</p>
              {isActive && (
                <span className="flex items-center gap-0.5 text-[8px] font-mono text-[#c8f23c] mt-0.5">
                  <span className="w-1 h-1 rounded-full bg-[#c8f23c] animate-pulse" />
                  generating
                </span>
              )}
              {isDone && <span className="text-[8px] font-mono text-green-600 font-bold">✓ done</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Deploy sub-step mini-progress ───────────────────────────────────────────

const DEPLOY_SUBSTEPS = [
  { n: 1, label: 'SPEC REPO',    detail: 'Push spec + docs to GitHub (private)' },
  { n: 2, label: 'APP REPO',     detail: 'Push generated app code to GitHub (public)' },
  { n: 3, label: 'VERCEL',       detail: 'Create Vercel project + trigger build' },
  { n: 4, label: 'BUILD POLL',   detail: 'Watching Vercel build — Next.js compiling…' },
  { n: 5, label: 'LIVE',         detail: 'App is live — production URL ready' },
]

function DeploySubGrid({ currentStep }: { currentStep: number }) {
  if (currentStep === 0) return null
  return (
    <div className="mt-3 space-y-2 bg-paper2/50 border border-border/50 rounded-xl p-3">
      <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Deploy pipeline</p>
      <div className="grid grid-cols-5 gap-1">
        {DEPLOY_SUBSTEPS.map(s => {
          const isDone   = currentStep > s.n
          const isActive = currentStep === s.n
          return (
            <div
              key={s.n}
              className={`border rounded-lg p-2 transition-all text-left ${
                isActive ? 'border-[#c8f23c]/50 bg-[#c8f23c]/5 shadow-[0_0_8px_1px_rgba(200,242,60,0.18)]' :
                isDone   ? 'border-green-200/60 bg-paper' : 'border-border/40 bg-paper2/40'
              }`}
            >
              <p className={`text-[8px] font-black font-mono leading-tight ${
                isActive ? 'text-[#c8f23c]' : isDone ? 'text-ink2' : 'text-ink3/50'
              }`}>{s.label}</p>
              <p className="text-[7px] text-ink3 leading-tight mt-0.5 truncate hidden sm:block">{s.detail}</p>
              {isActive && <span className="text-[7px] font-mono text-[#c8f23c]/70 animate-pulse">▸ running</span>}
              {isDone && <span className="text-[7px] font-mono text-green-500">✓</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Log viewer ───────────────────────────────────────────────────────────────

function LogBox({ lines }: { lines: string[] }) {
  const ref  = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    if (ref.current && !collapsed) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines, collapsed])

  if (lines.length === 0) return null
  const visible = lines.slice(-20)
  return (
    <div className="rounded-xl border border-border/60 bg-paper2 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 border-b border-border/40 hover:bg-paper3 transition-colors text-left"
      >
        <span className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase flex-1">
          ◈ Pipeline Activity Log · {lines.length} events
        </span>
        <span className="text-[10px] text-ink3 font-mono">{collapsed ? '▼ show' : '▲ hide'}</span>
      </button>
      {!collapsed && (
        <div ref={ref} className="p-3 space-y-0.5 max-h-[140px] overflow-y-auto scrollbar-thin">
          {visible.map((l, i) => (
            <div key={i} className={`font-mono text-[10px] leading-relaxed ${
              l.includes('[✓]') ? 'text-green-600' :
              l.includes('[✗]') ? 'text-red-600'   :
              l.includes('[⚠]') ? 'text-amber-600' :
              'text-ink3'
            }`}>{l}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Token config warning ─────────────────────────────────────────────────────

function TokenWarning({ ghOk, vercelOk }: { ghOk: boolean; vercelOk: boolean }) {
  if (ghOk && vercelOk) return null
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-amber-300 bg-amber-50 shadow-sm">
      <span className="text-amber-500 text-base flex-shrink-0 mt-0.5">⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-amber-800 mb-0.5">Deploy tokens not configured</p>
        <p className="text-[11px] text-amber-700 leading-relaxed">
          {!ghOk && 'GitHub token missing — repos won\'t be created. '}
          {!vercelOk && 'Vercel token missing — live URL won\'t be generated. '}
          <button
            onClick={() => { window.location.href = '/shell?page=deploy' }}
            className="underline font-semibold hover:text-amber-900 transition-colors"
          >
            Configure in Export &amp; Deploy →
          </button>
        </p>
      </div>
    </div>
  )
}

// ─── Confirm reset modal (replaces window.confirm) ───────────────────────────

function ConfirmResetModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-paper border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5 animate-fadein">
        <div>
          <p className="text-[9px] font-black font-mono tracking-widest text-amber-600 uppercase">Confirm reset</p>
          <h2 className="text-base font-black text-ink mt-1">Start a new pipeline?</h2>
          <p className="text-xs text-ink3 mt-1.5 leading-relaxed">This will clear the current build results and return to the brief input. Your GitHub repos and Vercel deployment will remain.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-border text-xs font-bold text-ink3 hover:text-ink hover:bg-paper2 transition-all"
          >
            Keep current
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-ink text-paper text-xs font-black hover:bg-ink/80 transition-all"
          >
            Yes, reset
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── G3: Upgrade modal ────────────────────────────────────────────────────────

function UpgradeModal({ onClose }: { onClose: () => void }) {
  const [hovered, setHovered] = useState<'starter' | 'agency' | null>(null)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-paper border border-border rounded-2xl shadow-2xl w-full max-w-lg p-7 space-y-6 animate-fadein">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] font-black font-mono tracking-widest text-red-500 uppercase">Run limit reached</p>
            <h2 className="text-2xl font-black text-ink mt-1 leading-tight">
              You've proven the pipeline works.<br />
              <span style={{ color: '#c8f23c' }}>Now scale it.</span>
            </h2>
          </div>
          <button onClick={onClose} className="text-ink3 hover:text-ink text-xl leading-none mt-0.5 transition-colors">✕</button>
        </div>

        {/* Social proof strip */}
        <div className="flex gap-4 text-center">
          {[
            { stat: '2 hrs', label: 'Brief → Live URL' },
            { stat: '21', label: 'AI agents per run' },
            { stat: '₹18L', label: 'ARR by one user in 3 months' },
          ].map(({ stat, label }) => (
            <div key={label} className="flex-1 bg-paper2 rounded-xl py-3 border border-border">
              <p className="text-lg font-black text-ink">{stat}</p>
              <p className="text-[10px] text-ink3 leading-tight mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Plans */}
        <div className="space-y-2">
          <div
            className={`flex items-center justify-between p-4 rounded-xl border transition-colors cursor-pointer ${
              hovered === 'starter' ? 'border-ink bg-paper3' : 'border-border bg-paper2'
            }`}
            onMouseEnter={() => setHovered('starter')}
            onMouseLeave={() => setHovered(null)}
          >
            <div>
              <p className="text-sm font-bold text-ink">Starter</p>
              <p className="text-[11px] text-ink3">20 runs/month · Priority queue · Email support</p>
              <p className="text-[11px] font-black text-ink mt-0.5">₹4,900 / month</p>
            </div>
            <a
              href="/shell?page=pricing"
              className="text-xs font-black px-4 py-2 rounded-lg border border-border hover:bg-paper3 transition-colors whitespace-nowrap"
            >
              Get Starter →
            </a>
          </div>

          <div
            className={`flex items-center justify-between p-4 rounded-xl border transition-colors cursor-pointer ${
              hovered === 'agency' ? 'border-[#c8f23c]' : 'border-[#c8f23c]/50'
            } bg-[#c8f23c]/5`}
            onMouseEnter={() => setHovered('agency')}
            onMouseLeave={() => setHovered(null)}
          >
            <div>
              <p className="text-sm font-bold text-ink flex items-center gap-2">
                Agency
                <span className="text-[9px] font-black px-1.5 py-0.5 bg-[#c8f23c] text-black rounded uppercase tracking-wider">Best Value</span>
              </p>
              <p className="text-[11px] text-ink3">Unlimited runs · White-label · API access · Slack support</p>
              <p className="text-[11px] font-black text-ink mt-0.5">₹12,000 / month — ROI in 1 client project</p>
            </div>
            <a
              href="/shell?page=pricing"
              className="text-xs font-black px-4 py-2 rounded-lg bg-[#c8f23c] text-black hover:bg-[#c8f23c]/80 transition-colors whitespace-nowrap"
            >
              Upgrade Now →
            </a>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[10px] text-ink3">Instant activation · Cancel anytime · Razorpay secure</p>
          <button
            onClick={onClose}
            className="text-xs text-ink3 hover:text-ink underline transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── G5: Runs remaining badge ─────────────────────────────────────────────────

function RunsBadge({ plan, runsUsed }: { plan: string; runsUsed: number | null }) {
  const limit = PLAN_RUN_LIMITS[plan] ?? PLAN_RUN_LIMITS.free
  if (!isFinite(limit)) return null  // agency/enterprise — unlimited, don't show
  if (runsUsed === null) return null // still loading

  const remaining = Math.max(0, limit - runsUsed)
  const isLow     = remaining <= 1
  const isEmpty   = remaining === 0

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold font-mono ${
      isEmpty ? 'border-red-300 bg-red-50 text-red-600' :
      isLow   ? 'border-amber-300 bg-amber-50 text-amber-700' :
                'border-border bg-paper2 text-ink3'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        isEmpty ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-green-500'
      }`} />
      {isEmpty
        ? 'No runs left'
        : `${remaining} of ${limit} run${limit === 1 ? '' : 's'} left`}
    </div>
  )
}

// ─── Result share card ────────────────────────────────────────────────────────

function ResultShareCard({
  projectName,
  qaScore,
  liveUrl,           // G9: may be '' — falls back to appRepoUrl
  appRepoUrl,
}: {
  projectName: string
  qaScore:     number | null
  liveUrl:     string
  appRepoUrl:  string
}) {
  const [copied, setCopied] = useState(false)
  const shareUrl = liveUrl || appRepoUrl
  if (!shareUrl) return null

  const score  = qaScore?.toFixed(1) ?? '–'
  const handle = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }
  const tweetText = encodeURIComponent(`Just built "${projectName}" with NEXUS OS — live in 4 minutes. QA score: ${score}/10\n\n${shareUrl}`)
  return (
    <div className="border border-border rounded-2xl bg-paper p-5 space-y-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Project delivered</p>
          <p className="font-black text-ink truncate text-base mt-0.5">{projectName}</p>
        </div>
        {qaScore !== null && (
          <div className={`px-3 py-1.5 rounded-xl border text-sm font-black font-mono ${
            qaScore >= 8 ? 'border-green-300 bg-green-50 text-green-700 shadow-[0_0_12px_rgba(34,197,94,0.2)]' :
            qaScore >= 7 ? 'border-[#c8f23c]/60 bg-[#c8f23c]/10 text-[#5a6e00]' :
            'border-amber-300 bg-amber-50 text-amber-700'
          }`}>
            QA {score}/10
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-paper2 font-mono text-xs text-ink2 min-w-0">
        <span className="flex-1 truncate text-ink3">{shareUrl}</span>
        <button
          onClick={handle}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
            copied ? 'border-green-300 bg-green-50 text-green-700' : 'border-border hover:border-ink/30 text-ink3 hover:text-ink bg-paper'
          }`}
        >
          {copied ? '✓ Copied' : '⎘ Copy'}
        </button>
      </div>

      <div className="flex gap-2">
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[#c8f23c] text-black text-xs font-black hover:bg-[#d4f74a] transition-all shadow-[0_0_20px_rgba(200,242,60,0.3)] hover:scale-[1.01] active:scale-[0.99]"
        >
          {liveUrl ? 'Open Live App ↗' : 'Open Repo ↗'}
        </a>
        <a
          href={`https://twitter.com/intent/tweet?text=${tweetText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl border border-border text-xs font-black hover:bg-paper3 transition-all"
          title="Share on X"
        >
          𝕏 Share
        </a>
      </div>
    </div>
  )
}

// ─── Done card ────────────────────────────────────────────────────────────────

function ShareStrip({ liveUrl, elapsed }: { liveUrl?: string; elapsed: string | null }) {
  const [copied, setCopied] = useState(false)
  const appUrl = liveUrl ?? ''
  const shareBase = 'Just shipped a full-stack app using NEXUS OS — 21 AI agents, brief → live URL in one click.'
  const text = elapsed
    ? `Just shipped a full-stack app in ${elapsed} using NEXUS OS — brief → GitHub → Vercel, fully autonomous.${appUrl ? ' ' + appUrl : ''}`
    : `${shareBase}${appUrl ? ' ' + appUrl : ''}`

  const copyLink = () => {
    if (!appUrl) return
    navigator.clipboard.writeText(appUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const twitterUrl  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
  const linkedinUrl = appUrl
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(appUrl)}&summary=${encodeURIComponent(text)}`
    : `https://www.linkedin.com/sharing/share-offsite/?summary=${encodeURIComponent(text)}`
  const waUrl       = `https://wa.me/?text=${encodeURIComponent(text)}`

  return (
    <div className="pt-4 border-t border-[#c8f23c]/20 space-y-2.5">
      <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Share your build</p>
      <div className="flex items-center gap-2 flex-wrap">
        <a href={twitterUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border text-[11px] font-bold text-ink3 hover:text-ink hover:border-ink/30 hover:bg-paper3 transition-all">
          𝕏 Tweet
        </a>
        <a href={linkedinUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border text-[11px] font-bold text-ink3 hover:text-ink hover:border-ink/30 hover:bg-paper3 transition-all">
          in LinkedIn
        </a>
        <a href={waUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border text-[11px] font-bold text-ink3 hover:text-ink hover:border-ink/30 hover:bg-paper3 transition-all">
          WhatsApp
        </a>
        {appUrl && (
          <button onClick={copyLink}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-[11px] font-bold transition-all ${
              copied ? 'border-green-300 bg-green-50 text-green-700' : 'border-border text-ink3 hover:border-ink/30 hover:text-ink hover:bg-paper3'
            }`}>
            {copied ? '✓ Copied!' : '⎘ Copy link'}
          </button>
        )}
      </div>
    </div>
  )
}

function DoneCard({ result, elapsedSec }: { result: DeployResult; elapsedSec?: number }) {
  const isBuilding = !result.deployReady && !!result.deploymentId
  const elapsed = elapsedSec
    ? elapsedSec >= 60
      ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
      : `${elapsedSec}s`
    : null
  return (
    <div className="mt-6 border border-[#c8f23c]/40 rounded-2xl bg-[#c8f23c]/4 overflow-hidden shadow-[0_0_40px_rgba(200,242,60,0.12)]">
      {/* Hero banner */}
      <div className="px-6 pt-6 pb-5 border-b border-[#c8f23c]/20 bg-gradient-to-r from-[#c8f23c]/8 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#c8f23c] flex items-center justify-center text-black text-sm font-black flex-shrink-0 shadow-[0_0_16px_rgba(200,242,60,0.5)]">✓</div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Pipeline complete</p>
            <p className="font-black text-ink text-base leading-tight">App shipped successfully</p>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="text-[9px] font-black font-mono text-green-600 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1 uppercase tracking-widest">ALL SYSTEMS GO</span>
            {elapsed && <p className="text-[10px] text-ink3 font-mono mt-1.5 text-right">⏱ {elapsed}</p>}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Links */}
        <div className="space-y-2.5">
          {result.specRepoUrl && (
            <LinkRow icon="◈" label="Spec repo" url={result.specRepoUrl} />
          )}
          {result.appRepoUrl && (
            <LinkRow icon="⚙" label="App repo (GitHub)" url={result.appRepoUrl} />
          )}
          {isBuilding ? (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-[#c8f23c]/40 bg-[#c8f23c]/5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#c8f23c] animate-[pulse_0.8s_ease-in-out_infinite] flex-shrink-0 shadow-[0_0_8px_rgba(200,242,60,0.6)]" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-bold font-mono text-ink3 uppercase tracking-widest">Live URL</p>
                <p className="text-xs font-mono text-ink3 animate-pulse">Building on Vercel… polling every 5–15s</p>
              </div>
              {result.proposalUrl && (
                <a href={result.proposalUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-mono font-bold border border-border rounded-lg px-3 py-1.5 text-ink3 hover:text-ink hover:border-ink/30 flex-shrink-0 transition-colors">
                  Preview ↗
                </a>
              )}
            </div>
          ) : result.proposalUrl ? (
            <LinkRow icon="↗" label="Live app" url={result.proposalUrl} highlight />
          ) : null}
        </div>

        {/* Primary CTA */}
        {result.vercelImport && (
          <div className="space-y-2 pt-1">
            <a
              href={result.vercelImport}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-black bg-ink text-paper hover:bg-ink/85 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:scale-[1.01] active:scale-[0.99]"
            >
              ▲ Deploy to Your Vercel →
            </a>
            <p className="text-[10px] text-ink3 text-center">You own the repo + deployment — one click to clone to your account</p>
          </div>
        )}

        <ShareStrip liveUrl={result.proposalUrl} elapsed={elapsed} />
      </div>
    </div>
  )
}

function LinkRow({ icon, label, url, highlight }: { icon: string; label: string; url: string; highlight?: boolean }) {
  const domain = url.replace(/^https?:\/\//, '').split('/').slice(0, 2).join('/')
  const path   = '/' + url.replace(/^https?:\/\//, '').split('/').slice(2).join('/')
  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-xl border ${highlight ? 'border-[#c8f23c]/50 bg-[#c8f23c]/5' : 'border-border bg-paper'}`}>
      <span className="text-sm font-mono text-ink2 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold font-mono text-ink3 uppercase tracking-widest">{label}</p>
        <p className="text-[11px] font-mono text-ink truncate">
          <span className="text-ink2">{domain}</span>
          <span className="text-ink3">{path.length > 40 ? path.slice(0, 40) + '…' : path}</span>
        </p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] font-mono font-bold border border-border rounded px-2 py-1 text-ink3 hover:text-ink hover:border-ink/30 transition-colors flex-shrink-0"
      >
        Open ↗
      </a>
    </div>
  )
}

// ─── Pipeline Voice Bar ───────────────────────────────────────────────────────

function PipelineVoiceBar({
  phase,
  isListening,
  lastText,
  interim,
  error,
  onToggle,
  onClearError,
  isSupported,
}: {
  phase: 'input' | 'running' | 'done'
  isListening: boolean
  lastText: string
  interim: string
  error: string | null
  onToggle: () => void
  onClearError: () => void
  isSupported: boolean
}) {
  if (!isSupported) return null

  const hint = phase === 'running'
    ? 'Say "status" · "stop" · "how long"'
    : phase === 'input'
    ? 'Say "launch" to start · or type your brief'
    : 'Say "status" for summary'

  return (
    <div className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 ${
      error
        ? 'border-orange-400 bg-orange-50/80'
        : isListening
        ? 'border-red-400 bg-red-50 shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
        : 'border-border/60 bg-paper2 hover:border-border'
    }`}>
      {/* Animated ring when listening */}
      {isListening && (
        <span className="absolute inset-0 rounded-xl border-2 border-red-400 animate-ping opacity-30 pointer-events-none" />
      )}

      {/* Mic button — large and obvious */}
      <button
        type="button"
        onClick={onToggle}
        title={isListening ? 'Click to stop voice (or say "stop")' : 'Click to activate voice assistant'}
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 font-bold ${
          isListening
            ? 'bg-red-500 text-white shadow-[0_0_16px_4px_rgba(239,68,68,0.45)] scale-110'
            : error
            ? 'bg-orange-100 text-orange-600 border-2 border-orange-400'
            : 'bg-paper border-2 border-border text-ink2 hover:border-[#c8f23c] hover:text-ink hover:bg-[#c8f23c]/10 hover:scale-105'
        }`}
      >
        {isListening ? (
          /* Animated bars when actively listening */
          <span className="flex items-end gap-[2px] h-4">
            {[2, 4, 6, 4, 2].map((h, i) => (
              <span
                key={i}
                className="w-[3px] bg-white rounded-full"
                style={{
                  height: `${h * 2}px`,
                  animation: `voiceBar ${0.3 + i * 0.08}s ease-in-out infinite alternate`,
                }}
              />
            ))}
          </span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        )}
      </button>

      {/* Text area */}
      <div className="flex-1 min-w-0">
        {error ? (
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-orange-600 font-semibold leading-tight">{error}</p>
            <button
              type="button"
              onClick={onClearError}
              className="flex-shrink-0 text-[10px] text-orange-500 hover:text-orange-700 font-bold leading-none mt-0.5"
              title="Dismiss error"
            >✕</button>
          </div>
        ) : isListening ? (
          <>
            <p className="text-xs font-bold text-red-600 leading-tight">
              Listening… {interim && <span className="font-normal opacity-70 italic">{interim}</span>}
            </p>
            {lastText && <p className="text-[10px] text-ink3 truncate mt-0.5">Last: "{lastText}"</p>}
          </>
        ) : lastText ? (
          <>
            <p className="text-xs text-ink2 truncate font-mono">"{lastText}"</p>
            <p className="text-[10px] text-ink3 mt-0.5">{hint}</p>
          </>
        ) : (
          <>
            <p className="text-xs text-ink2 font-medium">Voice assistant</p>
            <p className="text-[10px] text-ink3 mt-0.5">{hint}</p>
            {_activeVoiceName && (
              <p className="text-[9px] text-ink3/60 font-mono mt-0.5 truncate" title="Active TTS voice">
                🔊 {_activeVoiceName}
              </p>
            )}
          </>
        )}
      </div>

      {/* Status badge */}
      <div className={`flex-shrink-0 flex flex-col items-center gap-0.5`}>
        <span className={`text-[9px] font-black font-mono tracking-widest uppercase px-2 py-1 rounded-lg border ${
          error
            ? 'text-orange-600 border-orange-300 bg-orange-50'
            : isListening
            ? 'text-red-600 border-red-300 bg-red-50'
            : 'text-ink3 border-border bg-paper3'
        }`}>
          {error ? 'ERR' : isListening ? '● ON' : 'OFF'}
        </span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const TOTAL_AGENTS = 11 + 10  // FORGE (11: +GROWTH HACKER +MONETISATION STRATEGIST) + BUILD (10)

const INITIAL_STEPS: PipelineStep[] = [
  { id: 'forge',  label: 'FORGE',  detail: '11 agents → spec, architecture, GTM, revenue model',  status: 'pending' },
  { id: 'build',  label: 'BUILD',  detail: '10 agents → real Next.js app code + REPAIR pass', status: 'pending' },
  { id: 'deploy', label: 'DEPLOY', detail: 'Push to GitHub → Next.js build on Vercel',       status: 'pending' },
]

export default function PipelinePage() {
  const { data: session } = useSession()
  const sessionId   = (session?.user as { id?: string } | null)?.id ?? 'anon'
  const sessionPlan = (session?.user as { plan?: string } | null)?.plan ?? 'free'
  const userEmail   = (session?.user as { email?: string } | null)?.email ?? ''
  const userName    = (session?.user as { name?: string } | null)?.name ?? ''

  // Token status
  const [ghOk,         setGhOk]         = useState(false)
  const [vercelOk,     setVercelOk]     = useState(false)
  const [renderOk,     setRenderOk]     = useState(false)
  const [tokenChecked, setTokenChecked] = useState(false)

  // Brief input — pre-fill from Trending "One-Click" handoff
  const [brief,      setBrief]      = useState('')
  const [clientName, setClientName] = useState('')
  const [prefilled,  setPrefilled]  = useState(false)

  // G4: brief validation state
  const briefTooShort = brief.trim().length > 0 && brief.trim().length < BRIEF_MIN
  const briefOk       = brief.trim().length >= BRIEF_MIN

  // G5: runs used this month (loaded once on mount)
  const [runsUsed, setRunsUsed] = useState<number | null>(null)

  // G3: upgrade modal
  const [showUpgrade, setShowUpgrade] = useState(false)

  // Pipeline state
  const [phase,        setPhase]        = useState<'input' | 'running' | 'done'>('input')
  const [steps,        setSteps]        = useState<PipelineStep[]>(INITIAL_STEPS)
  const [logLines,     setLogLines]     = useState<string[]>([])

  // Sub-agent tracking — forgeActiveAgents is a Set so parallel FORGE phases show multiple running
  const [forgeActiveAgents, setForgeActiveAgents] = useState<Set<string>>(new Set())
  const [forgeDoneAgents,   setForgeDoneAgents]   = useState<Set<string>>(new Set())
  const [buildActiveAgents, setBuildActiveAgents] = useState<Set<string>>(new Set())
  const [buildDoneAgents,   setBuildDoneAgents]   = useState<Set<string>>(new Set())

  // Deploy sub-steps: 0=idle 1=spec-repo 2=app-repo 3=vercel-create 4=live-poll 5=done
  const [deploySubStep, setDeploySubStep] = useState(0)

  // BUILD stage progress — 0..5 (one per stage completed: scaffold+mock+shell / ui+api / landing+interactions / dashboard+features / repair)
  const [buildStage, setBuildStage] = useState(0)

  // Results
  const [deployResult,    setDeployResult]    = useState<DeployResult | null>(null)
  const [forgeQaScore,    setForgeQaScore]    = useState<number | null>(null)
  const [streamingOutput, setStreamingOutput] = useState('')

  // Modals
  const [showTemplates,    setShowTemplates]    = useState(false)
  const [showFilesView,    setShowFilesView]    = useState(false)
  const [showConfirmReset, setShowConfirmReset] = useState(false)
  const [buildWarning,     setBuildWarning]     = useState<string | null>(null)

  // G6: pipeline start time for ETA + final elapsed
  const pipelineStartRef = useRef<number>(0)
  const [elapsedSec,     setElapsedSec]     = useState(0)
  const [finalElapsedSec, setFinalElapsedSec] = useState(0)

  // G1: AbortController ref for cancellation
  const abortRef = useRef<AbortController | null>(null)

  // Retry / persistence tracking
  const forgeContentRef = useRef<Record<string, string>>({})
  const buildFilesRef   = useRef<Record<string, string>>({})
  const forgeSpecRef    = useRef<ForgeBuild | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // G2: cumulative token counter for DB save
  const totalTokensRef = useRef(0)
  const totalCallsRef  = useRef(0)

  // Check tokens on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/deploy/github').then(r => r.json()).catch(() => ({ ok: false })),
      fetch('/api/deploy/vercel').then(r => r.json()).catch(() => ({ ok: false })),
      fetch('/api/deploy/render').then(r => r.json()).catch(() => ({ ok: false })),
    ]).then(([gh, vrcl, rndr]) => {
      setGhOk(!!gh.ok)
      setVercelOk(!!vrcl.ok)
      setRenderOk(!!rndr.ok)
      setTokenChecked(true)
    }).catch(() => setTokenChecked(true))
  }, [])

  // G5: load runs used this month — server-side quota (Upstash) is authoritative
  useEffect(() => {
    if (sessionId === 'anon') return
    const limit = PLAN_RUN_LIMITS[sessionPlan] ?? PLAN_RUN_LIMITS.free
    if (!isFinite(limit)) { setRunsUsed(0); return }
    fetch('/api/quota')
      .then(r => r.json())
      .then((d: { ok: boolean; data?: { count: number } }) => {
        if (d.ok && d.data != null) setRunsUsed(d.data.count)
      })
      .catch(() => {})
  }, [sessionId, sessionPlan])

  // Warn user before closing tab while pipeline is running
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (phase !== 'running') return
      e.preventDefault()
      e.returnValue = 'Pipeline is still running — leaving will cancel it.'
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase])

  // G6: elapsed timer while running
  useEffect(() => {
    if (phase !== 'running') { setElapsedSec(0); return }
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - pipelineStartRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  // Poll Vercel deployment status until READY
  const pollCountRef = useRef(0)

  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    const depId = deployResult?.deploymentId
    if (!depId || deployResult.deployReady) return
    pollCountRef.current = 0

    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        clearTimeout(pollIntervalRef.current as unknown as ReturnType<typeof setTimeout>)
        pollIntervalRef.current = null
      }
    }

    const poll = async () => {
      pollCountRef.current++
      if (pollCountRef.current > 60) {
        stopPolling()
        setDeployResult(prev => prev ? { ...prev, deployReady: true } : prev)
        log('Deploy polling timed out after 10 min — check Vercel dashboard', 'warn')
        return
      }
      try {
        const res  = await fetch(`/api/deploy/vercel-status?id=${depId}`)
        const data = await res.json() as { ok: boolean; state: string; deployUrl: string | null; ready: boolean; error?: string }
        if (!data.ok) return
        if (data.ready) {
          stopPolling()
          setDeploySubStep(5)
          setDeployResult(prev => prev ? { ...prev, proposalUrl: data.deployUrl ?? prev.proposalUrl, deployReady: true } : prev)
          speak('Vercel build complete. Your app is live. The full pipeline — from brief to live URL — is finished. Check the result below.', { volume: 1.0 })
          setLastVoiceText('App is live on Vercel!')
          log('App is live on Vercel!', 'ok')
        } else if (data.state === 'ERROR') {
          stopPolling()
          setDeployResult(prev => prev ? { ...prev, deployReady: true } : prev)
          log(`Vercel build failed: ${data.error ?? 'unknown error'}`, 'err')
        }
      } catch { /* network blip — retry next tick */ }
    }

    // Adaptive polling: 5s × 6 checks, then 10s × 12 checks, then 15s thereafter
    let adaptiveTimer: ReturnType<typeof setTimeout> | null = null
    const schedulePoll = (count: number) => {
      const delay = count <= 6 ? 5_000 : count <= 18 ? 10_000 : 15_000
      adaptiveTimer = setTimeout(async () => {
        await poll()
        if (pollIntervalRef.current !== null) schedulePoll(count + 1)
      }, delay)
      pollIntervalRef.current = adaptiveTimer as unknown as ReturnType<typeof setInterval>
    }
    void poll()
    schedulePoll(1)
    return stopPolling
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployResult?.deploymentId, deployResult?.deployReady])

  // Pre-fill from Trending "One-Click" handoff
  useLayoutEffect(() => {
    const prefillBrief  = sessionStorage.getItem('nexus-prefill-pipeline-brief')
                       || localStorage.getItem('nexus-prefill-pipeline-brief')
    const prefillClient = sessionStorage.getItem('nexus-prefill-pipeline-client')
                       || localStorage.getItem('nexus-prefill-pipeline-client')

    // G7: restore ForgeSpec from sessionStorage after page refresh
    const savedSpec = sessionStorage.getItem('nexus-pipeline-forge-spec')
    let hasForgeSpec = false
    if (savedSpec && !forgeSpecRef.current) {
      try {
        forgeSpecRef.current = JSON.parse(savedSpec) as ForgeBuild
        hasForgeSpec = true
      } catch { /* corrupt entry — ignore */ }
    }

    // G7b: restore BUILD files from sessionStorage after page refresh
    const savedBuildFiles = sessionStorage.getItem('nexus-pipeline-build-files')
    let hasBuildFiles = false
    if (savedBuildFiles && Object.keys(buildFilesRef.current).length === 0) {
      try {
        const parsed = JSON.parse(savedBuildFiles) as Record<string, string>
        const isTruncated = Object.values(parsed).some(v => v === '__truncated__')
        if (isTruncated) {
          setLogLines(ls => [...ls, `[⚠] Previous BUILD was too large to cache — ${Object.keys(parsed).length} file names restored. Use retry to regenerate if needed.`])
        } else if (Object.keys(parsed).length > 0) {
          buildFilesRef.current = parsed
          hasBuildFiles = true
          setLogLines(ls => [...ls, `[→] Session resumed — ${Object.keys(parsed).length} BUILD files restored from previous run`])
        }
      } catch { /* corrupt entry — ignore */ }
    }

    // G7c: if we have forge spec + build files, restore step state so user sees DEPLOY retry button
    // Phase stays 'input' (deploy URLs are not cached), but steps show prior progress
    if (hasForgeSpec && hasBuildFiles && forgeSpecRef.current) {
      const spec = forgeSpecRef.current
      setBrief(spec.brief)
      setClientName(spec.projectName.replace(/-/g, ' '))
      setForgeQaScore(spec.score)
      setSteps([
        { id: 'forge',  label: 'FORGE',  detail: '11 agents → spec, architecture, GTM, revenue model', status: 'done' },
        { id: 'build',  label: 'BUILD',  detail: '10 agents → real Next.js app code + REPAIR pass',    status: 'done' },
        { id: 'deploy', label: 'DEPLOY', detail: 'Push to GitHub → Next.js build on Vercel',           status: 'error', error: 'Session refreshed — click Retry to push to GitHub and deploy' },
      ])
      setForgeDoneAgents(new Set(FORGE_AGENTS.map(a => a.id)))
      setBuildDoneAgents(new Set(BUILD_AGENTS.map(a => a.id)))
      setBuildStage(5)
      setPhase('running')
      setLogLines(ls => [...ls, `[→] Restored session: FORGE ✓ BUILD ✓ · Click Retry on DEPLOY to finish`])
    }

    if (prefillBrief) {
      setBrief(prefillBrief)
      sessionStorage.removeItem('nexus-prefill-pipeline-brief')
      localStorage.removeItem('nexus-prefill-pipeline-brief')
      setPrefilled(true)
    }
    if (prefillClient) {
      setClientName(prefillClient)
      sessionStorage.removeItem('nexus-prefill-pipeline-client')
      localStorage.removeItem('nexus-prefill-pipeline-client')
    }
  }, [])

  const log = useCallback((msg: string, type: 'info' | 'ok' | 'warn' | 'err' = 'info') => {
    const ts     = new Date().toLocaleTimeString('en', { hour12: false })
    const prefix = type === 'ok' ? '[✓]' : type === 'warn' ? '[⚠]' : type === 'err' ? '[✗]' : '[→]'
    setLogLines(ls => [...ls, `${ts} ${prefix} ${msg}`])
  }, [])

  const patchStep = useCallback((id: string, patch: Partial<PipelineStep>) => {
    setSteps(ss => ss.map(s => s.id === id ? { ...s, ...patch } : s))
  }, [])

  // ── G1: Cancel pipeline ───────────────────────────────────────────────────

  const cancelPipeline = useCallback(() => {
    abortRef.current?.abort()
    setPhase('input')
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: 'pending' as StepStatus })))
    setLogLines([])
    setStreamingOutput('')
    setForgeQaScore(null)
    setFinalElapsedSec(0)
    setForgeActiveAgents(new Set())
    setForgeDoneAgents(new Set())
    setBuildActiveAgents(new Set())
    setBuildDoneAgents(new Set())
    setBuildStage(0)
    setBuildWarning(null)
    setDeployResult(null)
    setDeploySubStep(0)
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
    log('Pipeline cancelled by user', 'warn')
  }, [log])

  // ── Streaming agent call — reads SSE from /api/claude/stream ──────────────

  const callAgentStreaming = useCallback(async (
    systemPrompt: string,
    userMessage:  string,
  ): Promise<{ content: string; tokens: number }> => {
    setStreamingOutput('')

    // G1: check if aborted before starting each agent
    if (abortRef.current?.signal.aborted) throw new Error('Pipeline cancelled')

    const res = await fetch('/api/claude/stream', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body:    JSON.stringify({ systemPrompt, userMessage, plan: sessionPlan, sessionId }),
      signal:  abortRef.current?.signal,
    })

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      const errMsg = (err as { error?: string }).error ?? `HTTP ${res.status}`

      // G3: detect quota exhaustion and show upgrade modal
      if (res.status === 429 && /limit|quota|upgrade/i.test(errMsg)) {
        setShowUpgrade(true)
      }

      throw new Error(errMsg)
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let content   = ''
    let tokens    = 0
    let buf       = ''

    while (true) {
      // G1: abort mid-stream
      if (abortRef.current?.signal.aborted) {
        await reader.cancel()
        throw new Error('Pipeline cancelled')
      }

      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const msg = JSON.parse(line.slice(6)) as { type: string; content?: string; tokens?: number; message?: string }
          if (msg.type === 'chunk' && msg.content) {
            content += msg.content
            setStreamingOutput(content.slice(-280))
          } else if (msg.type === 'done') {
            tokens = msg.tokens ?? Math.ceil(content.length / 4)
          } else if (msg.type === 'error') {
            throw new Error(msg.message ?? 'Stream error')
          }
        } catch (parseErr) { /* skip malformed SSE line */ }
      }
    }

    setStreamingOutput('')
    // G2: accumulate tokens/calls
    totalTokensRef.current += tokens
    totalCallsRef.current  += 1
    return { content, tokens }
  }, [sessionId, sessionPlan])

  // Overall progress % — agent-weighted with BUILD stage interpolation for smooth bar
  // FORGE spans 0–52%, BUILD spans 52–92% (split evenly across 5 stages), DEPLOY 92–100%
  const doneAgents = forgeDoneAgents.size + buildDoneAgents.size
  const progressPct = phase === 'done' ? 100 : (() => {
    const forgePct  = Math.round((forgeDoneAgents.size / 11) * 52)
    const buildPct  = Math.round((buildStage / 5) * 40)
    const deployPct = Math.round((deploySubStep / 5) * 8) // 92–100% during deploy
    return Math.min(99, forgePct + buildPct + deployPct)
  })()

  // G6: elapsed time display (needed by voice commands)
  const elapsedDisplay = elapsedSec >= 60
    ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
    : `${elapsedSec}s`

  // G6-03: dynamic ETA — shows remaining estimate once pipeline is running
  const PLAN_ETA_SECS: Record<string, number> = { free: 660, starter: 660, agency: 360 }
  const etaDisplay = (() => {
    if (phase !== 'running') return PLAN_ETA[sessionPlan] ?? '8–14 min'
    const totalSec = PLAN_ETA_SECS[sessionPlan] ?? 660
    const remaining = Math.max(0, totalSec - elapsedSec)
    if (remaining === 0) return 'wrapping up…'
    const m = Math.floor(remaining / 60)
    const s = remaining % 60
    return m > 0 ? `~${m}m ${s}s left` : `~${s}s left`
  })()

  // ─── Voice assistant ────────────────────────────────────────────────────────

  const [lastVoiceText, setLastVoiceText] = useState('')

  // TTS queue in voice.ts serialises messages — no throttle needed here.
  // high-priority clears the queue and plays immediately; normal queues up (max 4).
  const announce = useCallback((text: string, opts?: { rate?: number; pitch?: number; priority?: 'normal' | 'high' }) => {
    speak(text, { rate: opts?.rate, pitch: opts?.pitch, volume: opts?.priority === 'high' ? 1.0 : 0.92, priority: opts?.priority })
    setLastVoiceText(text)
  }, [])

  const cmdHandlerRef    = useRef<(text: string) => void>(() => {})
  // runPipelineRef holds a stable pointer updated each render — avoids forward-declaration TS error
  // while still giving the voice command handler the latest runPipeline closure.
  const runPipelineRef   = useRef<() => void>(() => {})

  useEffect(() => {
    cmdHandlerRef.current = (text: string) => {
      const lower = text.toLowerCase().trim()
      if (/status|how.*(it|going)|progress|update/.test(lower)) {
        if (phase === 'running') {
          const forgeNames = [...forgeActiveAgents].map(id => FORGE_AGENTS.find(a => a.id === id)?.name ?? id)
          const agentName = forgeNames.length > 0
            ? forgeNames.length === 1 ? forgeNames[0] : `${forgeNames.length} FORGE agents in parallel`
            : buildActiveAgents.size > 0
            ? `${buildActiveAgents.size} BUILD agent${buildActiveAgents.size > 1 ? 's' : ''}`
            : null
          const msg = agentName
            ? `${progressPct} percent complete. Currently running: ${agentName}.`
            : `Pipeline is ${progressPct} percent complete.`
          speak(msg); setLastVoiceText(msg)
        } else if (phase === 'done') {
          const msg = `Pipeline complete. ${deployResult?.proposalUrl ? 'App is live.' : 'Check the results below.'}`
          speak(msg); setLastVoiceText(msg)
        }
        return
      }
      if (/\b(stop|cancel|abort|terminate)\b/.test(lower)) {
        if (phase === 'running') { speak('Stopping pipeline.'); setLastVoiceText('Stopping pipeline.'); setTimeout(() => cancelPipeline(), 700) }
        return
      }
      if (/how long|elapsed|how much time|time remaining/.test(lower)) {
        if (phase === 'running') { const msg = `Pipeline running for ${elapsedDisplay}. ${etaDisplay !== 'wrapping up…' ? `Estimated ${etaDisplay}.` : 'Wrapping up now.'}`; speak(msg); setLastVoiceText(msg) }
        return
      }
      if (/\b(launch|start pipeline|run pipeline|begin)\b/.test(lower)) {
        if (phase === 'input' && briefOk) { speak('Launching pipeline.'); setLastVoiceText('Launching.'); setTimeout(() => runPipelineRef.current(), 800) }
        else if (phase === 'input') { speak('Add more detail to your brief first.'); setLastVoiceText('Brief too short.') }
        return
      }
      if (/\b(help|what can (i|you)|commands|what.*say)\b/.test(lower)) {
        const cmds = phase === 'running'
          ? 'Say: status, stop, how long, or time remaining.'
          : phase === 'input'
          ? 'Say: launch to start the pipeline, or status for a summary.'
          : 'Say: status for a summary of your results.'
        speak(cmds); setLastVoiceText(cmds)
        return
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, forgeActiveAgents, buildActiveAgents, progressPct, elapsedDisplay, etaDisplay, briefOk, deployResult, cancelPipeline])

  const pipelineVoice = useVoice({
    continuous: true,
    language: 'en-US',
    onTranscript: useCallback((t: string) => cmdHandlerRef.current(t), []),
  })

  // Audio confirmation when voice activates/deactivates
  useEffect(() => {
    if (pipelineVoice.isListening) {
      speak('Voice on.', { rate: 1.4 })
    } else {
      stopSpeaking() // cut any in-flight TTS when user turns mic off
    }
  }, [pipelineVoice.isListening])

  // ── FORGE phase ─────────────────────────────────────────────────────────────

  const runForge = useCallback(async (rawBrief: string, rawClient: string): Promise<ForgeBuild> => {
    patchStep('forge', { status: 'running', error: undefined })

    // Defence-in-depth: sanitise at FORGE entry (caller should already have sanitised)
    const briefText = sanitiseBrief(rawBrief)
    const client    = sanitiseBrief(rawClient)

    const vertical        = detectVertical(briefText)
    const verticalContext = VERTICAL_CONTEXTS[vertical]
    log(`FORGE ENGINE starting — 11 agents · vertical: ${vertical.toUpperCase()}`)
    announce('FORGE ENGINE started. Eleven specialists are reading your brief and defining your product.')

    const content: Record<string, string>   = {}
    const specFiles: Record<string, string> = {}

    const callForge = async (agentId: string, system: string, userMsg: string) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await callAgentStreaming(system, userMsg)
          return result
        } catch (err) {
          const msg = (err as Error).message ?? ''
          if (msg === 'Pipeline cancelled') throw err
          const isRateLimit = /rate.?limit|429|try again/i.test(msg)
          if (attempt < 2) {
            const waitSec = isRateLimit ? 30 : 6
            log(`⚠ FORGE ${agentId} ${isRateLimit ? 'rate-limited' : 'failed'} — retrying in ${waitSec}s…`, 'warn')
            for (let t = waitSec; t > 0; t--) {
              if (abortRef.current?.signal.aborted) throw new Error('Pipeline cancelled')
              setStreamingOutput(`⏳ Rate limit — retrying ${agentId} in ${t}s…`)
              await new Promise(r => setTimeout(r, 1000))
            }
            setStreamingOutput('')
          } else {
            throw new Error(`FORGE ${agentId}: ${msg}`)
          }
        }
      }
      throw new Error(`FORGE ${agentId}: no response`)
    }

    // Helper to run one FORGE agent and record its output
    const runForgeAgent = async (agentId: string, system: string, userMsg: string) => {
      setForgeActiveAgents(s => new Set([...s, agentId]))
      const agent = AGENTS.find(a => a.id === agentId) ?? FORGE_AGENTS.find(a => a.id === agentId)
      log(`FORGE · ${agent?.name ?? agentId}`)
      const result = await callForge(agentId, system, userMsg)
      content[agentId] = result.content
      const filePath = agentFileMap[agentId]
      if (filePath) specFiles[filePath] = result.content
      setForgeActiveAgents(s => { const n = new Set(s); n.delete(agentId); return n })
      setForgeDoneAgents(d => new Set([...d, agentId]))
      log(`✓ FORGE ${agent?.name ?? agentId} (${result.tokens} tokens)`, 'ok')
      return result
    }

    // Tiered context caps: foundational agents get more chars, specialists get standard, revenue agents get summary
    const AGENT_CTX_CAPS: Record<string, number> = {
      orchestrator: 2000, analyst: 2000, architect: 2000,
      planner: 800, 'test-writer': 800, builder: 800, security: 800, 'db-opt': 800,
      qa: 600, growth: 600, monetisation: 600,
    }
    const prevOutputs = () => Object.entries(content)
      .map(([k, v]) => `[${k}]: ${v.slice(0, AGENT_CTX_CAPS[k] ?? 800)}`)
      .join('\n\n')
    const briefCtx    = `${briefText}\n\n${verticalContext}`

    // ── Phase A: orchestrator (sequential) ────────────────────────────────────
    await runForgeAgent('orchestrator',
      FORGE_AGENT_SYSTEMS['orchestrator'] ?? 'You are the NEXUS ORCHESTRATOR.',
      `Mission: ${briefText}\nClient: ${client || 'Client'}\n\n${verticalContext}`,
    )
    announce('Mission control complete. Your project goals are mapped and agent priorities are set.', { rate: 1.02 })
    await new Promise(r => setTimeout(r, 200))

    // ── Phase B: analyst (sequential — establishes PROJECT_MANIFEST) ──────────
    await runForgeAgent('analyst',
      `${FORGE_AGENT_SYSTEMS['analyst']}\n\n${verticalContext}`,
      `${briefCtx}\n\nPrevious outputs:\n${prevOutputs()}`,
    )
    announce('Requirements complete. Core features, user personas, and the product manifest are written.', { rate: 1.02 })
    await new Promise(r => setTimeout(r, 200))

    // ── Phase C: architect (sequential — design must precede specialist agents) ─
    await runForgeAgent('architect',
      FORGE_AGENT_SYSTEMS['architect'] ?? 'You are the NEXUS ARCHITECT.',
      `${briefCtx}\n\nPrevious outputs:\n${prevOutputs()}`,
    )
    announce('Architecture locked. Technical stack, database schema, and all API contracts are defined.', { rate: 1.02 })
    await new Promise(r => setTimeout(r, 200))

    // ── Phase D: parallel — 5 specialist agents (all depend on architect only) ─
    // planner, test-writer, builder, security, db-opt can all work simultaneously.
    // Each gets the same context snapshot from after architect completes.
    const parallelCtx = `${briefCtx}\n\nPrevious outputs:\n${prevOutputs()}`
    const PARALLEL_AGENTS = ['planner', 'test-writer', 'builder', 'security', 'db-opt']
    announce('Five specialists are now working in parallel — feature planning, code design, security review, test strategy, and database optimisation.', { rate: 1.02 })
    log(`FORGE · parallel phase starting: ${PARALLEL_AGENTS.join(', ')}`)

    await Promise.all(PARALLEL_AGENTS.map(id =>
      runForgeAgent(
        id,
        FORGE_AGENT_SYSTEMS[id] ?? `You are the NEXUS ${id.toUpperCase()} agent. Complete your task.`,
        parallelCtx,
      )
    ))
    announce('All five specialists done. Features, security, tests, code structure, and data model are complete.', { rate: 1.02 })
    log('✓ FORGE parallel phase complete — all 5 specialist agents done', 'ok')
    await new Promise(r => setTimeout(r, 200))

    // ── Phase E: QA gate (sequential — needs all specialist outputs) ──────────
    await runForgeAgent('qa',
      FORGE_AGENT_SYSTEMS['qa'] ?? 'You are the NEXUS QA GATE.',
      `${briefCtx}\n\nAll agent outputs:\n${prevOutputs()}`,
    )
    setForgeActiveAgents(new Set())

    // Hard QA Gate with ANALYST revision loop (max 2 iterations)
    let qaText  = content['qa'] ?? ''
    let qaScore = extractQAScore(qaText)
    setForgeQaScore(qaScore)

    if (qaScore === null || qaScore < 7.0) {
      announce(`Quality score is ${qaScore ?? 'incomplete'} out of ten. Gaps detected — running an automatic revision now.`)
      log(`⚠ QA score ${qaScore ?? 'unscored'}/10 — below 7.0 hard gate. Running ANALYST revision loop…`, 'warn')
      await new Promise(r => setTimeout(r, 4000))

      for (let rev = 0; rev < 2 && (qaScore === null || qaScore < 7.0); rev++) {
        if (abortRef.current?.signal.aborted) throw new Error('Pipeline cancelled')
        log(`FORGE · ANALYST REVISION #${rev + 1} — addressing QA gaps`)
        setForgeActiveAgents(new Set(['analyst']))

        const gapSection = qaText.slice(0, 600)

        const revisedAnalyst = await callForge(
          'analyst',
          `${FORGE_AGENT_SYSTEMS['analyst']}\n\n${verticalContext}\n\nThis is a REVISION. The QA gate scored the previous output below 7.0. You MUST address all Critical Gaps listed.`,
          `REVISION #${rev + 1}. QA gate found these gaps:\n${gapSection}\n\nOriginal brief: ${briefText}\n\nProduce an improved PROJECT_MANIFEST that closes every gap.`,
        )
        content['analyst'] = revisedAnalyst.content
        specFiles[agentFileMap['analyst'] ?? 'PROJECT_MANIFEST.md'] = revisedAnalyst.content
        setForgeActiveAgents(new Set())

        log(`FORGE · QA RE-ASSESSMENT after revision #${rev + 1}`)
        setForgeActiveAgents(new Set(['qa']))
        const prevForRevision = Object.entries(content)
          .map(([k, v]) => `[${k}]: ${v.slice(0, 300)}`)
          .join('\n\n')

        const revisedQA = await callForge(
          'qa',
          FORGE_AGENT_SYSTEMS['qa'] ?? '',
          `Re-assess the REVISED FORGE output after ANALYST revision #${rev + 1}.\n\nAll agent outputs:\n${prevForRevision}`,
        )
        content['qa'] = revisedQA.content
        qaText  = revisedQA.content
        qaScore = extractQAScore(revisedQA.content)
        setForgeQaScore(qaScore)
        setForgeActiveAgents(new Set())

        log(`✓ Revised QA score: ${qaScore ?? '?'}/10`, qaScore !== null && qaScore >= 7 ? 'ok' : 'warn')
        await new Promise(r => setTimeout(r, 2000))
      }

      if (qaScore !== null && qaScore < 7.0) {
        log(`⚠ QA still ${qaScore}/10 after 2 revisions — proceeding to BUILD (output may be suboptimal)`, 'warn')
        announce(`Revision complete. Proceeding to BUILD ENGINE with a score of ${qaScore.toFixed(1)} out of ten.`)
      } else if (qaScore !== null) {
        announce(`Revision raised the score to ${qaScore.toFixed(1)} out of ten. Specification approved.`)
        log(`✓ Revised QA score ${qaScore}/10 — APPROVED for BUILD`, 'ok')
      }
    } else if (qaScore !== null) {
      announce(`Specification approved. Quality score: ${qaScore.toFixed(1)} out of ten. Handing off to BUILD ENGINE.`)
      log(`✓ FORGE QA score ${qaScore}/10 — APPROVED for BUILD`, 'ok')
    }

    // ── Revenue agents 10 & 11 — run after QA gate ────────────────────────────
    // F-08/F-09: use full tiered caps (600 chars for qa, 800+ for strategic agents) so
    // growth and monetisation agents have full product context to reference
    const prevForRevenue = prevOutputs()

    setForgeActiveAgents(new Set(['growth']))
    log('FORGE · GROWTH HACKER — building GTM playbook')
    const growthResult = await callForge(
      'growth',
      FORGE_AGENT_SYSTEMS['growth'] ?? 'You are NEXUS GROWTH HACKER. Build a concrete GTM playbook.',
      `Brief: ${briefText}\nVertical: ${vertical}\n\nFORGE spec outputs:\n${prevForRevenue}`,
    )
    content['growth'] = growthResult.content
    specFiles['GROWTH_PLAYBOOK.md'] = growthResult.content
    setForgeDoneAgents(d => new Set([...d, 'growth']))
    setForgeActiveAgents(new Set())
    announce('Growth playbook done. Acquisition channels, viral loops, and go-to-market strategy are written.')
    log(`✓ FORGE GROWTH HACKER (${growthResult.tokens} tokens)`, 'ok')
    await new Promise(r => setTimeout(r, 300))

    setForgeActiveAgents(new Set(['monetisation']))
    log('FORGE · MONETISATION STRATEGIST — designing revenue engine')
    const monetisationResult = await callForge(
      'monetisation',
      FORGE_AGENT_SYSTEMS['monetisation'] ?? 'You are NEXUS MONETISATION STRATEGIST. Design the revenue model.',
      `Brief: ${briefText}\nVertical: ${vertical}\n\nFORGE spec outputs:\n${prevForRevenue}\n\nGrowth playbook:\n${growthResult.content.slice(0, 1200)}`,
    )
    content['monetisation'] = monetisationResult.content
    specFiles['MONETISATION_BLUEPRINT.md'] = monetisationResult.content
    setForgeDoneAgents(d => new Set([...d, 'monetisation']))
    setForgeActiveAgents(new Set())
    announce('Revenue model done. Pricing tiers, upsell triggers, and projections are complete. FORGE ENGINE finished.')
    log(`✓ FORGE MONETISATION STRATEGIST (${monetisationResult.tokens} tokens)`, 'ok')
    // Drain TTS queue before BUILD starts — ensures all FORGE narration plays before transition
    await waitForSpeech(12_000)
    await new Promise(r => setTimeout(r, 300))

    const slug = slugify(client || briefText.slice(0, 30))
    const build: ForgeBuild = {
      projectName: slug,
      brief:       briefText,
      score:       qaScore,
      files:       specFiles,
      builtAt:     new Date().toISOString(),
    }

    // Persist for other pages
    try {
      const prev = JSON.parse(localStorage.getItem('nexus_forge_builds') ?? '[]')
      localStorage.setItem('nexus_forge_builds', JSON.stringify([build, ...prev].slice(0, 10)))
      localStorage.setItem('nexus_forge_last_build', JSON.stringify(build))
    } catch { /* storage full */ }

    // G7: persist ForgeSpec to sessionStorage so page refresh can resume from BUILD step
    try {
      sessionStorage.setItem('nexus-pipeline-forge-spec', JSON.stringify(build))
    } catch { /* ignore */ }

    forgeContentRef.current = content
    forgeSpecRef.current    = build
    log('FORGE complete — spec saved', 'ok')
    patchStep('forge', { status: 'done' })
    return build
  }, [patchStep, log, callAgentStreaming, announce])

  // ── BUILD phase ─────────────────────────────────────────────────────────────

  const buildUserMessage = useCallback((agentId: string, forge: ForgeBuild, generatedSoFar: Record<string, string>): string => {
    const manifest = forge.files['PROJECT_MANIFEST.md'] ?? ''
    const arch     = forge.files['.claude/architecture.md'] ?? ''
    const features = forge.files['.claude/features/feature-cards.md'] ?? ''
    const security = forge.files['.claude/security-report.md'] ?? ''
    const sql      = forge.files['db/migrations/001_init.sql'] ?? ''
    const qa       = forge.files['.forge/qa-report.md'] ?? ''

    const prevFilesSummary = Object.keys(generatedSoFar).length > 0
      ? `\nPREVIOUSLY GENERATED FILES (${Object.keys(generatedSoFar).length} total — do NOT re-generate these):\n${Object.keys(generatedSoFar).join('\n')}\n`
      : ''

    const snippet = (key: string, max = 800) =>
      generatedSoFar[key] ? `\n--- ${key} (first ${max} chars) ---\n${generatedSoFar[key].slice(0, max)}` : ''

    const prevContext = prevFilesSummary
      + snippet('src/lib/types.ts', 1200)
      + snippet('src/lib/data.ts', 900)
      + snippet('src/components/ui.tsx', 700)
      + snippet('src/app/layout.tsx', 600)
      + snippet('src/components/layout.tsx', 500)

    return `PROJECT: ${forge.projectName}
BRIEF: ${forge.brief}

PROJECT_MANIFEST.md:
${manifest.slice(0, 2000)}

ARCHITECTURE:
${arch.slice(0, 1200)}

FEATURE CARDS:
${features.slice(0, 1200)}

SECURITY REPORT:
${security.slice(0, 600)}

DATABASE SCHEMA (SQL):
${sql.slice(0, 800)}

QA REPORT:
${qa.slice(0, 600)}
${prevContext}
Generate the ${agentId.toUpperCase()} files now. Follow the output contract exactly.`
  }, [])

  const runBuild = useCallback(async (forge: ForgeBuild): Promise<Record<string, string>> => {
    patchStep('build', { status: 'running', error: undefined })
    log('BUILD ENGINE starting — 10 agents (incl. REPAIR) in parallel stages')
    announce('BUILD ENGINE active. Ten agents are writing real Next.js code — components, APIs, and the full feature set.')

    const allFiles: Record<string, string> = {}

    // Helper: run a single agent with retry
    const runAgent = async (agentId: string, contextSnapshot: Record<string, string>) => {
      const agent = BUILD_AGENTS.find(a => a.id === agentId)!
      setBuildActiveAgents(s => new Set([...s, agentId]))
      log(`BUILD · ${agent.name}`)
      let agentResult: { content: string; tokens: number } | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          agentResult = await callAgentStreaming(
            BUILD_AGENT_SYSTEMS[agentId] ?? '',
            buildUserMessage(agentId, forge, contextSnapshot),
          )
          break
        } catch (err) {
          const msg = (err as Error).message ?? ''
          if (msg === 'Pipeline cancelled') throw err
          const isRateLimit = /rate.?limit|429|try again/i.test(msg)
          if (attempt < 2) {
            const waitSec = isRateLimit ? 30 : 6
            log(`⚠ BUILD ${agent.name} ${isRateLimit ? 'rate-limited' : 'failed'} — retrying in ${waitSec}s…`, 'warn')
            for (let t = waitSec; t > 0; t--) {
              if (abortRef.current?.signal.aborted) throw new Error('Pipeline cancelled')
              setStreamingOutput(`⏳ Rate limit — retrying ${agent.name} in ${t}s…`)
              await new Promise(r => setTimeout(r, 1000))
            }
            setStreamingOutput('')
          } else {
            throw new Error(`BUILD ${agent.name}: ${msg}`)
          }
        }
      }
      if (!agentResult) throw new Error(`BUILD ${agentId}: no response`)
      const parsed = parseAgentFiles(agentResult.content)
      Object.assign(allFiles, parsed)
      setBuildActiveAgents(s => { const n = new Set(s); n.delete(agentId); return n })
      setBuildDoneAgents(d => new Set([...d, agentId]))
      log(`✓ BUILD ${agent.name} — ${Object.keys(parsed).length} files (${agentResult!.tokens} tokens)`, 'ok')
      return parsed
    }

    // Stage 1 (parallel): scaffold + mock-data + shell — fully independent
    await Promise.all([
      runAgent('scaffold',  { ...allFiles }),
      runAgent('mock-data', { ...allFiles }),
      runAgent('shell',     { ...allFiles }),
    ])
    setBuildStage(1)
    announce('Stage one complete. Project scaffold, file structure, and mock data layer are ready.')
    await new Promise(r => setTimeout(r, 300))

    // Stage 2 (parallel): ui-core + api — need types from stage 1
    await Promise.all([
      runAgent('ui-core', { ...allFiles }),
      runAgent('api',     { ...allFiles }),
    ])
    setBuildStage(2)
    announce('Stage two complete. User interface components and all API routes are generated.')
    await new Promise(r => setTimeout(r, 300))

    // Stage 3 (parallel): landing + interactions — need ui components from stage 2
    await Promise.all([
      runAgent('landing',      { ...allFiles }),
      runAgent('interactions', { ...allFiles }),
    ])
    setBuildStage(3)
    announce('Stage three complete. Landing page and all interactive elements are built.')
    await new Promise(r => setTimeout(r, 300))

    // Stage 4 (parallel): dashboard + features — need ui layout from stage 2
    await Promise.all([
      runAgent('dashboard', { ...allFiles }),
      runAgent('features',  { ...allFiles }),
    ])
    setBuildStage(4)
    announce('Stage four complete. Dashboard and full feature set are built. Repair agent is doing a final consistency pass.')
    await new Promise(r => setTimeout(r, 300))

    // Stage 5: repair — needs all prior output
    await runAgent('repair', { ...allFiles })
    setBuildStage(5)
    setBuildActiveAgents(new Set())
    buildFilesRef.current = allFiles

    // G7b: persist BUILD files — guard against 5MB sessionStorage limit
    try {
      const serialised = JSON.stringify(allFiles)
      if (serialised.length > 4_000_000) {
        // Too large to store whole — store a manifest of file names only so restore can warn correctly
        const manifest = Object.fromEntries(Object.keys(allFiles).map(k => [k, '__truncated__']))
        sessionStorage.setItem('nexus-pipeline-build-files', JSON.stringify(manifest))
        log(`⚠ BUILD files too large to cache (${(serialised.length / 1024 / 1024).toFixed(1)} MB) — if you refresh, re-run BUILD from the retry button`, 'warn')
      } else {
        sessionStorage.setItem('nexus-pipeline-build-files', serialised)
      }
    } catch {
      log('⚠ sessionStorage full — BUILD files not cached. Use retry if you need to refresh.', 'warn')
    }

    const fileCount = Object.keys(allFiles).length
    if (fileCount < 8) {
      setBuildWarning(`BUILD produced only ${fileCount} file${fileCount === 1 ? '' : 's'} — missing critical files will be auto-injected during deploy.`)
      log(`⚠ Only ${fileCount} files generated — vercel-app route will inject missing critical files`, 'warn')
      announce(`BUILD complete. ${fileCount} files generated and repaired. Moving to deployment now.`)
    } else {
      log(`BUILD complete — ${fileCount} files generated`, 'ok')
      announce(`BUILD complete. ${fileCount} production-ready files generated. Pushing to GitHub and deploying to Vercel next.`)
    }
    // Drain TTS queue — all BUILD stage narration must finish before DEPLOY narration starts
    await waitForSpeech(12_000)

    patchStep('build', { status: 'done' })
    return allFiles
  }, [patchStep, log, callAgentStreaming, buildUserMessage, announce])

  // ── DEPLOY phase ─────────────────────────────────────────────────────────────

  const runDeploy = useCallback(async (
    forge: ForgeBuild,
    appFiles: Record<string, string>,
  ): Promise<DeployResult> => {
    patchStep('deploy', { status: 'running', error: undefined })
    setDeploySubStep(1)
    announce('DEPLOY phase started. Creating your private spec repository and public app repository on GitHub.')
    log('DEPLOY starting…')

    const slug = forge.projectName

    let specRepoUrl  = ''
    let appRepoUrl   = ''
    let proposalUrl  = ''
    let vercelImport = ''
    let deploymentId = ''
    let deployReady  = false

    // Re-verify tokens live (state may be stale if pipeline ran long)
    let liveGhOk     = ghOk
    let liveVercelOk = vercelOk
    let liveRenderOk = renderOk
    try {
      const [ghCheck, vCheck, rCheck] = await Promise.all([
        fetch('/api/deploy/github').then(r => r.json()).catch(() => ({ ok: false })),
        fetch('/api/deploy/vercel').then(r => r.json()).catch(() => ({ ok: false })),
        fetch('/api/deploy/render').then(r => r.json()).catch(() => ({ ok: false })),
      ])
      liveGhOk     = !!ghCheck.ok
      liveVercelOk = !!vCheck.ok
      liveRenderOk = !!rCheck.ok
      if (!liveGhOk)     log(`⚠ GitHub token check failed: ${ghCheck.error ?? 'invalid or expired'} — go to Export & Deploy to update it`, 'warn')
      if (!liveVercelOk) log(`⚠ Vercel token check failed: ${vCheck.error ?? 'invalid or expired'}`, 'warn')
      if (liveRenderOk)  log('✓ Render token valid — will use Render as deploy target', 'ok')
    } catch { /* non-fatal — use stale state */ }

    if (liveGhOk) {
      log('Pushing spec repo to GitHub…')
      try {
        const ghSpecRes = await fetch('/api/deploy/github', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoName:    `${slug}-spec`,
            files:       forge.files,
            isPrivate:   true,
            description: `${forge.projectName} spec — Generated by NEXUS OS FORGE`,
          }),
          signal: abortRef.current?.signal,
        })
        const ghSpecData = await ghSpecRes.json()
        if (ghSpecData.ok) {
          specRepoUrl  = ghSpecData.data.repoUrl
          vercelImport = ghSpecData.data.vercelImport
          log(`✓ Spec repo: ${specRepoUrl}`, 'ok')
        } else {
          log(`⚠ Spec repo failed: ${ghSpecData.error}`, 'warn')
        }
      } catch (e) {
        const msg = (e as Error).message
        if (msg === 'Pipeline cancelled') throw e
        log(`⚠ Spec repo error: ${msg}`, 'warn')
      }

      if (Object.keys(appFiles).length > 0) {
        setDeploySubStep(2)
        announce('Application code pushed to GitHub. Creating the Vercel project and triggering the build.')
        log('Pushing app repo to GitHub…')
        try {
          const ghAppRes = await fetch('/api/deploy/github', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              repoName:    `${slug}-app`,
              files:       appFiles,
              isPrivate:   false,
              description: `${forge.projectName} — Generated by NEXUS OS BUILD ENGINE`,
            }),
            signal: abortRef.current?.signal,
          })
          const ghAppData = await ghAppRes.json()
          if (ghAppData.ok) {
            appRepoUrl   = ghAppData.data.repoUrl
            vercelImport = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(appRepoUrl)}&project-name=${slug}`
            log(`✓ App repo: ${appRepoUrl}`, 'ok')
          } else {
            log(`⚠ App repo failed: ${ghAppData.error}`, 'warn')
          }
        } catch (e) {
          const msg = (e as Error).message
          if (msg === 'Pipeline cancelled') throw e
          log(`⚠ App repo error: ${msg}`, 'warn')
        }
      }
    } else {
      log('⚠ GitHub token not configured — skipping repo creation', 'warn')
    }

    if (liveVercelOk && Object.keys(appFiles).length > 0) {
      setDeploySubStep(3)
      announce('Deploying to Vercel. Next.js build starting.')
      log('Deploying app to Vercel (Next.js build)…')
      try {
        const vRes = await fetch('/api/deploy/vercel-app', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: slug, files: appFiles }),
          signal: abortRef.current?.signal,
        })
        const vData = await vRes.json()
        if (vData.ok) {
          proposalUrl  = vData.data.deployUrl ?? ''
          deploymentId = typeof vData.data.deploymentId === 'string' && vData.data.deploymentId
            ? vData.data.deploymentId : ''
          deployReady  = vData.data.ready === true
          vercelImport = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(appRepoUrl || specRepoUrl)}&project-name=${slug}`
          log(`✓ App deploying: ${proposalUrl} — ${vData.data.state}`, 'ok')
          setDeploySubStep(deployReady ? 5 : 4)
          if (deployReady) {
            announce('Your app is live on Vercel right now. The entire pipeline is complete.')
          } else {
            announce('Vercel is building your app right now. You will be notified the moment it goes live.')
          }
          log(deployReady ? 'App is live!' : 'App is building on Vercel — adaptive polling (5s → 10s → 15s)', 'ok')
        } else {
          if (appRepoUrl) {
            vercelImport = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(appRepoUrl)}&project-name=${slug}`
          }
          log(`⚠ Vercel deploy failed: ${vData.error}`, 'warn')
          log('→ Go to Export & Deploy page to check your Vercel token, then use the manual deploy button', 'warn')
        }
      } catch (e) {
        const msg = (e as Error).message
        if (msg === 'Pipeline cancelled') throw e
        log(`⚠ Vercel error: ${msg}`, 'warn')
        log('→ Go to Export & Deploy page to check your Vercel token', 'warn')
      }
    } else if (!liveVercelOk) {
      log('⚠ Vercel token invalid or expired — trying Railway fallback…', 'warn')
    }

    // ── Render fallback: deploy if Vercel didn't produce a live URL ──────────
    if (!proposalUrl && appRepoUrl && liveRenderOk) {
      setDeploySubStep(3)
      announce('Vercel is unavailable. Switching to Render deployment. Your app will be live in moments.')
      log('Deploying to Render (fallback)…')
      try {
        const rRes = await fetch('/api/deploy/render', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ projectName: slug, repoUrl: appRepoUrl }),
          signal:  abortRef.current?.signal,
        })
        const rData = await rRes.json()
        if (rData.ok) {
          proposalUrl = rData.data.deployUrl ?? ''
          deployReady = false
          log(`✓ Render deploy started: ${proposalUrl} — ${rData.data.state}`, 'ok')
          log(`   Dashboard: ${rData.data.dashboardUrl}`, 'ok')
          announce(`Render deployment is live. Your app is building now at ${proposalUrl.replace('https://', '')}`)
          setDeploySubStep(5)
        } else {
          log(`⚠ Render deploy failed: ${rData.error}`, 'warn')
          if (appRepoUrl) {
            vercelImport = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(appRepoUrl)}&project-name=${slug}`
          }
        }
      } catch (e) {
        const msg = (e as Error).message
        if (msg === 'Pipeline cancelled') throw e
        log(`⚠ Render error: ${msg}`, 'warn')
        if (appRepoUrl) {
          vercelImport = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(appRepoUrl)}&project-name=${slug}`
        }
      }
    }

    // Advance sub-step to 5 if no Vercel polling is pending (no deploymentId, or already ready).
    // This prevents the DeploySubGrid from staying stuck at step 1–3 when tokens are absent.
    if (deployReady || !deploymentId) {
      setDeploySubStep(5)
    }
    const result: DeployResult = { specRepoUrl, appRepoUrl, proposalUrl, vercelImport, deploymentId: deploymentId || undefined, deployReady }
    patchStep('deploy', { status: 'done' })
    log('DEPLOY complete', 'ok')
    return result
  }, [patchStep, log, ghOk, vercelOk, renderOk, announce])

  // ── G2: Save run to DB ─────────────────────────────────────────────────────

  const saveRunToDB = useCallback(async (
    forge: ForgeBuild,
    result: DeployResult,
    status: 'COMPLETE' | 'ERROR' | 'CANCELLED',
    fileCount: number,
  ) => {
    try {
      await fetch('/api/executions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input:            forge.brief,
          client:           forge.projectName,
          phases:           ['forge', 'build', 'deploy'],
          tokens:           totalTokensRef.current,
          calls:            totalCallsRef.current,
          score:            forge.score,
          passed:           forge.score !== null ? forge.score >= 7 : null,
          status,
          files:            fileCount,
          causalMechanism:  `One-Click Pipeline run for project "${forge.projectName}" — brief-to-live-URL delivery`,
          irreversible:     false,
        }),
      })
      // G5: increment Upstash quota counter (server-side source of truth)
      if (status === 'COMPLETE') {
        try {
          await fetch('/api/quota', { method: 'POST' })
          setRunsUsed(prev => (prev !== null ? prev + 1 : 1))
        } catch { /* non-critical */ }
      }
    } catch { /* non-critical — don't surface to user */ }
  }, [])

  // ── G10: Send post-run email ───────────────────────────────────────────────

  const sendCompletionEmail = useCallback(async (
    forge: ForgeBuild,
    result: DeployResult,
  ) => {
    if (!userEmail) return
    try {
      const emailRes = await fetch('/api/pipeline/complete-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:          userEmail,
          name:        userName || userEmail.split('@')[0],
          projectName: forge.projectName,
          brief:       forge.brief,
          score:       forge.score,
          liveUrl:     result.proposalUrl,
          specRepoUrl: result.specRepoUrl,
          appRepoUrl:  result.appRepoUrl,
        }),
      })
      if (emailRes.ok) {
        log(`✉ Completion email sent to ${userEmail}`, 'info')
      } else {
        log(`⚠ Completion email failed (${emailRes.status})`, 'warn')
      }
    } catch (err) {
      log(`⚠ Completion email error: ${(err as Error).message?.slice(0, 80)}`, 'warn')
    }
  }, [userEmail, userName, log])

  // ── Full pipeline ─────────────────────────────────────────────────────────────

  const runPipeline = useCallback(async () => {
    if (!briefOk) return

    // G3: check quota before starting
    const limit = PLAN_RUN_LIMITS[sessionPlan] ?? PLAN_RUN_LIMITS.free
    if (isFinite(limit) && runsUsed !== null && runsUsed >= limit) {
      setShowUpgrade(true)
      return
    }

    // G1: create fresh AbortController for this run
    abortRef.current    = new AbortController()
    totalTokensRef.current = 0
    totalCallsRef.current  = 0
    pipelineStartRef.current = Date.now()

    announce('Pipeline launched. Twenty-one AI specialists are now building your product from scratch.')
    setPhase('running')
    setLogLines([])
    setStreamingOutput('')
    setForgeQaScore(null)
    setFinalElapsedSec(0)
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: 'pending' as StepStatus })))
    setForgeActiveAgents(new Set())
    setForgeDoneAgents(new Set())
    setBuildActiveAgents(new Set())
    setBuildDoneAgents(new Set())
    setBuildStage(0)
    setBuildWarning(null)
    setDeployResult(null)
    forgeContentRef.current = {}
    buildFilesRef.current   = {}
    forgeSpecRef.current    = null

    try {
      const forge    = await runForge(sanitiseBrief(brief), sanitiseBrief(clientName))
      const appFiles = await runBuild(forge)
      const result   = await runDeploy(forge, appFiles)
      setDeployResult(result)
      const finalElapsed = Math.floor((Date.now() - pipelineStartRef.current) / 1000)
      setFinalElapsedSec(finalElapsed)
      setPhase('done')

      // Celebration announcement
      const projectLabel = forge.projectName.replace(/-/g, ' ')
      const elapsedMsg   = finalElapsed >= 60
        ? `${Math.floor(finalElapsed / 60)} minutes and ${finalElapsed % 60} seconds`
        : `${finalElapsed} seconds`
      announce(
        `Pipeline complete. ${projectLabel} is now live on the internet. Twenty-one AI agents took your brief to a working app in ${elapsedMsg}. Your live URL is ready below.`,
        { rate: 0.92, pitch: 1.02, priority: 'high' },
      )

      // G2: save successful run + increment server-side Upstash quota
      await saveRunToDB(forge, result, 'COMPLETE', Object.keys(appFiles).length)

      // G7: clear the cached spec and build files — run is done
      try { sessionStorage.removeItem('nexus-pipeline-forge-spec') } catch { /* ignore */ }
      try { sessionStorage.removeItem('nexus-pipeline-build-files') } catch { /* ignore */ }

      // G10: send completion email (fire-and-forget)
      void sendCompletionEmail(forge, result)

    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'Pipeline cancelled') {
        // Already handled by cancelPipeline()
        return
      }
      log(`Pipeline error: ${msg}`, 'err')
      setPhase('input')
      setSteps(ss => ss.map(s => s.status === 'running' ? { ...s, status: 'error', error: msg } : s))

      // G2: save failed run if we got far enough to have a forge spec
      if (forgeSpecRef.current) {
        await saveRunToDB(forgeSpecRef.current, { specRepoUrl: '', appRepoUrl: '', proposalUrl: '', vercelImport: '', deployReady: false }, 'ERROR', Object.keys(buildFilesRef.current).length)
      }
    }
  }, [briefOk, sessionPlan, runsUsed, brief, clientName, runForge, runBuild, runDeploy, log, saveRunToDB, sendCompletionEmail, announce])

  // Retry individual step
  const retryStep = useCallback(async (stepId: string) => {
    const forge = forgeSpecRef.current
    abortRef.current = new AbortController()
    pipelineStartRef.current = Date.now()
    setFinalElapsedSec(0)

    // Reset current + downstream steps, clear QA score on forge retry
    setSteps(ss => ss.map(s => {
      const stepOrder = ['forge', 'build', 'deploy']
      const retryIdx  = stepOrder.indexOf(stepId)
      const thisIdx   = stepOrder.indexOf(s.id)
      return thisIdx >= retryIdx ? { ...s, status: 'pending' as StepStatus, error: undefined } : s
    }))
    if (stepId === 'forge') setForgeQaScore(null)

    try {
      if (stepId === 'forge') {
        setForgeDoneAgents(new Set())
        setForgeActiveAgents(new Set())
        setBuildActiveAgents(new Set())
        setBuildDoneAgents(new Set())
        setBuildStage(0)
        setBuildWarning(null)
        const newForge = await runForge(sanitiseBrief(brief), sanitiseBrief(clientName))
        const appFiles = await runBuild(newForge)
        const result   = await runDeploy(newForge, appFiles)
        setDeployResult(result)
        setFinalElapsedSec(Math.floor((Date.now() - pipelineStartRef.current) / 1000))
        setPhase('done')
        await saveRunToDB(newForge, result, 'COMPLETE', Object.keys(appFiles).length)
        void sendCompletionEmail(newForge, result)
      } else if (stepId === 'build' && forge) {
        setBuildActiveAgents(new Set())
        setBuildDoneAgents(new Set())
        setBuildStage(0)
        setBuildWarning(null)
        const appFiles = await runBuild(forge)
        const result   = await runDeploy(forge, appFiles)
        setDeployResult(result)
        setFinalElapsedSec(Math.floor((Date.now() - pipelineStartRef.current) / 1000))
        setPhase('done')
        await saveRunToDB(forge, result, 'COMPLETE', Object.keys(appFiles).length)
        void sendCompletionEmail(forge, result)
      } else if (stepId === 'deploy' && forge) {
        const appFiles = buildFilesRef.current
        const result   = await runDeploy(forge, appFiles)
        setDeployResult(result)
        setFinalElapsedSec(Math.floor((Date.now() - pipelineStartRef.current) / 1000))
        setPhase('done')
        await saveRunToDB(forge, result, 'COMPLETE', Object.keys(appFiles).length)
        void sendCompletionEmail(forge, result)
      }
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'Pipeline cancelled') return
      log(`Retry error: ${msg}`, 'err')
      setSteps(ss => ss.map(s => s.id === stepId ? { ...s, status: 'error', error: msg } : s))
    }
  }, [brief, clientName, runForge, runBuild, runDeploy, log, saveRunToDB, sendCompletionEmail])

  // Keep ref in sync so voice command handler always calls the latest runPipeline closure
  runPipelineRef.current = runPipeline

  const isRunning = phase === 'running'

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center py-12 px-4">
      {/* G3: upgrade modal */}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}

      {/* Brief templates */}
      {showTemplates && (
        <BriefTemplatesModal
          onClose={() => setShowTemplates(false)}
          onSelect={(t, c) => { setBrief(t); setClientName(c) }}
        />
      )}

      {/* Generated files viewer */}
      {showFilesView && Object.keys(buildFilesRef.current).length > 0 && (
        <FilesViewerModal
          files={buildFilesRef.current}
          onClose={() => setShowFilesView(false)}
        />
      )}

      {/* Confirm pipeline reset */}
      {showConfirmReset && (
        <ConfirmResetModal
          onCancel={() => setShowConfirmReset(false)}
          onConfirm={() => {
            setShowConfirmReset(false)
            setPhase('input')
            setSteps(INITIAL_STEPS.map(s => ({ ...s, status: 'pending' as StepStatus })))
            setLogLines([])
            setDeployResult(null)
            setForgeDoneAgents(new Set())
            setBuildDoneAgents(new Set())
            setBuildStage(0)
            setBuildWarning(null)
            try { sessionStorage.removeItem('nexus-pipeline-forge-spec') } catch { /* ignore */ }
            try { sessionStorage.removeItem('nexus-pipeline-build-files') } catch { /* ignore */ }
          }}
        />
      )}

      <div className="w-full max-w-[700px] space-y-6">

        {/* ── Header ── */}
        <div className="text-center space-y-4">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#c8f23c]/30 bg-[#c8f23c]/5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c8f23c] animate-pulse" />
            <p className="text-[10px] font-black font-mono tracking-[0.16em] text-ink2 uppercase">One-Click Pipeline</p>
          </div>

          <h1 className="text-4xl font-black tracking-tight text-ink leading-tight" style={{ fontFamily: 'var(--ff-d, inherit)' }}>
            Brief → FORGE → BUILD →{' '}
            <span style={{ color: '#c8f23c' }}>Live URL</span>
          </h1>
          <p className="text-sm text-ink3 leading-relaxed max-w-lg mx-auto">
            21 AI agents run fully autonomously — product spec, code generation, and Vercel deploy in one shot. No manual steps.
          </p>

          {/* Phase breakdown */}
          <div className="flex items-stretch justify-center gap-0 mt-2">
            {[
              { label: 'FORGE',  count: '11 agents', detail: 'Spec · GTM · Revenue', color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200' },
              { label: 'BUILD',  count: '10 agents', detail: 'Next.js · Code · Test', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
              { label: 'DEPLOY', count: '5 steps',   detail: 'GitHub · Vercel · Live', color: 'text-[#5a6e00]', bg: 'bg-[#c8f23c]/10 border-[#c8f23c]/40' },
            ].map((p, i) => (
              <div key={p.label} className="flex items-center">
                <div className={`border rounded-xl px-4 py-2.5 text-center min-w-[100px] ${p.bg}`}>
                  <p className={`text-[10px] font-black font-mono tracking-widest uppercase ${p.color}`}>{p.label}</p>
                  <p className="text-[11px] font-bold text-ink mt-0.5">{p.count}</p>
                  <p className="text-[9px] text-ink3 mt-0.5">{p.detail}</p>
                </div>
                {i < 2 && (
                  <div className="px-2 text-ink3 font-bold text-sm">→</div>
                )}
              </div>
            ))}
          </div>

          {/* Trust bar */}
          <div className="flex items-center justify-center gap-6 pt-1">
            {[
              { val: '4–8 min', label: 'Brief to live URL' },
              { val: '21', label: 'AI specialists' },
              { val: '100%', label: 'Autonomous' },
            ].map(({ val, label }) => (
              <div key={label} className="text-center">
                <p className="text-sm font-black text-ink">{val}</p>
                <p className="text-[10px] text-ink3">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Token warning */}
        {!tokenChecked
          ? <div className="h-10 rounded-xl bg-paper3 border border-border/40 animate-pulse" aria-hidden />
          : <TokenWarning ghOk={ghOk} vercelOk={vercelOk} />
        }

        {/* ── Input card ── */}
        {phase === 'input' && (
          <div className="border border-border rounded-2xl bg-paper p-7 space-y-5 shadow-[0_4px_32px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Step 1 of 1</p>
                <p className="text-base font-black text-ink mt-0.5">Project Brief</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowTemplates(true)}
                  className="text-[10px] font-bold font-mono px-2.5 py-1.5 rounded-lg border border-border bg-paper2 text-ink3 hover:border-[#c8f23c]/60 hover:text-ink hover:bg-[#c8f23c]/5 transition-all"
                >
                  ⚡ Templates
                </button>
                <RunsBadge plan={sessionPlan} runsUsed={runsUsed} />
                {prefilled && (
                  <span className="text-[9px] font-bold font-mono text-[#c8f23c] border border-[#c8f23c]/40 bg-[#c8f23c]/8 rounded-lg px-2 py-1">
                    ↑ from Trending
                  </span>
                )}
              </div>
            </div>

            <div className="relative">
              <VoiceTextarea
                value={brief}
                onChange={v => setBrief(v.slice(0, BRIEF_MAX))}
                placeholder="Describe what to build — or click the mic to dictate. Be specific: target market, core features, revenue model, tech stack preferences."
                rows={5}
                disabled={isRunning}
                label=""
              />
              <div className={`absolute bottom-2.5 right-3 text-[9px] font-mono tabular-nums select-none ${
                brief.length > BRIEF_MAX * 0.9 ? 'text-amber-500' : 'text-ink3/40'
              }`}>
                {brief.length}/{BRIEF_MAX}
              </div>
            </div>

            {briefTooShort && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-amber-300 bg-amber-50">
                <span className="text-amber-500 flex-shrink-0">⚠</span>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  Add {BRIEF_MIN - brief.trim().length} more chars — include target market, core features, and revenue model for best results.
                </p>
              </div>
            )}

            <input
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Client / project name (optional — e.g. Acme CRM)"
              className="w-full px-4 py-3 rounded-xl text-sm border border-border bg-paper2 outline-none focus:border-[#c8f23c] focus:shadow-[0_0_0_3px_rgba(200,242,60,0.15)] text-ink placeholder:text-ink3 transition-all"
              disabled={isRunning}
            />
            {(() => {
              if (!clientName.trim()) return null
              const slug = clientName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 52)
              const changed = slug !== clientName.trim().toLowerCase()
              if (!changed) return null
              return (
                <p className="text-[10px] text-ink3 font-mono px-1">
                  Repo slug: <span className="text-ink2 font-bold">{slug}</span>
                </p>
              )
            })()}

            <div className="flex items-center justify-between text-[10px] text-ink3 font-mono px-0.5">
              <span>
                Est. time: <span className="text-ink2 font-bold">{etaDisplay}</span>
              </span>
              {(sessionPlan === 'free' || sessionPlan === 'starter') && (
                <span className="text-ink3/70">Add Anthropic key for faster runs</span>
              )}
            </div>

            <button
              onClick={runPipeline}
              disabled={!briefOk || isRunning}
              className={`w-full py-4 rounded-xl text-sm font-black tracking-wide transition-all flex items-center justify-center gap-2.5 ${
                briefOk && !isRunning
                  ? 'bg-[#c8f23c] text-black hover:bg-[#d4f74a] shadow-[0_0_28px_4px_rgba(200,242,60,0.35)] hover:shadow-[0_0_36px_6px_rgba(200,242,60,0.45)] hover:scale-[1.01] active:scale-[0.99]'
                  : 'bg-paper3 text-ink3/50 cursor-not-allowed border border-border'
              }`}
            >
              {briefOk ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                  LAUNCH PIPELINE
                </>
              ) : (
                'Add brief to launch →'
              )}
            </button>

            <PipelineVoiceBar
              phase="input"
              isListening={pipelineVoice.isListening}
              lastText={lastVoiceText}
              interim={pipelineVoice.interimTranscript}
              error={pipelineVoice.error}
              onToggle={pipelineVoice.toggle}
              onClearError={pipelineVoice.clear}
              isSupported={pipelineVoice.isSupported}
            />
          </div>
        )}

        {/* ── Pipeline progress card ── */}
        {(phase === 'running' || phase === 'done') && (
          <div className="border border-border rounded-2xl bg-paper overflow-hidden shadow-[0_4px_32px_rgba(0,0,0,0.06)]">

            {/* Progress header */}
            {phase === 'running' && (
              <div className="px-6 pt-6 pb-5 border-b border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#c8f23c] animate-pulse flex-shrink-0" />
                    <span className="text-sm font-black text-ink">Pipeline running</span>
                    <span className="text-[9px] font-mono text-ink3 bg-paper2 border border-border rounded px-2 py-0.5">⏱ {elapsedDisplay}</span>
                  </div>
                  <button
                    onClick={cancelPipeline}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-[10px] font-black hover:bg-red-100 hover:border-red-300 transition-all"
                    title="Cancel pipeline"
                  >
                    ■ STOP
                  </button>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-ink3">
                      {doneAgents} / {TOTAL_AGENTS} agents
                      {buildStage > 0 && buildStage < 5 && (
                        <span className="ml-1.5 text-[#c8f23c]/80">· BUILD stage {buildStage}/5</span>
                      )}
                    </span>
                    <span className="text-[10px] font-black font-mono text-[#c8f23c]">{progressPct}%</span>
                  </div>
                  <div className="w-full h-2 bg-border/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#c8f23c] rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_2px_rgba(200,242,60,0.5)]"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {forgeQaScore !== null && (
                    <p className={`text-[10px] font-mono font-bold ${forgeQaScore >= 7 ? 'text-green-600' : 'text-amber-600'}`}>
                      FORGE QA Score: {forgeQaScore.toFixed(1)}/10 {forgeQaScore >= 7 ? '✓ Excellent' : '⚠ Review needed'}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="p-6 space-y-6">
              {/* Brief recap */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-paper2 border border-border/60">
                <span className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase pt-0.5 flex-shrink-0">Brief</span>
                <p className="text-xs text-ink leading-relaxed">{brief.slice(0, 140)}{brief.length > 140 ? '…' : ''}</p>
              </div>

              {/* Steps */}
              <div>
                {steps.map((step, i) => (
                  <div key={step.id}>
                    <StepRow
                      step={step}
                      n={i + 2}
                      isLast={i === steps.length - 1}
                      onRetry={step.status === 'error' ? () => retryStep(step.id) : undefined}
                    />
                    {step.id === 'forge' && (step.status === 'running' || step.status === 'done') && (
                      <div className="-mt-5 mb-6 ml-[52px]">
                        <AgentGrid
                          agents={FORGE_AGENTS}
                          activeIds={forgeActiveAgents}
                          doneIds={forgeDoneAgents}
                          label="FORGE agents — 11 specialists"
                        />
                      </div>
                    )}
                    {step.id === 'build' && (step.status === 'running' || step.status === 'done') && (
                      <div className="-mt-5 mb-6 ml-[52px] space-y-2">
                        <AgentGrid
                          agents={BUILD_AGENTS}
                          activeIds={buildActiveAgents}
                          doneIds={buildDoneAgents}
                          label="BUILD agents — 10 specialists"
                        />
                        {buildWarning && step.status === 'done' && (
                          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/8 text-amber-400 text-[10px] font-mono leading-relaxed">
                            <span className="shrink-0 mt-0.5">⚠</span>
                            <span>{buildWarning}</span>
                          </div>
                        )}
                        {step.status === 'done' && Object.keys(buildFilesRef.current).length > 0 && (
                          <button
                            onClick={() => setShowFilesView(true)}
                            className="text-[10px] font-bold font-mono px-3 py-1.5 rounded-lg border border-border bg-paper2 text-ink3 hover:border-[#c8f23c]/60 hover:text-ink hover:bg-[#c8f23c]/5 transition-all"
                          >
                            ◈ View {Object.keys(buildFilesRef.current).length} generated files →
                          </button>
                        )}
                      </div>
                    )}
                    {step.id === 'deploy' && (step.status === 'running' || step.status === 'done') && deploySubStep > 0 && (
                      <div className="-mt-5 mb-6 ml-[52px]">
                        <DeploySubGrid currentStep={deploySubStep} />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Live streaming output */}
              {streamingOutput && (
                <div className="rounded-xl border border-ink/15 bg-ink overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-ink/15">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500/60" />
                      <span className="w-2 h-2 rounded-full bg-amber-500/60" />
                      <span className="w-2 h-2 rounded-full bg-green-500/60" />
                    </div>
                    <p className="text-[9px] font-black font-mono tracking-widest text-[#c8f23c]/50 uppercase">Live agent output</p>
                  </div>
                  <div className="p-3 max-h-[100px] overflow-hidden">
                    <p className="font-mono text-[10px] text-[#c8f23c]/80 leading-relaxed whitespace-pre-wrap">{streamingOutput}
                      <span className="inline-block w-1.5 h-3.5 bg-[#c8f23c]/70 ml-0.5 animate-[pulse_0.6s_ease-in-out_infinite] align-middle" />
                    </p>
                  </div>
                </div>
              )}

              {/* Voice bar */}
              <PipelineVoiceBar
                phase={phase}
                isListening={pipelineVoice.isListening}
                lastText={lastVoiceText}
                interim={pipelineVoice.interimTranscript}
                error={pipelineVoice.error}
                onToggle={pipelineVoice.toggle}
                onClearError={pipelineVoice.clear}
                isSupported={pipelineVoice.isSupported}
              />

              <LogBox lines={logLines} />
            </div>
          </div>
        )}

        {/* G9: Share card — shows if we have any URL (live or repo) */}
        {phase === 'done' && (deployResult?.proposalUrl || deployResult?.appRepoUrl) && (
          <ResultShareCard
            projectName={forgeSpecRef.current?.projectName ?? 'nexus-app'}
            qaScore={forgeQaScore}
            liveUrl={deployResult.proposalUrl}
            appRepoUrl={deployResult.appRepoUrl}
          />
        )}

        {/* Done card */}
        {phase === 'done' && deployResult && (
          <>
            <DoneCard result={deployResult} elapsedSec={finalElapsedSec || undefined} />
            {Object.keys(buildFilesRef.current).length > 0 && (
              <button
                onClick={() => setShowFilesView(true)}
                className="w-full py-3 rounded-xl border border-border bg-paper2 text-xs font-bold text-ink3 hover:border-[#c8f23c]/60 hover:text-ink hover:bg-[#c8f23c]/5 transition-all"
              >
                ◈ Inspect {Object.keys(buildFilesRef.current).length} generated source files →
              </button>
            )}
          </>
        )}

        {/* Done — restart */}
        {phase === 'done' && (
          <div className="text-center">
            <button
              onClick={() => setShowConfirmReset(true)}
              className="text-sm text-ink3 hover:text-ink underline transition-colors"
            >
              ← Start new pipeline
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
