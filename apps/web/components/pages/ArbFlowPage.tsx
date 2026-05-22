'use client'

/**
 * ArbFlowPage — AI Arbitrage Platform embedded in NEXUS OS.
 *
 * Three tools:
 *  1. Niche Validator  — score a niche idea with AI (0-100)
 *  2. Offer Builder    — generate a premium digital offer from a niche
 *  3. Content Engine   — create platform-specific hooks from an offer
 *
 * All calls go to /api/arbflow/* serverless routes.
 * Falls back to simulated mock data when API keys are missing.
 *
 * Design: token-only, no hardcoded hex. All colours via CSS custom properties.
 */

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool = 'niche' | 'offer' | 'content'

interface NicheResult {
  score: number
  status: 'validated' | 'borderline' | 'rejected'
  summary: string
  strengths: string[]
  risks: string[]
  recommendation: string
}

interface OfferResult {
  title: string
  format: string
  price: string
  targetBuyer: string
  deliverables: string[]
  usp: string
  cta: string
}

interface ContentResult {
  platform: string
  hook: string
  body: string
  cta: string
}

// ─── Token helpers ────────────────────────────────────────────────────────────

/** Returns CSS var name for score colour — green / amber / rose */
function scoreVar(score: number) {
  if (score >= 75) return 'var(--green)'
  if (score >= 50) return 'var(--amber)'
  return 'var(--rose)'
}

function statusBadge(status: NicheResult['status']) {
  const map = {
    validated: { bg: 'color-mix(in srgb,var(--green) 12%,transparent)', border: 'color-mix(in srgb,var(--green) 40%,transparent)', text: 'var(--green)', label: 'VALIDATED'  },
    borderline: { bg: 'color-mix(in srgb,var(--amber) 12%,transparent)', border: 'color-mix(in srgb,var(--amber) 40%,transparent)', text: 'var(--amber)', label: 'BORDERLINE' },
    rejected:   { bg: 'color-mix(in srgb,var(--rose)  12%,transparent)', border: 'color-mix(in srgb,var(--rose)  40%,transparent)', text: 'var(--rose)',  label: 'REJECTED'   },
  }
  const s = map[status]
  return (
    <span style={{
      background: s.bg, border: `1px solid ${s.border}`, color: s.text,
      fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em',
      padding: '2px 8px', borderRadius: 'var(--radius-sm)',
      fontFamily: 'var(--ff-m)',
    }}>{s.label}</span>
  )
}

// ─── Shared input / button styles ─────────────────────────────────────────────

/* All inputs use .input-base.input-flex — defined in globals.css */

function PrimaryBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn btn-primary"
      style={{ whiteSpace: 'nowrap' }}
    >
      {children}
    </button>
  )
}

// ─── Mock fallbacks ───────────────────────────────────────────────────────────

function mockNicheResult(idea: string): NicheResult {
  const hash = idea.length * 7 + idea.charCodeAt(0)
  const score = 45 + (hash % 50)
  return {
    score,
    status: score >= 70 ? 'validated' : score >= 50 ? 'borderline' : 'rejected',
    summary: `"${idea}" targets a focused buyer group with clear pain points and existing spend.`,
    strengths: ['Clear target audience', 'Proven willingness to pay', 'Low production cost'],
    risks: ['Saturated at the commodity end', 'Requires strong positioning to stand out'],
    recommendation: score >= 70
      ? 'Strong signal — build an offer and validate with 5 DMs this week.'
      : 'Proceed with caution — narrow the ICP or pick a sub-niche.',
  }
}

function mockOfferResult(niche: string): OfferResult {
  return {
    title: `The ${niche} Accelerator System`,
    format: 'Template Bundle + 60-min Strategy Call',
    price: '$297 — $497',
    targetBuyer: `Solo founders & small teams in the ${niche} space`,
    deliverables: [
      'Done-for-you workflow templates (Notion)',
      'Swipe-file of top-performing copy',
      '60-min 1:1 strategy session',
      '30-day email support',
    ],
    usp: `The only ${niche} system that gives you copy, workflow, and a live expert session — in one package.`,
    cta: `Book your free 15-min niche audit → [CalendlyLink]`,
  }
}

