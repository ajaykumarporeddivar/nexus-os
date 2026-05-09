'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { auditEvent } from '@/lib/auditEvent'

interface AuditRow {
  id: string
  action: string
  userId: string | null
  sessionId: string
  meta: Record<string, unknown>
  createdAt: string
}

const ALL_ACTIONS = [
  'forge_run_started', 'forge_run_completed', 'forge_download',
  'runtime_iteration', 'vault_view', 'vault_launch_forge',
  'vault_prompt_saved', 'vault_version_activated',
  'demo_booking', 'api_key_set', 'api_key_cleared',
  'theme_change', 'audit_view', 'geo_refresh',
  'learning_cycle', 'agent_prompt_saved',
]

type Severity = 'critical' | 'warn' | 'info'

const ACTION_SEVERITY: Record<string, Severity> = {
  api_key_set:             'critical',
  api_key_cleared:         'critical',
  agent_prompt_saved:      'warn',
  vault_version_activated: 'warn',
  vault_prompt_saved:      'warn',
  forge_run_started:       'info',
  forge_run_completed:     'info',
  forge_download:          'info',
  runtime_iteration:       'info',
  vault_view:              'info',
  vault_launch_forge:      'info',
  demo_booking:            'info',
  theme_change:            'info',
  audit_view:              'info',
  geo_refresh:             'info',
  learning_cycle:          'info',
}

const SEVERITY_META: Record<Severity, { label: string; cls: string; dot: string }> = {
  critical: { label: 'Critical', cls: 'text-red-400 border-red-400/30 bg-red-400/5', dot: 'bg-red-400' },
  warn:     { label: 'Warning',  cls: 'text-amber border-amber/30 bg-amber/5',       dot: 'bg-amber' },
  info:     { label: 'Info',     cls: 'text-ink3 border-border bg-paper2',           dot: 'bg-ink3' },
}

const ACTION_COLORS: Record<string, string> = {
  forge_run_started:       'acid',
  forge_run_completed:     'ok',
  forge_download:          'ok',
  vault_prompt_saved:      'acid',
  vault_version_activated: 'acid',
  demo_booking:            'ok',
  runtime_iteration:       '',
  vault_view:              '',
  vault_launch_forge:      '',
  api_key_set:             'warn',
  api_key_cleared:         'warn',
  theme_change:            '',
  audit_view:              '',
  geo_refresh:             'acid',
  learning_cycle:          'acid',
  agent_prompt_saved:      'warn',
}

// Shape/icon prefix so status is readable without relying on color alone
const ACTION_ICONS: Record<string, string> = {
  forge_run_started:       '▶',
  forge_run_completed:     '✓',
  forge_download:          '↓',
  vault_prompt_saved:      '✎',
  vault_version_activated: '◈',
  demo_booking:            '✓',
  runtime_iteration:       '⟳',
  vault_view:              '○',
  vault_launch_forge:      '▶',
  api_key_set:             '!',
  api_key_cleared:         '!',
  theme_change:            '○',
  audit_view:              '○',
  geo_refresh:             '⟳',
  learning_cycle:          '⟳',
  agent_prompt_saved:      '!',
}

function actionChip(action: string) {
  const cls  = ACTION_COLORS[action] ?? ''
  const icon = ACTION_ICONS[action]  ?? '○'
  const label = action.replace(/_/g, ' ')
  return (
    <span className={`chip text-[10px] font-mono ${cls}`} title={label}>
      {icon} {label}
    </span>
  )
}

function metaPreview(meta: Record<string, unknown>): string {
  const keys = Object.keys(meta)
  if (keys.length === 0) return '—'
  return keys
    .slice(0, 3)
    .map(k => {
      const v = meta[k]
      const str = typeof v === 'object' ? JSON.stringify(v) : String(v)
      return `${k}: ${str.length > 40 ? str.slice(0, 40) + '…' : str}`
    })
    .join(' · ')
}

