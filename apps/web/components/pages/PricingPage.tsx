'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { brand } from '@/lib/brand'
import type { PageId } from '@/components/Nav'

const FAQ_ITEMS = [
  {
    q: 'How quickly can I deliver my first client project?',
    a: 'Most agencies complete a full project brief — architecture, code scaffold, QA report, database schema — in under 4 minutes on the FORGE Engine. Day 1 productivity is immediate.',
  },
  {
    q: 'What happens if a FORGE output scores below 8.0?',
    a: 'The engine triggers an automatic self-healing loop: the Builder agent revises based on QA findings, and the QA Gate re-scores. If it still falls short, we revise it for free. Zero exceptions.',
  },
  {
    q: 'Can I use my own Anthropic API key?',
    a: 'Yes. Bring your own key in the FORGE Engine and it will use your quota at cost. The platform quota (free/starter/agency) is a shared pool — BYO key bypasses it entirely.',
  },
  {
    q: 'Is there a long-term contract?',
    a: 'No. Month-to-month on Starter and Agency. Cancel anytime with 30 days notice. Enterprise contracts are custom — typically 12-month with quarterly reviews.',
  },
  {
    q: 'What does "white-label ready" mean on Agency?',
    a: 'You can remove NEXUS OS branding from client-facing exports (ZIP packages, proposals) and present the work as your own agency\'s output. The platform metadata is stripped from all deliverables.',
  },
]

declare global {
  interface Window {
    Razorpay: new (opts: Record<string, unknown>) => { open(): void }
  }
}

const TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49',
    period: '/month',
    highlight: false,
    features: [
      '20 FORGE Engine runs/month',
      'Professional source quality gate',
      'Local preview + live URL readiness checks',
      'Reasoning Engine (all 11 lenses)',
      'Prompt Vault access (read)',
      '5 active kits',
      'Email support (48h SLA)',
      'Basic dashboard analytics',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '$199',
    period: '/month',
    highlight: true,
    features: [
      'Unlimited FORGE Engine runs',
      'Ship-readiness score on every build',
      'Deploy repair + verified live URL tracking',
      'Reasoning Engine + Live Runtime',
      'Prompt Vault (read + write + versions)',
      'Unlimited active kits',
      'Priority WhatsApp support (4h SLA)',
      'Full analytics dashboard',
      'White-label ZIP export',
      'API access + bring your own key',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    highlight: false,
    features: [
      'Everything in Agency',
      'Dedicated deployment — scoped on contract',
      'Custom agent development — included in onboarding',
      'On-premise option — available on request',
      'Priority SLA — defined in contract',
      'Dedicated success engineer',
      'Custom SSO setup (SAML/OIDC) — scoped on contract',
      'Unlimited API tokens',
    ],
  },
] as const

type TierId = typeof TIERS[number]['id']

interface Props { onNavigate: (page: PageId) => void }

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Razorpay) { resolve(); return }
    // Check if already loading (avoid duplicate script tags)
    if (document.querySelector('script[src*="checkout.razorpay.com"]')) {
      // Wait for it to finish
      const poll = setInterval(() => {
        if (window.Razorpay) { clearInterval(poll); resolve() }
      }, 100)
      setTimeout(() => { clearInterval(poll); reject(new Error('Razorpay SDK timeout')) }, 10000)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load payment SDK. Check your connection and try again.'))
    document.body.appendChild(script)
    // 10s timeout fallback
    setTimeout(() => reject(new Error('Payment SDK load timeout. Try refreshing the page.')), 10000)
  })
}