function mockContentPosts(offer: string): ContentResult[] {
  return [
    {
      platform: 'Instagram',
      hook: `I added $8k MRR in 60 days selling one offer. Here's the exact system 👇`,
      body: `Most people try to sell everything to everyone.\nI niched down to ${offer} and charged premium.\nHere's the 3-step framework that made it work...`,
      cta: `Comment "SYSTEM" and I'll send you the breakdown.`,
    },
    {
      platform: 'LinkedIn',
      hook: `Nobody tells you this about productising your expertise.`,
      body: `After 6 months of low-ticket chaos, I built one premium offer around ${offer}.\nResult: fewer clients, more revenue, zero scope creep.\nHere's what changed...`,
      cta: `Drop a ♻ if this resonates — I'll share the pricing framework next week.`,
    },
    {
      platform: 'Twitter / X',
      hook: `${offer} is one of the most underpriced skills on the internet right now.`,
      body: `Here's why smart founders are finally charging what it's worth:\n\n• Niche = leverage\n• Premium = fewer bad clients\n• Systems = scale without burnout`,
      cta: `RT if you agree. Follow for the full breakdown.`,
    },
  ]
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function NicheTool() {
  const [idea, setIdea]       = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<NicheResult | null>(null)

  async function validate() {
    if (!idea.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res  = await fetch('/api/arbflow/validate-niche', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      })
      const data = await res.json()
      setResult(res.ok && data.ok ? (data as NicheResult) : mockNicheResult(idea))
    } catch {
      setResult(mockNicheResult(idea))
    }
    setLoading(false)
  }

  return (
    <div>
      <p style={{ color: 'var(--ink3)', fontSize: 'var(--text-sm)', marginBottom: 20 }}>
        Enter a niche or business idea. AI scores market viability, competition, and monetisation potential (0–100).
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input
          value={idea}
          onChange={e => setIdea(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && validate()}
          placeholder="e.g. AI automation for boutique law firms"
          className="input-base input-flex"
          aria-label="Niche idea"
        />
        <PrimaryBtn onClick={validate} disabled={loading || !idea.trim()}>
          {loading ? 'Scoring…' : 'Validate Niche →'}
        </PrimaryBtn>
      </div>

      {result && (
        <div className="card animate-fadein state-hover-ring">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
            <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }} aria-label={`Score: ${result.score}`}>
              <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
                <circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" strokeWidth="6" />
                <circle cx="36" cy="36" r="30" fill="none" stroke={scoreVar(result.score)} strokeWidth="6"
                  strokeDasharray={`${(result.score / 100) * 188.5} 188.5`}
                  strokeLinecap="round" transform="rotate(-90 36 36)" />
              </svg>
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 18, fontWeight: 700,
                color: scoreVar(result.score),
              }}>
                {result.score}
              </div>
            </div>
            <div>
              <div style={{ marginBottom: 6 }}>{statusBadge(result.status)}</div>
              <p style={{ color: 'var(--ink)', fontSize: 'var(--text-sm)', margin: 0 }}>{result.summary}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <div className="sec-label" style={{ marginBottom: 8 }}>Strengths</div>
              {result.strengths.map((s, i) => (
                <div key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--green)', marginBottom: 4 }}>✓ {s}</div>
              ))}
            </div>
            <div>
              <div className="sec-label" style={{ marginBottom: 8 }}>Risks</div>
              {result.risks.map((r, i) => (
                <div key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--rose)', marginBottom: 4 }}>⚠ {r}</div>
              ))}
            </div>
          </div>

          <div style={{
            background: 'color-mix(in srgb,var(--acid) 8%,transparent)',
            border: '1px solid color-mix(in srgb,var(--acid) 20%,transparent)',
            borderRadius: 'var(--radius-md)', padding: 14,
            fontSize: 'var(--text-sm)', color: 'var(--ink2)',
          }}>
            <span style={{ color: 'var(--acid)', fontWeight: 600 }}>Recommendation: </span>
            {result.recommendation}
          </div>
        </div>
      )}
    </div>
  )
}

