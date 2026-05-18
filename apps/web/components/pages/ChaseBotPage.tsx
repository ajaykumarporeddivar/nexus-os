'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ToneState = 'WARM' | 'FIRM' | 'URGENT' | 'PRE_LEGAL' | 'LEGAL_NOTICE'
type DisputeClass = 'quality' | 'billing' | 'admin' | 'ghost'
type ActiveTab = 'active' | 'dlq' | 'paid'

interface ChaseEvent {
  id:                  string
  toneState:           ToneState
  channel:             string
  messageSubject:      string | null
  dispatched:          boolean
  requiresHumanReview: boolean
  createdAt:           string
}

interface Invoice {
  id:                  string
  clientName:          string
  clientEmail:         string | null
  amount:              string
  currency:            string
  dueDate:             string
  overdueDays:         number
  toneState:           ToneState
  chaseActive:         boolean
  paymentPlanActive:   boolean
  disputeFlag:         boolean
  requiresHumanReview: boolean
  highValueFlag:       boolean
  paidAt:              string | null
  dlqFlag:             boolean
  chaseEvents:         ChaseEvent[]
  disputes:            { id: string; disputeClass: DisputeClass; resolvedAt: string | null }[]
  escalations:         { id: string; escalationType: string }[]
}

interface Pagination { page: number; limit: number; total: number; pages: number }

interface Stats {
  overview: {
    totalInvoices:       number
    activeChases:        number
    paidInvoices:        number
    disputedInvoices:    number
    dlqInvoices:         number
    requiresHumanReview: number
    totalOutstanding:    number
    totalRecovered:      number
  }
  toneDistribution: Record<ToneState, number>
  chaseMetrics: {
    totalChases:        number
    compliancePassRate: number
    recoveryRate:       number
    avgCostPerChase:    number
    humanEscalateRate:  number
  }
  ichs: {
    ichs:               number
    toneAccuracy:       number
    compliancePassRate: number
    recoveryRate:       number
    avgCostPerChase:    number
    humanEscalateRate:  number
  }
  meta?: { toneAccuracyBasis?: string }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TONE_COLORS: Record<ToneState, string> = {
  WARM:         'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  FIRM:         'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  URGENT:       'bg-orange-500/15 text-orange-400 border-orange-500/30',
  PRE_LEGAL:    'bg-red-500/15 text-red-400 border-red-500/30',
  LEGAL_NOTICE: 'bg-red-900/30 text-red-300 border-red-700/50',
}

const TONE_LABELS: Record<ToneState, string> = {
  WARM: 'Warm', FIRM: 'Firm', URGENT: 'Urgent', PRE_LEGAL: 'Pre-Legal', LEGAL_NOTICE: 'Legal Notice',
}

const TONE_ORDER: ToneState[] = ['WARM', 'FIRM', 'URGENT', 'PRE_LEGAL', 'LEGAL_NOTICE']
const PAGE_SIZE = 25

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(amount: string | number, currency: string): string {
  const n   = Number(amount)
  const sym = currency === 'INR' ? '₹' : currency === 'GBP' ? '£' : currency === 'USD' ? '$' : `${currency} `
  return `${sym}${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function ToneBadge({ state }: { state: ToneState }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest font-mono ${TONE_COLORS[state]}`}>
      {TONE_LABELS[state]}
    </span>
  )
}

// ─── Add Invoice Modal ────────────────────────────────────────────────────────

function AddInvoiceModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ clientId: '', clientName: '', clientEmail: '', amount: '', currency: 'INR', invoiceDate: '', dueDate: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const submit = async () => {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/chasebot/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      onAdded(); onClose()
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-paper border border-border rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-sm">Add Invoice</h3>
          <button onClick={onClose} className="text-ink3 hover:text-ink">✕</button>
        </div>
        <div className="space-y-3">
          {([
            { label: 'Client ID',    key: 'clientId',    ph: 'e.g. acme-corp' },
            { label: 'Client Name',  key: 'clientName',  ph: 'Display name' },
            { label: 'Client Email', key: 'clientEmail', ph: 'client@example.com' },
            { label: 'Amount',       key: 'amount',      ph: '50000' },
          ] as const).map(({ label, key, ph }) => (
            <div key={key}>
              <label className="block text-[10px] text-ink3 uppercase tracking-widest mb-1 font-mono">{label}</label>
              <input className="w-full bg-paper2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-acid" placeholder={ph} value={form[key]} onChange={f(key)} />
            </div>
          ))}
          <div>
            <label className="block text-[10px] text-ink3 uppercase tracking-widest mb-1 font-mono">Currency</label>
            <select className="w-full bg-paper2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-acid" value={form.currency} onChange={f('currency')}>
              {['INR', 'USD', 'GBP', 'EUR'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['invoiceDate', 'dueDate'] as const).map(k => (
              <div key={k}>
                <label className="block text-[10px] text-ink3 uppercase tracking-widest mb-1 font-mono">{k === 'invoiceDate' ? 'Invoice Date' : 'Due Date'}</label>
                <input type="date" className="w-full bg-paper2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-acid" value={form[k]} onChange={f(k)} />
              </div>
            ))}
          </div>
        </div>
        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm text-ink3 hover:text-ink transition-all">Cancel</button>
          <button onClick={submit} disabled={loading} className="flex-1 px-4 py-2 rounded-lg bg-acid text-paper text-sm font-bold hover:bg-acid/90 transition-all disabled:opacity-50">
            {loading ? 'Adding…' : 'Add Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mark as Paid Modal ───────────────────────────────────────────────────────

function MarkPaidModal({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const [source,  setSource]  = useState<'manual_admin' | 'stripe_webhook' | 'razorpay_webhook'>('manual_admin')
  const [amount,  setAmount]  = useState(invoice.amount)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const submit = async () => {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/chasebot/payment-halt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: invoice.id, source, amount: Number(amount), currency: invoice.currency }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      onDone(); onClose()
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-paper border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm text-emerald-400">Mark as Paid</h3>
          <button onClick={onClose} className="text-ink3 hover:text-ink">✕</button>
        </div>
        <p className="text-xs text-ink3 mb-4">Invoice: <span className="text-ink font-mono">{invoice.clientName}</span> · {fmtCurrency(invoice.amount, invoice.currency)}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-ink3 uppercase tracking-widest mb-1 font-mono">Payment Source</label>
            <select className="w-full bg-paper2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-acid" value={source} onChange={e => setSource(e.target.value as typeof source)}>
              <option value="manual_admin">Manual / Admin confirmation</option>
              <option value="stripe_webhook">Stripe Webhook</option>
              <option value="razorpay_webhook">Razorpay Webhook</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-ink3 uppercase tracking-widest mb-1 font-mono">Amount Received ({invoice.currency})</label>
            <input className="w-full bg-paper2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-acid" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm text-ink3 hover:text-ink transition-all">Cancel</button>
          <button onClick={submit} disabled={loading} className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 transition-all disabled:opacity-50">
            {loading ? 'Confirming…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── File Dispute Modal ───────────────────────────────────────────────────────

function DisputeModal({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const [disputeClass, setDisputeClass] = useState<DisputeClass>('billing')
  const [description,  setDescription]  = useState('')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  const submit = async () => {
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/chasebot/disputes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: invoice.id, disputeClass, description }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      onDone(); onClose()
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-paper border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm text-yellow-400">File Dispute</h3>
          <button onClick={onClose} className="text-ink3 hover:text-ink">✕</button>
        </div>
        <p className="text-xs text-ink3 mb-4">Filing a dispute pauses all chase activity for this invoice until resolved.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-ink3 uppercase tracking-widest mb-1 font-mono">Dispute Type</label>
            <select className="w-full bg-paper2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-acid" value={disputeClass} onChange={e => setDisputeClass(e.target.value as DisputeClass)}>
              <option value="billing">Billing Error</option>
              <option value="quality">Quality / Scope Dispute</option>
              <option value="admin">Administrative Delay</option>
              <option value="ghost">No Response / Unreachable</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-ink3 uppercase tracking-widest mb-1 font-mono">Description (optional)</label>
            <textarea className="w-full bg-paper2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-acid resize-none h-20" placeholder="Details about the dispute…" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm text-ink3 hover:text-ink transition-all">Cancel</button>
          <button onClick={submit} disabled={loading} className="flex-1 px-4 py-2 rounded-lg bg-yellow-600 text-white text-sm font-bold hover:bg-yellow-500 transition-all disabled:opacity-50">
            {loading ? 'Filing…' : 'File Dispute'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Chase Timeline Modal ─────────────────────────────────────────────────────

function TimelineModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-paper border border-border rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-sm">{invoice.clientName}</h3>
            <p className="text-[10px] text-ink3 font-mono mt-0.5">{fmtCurrency(invoice.amount, invoice.currency)} · {invoice.chaseEvents.length} chase events</p>
          </div>
          <button onClick={onClose} className="text-ink3 hover:text-ink">✕</button>
        </div>

        {invoice.chaseEvents.length === 0 ? (
          <p className="text-ink3 text-sm text-center py-6">No chase events yet</p>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-4">
              {invoice.chaseEvents.map((ev, i) => (
                <div key={ev.id} className="relative pl-10">
                  <div className={`absolute left-2.5 top-1.5 w-3 h-3 rounded-full border-2 ${ev.dispatched ? 'bg-acid border-acid' : ev.requiresHumanReview ? 'bg-yellow-500 border-yellow-500' : 'bg-paper2 border-border'}`} />
                  <div className="bg-paper2 border border-border rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                      <ToneBadge state={ev.toneState} />
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-ink3 font-mono">{ev.channel}</span>
                        <span className="text-[10px] text-ink3 font-mono">
                          {new Date(ev.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    {ev.messageSubject && <p className="text-xs text-ink font-medium mb-1">{ev.messageSubject}</p>}
                    <div className="flex items-center gap-2 flex-wrap">
                      {ev.dispatched && <span className="text-[10px] text-emerald-400 font-mono font-bold">DISPATCHED</span>}
                      {ev.requiresHumanReview && !ev.dispatched && <span className="text-[10px] text-yellow-400 font-mono font-bold">AWAITING REVIEW</span>}
                      {!ev.dispatched && !ev.requiresHumanReview && <span className="text-[10px] text-orange-400 font-mono font-bold">QUEUED</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disputes */}
        {invoice.disputes.length > 0 && (
          <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
            <p className="text-yellow-400 text-[10px] font-mono font-bold mb-1">ACTIVE DISPUTE</p>
            {invoice.disputes.map(d => (
              <p key={d.id} className="text-yellow-300 text-xs capitalize">{d.disputeClass.replace('_', ' ')} — chase paused</p>
            ))}
          </div>
        )}

        {/* Escalations */}
        {invoice.escalations.length > 0 && (
          <div className="mt-3 bg-orange-500/10 border border-orange-500/30 rounded-xl p-3">
            <p className="text-orange-400 text-[10px] font-mono font-bold mb-1">ESCALATION</p>
            {invoice.escalations.map(e => (
              <p key={e.id} className="text-orange-300 text-xs capitalize">{e.escalationType.replace('_', ' ')} — in review queue</p>
            ))}
          </div>
        )}

        <button onClick={onClose} className="mt-5 w-full px-4 py-2 rounded-lg border border-border text-sm text-ink3 hover:text-ink transition-all">Close</button>
      </div>
    </div>
  )
}

// ─── Chase Result Modal ───────────────────────────────────────────────────────

function ChaseResultModal({ result, onClose }: { result: Record<string, unknown>; onClose: () => void }) {
  const blocked  = result.blocked as boolean
  const composed = result.composed as { subject: string; body: string; humanReviewNotes?: string } | undefined
  const warnings = (result.warnings as { rule: string; reason: string }[] | undefined) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-paper border border-border rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm">
            {blocked
              ? <span className="text-red-400">Chase Blocked by GDSL</span>
              : result.requiresHumanReview
              ? <span className="text-yellow-400">Draft Ready — Human Review Required</span>
              : <span className="text-emerald-400">Chase Composed Successfully</span>
            }
          </h3>
          <button onClick={onClose} className="text-ink3 hover:text-ink">✕</button>
        </div>

        {/* Warnings (soft violations) */}
        {warnings.length > 0 && (
          <div className="mb-3 space-y-2">
            {warnings.map((w, i) => (
              <div key={i} className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2.5">
                <p className="text-yellow-400 text-[10px] font-mono font-bold">{w.rule}</p>
                <p className="text-yellow-300 text-xs mt-0.5">{w.reason}</p>
              </div>
            ))}
          </div>
        )}

        {/* Hard block */}
        {blocked && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-xs font-mono font-bold mb-1">{String(result.rule)}</p>
            <p className="text-red-300 text-xs">{String(result.reason)}</p>
          </div>
        )}

        {/* Composed message */}
        {composed && (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-ink3 uppercase tracking-widest mb-1 font-mono">Subject</label>
              <p className="text-sm text-ink bg-paper2 rounded-lg p-2 border border-border">{composed.subject}</p>
            </div>
            <div>
              <label className="block text-[10px] text-ink3 uppercase tracking-widest mb-1 font-mono">Message Body</label>
              <pre className="text-xs text-ink2 bg-paper2 rounded-lg p-3 border border-border whitespace-pre-wrap font-sans leading-relaxed">{composed.body}</pre>
            </div>
            {composed.humanReviewNotes && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <p className="text-yellow-400 text-[10px] font-mono font-bold mb-1">SOLICITOR REVIEW NOTES</p>
                <p className="text-yellow-300 text-xs">{composed.humanReviewNotes}</p>
              </div>
            )}
            {result.agentCostUsd != null && (
              <p className="text-[10px] text-ink3 font-mono text-right">
                Cost: ${Number(result.agentCostUsd as number).toFixed(4)} · {Number((result.tokensUsed as number) ?? 0).toLocaleString()} tokens
              </p>
            )}
          </div>
        )}

        <button onClick={onClose} className="mt-4 w-full px-4 py-2 rounded-lg border border-border text-sm text-ink3 hover:text-ink transition-all">
          Close
        </button>
      </div>
    </div>
  )
}

// ─── ICHS Gauge ───────────────────────────────────────────────────────────────

function ICHSGauge({ score, target = 82 }: { score: number; target?: number }) {
  const color    = score >= target ? 'text-emerald-400' : score >= target * 0.8 ? 'text-yellow-400' : 'text-red-400'
  const barColor = score >= target ? 'bg-emerald-500'   : score >= target * 0.8 ? 'bg-yellow-500'   : 'bg-red-500'
  return (
    <div className="flex items-center gap-3">
      <div className={`text-2xl font-black font-mono ${color}`}>{score}<span className="text-sm font-normal text-ink3">/100</span></div>
      <div className="flex-1">
        <div className="flex items-center justify-between text-[10px] text-ink3 mb-1">
          <span className="font-mono">ICHS</span>
          <span className="font-mono">Target {target}</span>
        </div>
        <div className="h-2 bg-paper2 rounded-full overflow-hidden border border-border">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(100, score)}%` }} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ChaseBotPage() {
  const [invoices,      setInvoices]      = useState<Invoice[]>([])
  const [pagination,    setPagination]    = useState<Pagination>({ page: 1, limit: PAGE_SIZE, total: 0, pages: 0 })
  const [stats,         setStats]         = useState<Stats | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [statsLoading,  setStatsLoading]  = useState(true)
  const [chasing,       setChasing]       = useState<string | null>(null)
  const [chaseResult,   setChaseResult]   = useState<Record<string, unknown> | null>(null)
  const [activeTab,     setActiveTab]     = useState<ActiveTab>('active')
  const [toneFilter,    setToneFilter]    = useState<ToneState | 'ALL'>('ALL')
  const [page,          setPage]          = useState(1)
  const [showAdd,       setShowAdd]       = useState(false)
  const [markPaidInv,   setMarkPaidInv]   = useState<Invoice | null>(null)
  const [disputeInv,    setDisputeInv]    = useState<Invoice | null>(null)
  const [timelineInv,   setTimelineInv]   = useState<Invoice | null>(null)

  const loadInvoices = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        tab:   activeTab,
        page:  String(p),
        limit: String(PAGE_SIZE),
        ...(toneFilter !== 'ALL' ? { tone: toneFilter } : {}),
      })
      const res  = await fetch(`/api/chasebot/invoices?${params}`)
      const data = await res.json()
      setInvoices(data.invoices ?? [])
      setPagination(data.pagination ?? { page: p, limit: PAGE_SIZE, total: 0, pages: 0 })
    } catch { setInvoices([]) } finally { setLoading(false) }
  }, [activeTab, toneFilter, page])

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res  = await fetch('/api/chasebot/stats')
      const data = await res.json()
      setStats(data)
    } catch { setStats(null) } finally { setStatsLoading(false) }
  }, [])

  useEffect(() => { setPage(1); loadInvoices(1) }, [activeTab, toneFilter])
  useEffect(() => { loadStats() }, [])
  useEffect(() => { loadInvoices(page) }, [page])

  const refresh = () => { loadInvoices(page); loadStats() }

  const triggerChase = async (invoiceId: string) => {
    setChasing(invoiceId)
    try {
      const res  = await fetch('/api/chasebot/chase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId }) })
      const data = await res.json()
      setChaseResult(data)
      refresh()
    } catch { setChaseResult({ error: 'Network error' }) } finally { setChasing(null) }
  }

  const totalOutstanding = stats?.overview.totalOutstanding ?? 0
  const totalRecovered   = stats?.overview.totalRecovered   ?? 0
  const totalIssued      = totalOutstanding + totalRecovered
  const recoveryPct      = totalIssued > 0 ? (totalRecovered / totalIssued) * 100 : 0

  return (
    <div className="p-6 space-y-6 max-w-7xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black tracking-tight">ChaseBot CB</h1>
          <p className="text-xs text-ink3 mt-0.5">Invoice Follow-up & Payment Recovery · NEXUS OS v8.0 · 12 GDSL Rules Active</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl bg-acid text-paper text-sm font-bold hover:bg-acid/90 transition-all">
          + Add Invoice
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: 'Total',        value: stats?.overview.totalInvoices ?? '—',        color: 'text-ink' },
          { label: 'Active',       value: stats?.overview.activeChases ?? '—',         color: 'text-acid' },
          { label: 'Paid',         value: stats?.overview.paidInvoices ?? '—',         color: 'text-emerald-400' },
          { label: 'Disputed',     value: stats?.overview.disputedInvoices ?? '—',     color: 'text-yellow-400' },
          { label: 'Review Queue', value: stats?.overview.requiresHumanReview ?? '—',  color: 'text-orange-400' },
          { label: 'DLQ',          value: stats?.overview.dlqInvoices ?? '—',          color: 'text-red-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-paper2 border border-border rounded-xl p-3">
            <p className={`text-xl font-black font-mono ${color}`}>{String(value)}</p>
            <p className="text-[10px] text-ink3 uppercase tracking-widest mt-0.5 font-mono">{label}</p>
          </div>
        ))}
      </div>

      {/* ICHS + Recovery + Tone distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-paper2 border border-border rounded-2xl p-4">
          <p className="text-[10px] text-ink3 uppercase tracking-widest font-mono mb-3">ICHS Score</p>
          {statsLoading
            ? <div className="h-10 bg-paper animate-pulse rounded" />
            : <ICHSGauge score={stats?.ichs.ichs ?? 0} />
          }
          {stats && (
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px] font-mono text-ink3">
              <span>Compliance <span className="text-ink2">{stats.chaseMetrics.compliancePassRate}%</span></span>
              <span>Recovery <span className="text-ink2">{stats.chaseMetrics.recoveryRate}%</span></span>
              <span>Avg cost <span className="text-ink2">${stats.chaseMetrics.avgCostPerChase.toFixed(4)}</span></span>
              <span>Escalate <span className="text-ink2">{stats.chaseMetrics.humanEscalateRate}%</span></span>
            </div>
          )}
          {stats?.meta?.toneAccuracyBasis && (
            <p className="text-[9px] text-ink3 font-mono mt-2 border-t border-border pt-2 leading-relaxed">{stats.meta.toneAccuracyBasis}</p>
          )}
        </div>

        <div className="bg-paper2 border border-border rounded-2xl p-4">
          <p className="text-[10px] text-ink3 uppercase tracking-widest font-mono mb-3">Recovery</p>
          {statsLoading ? <div className="space-y-2"><div className="h-5 bg-paper animate-pulse rounded" /></div> : (
            <div className="space-y-3">
              <div>
                <p className="text-lg font-black font-mono text-emerald-400">{fmtCurrency(totalRecovered, 'INR')}</p>
                <p className="text-[10px] text-ink3 font-mono">recovered of {fmtCurrency(totalIssued, 'INR')} issued</p>
              </div>
              <div className="h-2 bg-paper rounded-full overflow-hidden border border-border">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${recoveryPct}%` }} />
              </div>
              <p className="text-[10px] text-ink3 font-mono">{Math.round(recoveryPct)}% recovery rate · target 65%</p>
            </div>
          )}
        </div>

        <div className="bg-paper2 border border-border rounded-2xl p-4">
          <p className="text-[10px] text-ink3 uppercase tracking-widest font-mono mb-3">Tone Distribution</p>
          {statsLoading ? <div className="space-y-1">{[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-paper animate-pulse rounded" />)}</div> : (
            <div className="space-y-2">
              {TONE_ORDER.map(tone => {
                const count = stats?.toneDistribution[tone] ?? 0
                const total = TONE_ORDER.reduce((s, t) => s + (stats?.toneDistribution[t] ?? 0), 0)
                const pct   = total > 0 ? (count / total) * 100 : 0
                return (
                  <div key={tone} className="flex items-center gap-2">
                    <span className="w-16 text-[9px] font-mono text-ink3 text-right shrink-0">{TONE_LABELS[tone]}</span>
                    <div className="flex-1 h-1.5 bg-paper rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${tone === 'WARM' ? 'bg-emerald-500' : tone === 'FIRM' ? 'bg-yellow-500' : tone === 'URGENT' ? 'bg-orange-500' : tone === 'PRE_LEGAL' ? 'bg-red-500' : 'bg-red-900'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-4 text-[10px] font-mono text-ink2 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tone state machine legend */}
      <div className="flex items-center gap-2 flex-wrap bg-paper2 border border-border rounded-xl px-4 py-2.5">
        <span className="text-[10px] text-ink3 font-mono uppercase tracking-widest">Tone FSM:</span>
        {TONE_ORDER.map((tone, i) => (
          <span key={tone} className="flex items-center gap-1">
            <ToneBadge state={tone} />
            {i < TONE_ORDER.length - 1 && <span className="text-ink3 text-xs opacity-40">→</span>}
          </span>
        ))}
        <span className="text-[10px] text-red-400 font-mono ml-auto">AI HALTED at LEGAL NOTICE</span>
      </div>

      {/* Invoice table */}
      <div className="bg-paper2 border border-border rounded-2xl overflow-hidden">
        {/* Tabs + tone filter */}
        <div className="flex items-center justify-between gap-4 p-4 border-b border-border flex-wrap">
          <div className="flex gap-1">
            {(['active', 'dlq', 'paid'] as ActiveTab[]).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === tab ? 'bg-acid text-paper' : 'text-ink3 hover:text-ink hover:bg-paper'}`}>
                {tab === 'active' ? `Active ${stats ? `(${stats.overview.activeChases})` : ''}` : tab === 'dlq' ? `DLQ ${stats ? `(${stats.overview.dlqInvoices})` : ''}` : `Paid ${stats ? `(${stats.overview.paidInvoices})` : ''}`}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap">
            {(['ALL', ...TONE_ORDER] as (ToneState | 'ALL')[]).map(tone => (
              <button key={tone} onClick={() => setToneFilter(tone)}
                className={`px-2 py-1 rounded-md text-[10px] font-mono transition-all ${toneFilter === tone ? 'bg-ink text-paper' : 'text-ink3 hover:text-ink'}`}>
                {tone === 'ALL' ? 'All' : TONE_LABELS[tone]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-ink3 text-sm animate-pulse">Loading invoices…</div>
        ) : invoices.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-ink3 text-sm">No invoices found</p>
            {activeTab === 'active' && (
              <button onClick={() => setShowAdd(true)} className="mt-3 px-4 py-2 rounded-xl bg-acid text-paper text-sm font-bold hover:bg-acid/90 transition-all">
                Add first invoice
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Client', 'Amount', 'Due', 'Overdue', 'Tone', 'Events', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] text-ink3 uppercase tracking-widest font-mono font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="border-b border-border/50 hover:bg-paper transition-all">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{inv.clientName}</div>
                        {inv.clientEmail && <div className="text-[10px] text-ink3 font-mono">{inv.clientEmail}</div>}
                        {inv.highValueFlag && <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-orange-500/15 text-orange-400 text-[9px] rounded border border-orange-500/30 font-mono font-bold">HIGH VALUE</span>}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-ink whitespace-nowrap">{fmtCurrency(inv.amount, inv.currency)}</td>
                      <td className="px-4 py-3 text-ink3 font-mono text-xs whitespace-nowrap">
                        {new Date(inv.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono text-sm font-bold ${inv.overdueDays === 0 ? 'text-ink3' : inv.overdueDays <= 7 ? 'text-yellow-400' : inv.overdueDays <= 30 ? 'text-orange-400' : 'text-red-400'}`}>
                          {inv.overdueDays === 0 ? '—' : `${inv.overdueDays}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3"><ToneBadge state={inv.toneState} /></td>
                      <td className="px-4 py-3">
                        <button onClick={() => setTimelineInv(inv)} className="flex items-center gap-1.5 group">
                          <span className="font-mono text-sm font-bold text-ink group-hover:text-acid transition-all">{inv.chaseEvents.length}</span>
                          <span className="text-[10px] text-ink3 group-hover:text-acid transition-all">view →</span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          {inv.paidAt      && <span className="text-[10px] text-emerald-400 font-mono font-bold">PAID</span>}
                          {inv.disputeFlag && <span className="text-[10px] text-yellow-400 font-mono font-bold">DISPUTED</span>}
                          {inv.requiresHumanReview && !inv.paidAt && <span className="text-[10px] text-orange-400 font-mono font-bold">REVIEW</span>}
                          {inv.dlqFlag     && <span className="text-[10px] text-red-400 font-mono font-bold">DLQ</span>}
                          {!inv.paidAt && !inv.disputeFlag && !inv.requiresHumanReview && !inv.dlqFlag && inv.chaseActive &&
                            <span className="text-[10px] text-acid font-mono font-bold">ACTIVE</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {/* Chase button */}
                          {inv.chaseActive && !inv.paidAt && !inv.disputeFlag && (
                            <button
                              onClick={() => triggerChase(inv.id)}
                              disabled={chasing === inv.id || inv.toneState === 'LEGAL_NOTICE'}
                              title={inv.toneState === 'LEGAL_NOTICE' ? 'Human-authored only' : undefined}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${inv.toneState === 'LEGAL_NOTICE' ? 'bg-red-900/30 text-red-500 border border-red-700/50 cursor-not-allowed' : inv.requiresHumanReview ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/25' : 'bg-acid/15 text-acid border border-acid/30 hover:bg-acid/25'}`}
                            >
                              {chasing === inv.id ? '…' : inv.toneState === 'LEGAL_NOTICE' ? 'Human Only' : inv.requiresHumanReview ? 'Draft' : 'Chase'}
                            </button>
                          )}
                          {/* Mark Paid */}
                          {!inv.paidAt && (
                            <button onClick={() => setMarkPaidInv(inv)} className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all">
                              Paid
                            </button>
                          )}
                          {/* Dispute */}
                          {!inv.disputeFlag && !inv.paidAt && (
                            <button onClick={() => setDisputeInv(inv)} className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/25 transition-all">
                              Dispute
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-[10px] text-ink3 font-mono">
                  {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg text-xs border border-border text-ink3 hover:text-ink disabled:opacity-30 transition-all">← Prev</button>
                  <span className="px-3 py-1.5 text-xs font-mono text-ink3">{page} / {pagination.pages}</span>
                  <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="px-3 py-1.5 rounded-lg text-xs border border-border text-ink3 hover:text-ink disabled:opacity-30 transition-all">Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* GDSL rules chips */}
      <div className="bg-paper2 border border-border rounded-2xl p-4">
        <p className="text-[10px] text-ink3 uppercase tracking-widest font-mono mb-3">GDSL Governance — 12 Rules Active</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Prohibited Language',  hardStop: true  },
            { label: 'Legal Authoring',      hardStop: true  },
            { label: 'Payment Halt',         hardStop: true  },
            { label: 'Strategic Ceiling',    hardStop: true  },
            { label: 'Idempotency',          hardStop: true  },
            { label: 'Cadence Cap',          hardStop: true  },
            { label: 'Channel Hours',        hardStop: false },
            { label: 'Payment Plan Freeze',  hardStop: true  },
            { label: 'Dispute Pause',        hardStop: true  },
            { label: 'High Value Phone',     hardStop: true  },
            { label: 'PII Retention',        hardStop: false },
            { label: 'DLQ Monitor',          hardStop: false },
          ].map(({ label, hardStop }) => (
            <span key={label} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono ${hardStop ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${hardStop ? 'bg-red-400' : 'bg-yellow-400'}`} />
              {label}
            </span>
          ))}
        </div>
        <p className="text-[9px] text-ink3 font-mono mt-2">
          <span className="text-red-400">Red = hard stop (blocks dispatch)</span>
          <span className="ml-3 text-yellow-400">Yellow = soft warn (defers, surfaces to user)</span>
        </p>
      </div>

      {/* Modals */}
      {showAdd       && <AddInvoiceModal onClose={() => setShowAdd(false)} onAdded={refresh} />}
      {markPaidInv   && <MarkPaidModal invoice={markPaidInv} onClose={() => setMarkPaidInv(null)} onDone={refresh} />}
      {disputeInv    && <DisputeModal invoice={disputeInv} onClose={() => setDisputeInv(null)} onDone={refresh} />}
      {timelineInv   && <TimelineModal invoice={timelineInv} onClose={() => setTimelineInv(null)} />}
      {chaseResult   && <ChaseResultModal result={chaseResult} onClose={() => setChaseResult(null)} />}
    </div>
  )
}
