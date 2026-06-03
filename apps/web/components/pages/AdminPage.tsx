'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id:              string
  email:           string | null
  name:            string | null
  image:           string | null
  plan:            string | null
  createdAt:       string
  planActivatedAt: string | null
  razorpayOrderId: string | null
}

interface UserListData {
  users: AdminUser[]
  total: number
}

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
  const [stats,     setStats]     = useState<AdminStats | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [refresh,   setRefresh]   = useState(0)
  const [userList,  setUserList]  = useState<UserListData | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [userPlan,  setUserPlan]  = useState('')
  const [userLoading, setUserLoading] = useState(false)
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [deleting,  setDeleting]  = useState(false)

  const loadUsers = useCallback(() => {
    setUserLoading(true)
    const qs = new URLSearchParams()
    if (userSearch) qs.set('search', userSearch)
    if (userPlan)   qs.set('plan',   userPlan)
    qs.set('take', '100')
    fetch(`/api/admin/users?${qs}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setUserList(d.data) })
      .finally(() => setUserLoading(false))
  }, [userSearch, userPlan])

  useEffect(() => { loadUsers() }, [loadUsers])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} user(s)? This cannot be undone.`)) return
    setDeleting(true)
    await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected] }),
    })
    setSelected(new Set())
    loadUsers()
    setRefresh(r => r + 1)
    setDeleting(false)
  }

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

      {/* ── Users Table — always visible at top ────────────────────────── */}
      <UsersSection
        userList={userList}
        userLoading={userLoading}
        userSearch={userSearch}
        setUserSearch={setUserSearch}
        userPlan={userPlan}
        setUserPlan={setUserPlan}
        selected={selected}
        toggleSelect={toggleSelect}
        deleteSelected={deleteSelected}
        deleting={deleting}
        loadUsers={loadUsers}
      />

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

      {/* ── Reputation Engine ──────────────────────────────────────────── */}
      <ReputationSection />

      {/* ── Manual Cron Triggers ───────────────────────────────────────── */}
      <CronTriggers />

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

