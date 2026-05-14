'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PROMPT_CATEGORIES, VARIATION_SEEDS, type PromptCategory } from '@/lib/imagePromptData'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImagePromptRow {
  id:          string
  title:       string
  category:    string
  promptJson:  string
  tags:        string[]
  batchId:     string | null
  generatedBy: string
  isFavourite: boolean
  imageData?:  string | null
  imageMime?:  string | null
  imageGenAt?: string | null
  createdAt:   string
}

// ─── Copy button with flash feedback ─────────────────────────────────────────

function CopyButton({ text, label = 'Copy JSON' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setState('copied')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 2000)
    }).catch(() => {
      // Fallback for non-HTTPS or unsupported browsers
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity  = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setState('copied')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all border ${
        state === 'copied'
          ? 'bg-acid/20 border-acid text-acid'
          : 'bg-paper2 border-border text-ink3 hover:border-acid/50 hover:text-acid'
      }`}
    >
      {state === 'copied' ? (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M3 8H2a1 1 0 01-1-1V2a1 1 0 011-1h5a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          {label}
        </>
      )}
    </button>
  )
}

// ─── Free image generation button (Pollinations.ai → HuggingFace FLUX) ───────

function FreeImageButton({ promptId, aspectRatio, onImageSaved }: {
  promptId:     string
  aspectRatio:  '9:16' | '1:1' | '16:9'
  onImageSaved: (id: string, base64: string, mime: string) => void
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const [provider, setProvider] = useState('')

  async function generate() {
    setStatus('loading'); setErrMsg(''); setProvider('')
    try {
      const res = await fetch('/api/image-prompts/render-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: promptId, aspectRatio }),
      })
      const j = await res.json() as {
        ok: boolean
        error?: string
        data?: { id: string; imageData: string; imageMime: string; provider: string }
      }
      if (!j.ok || !j.data) {
        setErrMsg(j.error ?? 'Failed')
        setStatus('error')
        return
      }
      setProvider(j.data.provider)
      onImageSaved(j.data.id, j.data.imageData, j.data.imageMime)
      setStatus('done')
      setTimeout(() => setStatus('idle'), 5000)
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Network error')
      setStatus('error')
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-paper2 border border-border text-[11px] font-mono text-ink3">
        <span className="animate-spin text-green-400">◌</span>
        <span>Free AI generating…</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <span className="text-[10px] text-red-400 font-mono">{errMsg} <button onClick={() => setStatus('idle')} className="underline">retry</button></span>
    )
  }

  return (
    <button
      onClick={generate}
      title="Generate using Pollinations.ai (zero API key) → HuggingFace FLUX fallback"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all border ${
        status === 'done'
          ? 'bg-green-500/20 border-green-400/40 text-green-400'
          : 'bg-paper2 border-green-400/30 text-green-400 hover:bg-green-400/10'
      }`}
    >
      {status === 'done' ? `✓ Free (${provider})` : '★ Free Generate'}
    </button>
  )
}

// ─── Image panel — generate + display + download ─────────────────────────────

type AspectRatio = '9:16' | '1:1' | '16:9'

const ASPECT_OPTS: { v: AspectRatio; l: string; hint: string }[] = [
  { v: '9:16',  l: '9:16',  hint: 'Vertical poster / mobile' },
  { v: '1:1',   l: '1:1',   hint: 'Square / social' },
  { v: '16:9',  l: '16:9',  hint: 'Landscape / banner' },
]