export default function AuditPage() {
  const { data: session } = useSession()
  const plan = (session?.user as { plan?: string } | null)?.plan ?? 'free'

  const [rows, setRows]           = useState<AuditRow[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all')
  const [search, setSearch]       = useState('')
  const [limit, setLimit]         = useState(100)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [groupBySess, setGroupBySess] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: String(limit) })
      if (actionFilter !== 'all') params.set('action', actionFilter)
      const res = await fetch(`/api/audit?${params}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Failed to load')
      setRows(data.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [limit, actionFilter])

  // Initial load + audit event
  useEffect(() => {
    fetchLogs()
    auditEvent('audit_view', { plan }).catch(() => {})
  }, [fetchLogs, plan])

  // Auto-refresh every 15s
  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => fetchLogs(true), 15_000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [autoRefresh, fetchLogs])

  const filtered = rows.filter(r => {
    if (severityFilter !== 'all') {
      const sev = ACTION_SEVERITY[r.action] ?? 'info'
      if (sev !== severityFilter) return false
    }
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.action.includes(q) ||
      r.sessionId.toLowerCase().includes(q) ||
      (r.userId ?? '').toLowerCase().includes(q) ||
      JSON.stringify(r.meta).toLowerCase().includes(q)
    )
  })

  // Group by session if toggled
  const grouped: { sessionId: string; rows: AuditRow[] }[] = groupBySess
    ? Object.entries(
        filtered.reduce<Record<string, AuditRow[]>>((acc, r) => {
          ;(acc[r.sessionId] = acc[r.sessionId] ?? []).push(r)
          return acc
        }, {})
      ).map(([sessionId, rows]) => ({ sessionId, rows }))
    : []

  // Summary counts by action
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1
    return acc
  }, {})

  const topActions = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="sec-label mb-2">System</p>
          <h2 className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>Audit Log</h2>
          <p className="text-sm text-ink3 mt-1">
            Full action trail — {rows.length} events loaded
            {plan !== 'agency' && plan !== 'enterprise' && (
              <span className="ml-2 chip warn text-xs">Read-only view — Agency+ to filter by user</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setAutoRefresh(r => !r)}
            className={`btn text-sm py-1.5 ${autoRefresh ? 'btn-primary' : 'btn-ghost'}`}
          >
            {autoRefresh ? '⟳ Live' : '⟳ Auto-refresh'}
          </button>
          <button onClick={() => fetchLogs()} disabled={loading} className="btn btn-ghost text-sm py-1.5 disabled:opacity-50">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {topActions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {topActions.map(([action, count]) => (
            <button
              key={action}
              onClick={() => { setActionFilter(a => a === action ? 'all' : action) }}
              className={`kpi-card text-left transition-colors cursor-pointer hover:border-acid/40 ${actionFilter === action ? 'border-acid bg-acid/5' : ''}`}
            >
              <p className="text-xs text-ink3 mb-1 truncate">{action.replace(/_/g, ' ')}</p>
              <p className="text-2xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>{count}</p>
            </button>
          ))}
        </div>
      )}

      {/* Severity filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink3 font-medium mr-1">Severity:</span>
        {(['all', 'critical', 'warn', 'info'] as const).map(sev => {
          const meta = sev !== 'all' ? SEVERITY_META[sev] : null
          const isActive = severityFilter === sev
          return (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-all font-medium ${
                isActive
                  ? sev === 'all' ? 'bg-ink text-paper border-ink' : `${meta!.cls} font-bold`
                  : 'border-border text-ink3 hover:text-ink hover:bg-paper2'
              }`}
            >
              {meta && <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />}
              {sev === 'all' ? 'All' : meta!.label}
              {sev !== 'all' && (
                <span className="ml-0.5 opacity-60">
                  ({rows.filter(r => (ACTION_SEVERITY[r.action] ?? 'info') === sev).length})
                </span>
              )}
            </button>
          )
        })}
        <div className="ml-auto">
          <button
            onClick={() => setGroupBySess(g => !g)}
            className={`px-3 py-1 rounded-full text-xs border transition-all ${groupBySess ? 'bg-ink text-paper border-ink' : 'border-border text-ink3 hover:text-ink'}`}
          >
            {groupBySess ? '◉ Grouped by session' : '○ Group by session'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search action, session, meta…"
          className="flex-1 min-w-48 px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
        />
        <select
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setTimeout(() => fetchLogs(), 0) }}
          className="px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
        >
          <option value="all">All actions</option>
          {ALL_ACTIONS.map(a => (
            <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          className="px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
        >
          {[50, 100, 250, 500].map(n => <option key={n} value={n}>Last {n}</option>)}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="panel border-red-500/30 bg-red-500/5 text-red-400 text-sm p-4">{error}</div>
      )}

      {/* Table */}
      {loading && rows.length === 0 ? (
        <div className="text-center py-20 text-ink3 text-sm">Loading audit events…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-ink3 text-sm">
          {search || actionFilter !== 'all' || severityFilter !== 'all' ? 'No events match your filters.' : 'No audit events yet.'}
        </div>
      ) : groupBySess ? (
        <div className="space-y-4">
          {grouped.map(({ sessionId, rows: sessRows }) => (
            <div key={sessionId} className="border border-border rounded-xl overflow-hidden">
              <div className="bg-paper2 px-4 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-mono text-ink3">Session …{sessionId.slice(-12)}</span>
                <span className="chip text-xs">{sessRows.length} event{sessRows.length !== 1 ? 's' : ''}</span>
              </div>
              <table className="w-full text-sm border-collapse">
                <tbody>
                  {sessRows.map(row => {
                    const sev = ACTION_SEVERITY[row.action] ?? 'info'
                    const sevMeta = SEVERITY_META[sev]
                    return (
                      <tr key={row.id} className="border-b border-border last:border-0 hover:bg-paper2 transition-colors cursor-pointer" onClick={() => setExpanded(e => e === row.id ? null : row.id)}>
                        <td className="py-2 px-4 w-6"><span className={`inline-block w-1.5 h-1.5 rounded-full ${sevMeta.dot}`} /></td>
                        <td className="py-2 px-4 whitespace-nowrap text-xs font-mono text-ink3">{new Date(row.createdAt).toLocaleTimeString('en-IN', { hour12: false })}</td>
                        <td className="py-2 px-4">{actionChip(row.action)}</td>
                        <td className="py-2 px-4 max-w-xs"><span className="text-xs text-ink3 truncate block">{metaPreview(row.meta)}</span></td>
                        <td className="py-2 px-4 text-ink3 text-xs">{expanded === row.id ? '▲' : '▼'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="border-b border-border bg-paper2">
              <tr>
                {['', 'Time', 'Action', 'Session', 'Meta', ''].map((h, i) => (
                  <th key={i} className="text-left py-2.5 px-4 text-xs font-semibold text-ink3 sec-label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const sev = ACTION_SEVERITY[row.action] ?? 'info'
                const sevMeta = SEVERITY_META[sev]
                return (
                  <>
                    <tr
                      key={row.id}
                      className={`border-b border-border hover:bg-paper2 transition-colors cursor-pointer ${sev === 'critical' ? 'bg-red-400/3' : ''}`}
                      onClick={() => setExpanded(e => e === row.id ? null : row.id)}
                    >
                      <td className="py-2.5 px-4 w-6">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${sevMeta.dot}`} title={sevMeta.label} />
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="text-xs font-mono text-ink3">
                          {new Date(row.createdAt).toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <br />
                        <span className="text-[10px] text-ink3">
                          {new Date(row.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">{actionChip(row.action)}</td>
                      <td className="py-2.5 px-4">
                        <span className="text-xs font-mono text-ink3">…{row.sessionId.slice(-8)}</span>
                      </td>
                      <td className="py-2.5 px-4 max-w-xs">
                        <span className="text-xs text-ink3 truncate block">{metaPreview(row.meta)}</span>
                      </td>
                      <td className="py-2.5 px-4 text-ink3 text-xs">
                        {expanded === row.id ? '▲' : '▼'}
                      </td>
                    </tr>
                    {expanded === row.id && (
                      <tr key={`${row.id}-exp`} className="border-b border-border bg-paper2">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid sm:grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="sec-label mb-1">Event ID</p>
                              <p className="font-mono text-ink3">{row.id}</p>
                            </div>
                            <div>
                              <p className="sec-label mb-1">Session ID</p>
                              <p className="font-mono text-ink3">{row.sessionId}</p>
                            </div>
                            {row.userId && (
                              <div>
                                <p className="sec-label mb-1">User ID</p>
                                <p className="font-mono text-ink3">{row.userId}</p>
                              </div>
                            )}
                            <div className="sm:col-span-2">
                              <p className="sec-label mb-2">Meta</p>
                              {'before' in row.meta && 'after' in row.meta ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <p className="text-[10px] text-red-400 font-mono mb-1">— before</p>
                                    <pre className="prompt-block text-[11px] overflow-x-auto whitespace-pre-wrap text-red-400/80 border-red-400/20">{JSON.stringify(row.meta.before, null, 2)}</pre>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-green font-mono mb-1">+ after</p>
                                    <pre className="prompt-block text-[11px] overflow-x-auto whitespace-pre-wrap text-green/80 border-green/20">{JSON.stringify(row.meta.after, null, 2)}</pre>
                                  </div>
                                </div>
                              ) : (
                                <pre className="prompt-block text-[11px] overflow-x-auto whitespace-pre-wrap">
                                  {JSON.stringify(row.meta, null, 2)}
                                </pre>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-ink3">
        <span>Showing {filtered.length} of {rows.length} events</span>
        {autoRefresh && <span className="chip acid">Live — refreshing every 15s</span>}
      </div>
    </div>
  )
}
