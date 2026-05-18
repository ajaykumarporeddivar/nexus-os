'use client'

/**
 * Lead Management Dashboard — /shell/leads
 * SME-12: Admin operational dashboard
 * SME-13: ROI metrics, cost tracking, ICHS proxy
 * SME-7:  Failure taxonomy display (DLQ, P0/P1)
 * SME-9:  Routing decisions, rep override
 *
 * G10: sort, search, pagination, CSV export
 * G11: fixed rationale tooltip (data-tip attribute)
 * G13: avgScore, dlqCount, disqualRate in stats
 * G14: ICP drift panel
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import ShellPageWrapper from '@/components/ShellPageWrapper'

// ── Types ────────────────────────────────────────────────────────────────────

interface ScoreRationaleItem { factor: string; direction: 'positive' | 'negative'; weight: number }

interface Lead {
  id: string; email: string; name: string | null; company: string | null; role: string | null
  icpScore: number | null; scoreConfidence: number | null; scoreRationale: ScoreRationaleItem[] | null
  status: string; routingDecision: string | null; assignedRep: string | null
  consentCaptured: boolean; source: string | null; utmSource: string | null
  pipelineRunId: string | null; dlqAt: string | null; dlqReason: string | null
  scoringCostUsd: number | null; enrichCostUsd: number | null
  createdAt: string; scoredAt: string | null
  repOverrideScore: number | null; repOverrideReason: string | null; repOverrideBy: string | null
}

interface LeadsResponse {
  ok: boolean
  data: { leads: Lead[]; total: number; page: number; limit: number }
  meta: { statusCounts: Record<string, number>; costTodayUsd: number; hotLeads?: number }
  error?: string
}

interface DigestStats {
  totalLeads: number; avgIcpScore: number; disqualRate: number
  dlqCount: number; costPerHotLead: number; warnings: string[]
}

type SortField = 'createdAt' | 'icpScore' | 'scoringCostUsd' | 'status'
type SortOrder = 'asc' | 'desc'

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return 'text-ink3'
  if (score >= 70) return 'text-emerald-400'
  if (score >= 40) return 'text-amber-400'
  return 'text-red-400'
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    new:          'bg-paper2 text-ink3',
    enriched:     'bg-blue-500/15 text-blue-400',
    scored:       'bg-violet-500/15 text-violet-400',
    routed:       'bg-cyan-500/15 text-cyan-400',
    in_outreach:  'bg-amber-500/15 text-amber-400',
    converted:    'bg-emerald-500/15 text-emerald-400',
    disqualified: 'bg-paper2 text-ink3',
    dlq:          'bg-red-500/15 text-red-400',
  }
  return map[status] ?? 'bg-paper2 text-ink3'
}

function routingBadge(decision: string | null): string {
  if (!decision) return ''
  const map: Record<string, string> = {
    hot_queue:    'text-emerald-400',
    nurture:      'text-amber-400',
    disqualified: 'text-ink3',
  }
  return map[decision] ?? 'text-ink2'
}

const STATUS_FILTERS = ['all', 'new', 'scored', 'routed', 'in_outreach', 'converted', 'disqualified', 'dlq']

// ── CSV export helper ────────────────────────────────────────────────────────

function exportCSV(leads: Lead[]) {
  const headers = ['id','email','name','company','role','icpScore','scoreConfidence','status','routingDecision','source','utmSource','pipelineRunId','scoringCostUsd','createdAt','scoredAt']
  const rows = leads.map(l =>
    headers.map(h => {
      const v = (l as never as Record<string, unknown>)[h]
      if (v === null || v === undefined) return ''
      if (typeof v === 'string' && v.includes(',')) return `"${v.replace(/"/g, '""')}"`
      return String(v)
    }).join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `leads_${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ── Override Modal ───────────────────────────────────────────────────────────

function OverrideModal({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: () => void }) {
  const [action, setAction] = useState<'override_score' | 'disqualify' | 'mark_converted'>('override_score')
  const [score, setScore]   = useState(lead.repOverrideScore ?? lead.icpScore ?? 50)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  async function submit() {
    if (action !== 'mark_converted' && !reason.trim()) { setErr('Reason is required (SME-11 audit)'); return }
    setSaving(true); setErr('')
    try {
      const resp = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, score, reason: reason.trim(), rep: 'admin' }),
      })
      const data = await resp.json() as { ok: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Failed')
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-paper border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-ink">Lead Action</h3>
            <p className="text-[11px] text-ink3 mt-0.5">{lead.email}</p>
          </div>
          <button onClick={onClose} className="text-ink3 hover:text-ink text-lg leading-none transition-colors">✕</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] text-ink3 mb-1.5 uppercase tracking-wider font-mono">Action</label>
            <div className="flex gap-2 flex-wrap">
              {(['override_score', 'disqualify', 'mark_converted'] as const).map(a => (
                <button key={a} onClick={() => setAction(a)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${action === a ? 'border-acid/40 bg-acid/10 text-acid' : 'border-border text-ink3 hover:border-ink/30 hover:text-ink'}`}>
                  {a === 'override_score' ? 'Override Score' : a === 'disqualify' ? 'Disqualify' : 'Mark Converted'}
                </button>
              ))}
            </div>
          </div>
          {action === 'override_score' && (
            <div>
              <label className="block text-[11px] text-ink3 mb-1.5 uppercase tracking-wider font-mono">
                New Score (current: {lead.icpScore ?? '–'}/100)
              </label>
              <input type="number" min={0} max={100} value={score}
                onChange={e => setScore(parseInt(e.target.value, 10))}
                className="w-full bg-paper2 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-acid transition-colors" />
            </div>
          )}
          {action !== 'mark_converted' && (
            <div>
              <label className="block text-[11px] text-ink3 mb-1.5 uppercase tracking-wider font-mono">
                Reason Code (required — rep_override_audit §11)
              </label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                placeholder="e.g. Confirmed Series-B founder despite free email domain"
                className="w-full bg-paper2 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink3 focus:outline-none focus:border-acid resize-none transition-colors" />
            </div>
          )}
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button onClick={submit} disabled={saving}
            className="btn btn-primary w-full py-2.5 disabled:opacity-50">
            {saving ? 'Saving…' : 'Confirm Action'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Rationale Tooltip ────────────────────────────────────────────────────────

function RationaleTooltip({ rationale }: { rationale: ScoreRationaleItem[] }) {
  return (
    <div data-tip="score-rationale"
      className="absolute left-0 top-full mt-1 z-40 bg-paper2 border border-border rounded-xl p-3 w-64 shadow-2xl pointer-events-none">
      <p className="text-[10px] text-ink3 uppercase tracking-wider font-mono mb-2">Score rationale</p>
      {rationale.map((r, i) => (
        <div key={i} className="flex items-start gap-2 mb-1.5">
          <span className={`mt-0.5 text-[10px] ${r.direction === 'positive' ? 'text-emerald-400' : r.direction === 'negative' ? 'text-red-400' : 'text-ink3'}`}>
            {r.direction === 'positive' ? '▲' : r.direction === 'negative' ? '▼' : '◆'}
          </span>
          <span className="text-[11px] text-ink2 flex-1">{r.factor}</span>
          <span className="text-[10px] text-ink3">{Math.round(r.weight * 100)}%</span>
        </div>
      ))}
    </div>
  )
}

// ── ICP Drift Panel ──────────────────────────────────────────────────────────

function DriftPanel({ stats }: { stats: DigestStats | null }) {
  if (!stats) return null
  const driftSignal = stats.disqualRate > 40 || stats.avgIcpScore < 40 || stats.dlqCount > 3

  return (
    <div className={`rounded-xl border p-4 ${driftSignal ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-paper2/50'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-bold font-mono ${driftSignal ? 'text-amber-400' : 'text-ink2'}`}>
          {driftSignal ? '⚠ ICP DRIFT SIGNAL' : '◈ ICP PIPELINE HEALTH'}
        </span>
        <span className="text-[10px] text-ink3">Last 7 days</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Avg ICP Score', value: `${stats.avgIcpScore?.toFixed(1) ?? '–'}/100`, alert: (stats.avgIcpScore ?? 60) < 40 },
          { label: 'Disqual Rate', value: `${stats.disqualRate?.toFixed(0) ?? '–'}%`, alert: (stats.disqualRate ?? 0) > 40 },
          { label: 'DLQ Pending', value: String(stats.dlqCount ?? 0), alert: (stats.dlqCount ?? 0) > 3 },
          { label: 'Cost/Hot Lead', value: stats.costPerHotLead != null ? `$${stats.costPerHotLead.toFixed(4)}` : '–', alert: false },
        ].map(m => (
          <div key={m.label} className="text-center">
            <div className={`text-lg font-bold tabular-nums ${m.alert ? 'text-amber-400' : 'text-ink'}`} style={{ fontFamily: 'var(--ff-d)' }}>{m.value}</div>
            <div className="text-[10px] text-ink3 mt-0.5 font-mono uppercase tracking-wide">{m.label}</div>
          </div>
        ))}
      </div>
      {stats.warnings && stats.warnings.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-amber-500/20 pt-3">
          {stats.warnings.map((w, i) => (
            <div key={i} className="text-[11px] text-amber-300/80">· {w}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sort Header ──────────────────────────────────────────────────────────────

function SortTh({ field, label, current, order, onSort }: {
  field: SortField; label: string; current: SortField; order: SortOrder
  onSort: (f: SortField) => void
}) {
  const active = current === field
  return (
    <th className="text-left text-[10px] uppercase tracking-widest text-ink3 px-4 py-3 font-mono cursor-pointer hover:text-ink transition-colors select-none"
      onClick={() => onSort(field)}>
      {label}
      {active && <span className="ml-1 text-acid">{order === 'desc' ? '↓' : '↑'}</span>}
    </th>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function LeadsPage() {
  const router = useRouter()
  const [leads, setLeads]             = useState<Lead[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [statusFilter, setStatus]     = useState('all')
  const [search, setSearch]           = useState('')
  const [sortBy, setSortBy]           = useState<SortField>('createdAt')
  const [sortOrder, setSortOrder]     = useState<SortOrder>('desc')
  const [loading, setLoading]         = useState(false)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [costToday, setCostToday]     = useState(0)
  const [hotLeadsTotal, setHotLeadsTotal] = useState(0)
  const [notice, setNotice]           = useState('')
  const [overrideLead, setOverride]   = useState<Lead | null>(null)
  const [scoringLead, setScoring]     = useState<string | null>(null)
  const [tooltipLead, setTooltip]     = useState<string | null>(null)
  const [digestStats, setDigestStats] = useState<DigestStats | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const LIMIT = 50

  const loadLeads = useCallback(async (
    p = 1,
    status = statusFilter,
    sb = sortBy,
    so = sortOrder,
    q = search,
  ) => {
    setLoading(true)
    setNotice('')
    try {
      const qs = new URLSearchParams({ page: String(p), limit: String(LIMIT), sortBy: sb, order: so })
      if (status !== 'all') qs.set('status', status)
      if (q.trim()) qs.set('q', q.trim())
      const resp = await fetch(`/api/leads?${qs}`)
      const data = await resp.json() as LeadsResponse
      if (!resp.ok || !data.ok) throw new Error(data.error ?? 'Failed to load leads')
      setLeads(data.data.leads)
      setTotal(data.data.total)
      setPage(p)
      setStatusCounts(data.meta.statusCounts)
      setCostToday(data.meta.costTodayUsd)
      setHotLeadsTotal(data.meta.hotLeads ?? 0)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, sortBy, sortOrder, search])

  useEffect(() => {
    fetch('/api/leads/digest-stats')
      .then(r => r.json())
      .then(j => { if (j.ok && j.stats) setDigestStats(j.stats as DigestStats) })
      .catch(() => null)
  }, [])

  useEffect(() => { loadLeads(1, statusFilter, sortBy, sortOrder, search) }, [statusFilter, sortBy, sortOrder]) // eslint-disable-line

  function handleSearch(q: string) {
    setSearch(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadLeads(1, statusFilter, sortBy, sortOrder, q), 400)
  }

  function handleSort(field: SortField) {
    const newOrder = sortBy === field && sortOrder === 'desc' ? 'asc' : 'desc'
    setSortBy(field); setSortOrder(newOrder)
    loadLeads(1, statusFilter, field, newOrder, search)
  }

  async function triggerScore(leadId: string) {
    setScoring(leadId); setNotice('')
    try {
      const resp = await fetch('/api/leads/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      })
      const data = await resp.json() as { ok: boolean; error?: string }
      if (!resp.ok || !data.ok) throw new Error(data.error ?? 'Failed to score lead')
      await loadLeads(page, statusFilter)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Failed to score lead')
    } finally { setScoring(null) }
  }

  async function rescoreAll() {
    setLoading(true); setNotice('')
    try {
      const resp = await fetch('/api/leads/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescoreAll: true }),
      })
      const data = await resp.json() as { ok: boolean; error?: string; scored?: number; total?: number }
      if (!resp.ok || !data.ok) throw new Error(data.error ?? 'Failed to re-score leads')
      setNotice(`Re-score complete: ${data.scored ?? 0}/${data.total ?? 0} leads processed`)
      await loadLeads(1, statusFilter)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Failed to re-score leads')
    } finally { setLoading(false) }
  }

  async function handleExport() {
    setNotice('')
    try {
      await fetch('/api/audit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lead_csv_export', meta: { visibleRows: leads.length, statusFilter, search, sortBy, sortOrder } }),
      })
    } catch { setNotice('Export started, but audit logging failed') }
    exportCSV(leads)
  }

  const totalLeads     = Object.values(statusCounts).reduce((s, n) => s + n, 0)
  const hotCount       = hotLeadsTotal
  const dlqCount       = statusCounts['dlq'] ?? 0
  const converted      = statusCounts['converted'] ?? 0
  const inOutreach     = statusCounts['in_outreach'] ?? 0
  const funnelDenom    = inOutreach + converted
  const conversionRate = funnelDenom > 0 ? Math.round((converted / funnelDenom) * 100) : null
  const avgScore       = leads.filter(l => l.icpScore !== null).reduce((s, l, _, a) => s + (l.icpScore ?? 0) / a.length, 0)
  const scoredWithRationale = leads.filter(l => l.scoreRationale && (l.scoreRationale as ScoreRationaleItem[]).length > 0).length
  const ichsProxy      = leads.length > 0 ? Math.round((scoredWithRationale / leads.length) * 100) : 0

  return (
    <ShellPageWrapper currentPage="leads">
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-6" role="main" aria-label="Lead Management">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div>
            <p className="text-[10px] text-ink3 uppercase tracking-widest font-mono mb-1">Lead Pipeline</p>
            <h1 className="text-3xl font-bold text-ink" style={{ fontFamily: 'var(--ff-d)' }}>Lead Management</h1>
            <p className="text-sm text-ink3 mt-1">ICP scoring · Routing · DLQ · DPDP compliance</p>
          </div>
        </div>
        <button onClick={handleExport} disabled={leads.length === 0}
          className="btn btn-ghost text-xs disabled:opacity-30 flex items-center gap-1.5">
          ↓ Export CSV
        </button>
      </div>

      {notice && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          {notice}
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Total leads',  value: totalLeads },
          { label: 'Hot (≥70)',    value: hotCount,   color: 'text-emerald-400' },
          { label: 'Converted',    value: converted,  color: 'text-emerald-400' },
          { label: 'DLQ',          value: dlqCount,   color: dlqCount > 0 ? 'text-red-400' : undefined },
          { label: 'Avg score',    value: leads.length > 0 ? `${avgScore.toFixed(0)}/100` : '–', color: avgScore >= 60 ? 'text-emerald-400' : avgScore >= 40 ? 'text-amber-400' : 'text-red-400' },
          { label: 'Cost today',   value: `$${costToday.toFixed(3)}`, color: 'text-violet-400' },
          { label: 'ICHS proxy',   value: `${ichsProxy}%`, color: ichsProxy >= 75 ? 'text-emerald-400' : 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="kpi-card text-center">
            <div className={`text-xl font-bold tabular-nums ${s.color ?? 'text-ink'}`} style={{ fontFamily: 'var(--ff-d)' }}>{s.value}</div>
            <div className="text-[10px] text-ink3 mt-0.5 font-mono uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Outreach funnel */}
      <div className="border border-border bg-paper rounded-xl px-4 py-3 flex items-center gap-6 flex-wrap">
        <span className="text-[10px] text-ink3 uppercase tracking-widest font-mono font-bold">Outreach funnel</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-ink3">Routed</span>
          <span className="text-ink3/50">→</span>
          <span className="font-semibold text-amber-400">{inOutreach} in outreach</span>
          <span className="text-ink3/50">→</span>
          <span className="font-semibold text-emerald-400">{converted} converted</span>
          {conversionRate !== null && (
            <span className="ml-2 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[11px] font-medium border border-emerald-500/20">
              {conversionRate}% close rate
            </span>
          )}
          {conversionRate === null && <span className="ml-2 text-ink3 text-[11px]">no outreach yet</span>}
        </div>
      </div>

      {/* ICP Drift Panel */}
      <DriftPanel stats={digestStats} />

      {/* DLQ Alert */}
      {dlqCount > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10">
          <span className="text-red-400 text-sm mt-px">⚡</span>
          <div className="flex-1">
            <p className="text-xs text-red-400 font-medium">DLQ Alert — {dlqCount} lead{dlqCount !== 1 ? 's' : ''} stuck in dead-letter queue</p>
            <p className="text-[11px] text-ink3 mt-0.5">P2 failure: pipeline DLQ. Human review SLA: 24h.</p>
          </div>
          <button onClick={rescoreAll} disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 hover:border-red-400 transition-all">
            Re-score all
          </button>
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <input type="search" placeholder="Search email, name, company…" value={search}
            onChange={e => handleSearch(e.target.value)}
            className="bg-paper2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink3 focus:outline-none focus:border-acid w-56 transition-colors" />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink3 text-[10px]">⌕</span>
        </div>
        <div className="flex gap-2 flex-wrap flex-1">
          {STATUS_FILTERS.map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`text-[11px] px-3 py-1.5 rounded-lg border transition-all ${statusFilter === s ? 'border-acid/40 bg-acid/10 text-acid' : 'border-border text-ink3 hover:border-ink/20 hover:text-ink'}`}>
              {s}{s !== 'all' && statusCounts[s] !== undefined ? ` (${statusCounts[s]})` : ''}{s === 'all' ? ` (${totalLeads})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Leads table */}
      <div className="border border-border rounded-2xl bg-paper overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-ink3 text-sm animate-pulse">Loading leads…</div>
        ) : leads.length === 0 ? (
          <div className="py-16 text-center text-ink3 text-sm">
            {search ? `No leads matching "${search}"` : 'No leads in this filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[10px] uppercase tracking-widest text-ink3 px-4 py-3 font-mono">Lead</th>
                  <SortTh field="icpScore"       label="Score"   current={sortBy} order={sortOrder} onSort={handleSort} />
                  <th className="text-left text-[10px] uppercase tracking-widest text-ink3 px-4 py-3 font-mono">Routing</th>
                  <th className="text-left text-[10px] uppercase tracking-widest text-ink3 px-4 py-3 font-mono">Source</th>
                  <SortTh field="status"         label="Status"  current={sortBy} order={sortOrder} onSort={handleSort} />
                  <SortTh field="scoringCostUsd" label="Cost"    current={sortBy} order={sortOrder} onSort={handleSort} />
                  <SortTh field="createdAt"      label="Created" current={sortBy} order={sortOrder} onSort={handleSort} />
                  <th className="text-left text-[10px] uppercase tracking-widest text-ink3 px-4 py-3 font-mono">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => {
                  const rationale = lead.scoreRationale as ScoreRationaleItem[] | null
                  return (
                    <tr key={lead.id} className="border-b border-border hover:bg-paper2/50 transition-colors">
                      <td className="px-4 py-3 max-w-[180px]">
                        <div className="font-medium text-ink truncate">{lead.name ?? lead.email.split('@')[0]}</div>
                        <div className="text-ink3 text-[10px] truncate">{lead.email}</div>
                        {lead.company && <div className="text-ink3 text-[10px] truncate">{lead.company}{lead.role ? ` · ${lead.role}` : ''}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative inline-block" data-lead-score={lead.id}
                          onMouseEnter={() => setTooltip(lead.id)} onMouseLeave={() => setTooltip(null)}>
                          {lead.icpScore !== null ? (
                            <button data-tip="hover-score" className={`font-semibold tabular-nums ${scoreColor(lead.icpScore)} hover:underline`}>
                              {lead.icpScore}/100
                            </button>
                          ) : <span className="text-ink3">–</span>}
                          {lead.repOverrideScore !== null && (
                            <span className="ml-1 text-[9px] text-amber-500" title={`Override by ${lead.repOverrideBy}: ${lead.repOverrideReason}`}>★</span>
                          )}
                          {tooltipLead === lead.id && rationale && rationale.length > 0 && (
                            <RationaleTooltip rationale={rationale} />
                          )}
                        </div>
                        {lead.scoreConfidence !== null && (
                          <div className="text-[9px] text-ink3 mt-0.5">conf {Math.round(lead.scoreConfidence * 100)}%</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lead.routingDecision ? (
                          <span className={`font-medium ${routingBadge(lead.routingDecision)}`}>
                            {lead.routingDecision.replace('_', ' ')}
                          </span>
                        ) : <span className="text-ink3">–</span>}
                        {lead.assignedRep && <div className="text-[9px] text-ink3 mt-0.5">{lead.assignedRep}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-ink2">{lead.source ?? '–'}</div>
                        {lead.utmSource && <div className="text-[9px] text-ink3">utm: {lead.utmSource}</div>}
                        {lead.pipelineRunId && <div className="text-[9px] text-acid" title={lead.pipelineRunId}>run ✓</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium ${statusBadge(lead.status)}`}>
                          {lead.status}
                        </span>
                        {lead.dlqReason && (
                          <div className="text-[9px] text-red-400 mt-0.5 max-w-[120px] truncate" title={lead.dlqReason}>
                            {lead.dlqReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {lead.scoringCostUsd !== null && lead.scoringCostUsd > 0
                          ? <span className="text-ink2">${lead.scoringCostUsd.toFixed(4)}</span>
                          : <span className="text-ink3">–</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-ink3 tabular-nums">
                          {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {(lead.status === 'new' || lead.status === 'dlq' || !lead.icpScore) && (
                            <button onClick={() => triggerScore(lead.id)} disabled={scoringLead === lead.id}
                              className="text-[10px] px-2.5 py-1 rounded-lg border border-acid/40 text-acid hover:border-acid transition-all disabled:opacity-40">
                              {scoringLead === lead.id ? '…' : 'Score'}
                            </button>
                          )}
                          <button onClick={() => setOverride(lead)}
                            className="text-[10px] px-2.5 py-1 rounded-lg border border-border text-ink3 hover:text-ink hover:border-ink/30 transition-all">
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-[11px] text-ink3">
            {total} lead{total !== 1 ? 's' : ''}{search ? ` matching "${search}"` : ''} · page {page} of {Math.max(1, Math.ceil(total / LIMIT))}
          </span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => loadLeads(page - 1)}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-ink3 hover:border-ink/30 disabled:opacity-30 transition-all">
              ← Prev
            </button>
            {Array.from({ length: Math.min(5, Math.ceil(total / LIMIT)) }, (_, i) => {
              const pageNum = Math.max(1, page - 2) + i
              if (pageNum > Math.ceil(total / LIMIT)) return null
              return (
                <button key={pageNum} onClick={() => loadLeads(pageNum)}
                  className={`text-[11px] w-7 rounded-lg border transition-all ${pageNum === page ? 'border-acid/40 bg-acid/10 text-acid' : 'border-border text-ink3 hover:border-ink/20'}`}>
                  {pageNum}
                </button>
              )
            })}
            <button disabled={page >= Math.ceil(total / LIMIT)} onClick={() => loadLeads(page + 1)}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-ink3 hover:border-ink/30 disabled:opacity-30 transition-all">
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* GDSL rules footer */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
        {[
          { rule: 'consent_gate',       status: 'ACTIVE', desc: 'Outreach blocked if consent not captured' },
          { rule: 'score_groundedness', status: 'ACTIVE', desc: 'Score rationale required — unexplained scores rejected' },
          { rule: 'lead_budget_cap',    status: `$${costToday.toFixed(3)} / $8.00`, desc: 'Daily LLM scoring budget enforced' },
        ].map(r => (
          <div key={r.rule} className="border border-border bg-paper rounded-xl px-3 py-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-acid text-[10px]">{r.rule}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">{r.status}</span>
            </div>
            <p className="text-ink3">{r.desc}</p>
          </div>
        ))}
      </div>

      {overrideLead && (
        <OverrideModal lead={overrideLead} onClose={() => setOverride(null)}
          onSaved={() => { setOverride(null); loadLeads(page, statusFilter) }} />
      )}
    </div>
    </ShellPageWrapper>
  )
}
