'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ClientBrief } from '@/app/api/client-autopilot/stream/route'

// ─── Pipeline steps ───────────────────────────────────────────────────────────

const PIPELINE = [
  { id: 'scout',     label: 'Market Analysis',     icon: '01', what: 'Understanding the landscape & competitors'  },
  { id: 'analyst',   label: 'Risk Assessment',      icon: '02', what: 'Rating assumptions & identifying unknowns'  },
  { id: 'architect', label: 'System Design',        icon: '03', what: 'Technical architecture & database schema'   },
  { id: 'planner',   label: 'Feature Specs',        icon: '04', what: 'Writing buildable feature specifications'   },
  { id: 'qa',        label: 'Delivery Review',      icon: '05', what: 'Scoring completeness & approving to build'  },
  { id: 'proposal',  label: 'Client Proposal',      icon: '06', what: 'Generating the client-ready proposal doc'   },
]

const EMPTY: ClientBrief = {
  clientName: '', clientCompany: '', clientEmail: '',
  problem: '', targetUsers: '', coreFeatures: '',
  techStack: '', budget: '', timeline: '', specialReqs: '',
}

// ─── Document renderers ───────────────────────────────────────────────────────

// Parses ALL_CAPS section headers and bullet lists into formatted HTML sections
function DocSection({ title, content, accent }: { title: string; content: string; accent?: string }) {
  const lines = content.split('\n').filter(l => l.trim())
  return (
    <div className="space-y-2">
      {title && (
        <p className={`text-[10px] font-black font-mono tracking-widest uppercase ${accent ?? 'text-ink3'}`}>
          {title}
        </p>
      )}
      <div className="space-y-1.5">
        {lines.map((line, i) => {
          const trimmed = line.trim()
          if (!trimmed) return null
          // Bullet point
          if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
            const text = trimmed.slice(2)
            const isSolid    = text.includes('[SOLID]')
            const isAtRisk   = text.includes('[AT RISK]')
            const cleanText  = text.replace('[SOLID]', '').replace('[AT RISK]', '').trim()
            return (
              <div key={i} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ink3/50 flex-shrink-0 mt-1.5" />
                <span className="text-sm text-ink2 leading-relaxed flex-1">
                  {cleanText}
                  {isSolid   && <span className="ml-2 text-[9px] font-bold font-mono tracking-wider text-ink2 border border-border rounded px-1.5 py-0.5">SOLID</span>}
                  {isAtRisk  && <span className="ml-2 text-[9px] font-bold font-mono tracking-wider text-ink3 border border-border rounded px-1.5 py-0.5">AT RISK</span>}
                </span>
              </div>
            )
          }
          // Phase line (Timeline)
          if (trimmed.startsWith('Phase ')) {
            const parts = trimmed.split('—').map(p => p.trim())
            return (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                <span className="text-[11px] font-mono text-ink3 flex-shrink-0 w-6">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">{parts[0]?.replace(/^Phase \d+ — /, '')}</p>
                  {parts[1] && <p className="text-[11px] text-ink3 mt-0.5">{parts[1]}</p>}
                  {parts[2] && <p className="text-[11px] text-ink3">{parts[2]}</p>}
                </div>
              </div>
            )
          }
          // Numbered item
          if (/^\d+\./.test(trimmed)) {
            const text = trimmed.replace(/^\d+\.\s*/, '')
            return (
              <div key={i} className="flex items-start gap-2.5">
                <span className="w-4 h-4 rounded border border-border text-[9px] font-bold font-mono text-ink3 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {trimmed.match(/^(\d+)/)?.[1]}
                </span>
                <span className="text-sm text-ink2 leading-relaxed flex-1">{text}</span>
              </div>
            )
          }
          // Regular paragraph
          return (
            <p key={i} className="text-sm text-ink2 leading-relaxed">{trimmed}</p>
          )
        })}
      </div>
    </div>
  )
}

