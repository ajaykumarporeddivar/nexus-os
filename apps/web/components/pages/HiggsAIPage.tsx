'use client'

import { useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'

// ─── Types ────────────────────────────────────────────────────────────────────

type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '4:5' | '21:9'
type Resolution  = '1k' | '2k' | '4k'
type ModelId     = 'cinematic_studio_2_5' | 'marketing_studio_image' | 'nano_banana_2' | 'flux_2' | 'gpt_image_2' | 'soul_cast'

interface GeneratedImage {
  id:          string
  url:         string
  prompt:      string
  model:       ModelId
  aspect:      AspectRatio
  resolution:  Resolution
  createdAt:   string
}

// ─── Model catalogue ──────────────────────────────────────────────────────────

const MODELS: { id: ModelId; name: string; tag: string; description: string; bestFor: string }[] = [
  {
    id:          'cinematic_studio_2_5',
    name:        'Cinema Studio 2.5',
    tag:         'CINEMATIC',
    description: 'Dramatic 4K cinematic stills — deep shadows, lens flares, film-grade lighting',
    bestFor:     'Hero images, product launches, dark dramatic visuals',
  },
  {
    id:          'marketing_studio_image',
    name:        'Marketing Studio',
    tag:         'ADS',
    description: 'One-click product ad images — optimised for social campaigns and paid media',
    bestFor:     'Social ads, product shots, campaign creatives',
  },
  {
    id:          'nano_banana_2',
    name:        'Nano Banana Pro',
    tag:         'DIAGRAMS',
    description: 'Ultimate quality with crisp text rendering — perfect for infographics and diagrams',
    bestFor:     'Infographics, tech diagrams, text-heavy visuals',
  },
  {
    id:          'flux_2',
    name:        'Flux 2.0',
    tag:         'PRECISE',
    description: 'Pixel-perfect prompt adherence — what you describe is exactly what you get',
    bestFor:     'Concept art, precise compositions, detailed scenes',
  },
  {
    id:          'gpt_image_2',
    name:        'GPT Image 2',
    tag:         'TEXT',
    description: 'Best-in-class typography rendering — logos, overlays, UI mockups',
    bestFor:     'Text overlays, logos, UI screenshots, infographics',
  },
  {
    id:          'soul_cast',
    name:        'Soul Cast',
    tag:         'CHARACTER',
    description: 'Consistent cinematic character identity across multiple generations',
    bestFor:     'Avatars, personas, character sheets',
  },
]

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: '16:9',  label: '16:9 — Landscape' },
  { value: '9:16',  label: '9:16 — Portrait' },
  { value: '1:1',   label: '1:1 — Square' },
  { value: '4:3',   label: '4:3 — Classic' },
  { value: '4:5',   label: '4:5 — Instagram' },
  { value: '21:9',  label: '21:9 — Ultra-wide' },
]

const RESOLUTIONS: Resolution[] = ['1k', '2k', '4k']

// ─── Preset prompts for NEXUS OS pipeline imagery ─────────────────────────────

