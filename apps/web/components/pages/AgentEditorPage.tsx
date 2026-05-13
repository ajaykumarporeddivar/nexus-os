'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'

interface AgentSummary {
  id: string
  name: string
  role: string
  activeVersion: {
    id: string
    prompt: string
    avgScore: number
    runCount: number
    active: boolean
    createdAt: string
  } | null
  versionCount: number
  avgScore: number | null
  runCount: number
}

interface EvalBriefStatus {
  id: string
  client: string
  expectedPhases: number
  minScore: number
  ran: boolean
  lastRun: { score: number | null; passed: boolean | null; createdAt: string } | null
}

interface VersionRow {
  id: string
  agentId: string
  prompt: string
  avgScore: number
  runCount: number
  active: boolean
  createdAt: string
}

type ToastKind = 'ok' | 'err'

export default function AgentEditorPage() {
  const { data: session } = useSession()
  const plan = (session?.user as { plan?: string } | null)?.plan ?? 'free'
  const canWrite = plan === 'agency' || plan === 'enterprise'

  const [agents, setAgents]           = useState<AgentSummary[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [editPrompt, setEditPrompt]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [history, setHistory]         = useState<VersionRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [toast, setToast]             = useState<{ msg: string; kind: ToastKind } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [evalBriefs, setEvalBriefs]   = useState<EvalBriefStatus[]>([])
  const [evalRunning, setEvalRunning] = useState<string | null>(null)
  const [activeTab, setActiveTab]     = useState<'editor' | 'eval'>('editor')

  const showToast = useCallback((msg: string, kind: ToastKind = 'ok') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agents')
      const data = await res.json()
      if (data.ok) {
        setAgents(data.data)
        setSelectedId(prev => {
          if (!prev && data.data.length > 0) {
            setTimeout(() => setEditPrompt(data.data[0].activeVersion?.prompt ?? ''), 0)
            return data.data[0].id
          }
          return prev
        })
      }
    } catch {
      showToast('Failed to load agents', 'err')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const fetchEvalStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/eval')
      const data = await res.json()
      if (data.ok) setEvalBriefs(data.data.briefs)
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => { if (activeTab === 'eval') fetchEvalStatus() }, [activeTab, fetchEvalStatus])

  const runEval = useCallback(async (briefId: string | 'all') => {
    setEvalRunning(briefId)
    try {
      const res = await fetch('/api/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(briefId === 'all' ? { runAll: true } : { briefId }),
      })
      const data = await res.json()
      if (data.ok) {
        showToast(briefId === 'all' ? 'All 5 briefs evaluated' : 'Brief evaluated', 'ok')
        await fetchEvalStatus()
        await fetchAgents()
      } else {
        showToast(data.error ?? 'Eval failed', 'err')
      }
    } catch {
      showToast('Network error', 'err')
    } finally {
      setEvalRunning(null)
    }
  }, [fetchEvalStatus, fetchAgents, showToast])

  const selected = agents.find(a => a.id === selectedId)

  const selectAgent = useCallback((id: string) => {
    setSelectedId(id)
    setShowHistory(false)
    const agent = agents.find(a => a.id === id)
    setEditPrompt(agent?.activeVersion?.prompt ?? '')
    setHistory([])
  }, [agents])

  const fetchHistory = useCallback(async (agentId: string) => {
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/agents?agentId=${encodeURIComponent(agentId)}`)
      const data = await res.json()
      if (data.ok && data.versions) setHistory(data.versions)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!selectedId || !editPrompt.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedId, prompt: editPrompt }),
      })
      const data = await res.json()
      if (data.ok) {
        showToast('Agent prompt saved — new version active', 'ok')
        await fetchAgents()
        setShowHistory(false)
      } else {
        showToast(data.error ?? 'Save failed', 'err')
      }
    } catch {
      showToast('Network error', 'err')
    } finally {
      setSaving(false)
    }
  }, [selectedId, editPrompt, fetchAgents, showToast])

  const handleActivate = useCallback(async (versionId: string) => {
    if (!selectedId) return
    try {
      const res = await fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedId, versionId }),
      })
      const data = await res.json()
      if (data.ok) {
        showToast('Version activated', 'ok')
        await fetchAgents()
        if (showHistory) fetchHistory(selectedId)
      } else {
        showToast(data.error ?? 'Failed', 'err')
      }
    } catch {
      showToast('Network error', 'err')
    }
  }, [selectedId, fetchAgents, fetchHistory, showHistory, showToast])

  const scoreColor = (s: number | null) => {
    if (s === null) return 'text-ink3'
    if (s >= 8) return 'text-green'
    if (s >= 6) return 'text-amber'
    return 'text-rose-400'
  }

  const isDirty = editPrompt !== (selected?.activeVersion?.prompt ?? '')

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="sec-label mb-2">FORGE Engine</p>
          <h2 className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>Agent Editor</h2>
          <p className="text-sm text-ink3 mt-1">
            Edit system prompts per FORGE agent, or run the evaluation harness to seed quality scores.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {!canWrite && <span className="chip warn text-xs">Agency+ required to edit prompts</span>}
          <div className="flex gap-1 border border-border rounded-lg p-0.5">
            {(['editor', 'eval'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${activeTab === tab ? 'nav-tab-active' : 'text-ink3 hover:text-ink'}`}
              >
                {tab === 'eval' ? 'Eval Harness' : 'Prompt Editor'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Eval Harness Tab */}
      {activeTab === 'eval' && (
        <div className="space-y-6 animate-fadein">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm text-ink3">
                Run real agency briefs through the full 21-agent one-click pipeline to seed quality scores.
                Results populate <code className="text-xs bg-paper3 px-1 rounded">PromptVersion.avgScore</code> and feed the learning cycle.
              </p>
            </div>
            <button
              onClick={() => runEval('all')}
              disabled={!canWrite || evalRunning !== null}
              className="btn btn-primary text-sm py-1.5 disabled:opacity-50"
            >
              {evalRunning === 'all' ? 'Running all briefs…' : 'Run All 5 Briefs →'}
            </button>
          </div>

          {!canWrite && (
            <div className="panel border-amber/30 bg-amber/5 text-sm text-amber p-4">
              Evaluation harness requires Agency plan — runs consume real Anthropic API tokens.
            </div>
          )}

          <div className="space-y-3">
            {(evalBriefs.length > 0 ? evalBriefs : Array(5).fill(null)).map((brief, i) => {
              if (!brief) return (
                <div key={i} className="panel animate-pulse h-16 bg-paper3" />
              )
              return (
                <div key={brief.id} className={`panel flex items-start justify-between gap-4 flex-wrap ${brief.ran ? 'border-acid/20' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{brief.client}</span>
                      {brief.ran && <span className="chip acid text-xs">Ran</span>}
                      <span className="chip text-xs">≥{brief.expectedPhases} phases</span>
                      <span className="chip text-xs">min {brief.minScore}/10</span>
                    </div>
                    {brief.lastRun && (
                      <p className="text-xs text-ink3 mt-1">
                        Last score: <span className={`font-bold ${(brief.lastRun.score ?? 0) >= 8 ? 'text-green' : (brief.lastRun.score ?? 0) >= 6 ? 'text-amber' : 'text-rose-400'}`}>
                          {brief.lastRun.score?.toFixed(1) ?? '—'}/10
                        </span>
                        {' '}·{' '}
                        <span className={brief.lastRun.passed ? 'text-green' : 'text-rose-400'}>
                          {brief.lastRun.passed ? '✓ Approved' : '✗ Quality Review'}
                        </span>
                        {' '}· {new Date(brief.lastRun.createdAt).toLocaleDateString('en-IN')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => runEval(brief.id)}
                    disabled={!canWrite || evalRunning !== null}
                    className="btn btn-ghost text-xs py-1 disabled:opacity-50"
                  >
                    {evalRunning === brief.id ? 'Running…' : brief.ran ? 'Re-run' : 'Run →'}
                  </button>
                </div>
              )
            })}
          </div>

          {evalBriefs.some(b => b.ran) && (
            <div className="panel bg-acid/5 border-acid/30 text-sm">
              <p className="font-semibold mb-1">Learning cycle ready</p>
              <p className="text-ink3 text-xs">
                {evalBriefs.filter(b => b.ran).length}/5 briefs evaluated.
                The 6-hour AI learning cycle will now auto-improve any agent scoring below 9.0.
                Trigger it manually via <code className="bg-paper3 px-1 rounded">/api/learning/cycle?secret=CRON_SECRET</code>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Editor Tab */}
      {activeTab === 'editor' && loading ? (
        <div className="text-center py-20 text-ink3 text-sm">Loading agents…</div>
      ) : activeTab === 'editor' && (
        <div className="flex gap-6 flex-col lg:flex-row">
          {/* Agent list sidebar */}
          <div className="lg:w-64 flex-shrink-0 space-y-1">
            <p className="sec-label mb-2">Agents ({agents.length})</p>
            {agents.map(agent => (
              <button
                key={agent.id}
                onClick={() => selectAgent(agent.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                  selectedId === agent.id
                    ? 'nav-tab-active font-semibold'
                    : 'text-ink3 hover:text-ink hover:bg-paper2'
                }`}
              >
                <div className="text-sm font-medium">{agent.name}</div>
                <div className="text-[10px] text-ink3 mt-0.5 flex items-center gap-2">
                  <span>{agent.role}</span>
                  {agent.avgScore !== null && (
                    <span className={`font-mono font-bold ${scoreColor(agent.avgScore)}`}>
                      {agent.avgScore.toFixed(1)}
                    </span>
                  )}
                  {agent.versionCount > 0 && (
                    <span className="chip text-[9px]">v{agent.versionCount}</span>
                  )}
                  {agent.activeVersion && (
                    <span className="chip acid text-[9px]">custom</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Editor panel */}
          {selected ? (
            <div className="flex-1 min-w-0 space-y-6">
              {/* Agent header */}
              <div className="panel flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="font-bold text-lg">{selected.name}</h3>
                  <p className="text-xs text-ink3 mt-0.5">{selected.role}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {selected.activeVersion ? (
                      <>
                        <span className="chip acid text-xs">Custom prompt active</span>
                        <span className="chip text-xs">{selected.versionCount} version{selected.versionCount !== 1 ? 's' : ''}</span>
                      </>
                    ) : (
                      <span className="chip text-xs">Using default system prompt</span>
                    )}
                    {selected.avgScore !== null && (
                      <span className={`chip text-xs font-bold ${scoreColor(selected.avgScore)}`}>
                        Avg score: {selected.avgScore.toFixed(1)}/10
                      </span>
                    )}
                    {selected.runCount > 0 && (
                      <span className="chip text-xs">{selected.runCount} runs</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {selected.versionCount > 0 && (
                    <button
                      onClick={() => {
                        setShowHistory(h => !h)
                        if (!showHistory && selectedId) fetchHistory(selectedId)
                      }}
                      className="btn btn-ghost text-xs py-1.5"
                    >
                      {showHistory ? 'Hide history' : `History (${selected.versionCount})`}
                    </button>
                  )}
                  {canWrite && isDirty && (
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="btn btn-primary text-xs py-1.5 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save & activate →'}
                    </button>
                  )}
                </div>
              </div>

              {/* Version history */}
              {showHistory && (
                <div className="space-y-2">
                  <p className="sec-label">Version History</p>
                  {historyLoading ? (
                    <p className="text-xs text-ink3">Loading…</p>
                  ) : history.length === 0 ? (
                    <p className="text-xs text-ink3">No saved versions — history appears after your first save.</p>
                  ) : (
                    <div className="border border-border rounded-xl overflow-hidden">
                      <table className="w-full text-sm border-collapse">
                        <thead className="border-b border-border bg-paper2">
                          <tr>
                            {['Date', 'Score', 'Runs', 'Status', ''].map(h => (
                              <th key={h} className="text-left py-2 px-4 text-xs font-semibold text-ink3">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {history.map(v => (
                            <tr key={v.id} className="border-b border-border hover:bg-paper2">
                              <td className="py-2 px-4 text-xs font-mono text-ink3">
                                {new Date(v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </td>
                              <td className={`py-2 px-4 text-xs font-bold ${scoreColor(v.avgScore)}`}>
                                {v.avgScore > 0 ? `${v.avgScore.toFixed(1)}/10` : '—'}
                              </td>
                              <td className="py-2 px-4 text-xs text-ink3">{v.runCount}</td>
                              <td className="py-2 px-4">
                                {v.active
                                  ? <span className="chip acid text-xs">Active</span>
                                  : <span className="chip text-xs">Inactive</span>
                                }
                              </td>
                              <td className="py-2 px-4">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => { setEditPrompt(v.prompt); setShowHistory(false) }}
                                    className="text-xs text-ink3 underline hover:text-ink"
                                  >
                                    Load
                                  </button>
                                  {!v.active && canWrite && (
                                    <button
                                      onClick={() => handleActivate(v.id)}
                                      className="text-xs text-acid underline hover:opacity-80"
                                    >
                                      Activate
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Prompt editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="sec-label">System Prompt</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink3">{editPrompt.length} chars</span>
                    {isDirty && <span className="chip acid text-xs">Unsaved changes</span>}
                  </div>
                </div>

                {canWrite ? (
                  <textarea
                    value={editPrompt}
                    onChange={e => setEditPrompt(e.target.value)}
                    rows={20}
                    className="w-full px-4 py-3 rounded-xl text-sm font-mono border border-border bg-paper2 outline-none focus:border-acid resize-y leading-relaxed"
                    placeholder={`Enter the system prompt for the ${selected.name} agent…\n\nThis prompt will be injected at the start of each FORGE run for this agent phase. Be specific about:\n- Output format\n- Agency context\n- Quality expectations`}
                    spellCheck={false}
                  />
                ) : (
                  <div className="relative">
                    <pre className="prompt-block text-xs overflow-auto max-h-96 whitespace-pre-wrap leading-relaxed">
                      {editPrompt || `(No custom prompt — using FORGE default for ${selected.id})`}
                    </pre>
                    <div className="absolute inset-0 bg-paper/60 backdrop-blur-[2px] rounded-xl flex items-center justify-center">
                      <div className="text-center space-y-2 px-4">
                        <p className="font-semibold text-sm">Agency plan required</p>
                        <p className="text-xs text-ink3">Upgrade to edit agent system prompts</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Scoring preview */}
              {selected.activeVersion && (
                <div className="panel space-y-3">
                  <p className="sec-label">Scoring Preview</p>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Avg Quality', val: selected.avgScore !== null ? `${selected.avgScore.toFixed(1)}/10` : 'No data', color: scoreColor(selected.avgScore) },
                      { label: 'Run Count', val: selected.runCount > 0 ? String(selected.runCount) : '0', color: 'text-ink' },
                      { label: 'Version', val: selected.versionCount > 0 ? `v${selected.versionCount}` : 'default', color: 'text-acid' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="text-center">
                        <p className={`text-2xl font-bold ${color}`} style={{ fontFamily: 'var(--ff-d)' }}>{val}</p>
                        <p className="text-xs text-ink3 mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                  {selected.avgScore !== null && selected.avgScore < 7.5 && (
                    <div className="border border-amber/30 bg-amber/5 rounded-lg p-3 text-xs text-amber">
                      Score below 7.5 — the learning cycle will auto-improve this prompt at the next 6h cycle. You can also edit manually above.
                    </div>
                  )}
                  {selected.avgScore !== null && selected.avgScore >= 9 && (
                    <div className="border border-green/30 bg-green/5 rounded-lg p-3 text-xs text-green">
                      Excellent score — learning cycle will skip auto-improvement for this agent.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center py-20 text-ink3 text-sm">
              Select an agent from the left to view and edit its system prompt.
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg animate-fadein max-w-xs border ${
          toast.kind === 'ok'
            ? 'bg-paper2 border-green/30 text-ink'
            : 'bg-paper2 border-red-500/30 text-red-400'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