// ── Users section — rendered outside main stats card (always visible) ─────────
function UsersSection({
  userList, userLoading, userSearch, setUserSearch,
  userPlan, setUserPlan, selected, toggleSelect,
  deleteSelected, deleting, loadUsers,
}: {
  userList: UserListData | null
  userLoading: boolean
  userSearch: string
  setUserSearch: (v: string) => void
  userPlan: string
  setUserPlan: (v: string) => void
  selected: Set<string>
  toggleSelect: (id: string) => void
  deleteSelected: () => void
  deleting: boolean
  loadUsers: () => void
}) {
  const PLAN_BADGE: Record<string, string> = {
    enterprise: 'bg-acid/20 text-acid border border-acid/30',
    agency:     'bg-violet-500/20 text-violet-300 border border-violet-500/30',
    starter:    'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    free:       'bg-paper3 text-ink3 border border-border',
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="sec-label">All Users ({userList?.total ?? '…'})</p>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            placeholder="Search email or name…"
            className="input text-xs h-7 px-2 w-48"
          />
          <select
            value={userPlan}
            onChange={e => setUserPlan(e.target.value)}
            className="input text-xs h-7 px-2"
          >
            <option value="">All plans</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="agency">Agency</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <button onClick={loadUsers} className="btn-ghost text-xs h-7 px-3">↺ Refresh</button>
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="btn text-xs h-7 px-3 bg-red-600 hover:bg-red-500 text-white border-0"
            >
              {deleting ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {userLoading ? (
          <p className="text-xs text-ink3 px-4 py-6">Loading users…</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-paper2">
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    onChange={e => {
                      if (e.target.checked) userList?.users.forEach(u => toggleSelect(u.id))
                      else userList?.users.forEach(u => { if (selected.has(u.id)) toggleSelect(u.id) })
                    }}
                    checked={!!userList?.users.length && userList.users.every(u => selected.has(u.id))}
                  />
                </th>
                <th className="text-left px-3 py-2 text-ink3 font-medium">Email</th>
                <th className="text-left px-3 py-2 text-ink3 font-medium">Name</th>
                <th className="text-left px-3 py-2 text-ink3 font-medium">Plan</th>
                <th className="text-left px-3 py-2 text-ink3 font-medium">Joined</th>
                <th className="text-left px-3 py-2 text-ink3 font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {!userList?.users.length && (
                <tr><td colSpan={6} className="px-4 py-6 text-ink3 text-center">No users found</td></tr>
              )}
              {userList?.users.map(u => (
                <tr
                  key={u.id}
                  className={`border-b border-border/50 hover:bg-paper2/50 transition-colors ${selected.has(u.id) ? 'bg-acid/5' : ''}`}
                >
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} />
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">{u.email ?? '—'}</td>
                  <td className="px-3 py-2 text-ink2">{u.name ?? <span className="text-ink3">—</span>}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${PLAN_BADGE[u.plan ?? 'free'] ?? PLAN_BADGE.free}`}>
                      {u.plan ?? 'free'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink3 tabular-nums">
                    {new Date(u.createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                  </td>
                  <td className="px-3 py-2 text-ink3">
                    {u.razorpayOrderId ? <span className="text-green-400 font-bold">✓</span> : <span className="text-ink3">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

// ── Reputation Engine widget ──────────────────────────────────────────────────

interface VerticalRep { vertical: string; totalRuns: number; avgQaScore: number; successRate: number; rank: number }
interface SystemRep   { period: string; totalRuns: number; successRuns: number; avgQaScore: number; successRate: number; gateBlockRate: number; trend: string }

function ReputationSection() {
  const [data,    setData]    = useState<{ system: SystemRep; verticals: VerticalRep[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [period,  setPeriod]  = useState<'24h' | '7d' | '30d'>('7d')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/pipeline/reputation?period=${period}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d.data) })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [period])

  const trendIcon = (t: string) => t === 'improving' ? '↑' : t === 'declining' ? '↓' : '→'
  const trendColor = (t: string) => t === 'improving' ? 'text-emerald-400' : t === 'declining' ? 'text-red-400' : 'text-ink3'

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <p className="sec-label">Pipeline Reputation (AOI v6)</p>
        <div className="flex gap-1">
          {(['24h', '7d', '30d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`text-[10px] px-2 py-1 rounded-md border transition-all font-mono ${period === p ? 'border-acid/40 bg-acid/10 text-acid' : 'border-border text-ink3 hover:text-ink'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-ink3 animate-pulse">Loading reputation…</p>
      ) : !data ? (
        <p className="text-xs text-ink3">No reputation data yet — run pipelines to generate scores.</p>
      ) : (
        <div className="space-y-3">
          {/* System health */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="card p-4">
              <p className="sec-label text-[10px]">Total Runs</p>
              <p className="text-2xl font-bold font-mono">{data.system.totalRuns}</p>
            </div>
            <div className="card p-4">
              <p className="sec-label text-[10px]">Success Rate</p>
              <p className={`text-2xl font-bold font-mono ${data.system.successRate >= 0.8 ? 'text-emerald-400' : data.system.successRate >= 0.6 ? 'text-amber-400' : 'text-red-400'}`}>
                {(data.system.successRate * 100).toFixed(0)}%
              </p>
            </div>
            <div className="card p-4">
              <p className="sec-label text-[10px]">Avg QA Score</p>
              <p className="text-2xl font-bold font-mono">{data.system.avgQaScore.toFixed(1)}</p>
            </div>
            <div className="card p-4">
              <p className="sec-label text-[10px]">Gate Block Rate</p>
              <p className={`text-2xl font-bold font-mono ${data.system.gateBlockRate > 0.3 ? 'text-amber-400' : 'text-ink'}`}>
                {(data.system.gateBlockRate * 100).toFixed(0)}%
              </p>
              <p className="text-[10px] text-ink3">L2.75 blocks</p>
            </div>
            <div className="card p-4">
              <p className="sec-label text-[10px]">Trend</p>
              <p className={`text-2xl font-bold ${trendColor(data.system.trend)}`}>
                {trendIcon(data.system.trend)}
              </p>
              <p className="text-[10px] text-ink3">{data.system.trend}</p>
            </div>
          </div>

          {/* Vertical leaderboard */}
          {data.verticals.length > 0 && (
            <div className="card p-4">
              <p className="sec-label text-[10px] mb-3">Vertical Leaderboard</p>
              <div className="space-y-2">
                {data.verticals.slice(0, 8).map((v, i) => (
                  <div key={v.vertical} className="flex items-center gap-3">
                    <span className="text-[10px] text-ink3 font-mono w-4">{i + 1}</span>
                    <span className="text-xs text-ink2 flex-1 capitalize">{v.vertical.replace(/_/g, ' ')}</span>
                    <span className="text-xs font-mono text-ink3">{v.totalRuns} runs</span>
                    <span className={`text-xs font-mono ${v.avgQaScore >= 8 ? 'text-emerald-400' : v.avgQaScore >= 6 ? 'text-amber-400' : 'text-red-400'}`}>
                      {v.avgQaScore.toFixed(1)} QA
                    </span>
                    <div className="w-16 h-1.5 bg-paper2 rounded-full overflow-hidden">
                      <div className="h-full bg-acid rounded-full" style={{ width: `${v.successRate * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-ink3 w-8 text-right">{(v.successRate * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Manual Cron Triggers ──────────────────────────────────────────────────────

interface CronJob {
  id:       string
  label:    string
  path:     string
  desc:     string
  danger?:  boolean
}

const CRON_JOBS: CronJob[] = [
  { id: 'reactivate',    label: 'Re-engagement Blast',   path: '/api/cron/reactivate',    desc: 'Send upgrade email to all free users + unconverted leads (idempotent)',  danger: true },
  { id: 'lead-sequence', label: 'Lead Sequence Processor', path: '/api/cron/lead-sequence', desc: 'Process all due follow-up sequence steps and send emails' },
  { id: 'self-heal',     label: 'Self-Heal Check',        path: '/api/cron/self-heal',     desc: 'Run health checks and auto-fix failing services' },
  { id: 'winback',       label: 'Win-back Campaign',      path: '/api/cron/winback',       desc: 'Email expired subscribers with a renewal offer' },
  { id: 'lead-dlq-retry',label: 'DLQ Retry',              path: '/api/cron/lead-dlq-retry',desc: 'Retry leads stuck in dead-letter queue' },
]

function CronTriggers() {
  const [running, setRunning] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({})

  async function trigger(job: CronJob) {
    if (running) return
    if (job.danger && !confirm(`Send ${job.label} to ALL users? This cannot be undone.`)) return
    setRunning(job.id)
    try {
      const resp = await fetch(job.path, { method: 'GET' })
      const data = await resp.json() as Record<string, unknown>
      setResults(prev => ({
        ...prev,
        [job.id]: {
          ok: data.ok === true,
          message: data.ok
            ? `Done — ${JSON.stringify(data).slice(0, 120)}`
            : (data.error as string) ?? 'Error',
        },
      }))
    } catch (e) {
      setResults(prev => ({
        ...prev,
        [job.id]: { ok: false, message: e instanceof Error ? e.message : 'Failed' },
      }))
    } finally {
      setRunning(null)
    }
  }

  return (
    <section>
      <p className="sec-label mb-3">Manual Cron Triggers</p>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-paper2">
              <th className="text-left px-4 py-2 text-ink3 font-medium">Job</th>
              <th className="text-left px-4 py-2 text-ink3 font-medium hidden sm:table-cell">Description</th>
              <th className="text-left px-4 py-2 text-ink3 font-medium">Last result</th>
              <th className="px-4 py-2 w-24" />
            </tr>
          </thead>
          <tbody>
            {CRON_JOBS.map(job => {
              const result = results[job.id]
              return (
                <tr key={job.id} className="border-b border-border/50">
                  <td className="px-4 py-3 font-mono font-semibold text-ink2">{job.label}</td>
                  <td className="px-4 py-3 text-ink3 hidden sm:table-cell max-w-xs">{job.desc}</td>
                  <td className="px-4 py-3 max-w-[200px]">
                    {result ? (
                      <span className={`text-[10px] font-mono ${result.ok ? 'text-emerald-400' : 'text-red-400'} truncate block`}
                        title={result.message}>
                        {result.ok ? '✓ ' : '✗ '}{result.message.slice(0, 80)}
                      </span>
                    ) : (
                      <span className="text-ink3">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => trigger(job)}
                      disabled={running !== null}
                      className={`text-[10px] px-3 py-1.5 rounded-lg border transition-all disabled:opacity-40 ${
                        job.danger
                          ? 'border-amber-500/40 text-amber-400 hover:border-amber-400'
                          : 'border-acid/40 text-acid hover:border-acid'
                      } ${running === job.id ? 'animate-pulse' : ''}`}>
                      {running === job.id ? 'Running…' : 'Run Now'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