const NEXUS_PRESETS = [
  {
    label:  'Pipeline Hero',
    prompt: 'Ultra-cinematic dark hero image. A sleek black glass terminal floats in deep void space. From a single glowing neon-green LAUNCH button an explosive cascade of electric-green energy beams splits into a pipeline: three glowing orb nodes labeled FORGE, BUILD, DEPLOY. Each node pulses with energy, surrounded by data streams. At the end a blazing green URL appears. Title text: ONE CLICK PIPELINE. Subtitle: Brief → FORGE → BUILD → Live URL in 4 minutes. 19 agent icons orbit the nodes. Background: deep black with green aurora. NEXUS OS logo top-left. Cinematic depth of field, lens flare, awe-inspiring.',
    model:  'cinematic_studio_2_5' as ModelId,
    aspect: '16:9' as AspectRatio,
  },
  {
    label:  'Pipeline Ad',
    prompt: 'Premium dark-mode SaaS ad. Matte black background with subtle grid lines. Center: glowing pipeline showing BRIEF → FORGE → BUILD → LIVE URL as neon green glowing cards. Large headline: ONE CLICK PIPELINE. Sub-headline: 21 AI Agents. One Brief. One Live Product. Stats: 11 FORGE AGENTS · 10 BUILD AGENTS · 4 MINUTES. NEXUS OS wordmark. Color: pure black, neon green #c8f23c, white text. Clean modern premium SaaS aesthetic.',
    model:  'marketing_studio_image' as ModelId,
    aspect: '16:9' as AspectRatio,
  },
  {
    label:  'Infographic',
    prompt: 'Sharp 4K dark tech infographic poster. Pure black background. Large glowing neon green pipeline flow: BRIEF (cursor icon) → FORGE (11-agent hexagon cluster) → BUILD (10-agent hexagon cluster) → LIVE URL (globe icon). Each step a sleek dark card with neon green border. Hero headline: ONE CLICK PIPELINE in massive bold white sans-serif. Below: Enter a brief. 21 agents build and deploy automatically. Stat chips: 11 FORGE AGENTS · 10 BUILD AGENTS · 4 MIN TO LIVE. NEXUS OS logo top-right. Hexagonal mesh on background. Ultra sharp, no noise.',
    model:  'nano_banana_2' as ModelId,
    aspect: '16:9' as AspectRatio,
  },
]

// ─── Subcomponents ────────────────────────────────────────────────────────────

function ModelCard({
  model,
  selected,
  onClick,
}: {
  model:    typeof MODELS[number]
  selected: boolean
  onClick:  () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        selected
          ? 'border-[#c8f23c]/60 bg-[#c8f23c]/5 shadow-[0_0_12px_2px_rgba(200,242,60,0.12)]'
          : 'border-border bg-paper2 hover:border-ink/20 hover:bg-paper'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className={`text-xs font-bold leading-tight ${selected ? 'text-ink' : 'text-ink2'}`}>
          {model.name}
        </p>
        <span className={`text-[8px] font-black font-mono px-1.5 py-0.5 rounded border flex-shrink-0 ${
          selected
            ? 'border-[#c8f23c]/50 text-[#c8f23c] bg-[#c8f23c]/10'
            : 'border-border text-ink3'
        }`}>
          {model.tag}
        </span>
      </div>
      <p className="text-[10px] text-ink3 leading-snug">{model.bestFor}</p>
    </button>
  )
}

