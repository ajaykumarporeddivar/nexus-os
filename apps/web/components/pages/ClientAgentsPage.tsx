'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWorkspace } from '@/lib/workspaceContext'
import { CLIENT_AGENTS, type ClientAgentType } from '@/lib/clientAgentData'
import { useSearchParams } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientAgentRow {
  id:             string
  agentType:      string
  label:          string | null
  enabled:        boolean
  schedule:       string
  deliveryMethod: string
  deliveryEmail:  string | null
  deliveryPhone:  string | null
  lastRunAt:      string | null
  lastOutput:     string | null
  jobs: {
    id:          string
    status:      string
    completedAt: string | null
    delivered:   boolean
  }[]
}

type RunResult = { jobId: string; agentType: string; output: string; durationMs: number }

const SCHEDULE_OPTS  = [{ v: 'daily', l: 'Daily' }, { v: 'weekly', l: 'Weekly' }, { v: 'manual', l: 'Manual only' }]
const DELIVERY_OPTS  = [{ v: 'email', l: 'Email' }, { v: 'whatsapp', l: 'WhatsApp' }, { v: 'portal', l: 'Portal only' }]

const STATUS_COLOR: Record<string, string> = {
  done:    'text-green-400',
  running: 'text-amber-400 animate-pulse',
  failed:  'text-red-400',
  queued:  'text-ink3',
}

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  const h = Math.floor(m / 60)
  const days = Math.floor(h / 24)
  if (days > 0) return `${days}d ago`
  if (h   > 0) return `${h}h ago`
  if (m   > 0) return `${m}m ago`
  return 'just now'
}

// ─── Add Agent Modal ──────────────────────────────────────────────────────────

