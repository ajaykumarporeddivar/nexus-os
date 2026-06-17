'use client'

import { useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PostMetric { label: string; score: number }

interface GeneratedPost {
  id:             string
  styleId:        string
  badge:          string
  title:          string
  style:          string
  body:           string
  score:          number
  metrics:        PostMetric[]
  psychology_tip: string
  generatedAt:    string
  error?:         boolean
}

interface StyleDef {
  id:      string
  label:   string
  badge:   string
  trigger: string
}

// ─── Style pill colours (cycled) ──────────────────────────────────────────────

const BADGE_COLOURS = [
  'bg-[#EEEDFE] text-[#3C3489]',
  'bg-[#E1F5EE] text-[#085041]',
  'bg-[#FAEEDA] text-[#633806]',
  'bg-[#E6F1FB] text-[#0C447C]',
  'bg-[#FAECE7] text-[#712B13]',
  'bg-[#EAF3DE] text-[#27500A]',
]

function badgeColour(idx: number) {
  return BADGE_COLOURS[idx % BADGE_COLOURS.length]
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const colour = score >= 9.5 ? '#534AB7' : score >= 9.0 ? '#0F6E56' : score >= 8.5 ? '#854F0B' : '#185FA5'
  return (
    <span className="text-2xl font-semibold flex-shrink-0 tabular-nums" style={{ color: colour }}>
      {score.toFixed(1)}
    </span>
  )
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    })
  }
  return (
    <button
      onClick={copy}
      className={`btn text-xs px-3 py-1.5 rounded-lg border transition-colors ${copied ? 'border-emerald-500 text-emerald-600 bg-emerald-50' : 'border-[#185FA5] text-[#185FA5] hover:bg-[#185FA5]/5'}`}
    >
      {copied ? '✓ Copied!' : '⎘ Copy post'}
    </button>
  )
}

// ─── Single post card ─────────────────────────────────────────────────────────

