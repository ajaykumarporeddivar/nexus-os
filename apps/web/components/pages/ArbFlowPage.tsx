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
      if (res.ok) {
        setResult(await res.json())
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
      if (res.ok) {
        setResult(await res.json())
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
      if (res.ok) {
        const data = await res.json()
        setPosts(data.posts ?? [])
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

// ─── Main Page ────────────────────────────────────────────────────────────────

const TOOLS: { id: Tool; label: string; icon: string; tagline: string }[] = [
  { id: 'niche',   label: 'Niche Validator',  icon: '⊙', tagline: 'Score any idea 0–100'      },
  { id: 'offer',   label: 'Offer Builder',    icon: '◻', tagline: 'Turn niche → premium offer' },
  { id: 'content', label: 'Content Engine',   icon: '✦', tagline: 'Generate platform hooks'    },
]

export default function ArbFlowPage() {
  const [activeTool, setActiveTool] = useState<Tool>('niche')

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
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

      {/* Tool tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
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
            <div style={{
              fontSize: 13, fontWeight: 600,
              color: activeTool === t.id ? '#9ef500' : '#e5e5e5',
            }}>
              {t.label}
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{t.tagline}</div>
          </button>
        ))}
      </div>

      {/* Active tool */}
      <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 12, padding: 24 }}>
        {activeTool === 'niche'   && <NicheTool />}
        {activeTool === 'offer'   && <OfferTool />}
        {activeTool === 'content' && <ContentTool />}
      </div>
    </div>
  )
}