function GeneratedCard({ img, onDownload }: { img: GeneratedImage; onDownload: (url: string, name: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-paper shadow-sm group">
      <div
        className="relative cursor-pointer overflow-hidden bg-paper2"
        onClick={() => setExpanded(true)}
        style={{ aspectRatio: img.aspect.replace(':', '/') }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.url}
          alt={img.prompt.slice(0, 80)}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/10 transition-all duration-200 flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 text-paper text-xs font-bold bg-ink/60 px-3 py-1.5 rounded-lg transition-opacity">
            View full size ↗
          </span>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black font-mono text-ink3 uppercase tracking-widest">
            {MODELS.find(m => m.id === img.model)?.tag ?? img.model}
          </span>
          <span className="text-[9px] font-mono text-ink3">{img.aspect} · {img.resolution}</span>
          <span className="ml-auto text-[9px] font-mono text-ink3">{img.createdAt}</span>
        </div>
        <p className="text-[11px] text-ink2 leading-snug line-clamp-2">{img.prompt}</p>
        <div className="flex gap-2">
          <button
            onClick={() => onDownload(img.url, `nexus-higgs-${img.id}.png`)}
            className="flex-1 text-[10px] font-bold py-1.5 rounded-lg border border-border hover:bg-paper2 text-ink3 hover:text-ink transition-colors"
          >
            ↓ Download
          </button>
          <a
            href={img.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-bold py-1.5 px-3 rounded-lg border border-border hover:bg-paper2 text-ink3 hover:text-ink transition-colors"
          >
            Open ↗
          </a>
        </div>
      </div>

      {/* Lightbox */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4"
          onClick={() => setExpanded(false)}
        >
          <div className="relative max-w-5xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt="" className="w-full h-full object-contain rounded-xl" />
            <button
              onClick={() => setExpanded(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-ink/60 text-paper text-sm flex items-center justify-center hover:bg-ink transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HiggsAIPage() {
  const { data: session } = useSession()
  const sessionPlan = (session?.user as { plan?: string } | null)?.plan ?? 'free'

  const [prompt,     setPrompt]     = useState('')
  const [model,      setModel]      = useState<ModelId>('cinematic_studio_2_5')
  const [aspect,     setAspect]     = useState<AspectRatio>('16:9')
  const [resolution, setResolution] = useState<Resolution>('2k')
  const [count,      setCount]      = useState<1 | 2 | 4>(1)

  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState('')
  const [images,     setImages]     = useState<GeneratedImage[]>([])
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKey,  setShowApiKey]  = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  const applyPreset = (preset: typeof NEXUS_PRESETS[number]) => {
    setPrompt(preset.prompt)
    setModel(preset.model)
    setAspect(preset.aspect)
  }

  const handleDownload = useCallback(async (url: string, filename: string) => {
    try {
      const res  = await fetch(url)
      const blob = await res.blob()
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      window.open(url, '_blank')
    }
  }, [])

  const generate = useCallback(async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setError('')
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/higgs/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          prompt:     prompt.trim(),
          model,
          aspect,
          resolution,
          count,
          apiKey:     apiKeyInput.trim() || undefined,
        }),
        signal: abortRef.current.signal,
      })

      const data = await res.json() as {
        ok:     boolean
        images: { id: string; url: string }[]
        error?: string
      }

      if (!data.ok) {
        setError(data.error ?? 'Generation failed')
        return
      }

      const ts = new Date().toLocaleTimeString('en', { hour12: false })
      const newImgs: GeneratedImage[] = data.images.map(img => ({
        id:         img.id,
        url:        img.url,
        prompt:     prompt.trim(),
        model,
        aspect,
        resolution,
        createdAt:  ts,
      }))
      setImages(prev => [...newImgs, ...prev])

    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError((err as Error).message ?? 'Network error')
    } finally {
      setGenerating(false)
    }
  }, [prompt, model, aspect, resolution, count, apiKeyInput])

  const cancelGeneration = () => {
    abortRef.current?.abort()
    setGenerating(false)
  }

  const isLockedResolution = resolution === '4k' && (sessionPlan === 'free' || sessionPlan === 'starter')

  return (
    <div className="min-h-screen bg-paper flex flex-col">

      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[9px] font-black font-mono tracking-[0.18em] text-ink3 uppercase">Higgs AI</p>
            <span className="text-[8px] font-black font-mono px-1.5 py-0.5 rounded border border-[#c8f23c]/50 text-[#c8f23c] bg-[#c8f23c]/10">NEW</span>
          </div>
          <h1 className="text-xl font-black tracking-tight text-ink">AI Image Agent</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* API key slot */}
          <button
            onClick={() => setShowApiKey(v => !v)}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${
              apiKeyInput
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-border text-ink3 hover:text-ink hover:border-ink/20'
            }`}
          >
            {apiKeyInput ? '✓ API key set' : '⚿ Add API key'}
          </button>
          {images.length > 0 && (
            <span className="text-[10px] font-mono text-ink3">{images.length} image{images.length !== 1 ? 's' : ''} generated</span>
          )}
        </div>
      </div>

      {/* API key input (collapsible) */}
      {showApiKey && (
        <div className="border-b border-border bg-paper2 px-6 py-3 flex items-center gap-3">
          <p className="text-[10px] text-ink3 flex-shrink-0">Higgsfield API key:</p>
          <input
            type="password"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            placeholder="hf_live_xxxxxxxxxxxxxxxxxxxx"
            className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-paper text-xs font-mono outline-none focus:border-[#c8f23c] text-ink placeholder:text-ink3"
          />
          <p className="text-[9px] text-ink3 flex-shrink-0">
            Get yours at{' '}
            <a href="https://higgsfield.ai" target="_blank" rel="noopener noreferrer" className="underline">higgsfield.ai</a>
            {' '}→ Settings → API
          </p>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel — controls ─────────────────────────────────────────── */}
        <div className="w-[340px] flex-shrink-0 border-r border-border flex flex-col overflow-y-auto">

          {/* Prompt */}
          <div className="p-4 border-b border-border space-y-3">
            <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Prompt</p>

            {/* NEXUS OS presets */}
            <div className="space-y-1">
              <p className="text-[9px] font-bold text-ink3 uppercase tracking-wider">Quick presets</p>
              <div className="flex flex-col gap-1">
                {NEXUS_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className="text-left text-[10px] px-2.5 py-1.5 rounded-lg border border-[#c8f23c]/30 bg-[#c8f23c]/5 text-ink2 hover:bg-[#c8f23c]/10 hover:border-[#c8f23c]/60 transition-colors font-medium"
                  >
                    ✦ {p.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate…"
              rows={6}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-paper2 text-sm text-ink placeholder:text-ink3 outline-none focus:border-[#c8f23c] resize-none transition-colors leading-relaxed"
            />
            <div className="flex items-center justify-between">
              <span className={`text-[9px] font-mono ${prompt.length > 900 ? 'text-amber-500' : 'text-ink3/50'}`}>
                {prompt.length} / 1000
              </span>
              {prompt && (
                <button
                  onClick={() => setPrompt('')}
                  className="text-[9px] text-ink3 hover:text-ink underline transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Model */}
          <div className="p-4 border-b border-border space-y-2">
            <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Model</p>
            <div className="space-y-1.5">
              {MODELS.map(m => (
                <ModelCard
                  key={m.id}
                  model={m}
                  selected={model === m.id}
                  onClick={() => setModel(m.id)}
                />
              ))}
            </div>
          </div>

          {/* Aspect ratio */}
          <div className="p-4 border-b border-border space-y-2">
            <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Aspect ratio</p>
            <div className="grid grid-cols-3 gap-1.5">
              {ASPECT_RATIOS.map(a => (
                <button
                  key={a.value}
                  onClick={() => setAspect(a.value)}
                  className={`py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                    aspect === a.value
                      ? 'border-[#c8f23c]/60 bg-[#c8f23c]/10 text-ink'
                      : 'border-border bg-paper2 text-ink3 hover:border-ink/20 hover:text-ink'
                  }`}
                >
                  {a.value}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution + count */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="space-y-2">
              <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Resolution</p>
              <div className="flex gap-1.5">
                {RESOLUTIONS.map(r => {
                  const locked = r === '4k' && (sessionPlan === 'free' || sessionPlan === 'starter')
                  return (
                    <button
                      key={r}
                      onClick={() => !locked && setResolution(r)}
                      title={locked ? 'Upgrade to Agency for 4K' : undefined}
                      className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                        locked
                          ? 'border-border bg-paper2 text-ink3/40 cursor-not-allowed'
                          : resolution === r
                          ? 'border-[#c8f23c]/60 bg-[#c8f23c]/10 text-ink'
                          : 'border-border bg-paper2 text-ink3 hover:border-ink/20 hover:text-ink'
                      }`}
                    >
                      {r.toUpperCase()}{locked ? ' 🔒' : ''}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Count</p>
              <div className="flex gap-1.5">
                {([1, 2, 4] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                      count === n
                        ? 'border-[#c8f23c]/60 bg-[#c8f23c]/10 text-ink'
                        : 'border-border bg-paper2 text-ink3 hover:border-ink/20 hover:text-ink'
                    }`}
                  >
                    {n}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Generate button */}
          <div className="p-4 space-y-2">
            {error && (
              <div className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 space-y-1">
                <p className="text-[11px] font-bold text-red-600">Generation failed</p>
                <p className="text-[10px] text-red-500 leading-snug">{error}</p>
                {/api.key|not.found|authenticat/i.test(error) && (
                  <p className="text-[10px] text-amber-600 mt-1">
                    Add your Higgsfield API key above, or get one at{' '}
                    <a href="https://higgsfield.ai" target="_blank" rel="noopener noreferrer" className="underline font-semibold">higgsfield.ai</a>
                  </p>
                )}
              </div>
            )}

            {generating ? (
              <button
                onClick={cancelGeneration}
                className="w-full py-3 rounded-xl text-sm font-black border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
              >
                <span className="inline-block w-2 h-2 rounded-sm bg-red-500 animate-pulse" />
                Generating… click to cancel
              </button>
            ) : (
              <button
                onClick={generate}
                disabled={!prompt.trim() || isLockedResolution}
                className={`w-full py-3 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 ${
                  prompt.trim() && !isLockedResolution
                    ? 'bg-ink text-paper hover:bg-ink/85 shadow-[0_0_20px_2px_rgba(0,0,0,0.1)] scale-[1.01]'
                    : 'bg-paper3 text-ink3 cursor-not-allowed border border-border'
                }`}
              >
                ✦ Generate {count > 1 ? `${count} Images` : 'Image'}
              </button>
            )}

            {isLockedResolution && (
              <p className="text-[10px] text-center text-amber-600">
                4K requires Agency plan —{' '}
                <a href="/shell?page=pricing" className="underline font-semibold">upgrade</a>
              </p>
            )}
          </div>
        </div>

        {/* ── Right panel — gallery ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Generating skeleton */}
          {generating && (
            <div className="mb-6">
              <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase mb-3">Generating…</p>
              <div className={`grid gap-4 ${count === 1 ? 'grid-cols-1 max-w-2xl' : count === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                {Array.from({ length: count }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-[#c8f23c]/20 bg-[#c8f23c]/3 animate-pulse"
                    style={{ aspectRatio: aspect.replace(':', '/') }}
                  >
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-[#c8f23c]/40 border-t-[#c8f23c] animate-spin" />
                      <p className="text-[10px] font-mono text-ink3 animate-pulse">
                        {MODELS.find(m => m.id === model)?.name} · {resolution.toUpperCase()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Image gallery */}
          {images.length > 0 ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Gallery</p>
                <button
                  onClick={() => {
                    if (window.confirm('Clear all generated images?')) setImages([])
                  }}
                  className="text-[10px] text-ink3 hover:text-ink underline transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className={`grid gap-4 ${images.length === 1 ? 'grid-cols-1 max-w-2xl' : 'grid-cols-2'}`}>
                {images.map(img => (
                  <GeneratedCard
                    key={img.id}
                    img={img}
                    onDownload={handleDownload}
                  />
                ))}
              </div>
            </div>
          ) : !generating ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl border border-[#c8f23c]/30 bg-[#c8f23c]/5 flex items-center justify-center text-2xl">
                ✦
              </div>
              <div>
                <p className="font-bold text-ink">Higgs AI Image Agent</p>
                <p className="text-sm text-ink3 mt-1 max-w-xs leading-relaxed">
                  Pick a preset, choose a model, and generate production-ready images for NEXUS OS — hero visuals, pipeline diagrams, social ads.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                {NEXUS_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className="text-[10px] font-bold px-3 py-1.5 rounded-full border border-[#c8f23c]/30 bg-[#c8f23c]/5 text-ink2 hover:bg-[#c8f23c]/10 hover:border-[#c8f23c]/60 transition-all"
                  >
                    ✦ {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