function ImagePanel({ prompt, onImageSaved }: {
  prompt:       ImagePromptRow
  onImageSaved: (id: string, base64: string, mime: string) => void
}) {
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [aspectRatio,  setAspectRatio]  = useState<AspectRatio>('9:16')
  const [flatPrompt,   setFlatPrompt]   = useState('')
  const [durationMs,   setDurationMs]   = useState<number | null>(null)

  // Use stored image if available, otherwise empty
  const storedSrc = prompt.imageData
    ? `data:${prompt.imageMime ?? 'image/png'};base64,${prompt.imageData}`
    : null
  const [imageSrc, setImageSrc] = useState<string | null>(storedSrc)

  async function handleGenerate() {
    setLoading(true); setError(''); setFlatPrompt(''); setDurationMs(null)
    try {
      const res  = await fetch('/api/image-prompts/render', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: prompt.id, aspectRatio }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      const src = `data:${json.data.mimeType};base64,${json.data.base64}`
      setImageSrc(src)
      setFlatPrompt(json.data.flatPrompt)
      setDurationMs(json.data.durationMs)
      onImageSaved(prompt.id, json.data.base64, json.data.mimeType)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function handleDownload() {
    if (!imageSrc) return
    const a = document.createElement('a')
    a.href     = imageSrc
    a.download = `nexus-${prompt.id.slice(0, 8)}-${aspectRatio.replace(':', 'x')}.png`
    a.click()
  }

  // Aspect ratio classes for image container
  const containerClass =
    aspectRatio === '9:16'  ? 'aspect-[9/16]  max-w-[200px]' :
    aspectRatio === '16:9'  ? 'aspect-[16/9]  max-w-full'    :
                              'aspect-square   max-w-[260px]'

  return (
    <div className="mt-3 space-y-3 border-t border-border/30 pt-3">
      {/* Controls row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Aspect ratio selector */}
        <div className="flex items-center gap-1 bg-paper2 border border-border rounded-lg p-0.5">
          {ASPECT_OPTS.map(o => (
            <button
              key={o.v}
              onClick={() => setAspectRatio(o.v)}
              title={o.hint}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all ${
                aspectRatio === o.v ? 'bg-acid text-paper font-bold' : 'text-ink3 hover:text-ink'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-acid/10 border border-acid/30 text-acid hover:bg-acid/20 disabled:opacity-40 transition-all"
        >
          {loading ? (
            <>
              <span className="w-3 h-3 rounded-full border-2 border-acid/30 border-t-acid animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v2M6 9v2M1 6h2M9 6h2M2.5 2.5l1.5 1.5M8 8l1.5 1.5M2.5 9.5L4 8M8 4l1.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              {imageSrc ? 'Regenerate' : 'Generate Image'}
            </>
          )}
        </button>

        {imageSrc && !loading && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-paper2 border border-border text-ink3 hover:border-acid/50 hover:text-acid transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1 10h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Download PNG
          </button>
        )}

        <FreeImageButton
          promptId={prompt.id}
          aspectRatio={aspectRatio}
          onImageSaved={(id, b64, mime) => {
            onImageSaved(id, b64, mime)
          }}
        />

        {durationMs && (
          <span className="text-[10px] font-mono text-green-400 ml-auto">
            ✓ {(durationMs / 1000).toFixed(1)}s · Imagen 3
          </span>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-400/10 border border-red-400/20 text-xs text-red-400 font-mono">
          {error}
        </div>
      )}

      {/* Generated image */}
      {loading && (
        <div className={`${containerClass} mx-auto rounded-xl bg-paper2 border border-border/50 flex items-center justify-center`}>
          <div className="text-center space-y-2 p-6">
            <div className="w-8 h-8 rounded-full border-2 border-acid/30 border-t-acid animate-spin mx-auto" />
            <p className="text-[10px] font-mono text-ink3">Imagen 3 generating…</p>
            <p className="text-[10px] text-ink3 opacity-60">~15–30 seconds</p>
          </div>
        </div>
      )}

      {imageSrc && !loading && (
        <div className="space-y-2">
          <div className={`${containerClass} mx-auto rounded-xl overflow-hidden border border-border/50 shadow-lg group relative`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={prompt.title}
              className="w-full h-full object-cover"
            />
            {/* Hover overlay with download */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-acid text-paper text-xs font-mono font-bold"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Download
              </button>
            </div>
          </div>

          {/* Flat prompt used */}
          {flatPrompt && (
            <details className="group">
              <summary className="text-[10px] font-mono text-ink3 cursor-pointer hover:text-acid transition-colors list-none flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                View flat prompt sent to Imagen 3
              </summary>
              <div className="mt-1.5 bg-paper rounded-lg border border-border/50 p-3 relative">
                <div className="absolute top-2 right-2">
                  <CopyButton text={flatPrompt} label="Copy" />
                </div>
                <p className="text-[10px] font-mono text-ink3 leading-relaxed pr-20 whitespace-pre-wrap">
                  {flatPrompt}
                </p>
              </div>
            </details>
          )}

          {/* Stored image badge */}
          {prompt.imageGenAt && !flatPrompt && (
            <p className="text-[10px] font-mono text-ink3 text-center">
              Previously generated ·{' '}
              {new Date(prompt.imageGenAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Pretty JSON renderer ─────────────────────────────────────────────────────

function PrettyJson({ json }: { json: string }) {
  let parsed: unknown
  let formatted = json
  try {
    parsed    = JSON.parse(json)
    formatted = JSON.stringify(parsed, null, 2)
  } catch {
    // use raw
  }

  // Syntax highlight: keys, strings, numbers
  const highlighted = formatted
    .replace(/(")([\w_]+)(")\s*:/g, '<span class="text-acid">$1$2$3</span>:')
    .replace(/:\s*(")(.*?)(")/g, ': <span class="text-amber-300">$1$2$3</span>')
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="text-blue-300">$1</span>')
    .replace(/:\s*(true|false|null)/g, ': <span class="text-purple-300">$1</span>')

  return (
    <pre
      className="text-[11px] leading-relaxed font-mono text-ink3 whitespace-pre-wrap overflow-y-auto"
      style={{ maxHeight: '340px' }}
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  )
}

// ─── Prompt card ─────────────────────────────────────────────────────────────

function PromptCard({
  prompt,
  onFavourite,
  onDelete,
  onImageSaved,
}: {
  prompt:        ImagePromptRow
  onFavourite:   (id: string, val: boolean) => void
  onDelete:      (id: string) => void
  onImageSaved:  (id: string, base64: string, mime: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const catDef = PROMPT_CATEGORIES.find(c => c.id === prompt.category)

  const relTime = () => {
    const d = Date.now() - new Date(prompt.createdAt).getTime()
    const m = Math.floor(d / 60000)
    const h = Math.floor(m / 60)
    const days = Math.floor(h / 24)
    if (days > 0) return `${days}d ago`
    if (h > 0) return `${h}h ago`
    if (m > 0) return `${m}m ago`
    return 'just now'
  }

  // Parse title from JSON if available
  let parsedTitle = prompt.title
  try {
    const p = JSON.parse(prompt.promptJson)
    if (p.title) parsedTitle = p.title
  } catch { /* use stored title */ }

  return (
    <div className={`card group transition-all border ${prompt.isFavourite ? 'border-acid/40 bg-acid/3' : 'border-border'}`}>
      {/* Card header */}
      <div className="flex items-start gap-3">
        {/* Category badge */}
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-acid/10 border border-acid/20 flex items-center justify-center text-sm">
          {catDef?.id === 'brand'    && '⬡'}
          {catDef?.id === 'campaign' && '▲'}
          {catDef?.id === 'product'  && '◉'}
          {catDef?.id === 'social'   && '◈'}
          {catDef?.id === 'poster'   && '▣'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-ink leading-tight">{parsedTitle}</span>
            {prompt.isFavourite && (
              <span className="text-[10px] font-mono text-acid border border-acid/30 px-1.5 py-0.5 rounded">★ saved</span>
            )}
            {prompt.imageData && (
              <span className="text-[10px] font-mono text-green-400 border border-green-400/30 px-1.5 py-0.5 rounded">🖼 image</span>
            )}
            {prompt.generatedBy === 'scheduled' && (
              <span className="text-[10px] font-mono text-ink3 border border-border px-1.5 py-0.5 rounded">⏱ auto</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="chip text-[10px] bg-acid/10 text-acid border-acid/20">{prompt.category}</span>
            {prompt.tags.filter(t => t !== prompt.category).slice(0, 3).map(tag => (
              <span key={tag} className="chip text-[10px] text-ink3">{tag}</span>
            ))}
            <span className="text-[10px] text-ink3 font-mono">{relTime()}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onFavourite(prompt.id, !prompt.isFavourite)}
            title={prompt.isFavourite ? 'Remove from saved' : 'Save'}
            className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs transition-all ${
              prompt.isFavourite
                ? 'border-acid/40 text-acid bg-acid/10'
                : 'border-border text-ink3 hover:border-acid/40 hover:text-acid'
            }`}
          >
            ★
          </button>
          <button
            onClick={() => onDelete(prompt.id)}
            title="Delete"
            className="w-7 h-7 rounded-lg border border-border text-ink3 hover:border-red-400/40 hover:text-red-400 flex items-center justify-center text-xs transition-all"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Generation notes preview */}
      {(() => {
        try {
          const p = JSON.parse(prompt.promptJson)
          if (p.generation_notes) {
            return (
              <p className="text-[11px] text-ink3 italic mt-2 pl-11 leading-relaxed line-clamp-2">
                {p.generation_notes}
              </p>
            )
          }
        } catch { /* skip */ }
        return null
      })()}

      {/* Expand/collapse JSON */}
      <div className="mt-3">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 text-[11px] text-ink3 hover:text-acid font-mono transition-colors"
        >
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          {expanded ? 'Hide JSON' : 'View JSON'}
          <span className="text-[10px] opacity-50">{prompt.promptJson.length.toLocaleString()} chars</span>
        </button>

        {expanded && (
          <div className="mt-2 bg-paper rounded-xl border border-border/50 p-4 relative">
            {/* Sticky copy bar inside the JSON viewer */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/50">
              <span className="text-[10px] font-mono text-ink3 uppercase tracking-widest">JSON Prompt</span>
              <div className="flex gap-2">
                <CopyButton text={prompt.promptJson} label="Copy JSON" />
                <CopyButton
                  text={JSON.stringify(JSON.parse(prompt.promptJson), null, 2)}
                  label="Copy Pretty"
                />
              </div>
            </div>
            <PrettyJson json={prompt.promptJson} />
          </div>
        )}
      </div>

      {/* Image generation panel */}
      <ImagePanel prompt={prompt} onImageSaved={onImageSaved} />

      {/* Bottom action row — always visible */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
        <CopyButton text={prompt.promptJson} label="Copy prompt →" />
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[11px] text-ink3 hover:text-acid font-mono transition-colors"
        >
          {expanded ? 'Collapse JSON' : 'Expand JSON'}
        </button>
      </div>
    </div>
  )
}

// ─── Generate button with live status ─────────────────────────────────────────

function GeneratePanel({
  onGenerated,
}: {
  onGenerated: (prompt: ImagePromptRow) => void
}) {
  const [category,  setCategory]  = useState<PromptCategory | ''>('')
  const [seed,      setSeed]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [lastMs,    setLastMs]    = useState<number | null>(null)

  const randomSeed = () => setSeed(VARIATION_SEEDS[Math.floor(Math.random() * VARIATION_SEEDS.length)])

  async function handleGenerate() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/image-prompts/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(category ? { category } : {}),
          ...(seed.trim() ? { seed: seed.trim() } : {}),
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setLastMs(json.data.durationMs)
      onGenerated(json.data as ImagePromptRow)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card space-y-4 border-acid/20 bg-acid/3">
      <div className="flex items-center justify-between">
        <div>
          <p className="sec-label text-[10px]">AI Agent</p>
          <p className="font-semibold text-sm">Generate Image Prompt</p>
        </div>
        {lastMs && (
          <span className="text-[10px] font-mono text-green-400">✓ {(lastMs / 1000).toFixed(1)}s</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Category picker */}
        <div>
          <label className="sec-label mb-1 block">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as PromptCategory | '')}
            className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
          >
            <option value="">Random (weighted)</option>
            {PROMPT_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Seed input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="sec-label">Creative seed</label>
            <button
              onClick={randomSeed}
              className="text-[10px] text-acid hover:text-acid/70 font-mono transition-colors"
            >
              ⟳ randomise
            </button>
          </div>
          <input
            type="text"
            value={seed}
            onChange={e => setSeed(e.target.value)}
            placeholder="e.g. operator at night, FORGE UI glow…"
            className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full btn btn-primary text-sm py-2.5 disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 rounded-full border-2 border-paper/30 border-t-paper animate-spin" />
            Generating prompt…
          </span>
        ) : (
          '⬡ Generate JSON Prompt →'
        )}
      </button>

      <p className="text-[10px] text-ink3 font-mono text-center">
        The AI reads full NEXUS OS project context before generating — every prompt is on-brand.
      </p>
    </div>
  )
}

// ─── Batch trigger (manual) ───────────────────────────────────────────────────

function BatchTrigger({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<{ generated: number; failed: number; durationMs: number } | null>(null)
  const [error,   setError]   = useState('')

  async function trigger() {
    if (!confirm('Generate a batch of 10 new prompts? This will take ~60–90 seconds.')) return
    setLoading(true); setError(''); setResult(null)
    try {
      const secret = prompt('Enter CRON_SECRET to run batch manually:')
      if (!secret) { setLoading(false); return }
      const res  = await fetch(`/api/image-prompts/batch?secret=${encodeURIComponent(secret)}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setResult(json.data)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="text-[11px] text-green-400 font-mono">
          ✓ {result.generated} prompts generated in {(result.durationMs / 1000).toFixed(0)}s
        </span>
      )}
      {error && <span className="text-[11px] text-red-400">{error}</span>}
      <button
        onClick={trigger}
        disabled={loading}
        className="btn btn-ghost text-xs disabled:opacity-50"
      >
        {loading ? <span className="animate-pulse">Running batch…</span> : '⏱ Run batch (10×)'}
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImagePromptsPage() {
  const [prompts,     setPrompts]     = useState<ImagePromptRow[]>([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(1)
  const [pages,       setPages]       = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [catFilter,   setCatFilter]   = useState<string>('')
  const [favOnly,     setFavOnly]     = useState(false)

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page:  String(p),
        limit: '12',
        ...(catFilter ? { category: catFilter } : {}),
        ...(favOnly   ? { favourites: 'true' }  : {}),
      })
      const res  = await fetch(`/api/image-prompts/list?${params}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setPrompts(json.data.items)
      setTotal(json.data.total)
      setPages(json.data.pages)
      setPage(p)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [page, catFilter, favOnly])

  useEffect(() => { load(1) }, [catFilter, favOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  function onGenerated(p: ImagePromptRow) {
    setPrompts(prev => [p, ...prev])
    setTotal(t => t + 1)
  }

  function onImageSaved(id: string, base64: string, mime: string) {
    setPrompts(prev => prev.map(p =>
      p.id === id ? { ...p, imageData: base64, imageMime: mime, imageGenAt: new Date().toISOString() } : p
    ))
  }

  async function toggleFavourite(id: string, val: boolean) {
    await fetch('/api/image-prompts/favourite', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isFavourite: val }),
    })
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, isFavourite: val } : p))
  }

  async function deletePrompt(id: string) {
    if (!confirm('Delete this prompt?')) return
    await fetch('/api/image-prompts/favourite', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setPrompts(prev => prev.filter(p => p.id !== id))
    setTotal(t => Math.max(0, t - 1))
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="sec-label mb-1">AI Agent</p>
          <h2 className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>
            Image Prompts
          </h2>
          <p className="text-sm text-ink3 mt-1 max-w-lg">
            AI-generated JSON image prompts for NEXUS OS brand visuals.
            Every prompt is built with full project context — on-brand, art-directed, ready for Midjourney or DALL-E.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold font-mono text-acid">{total}</div>
          <div className="text-[10px] text-ink3 font-mono uppercase tracking-widest">prompts generated</div>
        </div>
      </div>

      {/* Schedule info banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-acid/20 bg-acid/3 text-xs">
        <span className="text-acid text-sm">⏱</span>
        <div>
          <span className="font-semibold text-acid">Auto-generation active</span>
          <span className="text-ink3"> — the scheduler generates 10 new prompts every 6 hours,
          covering all 5 visual categories with diverse creative seeds.
          </span>
        </div>
        <BatchTrigger onDone={() => load(1)} />
      </div>

      {/* Generate panel */}
      <GeneratePanel onGenerated={onGenerated} />

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-paper2 border border-border rounded-xl p-1">
          <button
            onClick={() => setCatFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${!catFilter ? 'bg-acid text-paper font-bold' : 'text-ink3 hover:text-ink'}`}
          >
            All
          </button>
          {PROMPT_CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setCatFilter(catFilter === c.id ? '' : c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${catFilter === c.id ? 'bg-acid text-paper font-bold' : 'text-ink3 hover:text-ink'}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setFavOnly(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all ${
            favOnly ? 'border-acid bg-acid/10 text-acid' : 'border-border text-ink3 hover:border-acid/40'
          }`}
        >
          ★ {favOnly ? 'Saved only' : 'Saved'}
        </button>

        {total > 0 && (
          <span className="text-[11px] text-ink3 font-mono ml-auto">
            {total} prompt{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Prompt grid */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card animate-pulse h-24 bg-paper2" />
          ))}
        </div>
      ) : prompts.length === 0 ? (
        <div className="card text-center py-14 space-y-3">
          <p className="text-4xl">⬡</p>
          <p className="text-sm font-medium">No prompts yet</p>
          <p className="text-xs text-ink3 max-w-xs mx-auto">
            Generate your first prompt above, or wait for the 6-hour scheduler to run.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {prompts.map(prompt => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              onFavourite={toggleFavourite}
              onDelete={deletePrompt}
              onImageSaved={onImageSaved}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => load(page - 1)}
            disabled={page <= 1}
            className="btn btn-ghost text-xs disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-xs text-ink3 font-mono">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => load(page + 1)}
            disabled={page >= pages}
            className="btn btn-ghost text-xs disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