function OfferTool() {
  const [niche, setNiche]     = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<OfferResult | null>(null)

  async function build() {
    if (!niche.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res  = await fetch('/api/arbflow/build-offer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche }),
      })
      const data = await res.json()
      setResult(res.ok && data.ok ? (data as OfferResult) : mockOfferResult(niche))
    } catch {
      setResult(mockOfferResult(niche))
    }
    setLoading(false)
  }

  return (
    <div>
      <p style={{ color: 'var(--ink3)', fontSize: 'var(--text-sm)', marginBottom: 20 }}>
        Describe your niche or validated idea. AI generates a premium digital offer with positioning, deliverables, and pricing.
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input
          value={niche}
          onChange={e => setNiche(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && build()}
          placeholder="e.g. productivity systems for freelance designers"
          className="input-base input-flex"
          aria-label="Niche description"
        />
        <PrimaryBtn onClick={build} disabled={loading || !niche.trim()}>
          {loading ? 'Building…' : 'Build Offer →'}
        </PrimaryBtn>
      </div>

      {result && (
        <div className="card animate-fadein state-hover-ring">
          <div style={{ marginBottom: 20 }}>
            <div className="sec-label" style={{ marginBottom: 4 }}>Offer Title</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--ink)' }}>{result.title}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Format',       value: result.format      },
              { label: 'Price Range',  value: result.price       },
              { label: 'Target Buyer', value: result.targetBuyer },
            ].map(({ label, value }) => (
              <div key={label} className="panel">
                <div className="sec-label" style={{ marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="sec-label" style={{ marginBottom: 8 }}>Deliverables</div>
            {result.deliverables.map((d, i) => (
              <div key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink2)', marginBottom: 6 }}>
                <span style={{ color: 'var(--acid)', marginRight: 8 }}>◆</span>{d}
              </div>
            ))}
          </div>

          <div style={{
            background: 'color-mix(in srgb,var(--acid) 6%,transparent)',
            border: '1px solid color-mix(in srgb,var(--acid) 18%,transparent)',
            borderRadius: 'var(--radius-md)', padding: 14, marginBottom: 12,
          }}>
            <div className="sec-label" style={{ marginBottom: 4 }}>Unique Selling Point</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink2)' }}>{result.usp}</div>
          </div>

          <div className="panel">
            <div className="sec-label" style={{ marginBottom: 4 }}>Call to Action</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--acid)' }}>{result.cta}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function ContentTool() {
  const [offer, setOffer]     = useState('')
  const [loading, setLoading] = useState(false)
  const [posts, setPosts]     = useState<ContentResult[]>([])

  async function generate() {
    if (!offer.trim()) return
    setLoading(true)
    setPosts([])
    try {
      const res  = await fetch('/api/arbflow/content-engine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer }),
      })
      const data = await res.json()
      setPosts(res.ok && data.ok ? (data.posts ?? []) : mockContentPosts(offer))
    } catch {
      setPosts(mockContentPosts(offer))
    }
    setLoading(false)
  }

  return (
    <div>
      <p style={{ color: 'var(--ink3)', fontSize: 'var(--text-sm)', marginBottom: 20 }}>
        Paste your offer or niche. AI generates ready-to-post hooks and captions for Instagram, LinkedIn, and X.
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input
          value={offer}
          onChange={e => setOffer(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && generate()}
          placeholder="e.g. The Freelance Designer Productivity System — $297"
          className="input-base input-flex"
          aria-label="Offer description"
        />
        <PrimaryBtn onClick={generate} disabled={loading || !offer.trim()}>
          {loading ? 'Generating…' : 'Generate Content →'}
        </PrimaryBtn>
      </div>

      {posts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {posts.map((post, i) => (
            <PostCard key={i} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}

function PostCard({ post }: { post: ContentResult }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(`${post.hook}\n\n${post.body}\n\n${post.cta}`)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="card animate-fadein">
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--acid)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 12, fontFamily: 'var(--ff-m)', textTransform: 'uppercase' }}>
        {post.platform}
      </div>
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
        {post.hook}
      </div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink3)', whiteSpace: 'pre-line', marginBottom: 12, lineHeight: 1.7 }}>
        {post.body}
      </div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--amber)', marginBottom: 12 }}>{post.cta}</div>
      <button
        onClick={copy}
        className={`btn state-active ${copied ? 'btn-primary' : 'btn-ghost'}`}
        style={{ fontSize: 'var(--text-xs)', padding: '5px 12px', minHeight: 'auto' }}
        aria-label={`Copy ${post.platform} post`}
        aria-live="polite"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  )
}

