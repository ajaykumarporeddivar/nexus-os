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
 */

import { useState } from 'react'
import { useSession } from 'next-auth/react'

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 75) return '#9ef500'
  if (score >= 50) return '#facc15'
  return '#f87171'
}

function statusBadge(status: NicheResult['status']) {
  const map = {
    validated: { bg: '#0a1f00', border: '#9ef500', text: '#9ef500', label: 'VALIDATED' },
    borderline: { bg: '#1a1400', border: '#facc15', text: '#facc15', label: 'BORDERLINE' },
    rejected:   { bg: '#1a0500', border: '#f87171', text: '#f87171', label: 'REJECTED'  },
  }
  const s = map[status]
  return (
    <span style={{
      background: s.bg, border: `1px solid ${s.border}`, color: s.text,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
      padding: '2px 8px', borderRadius: 4,
    }}>{s.label}</span>
  )
}

// ─── Mock fallbacks (used when no API key) ───────────────────────────────────

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
  const [idea, setIdea] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<NicheResult | null>(null)

  async function validate() {
    if (!idea.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/arbflow/validate-niche', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setResult(data as NicheResult)
      } else {
        setResult(mockNicheResult(idea))
      }
    } catch {
      setResult(mockNicheResult(idea))
    }
    setLoading(false)
  }

  return (
    <div>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
        Enter a niche or business idea. AI scores market viability, competition, and monetisation potential (0–100).
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input
          value={idea}
          onChange={e => setIdea(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && validate()}
          placeholder="e.g. AI automation for boutique law firms"
          style={{
            flex: 1, background: '#111', border: '1px solid #222', borderRadius: 8,
            color: '#e5e5e5', fontSize: 14, padding: '10px 14px', outline: 'none',
          }}
        />
        <button
          onClick={validate}
          disabled={loading || !idea.trim()}
          style={{
            background: loading ? '#222' : '#9ef500', color: '#000', fontWeight: 700,
            fontSize: 13, padding: '10px 20px', border: 'none', borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Scoring…' : 'Validate Niche →'}
        </button>
      </div>

      {result && (
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 24 }}>
          {/* Score ring */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
            <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="30" fill="none" stroke="#1a1a1a" strokeWidth="6" />
                <circle
                  cx="36" cy="36" r="30" fill="none"
                  stroke={scoreColor(result.score)} strokeWidth="6"
                  strokeDasharray={`${(result.score / 100) * 188.5} 188.5`}
                  strokeLinecap="round" transform="rotate(-90 36 36)"
                />
              </svg>
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 18, fontWeight: 700,
                color: scoreColor(result.score),
              }}>
                {result.score}
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {statusBadge(result.status)}
              </div>
              <p style={{ color: '#e5e5e5', fontSize: 14, margin: 0 }}>{result.summary}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', marginBottom: 8 }}>STRENGTHS</div>
              {result.strengths.map((s, i) => (
                <div key={i} style={{ fontSize: 13, color: '#9ef500', marginBottom: 4 }}>✓ {s}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', marginBottom: 8 }}>RISKS</div>
              {result.risks.map((r, i) => (
                <div key={i} style={{ fontSize: 13, color: '#f87171', marginBottom: 4 }}>⚠ {r}</div>
              ))}
            </div>
          </div>

          <div style={{ background: '#0a0a0a', borderRadius: 8, padding: 14, fontSize: 13, color: '#ccc' }}>
            <span style={{ color: '#9ef500', fontWeight: 600 }}>Recommendation: </span>
            {result.recommendation}
          </div>
        </div>
      )}
    </div>
  )
}

function OfferTool() {
  const [niche, setNiche] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OfferResult | null>(null)

  async function build() {
    if (!niche.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/arbflow/build-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setResult(data as OfferResult)
      } else {
        setResult(mockOfferResult(niche))
      }
    } catch {
      setResult(mockOfferResult(niche))
    }
    setLoading(false)
  }

  return (
    <div>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
        Describe your niche or validated idea. AI generates a premium digital offer with positioning, deliverables, and pricing.
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input
          value={niche}
          onChange={e => setNiche(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && build()}
          placeholder="e.g. productivity systems for freelance designers"
          style={{
            flex: 1, background: '#111', border: '1px solid #222', borderRadius: 8,
            color: '#e5e5e5', fontSize: 14, padding: '10px 14px', outline: 'none',
          }}
        />
        <button
          onClick={build}
          disabled={loading || !niche.trim()}
          style={{
            background: loading ? '#222' : '#9ef500', color: '#000', fontWeight: 700,
            fontSize: 13, padding: '10px 20px', border: 'none', borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Building…' : 'Build Offer →'}
        </button>
      </div>

      {result && (
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', marginBottom: 4 }}>OFFER TITLE</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#e5e5e5' }}>{result.title}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'FORMAT', value: result.format },
              { label: 'PRICE RANGE', value: result.price },
              { label: 'TARGET BUYER', value: result.targetBuyer },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#0a0a0a', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, color: '#e5e5e5' }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', marginBottom: 8 }}>DELIVERABLES</div>
            {result.deliverables.map((d, i) => (
              <div key={i} style={{ fontSize: 13, color: '#ccc', marginBottom: 6 }}>
                <span style={{ color: '#9ef500', marginRight: 8 }}>◆</span>{d}
              </div>
            ))}
          </div>

          <div style={{ background: '#0a1500', border: '1px solid #1a3000', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', marginBottom: 4 }}>UNIQUE SELLING POINT</div>
            <div style={{ fontSize: 13, color: '#ccc' }}>{result.usp}</div>
          </div>

          <div style={{ background: '#0a0a0a', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', marginBottom: 4 }}>CALL TO ACTION</div>
            <div style={{ fontSize: 13, color: '#9ef500' }}>{result.cta}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function ContentTool() {
  const [offer, setOffer] = useState('')
  const [loading, setLoading] = useState(false)
  const [posts, setPosts] = useState<ContentResult[]>([])

  async function generate() {
    if (!offer.trim()) return
    setLoading(true)
    setPosts([])
    try {
      const res = await fetch('/api/arbflow/content-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setPosts((data.posts ?? []) as ContentResult[])
      } else {
        setPosts(mockContentPosts(offer))
      }
    } catch {
      setPosts(mockContentPosts(offer))
    }
    setLoading(false)
  }

  return (
    <div>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
        Paste your offer or niche. AI generates ready-to-post hooks and captions for Instagram, LinkedIn, and X.
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input
          value={offer}
          onChange={e => setOffer(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && generate()}
          placeholder="e.g. The Freelance Designer Productivity System — $297"
          style={{
            flex: 1, background: '#111', border: '1px solid #222', borderRadius: 8,
            color: '#e5e5e5', fontSize: 14, padding: '10px 14px', outline: 'none',
          }}
        />
        <button
          onClick={generate}
          disabled={loading || !offer.trim()}
          style={{
            background: loading ? '#222' : '#9ef500', color: '#000', fontWeight: 700,
            fontSize: 13, padding: '10px 20px', border: 'none', borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Generating…' : 'Generate Content →'}
        </button>
      </div>

      {posts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {posts.map((post, i) => (
            <div key={i} style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 20 }}>
              <div style={{
                fontSize: 10, color: '#9ef500', fontWeight: 700, letterSpacing: '0.1em',
                marginBottom: 12, textTransform: 'uppercase',
              }}>
                {post.platform}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e5e5', marginBottom: 10 }}>
                {post.hook}
              </div>
              <div style={{ fontSize: 13, color: '#999', whiteSpace: 'pre-line', marginBottom: 12, lineHeight: 1.6 }}>
                {post.body}
              </div>
              <div style={{ fontSize: 13, color: '#facc15' }}>{post.cta}</div>
              <button
                onClick={() => navigator.clipboard.writeText(`${post.hook}\n\n${post.body}\n\n${post.cta}`)}
                style={{
                  marginTop: 12, background: 'transparent', border: '1px solid #333',
                  color: '#666', fontSize: 11, padding: '5px 12px', borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Copy
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Pipeline step types ──────────────────────────────────────────────────────

type StepStatus = 'idle' | 'running' | 'done' | 'error'

interface PipelineState {
  idea:    string
  step:    0 | 1 | 2 | 3   // 0=not started, 1=niche, 2=offer, 3=content
  status:  StepStatus
  niche:   NicheResult  | null
  offer:   OfferResult  | null
  posts:   ContentResult[]
  error:   string | null
}

const STEPS = [
  { n: 1, label: 'Validate Niche',  icon: '⊙', detail: 'Scoring market viability 0–100…'   },
  { n: 2, label: 'Build Offer',     icon: '◻', detail: 'Designing premium digital offer…'   },
  { n: 3, label: 'Generate Content',icon: '✦', detail: 'Writing hooks for 3 platforms…'     },
]

function StepIndicator({ step, current, status }: { step: typeof STEPS[0]; current: number; status: StepStatus }) {
  const done    = current > step.n
  const running = current === step.n && status === 'running'
  const error   = current === step.n && status === 'error'
  const color   = done ? '#9ef500' : running ? '#facc15' : error ? '#f87171' : '#333'
  const textCol = done ? '#9ef500' : running ? '#facc15' : error ? '#f87171' : '#555'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', border: `2px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color, flexShrink: 0,
        background: done ? '#0a1500' : 'transparent',
      }}>
        {done ? '✓' : running ? '…' : step.n}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: textCol }}>{step.label}</div>
        {running && <div style={{ fontSize: 11, color: '#facc15', marginTop: 2 }}>{step.detail}</div>}
      </div>
    </div>
  )
}

// ─── Full pipeline runner ─────────────────────────────────────────────────────

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
  { id: 'niche',   label: 'Niche Validator',  icon: '⊙', tagline: 'Score any idea 0–100'      },
  { id: 'offer',   label: 'Offer Builder',    icon: '◻', tagline: 'Turn niche → premium offer' },
  { id: 'content', label: 'Content Engine',   icon: '✦', tagline: 'Generate platform hooks'    },
]

type Mode = 'pipeline' | 'tools'

export default function ArbFlowPage() {
  const [mode, setMode]             = useState<Mode>('pipeline')
  const [activeTool, setActiveTool] = useState<Tool>('niche')

  // ─── Full pipeline state ───────────────────────────────────────────────────
  const [ps, setPs] = useState<PipelineState>({
    idea: '', step: 0, status: 'idle',
    niche: null, offer: null, posts: [], error: null,
  })

  async function runFullPipeline() {
    const idea = ps.idea.trim()
    if (!idea) return

    // Reset
    setPs(p => ({ ...p, step: 1, status: 'running', niche: null, offer: null, posts: [], error: null }))

    // Step 1 — validate niche
    const niche = await runStep<NicheResult>(
      '/api/arbflow/validate-niche',
      { idea },
      mockNicheResult(idea),
    )
    setPs(p => ({ ...p, step: 2, niche }))

    // Step 2 — build offer (use validated niche summary as niche input)
    const nicheInput = niche.summary ?? idea
    const offer = await runStep<OfferResult>(
      '/api/arbflow/build-offer',
      { niche: nicheInput },
      mockOfferResult(idea),
    )
    setPs(p => ({ ...p, step: 3, offer }))

    // Step 3 — content engine (use offer title + price)
    const offerStr = offer.title ? `${offer.title} — ${offer.price}` : idea
    const contentData = await runStep<{ posts: ContentResult[] }>(
      '/api/arbflow/content-engine',
      { offer: offerStr },
      { posts: mockContentPosts(offerStr) },
    )
    const posts = Array.isArray(contentData.posts) ? contentData.posts : mockContentPosts(offerStr)

    setPs(p => ({ ...p, step: 3, status: 'done', posts }))
  }

  const running = ps.status === 'running'
  const done    = ps.status === 'done'

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.1em', marginBottom: 8 }}>
          NEXUS OS · ARBFLOW
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#e5e5e5', margin: '0 0 8px' }}>
          AI Arbitrage Platform
        </h1>
        <p style={{ color: '#666', fontSize: 14, margin: 0 }}>
          Validate a niche → build an offer → generate content. Three tools, one pipeline.
        </p>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {(['pipeline', 'tools'] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${mode === m ? '#9ef500' : '#222'}`,
            background: mode === m ? '#0a1500' : '#111',
            color: mode === m ? '#9ef500' : '#555',
          }}>
            {m === 'pipeline' ? '▶  One-Click Pipeline' : '⊞  Individual Tools'}
          </button>
        ))}
      </div>

      {/* ── ONE-CLICK PIPELINE MODE ─────────────────────────────────────────── */}
      {mode === 'pipeline' && (
        <div>
          {/* Input + launch */}
          <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', marginBottom: 12 }}>
              ENTER YOUR NICHE IDEA — PIPELINE DOES THE REST
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={ps.idea}
                onChange={e => setPs(p => ({ ...p, idea: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && !running && runFullPipeline()}
                disabled={running}
                placeholder="e.g. AI automation for boutique law firms"
                style={{
                  flex: 1, background: '#111', border: '1px solid #222', borderRadius: 8,
                  color: '#e5e5e5', fontSize: 14, padding: '10px 14px', outline: 'none',
                  opacity: running ? 0.5 : 1,
                }}
              />
              <button
                onClick={done ? () => setPs(p => ({ ...p, step: 0, status: 'idle', niche: null, offer: null, posts: [], error: null })) : runFullPipeline}
                disabled={running || (!done && !ps.idea.trim())}
                style={{
                  background: running ? '#1a1a00' : done ? '#111' : '#9ef500',
                  color: done ? '#9ef500' : '#000',
                  border: done ? '1px solid #9ef500' : 'none',
                  fontWeight: 700, fontSize: 13, padding: '10px 20px',
                  borderRadius: 8, cursor: running ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {running ? 'Running…' : done ? '↺ Run Again' : 'Run Pipeline →'}
              </button>
            </div>
          </div>

          {/* Step progress */}
          {ps.step > 0 && (
            <div style={{
              background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 12,
              padding: '16px 24px', marginBottom: 20, display: 'flex', gap: 32, flexWrap: 'wrap',
            }}>
              {STEPS.map((s, i) => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: i < STEPS.length - 1 ? 0 : 0 }}>
                  <StepIndicator step={s} current={ps.step} status={ps.status} />
                  {i < STEPS.length - 1 && (
                    <div style={{ width: 32, height: 1, background: ps.step > s.n ? '#9ef500' : '#222', margin: '0 8px' }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Results — shown as cards as each step completes */}
          {ps.niche && (
            <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.08em', marginBottom: 12 }}>STEP 1 · NICHE SCORE</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
                  <svg width="56" height="56" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="23" fill="none" stroke="#1a1a1a" strokeWidth="5" />
                    <circle cx="28" cy="28" r="23" fill="none" stroke={scoreColor(ps.niche.score)} strokeWidth="5"
                      strokeDasharray={`${(ps.niche.score / 100) * 144.5} 144.5`}
                      strokeLinecap="round" transform="rotate(-90 28 28)" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: scoreColor(ps.niche.score) }}>
                    {ps.niche.score}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: 6 }}>{statusBadge(ps.niche.status)}</div>
                  <p style={{ fontSize: 13, color: '#ccc', margin: 0 }}>{ps.niche.summary}</p>
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: '#9ef500', background: '#0a1500', borderRadius: 8, padding: 10 }}>
                → {ps.niche.recommendation}
              </div>
            </div>
          )}

          {ps.offer && (
            <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.08em', marginBottom: 12 }}>STEP 2 · OFFER</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#e5e5e5', marginBottom: 12 }}>{ps.offer.title}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {[
                  { label: 'FORMAT',       value: ps.offer.format      },
                  { label: 'PRICE',        value: ps.offer.price       },
                  { label: 'TARGET BUYER', value: ps.offer.targetBuyer },
                  { label: 'CTA',          value: ps.offer.cta         },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: '#0a0a0a', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 12, color: '#e5e5e5' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>DELIVERABLES</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ps.offer.deliverables.map((d, i) => (
                  <span key={i} style={{ fontSize: 12, color: '#ccc', background: '#161616', border: '1px solid #222', borderRadius: 6, padding: '3px 10px' }}>
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {ps.posts.length > 0 && (
            <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.08em', marginBottom: 16 }}>STEP 3 · CONTENT</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ps.posts.map((post, i) => (
                  <div key={i} style={{ background: '#0a0a0a', borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 10, color: '#9ef500', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>{post.platform}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e5e5e5', marginBottom: 8 }}>{post.hook}</div>
                    <div style={{ fontSize: 12, color: '#888', whiteSpace: 'pre-line', marginBottom: 8, lineHeight: 1.6 }}>{post.body}</div>
                    <div style={{ fontSize: 12, color: '#facc15', marginBottom: 10 }}>{post.cta}</div>
                    <button
                      onClick={() => navigator.clipboard.writeText(`${post.hook}\n\n${post.body}\n\n${post.cta}`)}
                      style={{ background: 'transparent', border: '1px solid #222', color: '#555', fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── INDIVIDUAL TOOLS MODE ───────────────────────────────────────────── */}
      {mode === 'tools' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {TOOLS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTool(t.id)}
                style={{
                  flex: 1, background: activeTool === t.id ? '#0a1500' : '#111',
                  border: `1px solid ${activeTool === t.id ? '#9ef500' : '#222'}`,
                  borderRadius: 10, padding: '14px 12px', cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 16, marginBottom: 4 }}>{t.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: activeTool === t.id ? '#9ef500' : '#e5e5e5' }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{t.tagline}</div>
              </button>
            ))}
          </div>
          <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 12, padding: 24 }}>
            {activeTool === 'niche'   && <NicheTool />}
            {activeTool === 'offer'   && <OfferTool />}
            {activeTool === 'content' && <ContentTool />}
          </div>
        </>
      )}
    </div>
  )
}
