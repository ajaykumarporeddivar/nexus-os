'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { HOOK_TYPES, ICP_TARGETS, VIDEO_SEEDS, type HookType, type ICPTarget } from '@/lib/videoPromptData'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoPromptRow {
  id:            string
  title:         string
  hookType:      string
  targetICP:     string | null
  painPoint:     string | null
  promptJson:    string
  voiceoverText: string | null
  ctaText:       string | null
  tags:          string[]
  generatedBy:   string
  isFavourite:   boolean
  createdAt:     string
}

interface ParsedShot {
  shot_id:          number
  start_time:       number
  end_time:         number
  duration:         number
  type:             string
  scene?:           { environment?: string; atmosphere?: string }
  character?:       { action?: string; expression?: string }
  camera?:          { shot_size?: string; movement?: string; type?: string }
  audio?:           { voiceover?: string; sfx?: string[]; music_mood?: string }
  text_overlay?:    { enabled?: boolean; text?: string; style?: string; position?: string; animation?: string }
  motion_keywords?: string[]
  transition_to_next?: string
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function copy() {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    })
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all border ${
        copied ? 'bg-acid/20 border-acid text-acid' : 'bg-paper2 border-border text-ink3 hover:border-acid/50 hover:text-acid'
      }`}
    >
      {copied ? '✓ Copied!' : label}
    </button>
  )
}

// ─── Shot timeline ────────────────────────────────────────────────────────────

const SHOT_TYPE_COLOR: Record<string, string> = {
  hook:         'bg-red-500/20 border-red-500/40 text-red-400',
  proof:        'bg-blue-500/20 border-blue-500/40 text-blue-400',
  demo:         'bg-purple-500/20 border-purple-500/40 text-purple-400',
  social_proof: 'bg-green-500/20 border-green-500/40 text-green-400',
  cta:          'bg-acid/20 border-acid/40 text-acid',
  transition:   'bg-paper3 border-border text-ink3',
}

function ShotTimeline({ shots }: { shots: ParsedShot[] }) {
  const total = shots.reduce((s, sh) => s + sh.duration, 0)
  const [active, setActive] = useState<number | null>(null)

  return (
    <div className="space-y-3">
      {/* Visual timeline bar */}
      <div className="flex h-6 rounded-lg overflow-hidden border border-border/50 gap-px">
        {shots.map(sh => (
          <button
            key={sh.shot_id}
            onClick={() => setActive(active === sh.shot_id ? null : sh.shot_id)}
            title={`Shot ${sh.shot_id}: ${sh.type} (${sh.duration}s)`}
            style={{ width: `${(sh.duration / total) * 100}%` }}
            className={`h-full flex items-center justify-center text-[9px] font-mono font-bold transition-all ${
              SHOT_TYPE_COLOR[sh.type] ?? 'bg-paper2 text-ink3'
            } ${active === sh.shot_id ? 'ring-1 ring-inset ring-white/30' : 'hover:brightness-125'}`}
          >
            {sh.duration}s
          </button>
        ))}
      </div>

      {/* Timeline labels */}
      <div className="flex text-[9px] font-mono text-ink3 gap-px">
        {shots.map(sh => (
          <div key={sh.shot_id} style={{ width: `${(sh.duration / total) * 100}%` }} className="text-center truncate px-0.5">
            {sh.type}
          </div>
        ))}
      </div>

      {/* Expanded shot detail */}
      {active !== null && (() => {
        const sh = shots.find(s => s.shot_id === active)
        if (!sh) return null
        return (
          <div className="bg-paper rounded-xl border border-border p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`chip text-[10px] ${SHOT_TYPE_COLOR[sh.type] ?? ''}`}>{sh.type}</span>
                <span className="font-mono text-ink3">{sh.start_time}s → {sh.end_time}s ({sh.duration}s)</span>
              </div>
              <button onClick={() => setActive(null)} className="text-ink3 hover:text-ink text-sm">✕</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sh.scene?.environment && (
                <div>
                  <p className="sec-label text-[9px] mb-1">Scene</p>
                  <p className="text-ink2">{sh.scene.environment}</p>
                  {sh.scene.atmosphere && <p className="text-ink3 italic mt-0.5">{sh.scene.atmosphere}</p>}
                </div>
              )}
              {sh.character && (
                <div>
                  <p className="sec-label text-[9px] mb-1">Character</p>
                  <p className="text-ink2">{sh.character.action}</p>
                  {sh.character.expression && <p className="text-ink3 italic mt-0.5">{sh.character.expression}</p>}
                </div>
              )}
              {sh.camera && (
                <div>
                  <p className="sec-label text-[9px] mb-1">Camera</p>
                  <p className="text-ink2 font-mono">{sh.camera.shot_size} · {sh.camera.movement} · {sh.camera.type}</p>
                </div>
              )}
              {sh.audio && (
                <div>
                  <p className="sec-label text-[9px] mb-1">Audio</p>
                  {sh.audio.voiceover && <p className="text-acid italic">"{sh.audio.voiceover}"</p>}
                  <p className="text-ink3 font-mono mt-0.5">{sh.audio.music_mood}</p>
                  {sh.audio.sfx?.length ? (
                    <p className="text-ink3 font-mono text-[10px]">{sh.audio.sfx.join(', ')}</p>
                  ) : null}
                </div>
              )}
            </div>

            {sh.text_overlay?.enabled && sh.text_overlay.text && (
              <div className="bg-paper2 rounded-lg px-3 py-2">
                <p className="sec-label text-[9px] mb-1">Text overlay</p>
                <p className="font-bold text-acid">"{sh.text_overlay.text}"</p>
                <p className="text-ink3 font-mono text-[10px]">{sh.text_overlay.style} · {sh.text_overlay.position} · {sh.text_overlay.animation}</p>
              </div>
            )}

            {sh.motion_keywords?.length ? (
              <div>
                <p className="sec-label text-[9px] mb-1">Motion keywords (Nano Banana)</p>
                <div className="flex flex-wrap gap-1">
                  {sh.motion_keywords.map(kw => (
                    <span key={kw} className="chip text-[10px] font-mono bg-acid/5 border-acid/20 text-acid">{kw}</span>
                  ))}
                </div>
              </div>
            ) : null}

            {sh.transition_to_next && sh.transition_to_next !== 'none' && (
              <p className="text-[10px] font-mono text-ink3">
                → Transition: <span className="text-ink2">{sh.transition_to_next}</span>
              </p>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ─── VO Script reader ─────────────────────────────────────────────────────────

function VOScript({ parsed }: { parsed: Record<string, unknown> }) {
  const vs = parsed.voiceover_script as Record<string, string> | undefined
  if (!vs?.full_text) return null

  return (
    <div className="bg-paper2 rounded-xl border border-border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="sec-label text-[10px]">Voiceover Script</p>
        <CopyButton text={vs.full_text} label="Copy VO" />
      </div>
      <p className="text-sm text-ink2 italic leading-relaxed">"{vs.full_text}"</p>
      <div className="flex gap-2 flex-wrap pt-1">
        {vs.tone    && <span className="chip text-[10px]">{vs.tone}</span>}
        {vs.pacing  && <span className="chip text-[10px]">{vs.pacing}</span>}
        {vs.hook_line && (
          <div className="w-full">
            <span className="text-[10px] font-mono text-red-400">Hook: </span>
            <span className="text-[10px] text-ink3 italic">"{vs.hook_line}"</span>
          </div>
        )}
        {vs.cta_line && (
          <div className="w-full">
            <span className="text-[10px] font-mono text-acid">CTA: </span>
            <span className="text-[10px] text-ink3 italic">"{vs.cta_line}"</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Lead strategy card ───────────────────────────────────────────────────────

function LeadStrategy({ parsed }: { parsed: Record<string, unknown> }) {
  const ls = parsed.lead_strategy as Record<string, string> | undefined
  const perf = parsed.performance as Record<string, string | number> | undefined
  if (!ls && !perf) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {ls && (
        <div className="bg-paper2 rounded-xl border border-border p-3 space-y-2">
          <p className="sec-label text-[10px]">Lead Strategy</p>
          <div className="space-y-1 text-xs">
            {[
              ['Funnel', ls.funnel_stage],
              ['Awareness', ls.awareness_level],
              ['Angle', ls.ad_angle],
              ['Objection', ls.objection_handled],
            ].map(([k, v]) => v ? (
              <div key={k} className="flex gap-2">
                <span className="text-ink3 w-20 flex-shrink-0">{k}</span>
                <span className="text-ink2">{v}</span>
              </div>
            ) : null)}
          </div>
          {ls.follow_up_hook && (
            <div className="border-t border-border/50 pt-2">
              <p className="text-[10px] text-ink3 font-mono">After-watch search:</p>
              <p className="text-xs text-acid italic">"{ls.follow_up_hook}"</p>
            </div>
          )}
        </div>
      )}
      {perf && (
        <div className="bg-paper2 rounded-xl border border-border p-3 space-y-2">
          <p className="sec-label text-[10px]">Performance Targets</p>
          <div className="space-y-1 text-xs">
            {[
              ['Hook rate', perf.hook_rate_target],
              ['CTA at', perf.cta_position],
              ['Thumb-stop', perf.thumb_stop_frame !== undefined ? `Frame at ${perf.thumb_stop_frame}s` : null],
              ['Captions', perf.caption_style],
            ].map(([k, v]) => v ? (
              <div key={k as string} className="flex gap-2">
                <span className="text-ink3 w-24 flex-shrink-0">{k as string}</span>
                <span className="text-ink2 font-mono">{v as string}</span>
              </div>
            ) : null)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Video prompt card ────────────────────────────────────────────────────────

function VideoCard({
  prompt, onFavourite, onDelete,
}: {
  prompt:      VideoPromptRow
  onFavourite: (id: string, val: boolean) => void
  onDelete:    (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hookDef = HOOK_TYPES.find(h => h.id === prompt.hookType)
  const icpDef  = ICP_TARGETS.find(i => i.id === prompt.targetICP)

  const relTime = () => {
    const d = Date.now() - new Date(prompt.createdAt).getTime()
    const m = Math.floor(d / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24)
    if (days > 0) return `${days}d ago`; if (h > 0) return `${h}h ago`
    if (m > 0) return `${m}m ago`; return 'just now'
  }

  let parsed: Record<string, unknown> = {}
  let shots: ParsedShot[] = []
  let totalDuration = 0
  try {
    parsed = JSON.parse(prompt.promptJson)
    shots  = (parsed.shots as ParsedShot[]) ?? []
    totalDuration = shots.reduce((s, sh) => s + sh.duration, 0)
  } catch { /* use raw */ }

  const usp = parsed.unique_selling_point as string | undefined

  return (
    <div className={`card group transition-all border space-y-0 p-0 overflow-hidden ${prompt.isFavourite ? 'border-acid/40' : 'border-border'}`}>

      {/* Header strip */}
      <div className="flex items-start gap-3 p-4">
        {/* Type icon */}
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-acid/10 border border-acid/20 flex items-center justify-center text-base">
          {hookDef?.id === 'pain_point'     && '😤'}
          {hookDef?.id === 'transformation' && '⚡'}
          {hookDef?.id === 'social_proof'   && '🏆'}
          {hookDef?.id === 'curiosity'      && '👀'}
          {hookDef?.id === 'before_after'   && '↔'}
          {hookDef?.id === 'demo_reveal'    && '📱'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{prompt.title}</span>
            {prompt.isFavourite && <span className="text-[10px] font-mono text-acid border border-acid/30 px-1.5 py-0.5 rounded">★ saved</span>}
            {prompt.generatedBy === 'scheduled' && <span className="text-[10px] font-mono text-ink3 border border-border px-1.5 py-0.5 rounded">⏱ auto</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="chip text-[10px] bg-red-500/10 text-red-400 border-red-500/20">{hookDef?.label ?? prompt.hookType}</span>
            {icpDef && <span className="chip text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">{icpDef.label}</span>}
            <span className="chip text-[10px]">{totalDuration}s · {shots.length} shots</span>
            <span className="text-[10px] text-ink3 font-mono">{relTime()}</span>
          </div>
          {prompt.painPoint && (
            <p className="text-[11px] text-ink3 italic mt-1 line-clamp-1">Pain: "{prompt.painPoint}"</p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onFavourite(prompt.id, !prompt.isFavourite)}
            className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs transition-all ${prompt.isFavourite ? 'border-acid/40 text-acid bg-acid/10' : 'border-border text-ink3 hover:border-acid/40 hover:text-acid'}`}>★</button>
          <button onClick={() => onDelete(prompt.id)}
            className="w-7 h-7 rounded-lg border border-border text-ink3 hover:border-red-400/40 hover:text-red-400 flex items-center justify-center text-xs transition-all">✕</button>
        </div>
      </div>

      {/* Shot timeline — always visible */}
      {shots.length > 0 && (
        <div className="px-4 pb-3">
          <ShotTimeline shots={shots} />
        </div>
      )}

      {/* Quick VO preview */}
      {prompt.voiceoverText && (
        <div className="mx-4 mb-3 px-3 py-2 bg-paper2 rounded-lg border border-border/50 flex items-start justify-between gap-2">
          <p className="text-[11px] text-ink3 italic line-clamp-2 flex-1">"{prompt.voiceoverText}"</p>
          <CopyButton text={prompt.voiceoverText} label="Copy VO" />
        </div>
      )}

      {/* CTA line */}
      {prompt.ctaText && (
        <div className="mx-4 mb-3 flex items-center gap-2">
          <span className="text-[10px] font-mono text-acid flex-shrink-0">CTA →</span>
          <p className="text-[11px] text-ink2 italic flex-1 truncate">"{prompt.ctaText}"</p>
          <CopyButton text={prompt.ctaText} label="Copy CTA" />
        </div>
      )}

      {/* USP */}
      {usp && (
        <div className="mx-4 mb-3">
          <p className="text-[10px] text-ink3"><span className="text-acid font-mono">USP: </span>{usp}</p>
        </div>
      )}

      {/* Expand toggle */}
      <div className="px-4 pb-3">
        <button onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 text-[11px] text-ink3 hover:text-acid font-mono transition-colors">
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          {expanded ? 'Collapse' : 'Full detail + JSON'}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border/30 px-4 py-4 space-y-4">
          <VOScript parsed={parsed} />
          <LeadStrategy parsed={parsed} />

          {/* Tags */}
          {prompt.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {prompt.tags.map(t => <span key={t} className="chip text-[10px]">{t}</span>)}
            </div>
          )}

          {/* Raw JSON */}
          <div className="bg-paper rounded-xl border border-border/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono text-ink3 uppercase tracking-widest">Nano Banana JSON</span>
              <div className="flex gap-2">
                <CopyButton text={prompt.promptJson} label="Copy JSON" />
                <CopyButton text={JSON.stringify(JSON.parse(prompt.promptJson), null, 2)} label="Copy Pretty" />
              </div>
            </div>
            <pre className="text-[10px] font-mono text-ink3 whitespace-pre-wrap overflow-y-auto max-h-72 leading-relaxed">
              {JSON.stringify(JSON.parse(prompt.promptJson), null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border/30 bg-paper2/50 flex-wrap">
        <CopyButton text={prompt.promptJson} label="Copy full JSON →" />
        {prompt.voiceoverText && <CopyButton text={prompt.voiceoverText} label="Copy VO script" />}
        <FreeVideoButton promptId={prompt.id} />
        <span className="ml-auto text-[10px] font-mono text-ink3">{shots.length} shots · {totalDuration}s · Nano Banana</span>
      </div>
    </div>
  )
}