export default function PricingPage({ onNavigate }: Props) {
  const { data: session, update: updateSession } = useSession()
  const [form, setForm] = useState({ name: '', agency: '', email: '', phone: '', usecase: '' })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [paying, setPaying] = useState<TierId | null>(null)
  const [paySuccess, setPaySuccess] = useState(false)
  const [paidPlan, setPaidPlan] = useState<string>('Starter')
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null)
  const [roiProjects, setRoiProjects] = useState(4)
  const [roiRate, setRoiRate] = useState(75)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // Pre-fill form from signed-in session
  useEffect(() => {
    if (session?.user) {
      setForm(f => ({
        ...f,
        name:  f.name  || (session.user?.name  as string) || '',
        email: f.email || (session.user?.email as string) || '',
      }))
    }
  }, [session])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email) return
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    if (!emailOk) { setBookingError('Please enter a valid email address.'); return }
    setSubmitting(true); setBookingError(null)
    try {
      const res = await fetch('/api/demo-booking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Server error')
      setWhatsappUrl(data.data?.whatsappUrl ?? null)
      setSubmitted(true)
    } catch {
      setBookingError(`Submission failed. Please email us directly at ${brand.supportEmail}`)
    } finally { setSubmitting(false) }
  }, [form])

  const handlePay = useCallback(async (tierId: TierId) => {
    if (tierId === 'enterprise') {
      document.getElementById('book-form')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    setPaying(tierId); setError(null)
    try {
      const orderRes = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: tierId, email: form.email, name: form.name }),
      })
      const orderData = await orderRes.json()
      if (!orderData.ok) throw new Error(orderData.error ?? 'Order failed')

      await loadRazorpay()

      const rzp = new window.Razorpay({
        key: orderData.data.keyId,
        amount: orderData.data.amount,
        currency: orderData.data.currency,
        name: brand.name,
        description: orderData.data.planName,
        order_id: orderData.data.orderId,
        prefill: { name: form.name, email: form.email, contact: form.phone },
        theme: { color: '#c8ff00' },
        handler: async (response: Record<string, string>) => {
          const verifyRes = await fetch('/api/checkout/verify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...response, plan: tierId, email: form.email }),
          })
          const verifyData = await verifyRes.json()
          if (verifyData.ok) {
            setPaidPlan(tierId === 'agency' ? 'Agency' : 'Starter')
            setPaySuccess(true)
            // Refresh NextAuth JWT so session.user.plan reflects the new plan immediately
            await updateSession({ plan: tierId })
            // Force full session reload after 1s to pull DB-authoritative plan
            setTimeout(() => updateSession(), 1000)
          } else {
            setError('Payment verification failed. Contact support.')
          }
        },
      })
      rzp.open()
    } catch (err) {
      setError((err as Error).message)
    } finally { setPaying(null) }
  }, [form.email, form.name, form.phone])

  if (paySuccess) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center space-y-6 animate-fadein">
        <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white text-2xl font-black mx-auto shadow-lg">✓</div>
        <div>
          <p className="text-[10px] font-black font-mono tracking-widest text-green-600 uppercase mb-1">{paidPlan} plan activated</p>
          <h2 className="text-3xl font-black text-ink">You're live.</h2>
          <p className="text-ink3 mt-2 leading-relaxed">
            Your {paidPlan} plan is active now — no waiting, no onboarding call needed.
            <br />Run your first pipeline immediately.
          </p>
        </div>
        <div className="bg-paper2 border border-border rounded-2xl p-5 text-left space-y-2">
          <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">What just unlocked</p>
          {paidPlan === 'Agency' ? (
            <ul className="text-sm text-ink space-y-1">
              <li>◉ Unlimited pipeline runs this month</li>
              <li>◉ White-label output for client delivery</li>
              <li>◉ API access + Slack support</li>
              <li>◉ Priority Vercel build queue</li>
            </ul>
          ) : (
            <ul className="text-sm text-ink space-y-1">
              <li>◉ 20 pipeline runs this month</li>
              <li>◉ Priority build queue</li>
              <li>◉ Email support</li>
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => onNavigate('pipeline')}
            className="w-full py-4 rounded-xl font-black text-sm"
            style={{ background: '#c8f23c', color: '#0d1117' }}
          >
            Launch One-Click Pipeline now →
          </button>
          <button onClick={() => onNavigate('overview')} className="text-xs text-ink3 hover:text-ink underline transition-colors">
            Go to Dashboard
          </button>
        </div>
        <p className="text-[10px] text-ink3">Receipt sent to {form.email} · Cancel anytime in Account settings</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-16">
      <section className="text-center">
        <p className="sec-label mb-3">Pricing</p>
        <h2 className="text-4xl font-bold mb-4" style={{ fontFamily: 'var(--ff-d)' }}>
          Built for agencies that need live apps, not agent theater
        </h2>
        <p className="text-ink3 max-w-xl mx-auto">
          No per-seat nonsense. Flat monthly retainer — unlimited builds while you grow.
        </p>
        {/* Social proof bar */}
        <div className="mt-8 grid grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden max-w-lg mx-auto border border-border">
          {[
            { n: 'Live URL', label: 'Success metric' },
            { n: '8.5+', label: 'Source gate target' },
            { n: 'Auto-fix', label: 'Deploy repair loop' },
          ].map(({ n, label }) => (
            <div key={label} className="bg-paper px-4 py-4 text-center">
              <p className="text-2xl font-black text-ink" style={{ fontFamily: 'var(--ff-d)' }}>{n}</p>
              <p className="text-[10px] text-ink3 mt-0.5 font-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing cards */}
      <div className="grid sm:grid-cols-3 gap-6">
        {TIERS.map(tier => (
          <div key={tier.id}
            className={`card flex flex-col gap-5 relative ${tier.highlight ? 'border-acid ring-1 ring-acid/30' : ''}`}>
            {tier.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="chip acid px-3 py-1 text-xs">MOST POPULAR</span>
              </div>
            )}
            <div>
              <h3 className="font-bold text-lg">{tier.name}</h3>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>{tier.price}</span>
                {tier.period && <span className="text-sm text-ink3">{tier.period}</span>}
              </div>
            </div>
            <ul className="space-y-2 flex-1">
              {tier.features.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <span className="text-green mt-0.5 flex-shrink-0">✓</span>
                  <span className="text-ink3">{f}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handlePay(tier.id)}
              disabled={paying === tier.id}
              className={`btn w-full justify-center disabled:opacity-50 ${tier.highlight ? 'btn-primary' : 'btn-ghost'}`}
            >
              {paying === tier.id ? '⟳ Loading…' : tier.id === 'enterprise' ? 'Contact Us' : `Subscribe ${tier.price}`}
            </button>
            <button
              onClick={() => document.getElementById('book-form')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-xs text-ink3 hover:text-ink text-center"
            >
              Book a demo first →
            </button>
          </div>
        ))}
      </div>

      {error && (
        <div className="card border-rose/30 text-center py-4 space-y-2">
          <p className="text-sm text-rose">{error}</p>
          <p className="text-xs text-ink3">
            Payment issue? <a href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '918919843305'}?text=${encodeURIComponent('Hi! I want to subscribe to NEXUS OS. Can you help me complete payment?')}`} target="_blank" rel="noreferrer" className="text-acid underline">WhatsApp us to pay manually →</a>
          </p>
        </div>
      )}

      {/* ROI Calculator */}
      <section className="card space-y-6">
        <div className="text-center">
          <p className="sec-label mb-1">ROI Calculator</p>
          <h3 className="text-xl font-bold">See your payback in 30 seconds</h3>
          <p className="text-sm text-ink3 mt-1">Drag to set your context — see how NEXUS OS pays for itself.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Client projects per month</label>
              <span className="text-acid font-bold font-mono text-lg">{roiProjects}</span>
            </div>
            <input
              type="range" min={1} max={20} value={roiProjects}
              onChange={e => setRoiProjects(Number(e.target.value))}
              className="w-full accent-acid"
            />
            <div className="flex justify-between text-[10px] text-ink3 font-mono"><span>1</span><span>20</span></div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Your hourly rate ($)</label>
              <span className="text-acid font-bold font-mono text-lg">${roiRate}</span>
            </div>
            <input
              type="range" min={10} max={250} step={5} value={roiRate}
              onChange={e => setRoiRate(Number(e.target.value))}
              className="w-full accent-acid"
            />
            <div className="flex justify-between text-[10px] text-ink3 font-mono"><span>$10</span><span>$250</span></div>
          </div>
        </div>
        {(() => {
          const hoursPerProject = 40
          const forgeSavedHours = 32
          const savedHoursTotal = roiProjects * forgeSavedHours
          const savedValue      = savedHoursTotal * roiRate
          const cost            = 199
          const roi             = Math.round(((savedValue - cost) / cost) * 100)
          return (
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border">
              {[
                { label: 'Hours saved/mo', val: `${savedHoursTotal}h`, highlight: false },
                { label: 'Value reclaimed', val: savedValue >= 1000 ? `$${(savedValue / 1000).toFixed(0)}K` : `$${savedValue}`, highlight: true },
                { label: 'Return on invest', val: `${roi > 0 ? '+' : ''}${roi}%`, highlight: true },
              ].map(({ label, val, highlight }) => (
                <div key={label} className={`rounded-xl p-4 text-center ${highlight ? 'bg-acid/8 border border-acid/20' : 'bg-paper2'}`}>
                  <p className={`text-2xl font-black ${highlight ? 'text-acid' : 'text-ink'}`} style={{ fontFamily: 'var(--ff-d)' }}>{val}</p>
                  <p className="text-[10px] text-ink3 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )
        })()}
        <p className="text-[10px] text-ink3 text-center">Based on: Agency plan $199/mo · {roiProjects} projects · {roiProjects * 32}h saved (avg 32h per project vs 40h manual)</p>
      </section>

      {/* Guarantee */}
      <div className="card text-center py-8 space-y-3" style={{ borderColor: 'rgba(34,211,160,.3)' }}>
        <p className="text-2xl">🛡️</p>
        <h3 className="font-bold text-lg">30-day quality guarantee</h3>
        <p className="text-sm text-ink3 max-w-lg mx-auto">
          We measure success by a professional-grade app bundle and a verified live URL. If quality or deployment repair fails, the run is not treated as shipped.
        </p>
      </div>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto space-y-3">
        <div className="text-center mb-6">
          <p className="sec-label mb-1">FAQ</p>
          <h3 className="text-xl font-bold">Common questions</h3>
        </div>
        {FAQ_ITEMS.map((item, idx) => (
          <div key={idx} className="card overflow-hidden">
            <button
              onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
              className="w-full text-left flex items-center justify-between gap-3 py-1"
            >
              <span className="text-sm font-semibold">{item.q}</span>
              <span className={`text-ink3 flex-shrink-0 transition-transform text-lg leading-none ${openFaq === idx ? 'rotate-45' : ''}`}>+</span>
            </button>
            {openFaq === idx && (
              <div className="pt-3 border-t border-border mt-3">
                <p className="text-sm text-ink3 leading-relaxed">{item.a}</p>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Booking form */}
      <section id="book-form" className="card max-w-xl mx-auto">
        {submitted ? (
          <div className="space-y-6 py-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mx-auto text-2xl">✓</div>
              <h3 className="font-bold text-xl">Demo booked — you're in.</h3>
              <p className="text-sm text-ink3">We'll WhatsApp you within 24 hours to schedule your session.</p>
            </div>

            {whatsappUrl && (
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                className="btn btn-primary w-full justify-center text-base py-3">
                Message us on WhatsApp now →
              </a>
            )}

            <div className="border-t border-border pt-5">
              <p className="text-xs text-ink3 mb-3 font-medium uppercase tracking-wider">Explore while you wait</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { page: 'forge' as const,     icon: '⚡', label: 'FORGE Engine',       desc: 'Run your first AI delivery' },
                  { page: 'reasoning' as const,  icon: '🧠', label: 'Reasoning Engine',   desc: '11 decision lenses' },
                  { page: 'trending' as const,   icon: '📈', label: 'Trending Signals',   desc: 'Live micro-SaaS intel' },
                  { page: 'vault' as const,      icon: '🗄️', label: 'Prompt Vault',       desc: 'Battle-tested prompts' },
                  { page: 'dashboard' as const,  icon: '📊', label: 'Dashboard',          desc: 'System health & CR score' },
                  { page: 'client-delivery' as const, icon: '🤖', label: 'Client Autopilot', desc: 'Instant project proposals' },
                ].map(({ page, icon, label, desc }) => (
                  <button key={page} onClick={() => onNavigate(page)}
                    className="card text-left p-3 hover:border-acid/50 transition-colors group">
                    <div className="text-lg mb-1">{icon}</div>
                    <div className="text-sm font-medium group-hover:text-acid transition-colors">{label}</div>
                    <div className="text-xs text-ink3">{desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="mb-2">
              <h3 className="font-bold text-lg">Book a free demo</h3>
              <p className="text-sm text-ink3">We'll WhatsApp you within 24 hours.</p>
            </div>
            <div className="space-y-3">
              {[
                { id: 'name', label: 'Name *', type: 'text', required: true, placeholder: 'Your name', field: 'name' as const },
                { id: 'agency', label: 'Agency name', type: 'text', required: false, placeholder: 'Your agency name', field: 'agency' as const },
                { id: 'email', label: 'Email *', type: 'email', required: true, placeholder: 'you@agency.com', field: 'email' as const },
                { id: 'phone', label: 'Phone / WhatsApp', type: 'tel', required: false, placeholder: '+91 98765 43210', field: 'phone' as const },
              ].map(({ id, label, type, required, placeholder, field }) => (
                <div key={id}>
                  <label className="text-xs text-ink3 mb-1 block">{label}</label>
                  <input id={id} type={type} required={required} value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-ink3 mb-1 block">What do you want to build?</label>
                <textarea value={form.usecase} onChange={e => setForm(f => ({ ...f, usecase: e.target.value }))}
                  placeholder="e.g. recruitment automation, lead generation bot, WhatsApp CRM…"
                  rows={3} className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid resize-none"
                />
              </div>
            </div>
            {bookingError && <p className="text-xs text-rose">{bookingError}</p>}
            <button type="submit" disabled={submitting || !form.name || !form.email}
              className="btn btn-primary w-full justify-center disabled:opacity-50">
              {submitting ? '⟳ Submitting…' : "Submit & We'll WhatsApp You →"}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