// ─── Pipeline step types ──────────────────────────────────────────────────────

type StepStatus = 'idle' | 'running' | 'done' | 'error'

interface PipelineState {
  idea:    string
  step:    0 | 1 | 2 | 3
  status:  StepStatus
  niche:   NicheResult  | null
  offer:   OfferResult  | null
  posts:   ContentResult[]
  error:   string | null
}

const STEPS = [
  { n: 1, label: 'Validate Niche',   icon: '⊙', detail: 'Scoring market viability 0–100…' },
  { n: 2, label: 'Build Offer',      icon: '◻', detail: 'Designing premium digital offer…' },
  { n: 3, label: 'Generate Content', icon: '✦', detail: 'Writing hooks for 3 platforms…'   },
]

function StepIndicator({ step, current, status }: { step: typeof STEPS[0]; current: number; status: StepStatus }) {
  const done    = current > step.n
  const running = current === step.n && status === 'running'
  const error   = current === step.n && status === 'error'
  const color   = done ? 'var(--green)' : running ? 'var(--amber)' : error ? 'var(--rose)' : 'var(--border2)'
  const textCol = done ? 'var(--green)' : running ? 'var(--amber)' : error ? 'var(--rose)' : 'var(--ink3)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: `2px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color, flexShrink: 0,
        background: done ? 'color-mix(in srgb,var(--green) 10%,transparent)' : 'transparent',
      }} aria-label={`Step ${step.n}: ${done ? 'done' : running ? 'running' : 'pending'}`}>
        {done ? '✓' : running ? '…' : step.n}
      </div>
      <div>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: textCol }}>{step.label}</div>
        {running && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--amber)', marginTop: 2 }}>{step.detail}</div>}
      </div>
    </div>
  )
}

// ─── Pipeline runner ──────────────────────────────────────────────────────────