// Parses the proposal output into structured sections
function ProposalDocument({ text, brief }: { text: string; brief: ClientBrief }) {
  const sections = parseAllCapsSections(text)

  return (
    <div className="space-y-0">
      {/* Cover */}
      <div className="border border-border rounded-2xl p-6 mb-4 bg-paper">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono text-ink3 uppercase tracking-widest mb-2">Project Proposal</p>
            <h2 className="text-xl font-bold text-ink">{brief.clientCompany}</h2>
            <p className="text-sm text-ink3 mt-1">{brief.clientName}{brief.clientEmail ? ` · ${brief.clientEmail}` : ''}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] font-mono text-ink3 uppercase tracking-widest">Prepared by</p>
            <p className="text-sm font-semibold text-ink mt-0.5">NEXUS OS</p>
            <p className="text-[10px] text-ink3">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        {sections['EXECUTIVE SUMMARY'] && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm text-ink2 leading-relaxed">{sections['EXECUTIVE SUMMARY']}</p>
          </div>
        )}
      </div>

      {/* Deliverables */}
      {sections['WHAT WE WILL BUILD'] && (
        <div className="border border-border rounded-2xl p-5 mb-3 bg-paper">
          <DocSection title="What we will build" content={sections['WHAT WE WILL BUILD']} />
        </div>
      )}

      {/* How we work */}
      {sections['HOW WE WORK'] && (
        <div className="border border-border rounded-2xl p-5 mb-3 bg-paper">
          <DocSection title="How we work" content={sections['HOW WE WORK']} />
        </div>
      )}

      {/* Timeline + Investment side by side */}
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        {sections['TIMELINE'] && (
          <div className="border border-border rounded-2xl p-5 bg-paper">
            <p className="text-[10px] font-black font-mono tracking-widest uppercase text-ink3 mb-3">Timeline</p>
            <div className="space-y-0">
              {sections['TIMELINE'].split('\n').filter(l => l.trim().startsWith('Phase')).map((line, i) => {
                const parts = line.split('—').map(p => p.trim())
                return (
                  <div key={i} className={`flex items-start gap-3 py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                    <div className="w-5 h-5 rounded-lg border border-border bg-paper2 flex items-center justify-center text-[9px] font-black font-mono text-ink3 flex-shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-ink">{parts[0]?.replace(/^Phase \d+ — /, '')}</p>
                      {parts[1] && <p className="text-[10px] text-ink3 mt-0.5">{parts[1]}</p>}
                      {parts[2] && <p className="text-[10px] text-ink3">{parts[2]}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {sections['INVESTMENT'] && (
          <div className="border border-border rounded-2xl p-5 bg-paper">
            <p className="text-[10px] font-black font-mono tracking-widest uppercase text-ink3 mb-3">Investment</p>
            <div className="space-y-2">
              {sections['INVESTMENT'].split('\n').filter(l => l.trim()).map((line, i) => {
                const trimmed = line.trim()
                if (trimmed.startsWith('- ')) {
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-1 h-1 rounded-full bg-ink3/50 flex-shrink-0 mt-2" />
                      <p className="text-xs text-ink3">{trimmed.slice(2)}</p>
                    </div>
                  )
                }
                return (
                  <p key={i} className="text-sm text-ink2 font-medium">{trimmed}</p>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Next step CTA */}
      {sections['NEXT STEP'] && (
        <div className="border border-border rounded-2xl p-5 bg-paper2/40">
          <p className="text-[10px] font-black font-mono tracking-widest uppercase text-ink3 mb-2">Next step</p>
          <p className="text-sm text-ink2 leading-relaxed">{sections['NEXT STEP']}</p>
        </div>
      )}
    </div>
  )
}

// Parses feature specs into cards
function FeatureCards({ plannerText, archText, qaText }: {
  plannerText: string; archText: string; qaText: string
}) {
  // Parse feature blocks
  const featureBlocks: { name: string; priority: string; story: string; criteria: string[]; effort: string }[] = []
  const lines = plannerText.split('\n')
  let current: typeof featureBlocks[0] | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('FEATURE:')) {
      if (current) featureBlocks.push(current)
      current = { name: trimmed.slice(8).trim(), priority: '', story: '', criteria: [], effort: '' }
    } else if (current) {
      if (trimmed.startsWith('PRIORITY:'))     current.priority = trimmed.slice(9).trim()
      else if (trimmed.startsWith('AS A '))    current.story    = trimmed
      else if (trimmed.startsWith('- '))       current.criteria.push(trimmed.slice(2))
      else if (trimmed.startsWith('EFFORT:'))  current.effort   = trimmed.slice(7).trim()
    }
  }
  if (current) featureBlocks.push(current)

  // QA score extraction
  const scoreMatch = qaText.match(/(\d+(?:\.\d+)?)\s*\/\s*10/)
  const score       = scoreMatch?.[1]
  const approved    = qaText.includes('APPROVED TO BUILD')
  const qaTotal     = plannerText.match(/TOTAL:\s*(.+)/i)?.[1]

  // Architecture sections
  const archSections = parseAllCapsSections(archText)

  return (
    <div className="space-y-6">
      {/* QA score banner */}
      {score && (
        <div className="border border-border rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-2xl font-black text-ink tabular-nums">{score}<span className="text-sm font-normal text-ink3">/10</span></p>
              <p className="text-[9px] font-mono text-ink3 uppercase tracking-widest">Delivery score</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <p className={`text-xs font-bold font-mono ${approved ? 'text-ink' : 'text-ink3'}`}>
                {approved ? '✓ APPROVED TO BUILD' : '○ NEEDS MORE CLARITY'}
              </p>
              <p className="text-[11px] text-ink3 mt-0.5">
                {featureBlocks.length} features · {qaTotal ?? ''}
              </p>
            </div>
          </div>
          <div className="w-32 h-2 bg-paper3 rounded-full overflow-hidden flex-shrink-0">
            <div
              className="h-2 bg-ink rounded-full transition-all"
              style={{ width: `${Math.min(100, (parseFloat(score) / 10) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Feature cards grid */}
      {featureBlocks.length > 0 && (
        <div>
          <p className="text-[10px] font-black font-mono tracking-widest uppercase text-ink3 mb-3">Feature Specifications</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {featureBlocks.map((f, i) => (
              <div key={i} className="border border-border rounded-2xl p-4 space-y-3 bg-paper">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-ink leading-tight">{f.name}</p>
                  <span className={`flex-shrink-0 text-[9px] font-black font-mono px-2 py-0.5 rounded border ${
                    f.priority.includes('P0')
                      ? 'border-ink/20 text-ink bg-ink/5'
                      : 'border-border text-ink3'
                  }`}>
                    {f.priority.includes('P0') ? 'P0 · CORE' : 'P1 · NEXT'}
                  </span>
                </div>

                {/* User story */}
                {f.story && (
                  <p className="text-[11px] text-ink3 leading-relaxed italic border-l-2 border-border pl-3">
                    {f.story}
                  </p>
                )}

                {/* Criteria */}
                {f.criteria.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-bold font-mono text-ink3 uppercase tracking-widest">Done when</p>
                    {f.criteria.map((c, ci) => (
                      <div key={ci} className="flex items-start gap-2">
                        <div className="w-3.5 h-3.5 rounded border border-border flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-ink2 leading-relaxed">{c}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Effort */}
                {f.effort && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-[10px] font-mono text-ink3">
                      <span className="font-bold text-ink2">{f.effort}</span> to build
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Architecture */}
      {archText && (
        <div>
          <p className="text-[10px] font-black font-mono tracking-widest uppercase text-ink3 mb-3">Technical Architecture</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {(['RECOMMENDED TECH STACK', 'HOW IT WORKS'] as const).map(key =>
              archSections[key] ? (
                <div key={key} className="border border-border rounded-2xl p-4 bg-paper">
                  <DocSection title={key.toLowerCase().replace(/ /g, ' ')} content={archSections[key]} />
                </div>
              ) : null
            )}
            {(['CORE COMPONENTS', 'DATABASE TABLES', 'CRITICAL API ENDPOINTS'] as const).map(key =>
              archSections[key] ? (
                <div key={key} className="border border-border rounded-2xl p-4 bg-paper">
                  <DocSection title={key.toLowerCase().replace(/_/g, ' ')} content={archSections[key]} />
                </div>
              ) : null
            )}
            {archSections['ESTIMATED BUILD TIME'] && (
              <div className="border border-border rounded-2xl p-4 bg-paper sm:col-span-2">
                <DocSection title="estimated build time" content={archSections['ESTIMATED BUILD TIME']} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* QA detail */}
      {qaText && (
        <div>
          <p className="text-[10px] font-black font-mono tracking-widest uppercase text-ink3 mb-3">Delivery Review Details</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {Object.entries(parseAllCapsSections(qaText))
              .filter(([k]) => k !== 'DELIVERY SCORE')
              .map(([key, val]) => (
                <div key={key} className="border border-border rounded-2xl p-4 bg-paper">
                  <DocSection title={key.toLowerCase()} content={val} />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Parses market analysis into clean insight cards
function AnalysisDocument({ scoutText, analystText }: { scoutText: string; analystText: string }) {
  const scoutSections  = parseAllCapsSections(scoutText)
  const analystSections = parseAllCapsSections(analystText)

  const confidence = analystText.match(/CONFIDENCE ASSESSMENT\s*\n(.*)/)?.[1]?.trim() ?? ''
  const decision   = analystText.match(/DECISION:\s*(GO|PAUSE|STOP)/)?.[1] ?? ''

  return (
    <div className="space-y-6">
      {/* Decision + Confidence banner */}
      {(decision || confidence) && (
        <div className="border border-border rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {decision && (
              <>
                <div className="text-center">
                  <p className={`text-lg font-black font-mono ${
                    decision === 'GO' ? 'text-ink' : decision === 'PAUSE' ? 'text-ink2' : 'text-ink3'
                  }`}>{decision}</p>
                  <p className="text-[9px] font-mono text-ink3 uppercase tracking-widest">Verdict</p>
                </div>
                <div className="w-px h-8 bg-border" />
              </>
            )}
            {confidence && (
              <p className="text-sm text-ink2 leading-relaxed max-w-sm">{confidence}</p>
            )}
          </div>
        </div>
      )}

      {/* Scout sections */}
      <div>
        <p className="text-[10px] font-black font-mono tracking-widest uppercase text-ink3 mb-3">Market Intelligence</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {Object.entries(scoutSections).map(([key, val]) => (
            <div key={key} className="border border-border rounded-2xl p-4 bg-paper">
              <DocSection title={key.toLowerCase()} content={val} />
            </div>
          ))}
        </div>
      </div>

      {/* Analyst sections */}
      <div>
        <p className="text-[10px] font-black font-mono tracking-widest uppercase text-ink3 mb-3">Risk Assessment</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {Object.entries(analystSections)
            .filter(([k]) => k !== 'CONFIDENCE ASSESSMENT')
            .map(([key, val]) => (
              <div key={key} className="border border-border rounded-2xl p-4 bg-paper">
                <DocSection title={key.toLowerCase()} content={val} />
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

// Splits text on ALL_CAPS section headers (e.g. "EXECUTIVE SUMMARY")
function parseAllCapsSections(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  const headerRegex = /^([A-Z][A-Z\s&']+[A-Z])$/m
  const lines = text.split('\n')
  let currentKey = ''
  let buf: string[] = []

  const flush = () => { if (currentKey && buf.join('').trim()) result[currentKey] = buf.join('\n').trim() }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 3 && trimmed.length < 60 && headerRegex.test(trimmed)) {
      flush()
      currentKey = trimmed
      buf = []
    } else {
      buf.push(line)
    }
  }
  flush()
  return result
}

// ─── Brief quality scoring ────────────────────────────────────────────────────

type FieldQuality = 'empty' | 'weak' | 'good'

function scoreProblem(v: string): FieldQuality {
  const t = v.trim()
  if (t.length < 20) return 'empty'
  // Patterns that are too vague to build from
  if (t.length < 80) return 'weak'
  const vague = /^(i want|we need|build|create|make|an app|a website|a platform)\b/i
  if (t.length < 120 && vague.test(t)) return 'weak'
  return 'good'
}

function scoreTargetUsers(v: string): FieldQuality {
  const t = v.trim()
  if (t.length < 10) return 'empty'
  const tooGeneric = /^(everyone|anyone|all users?|businesses?|companies|people|users?|customers?)\.?$/i
  if (tooGeneric.test(t) || t.length < 30) return 'weak'
  return 'good'
}

function scoreFeatures(v: string): FieldQuality {
  const lines = v.split('\n').map(l => l.trim()).filter(l => l.length > 10)
  if (lines.length === 0) return 'empty'
  if (lines.length < 3) return 'weak'
  return 'good'
}

function QualityDot({ q }: { q: FieldQuality }) {
  if (q === 'good') return <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink/50 ml-1.5 mb-px" title="Good" />
  if (q === 'weak') return <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink/20 border border-ink/30 ml-1.5 mb-px" title="Needs more detail" />
  return null
}

function FieldHint({ q, weak, empty }: { q: FieldQuality; weak: string; empty?: string }) {
  if (q === 'weak') return <p className="text-[10px] text-ink3 mt-1.5">[ needs more detail ] {weak}</p>
  if (q === 'empty' && empty) return <p className="text-[10px] text-ink3 mt-1.5">{empty}</p>
  return null
}

function SuggestionCard({ field, value, suggesting, onUse }: {
  field: string
  value: string | undefined
  suggesting: boolean
  onUse: (v: string) => void
}) {
  if (!suggesting && !value) return null
  return (
    <div className="mt-2 border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-paper2 border-b border-border">
        <span className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">AI suggestion</span>
        {suggesting && (
          <span className="flex gap-0.5">
            {[0,1,2].map(i => (
              <span key={i} className="w-1 h-1 rounded-full bg-ink3/40 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
        )}
      </div>
      {value && !suggesting && (
        <div className="px-3 py-2.5 space-y-2">
          <p className="text-[11px] text-ink2 leading-relaxed whitespace-pre-wrap">{value}</p>
          <button
            type="button"
            onClick={() => onUse(value)}
            className="text-[10px] font-bold font-mono text-ink border border-border rounded px-2.5 py-1 hover:bg-paper3 transition-colors"
          >
            Use this →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

function SectionCard({ n, title, subtitle, children }: {
  n: number; title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div className="border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-4 px-6 py-4 bg-paper2/60 border-b border-border">
        <span className="w-8 h-8 rounded-lg bg-paper3 border border-border flex items-center justify-center text-xs font-black font-mono text-ink2 flex-shrink-0">{n}</span>
        <div>
          <p className="text-sm font-bold text-ink">{title}</p>
          <p className="text-[11px] text-ink3 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-5">{children}</div>
    </div>
  )
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1 mb-2">
      <p className="text-xs font-semibold text-ink">{children}</p>
      {hint && <p className="text-[11px] text-ink3 leading-relaxed">{hint}</p>}
    </div>
  )
}

const inputCls = 'w-full bg-paper border border-border rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink3 focus:outline-none focus:border-ink2/50 focus:ring-2 focus:ring-ink/8 transition-all duration-150'

// ─── Output tabs ──────────────────────────────────────────────────────────────

const OUTPUT_TABS = [
  { key: 'proposal', label: 'Proposal',    steps: ['proposal']                         },
  { key: 'spec',     label: 'Spec & Build', steps: ['architect', 'planner', 'qa']      },
  { key: 'analysis', label: 'Analysis',    steps: ['scout', 'analyst']                 },
] as const

type OutputTab = typeof OUTPUT_TABS[number]['key']

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientDeliveryPage() {
  const [phase,      setPhase]      = useState<'form' | 'running' | 'done'>('form')
  const [brief,      setBrief]      = useState<ClientBrief>(EMPTY)
  const [activeStep, setActiveStep] = useState<string | null>(null)
  const [doneSteps,  setDoneSteps]  = useState<Set<string>>(new Set())
  const [outputs,    setOutputs]    = useState<Record<string, string>>({})
  const [activeTab,  setActiveTab]  = useState<OutputTab>('proposal')
  const [error,      setError]      = useState('')
  const [sending,    setSending]    = useState(false)
  const [emailSent,  setEmailSent]  = useState(false)
  const [emailError, setEmailError] = useState('')
  // Auto-suggest state
  const [suggestions,  setSuggestions]  = useState<Record<string, string>>({})
  const [suggesting,   setSuggesting]   = useState<Record<string, boolean>>({})
  const suggestTimers  = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Kickoff / payment state
  const [kickoffOpen,    setKickoffOpen]    = useState(true)
  const [projectAmount,  setProjectAmount]  = useState('')
  const [depositPct,     setDepositPct]     = useState('50')
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentUrl,     setPaymentUrl]     = useState('')
  const [paymentError,   setPaymentError]   = useState('')
  const [paymentSent,    setPaymentSent]    = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('nexus-client-delivery-prefill')
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<ClientBrief>
      setBrief(prev => ({
        ...prev,
        ...parsed,
      }))
      sessionStorage.removeItem('nexus-client-delivery-prefill')
    } catch { /* ignore invalid handoff payload */ }
  }, [])

  const set = (k: keyof ClientBrief, v: string) => {
    setBrief(p => ({ ...p, [k]: v }))
    // Clear suggestion when user edits
    if (k in { problem: 1, targetUsers: 1, coreFeatures: 1 }) {
      setSuggestions(p => { const n = { ...p }; delete n[k]; return n })
    }
  }

  const fetchSuggestion = useCallback((field: 'problem' | 'targetUsers' | 'coreFeatures', value: string) => {
    if (suggestTimers.current[field]) clearTimeout(suggestTimers.current[field])
    suggestTimers.current[field] = setTimeout(async () => {
      if (!value.trim() || value.trim().length < 8) return
      setSuggesting(p => ({ ...p, [field]: true }))
      try {
        const res = await fetch('/api/client-autopilot/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field,
            value,
            context: {
              clientName:    brief.clientName,
              clientCompany: brief.clientCompany,
              problem:       brief.problem,
            },
          }),
        })
        const data = await res.json()
        if (data.ok && data.suggestion) {
          setSuggestions(p => ({ ...p, [field]: data.suggestion }))
        }
      } catch { /* silent */ }
      finally { setSuggesting(p => ({ ...p, [field]: false })) }
    }, 1200)
  }, [brief.clientName, brief.clientCompany, brief.problem])

  // Per-field quality
  const problemQ  = scoreProblem(brief.problem)
  const usersQ    = scoreTargetUsers(brief.targetUsers)
  const featuresQ = scoreFeatures(brief.coreFeatures)
  const qualityScore = [problemQ, usersQ, featuresQ].filter(q => q === 'good').length

  // Can run only when identity fields present + at least 2 of 3 quality fields are good + none are empty
  const valid = !!(
    brief.clientName.trim() &&
    brief.clientCompany.trim() &&
    problemQ  !== 'empty' &&
    usersQ    !== 'empty' &&
    featuresQ !== 'empty' &&
    qualityScore >= 2
  )

  const runDelivery = useCallback(async () => {
    if (!valid) return
    abortRef.current = new AbortController()
    setPhase('running'); setError(''); setDoneSteps(new Set())
    setOutputs({}); setActiveStep(null); setEmailSent(false)

    try {
      const res = await fetch('/api/client-autopilot/stream', {
        method: 'POST', signal: abortRef.current.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brief),
      })
      if (!res.ok) {
        const ct = res.headers.get('content-type') ?? ''
        const msg = ct.includes('json')
          ? (await res.json()).error ?? 'Request failed'
          : await res.text()
        throw new Error(msg)
      }

      const reader = res.body!.getReader()
      const dec    = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'step')      setActiveStep(evt.id)
            if (evt.type === 'chunk')     setOutputs(p => ({ ...p, [evt.id]: (p[evt.id] ?? '') + evt.content }))
            if (evt.type === 'step_done') setDoneSteps(p => new Set([...p, evt.id]))
            if (evt.type === 'done')      { setPhase('done'); setActiveStep(null); setActiveTab('proposal') }
            if (evt.type === 'error')     { setError(evt.message); setPhase('form') }
          } catch { /* partial */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') { setError((err as Error).message); setPhase('form') }
      else setPhase('form')
    }
  }, [brief, valid])

  const stopDelivery = () => { abortRef.current?.abort(); setPhase('form') }

  const sendEmail = async () => {
    if (!brief.clientEmail) { setEmailError('Add client email to send'); return }
    setSending(true); setEmailError('')
    try {
      const res  = await fetch('/api/client-autopilot/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, outputs }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEmailSent(true)
    } catch (err) { setEmailError((err as Error).message) }
    finally { setSending(false) }
  }

  const sendPaymentRequest = async (withEmail: boolean) => {
    const amt = parseInt(projectAmount.replace(/[^0-9]/g, ''), 10)
    if (!amt || amt < 1000) { setPaymentError('Enter a project value (min ₹1,000)'); return }
    if (withEmail && !brief.clientEmail) { setPaymentError('Add client email to send payment link'); return }
    setPaymentLoading(true); setPaymentError(''); setPaymentUrl('')
    try {
      const res  = await fetch('/api/client-autopilot/payment-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountINR:      amt,
          depositPct:     parseInt(depositPct, 10),
          clientName:     brief.clientName,
          clientEmail:    brief.clientEmail,
          clientCompany:  brief.clientCompany,
          projectSummary: brief.problem,
          sendEmail:      withEmail,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPaymentUrl(data.data.paymentUrl)
      if (withEmail) setPaymentSent(true)
    } catch (err) { setPaymentError((err as Error).message) }
    finally { setPaymentLoading(false) }
  }

  const stepsDone  = doneSteps.size
  const stepsTotal = PIPELINE.length
  const pct        = Math.round((stepsDone / stepsTotal) * 100)

  // ══════════════════════════════════════════════════════════════════════════
  // FORM
  // ══════════════════════════════════════════════════════════════════════════

  if (phase === 'form') return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <div className="space-y-2 pb-2">
        <p className="text-[10px] font-black font-mono tracking-widest text-ink3 uppercase">Client Delivery AutoPilot · 6 agents · ~3 min</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink">One-click project delivery</h1>
        <p className="text-sm text-ink3 leading-relaxed">
          Fill in the client brief. Six AI agents run sequentially and produce three ready-to-use documents: a client proposal, a feature spec, and a market analysis.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: '📄', label: 'Proposal',  sub: 'Ready to send to client' },
          { icon: '📋', label: 'Spec',      sub: 'Feature cards + architecture' },
          { icon: '📊', label: 'Analysis',  sub: 'Market intel + risk register' },
        ].map(item => (
          <div key={item.label} className="border border-border rounded-xl p-3 text-center space-y-1">
            <span className="text-xl">{item.icon}</span>
            <p className="text-xs font-bold text-ink">{item.label}</p>
            <p className="text-[10px] text-ink3">{item.sub}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="border border-border rounded-xl p-4 flex gap-3">
          <span className="font-bold text-ink3 flex-shrink-0">!</span>
          <p className="text-sm text-ink2">{error}</p>
        </div>
      )}

      <SectionCard n={1} title="Who is this for?" subtitle="Client name, company, and where to send the finished documents">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Client name <span className="text-ink3 font-normal">(required)</span></Label>
            <input className={inputCls} placeholder="e.g. Priya Sharma" value={brief.clientName} onChange={e => set('clientName', e.target.value)} /></div>
          <div><Label>Company <span className="text-ink3 font-normal">(required)</span></Label>
            <input className={inputCls} placeholder="e.g. Bloom Agency" value={brief.clientCompany} onChange={e => set('clientCompany', e.target.value)} /></div>
        </div>
        <div><Label hint="Proposal + spec delivered here automatically once complete">Client email <span className="text-ink3 font-normal">(optional)</span></Label>
          <input className={inputCls} type="email" placeholder="client@company.com" value={brief.clientEmail} onChange={e => set('clientEmail', e.target.value)} /></div>
      </SectionCard>

      <SectionCard n={2} title="What problem are we solving?" subtitle="Be specific — the AI uses this to generate real intelligence, not generic advice">
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Problem statement <span className="text-ink3 font-normal">(required)</span><QualityDot q={problemQ} /></Label>
            <span className="text-[10px] font-mono text-ink3">{brief.problem.trim().length} / 80 min</span>
          </div>
          <textarea className={inputCls + ' resize-none'} rows={4}
            placeholder="e.g. Our sales team spends 3 hours per week manually pulling data from three spreadsheets to build client reports. We need this automated and sent on schedule — currently one person does this manually and it delays invoicing by 2 days."
            value={brief.problem}
            onChange={e => set('problem', e.target.value)}
            onBlur={() => { if (problemQ === 'weak') fetchSuggestion('problem', brief.problem) }}
          />
          <FieldHint q={problemQ}
            weak="Describe the specific pain — what's slow, broken, or manual? How long does it take? Who is affected?"
            empty="Required. Describe the actual business problem, not just the solution." />
          <SuggestionCard
            field="problem"
            value={suggestions.problem}
            suggesting={!!suggesting.problem}
            onUse={v => { set('problem', v); setSuggestions(p => ({ ...p, problem: '' })) }}
          />
        </div>
        <div>
          <Label>Target users <span className="text-ink3 font-normal">(required)</span><QualityDot q={usersQ} /></Label>
          <textarea className={inputCls + ' resize-none'} rows={2}
            placeholder="e.g. Sales managers at mid-size B2B SaaS companies (50–200 employees) who manage teams of 10–30 reps and report to a VP of Sales"
            value={brief.targetUsers}
            onChange={e => set('targetUsers', e.target.value)}
            onBlur={() => { if (usersQ === 'weak') fetchSuggestion('targetUsers', brief.targetUsers) }}
          />
          <FieldHint q={usersQ}
            weak="Add specifics — company size, role, sector, team size. Avoid 'everyone' or 'businesses'."
            empty="Required. Who will use this every day?" />
          <SuggestionCard
            field="targetUsers"
            value={suggestions.targetUsers}
            suggesting={!!suggesting.targetUsers}
            onUse={v => { set('targetUsers', v); setSuggestions(p => ({ ...p, targetUsers: '' })) }}
          />
        </div>
      </SectionCard>

      <SectionCard n={3} title="What needs to be built?" subtitle="One feature per line — the AI will prioritise and spec each one">
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Core features <span className="text-ink3 font-normal">(required — min 3 items)</span><QualityDot q={featuresQ} /></Label>
            <span className="text-[10px] font-mono text-ink3">
              {brief.coreFeatures.split('\n').filter(l => l.trim().length > 10).length} items
            </span>
          </div>
          <textarea className={inputCls + ' resize-none font-mono text-[12px]'} rows={7}
            placeholder={'1. Automated report generation from CSV / Google Sheets\n2. Customisable email templates with branding\n3. Scheduled delivery (weekly / monthly) with CC list\n4. Team dashboard — views, opens, link clicks\n5. Client-facing read-only portal with download\n6. Admin panel to manage team members and permissions'}
            value={brief.coreFeatures}
            onChange={e => set('coreFeatures', e.target.value)}
            onBlur={() => { if (featuresQ === 'weak') fetchSuggestion('coreFeatures', brief.coreFeatures) }}
          />
          <FieldHint q={featuresQ}
            weak="Add at least 3 specific features. Vague features (e.g. 'dashboard') produce weak specs — add what the user actually does."
            empty="Required. List at least 3 features, one per line." />
          <SuggestionCard
            field="coreFeatures"
            value={suggestions.coreFeatures}
            suggesting={!!suggesting.coreFeatures}
            onUse={v => { set('coreFeatures', v); setSuggestions(p => ({ ...p, coreFeatures: '' })) }}
          />
        </div>
        <div><Label>Special requirements <span className="text-ink3 font-normal">(optional)</span></Label>
          <input className={inputCls} placeholder="e.g. Must integrate with Salesforce. GDPR compliant. No monthly SaaS fees."
            value={brief.specialReqs} onChange={e => set('specialReqs', e.target.value)} /></div>
      </SectionCard>

      <SectionCard n={4} title="Budget & timeline" subtitle="Shapes the scope and proposal investment section">
        <div className="grid sm:grid-cols-3 gap-4">
          <div><Label>Budget</Label>
            <select className={inputCls} value={brief.budget} onChange={e => set('budget', e.target.value)}>
              <option value="">Not specified</option>
              <option>Under $5,000</option><option>$5,000 – $15,000</option>
              <option>$15,000 – $30,000</option><option>$30,000 – $60,000</option><option>$60,000+</option>
            </select></div>
          <div><Label>Timeline</Label>
            <select className={inputCls} value={brief.timeline} onChange={e => set('timeline', e.target.value)}>
              <option value="">Not specified</option>
              <option>2 weeks</option><option>1 month</option><option>2 months</option>
              <option>3 months</option><option>6 months</option><option>Ongoing / retainer</option>
            </select></div>
          <div><Label hint="Leave blank — AI recommends">Tech stack</Label>
            <input className={inputCls} placeholder="e.g. Next.js, Supabase"
              value={brief.techStack} onChange={e => set('techStack', e.target.value)} /></div>
        </div>
      </SectionCard>

      <div className="border border-border rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-xs font-bold text-ink mb-3">Six agents run in sequence</p>
          <div className="flex items-center gap-1">
            {PIPELINE.map((step, i) => (
              <div key={step.id} className="flex items-center gap-1 flex-1 min-w-0">
                <div className="flex-1 min-w-0 text-center">
                  <div className="w-7 h-7 rounded-lg border border-border bg-paper2 flex items-center justify-center text-[9px] font-black font-mono text-ink3 mx-auto">{step.icon}</div>
                  <p className="text-[8px] text-ink3 mt-1 truncate">{step.label}</p>
                </div>
                {i < PIPELINE.length - 1 && <div className="w-2 h-px bg-border flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        {/* Brief quality readout */}
        <div className="border-t border-border pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono text-ink3 uppercase tracking-widest">Brief quality</p>
            <p className="text-[10px] font-mono text-ink2">{qualityScore}/3 fields strong</p>
          </div>
          <div className="flex gap-2">
            {([
              { label: 'Problem',  q: problemQ  },
              { label: 'Users',    q: usersQ    },
              { label: 'Features', q: featuresQ },
            ] as const).map(({ label, q }) => (
              <div key={label} className={`flex-1 rounded-lg border px-3 py-2 text-center ${
                q === 'good'  ? 'border-ink/20 bg-ink/3'    :
                q === 'weak'  ? 'border-border bg-paper2/60' :
                                'border-border/40 bg-paper2/20 opacity-50'
              }`}>
                <p className="text-[8px] font-mono text-ink3 uppercase tracking-wider">{label}</p>
                <p className="text-[10px] font-bold text-ink2 mt-0.5">
                  {q === 'good' ? '[✓] strong' : q === 'weak' ? '[ ] needs detail' : '[ ] empty'}
                </p>
              </div>
            ))}
          </div>
          {qualityScore < 2 && (brief.clientName || brief.problem) && (
            <p className="text-[10px] text-ink3">
              Strengthen at least 2 of the 3 fields above — vague briefs produce generic, low-scoring outputs.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="text-[11px] text-ink3">
            {!brief.clientName || !brief.clientCompany ? 'Add client name and company to continue' :
             !valid ? 'Add more detail to the highlighted fields' : 'Brief looks good — ready to run'}
          </p>
          <button onClick={runDelivery} disabled={!valid}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ink text-paper text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-ink/80 transition-colors">
            <span className="text-xs">▶</span> Run Delivery Pipeline
          </button>
        </div>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // RUNNING
  // ══════════════════════════════════════════════════════════════════════════

  if (phase === 'running') return (
    <div className="max-w-xl mx-auto px-4 py-16 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <p className="text-[10px] font-mono text-ink3 uppercase tracking-widest">Delivery Pipeline Running</p>
        <h2 className="text-xl font-bold text-ink">{brief.clientCompany}</h2>
        <p className="text-sm text-ink3">Generating proposal, spec, and market analysis…</p>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-ink3">
          <span>{stepsDone} of {stepsTotal} complete</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-paper3 rounded-full overflow-hidden">
          <div className="h-1.5 bg-ink rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Step list */}
      <div className="space-y-2">
        {PIPELINE.map(step => {
          const done   = doneSteps.has(step.id)
          const active = activeStep === step.id
          return (
            <div key={step.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
              active ? 'border-ink/20 bg-ink/3' :
              done   ? 'border-border bg-paper2/40 opacity-80' :
                       'border-border/30 opacity-30'
            }`}>
              <div className={`w-6 h-6 rounded-lg border flex items-center justify-center text-[9px] font-black font-mono flex-shrink-0 ${
                done   ? 'border-border text-ink2 bg-paper3'       :
                active ? 'border-ink/30 text-ink bg-ink/8'         :
                         'border-border/40 text-ink3'
              }`}>
                {done ? '✓' : step.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${active ? 'text-ink' : done ? 'text-ink2' : 'text-ink3'}`}>
                  {step.label}
                </p>
                <p className="text-[10px] text-ink3 truncate">{step.what}</p>
              </div>
              {active && (
                <div className="flex gap-0.5 flex-shrink-0">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1 h-1 rounded-full bg-ink/40 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              )}
              {done && <span className="text-[10px] font-mono text-ink3 flex-shrink-0">done</span>}
            </div>
          )
        })}
      </div>

      <div className="text-center">
        <button onClick={stopDelivery}
          className="text-xs text-ink3 hover:text-ink border border-border rounded-lg px-4 py-2 transition-colors">
          ■ Stop
        </button>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col min-h-[calc(100vh-52px)]">

      {/* Top bar */}
      <div className="border-b border-border bg-paper px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0">
        <div>
          <p className="text-sm font-bold text-ink">{brief.clientCompany} — {brief.clientName}</p>
          <p className="text-[10px] text-ink3 font-mono mt-0.5">All 6 agents complete · {new Date().toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {emailError && <p className="text-[10px] text-ink3">{emailError}</p>}
          {!emailSent && brief.clientEmail && (
            <button onClick={sendEmail} disabled={sending}
              className="px-4 py-2 rounded-xl bg-ink text-paper text-xs font-bold hover:bg-ink/80 disabled:opacity-40 transition-colors">
              {sending ? 'Sending…' : '↗ Email to client'}
            </button>
          )}
          {emailSent && (
            <span className="px-3 py-2 rounded-xl border border-border text-ink2 text-xs font-mono">
              ✓ Sent to {brief.clientName}
            </span>
          )}
          <button onClick={() => { setPhase('form'); setOutputs({}); setDoneSteps(new Set()) }}
            className="px-3 py-2 rounded-xl border border-border text-ink3 text-xs hover:text-ink transition-colors">
            New brief
          </button>
        </div>
      </div>

      {/* ── Project Kickoff Panel ─────────────────────────────────────────── */}
      <div className="border-b border-border bg-paper2/50 flex-shrink-0">
        {/* Header row — always visible */}
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Next step</span>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-ink/30" />
              <span className="text-xs text-ink2 font-medium">Collect deposit → start building</span>
            </div>
          </div>
          <button
            onClick={() => setKickoffOpen(o => !o)}
            className="text-[10px] font-mono text-ink3 hover:text-ink border border-border rounded px-2 py-1 transition-colors"
          >
            {kickoffOpen ? '[−] hide' : '[+] show'}
          </button>
        </div>

        {/* Expandable body */}
        {kickoffOpen && (
          <div className="px-6 pb-5 space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              {/* Step 1: send proposal */}
              <div className="border border-border rounded-xl p-4 space-y-3 bg-paper">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded border flex items-center justify-center text-[9px] font-black font-mono flex-shrink-0 ${emailSent ? 'border-border text-ink2 bg-paper3' : 'border-ink/20 text-ink bg-ink/5'}`}>
                    {emailSent ? '✓' : '01'}
                  </span>
                  <p className="text-xs font-bold text-ink">Send proposal</p>
                </div>
                <p className="text-[10px] text-ink3 leading-relaxed">Email the proposal, spec, and market analysis to your client to review.</p>
                {emailError && <p className="text-[10px] text-red-400">{emailError}</p>}
                {emailSent
                  ? <p className="text-[10px] font-mono text-ink2">✓ Sent to {brief.clientEmail || brief.clientName}</p>
                  : (
                    <button
                      onClick={sendEmail} disabled={sending || !brief.clientEmail}
                      className="w-full text-xs font-bold py-2 rounded-lg border border-border hover:border-ink/30 text-ink2 disabled:opacity-40 transition-colors"
                      title={!brief.clientEmail ? 'Add client email to the brief' : ''}
                    >
                      {sending ? 'Sending…' : !brief.clientEmail ? 'No email on brief' : '↗ Email to client'}
                    </button>
                  )
                }
              </div>

              {/* Step 2: collect payment */}
              <div className="border border-border rounded-xl p-4 space-y-3 bg-paper">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded border flex items-center justify-center text-[9px] font-black font-mono flex-shrink-0 ${paymentUrl ? 'border-border text-ink2 bg-paper3' : 'border-border text-ink3'}`}>
                    {paymentUrl ? '✓' : '02'}
                  </span>
                  <p className="text-xs font-bold text-ink">Collect deposit</p>
                </div>
                <p className="text-[10px] text-ink3 leading-relaxed">Set the project value. We generate a Razorpay payment link you can share or email.</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="text-[9px] font-mono text-ink3 mb-1">Project value (₹)</p>
                    <input
                      type="number" min="1000" step="1000"
                      placeholder="e.g. 50000"
                      value={projectAmount}
                      onChange={e => setProjectAmount(e.target.value)}
                      className="w-full bg-paper2 border border-border rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink3 focus:outline-none focus:border-ink/30"
                    />
                  </div>
                  <div className="w-20">
                    <p className="text-[9px] font-mono text-ink3 mb-1">Deposit %</p>
                    <select
                      value={depositPct} onChange={e => setDepositPct(e.target.value)}
                      className="w-full bg-paper2 border border-border rounded-lg px-2 py-2 text-xs text-ink focus:outline-none"
                    >
                      <option value="25">25%</option>
                      <option value="50">50%</option>
                      <option value="100">100%</option>
                    </select>
                  </div>
                </div>
                {paymentError && <p className="text-[10px] text-red-400">{paymentError}</p>}
                {paymentUrl ? (
                  <div className="space-y-2">
                    <p className="text-[9px] font-mono text-ink3">Payment link ready</p>
                    <div className="flex gap-1">
                      <input readOnly value={paymentUrl} className="flex-1 bg-paper2 border border-border rounded-lg px-2 py-1.5 text-[10px] font-mono text-ink2 min-w-0" />
                      <button onClick={() => navigator.clipboard.writeText(paymentUrl).catch(()=>{})}
                        className="px-2 py-1.5 rounded-lg border border-border text-[10px] font-mono text-ink3 hover:text-ink transition-colors flex-shrink-0">
                        Copy
                      </button>
                    </div>
                    {paymentSent && <p className="text-[10px] font-mono text-ink2">✓ Payment link emailed to client</p>}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => sendPaymentRequest(false)}
                      disabled={paymentLoading}
                      className="flex-1 text-xs font-bold py-2 rounded-lg border border-border hover:border-ink/30 text-ink2 disabled:opacity-40 transition-colors"
                    >
                      {paymentLoading ? '…' : 'Generate link'}
                    </button>
                    <button
                      onClick={() => sendPaymentRequest(true)}
                      disabled={paymentLoading || !brief.clientEmail}
                      className="flex-1 text-xs font-bold py-2 rounded-lg bg-ink text-paper hover:bg-ink/80 disabled:opacity-40 transition-colors"
                      title={!brief.clientEmail ? 'Add client email to brief' : ''}
                    >
                      {paymentLoading ? '…' : 'Send to client'}
                    </button>
                  </div>
                )}
              </div>

              {/* Step 3: start building */}
              <div className="border border-border rounded-xl p-4 space-y-3 bg-paper">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded border border-border flex items-center justify-center text-[9px] font-black font-mono text-ink3 flex-shrink-0">03</span>
                  <p className="text-xs font-bold text-ink">Start building</p>
                </div>
                <p className="text-[10px] text-ink3 leading-relaxed">Open FORGE Engine with this brief pre-loaded. Run the 22-agent one-click pipeline to generate the full spec, application codebase, repair pass, closure package, and deploy bundle.</p>
                <button
                  onClick={() => {
                    // Store brief in sessionStorage so FORGE can pick it up
                    try {
                      sessionStorage.setItem('forge_prefill', JSON.stringify({
                        projectName:   brief.clientCompany,
                        clientName:    brief.clientName,
                        userStory:     brief.problem,
                        features:      brief.coreFeatures,
                        techStack:     brief.techStack,
                        timeline:      brief.timeline,
                        budget:        brief.budget,
                      }))
                    } catch { /* storage unavailable */ }
                    window.location.href = '/shell?page=forge'
                  }}
                  className="w-full text-xs font-bold py-2 rounded-lg border border-border hover:border-ink/30 text-ink2 transition-colors"
                >
                  ▶ Open FORGE Engine →
                </button>
                <p className="text-[9px] text-ink3">Produces: full codebase scaffold, DB schema, QA score, security report, ZIP download</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border bg-paper px-6 flex items-center gap-1 flex-shrink-0">
        {OUTPUT_TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all -mb-px ${
              activeTab === tab.key
                ? 'border-ink text-ink'
                : 'border-transparent text-ink3 hover:text-ink'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {activeTab === 'proposal' && (
            <ProposalDocument text={outputs.proposal ?? ''} brief={brief} />
          )}
          {activeTab === 'spec' && (
            <FeatureCards
              plannerText={outputs.planner ?? ''}
              archText={outputs.architect ?? ''}
              qaText={outputs.qa ?? ''}
            />
          )}
          {activeTab === 'analysis' && (
            <AnalysisDocument
              scoutText={outputs.scout ?? ''}
              analystText={outputs.analyst ?? ''}
            />
          )}
        </div>
      </div>
    </div>
  )
}
