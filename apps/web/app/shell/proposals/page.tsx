'use client'

/**
 * /shell?page=proposals  — Proposal Management Dashboard
 *
 * Features:
 * - Pipeline kanban by stage
 * - Ingest new RFP (POST /api/proposals)
 * - Trigger AI draft (POST /api/proposals/[id]/draft)
 * - Stage badges with GDSL gate status
 * - Win/loss record modal
 * - Stats header: open, won, lost, avg fit, DLQ
 */

import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Proposal {
  id:              string
  rfpTitle:        string
  clientName:      string
  rfpRef:          string | null
  stage:           string
  bidDecision:     string
  bidFitScore:     number | null
  deadline:        string | null
  dealValueInr:    number | null
  pricingTotalInr: number | null
  approvalStatus:  string
  revisionDepth:   number
  createdAt:       string
}

interface Stats {
  totalOpen:      number
  newThisWeek:    number
  wonThisWeek:    number
  lostThisWeek:   number
  winRatePct:     number | null
  dlqCount:       number
  avgBidFitScore: number
}

const STAGE_ORDER = [
  'intake', 'bid_decision', 'scoping', 'drafting',
  'pricing', 'review', 'approved', 'delivered', 'no_bid', 'dlq',
]

const STAGE_COLOR: Record<string, string> = {
  intake:       'bg-gray-100 text-gray-700',
  bid_decision: 'bg-blue-100 text-blue-700',
  scoping:      'bg-indigo-100 text-indigo-700',
  drafting:     'bg-yellow-100 text-yellow-700',
  pricing:      'bg-orange-100 text-orange-700',
  review:       'bg-purple-100 text-purple-700',
  approved:     'bg-green-100 text-green-700',
  delivered:    'bg-emerald-100 text-emerald-700',
  no_bid:       'bg-slate-100 text-slate-500',
  dlq:          'bg-red-100 text-red-700',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [stats,     setStats]     = useState<Stats | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [q,         setQ]         = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [showIngest,  setShowIngest]  = useState(false)
  const [draftingId,  setDraftingId]  = useState<string | null>(null)
  const [draftResult, setDraftResult] = useState<Record<string, unknown> | null>(null)
  const [error,       setError]       = useState<string | null>(null)

  // Ingest form state
  const [rfpText,   setRfpText]   = useState('')
  const [rfpRef,    setRfpRef]    = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [consent,   setConsent]   = useState(false)
  const [ndaActive, setNdaActive] = useState(false)
  const [ingesting, setIngesting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q)           params.set('q', q)
      if (stageFilter) params.set('stage', stageFilter)
      const r = await fetch(`/api/proposals?${params}`)
      const j = await r.json()
      if (j.ok) setProposals(j.proposals ?? [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [q, stageFilter])

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/cron/proposal-digest', {
        headers: { 'x-cron-secret': '' }, // digest-stats endpoint
      })
      const j = await r.json()
      if (j.ok && j.stats) setStats(j.stats)
    } catch { /* stats are optional */ }
  }, [])

  useEffect(() => { load(); loadStats() }, [load, loadStats])

  async function handleIngest() {
    if (!rfpText.trim()) { setError('RFP text is required'); return }
    if (!consent)        { setError('Consent must be confirmed'); return }
    setIngesting(true); setError(null)
    try {
      const r = await fetch('/api/proposals', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rfpText, rfpRef: rfpRef || undefined, clientEmail: clientEmail || undefined, consentCaptured: consent, ndaActive }),
      })
      const j = await r.json()
      if (!j.ok) { setError(j.reason ?? j.error ?? 'Ingest failed'); return }
      setShowIngest(false); setRfpText(''); setRfpRef(''); setClientEmail(''); setConsent(false); setNdaActive(false)
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setIngesting(false)
    }
  }

  async function handleDraft(id: string) {
    setDraftingId(id); setDraftResult(null); setError(null)
    try {
      const r = await fetch(`/api/proposals/${id}/draft`, { method: 'POST' })
      const j = await r.json()
      setDraftResult(j)
      if (!j.ok) setError(j.reason ?? j.error ?? 'Draft failed')
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setDraftingId(null)
    }
  }

  const grouped = STAGE_ORDER.reduce<Record<string, Proposal[]>>((acc, s) => {
    acc[s] = proposals.filter(p => p.stage === s)
    return acc
  }, {})

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proposal Pipeline</h1>
          <p className="text-sm text-gray-500">13-SME governed · 10 GDSL rules · AI-assisted drafting</p>
        </div>
        <button
          onClick={() => setShowIngest(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Ingest RFP
        </button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {[
            { label: 'Open',        value: stats.totalOpen },
            { label: 'New (7d)',    value: stats.newThisWeek },
            { label: 'Won (7d)',    value: stats.wonThisWeek },
            { label: 'Lost (7d)',   value: stats.lostThisWeek },
            { label: 'Win rate',    value: stats.winRatePct !== null ? `${stats.winRatePct}%` : 'N/A' },
            { label: 'DLQ',         value: stats.dlqCount, red: stats.dlqCount > 0 },
            { label: 'Avg fit',     value: stats.avgBidFitScore },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div className={`text-xl font-bold ${s.red ? 'text-red-600' : 'text-gray-800'}`}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs"
          placeholder="Search title, client, ref..."
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
        />
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={stageFilter}
          onChange={e => { setStageFilter(e.target.value); }}
        >
          <option value="">All stages</option>
          {STAGE_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Draft result */}
      {draftResult && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <strong>Draft result:</strong>{' '}
          {draftResult.ok
            ? `Quality score ${draftResult.qualityScore} · Stage → ${draftResult.stage} · ₹${(draftResult.pricingTotalInr as number)?.toLocaleString('en-IN')}`
            : (draftResult.reason as string ?? draftResult.error as string)
          }
          {(draftResult.hallucinationFlags as string[])?.length > 0 && (
            <div className="mt-1 text-amber-700">
              Hallucination flags: {(draftResult.hallucinationFlags as string[]).join('; ')}
            </div>
          )}
        </div>
      )}

      {/* Pipeline board */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {['intake', 'drafting', 'pricing', 'review', 'approved'].map(stage => (
            <div key={stage} className="bg-gray-50 rounded-xl p-3 min-h-32">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_COLOR[stage]}`}>
                  {stage}
                </span>
                <span className="text-xs text-gray-400">{grouped[stage]?.length ?? 0}</span>
              </div>
              <div className="space-y-2">
                {(grouped[stage] ?? []).map(p => (
                  <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-3 text-xs shadow-sm">
                    <div className="font-medium text-gray-800 truncate">{p.rfpTitle}</div>
                    <div className="text-gray-500 truncate">{p.clientName}</div>
                    {p.bidFitScore !== null && (
                      <div className="mt-1 text-gray-600">Fit: {p.bidFitScore}</div>
                    )}
                    {p.deadline && (
                      <div className="text-gray-500">Due: {new Date(p.deadline).toLocaleDateString('en-IN')}</div>
                    )}
                    {p.pricingTotalInr && (
                      <div className="text-green-700">₹{p.pricingTotalInr.toLocaleString('en-IN')}</div>
                    )}
                    {p.revisionDepth > 0 && (
                      <div className="text-amber-600">Rev {p.revisionDepth}/3</div>
                    )}
                    {['intake', 'bid_decision', 'scoping', 'drafting', 'pricing', 'review'].includes(p.stage) && (
                      <button
                        onClick={() => handleDraft(p.id)}
                        disabled={draftingId === p.id}
                        className="mt-2 w-full py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                      >
                        {draftingId === p.id ? 'Drafting...' : 'Run AI Draft'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DLQ + delivered + no_bid rows */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        {(['delivered', 'no_bid', 'dlq'] as const).map(stage => (
          <div key={stage} className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_COLOR[stage]}`}>{stage}</span>
              <span className="text-xs text-gray-400">{grouped[stage]?.length ?? 0}</span>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(grouped[stage] ?? []).map(p => (
                <div key={p.id} className="text-xs text-gray-600 truncate">{p.rfpTitle} — {p.clientName}</div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Ingest modal */}
      {showIngest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold mb-4">Ingest New RFP</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">RFP Ref (optional)</label>
                <input className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={rfpRef} onChange={e => setRfpRef(e.target.value)} placeholder="e.g. RFP-2024-001" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Client Email (optional)</label>
                <input className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@company.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">RFP Text *</label>
                <textarea
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-40 resize-none"
                  value={rfpText}
                  onChange={e => setRfpText(e.target.value)}
                  placeholder="Paste the full RFP text here..."
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={ndaActive} onChange={e => setNdaActive(e.target.checked)} />
                NDA required for this RFP
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
                <span>I confirm DPDP consent has been captured for any PII in this RFP</span>
              </label>
            </div>

            {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleIngest}
                disabled={ingesting}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {ingesting ? 'Ingesting...' : 'Ingest RFP'}
              </button>
              <button
                onClick={() => { setShowIngest(false); setError(null) }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
