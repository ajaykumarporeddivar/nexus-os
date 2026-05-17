'use client'

/**
 * /shell/proposals — Proposal Management Dashboard (v2)
 *
 * Fixes applied:
 * P1  — stats fetched from /api/proposals/stats (browser-auth, not cron)
 * P10 — full 10-stage kanban (bid_decision + scoping now visible)
 * P11 — auto-retry hint shown when review fails (score < 7)
 * P13 — win rate shown alongside avg fit in stats bar
 * P16 — detail drawer with full draft, pricing breakdown, revision history
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PricingLine { item: string; qty: number; rateInr: number; rateSource: string }

interface Proposal {
  id:              string
  rfpTitle:        string
  clientName:      string | null
  rfpRef:          string | null
  stage:           string
  bidDecision:     string
  bidFitScore:     number | null
  winProbabilityPct: number | null
  deadline:        string | null
  dealValueInr:    string | null
  pricingTotalInr: string | null
  pricingModel:    PricingLine[] | null
  approvalStatus:  string
  revisionDepth:   number
  qualityScoreAtSubmission: number | null
  hallucinationFlags: string[] | null
  proposalDraft:   string | null
  createdAt:       string
  revisions?:      Array<{ version: number; reviewNotes: string | null; createdAt: string }>
}

interface Stats {
  totalOpen:       number
  newThisWeek:     number
  wonThisWeek:     number
  lostThisWeek:    number
  winRatePct:      number | null
  dlqCount:        number
  avgBidFitScore:  number
  totalLlmCostUsd: number
  stages:          Record<string, number>
}

const ALL_STAGES = [
  'intake', 'bid_decision', 'scoping', 'drafting',
  'pricing', 'review', 'approved', 'delivered', 'no_bid', 'dlq',
]

const ACTIVE_STAGES  = ['intake', 'bid_decision', 'scoping', 'drafting', 'pricing', 'review']
const CLOSED_STAGES  = ['approved', 'delivered', 'no_bid', 'dlq']

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

const CAN_DRAFT = ['intake', 'bid_decision', 'scoping', 'drafting', 'pricing', 'review']
const CAN_APPROVE = ['review', 'approved']

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProposalsPage() {
  const router = useRouter()
  const [proposals,   setProposals]   = useState<Proposal[]>([])
  const [stats,       setStats]       = useState<Stats | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [q,           setQ]           = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [error,       setError]       = useState<string | null>(null)

  // Modals
  const [showIngest,   setShowIngest]   = useState(false)
  const [detailId,     setDetailId]     = useState<string | null>(null)
  const [detail,       setDetail]       = useState<Proposal | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Actions
  const [draftingId,  setDraftingId]  = useState<string | null>(null)
  const [draftResult, setDraftResult] = useState<Record<string, unknown> | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  // Ingest form
  const [rfpText,     setRfpText]     = useState('')
  const [rfpRef,      setRfpRef]      = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [consent,     setConsent]     = useState(false)
  const [ndaActive,   setNdaActive]   = useState(false)
  const [ingesting,   setIngesting]   = useState(false)

  // Win-loss form
  const [wlId,        setWlId]        = useState<string | null>(null)
  const [wlOutcome,   setWlOutcome]   = useState<'won' | 'lost' | 'no_decision'>('won')
  const [wlReason,    setWlReason]    = useState('')
  const [wlSubmitting, setWlSubmitting] = useState(false)

  // ── Data loading ───────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (q)           params.set('q', q)
      if (stageFilter) params.set('stage', stageFilter)
      const r = await fetch(`/api/proposals?${params}`)
      const j = await r.json()
      if (j.ok) setProposals(j.proposals ?? [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [q, stageFilter])

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/proposals/stats')          // P1 FIX
      const j = await r.json()
      if (j.ok && j.stats) setStats(j.stats)
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => { load(); loadStats() }, [load, loadStats])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/proposals/${id}`)
      const j = await r.json()
      if (j.ok) setDetail(j.proposal)
    } catch { /* non-fatal */ }
    finally { setDetailLoading(false) }
  }, [])

  useEffect(() => {
    if (detailId) loadDetail(detailId)
    else          setDetail(null)
  }, [detailId, loadDetail])

  // ── Actions ────────────────────────────────────────────────────────────────

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
      load(); loadStats()
    } catch (e) { setError(String(e)) }
    finally { setIngesting(false) }
  }

  async function handleDraft(id: string) {
    setDraftingId(id); setDraftResult(null); setError(null)
    try {
      const r = await fetch(`/api/proposals/${id}/draft`, { method: 'POST' })
      const j = await r.json()
      setDraftResult(j)
      if (!j.ok) {
        // P11 FIX: show retry hint when review fails
        const hint = j.rule === 'revision_depth_halt'
          ? ' — Max revisions reached, escalated to human reviewer'
          : j.qualityScore != null && j.qualityScore < 7
            ? ` — Score ${j.qualityScore}/10 (need 7.0). Click Run AI Draft again to auto-revise.`
            : ''
        setError((j.reason ?? j.error ?? 'Draft failed') + hint)
      }
      load(); loadStats()
      if (detailId === id) loadDetail(id)
    } catch (e) { setError(String(e)) }
    finally { setDraftingId(null) }
  }

  async function handleApprove(id: string, action: 'approve' | 'reject', isSecond = false) {
    setApprovingId(id); setError(null)
    try {
      const r = await fetch(`/api/proposals/${id}/approve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, isSecondApprover: isSecond }),
      })
      const j = await r.json()
      if (!j.ok) { setError(j.error ?? 'Approval failed'); return }
      load(); loadStats()
      if (detailId === id) loadDetail(id)
    } catch (e) { setError(String(e)) }
    finally { setApprovingId(null) }
  }

  async function handleWinLoss() {
    if (!wlId) return
    setWlSubmitting(true); setError(null)
    try {
      const r = await fetch(`/api/proposals/${wlId}/win-loss`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ outcome: wlOutcome, lostReason: wlReason || undefined }),
      })
      const j = await r.json()
      if (!j.ok) { setError(j.error ?? 'Win-loss failed'); return }
      setWlId(null); setWlReason('')
      load(); loadStats()
    } catch (e) { setError(String(e)) }
    finally { setWlSubmitting(false) }
  }

  function exportCsv() {
    const cols = ['id', 'rfpTitle', 'clientName', 'stage', 'bidFitScore', 'pricingTotalInr', 'dealValueInr', 'revisionDepth', 'approvalStatus', 'createdAt']
    const rows = proposals.map(p => cols.map(c => JSON.stringify((p as never)[c] ?? '')).join(','))
    const csv  = [cols.join(','), ...rows].join('\n')
    const a    = document.createElement('a')
    a.href     = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
    a.download = `proposals_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  // ── Grouped data ───────────────────────────────────────────────────────────
  const grouped = ALL_STAGES.reduce<Record<string, Proposal[]>>((acc, s) => {
    acc[s] = proposals.filter(p => p.stage === s)
    return acc
  }, {})

  const detailProposal = detail ?? proposals.find(p => p.id === detailId)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-screen-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/shell')}
            className="text-gray-400 hover:text-gray-700 transition-colors text-sm flex items-center gap-1"
            title="Back to shell"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Proposal Pipeline</h1>
            <p className="text-xs text-gray-400 mt-0.5">13-SME governed · 10 GDSL rules · 5 AI agents</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Export CSV</button>
          <button onClick={() => setShowIngest(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Ingest RFP</button>
        </div>
      </div>

      {/* Stats bar — P1 FIX: from /api/proposals/stats */}
      {stats && (
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-4">
          {(
            [
              { label: 'Open',    value: String(stats.totalOpen),    red: false },
              { label: 'New 7d',  value: String(stats.newThisWeek),  red: false },
              { label: 'Won 7d',  value: String(stats.wonThisWeek),  red: false },
              { label: 'Lost 7d', value: String(stats.lostThisWeek), red: false },
              { label: 'Win %',   value: stats.winRatePct !== null ? `${stats.winRatePct}%` : '—', red: false },
              { label: 'Avg fit', value: String(stats.avgBidFitScore), red: false },
              { label: 'DLQ',     value: String(stats.dlqCount), red: stats.dlqCount > 0 },
              { label: 'LLM $',   value: `$${(stats.totalLlmCostUsd ?? 0).toFixed(3)}`, red: false },
            ] as { label: string; value: string; red: boolean }[]
          ).map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-2 text-center">
              <div className={`text-lg font-bold ${s.red ? 'text-red-600' : 'text-gray-800'}`}>{s.value}</div>
              <div className="text-xs text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <input className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 max-w-xs" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load() }} />
        <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" value={stageFilter} onChange={e => { setStageFilter(e.target.value); }}>
          <option value="">All stages</option>
          {ALL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => { load(); loadStats() }} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Refresh</button>
      </div>

      {/* Error / Draft result */}
      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error} <button className="ml-2 text-red-500 font-bold" onClick={() => setError(null)}>×</button></div>}
      {(draftResult?.ok as boolean) && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          Draft complete — Quality {String(draftResult!.qualityScore)}/10 · Stage → <strong>{String(draftResult!.stage)}</strong> · ₹{Number(draftResult!.pricingTotalInr).toLocaleString('en-IN')}
          {((draftResult!.hallucinationFlags as string[])?.length ?? 0) > 0 && <span className="ml-2 text-amber-700">⚠ {(draftResult!.hallucinationFlags as string[]).length} hallucination flag(s)</span>}
          {Boolean(draftResult!.needsEscalation) && <span className="ml-2 text-red-600 font-medium">⚠ Depth 2 — human review recommended</span>}
        </div>
      )}

      {/* P10 FIX: Full 10-stage kanban */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading pipeline…</div>
      ) : (
        <>
          {/* Active stages — full 6-column board */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {ACTIVE_STAGES.map(stage => (
              <div key={stage} className="bg-gray-50 rounded-xl p-2.5 min-h-24">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${STAGE_COLOR[stage]}`}>{stage}</span>
                  <span className="text-xs text-gray-400">{grouped[stage]?.length ?? 0}</span>
                </div>
                <div className="space-y-2">
                  {(grouped[stage] ?? []).map(p => (
                    <div
                      key={p.id}
                      className="bg-white border border-gray-200 rounded-lg p-2 text-xs shadow-sm cursor-pointer hover:border-blue-300"
                      onClick={() => setDetailId(p.id)}
                    >
                      <div className="font-medium text-gray-800 truncate" title={p.rfpTitle}>{p.rfpTitle}</div>
                      <div className="text-gray-400 truncate">{p.clientName ?? '—'}</div>
                      {p.bidFitScore != null && <div className="text-gray-600">Fit {p.bidFitScore} {p.winProbabilityPct != null ? `· Win ${p.winProbabilityPct}%` : ''}</div>}
                      {p.qualityScoreAtSubmission != null && (
                        <div className={p.qualityScoreAtSubmission >= 7 ? 'text-green-600' : 'text-amber-600'}>
                          Q {p.qualityScoreAtSubmission}/10
                        </div>
                      )}
                      {p.pricingTotalInr && <div className="text-green-700">₹{Number(p.pricingTotalInr).toLocaleString('en-IN')}</div>}
                      {p.revisionDepth > 0 && <div className={p.revisionDepth >= 2 ? 'text-red-500' : 'text-amber-500'}>Rev {p.revisionDepth}/3</div>}
                      {p.deadline && <div className="text-gray-400">{new Date(p.deadline).toLocaleDateString('en-IN')}</div>}

                      {/* Action buttons */}
                      <div className="mt-1.5 flex gap-1">
                        {CAN_DRAFT.includes(p.stage) && (
                          <button
                            onClick={e => { e.stopPropagation(); handleDraft(p.id) }}
                            disabled={draftingId === p.id}
                            className="flex-1 py-0.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                          >
                            {draftingId === p.id ? '…' : 'Draft'}
                          </button>
                        )}
                        {CAN_APPROVE.includes(p.stage) && (
                          <>
                            <button onClick={e => { e.stopPropagation(); handleApprove(p.id, 'approve', p.stage === 'approved') }} disabled={approvingId === p.id} className="flex-1 py-0.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50">✓</button>
                            <button onClick={e => { e.stopPropagation(); handleApprove(p.id, 'reject') }} disabled={approvingId === p.id} className="py-0.5 px-1.5 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 disabled:opacity-50">✗</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Closed stages — compact row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CLOSED_STAGES.map(stage => (
              <div key={stage} className="bg-gray-50 rounded-xl p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${STAGE_COLOR[stage]}`}>{stage}</span>
                  <span className="text-xs text-gray-400">{grouped[stage]?.length ?? 0}</span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {(grouped[stage] ?? []).map(p => (
                    <div key={p.id} className="flex items-center gap-1 cursor-pointer" onClick={() => setDetailId(p.id)}>
                      <div className="text-xs text-gray-600 truncate flex-1">{p.rfpTitle}</div>
                      {stage === 'approved' && (
                        <button onClick={e => { e.stopPropagation(); setWlId(p.id) }} className="text-xs px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded whitespace-nowrap">Record</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Detail Drawer (P16 FIX) ─────────────────────────────────────────── */}
      {detailId && (
        <div className="fixed inset-0 bg-black/40 z-40 flex justify-end" onClick={() => setDetailId(null)}>
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{detailProposal?.rfpTitle ?? 'Loading…'}</h2>
                  <p className="text-sm text-gray-500">{detailProposal?.clientName ?? '—'} · {detailProposal?.rfpRef ?? detailId}</p>
                </div>
                <button onClick={() => setDetailId(null)} className="text-gray-400 hover:text-gray-700 text-xl font-bold">×</button>
              </div>

              {detailLoading && <div className="text-gray-400 text-sm">Loading detail…</div>}

              {detailProposal && (
                <div className="space-y-5">
                  {/* Stage + key metrics */}
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-400">Stage</div>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${STAGE_COLOR[detailProposal.stage]}`}>{detailProposal.stage}</span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-400">Bid fit / Win %</div>
                      <div className="font-semibold">{detailProposal.bidFitScore ?? '—'} / {detailProposal.winProbabilityPct ?? '—'}%</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-400">Quality score</div>
                      <div className={`font-semibold ${(detailProposal.qualityScoreAtSubmission ?? 0) >= 7 ? 'text-green-600' : 'text-amber-600'}`}>
                        {detailProposal.qualityScoreAtSubmission ?? '—'}/10
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-400">Total price</div>
                      <div className="font-semibold">{detailProposal.pricingTotalInr ? `₹${Number(detailProposal.pricingTotalInr).toLocaleString('en-IN')}` : '—'}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-400">Revision depth</div>
                      <div className={`font-semibold ${detailProposal.revisionDepth >= 2 ? 'text-red-600' : ''}`}>{detailProposal.revisionDepth}/3</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-400">Approval</div>
                      <div className="font-semibold">{detailProposal.approvalStatus}</div>
                    </div>
                  </div>

                  {/* Pricing breakdown */}
                  {detailProposal.pricingModel && Array.isArray(detailProposal.pricingModel) && detailProposal.pricingModel.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Pricing Breakdown</h3>
                      <table className="w-full text-xs border-collapse">
                        <thead><tr className="bg-gray-50"><th className="text-left p-1.5 font-medium">Item</th><th className="text-right p-1.5 font-medium">Qty</th><th className="text-right p-1.5 font-medium">Rate (₹)</th><th className="text-right p-1.5 font-medium">Total</th></tr></thead>
                        <tbody>
                          {detailProposal.pricingModel.map((l, i) => (
                            <tr key={i} className="border-t border-gray-100">
                              <td className="p-1.5">{l.item}</td>
                              <td className="p-1.5 text-right">{l.qty}</td>
                              <td className="p-1.5 text-right">{l.rateInr?.toLocaleString('en-IN')}</td>
                              <td className="p-1.5 text-right font-medium">{(l.qty * l.rateInr).toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Hallucination flags */}
                  {detailProposal.hallucinationFlags && detailProposal.hallucinationFlags.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="text-xs font-semibold text-amber-800 mb-1">⚠ Hallucination Flags ({detailProposal.hallucinationFlags.length})</div>
                      {detailProposal.hallucinationFlags.map((f, i) => <div key={i} className="text-xs text-amber-700">• {f}</div>)}
                    </div>
                  )}

                  {/* Revision history */}
                  {detailProposal.revisions && detailProposal.revisions.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Revision History</h3>
                      <div className="space-y-1">
                        {detailProposal.revisions.map(r => (
                          <div key={r.version} className="text-xs p-2 bg-gray-50 rounded flex gap-3">
                            <span className="font-medium text-gray-600">v{r.version}</span>
                            <span className="text-gray-500 flex-1">{r.reviewNotes ?? 'No review notes'}</span>
                            <span className="text-gray-400">{new Date(r.createdAt).toLocaleDateString('en-IN')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Draft preview (truncated) */}
                  {detailProposal.proposalDraft && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Draft Preview</h3>
                      <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-auto max-h-64 whitespace-pre-wrap font-sans">{detailProposal.proposalDraft.slice(0, 2000)}{detailProposal.proposalDraft.length > 2000 ? '\n\n[truncated…]' : ''}</pre>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap pt-2 border-t border-gray-100">
                    {CAN_DRAFT.includes(detailProposal.stage) && (
                      <button onClick={() => handleDraft(detailProposal.id)} disabled={draftingId === detailProposal.id} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        {draftingId === detailProposal.id ? 'Running AI Draft…' : '🤖 Run AI Draft'}
                      </button>
                    )}
                    {detailProposal.stage === 'review' && (
                      <>
                        <button onClick={() => handleApprove(detailProposal.id, 'approve')} disabled={approvingId === detailProposal.id} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">✓ Approve</button>
                        <button onClick={() => handleApprove(detailProposal.id, 'reject')} disabled={approvingId === detailProposal.id} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 disabled:opacity-50">✗ Reject (re-draft)</button>
                      </>
                    )}
                    {detailProposal.stage === 'approved' && (
                      <>
                        <button onClick={() => handleApprove(detailProposal.id, 'approve', true)} disabled={approvingId === detailProposal.id} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">✓ 2nd Approval</button>
                        <button onClick={() => setWlId(detailProposal.id)} className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-sm hover:bg-emerald-200">Record Win/Loss</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Win/Loss Modal ─────────────────────────────────────────────────── */}
      {wlId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-4">Record Win/Loss</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Outcome</label>
                <div className="flex gap-2 mt-1">
                  {(['won', 'lost', 'no_decision'] as const).map(o => (
                    <button key={o} onClick={() => setWlOutcome(o)} className={`flex-1 py-1.5 rounded-lg text-sm font-medium border ${wlOutcome === o ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}>{o}</button>
                  ))}
                </div>
              </div>
              {wlOutcome === 'lost' && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Loss reason</label>
                  <input className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={wlReason} onChange={e => setWlReason(e.target.value)} placeholder="Why did we lose?" />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleWinLoss} disabled={wlSubmitting} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{wlSubmitting ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setWlId(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ingest Modal ───────────────────────────────────────────────────── */}
      {showIngest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold mb-4">Ingest New RFP</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">RFP Reference (optional)</label>
                <input className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={rfpRef} onChange={e => setRfpRef(e.target.value)} placeholder="RFP-2024-001" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Client Email (optional)</label>
                <input className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@company.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">RFP Text *</label>
                <textarea className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-36 resize-none" value={rfpText} onChange={e => setRfpText(e.target.value)} placeholder="Paste the full RFP text…" />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={ndaActive} onChange={e => setNdaActive(e.target.checked)} />
                NDA required
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
                DPDP consent confirmed for any PII in this RFP
              </label>
            </div>
            {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
            <div className="flex gap-3 mt-5">
              <button onClick={handleIngest} disabled={ingesting} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{ingesting ? 'Ingesting…' : 'Ingest RFP'}</button>
              <button onClick={() => { setShowIngest(false); setError(null) }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
