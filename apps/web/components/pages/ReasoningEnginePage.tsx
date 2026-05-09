'use client'

import { useRouter } from 'next/navigation'

import { useState, useCallback, useRef, useEffect } from 'react'
import { LENSES } from '@/lib/lensData'
import { useWorkspace } from '@/lib/workspaceContext'
import type { Lens } from '@nexus-os/shared-types'

const RISK_OPTS  = ['low', 'medium', 'high', 'extreme']
const DEPTH_OPTS = ['surface', 'standard', 'exhaustive']

function LensItem({ lens, isActive, onClick }: { lens: Lens; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isActive ? 'border-acid/50 bg-acid/5' : 'border-transparent hover:bg-paper2'
      }`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs font-bold font-mono">{lens.name}</span>
        <span className={`chip text-[10px] ${lens.type === 'gov' ? 'violet' : ''}`}>{lens.type.toUpperCase()}</span>
      </div>
      <p className="text-[10px] text-ink3 line-clamp-2">{lens.description}</p>
    </button>
  )
}

export default function ReasoningEnginePage() {
  const router                        = useRouter()
  const { active: workspace }         = useWorkspace()
  const [selectedId, setSelectedId]   = useState('governor')
  const [copied, setCopied]           = useState(false)
  const [apiKey, setApiKey]           = useState('')
  const [problem, setProblem]         = useState('')
  const [output, setOutput]           = useState('')
  const [isRunning, setIsRunning]     = useState(false)
  const [tokens, setTokens]           = useState(0)
  const [search, setSearch]           = useState('')

  // Governor session settings
  const [governorRisk,  setGovernorRisk]  = useState('medium')
  const [governorDepth, setGovernorDepth] = useState('standard')
  const [iteration,     setIteration]     = useState(1)
  const [signalQuality, setSignalQuality] = useState(75)

  // Chain context — accumulates across lens runs in this session
  const [chainContext,       setChainContext]       = useState('')
  const [beliefs,            setBeliefs]            = useState('')
  const [criticPredictions,  setCriticPredictions]  = useState('')
  const [observerFindings,   setObserverFindings]   = useState('')

  const abortRef = useRef<AbortController | null>(null)

  // Read prefill from Journey page
  useEffect(() => {
    const prefill = sessionStorage.getItem('nexus-prefill-reasoning-problem')
    if (prefill) { setProblem(prefill); sessionStorage.removeItem('nexus-prefill-reasoning-problem') }
  }, [])

  const selected = LENSES.find(l => l.id === selectedId) ?? LENSES[0]
  const filtered = LENSES.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.description.toLowerCase().includes(search.toLowerCase())
  )

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(selected.prompt) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [selected.prompt])

  const buildFilledPrompt = useCallback(() => {
    const wsBlock = workspace?.context
      ? `\n\nWORKSPACE CONTEXT [${workspace.emoji} ${workspace.name}]:\n${workspace.context}`
      : ''
    const priorWithWs = (chainContext || '') + wsBlock || '(no prior context — this is the first lens in the chain)'

    return selected.prompt
      .replace(/\{\{userMessage\}\}/g,        problem)
      .replace(/\{\{priorContext\}\}/g,        priorWithWs)
      .replace(/\{\{beliefs\}\}/g,             beliefs       || '(no beliefs extracted yet — run ANALYST or SYNTHESIST first)')
      .replace(/\{\{criticPredictions\}\}/g,   criticPredictions  || '(no CRITIC predictions recorded yet — run CRITIC first)')
      .replace(/\{\{observerFindings\}\}/g,    observerFindings   || '(no OBSERVER-X findings recorded yet — run OBSERVER-X first)')
      .replace(/\{\{governorRisk\}\}/g,        governorRisk)
      .replace(/\{\{governorDepth\}\}/g,       governorDepth)
      .replace(/\{\{iteration\}\}/g,           String(iteration))
      .replace(/\{\{signalQuality\}\}/g,       String(signalQuality))
  }, [selected.prompt, problem, chainContext, beliefs, criticPredictions, observerFindings, governorRisk, governorDepth, iteration, signalQuality, workspace])

  const runLens = useCallback(async () => {
    if (!problem.trim()) return
    setIsRunning(true)
    setOutput('')
    setTokens(0)
    abortRef.current = new AbortController()

    const filledPrompt = buildFilledPrompt()

    try {
      const res = await fetch('/api/claude/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: filledPrompt,
          userMessage:  `PROBLEM/CONTEXT:\n${problem}`,
          apiKey:       apiKey.trim() || undefined,
          sessionId:    'reasoning-' + Date.now(),
        }),
        signal: abortRef.current.signal,
      })

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream')
      const dec = new TextDecoder()
      let fullOutput = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = dec.decode(value).split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'chunk') { fullOutput += evt.content; setOutput(p => p + evt.content) }
            if (evt.type === 'done')  setTokens(evt.tokens ?? 0)
            if (evt.type === 'error') setOutput(p => p + '\n[Error] ' + evt.message)
          } catch { /* partial JSON */ }
        }
      }

      // Auto-update chain context and extract key data from outputs
      if (fullOutput) {
        const snippet = `\n\n=== ${selected.name} OUTPUT ===\n${fullOutput.slice(0, 1200)}`
        setChainContext(prev => (prev + snippet).slice(-8000)) // keep last ~8k chars

        // Extract beliefs from ANALYST / SYNTHESIST outputs
        if (selected.id === 'analyst' || selected.id === 'synthesist') {
          const beliefMatch = fullOutput.match(/BELIEF[_\s]REGISTER[\s\S]{0,2000}/i)
          if (beliefMatch) setBeliefs(beliefMatch[0].slice(0, 1000))
        }
        // Extract CRITIC predictions
        if (selected.id === 'critic') {
          const predMatch = fullOutput.match(/[Pp]rediction[\s\S]{0,1500}/)
          if (predMatch) setCriticPredictions(predMatch[0].slice(0, 800))
        }
        // Extract OBSERVER findings
        if (selected.id === 'observer') {
          const obsMatch = fullOutput.match(/GROUND[\s_]TRUTH[\s\S]{0,1500}/i)
          if (obsMatch) setObserverFindings(obsMatch[0].slice(0, 800))
        }
        // Auto-increment iteration after SYNTHESIS or GATE-CHECK
        if (selected.id === 'synthesis' || selected.id === 'gate-check') {
          setIteration(i => i + 1)
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setOutput(p => p + '\n[Connection error]')
    } finally {
      setIsRunning(false)
    }
  }, [buildFilledPrompt, selected.id, selected.name, apiKey, problem])

  const stopRun = useCallback(() => {
    abortRef.current?.abort()
    setIsRunning(false)
  }, [])

  const resetSession = useCallback(() => {
    setChainContext('')
    setBeliefs('')
    setCriticPredictions('')
    setObserverFindings('')
    setIteration(1)
    setSignalQuality(75)
    setOutput('')
  }, [])

  const hasChainData = !!(chainContext || beliefs || criticPredictions || observerFindings)

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Mode switcher ─ Reasoning Engine ↔ Auto-Loop */}
      <div className="mb-6 flex items-center gap-1 p-1 bg-paper2 border border-border rounded-xl w-fit">
        <button
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-paper border border-border text-ink shadow-sm transition-all"
        >
          ◎ Manual — Pick a lens
        </button>
        <button
          onClick={() => router.push('/shell?page=runtime')}
          className="px-4 py-1.5 rounded-lg text-xs font-medium text-ink3 hover:text-ink hover:bg-paper transition-all"
        >
          ▷ Auto-Loop — GOVERNOR mode
        </button>
      </div>

      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="sec-label mb-2">Reasoning Engine — Manual Mode</p>
          <h2 className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>
            11 Adversarial Lenses
          </h2>
          <p className="text-sm text-ink3 mt-1">
            Pick a lens, enter a problem, and run it live. Chain multiple lenses to build reasoning context — then switch to Auto-Loop to run until the GOVERNOR halts.
          </p>
        </div>

        {/* Governor session controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 panel py-2 px-3">
            <span className="text-[10px] font-mono text-ink3 uppercase">Risk</span>
            <select
              value={governorRisk}
              onChange={e => setGovernorRisk(e.target.value)}
              className="text-xs bg-transparent outline-none cursor-pointer"
            >
              {RISK_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 panel py-2 px-3">
            <span className="text-[10px] font-mono text-ink3 uppercase">Depth</span>
            <select
              value={governorDepth}
              onChange={e => setGovernorDepth(e.target.value)}
              className="text-xs bg-transparent outline-none cursor-pointer"
            >
              {DEPTH_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 panel py-2 px-3">
            <span className="text-[10px] font-mono text-ink3 uppercase">Signal</span>
            <input
              type="number" min={0} max={100}
              value={signalQuality}
              onChange={e => setSignalQuality(Number(e.target.value))}
              className="w-12 text-xs bg-transparent outline-none text-center"
            />
            <span className="text-[10px] text-ink3">/100</span>
          </div>
          <div className="flex items-center gap-2 panel py-2 px-3">
            <span className="text-[10px] font-mono text-ink3 uppercase">Iter</span>
            <span className="text-xs font-bold">{iteration}</span>
          </div>
          {hasChainData && (
            <button onClick={resetSession} className="btn btn-ghost text-xs py-1.5 px-3 text-red-400">
              ↺ Reset session
            </button>
          )}
        </div>
      </div>

      {/* Workspace context indicator */}
      {workspace?.context && (
        <div className="mb-3 panel border-violet-500/30 bg-violet-500/5 px-4 py-2 flex items-center gap-2 text-xs">
          <span className="text-lg leading-none">{workspace.emoji}</span>
          <span className="font-medium text-violet-400">{workspace.name}</span>
          <span className="text-ink3 truncate">{workspace.context.slice(0, 120)}{workspace.context.length > 120 ? '…' : ''}</span>
        </div>
      )}

      {/* Chain context indicator */}
      {hasChainData && (
        <div className="mb-4 panel border-acid/30 bg-acid/5 px-4 py-2 flex items-center justify-between text-xs">
          <span className="text-acid font-medium">
            Chain active — {chainContext.length} chars of prior context flowing into each lens
          </span>
          <span className="text-ink3">
            {beliefs ? '✓ beliefs' : ''} {criticPredictions ? '· ✓ CRITIC predictions' : ''} {observerFindings ? '· ✓ OBSERVER findings' : ''}
          </span>
        </div>
      )}

      <div className="flex gap-6 min-h-[640px]">
        {/* ─── Sidebar ─── */}
        <div className="w-64 flex-shrink-0 space-y-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search lenses…"
            autoComplete="off"
            name="lens-search"
            className="w-full px-3 py-2 rounded-lg text-xs border border-border bg-paper2 outline-none focus:border-acid"
          />
          <div className="space-y-1 overflow-y-auto max-h-[560px] pr-1">
            {filtered.map(lens => (
              <LensItem
                key={lens.id} lens={lens}
                isActive={lens.id === selectedId}
                onClick={() => { setSelectedId(lens.id); setOutput('') }}
              />
            ))}
          </div>
        </div>

        {/* ─── Detail + Run panel ─── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Lens header */}
          <div className="card">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-bold font-mono">{selected.name}</h3>
                  <span className={`chip ${selected.type === 'gov' ? 'violet' : ''}`}>{selected.type}</span>
                </div>
                <p className="text-sm text-ink3">{selected.description}</p>
              </div>
              <button onClick={handleCopy} className="btn btn-ghost text-xs flex-shrink-0">
                {copied ? '✓ Copied' : 'Copy Prompt'}
              </button>
            </div>
            <div className="prompt-block h-40 overflow-y-auto text-xs">{selected.prompt}</div>

            {/* Show which variables this lens uses */}
            {(() => {
              const vars = (selected.prompt.match(/\{\{[^}]+\}\}/g) ?? [])
              if (vars.length === 0) return null
              return (
                <div className="mt-3 flex flex-wrap gap-1">
                  {[...new Set(vars)].map(v => {
                    const key = v.slice(2, -2)
                    const isPopulated = key === 'userMessage' ? !!problem
                      : key === 'priorContext' ? !!chainContext
                      : key === 'beliefs' ? !!beliefs
                      : key === 'criticPredictions' ? !!criticPredictions
                      : key === 'observerFindings' ? !!observerFindings
                      : true
                    return (
                      <span key={v} className={`chip text-[10px] ${isPopulated ? 'border-green/40 text-green' : 'border-amber-400/40 text-amber-400'}`}>
                        {v} {isPopulated ? '✓' : '○'}
                      </span>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Run controls */}
          <div className="card space-y-3">
            <p className="sec-label">Run This Lens Live</p>
            <textarea
              value={problem}
              onChange={e => setProblem(e.target.value)}
              placeholder="Enter the problem or context to reason about…"
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid resize-none"
            />
            <div className="flex gap-3">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Anthropic API key (optional if set server-side)"
                className="flex-1 px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid font-mono"
              />
              {isRunning
                ? <button onClick={stopRun} className="btn btn-ghost flex-shrink-0">■ Stop</button>
                : <button onClick={runLens} disabled={!problem.trim()} className="btn btn-primary flex-shrink-0 disabled:opacity-50">
                    ▶ Run Lens
                  </button>
              }
            </div>
          </div>

          {/* Output */}
          {(output || isRunning) && (
            <div className="card space-y-2 animate-fadein">
              <div className="flex items-center justify-between">
                <p className="sec-label">{selected.name} Output</p>
                <div className="flex items-center gap-3">
                  {tokens > 0 && <span className="text-xs text-ink3 font-mono">{tokens.toLocaleString()} tokens</span>}
                  {isRunning && <span className="chip acid animate-pulse">LIVE</span>}
                </div>
              </div>
              <div className="stream-box h-64 overflow-y-auto whitespace-pre-wrap text-xs">
                {output || <span className="text-ink3 animate-pulse">Running {selected.name}…</span>}
              </div>
              {output && !isRunning && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(output).catch(() => {})}
                    className="btn btn-ghost text-xs"
                  >Copy Output</button>
                  <span className="text-[10px] text-ink3">Output auto-added to chain context</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