async function runStep<T>(url: string, body: Record<string, string>, fallback: T): Promise<T> {
  try {
    const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (res.ok && data.ok) return data as T
    return fallback
  } catch {
    return fallback
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TOOLS: { id: Tool; label: string; icon: string; tagline: string }[] = [
  { id: 'niche',   label: 'Niche Validator', icon: '⊙', tagline: 'Score any idea 0–100'       },
  { id: 'offer',   label: 'Offer Builder',   icon: '◻', tagline: 'Turn niche → premium offer'  },
  { id: 'content', label: 'Content Engine',  icon: '✦', tagline: 'Generate platform hooks'     },
]

type Mode = 'pipeline' | 'tools'

const EMPTY_PS: PipelineState = { idea: '', step: 0, status: 'idle', niche: null, offer: null, posts: [], error: null }

export default function ArbFlowPage() {
  const [mode, setMode]             = useState<Mode>('pipeline')
  const [activeTool, setActiveTool] = useState<Tool>('niche')
  const [ps, setPs]                 = useState<PipelineState>(EMPTY_PS)

  async function runFullPipeline() {
    const idea = ps.idea.trim()
    if (!idea) return

    setPs(p => ({ ...p, step: 1, status: 'running', niche: null, offer: null, posts: [], error: null }))

    const niche = await runStep<NicheResult>('/api/arbflow/validate-niche', { idea }, mockNicheResult(idea))
    setPs(p => ({ ...p, step: 2, niche }))

    const offer = await runStep<OfferResult>('/api/arbflow/build-offer', { niche: niche.summary ?? idea }, mockOfferResult(idea))
    setPs(p => ({ ...p, step: 3, offer }))

    const offerStr = offer.title ? `${offer.title} — ${offer.price}` : idea
    const contentData = await runStep<{ posts: ContentResult[] }>('/api/arbflow/content-engine', { offer: offerStr }, { posts: mockContentPosts(offerStr) })
    const posts = Array.isArray(contentData.posts) ? contentData.posts : mockContentPosts(offerStr)

    setPs(p => ({ ...p, status: 'done', posts }))
  }

  const running = ps.status === 'running'
  const done    = ps.status === 'done'

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }} id="main-content">

      {/* Header */}
      <header style={{ marginBottom: 28 }}>
        <div className="sec-label" style={{ marginBottom: 8 }}>NEXUS OS · ARBFLOW</div>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px', fontFamily: 'var(--ff-d)' }}>
          AI Arbitrage Platform
        </h1>
        <p style={{ color: 'var(--ink3)', fontSize: 'var(--text-sm)', margin: 0 }}>
          Validate a niche → build an offer → generate content. Three tools, one pipeline.
        </p>
      </header>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }} role="tablist" aria-label="View mode">
        {(['pipeline', 'tools'] as Mode[]).map(m => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            style={{
              padding: '7px 16px',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--ff-d)',
              border: `1px solid ${mode === m ? 'var(--acid)' : 'var(--border)'}`,
              background: mode === m ? 'color-mix(in srgb,var(--acid) 8%,transparent)' : 'var(--paper2)',
              color: mode === m ? 'var(--acid)' : 'var(--ink3)',
              transition: `background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)`,
              minHeight: 'var(--touch-min)',
            }}
          >
            {m === 'pipeline' ? '▶  One-Click Pipeline' : '⊞  Individual Tools'}
          </button>
        ))}
      </div>

      {/* ── ONE-CLICK PIPELINE MODE ───────────────────────────────────────────── */}
      {mode === 'pipeline' && (
        <div role="tabpanel">
          {/* Input + launch */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="sec-label" style={{ marginBottom: 12 }}>
              Enter your niche idea — pipeline does the rest
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={ps.idea}
                onChange={e => setPs(p => ({ ...p, idea: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && !running && runFullPipeline()}
                disabled={running}
                placeholder="e.g. AI automation for boutique law firms"
                className={`input-base input-flex${running ? ' state-disabled' : ''}`}
                aria-label="Niche idea for pipeline"
              />
              <button
                onClick={done ? () => setPs(EMPTY_PS) : runFullPipeline}
                disabled={running || (!done && !ps.idea.trim())}
                className="btn"
                style={{
                  background: done ? 'transparent' : 'var(--acid)',
                  color: done ? 'var(--acid)' : 'var(--n-950)',
                  border: done ? '1px solid var(--acid)' : 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {running ? 'Running…' : done ? '↺ Run Again' : 'Run Pipeline →'}
              </button>
            </div>
          </div>

          {/* Step progress */}
          {ps.step > 0 && (
            <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 32, flexWrap: 'wrap' }} aria-live="polite" aria-label="Pipeline progress">
              {STEPS.map((s, i) => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center' }}>
                  <StepIndicator step={s} current={ps.step} status={ps.status} />
                  {i < STEPS.length - 1 && (
                    <div style={{ width: 32, height: 1, background: ps.step > s.n ? 'var(--green)' : 'var(--border)', margin: '0 8px' }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Niche result card */}
          {ps.niche && (
            <div className="card animate-fadein" style={{ marginBottom: 16 }}>
              <div className="sec-label" style={{ marginBottom: 12 }}>Step 1 · Niche Score</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }} aria-label={`Score: ${ps.niche.score}`}>
                  <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
                    <circle cx="28" cy="28" r="23" fill="none" stroke="var(--border)" strokeWidth="5" />
                    <circle cx="28" cy="28" r="23" fill="none" stroke={scoreVar(ps.niche.score)} strokeWidth="5"
                      strokeDasharray={`${(ps.niche.score / 100) * 144.5} 144.5`}
                      strokeLinecap="round" transform="rotate(-90 28 28)" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: scoreVar(ps.niche.score) }}>
                    {ps.niche.score}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: 6 }}>{statusBadge(ps.niche.status)}</div>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink2)', margin: 0 }}>{ps.niche.summary}</p>
                </div>
              </div>
              <div style={{
                marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--acid)',
                background: 'color-mix(in srgb,var(--acid) 8%,transparent)',
                border: '1px solid color-mix(in srgb,var(--acid) 20%,transparent)',
                borderRadius: 'var(--radius-md)', padding: 10,
              }}>
                → {ps.niche.recommendation}
              </div>
            </div>
          )}

          {/* Offer result card */}
          {ps.offer && (
            <div className="card animate-fadein" style={{ marginBottom: 16 }}>
              <div className="sec-label" style={{ marginBottom: 12 }}>Step 2 · Offer</div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>{ps.offer.title}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {[
                  { label: 'Format',       value: ps.offer.format      },
                  { label: 'Price',        value: ps.offer.price       },
                  { label: 'Target Buyer', value: ps.offer.targetBuyer },
                  { label: 'CTA',          value: ps.offer.cta         },
                ].map(({ label, value }) => (
                  <div key={label} className="panel">
                    <div className="sec-label" style={{ marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div className="sec-label" style={{ marginBottom: 6 }}>Deliverables</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ps.offer.deliverables.map((d, i) => (
                  <span key={i} style={{
                    fontSize: 'var(--text-xs)', color: 'var(--ink2)',
                    background: 'var(--paper3)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', padding: '3px 10px',
                  }}>{d}</span>
                ))}
              </div>
            </div>
          )}

          {/* Content result cards */}
          {ps.posts.length > 0 && (
            <div className="card animate-fadein state-hover-ring">
              <div className="sec-label" style={{ marginBottom: 16 }}>Step 3 · Content</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ps.posts.map((post, i) => <PostCard key={i} post={post} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── INDIVIDUAL TOOLS MODE ─────────────────────────────────────────────── */}
      {mode === 'tools' && (
        <div role="tabpanel">
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }} role="tablist" aria-label="Tool selector">
            {TOOLS.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTool === t.id}
                onClick={() => setActiveTool(t.id)}
                className="state-active state-hover-ring"
                style={{
                  flex: 1,
                  background: activeTool === t.id ? 'color-mix(in srgb,var(--acid) 8%,transparent)' : 'var(--paper2)',
                  border: `1px solid ${activeTool === t.id ? 'var(--acid)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)', padding: '14px 12px', cursor: 'pointer',
                  textAlign: 'left',
                  transition: `background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)`,
                }}
              >
                <div style={{ fontSize: 16, marginBottom: 4 }}>{t.icon}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: activeTool === t.id ? 'var(--acid)' : 'var(--ink)' }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink3)', marginTop: 2 }}>{t.tagline}</div>
              </button>
            ))}
          </div>
          <div className="card">
            {activeTool === 'niche'   && <NicheTool />}
            {activeTool === 'offer'   && <OfferTool />}
            {activeTool === 'content' && <ContentTool />}
          </div>
        </div>
      )}
    </main>
  )
}