function PostCard({ post, idx }: { post: GeneratedPost; idx: number }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="border border-border/60 rounded-xl bg-paper p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-semibold text-ink leading-tight">{post.title}</p>
          <p className="text-[11px] text-ink3 leading-tight">{post.style}</p>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md inline-block mt-1 ${badgeColour(idx)}`}>
            {post.badge}
          </span>
        </div>
        {post.score > 0 && <ScoreRing score={post.score} />}
      </div>

      {/* Body */}
      {expanded && (
        <pre className="text-[13px] leading-[1.85] text-ink whitespace-pre-wrap font-sans bg-paper2 border border-border/40 rounded-lg p-4">
          {post.body}
        </pre>
      )}

      {/* Collapse toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="text-[11px] text-ink3 hover:text-ink transition-colors"
      >
        {expanded ? '▲ collapse' : '▼ expand post'}
      </button>

      {/* Metric pills */}
      {post.metrics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {post.metrics.map(m => (
            <span key={m.label} className="text-[11px] px-2.5 py-1 rounded-full border border-border/50 text-ink3">
              <strong className="text-ink">{m.label}:</strong> {m.score.toFixed(1)}
            </span>
          ))}
        </div>
      )}

      {/* Psychology tip */}
      {post.psychology_tip && (
        <div className="border-l-[3px] border-[#7F77DD] rounded-r-lg bg-paper2 px-3 py-2 text-[12px] text-ink3 leading-relaxed">
          {post.psychology_tip}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <CopyBtn text={post.body} />
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CommunityPostsPage() {
  const [posts,      setPosts]      = useState<GeneratedPost[]>([])
  const [styles,     setStyles]     = useState<StyleDef[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [styleId,    setStyleId]    = useState('random')
  const [count,      setCount]      = useState(3)
  const [contactUrl, setContactUrl] = useState('https://nexus-os.vercel.app')
  const [phone,      setPhone]      = useState('+91 8919843305')
  const [activeTab,  setActiveTab]  = useState<'posts' | 'styles' | 'guide'>('posts')
  const [stylesLoaded, setStylesLoaded] = useState(false)

  // Load style list on first render
  const loadStyles = useCallback(async () => {
    if (stylesLoaded) return
    try {
      const res = await fetch('/api/community-posts/generate')
      const json = await res.json() as { ok: boolean; data: { styles: StyleDef[] } }
      if (json.ok) { setStyles(json.data.styles); setStylesLoaded(true) }
    } catch { /* non-fatal */ }
  }, [stylesLoaded])

  const generate = useCallback(async () => {
    setLoading(true)
    setError('')
    if (!stylesLoaded) await loadStyles()
    try {
      const res  = await fetch('/api/community-posts/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ styleId, count, contactUrl, contactWhatsApp: phone }),
      })
      const json = await res.json() as { ok: boolean; data: { posts: GeneratedPost[]; styles: StyleDef[] }; error?: string }
      if (!json.ok) throw new Error(json.error ?? 'Generation failed')
      setPosts(json.data.posts)
      if (json.data.styles.length) setStyles(json.data.styles)
      setActiveTab('posts')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [styleId, count, contactUrl, phone, stylesLoaded, loadStyles])

  const styleOptions = [
    { value: 'random', label: 'Random mix' },
    ...styles.map(s => ({ value: s.id, label: s.label })),
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xl">✦</span>
          <h1 className="text-xl font-bold text-ink">Community Posts</h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-acid/10 text-acid/80 border border-acid/20 font-mono uppercase tracking-widest">NEW</span>
        </div>
        <p className="text-[13px] text-ink3">
          AI-generated founder-targeted posts in 15 styles — one click, different variations every time.
        </p>
      </div>

      {/* Controls card */}
      <div className="border border-border/60 rounded-xl bg-paper p-5 space-y-4">
        <p className="text-[11px] font-bold text-ink3 uppercase tracking-widest font-mono">Generate posts</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Style picker */}
          <div className="space-y-1">
            <label className="text-[11px] text-ink3 font-medium uppercase tracking-wide">Style</label>
            <select
              value={styleId}
              onChange={e => setStyleId(e.target.value)}
              onFocus={loadStyles}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-paper2 text-ink focus:outline-none focus:border-acid/50"
            >
              {styleOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Count */}
          <div className="space-y-1">
            <label className="text-[11px] text-ink3 font-medium uppercase tracking-wide">
              How many{styleId === 'random' ? ' (random mix)' : ''}
            </label>
            <select
              value={count}
              onChange={e => setCount(Number(e.target.value))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-paper2 text-ink focus:outline-none focus:border-acid/50"
            >
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>{n} post{n > 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Contact details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-ink3 font-medium uppercase tracking-wide">Your URL</label>
            <input
              value={contactUrl}
              onChange={e => setContactUrl(e.target.value)}
              placeholder="https://your-site.com"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-paper2 text-ink placeholder:text-ink3 focus:outline-none focus:border-acid/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-ink3 font-medium uppercase tracking-wide">WhatsApp</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+91 XXXXXXXXXX"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-paper2 text-ink placeholder:text-ink3 focus:outline-none focus:border-acid/50"
            />
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={loading}
          className="w-full py-3 rounded-xl font-bold text-sm bg-acid text-paper hover:bg-acid/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Generating posts…
            </>
          ) : (
            <>✦ Generate Posts</>
          )}
        </button>

        {error && (
          <p className="text-[12px] text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>

      {/* Tabs */}
      {(posts.length > 0 || styles.length > 0) && (
        <div className="flex gap-2 flex-wrap">
          {(['posts', 'styles', 'guide'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); if (tab === 'styles') loadStyles() }}
              className={`text-[12px] px-4 py-1.5 rounded-lg border transition-colors ${activeTab === tab ? 'bg-paper2 text-ink border-border font-medium' : 'text-ink3 border-border/40 hover:border-border hover:text-ink'}`}
            >
              {tab === 'posts'  ? `Posts${posts.length > 0 ? ` (${posts.length})` : ''}` :
               tab === 'styles' ? 'All 15 styles' :
               'Founder psychology'}
            </button>
          ))}
        </div>
      )}

      {/* Generated posts */}
      {activeTab === 'posts' && posts.length > 0 && (
        <div className="space-y-4">
          {posts.map((post, idx) => (
            <PostCard key={post.id} post={post} idx={idx} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {activeTab === 'posts' && posts.length === 0 && !loading && (
        <div className="border border-dashed border-border/40 rounded-xl p-12 text-center space-y-2">
          <p className="text-2xl">✦</p>
          <p className="text-sm font-medium text-ink">Click "Generate Posts" to create your first batch</p>
          <p className="text-[12px] text-ink3">15 styles · honest voice · one click · different every time</p>
        </div>
      )}

      {/* Style browser */}
      {activeTab === 'styles' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {styles.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => { setStyleId(s.id); setCount(1); setActiveTab('posts') }}
              className="text-left border border-border/50 rounded-xl p-4 hover:border-acid/40 hover:bg-acid/3 transition-all space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-semibold text-ink leading-tight">{s.label}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${badgeColour(idx)}`}>
                  {s.badge}
                </span>
              </div>
              <p className="text-[11px] text-ink3 leading-relaxed">{s.trigger.slice(0, 90)}…</p>
            </button>
          ))}
        </div>
      )}

      {/* Psychology guide */}
      {activeTab === 'guide' && (
        <div className="border border-border/60 rounded-xl bg-paper p-5 space-y-4">
          <p className="text-sm font-semibold text-ink">The 5 founder psychology triggers in these posts</p>
          {[
            { colour: '#0C447C', label: 'Trigger 1 — Quantified loss (Math post, Opportunity cost)', body: 'Founders are loss-averse. Showing the exact dollar and time cost of the old way — before showing your solution — makes the decision feel rational, not emotional. Logical buyers convert more reliably and refer more often.' },
            { colour: '#085041', label: 'Trigger 2 — Identity alignment (Contrarian, Manifesto)', body: 'High-performing founders see themselves as builders, not buyers. Posts that speak to their identity ("execution beats advice") attract them without selling to them. They choose you because you think the way they think.' },
            { colour: '#633806', label: 'Trigger 3 — Reverse psychology (Math post, Quiet confidence)', body: '"It\'s not for everyone" and "if it\'s not useful, don\'t" signal that you\'re not desperate. Scarcity of access is more powerful than scarcity of product. Serious founders gravitate toward people who are selective.' },
            { colour: '#3C3489', label: 'Trigger 4 — Technical specificity (Technical breakdown)', body: 'CTOs and technical co-founders need proof, not promise. Naming the layers, agent functions, and quality gates converts "interesting marketing" into "this person built something real."' },
            { colour: '#712B13', label: 'Trigger 5 — Micro-commitment (Question post, Direct offer)', body: '"Tell me what you\'re building. That\'s all." asks for the smallest possible action. The person who comments or messages has already said yes to something — which makes every subsequent yes easier.' },
          ].map(t => (
            <div key={t.label} className="border border-border/40 rounded-lg p-4 space-y-1">
              <p className="text-[12px] font-semibold" style={{ color: t.colour }}>{t.label}</p>
              <p className="text-[12px] text-ink3 leading-relaxed">{t.body}</p>
            </div>
          ))}

          <div className="border-t border-border/30 pt-4 space-y-2">
            <p className="text-[11px] font-bold text-ink3 uppercase tracking-widest">Voice rules</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-emerald-700">✓ Always say</p>
                <p className="text-[11px] text-ink3 leading-relaxed">"I built this because…" · "This is for serious people" · "Try it yourself and decide" · "Time and results — that's it"</p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-red-600">✗ Never say</p>
                <p className="text-[11px] text-ink3 leading-relaxed">"Game-changer" · "Revolutionary" · "You won't believe" · "Limited time" · "Act now" · "Insane results"</p>
              </div>
            </div>
          </div>

          <div className="bg-paper2 border border-border/40 rounded-lg p-4 space-y-1">
            <p className="text-[11px] font-bold text-ink3 uppercase tracking-widest">When someone messages on WhatsApp</p>
            <p className="text-[12px] text-ink3 leading-relaxed">Start simple: "What are you building, and what's the hardest part right now?" — let them talk. Listen fully before you say anything about what you offer. Serious clients respect that more than any pitch.</p>
          </div>
        </div>
      )}
    </div>
  )
}
