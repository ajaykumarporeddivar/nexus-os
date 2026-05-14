'use client'

import { useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStats {
  users: {
    total:        number
    newLast7Days: number
    byPlan:       Record<string, number>
    activeSubs:   number
  }
  workspaces: {
    total:           number
    staleForRefresh: number
  }
  scheduler: {
    lastRun:    string | null
    lastResult: Record<string, unknown> | null
  }
  jobs24h:    Record<string, number>
  recentJobs: {
    id:             string
    workspaceId:    string
    status:         string
    startedAt:      string
    completedAt:    string | null
    ideasGenerated: number
    workspace:      { name: string } | null
  }[]
  ideas:      Record<string, number>
  recentAudit: {
    id:        string
    action:    string
    userId:    string | null
    createdAt: string
    meta:      unknown
  }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_COLOR: Record<string, string> = {
  enterprise: 'bg-acid/20 text-acid border-acid/40',
  agency:     'bg-violet-500/20 text-violet-400 border-violet-500/40',
  starter:    'bg-blue-500/20 text-blue-400 border-blue-500/40',
  free:       'bg-paper3 text-ink3 border-border',
}

const JOB_COLOR: Record<string, string> = {
  done:    'text-green-400',
  running: 'text-amber-400 animate-pulse',
  failed:  'text-red-400',
  skipped: 'text-ink3',
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days  > 0)  return `${days}d ago`
  if (hours > 0)  return `${hours}h ago`
  if (mins  > 0)  return `${mins}m ago`
  return 'just now'
}

function StatCard({ label, value, sub, accent = false }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`card p-4 space-y-1 ${accent ? 'border-acid/30 bg-acid/3' : ''}`}>
      <p className="sec-label text-[10px]">{label}</p>
      <p className={`text-2xl font-bold font-mono ${accent ? 'text-acid' : ''}`}>{value}</p>
      {sub && <p className="text-[10px] text-ink3">{sub}</p>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const [stats,   setStats]   = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    setLoading(true)
    fetch('/api/admin/stats')
      .then(r => r.json())
      .then(d => {
        if (!d.ok) throw new Error(d.error ?? 'Failed')
        setStats(d.data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [refresh])

  if (loading) return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <p className="text-sm text-ink3 animate-pulse">Loading admin stats…</p>
    </div>
  )

  if (error) return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="panel border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-400">{error}</div>
    </div>
  )

  if (!stats) return null

  const totalJobs24h = Object.values(stats.jobs24h).reduce((a, b) => a + b, 0)
  const totalIdeas   = Object.values(stats.ideas).reduce((a, b) => a + b, 0)

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="sec-label mb-1">Admin</p>
          <h2 className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>Platform Overview</h2>
          <p className="text-sm text-ink3 mt-1">Live platform telemetry — admin eyes only.</p>
        </div>
        <button onClick={() => setRefresh(r => r + 1)} className="btn btn-ghost text-xs">
          ↻ Refresh
        </button>
      </div>

      {/* ── Users ──────────────────────────────────────────────────────── */}
      <section>
        <p className="sec-label mb-3">Users</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total users"       value={stats.users.total}        accent />
          <StatCard label="New (7 days)"      value={stats.users.newLast7Days} sub="signups" />
          <StatCard label="Active subs"       value={stats.users.activeSubs}   sub="paid plans" />
          <StatCard label="Workspaces"        value={stats.workspaces.total}   />
        </div>

        {/* Plan distribution */}
        <div className="card mt-3 p-4">
          <p className="sec-label mb-3 text-[10px]">Plan distribution</p>
          <div className="flex flex-wrap gap-2">
            {(['enterprise', 'agency', 'starter', 'free'] as const).map(plan => (
              <div key={plan} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono ${PLAN_COLOR[plan]}`}>
                <span className="font-bold uppercase tracking-widest text-[10px]">{plan}</span>
                <span className="font-bold text-sm">{stats.users.byPlan[plan] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workspace Scheduler ────────────────────────────────────────── */}
      <section>
        <p className="sec-label mb-3">Workspace Scheduler</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Stale workspaces"
            value={stats.workspaces.staleForRefresh}
            sub="due for refresh"
            accent={stats.workspaces.staleForRefresh > 0}
          />
          <StatCard
            label="Last cron run"
            value={stats.scheduler.lastRun ? relTime(stats.scheduler.lastRun) : '—'}
            sub={stats.scheduler.lastRun ? new Date(stats.scheduler.lastRun).toLocaleString() : 'never'}
          />
          <StatCard label="Jobs (24h)" value={totalJobs24h} sub="dispatched" />
          <StatCard
            label="Success rate"
            value={totalJobs24h > 0
              ? `${Math.round(((stats.jobs24h.done ?? 0) / totalJobs24h) * 100)}%`
              : '—'}
            sub="done / total"
          />
        </div>

        {/* Job status breakdown */}
        {totalJobs24h > 0 && (
          <div className="card mt-3 p-4 flex gap-4 flex-wrap">
            {Object.entries(stats.jobs24h).map(([status, count]) => (
              <div key={status} className="flex items-center gap-1.5 text-sm font-mono">
                <span className={`font-bold ${JOB_COLOR[status] ?? ''}`}>{count}</span>
                <span className="text-ink3">{status}</span>
              </div>
            ))}
          </div>
        )}

        {/* Scheduler last result */}
        {stats.scheduler.lastResult && (
          <div className="card mt-3 p-4">
            <p className="sec-label text-[10px] mb-2">Last scheduler result</p>
            <pre className="text-[10px] font-mono text-ink3 overflow-x-auto leading-relaxed">
              {JSON.stringify(stats.scheduler.lastResult, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* ── Recent Generation Jobs ─────────────────────────────────────── */}
      <section>
        <p className="sec-label mb-3">Recent generation jobs</p>
        <div className="card overflow-hidden p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-paper2">
                <th className="text-left px-4 py-2 text-ink3 font-medium">Workspace</th>
                <th className="text-left px-4 py-2 text-ink3 font-medium">Status</th>
                <th className="text-left px-4 py-2 text-ink3 font-medium">Ideas</th>
                <th className="text-left px-4 py-2 text-ink3 font-medium">Started</th>
                <th className="text-left px-4 py-2 text-ink3 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentJobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink3">No jobs yet</td>
                </tr>
              ) : stats.recentJobs.map(j => {
                const dur = j.completedAt
                  ? `${((new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime()) / 1000).toFixed(1)}s`
                  : j.status === 'running' ? 'running…' : '—'
                return (
                  <tr key={j.id} className="border-b border-border/50 hover:bg-paper2/50 transition-colors">
                    <td className="px-4 py-2 font-mono font-semibold">{j.workspace?.name ?? j.workspaceId.slice(0, 8)}</td>
                    <td className={`px-4 py-2 font-mono font-bold ${JOB_COLOR[j.status] ?? ''}`}>{j.status}</td>
                    <td className="px-4 py-2 text-ink3">{j.ideasGenerated ?? '—'}</td>
                    <td className="px-4 py-2 text-ink3">{relTime(j.startedAt)}</td>
                    <td className="px-4 py-2 text-ink3 font-mono">{dur}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Ideas breakdown ────────────────────────────────────────────── */}
      <section>
        <p className="sec-label mb-3">Ideas pool</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total ideas" value={totalIdeas} accent />
          {Object.entries(stats.ideas).map(([status, count]) => (
            <StatCard key={status} label={status} value={count} />
          ))}
        </div>
      </section>

      {/* ── Audit log (last 20) ────────────────────────────────────────── */}
      <section>
        <p className="sec-label mb-3">Recent audit events</p>
        <div className="card overflow-hidden p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-paper2">
                <th className="text-left px-4 py-2 text-ink3 font-medium">Action</th>
                <th className="text-left px-4 py-2 text-ink3 font-medium">User</th>
                <th className="text-left px-4 py-2 text-ink3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentAudit.map(ev => (
                <tr key={ev.id} className="border-b border-border/50 hover:bg-paper2/50 transition-colors">
                  <td className="px-4 py-2 font-mono">{ev.action}</td>
                  <td className="px-4 py-2 text-ink3 font-mono">{ev.userId?.slice(0, 8) ?? '—'}</td>
                  <td className="px-4 py-2 text-ink3">{relTime(ev.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  )
}