function AddAgentModal({
  workspaceId,
  onDone,
  onCancel,
}: {
  workspaceId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [agentType,      setAgentType]      = useState<ClientAgentType>('email-triage')
  const [schedule,       setSchedule]       = useState('weekly')
  const [deliveryMethod, setDeliveryMethod] = useState('email')
  const [deliveryEmail,  setDeliveryEmail]  = useState('')
  const [deliveryPhone,  setDeliveryPhone]  = useState('')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')

  const selected = CLIENT_AGENTS.find(a => a.id === agentType)!

  async function handleSave() {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agents`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType,
          schedule,
          deliveryMethod,
          deliveryEmail:  deliveryMethod === 'email'     ? deliveryEmail  : undefined,
          deliveryPhone:  deliveryMethod === 'whatsapp'  ? deliveryPhone  : undefined,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-paper border border-border rounded-2xl w-full max-w-lg shadow-2xl space-y-5 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">Add client agent</h3>
          <button onClick={onCancel} className="text-ink3 hover:text-ink text-sm">✕</button>
        </div>

        {/* Agent type picker */}
        <div>
          <label className="sec-label mb-2 block">Agent type</label>
          <div className="grid grid-cols-2 gap-2">
            {CLIENT_AGENTS.map(a => (
              <button
                key={a.id}
                onClick={() => setAgentType(a.id)}
                className={`text-left p-3 rounded-xl border transition-all ${agentType === a.id ? 'border-acid bg-acid/10' : 'border-border hover:border-acid/40'}`}
              >
                <span className="text-lg">{a.icon}</span>
                <p className="text-xs font-semibold mt-1">{a.label}</p>
                <p className="text-[10px] text-ink3 line-clamp-2 mt-0.5">{a.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="sec-label mb-1 block">Schedule</label>
            <select
              value={schedule}
              onChange={e => setSchedule(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
            >
              {SCHEDULE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>

          <div>
            <label className="sec-label mb-1 block">Deliver via</label>
            <select
              value={deliveryMethod}
              onChange={e => setDeliveryMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
            >
              {DELIVERY_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        </div>

        {/* Delivery destination */}
        {deliveryMethod === 'email' && (
          <div>
            <label className="sec-label mb-1 block">Client email address</label>
            <input
              type="email"
              value={deliveryEmail}
              onChange={e => setDeliveryEmail(e.target.value)}
              placeholder="client@company.com"
              className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
            />
          </div>
        )}
        {deliveryMethod === 'whatsapp' && (
          <div>
            <label className="sec-label mb-1 block">Client WhatsApp number (with country code)</label>
            <input
              type="tel"
              value={deliveryPhone}
              onChange={e => setDeliveryPhone(e.target.value)}
              placeholder="+919876543210"
              className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
            />
          </div>
        )}

        {/* Default input info */}
        <div className="bg-paper2 rounded-lg px-3 py-2 text-[10px] text-ink3 font-mono">
          <span className="text-acid font-bold">Input hint: </span>{selected.inputHint.split('\n')[0]}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn btn-ghost text-xs">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary text-xs disabled:opacity-50">
            {saving ? 'Adding…' : 'Add agent'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Run Panel ────────────────────────────────────────────────────────────────

function RunPanel({
  agent,
  onClose,
}: {
  agent: ClientAgentRow
  onClose: () => void
}) {
  const def       = CLIENT_AGENTS.find(a => a.id === agent.agentType)
  const [input,   setInput]   = useState('')
  const [running, setRunning] = useState(false)
  const [result,  setResult]  = useState<RunResult | null>(null)
  const [error,   setError]   = useState('')

  async function handleRun() {
    setRunning(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/client-agents/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, inputText: input }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setResult(json.data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-paper border border-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-paper border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <p className="sec-label text-[10px]">{agent.agentType}</p>
            <h3 className="font-bold text-sm">{def?.label ?? agent.agentType}</h3>
          </div>
          <button onClick={onClose} className="text-ink3 hover:text-ink text-sm">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {!result && (
            <>
              <div>
                <label className="sec-label mb-1 block">{def?.inputLabel ?? 'Input'}</label>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  rows={6}
                  placeholder={def?.inputHint ?? 'Paste your input here…'}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid resize-none font-mono"
                />
                <p className="text-[10px] text-ink3 mt-1">Leave blank — connected tools (Gmail, Calendar, etc.) will be used automatically.</p>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="btn btn-ghost text-xs">Cancel</button>
                <button
                  onClick={handleRun}
                  disabled={running}
                  className="btn btn-primary text-xs disabled:opacity-50 min-w-[100px]"
                >
                  {running ? (
                    <span className="animate-pulse">Running agent…</span>
                  ) : 'Run now →'}
                </button>
              </div>
            </>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-green-400 font-mono">
                <span>✓ Done in {(result.durationMs / 1000).toFixed(1)}s</span>
              </div>

              <div className="bg-paper2 rounded-xl p-4 font-mono text-xs text-ink2 whitespace-pre-wrap leading-relaxed border border-border/50 max-h-96 overflow-y-auto">
                {result.output}
              </div>

              {/* Deliver button */}
              {(agent.deliveryEmail || agent.deliveryPhone) && (
                <DeliverButton jobId={result.jobId} method={agent.deliveryMethod} />
              )}

              <div className="flex gap-2 justify-end">
                <button onClick={() => setResult(null)} className="btn btn-ghost text-xs">Run again</button>
                <button onClick={onClose} className="btn btn-primary text-xs">Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DeliverButton({ jobId, method }: { jobId: string; method: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  async function deliver() {
    setState('sending')
    try {
      const res = await fetch('/api/client-agents/deliver', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      const json = await res.json()
      setState(json.ok && json.data?.delivered ? 'done' : 'error')
    } catch {
      setState('error')
    }
  }

  if (state === 'done')    return <p className="text-xs text-green-400 font-mono">✓ Delivered via {method}</p>
  if (state === 'error')   return <p className="text-xs text-red-400">Delivery failed — check logs</p>

  return (
    <button
      onClick={deliver}
      disabled={state === 'sending'}
      className="btn btn-ghost text-xs border-acid/30 text-acid disabled:opacity-50"
    >
      {state === 'sending' ? 'Sending…' : `Send to client via ${method} →`}
    </button>
  )
}

// ─── Integrations Panel ───────────────────────────────────────────────────────

interface IntegrationRow {
  provider:     string
  accountEmail: string | null
  enabled:      boolean
  updatedAt:    string
}

const INTEGRATION_DEFS: Array<{ id: string; label: string; icon: string; description: string; color: string }> = [
  { id: 'gmail',           label: 'Gmail',           icon: '📧', description: 'Read unread inbox — powers Email Triage & Follow-up agents',   color: 'text-red-400 border-red-400/30 bg-red-400/5' },
  { id: 'google-calendar', label: 'Google Calendar', icon: '📅', description: 'Upcoming events — powers Meeting Prep & Weekly Digest agents',  color: 'text-blue-400 border-blue-400/30 bg-blue-400/5' },
  { id: 'notion',          label: 'Notion',          icon: '📓', description: 'Recently edited pages — powers Context Brief & Loop Closer',     color: 'text-ink2 border-border bg-paper2' },
  { id: 'hubspot',         label: 'HubSpot',         icon: '🔶', description: 'Open deals — powers Follow-up Sequencer & Weekly Digest',       color: 'text-orange-400 border-orange-400/30 bg-orange-400/5' },
  { id: 'slack',           label: 'Slack',           icon: '💬', description: 'Channel activity — powers Loop Closer & Context Brief agents',   color: 'text-purple-400 border-purple-400/30 bg-purple-400/5' },
]

function IntegrationsPanel({ workspaceId }: { workspaceId: string }) {
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const searchParams = useSearchParams()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/integrations/list?workspaceId=${workspaceId}`)
      const json = await res.json()
      if (json.ok) setIntegrations(json.data)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  // Show toast if redirected back from OAuth
  const intResult   = searchParams.get('integration')
  const intProvider = searchParams.get('provider')

  async function disconnect(provider: string) {
    if (!confirm(`Disconnect ${provider}? Agents using this data source will fall back to manual input.`)) return
    setDisconnecting(provider)
    try {
      await fetch('/api/integrations/disconnect', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, provider }),
      })
      load()
    } finally { setDisconnecting(null) }
  }

  const connectedMap = Object.fromEntries(integrations.map(i => [i.provider, i]))

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="sec-label text-[10px]">Connected Tools</p>
          <p className="text-sm font-semibold">Live data sources</p>
        </div>
        <p className="text-[10px] text-ink3 max-w-[180px] text-right">
          Connected tools are automatically used when agents run — no manual paste needed.
        </p>
      </div>

      {intResult === 'success' && intProvider && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400">
          ✓ {intProvider} connected successfully
        </div>
      )}
      {intResult === 'error' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-400/10 border border-red-400/20 text-xs text-red-400">
          ✗ Integration failed — {searchParams.get('reason') ?? 'unknown error'}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-ink3 animate-pulse">Checking connections…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {INTEGRATION_DEFS.map(def => {
            const connected = connectedMap[def.id]
            return (
              <div key={def.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs transition-all ${connected ? def.color : 'border-border bg-paper text-ink3'}`}>
                <span className="text-lg flex-shrink-0">{def.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-xs">{def.label}</p>
                  {connected ? (
                    <p className="text-[10px] truncate opacity-70">{connected.accountEmail ?? 'Connected'}</p>
                  ) : (
                    <p className="text-[10px] opacity-50 truncate">{def.description}</p>
                  )}
                </div>
                {connected ? (
                  <button
                    onClick={() => disconnect(def.id)}
                    disabled={disconnecting === def.id}
                    className="text-[10px] text-ink3 hover:text-red-400 flex-shrink-0 disabled:opacity-50 transition-colors"
                  >
                    {disconnecting === def.id ? '…' : 'Disconnect'}
                  </button>
                ) : (
                  <a
                    href={`/api/integrations/connect?provider=${def.id}&workspaceId=${workspaceId}`}
                    className="flex-shrink-0 text-[10px] px-2 py-1 rounded-lg border border-acid/40 text-acid hover:bg-acid/10 transition-colors"
                  >
                    Connect
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClientAgentsPage() {
  const { active, workspaces, isLoading: wsLoading } = useWorkspace()

  const [agents,    setAgents]    = useState<ClientAgentRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [addOpen,   setAddOpen]   = useState(false)
  const [runAgent,  setRunAgent]  = useState<ClientAgentRow | null>(null)
  const [outputOf,  setOutputOf]  = useState<ClientAgentRow | null>(null)

  const workspaceId = active?.id

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return }
    setLoading(true)
    try {
      const res  = await fetch(`/api/workspaces/${workspaceId}/agents`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setAgents(json.data.agents)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  async function toggleEnabled(agent: ClientAgentRow) {
    await fetch(`/api/workspaces/${workspaceId}/agents`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agent.id, enabled: !agent.enabled }),
    })
    load()
  }

  async function deleteAgent(agent: ClientAgentRow) {
    if (!confirm(`Remove agent "${agent.label ?? agent.agentType}"?`)) return
    await fetch(`/api/workspaces/${workspaceId}/agents?agentId=${agent.id}`, { method: 'DELETE' })
    load()
  }

  if (wsLoading) return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <p className="text-sm text-ink3 animate-pulse">Loading workspace…</p>
    </div>
  )

  if (!workspaceId) return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <p className="text-sm text-ink3">Select a workspace first to manage its client agents.</p>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      {addOpen  && <AddAgentModal workspaceId={workspaceId} onDone={() => { setAddOpen(false); load() }} onCancel={() => setAddOpen(false)} />}
      {runAgent && <RunPanel agent={runAgent} onClose={() => { setRunAgent(null); load() }} />}

      {/* Output viewer */}
      {outputOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-paper border border-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-paper border-b border-border px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm">Last output — {outputOf.label ?? outputOf.agentType}</h3>
              <button onClick={() => setOutputOf(null)} className="text-ink3 hover:text-ink text-sm">✕</button>
            </div>
            <div className="p-6">
              <pre className="font-mono text-xs text-ink2 whitespace-pre-wrap leading-relaxed">
                {outputOf.lastOutput ?? 'No output yet.'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="sec-label mb-1">Client Agents</p>
          <h2 className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>
            AI Employees
          </h2>
          <p className="text-sm text-ink3 mt-1">
            {active?.name
              ? `Agents running for ${active.name} — delivering outputs automatically on schedule.`
              : 'Configure AI agents that run on schedule and deliver outputs to your clients.'}
          </p>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn btn-primary text-sm">
          + Add agent
        </button>
      </div>

      {/* Workspace selector hint */}
      {workspaces.length > 1 && (
        <p className="text-[10px] text-ink3 font-mono">
          Showing agents for: <span className="text-acid">{active?.name}</span> — switch workspace to manage other clients.
        </p>
      )}

      {error && (
        <div className="panel border-red-400/30 bg-red-400/5 px-4 py-2 text-xs text-red-400">{error}</div>
      )}

      {/* What this does */}
      <div className="card bg-acid/3 border-acid/20 p-4 space-y-2">
        <p className="text-xs font-bold text-acid font-mono uppercase tracking-widest">6 Universal Executive Problems → 1-Click Solved</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CLIENT_AGENTS.map(a => (
            <div key={a.id} className="flex items-start gap-2 text-xs text-ink3">
              <span>{a.icon}</span>
              <div>
                <p className="font-medium text-ink2">{a.label}</p>
                <p className="text-[10px]">{a.defaultSchedule}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Integrations */}
      <IntegrationsPanel workspaceId={workspaceId} />

      {/* Agent list */}
      {loading ? (
        <p className="text-sm text-ink3 animate-pulse">Loading agents…</p>
      ) : agents.length === 0 ? (
        <div className="card text-center py-10 space-y-3">
          <p className="text-3xl">🤖</p>
          <p className="text-sm font-medium">No agents configured yet</p>
          <p className="text-xs text-ink3 max-w-xs mx-auto">
            Add your first agent to start delivering automated AI outputs to your client.
          </p>
          <button onClick={() => setAddOpen(true)} className="btn btn-primary text-xs mt-2">
            + Add first agent
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map(agent => {
            const def     = CLIENT_AGENTS.find(a => a.id === agent.agentType)
            const lastJob = agent.jobs[0]

            return (
              <div key={agent.id} className={`card flex items-start gap-4 transition-all ${!agent.enabled ? 'opacity-50' : ''}`}>
                <div className="text-2xl select-none">{def?.icon ?? '🤖'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-semibold font-mono text-sm">{agent.label ?? def?.label ?? agent.agentType}</span>
                    <span className="chip text-[10px] bg-paper3 border-border text-ink3">{agent.schedule}</span>
                    <span className={`chip text-[10px] ${agent.deliveryMethod === 'email' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : agent.deliveryMethod === 'whatsapp' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-paper3 text-ink3 border-border'}`}>
                      {agent.deliveryMethod}
                    </span>
                    {!agent.enabled && <span className="chip text-[10px] bg-paper3 text-ink3 border-border">paused</span>}
                  </div>

                  <p className="text-[10px] text-ink3">{def?.description}</p>

                  {agent.deliveryEmail && (
                    <p className="text-[10px] text-ink3 font-mono mt-1">→ {agent.deliveryEmail}</p>
                  )}
                  {agent.deliveryPhone && (
                    <p className="text-[10px] text-ink3 font-mono mt-1">→ {agent.deliveryPhone}</p>
                  )}

                  {agent.lastRunAt && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-ink3">Last run: {relTime(agent.lastRunAt)}</span>
                      {lastJob && (
                        <span className={`text-[10px] font-mono ${STATUS_COLOR[lastJob.status] ?? ''}`}>
                          {lastJob.status}{lastJob.delivered ? ' · delivered' : ''}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  {agent.lastOutput && (
                    <button onClick={() => setOutputOf(agent)} className="btn btn-ghost text-xs py-1 px-2">
                      View output
                    </button>
                  )}
                  <button onClick={() => setRunAgent(agent)} className="btn btn-primary text-xs py-1 px-2">
                    ▶ Run
                  </button>
                  <button onClick={() => toggleEnabled(agent)} className="btn btn-ghost text-xs py-1 px-2">
                    {agent.enabled ? 'Pause' : 'Enable'}
                  </button>
                  <button onClick={() => deleteAgent(agent)} className="btn btn-ghost text-xs py-1 px-2 text-red-400">
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