// ─── Free video generation button ─────────────────────────────────────────────
// Uses HuggingFace CogVideoX-2b (open-source, Apache 2.0) → ModelScope fallback
// → Replicate fallback. No extra API key required (HF_TOKEN for higher limits).

function FreeVideoButton({ promptId }: { promptId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function generate() {
    setStatus('loading'); setErrMsg('')
    try {
      const res = await fetch('/api/video-prompts/render-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: promptId }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string; hint?: string }
        setErrMsg((j.error ?? 'Failed') + (j.hint ? ` — ${j.hint}` : ''))
        setStatus('error')
        return
      }

      // Trigger download from the binary response
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `nexus-ugc-${promptId.slice(0, 8)}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStatus('done')
      setTimeout(() => setStatus('idle'), 4000)
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Network error')
      setStatus('error')
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-paper2 border border-border text-[11px] font-mono text-ink3">
        <span className="animate-spin text-acid">◌</span>
        <span>Generating video (60–180s)…</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 flex-1">
        <span className="text-[10px] text-red-400 font-mono flex-1 truncate">{errMsg}</span>
        <button onClick={() => setStatus('idle')} className="text-[10px] text-ink3 hover:text-acid font-mono">retry</button>
      </div>
    )
  }

  return (
    <button
      onClick={generate}
      title="Generate MP4 using free open-source AI (HuggingFace CogVideoX / ModelScope)"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all border ${
        status === 'done'
          ? 'bg-green-500/20 border-green-400/40 text-green-400'
          : 'bg-paper2 border-border text-ink3 hover:border-green-400/40 hover:text-green-400'
      }`}
    >
      {status === 'done' ? '✓ Downloaded!' : '▶ Free AI Video'}
    </button>
  )
}

// ─── Generate panel ───────────────────────────────────────────────────────────

function GeneratePanel({ onGenerated }: { onGenerated: (p: VideoPromptRow) => void }) {
  const [hookType,  setHookType]  = useState<HookType | ''>('')
  const [icpTarget, setIcpTarget] = useState<ICPTarget | ''>('')
  const [seed,      setSeed]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [lastMs,    setLastMs]    = useState<number | null>(null)

  async function generate() {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/video-prompts/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...(hookType  ? { hookType }  : {}),
          ...(icpTarget ? { icpTarget } : {}),
          ...(seed.trim() ? { seed: seed.trim() } : {}),
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setLastMs(json.data.durationMs)
      onGenerated(json.data as VideoPromptRow)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false) }
  }

  return (
    <div className="card space-y-4 border-acid/20 bg-acid/3">
      <div className="flex items-center justify-between">
        <div>
          <p className="sec-label text-[10px]">AI Agent</p>
          <p className="font-semibold text-sm">Generate UGC Video Prompt</p>
        </div>
        {lastMs && <span className="text-[10px] font-mono text-green-400">✓ {(lastMs/1000).toFixed(1)}s</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="sec-label mb-1 block">Hook type</label>
          <select value={hookType} onChange={e => setHookType(e.target.value as HookType | '')}
            className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid">
            <option value="">Random</option>
            {HOOK_TYPES.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
          </select>
        </div>
        <div>
          <label className="sec-label mb-1 block">Target ICP</label>
          <select value={icpTarget} onChange={e => setIcpTarget(e.target.value as ICPTarget | '')}
            className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid">
            <option value="">Random</option>
            {ICP_TARGETS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="sec-label">Creative seed</label>
            <button onClick={() => setSeed(VIDEO_SEEDS[Math.floor(Math.random() * VIDEO_SEEDS.length)])}
              className="text-[10px] text-acid hover:opacity-70 font-mono">⟳ randomise</button>
          </div>
          <input type="text" value={seed} onChange={e => setSeed(e.target.value)}
            placeholder="e.g. 2am desk, FORGE pipeline reveal…"
            className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid" />
        </div>
      </div>

      {/* Hook type cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {HOOK_TYPES.map(h => (
          <button key={h.id} onClick={() => setHookType(hookType === h.id ? '' : h.id)}
            className={`text-left p-2.5 rounded-xl border transition-all ${hookType === h.id ? 'border-acid bg-acid/10' : 'border-border hover:border-acid/30'}`}>
            <p className="text-xs font-semibold">{h.label}</p>
            <p className="text-[10px] text-ink3 mt-0.5 line-clamp-1">{h.desc}</p>
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button onClick={generate} disabled={loading}
        className="w-full btn btn-primary text-sm py-2.5 disabled:opacity-50">
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 rounded-full border-2 border-paper/30 border-t-paper animate-spin"/>
            Generating 8-second UGC prompt…
          </span>
        ) : '▶ Generate Video Prompt →'}
      </button>

      <p className="text-[10px] text-ink3 font-mono text-center">
        Shot-level JSON · Nano Banana compatible · Includes VO script + lead strategy + motion keywords
      </p>
    </div>
  )
}

// ─── Batch trigger ────────────────────────────────────────────────────────────

function BatchTrigger({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<{ generated: number; durationMs: number } | null>(null)
  const [error,   setError]   = useState('')

  async function trigger() {
    if (!confirm('Generate 10 UGC video prompts? Takes ~90–120 seconds.')) return
    setLoading(true); setError(''); setResult(null)
    // eslint-disable-next-line no-alert
    const secret = window.prompt('Enter CRON_SECRET:')
    if (!secret) { setLoading(false); return }
    try {
      const res  = await fetch(`/api/video-prompts/batch?secret=${encodeURIComponent(secret)}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setResult(json.data); onDone()
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }

  return (
    <div className="flex items-center gap-3">
      {result  && <span className="text-[11px] text-green-400 font-mono">✓ {result.generated} prompts in {(result.durationMs/1000).toFixed(0)}s</span>}
      {error   && <span className="text-[11px] text-red-400">{error}</span>}
      <button onClick={trigger} disabled={loading} className="btn btn-ghost text-xs disabled:opacity-50">
        {loading ? <span className="animate-pulse">Running…</span> : '⏱ Run batch (10×)'}
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VideoPromptsPage() {
  const [prompts,   setPrompts]   = useState<VideoPromptRow[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [pages,     setPages]     = useState(1)
  const [loading,   setLoading]   = useState(true)
  const [hookFilter, setHookFilter] = useState('')
  const [icpFilter,  setIcpFilter]  = useState('')
  const [favOnly,    setFavOnly]    = useState(false)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(p), limit: '10',
        ...(hookFilter ? { hookType:  hookFilter }  : {}),
        ...(icpFilter  ? { icpTarget: icpFilter }   : {}),
        ...(favOnly    ? { favourites: 'true' }      : {}),
      })
      const res  = await fetch(`/api/video-prompts/list?${params}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setPrompts(json.data.items); setTotal(json.data.total)
      setPages(json.data.pages);   setPage(p)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [hookFilter, icpFilter, favOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(1) }, [hookFilter, icpFilter, favOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleFavourite(id: string, val: boolean) {
    await fetch('/api/video-prompts/favourite', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isFavourite: val }),
    })
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, isFavourite: val } : p))
  }

  async function deletePrompt(id: string) {
    if (!confirm('Delete this video prompt?')) return
    await fetch('/api/video-prompts/favourite', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
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
          <h2 className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>Video Prompts</h2>
          <p className="text-sm text-ink3 mt-1 max-w-lg">
            8-second UGC ad video prompts for NEXUS OS. Shot-level JSON compatible with Nano Banana.
            Includes voiceover script, motion keywords, lead strategy, and CTA copy.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold font-mono text-acid">{total}</div>
          <div className="text-[10px] text-ink3 font-mono uppercase tracking-widest">prompts generated</div>
        </div>
      </div>

      {/* Nano Banana info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: '🎬', label: '8 seconds', sub: 'Hook → Proof → CTA' },
          { icon: '📱', label: '9:16 vertical', sub: 'TikTok/Reels/Shorts' },
          { icon: '⚡', label: 'Nano Banana', sub: 'Shot-level JSON' },
          { icon: '🎯', label: 'Lead-gen baked', sub: 'ICP + funnel stage' },
        ].map(c => (
          <div key={c.label} className="card p-3 text-center space-y-0.5 border-border/50">
            <div className="text-xl">{c.icon}</div>
            <p className="text-xs font-semibold">{c.label}</p>
            <p className="text-[10px] text-ink3">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Schedule banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-acid/20 bg-acid/3 text-xs flex-wrap">
        <span className="text-acid">⏱</span>
        <span>
          <span className="font-semibold text-acid">Auto-generation active</span>
          <span className="text-ink3"> — 10 UGC video prompts every 6 hours across all 6 hook types and 4 ICP targets.</span>
        </span>
        <BatchTrigger onDone={() => load(1)} />
      </div>

      {/* Generate panel */}
      <GeneratePanel onGenerated={p => { setPrompts(prev => [p, ...prev]); setTotal(t => t + 1) }} />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-paper2 border border-border rounded-xl p-1 flex-wrap">
          <button onClick={() => setHookFilter('')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${!hookFilter ? 'bg-acid text-paper font-bold' : 'text-ink3 hover:text-ink'}`}>
            All hooks
          </button>
          {HOOK_TYPES.map(h => (
            <button key={h.id} onClick={() => setHookFilter(hookFilter === h.id ? '' : h.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${hookFilter === h.id ? 'bg-acid text-paper font-bold' : 'text-ink3 hover:text-ink'}`}>
              {h.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-paper2 border border-border rounded-xl p-1">
          <button onClick={() => setIcpFilter('')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${!icpFilter ? 'bg-acid text-paper font-bold' : 'text-ink3 hover:text-ink'}`}>
            All ICPs
          </button>
          {ICP_TARGETS.map(i => (
            <button key={i.id} onClick={() => setIcpFilter(icpFilter === i.id ? '' : i.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${icpFilter === i.id ? 'bg-acid text-paper font-bold' : 'text-ink3 hover:text-ink'}`}>
              {i.label}
            </button>
          ))}
        </div>

        <button onClick={() => setFavOnly(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all ${favOnly ? 'border-acid bg-acid/10 text-acid' : 'border-border text-ink3 hover:border-acid/40'}`}>
          ★ Saved
        </button>

        {total > 0 && <span className="text-[11px] text-ink3 font-mono ml-auto">{total} prompt{total !== 1 ? 's' : ''}</span>}
      </div>

      {/* Prompt list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="card animate-pulse h-32 bg-paper2" />)}
        </div>
      ) : prompts.length === 0 ? (
        <div className="card text-center py-14 space-y-3">
          <p className="text-4xl">🎬</p>
          <p className="text-sm font-medium">No video prompts yet</p>
          <p className="text-xs text-ink3 max-w-xs mx-auto">Generate your first 8-second UGC prompt above, or wait for the 6-hour scheduler.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {prompts.map(p => (
            <VideoCard key={p.id} prompt={p} onFavourite={toggleFavourite} onDelete={deletePrompt} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => load(page - 1)} disabled={page <= 1} className="btn btn-ghost text-xs disabled:opacity-30">← Prev</button>
          <span className="text-xs text-ink3 font-mono">Page {page} of {pages}</span>
          <button onClick={() => load(page + 1)} disabled={page >= pages} className="btn btn-ghost text-xs disabled:opacity-30">Next →</button>
        </div>
      )}
    </div>
  )
}
