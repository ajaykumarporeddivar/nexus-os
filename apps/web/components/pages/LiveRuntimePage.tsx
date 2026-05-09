'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LENSES } from '@/lib/lensData'
import { auditEvent } from '@/lib/auditEvent'
import type { SimState, Belief, STREntry, ReasoningContext, GovernorRisk, GovernorDepth } from '@nexus-os/shared-types'

const DEPTH_LIMITS: Record<GovernorDepth, number> = {
  surface: 3,
  standard: 7,
  exhaustive: 12,
}

interface Props {
  onApiKeyChange: (connected: boolean) => void
  onNavigateForge: () => void
}

const initState = (): SimState => ({
  iteration: 0,
  beliefs: [],
  strEntries: [],
  signalQuality: 50,
  exitConditions: [false, false, false],
  currentLensIdx: 0,
  isRunning: false,
  reasoningContext: [],
  governorRisk: 'balanced',
  governorDepth: 'standard',
  governorMode: 'solo',
})

export default function LiveRuntimePage({ onApiKeyChange, onNavigateForge }: Props) {
  const router                      = useRouter()
  const [apiKey, setApiKey]         = useState('')
  const [apiStatus, setApiStatus]   = useState<'idle' | 'connected' | 'error'>('idle')
  const [problem, setProblem]       = useState('')
  const [state, setState]           = useState<SimState>(initState)
  const [streamText, setStreamText] = useState('')
  const [tokenCount, setTokenCount] = useState(0)
  const [chainTrace, setChainTrace] = useState<{ lens: string; iter: number; snippet: string }[]>([])
  const streamBoxRef = useRef<HTMLDivElement>(null)
  const sessionId    = useRef(crypto.randomUUID())

  const currentLens = LENSES[state.currentLensIdx]

  /* Auto-scroll stream box */
  useEffect(() => {
    if (streamBoxRef.current) {
      streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight
    }
  }, [streamText])

  const handleApiKeyChange = useCallback((key: string) => {
    setApiKey(key)
    if (key.startsWith('sk-ant-')) {
      setApiStatus('connected')
      onApiKeyChange(true)
    } else if (key === '') {
      setApiStatus('idle')
      onApiKeyChange(false)
    }
  }, [onApiKeyChange])

  /* Governor halt check */
  const governorCheck = useCallback((s: SimState): string | null => {
    if (s.signalQuality < 40) return `Signal quality too low (${s.signalQuality}/100 < 40). GOVERNOR halting.`
    const avgConf = s.beliefs.length
      ? s.beliefs.reduce((sum, b) => sum + b.confidence, 0) / s.beliefs.length
      : 1
    if (avgConf < 0.35) return `Average belief confidence too low (${avgConf.toFixed(2)} < 0.35). GOVERNOR halting.`
    const fragileRatio = s.beliefs.length
      ? s.beliefs.filter(b => b.fragile).length / s.beliefs.length
      : 0
    if (fragileRatio > 0.5) return `Too many fragile beliefs (${Math.round(fragileRatio * 100)}% > 50%). GOVERNOR halting.`
    if (s.iteration >= DEPTH_LIMITS[s.governorDepth]) {
      return `Iteration limit reached for depth "${s.governorDepth}" (${DEPTH_LIMITS[s.governorDepth]}). GOVERNOR halting.`
    }
    return null
  }, [])

  /* Extract beliefs from response text */
  const extractBeliefs = useCallback((text: string, iteration: number): Belief[] => {
    const lines = text.split('\n').filter(l => l.match(/^[-•]\s*\[?(SOLID|FRAGILE|UNCERTAIN)?\]?/i))
    return lines.slice(0, 5).map((line, i) => {
      const isFrag = /FRAGILE|UNCERTAIN/i.test(line)
      const confMatch = line.match(/(\d+\.\d+)/)
      const conf = confMatch ? parseFloat(confMatch[1]) : (isFrag ? 0.3 : 0.7)
      return {
        id: `${iteration}-${i}`,
        content: line.replace(/^[-•]\s*/, '').slice(0, 120),
        confidence: Math.min(Math.max(conf, 0), 1),
        fragile: isFrag,
        iteration,
      }
    })
  }, [])

  const runIteration = useCallback(async () => {
    if (state.isRunning || !problem.trim()) return

    const haltReason = governorCheck(state)
    if (haltReason) {
      setStreamText(prev => prev + `\n\n⛔ GOVERNOR HALT: ${haltReason}`)
      return
    }

    setState(s => ({ ...s, isRunning: true }))
    setStreamText('')

    const lens = LENSES[state.currentLensIdx]
    const iterNum = state.iteration + 1
    const priorCtx = state.reasoningContext
      .slice(-3)
      .map(r => `[Iter ${r.iteration} · ${r.lensId}]: ${r.output.slice(0, 300)}`)
      .join('\n\n')

    const filledPrompt = lens.prompt
      .replace(/\{\{userMessage\}\}/g, problem)
      .replace(/\{\{priorContext\}\}/g, priorCtx || 'None yet.')
      .replace(/\{\{iteration\}\}/g, String(iterNum))
      .replace(/\{\{signalQuality\}\}/g, String(state.signalQuality))
      .replace(/\{\{governorRisk\}\}/g, state.governorRisk)
      .replace(/\{\{governorDepth\}\}/g, state.governorDepth)
      .replace(/\{\{beliefs\}\}/g, state.beliefs.map(b => `${b.content} (${b.confidence.toFixed(2)})`).join('\n'))
      .replace(/\{\{criticPredictions\}\}/g, 'See prior context.')
      .replace(/\{\{observerFindings\}\}/g, 'See prior context.')

    let fullText = ''
    let tokens = 0

    try {
      const res = await fetch('/api/claude/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: filledPrompt,
          userMessage: problem,
          sessionId: sessionId.current,
          apiKey: apiKey || undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('No response body')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'chunk') {
              fullText += event.content
              tokens = event.tokens
              setStreamText(fullText)
            } else if (event.type === 'done') {
              tokens = event.tokens
            } else if (event.type === 'error') {
              throw new Error(event.message)
            }
          } catch { /* skip malformed SSE lines */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setStreamText(`❌ Error: ${msg}`)
      setState(s => ({ ...s, isRunning: false }))
      setApiStatus('error')
      return
    }

    const newBeliefs = extractBeliefs(fullText, iterNum)
    const newSQ = Math.min(100, Math.max(0, state.signalQuality + (Math.random() > 0.3 ? 5 : -3)))
    const nextLensIdx = (state.currentLensIdx + 1) % LENSES.length

    const strEntry: STREntry = {
      iteration: iterNum,
      lensId: lens.id,
      lensName: lens.name,
      summary: fullText.slice(0, 200),
      timestamp: new Date().toISOString(),
    }

    const ctx: ReasoningContext = {
      iteration: iterNum,
      lensId: lens.id,
      output: fullText,
      tokens,
    }

    setState(s => ({
      ...s,
      iteration: iterNum,
      beliefs: [...s.beliefs.slice(-4), ...newBeliefs].slice(-5),
      strEntries: [...s.strEntries, strEntry],
      signalQuality: newSQ,
      currentLensIdx: nextLensIdx,
      isRunning: false,
      reasoningContext: [...s.reasoningContext, ctx],
      exitConditions: [
        iterNum >= DEPTH_LIMITS[s.governorDepth],
        newSQ > 80,
        newBeliefs.every(b => b.confidence > 0.7),
      ],
    }))

    setTokenCount(t => t + tokens)
    setChainTrace(ct => [...ct, { lens: lens.name, iter: iterNum, snippet: fullText.slice(0, 200) }])

    await auditEvent('runtime_iteration', { iteration: iterNum, lensId: lens.id, tokens })
  }, [state, apiKey, problem, governorCheck, extractBeliefs])

  const handleReset = useCallback(() => {
    setState(initState())
    setStreamText('')
    setTokenCount(0)
    setChainTrace([])
  }, [])

  const handleSendToForge = useCallback(() => {
    const summary = state.reasoningContext
      .map(r => `[Iter ${r.iteration} · ${r.lensId}]: ${r.output.slice(0, 300)}`)
      .join('\n\n')
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('nexus-forge-prefill', summary)
    }
    onNavigateForge()
  }, [state.reasoningContext, onNavigateForge])

  const sigBars = Array.from({ length: 5 }, (_, i) => i < Math.ceil(state.signalQuality / 20))

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">

      {/* Mode switcher ─ Reasoning Engine ↔ Auto-Loop */}
      <div className="flex items-center gap-1 p-1 bg-paper2 border border-border rounded-xl w-fit">
        <button
          onClick={() => router.push('/shell?page=reasoning')}
          className="px-4 py-1.5 rounded-lg text-xs font-medium text-ink3 hover:text-ink hover:bg-paper transition-all"
        >
          ◎ Manual — Pick a lens
        </button>
        <button
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-paper border border-border text-ink shadow-sm transition-all"
        >
          ▷ Auto-Loop — GOVERNOR mode
        </button>
      </div>

      <div>
        <p className="sec-label mb-2">Auto-Loop — GOVERNOR Mode</p>
        <h2 className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>
          Automated Reasoning Loop
        </h2>
        <p className="text-sm text-ink3 mt-1">
          The GOVERNOR cycles through lenses automatically and halts when signal quality drops below threshold. Switch to Manual mode to control each lens individually.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8">
        {/* ─── Left column ─── */}
        <div className="space-y-6">
          {/* API Key */}
          <div className="card space-y-3">
            <p className="sec-label">Anthropic API Key <span className="text-ink3 font-normal">(optional — uses server key if blank)</span></p>
            <div className="flex items-center gap-3">
              <input
                type="password"
                value={apiKey}
                onChange={e => handleApiKeyChange(e.target.value)}
                placeholder="sk-ant-... (optional)"
                className="flex-1 px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid font-mono"
              />
              <span className={`chip flex-shrink-0 ${apiStatus === 'connected' ? 'ok' : apiStatus === 'error' ? 'err' : ''}`}>
                {apiStatus === 'connected' ? 'Connected' : apiStatus === 'error' ? 'Error' : 'Not set'}
              </span>
            </div>
          </div>

          {/* Problem input */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <p className="sec-label">Problem Statement</p>
              <span className="text-xs font-mono text-ink3">{problem.length} chars</span>
            </div>
            <textarea
              value={problem}
              onChange={e => setProblem(e.target.value)}
              placeholder="Describe the problem or project you're reasoning about..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid resize-none"
            />
          </div>

          {/* Run controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={runIteration}
              disabled={state.isRunning || !problem.trim()}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state.isRunning ? '⟳ Running…' : 'Run Live Iteration'}
            </button>
            <button onClick={handleReset} className="btn btn-ghost">Reset</button>
            {state.iteration > 0 && (
              <span className="chip">Iter {state.iteration}</span>
            )}
          </div>

          {/* Stream box */}
          <div className="card space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="sec-label">{currentLens.name}</span>
                {state.isRunning && (
                  <span className="w-1.5 h-1.5 rounded-full bg-acid animate-[pulse_0.8s_ease-in-out_infinite]" />
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-ink3">{tokenCount} tokens</span>
                {state.reasoningContext.length > 0 && (
                  <button onClick={handleSendToForge} className="btn btn-ghost text-xs py-1 px-3">
                    Send reasoning to FORGE →
                  </button>
                )}
              </div>
            </div>
            <div ref={streamBoxRef} className="stream-box h-64 overflow-y-auto">
              {streamText || (
                <span className="text-ink3">
                  {state.isRunning ? '' : 'Stream will appear here…'}
                </span>
              )}
              {state.isRunning && <span className="animate-blink ml-0.5">▋</span>}
            </div>
          </div>

          {/* Chain trace */}
          {chainTrace.length > 0 && (
            <div className="card space-y-3">
              <p className="sec-label">Chain Trace</p>
              <div className="space-y-2">
                {chainTrace.map((entry, i) => (
                  <details key={i} className="group">
                    <summary className="flex items-center gap-2 cursor-pointer text-sm py-1.5 px-2 rounded hover:bg-paper3">
                      <span className="font-mono text-xs text-ink3">Iter {entry.iter}</span>
                      <span className="chip text-xs">{entry.lens}</span>
                      <span className="text-ink3 text-xs truncate flex-1">{entry.snippet.slice(0, 60)}…</span>
                    </summary>
                    <div className="mt-2 px-2 text-xs text-ink3 leading-relaxed font-mono whitespace-pre-wrap border-l-2 border-border pl-3">
                      {entry.snippet}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── Right column ─── */}
        <div className="space-y-5">
          {/* GOVERNOR controls */}
          <div className="card space-y-4">
            <p className="sec-label">GOVERNOR Controls</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-ink3 mb-1 block">Risk tolerance</label>
                <select
                  value={state.governorRisk}
                  onChange={e => setState(s => ({ ...s, governorRisk: e.target.value as GovernorRisk }))}
                  className="w-full px-3 py-1.5 rounded border border-border bg-paper2 text-sm outline-none"
                >
                  <option value="conservative">Conservative</option>
                  <option value="balanced">Balanced</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-ink3 mb-1 block">Depth</label>
                <select
                  value={state.governorDepth}
                  onChange={e => setState(s => ({ ...s, governorDepth: e.target.value as GovernorDepth }))}
                  className="w-full px-3 py-1.5 rounded border border-border bg-paper2 text-sm outline-none"
                >
                  <option value="surface">Surface (3 iterations)</option>
                  <option value="standard">Standard (7 iterations)</option>
                  <option value="exhaustive">Exhaustive (12 iterations)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-ink3 mb-1 block">Mode</label>
                <select
                  value={state.governorMode}
                  onChange={e => setState(s => ({ ...s, governorMode: e.target.value }))}
                  className="w-full px-3 py-1.5 rounded border border-border bg-paper2 text-sm outline-none"
                >
                  <option value="solo">Solo</option>
                  <option value="collaborative">Collaborative</option>
                </select>
              </div>
            </div>
          </div>

          {/* Loop visualization */}
          <div className="card space-y-3">
            <p className="sec-label">Lens Loop</p>
            <div className="flex flex-wrap gap-1.5">
              {LENSES.map((lens, i) => {
                const isActive = i === state.currentLensIdx && state.isRunning
                const isDone = i < state.currentLensIdx || (state.iteration > 0 && i < state.currentLensIdx)
                return (
                  <button
                    key={lens.id}
                    onClick={() => setState(s => ({ ...s, currentLensIdx: i }))}
                    className={`px-2 py-1 rounded text-xs font-mono border transition-all ${
                      isActive
                        ? 'border-acid bg-acid text-ink2 animate-[pulse_1s_ease-in-out_infinite]'
                        : isDone
                        ? 'border-green/40 bg-green/10 text-green'
                        : lens.type === 'gov'
                        ? 'border-violet/40 bg-violet/10 text-violet'
                        : 'border-border bg-paper3 text-ink3'
                    }`}
                  >
                    {lens.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Signal quality */}
          <div className="card space-y-2">
            <div className="flex items-center justify-between">
              <p className="sec-label">Signal Quality</p>
              <span className="text-sm font-mono font-bold">{state.signalQuality}/100</span>
            </div>
            <div className="flex items-end gap-1 h-6">
              {sigBars.map((filled, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-all"
                  style={{
                    height: `${(i + 1) * 20}%`,
                    background: filled ? 'var(--acid)' : 'var(--border)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Belief register */}
          {state.beliefs.length > 0 && (
            <div className="card space-y-2">
              <div className="flex items-center justify-between">
                <p className="sec-label">Belief Register</p>
                <span className="chip">{state.beliefs.length}</span>
              </div>
              <div className="space-y-1.5">
                {state.beliefs.map(b => (
                  <div key={b.id} className="flex items-start gap-2 text-xs">
                    <span className={`chip flex-shrink-0 ${b.fragile ? 'warn' : 'ok'}`}>
                      {b.confidence.toFixed(2)}
                    </span>
                    <span className="text-ink3 leading-relaxed line-clamp-2">{b.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exit conditions */}
          {state.iteration > 0 && (
            <div className="card space-y-2">
              <p className="sec-label">Exit Conditions</p>
              {[
                'Iteration depth limit reached',
                'Signal quality > 80',
                'All beliefs high-confidence (> 0.7)',
              ].map((label, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 text-[10px] ${
                    state.exitConditions[i] ? 'border-green bg-green/10 text-green' : 'border-border'
                  }`}>
                    {state.exitConditions[i] ? '✓' : ''}
                  </span>
                  <span className={state.exitConditions[i] ? 'text-green' : 'text-ink3'}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
