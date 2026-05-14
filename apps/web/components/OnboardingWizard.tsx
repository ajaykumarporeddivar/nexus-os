'use client'

import { useState } from 'react'
import { INDUSTRY_TAXONOMY } from '@/lib/industryTaxonomy'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface WizardState {
  // Step 1 — workspace identity
  name:  string
  type:  string
  emoji: string
  color: string
  // Step 2 — industry
  primaryIndustry: string
  subcategories:   string[]
  // Step 3 — preferences
  targetMarket:          string
  preferredRevenueModel: string
  buildComplexityPref:   string
  generationAggression:  string
}

interface OnboardingWizardProps {
  onComplete: (workspace: { id: string; name: string }) => void
  onCancel:   () => void
}

const EMOJIS = ['📁', '🏢', '🚀', '⚡', '🎯', '🔬', '💡', '🛠️', '📊', '🌐']
const COLORS = ['acid', 'violet', 'blue', 'amber']

const WORKSPACE_TYPES = [
  { id: 'client',   label: 'Client',   desc: 'Work for an external client' },
  { id: 'feature',  label: 'Feature',  desc: 'Internal product work' },
  { id: 'internal', label: 'Internal', desc: 'Team / ops projects' },
  { id: 'personal', label: 'Personal', desc: 'Solo explorations' },
]

const TARGET_MARKETS = [
  { id: 'smb',        label: 'SMB',        desc: 'Small & mid-size businesses' },
  { id: 'enterprise', label: 'Enterprise', desc: 'Large organisations' },
  { id: 'consumer',   label: 'Consumer',   desc: 'Individual end-users' },
  { id: 'mixed',      label: 'Mixed',      desc: 'Multiple segments' },
]

const REVENUE_MODELS = [
  { id: 'subscription', label: 'Subscription', desc: 'Monthly/annual recurring' },
  { id: 'usage',        label: 'Usage-based',  desc: 'Pay per action/API call' },
  { id: 'one-time',     label: 'One-time',     desc: 'Licence or perpetual' },
  { id: 'hybrid',       label: 'Hybrid',       desc: 'Mix of the above' },
]

const COMPLEXITY_PREFS = [
  { id: 'quick', label: 'Quick wins',   desc: '1–2 weeks to ship' },
  { id: 'mid',   label: 'Balanced',     desc: '3–6 weeks to ship' },
  { id: 'deep',  label: 'Deep builds',  desc: '6+ weeks, full product' },
]

const AGGRESSION_LEVELS = [
  { id: 'conservative', label: 'Conservative', desc: 'Proven models, low risk' },
  { id: 'balanced',     label: 'Balanced',     desc: 'Mix of proven + emerging' },
  { id: 'aggressive',   label: 'Aggressive',   desc: 'Contrarian, high upside' },
]

const COLOR_DOT: Record<string, string> = {
  acid:   'bg-[#c8f135]',
  violet: 'bg-violet-400',
  blue:   'bg-blue-400',
  amber:  'bg-amber-400',
}

const INITIAL: WizardState = {
  name:  '',
  type:  'client',
  emoji: '📁',
  color: 'acid',
  primaryIndustry:       '',
  subcategories:         [],
  targetMarket:          'smb',
  preferredRevenueModel: 'subscription',
  buildComplexityPref:   'mid',
  generationAggression:  'balanced',
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <div className="text-xs font-mono text-ink3 mb-1">STEP {step} OF 4</div>
      <h2 className="text-xl font-bold text-ink1">{title}</h2>
      <p className="text-sm text-ink3 mt-1">{subtitle}</p>
    </div>
  )
}

function OptionCard({
  selected, onClick, label, desc,
}: { selected: boolean; onClick: () => void; label: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-all ${
        selected
          ? 'border-acid bg-acid/10 text-ink1'
          : 'border-border bg-paper2 text-ink2 hover:border-acid/50'
      }`}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-ink3 mt-0.5">{desc}</div>
    </button>
  )
}

// ─── Step 1: Workspace Identity ───────────────────────────────────────────────

function Step1Identity({ state, set }: { state: WizardState; set: (k: keyof WizardState, v: string) => void }) {
  return (
    <>
      <StepHeader step={1} title="Name your workspace" subtitle="Give this workspace a clear name and choose its type." />

      {/* Emoji + name row */}
      <div className="space-y-4">
        <div>
          <label className="sec-label mb-2 block">Pick an icon</label>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map(e => (
              <button
                key={e} type="button"
                onClick={() => set('emoji', e)}
                className={`text-xl p-2 rounded-lg transition-colors ${state.emoji === e ? 'bg-acid/20 ring-1 ring-acid/50' : 'hover:bg-paper2'}`}
              >{e}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="sec-label mb-1 block">Workspace name *</label>
          <input
            value={state.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Acme Corp, Auth Redesign…"
            className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
          />
        </div>

        <div>
          <label className="sec-label mb-2 block">Type</label>
          <div className="grid grid-cols-2 gap-2">
            {WORKSPACE_TYPES.map(t => (
              <OptionCard key={t.id} selected={state.type === t.id} onClick={() => set('type', t.id)} label={t.label} desc={t.desc} />
            ))}
          </div>
        </div>

        <div>
          <label className="sec-label mb-2 block">Colour</label>
          <div className="flex gap-3">
            {COLORS.map(c => (
              <button
                key={c} type="button"
                onClick={() => set('color', c)}
                className={`w-8 h-8 rounded-full ${COLOR_DOT[c]} transition-all ${state.color === c ? 'ring-2 ring-offset-2 ring-ink1' : 'opacity-60 hover:opacity-100'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Step 2: Industry ─────────────────────────────────────────────────────────

function Step2Industry({
  state, set, toggleSubcat,
}: {
  state:        WizardState
  set:          (k: keyof WizardState, v: string) => void
  toggleSubcat: (id: string) => void
}) {
  const selectedNode = INDUSTRY_TAXONOMY.find(n => n.id === state.primaryIndustry)

  return (
    <>
      <StepHeader step={2} title="What industry does this workspace serve?" subtitle="NEXUS will tailor AI-generated ideas to your sector." />

      <div className="space-y-4">
        <div>
          <label className="sec-label mb-2 block">Primary industry</label>
          <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
            {INDUSTRY_TAXONOMY.map(n => (
              <button
                key={n.id} type="button"
                onClick={() => { set('primaryIndustry', n.id) }}
                className={`text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                  state.primaryIndustry === n.id
                    ? 'border-acid bg-acid/10 text-ink1 font-medium'
                    : 'border-border bg-paper2 text-ink2 hover:border-acid/50'
                }`}
              >{n.label}</button>
            ))}
          </div>
        </div>

        {selectedNode && (
          <div>
            <label className="sec-label mb-2 block">Subcategories <span className="text-ink3">(optional — select all that apply)</span></label>
            <div className="flex flex-wrap gap-2">
              {selectedNode.subcategories.map(s => {
                const active = state.subcategories.includes(s.id)
                return (
                  <button
                    key={s.id} type="button"
                    onClick={() => toggleSubcat(s.id)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                      active
                        ? 'border-acid bg-acid/10 text-acid'
                        : 'border-border text-ink3 hover:border-acid/50'
                    }`}
                  >{s.label}</button>
                )
              })}
            </div>
          </div>
        )}

        {!state.primaryIndustry && (
          <p className="text-xs text-ink3 italic">Select an industry to see subcategories.</p>
        )}
      </div>
    </>
  )
}

// ─── Step 3: AI Preferences ───────────────────────────────────────────────────

function Step3Preferences({ state, set }: { state: WizardState; set: (k: keyof WizardState, v: string) => void }) {
  return (
    <>
      <StepHeader step={3} title="Tune your AI feed" subtitle="These preferences shape every idea NEXUS generates for this workspace." />

      <div className="space-y-5">
        <div>
          <label className="sec-label mb-2 block">Target market</label>
          <div className="grid grid-cols-2 gap-2">
            {TARGET_MARKETS.map(t => (
              <OptionCard key={t.id} selected={state.targetMarket === t.id} onClick={() => set('targetMarket', t.id)} label={t.label} desc={t.desc} />
            ))}
          </div>
        </div>

        <div>
          <label className="sec-label mb-2 block">Preferred revenue model</label>
          <div className="grid grid-cols-2 gap-2">
            {REVENUE_MODELS.map(r => (
              <OptionCard key={r.id} selected={state.preferredRevenueModel === r.id} onClick={() => set('preferredRevenueModel', r.id)} label={r.label} desc={r.desc} />
            ))}
          </div>
        </div>

        <div>
          <label className="sec-label mb-2 block">Build complexity preference</label>
          <div className="grid grid-cols-3 gap-2">
            {COMPLEXITY_PREFS.map(c => (
              <OptionCard key={c.id} selected={state.buildComplexityPref === c.id} onClick={() => set('buildComplexityPref', c.id)} label={c.label} desc={c.desc} />
            ))}
          </div>
        </div>

        <div>
          <label className="sec-label mb-2 block">Opportunity style</label>
          <div className="grid grid-cols-3 gap-2">
            {AGGRESSION_LEVELS.map(a => (
              <OptionCard key={a.id} selected={state.generationAggression === a.id} onClick={() => set('generationAggression', a.id)} label={a.label} desc={a.desc} />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Step 4: Launch ───────────────────────────────────────────────────────────

function Step4Launch({ state, generating }: { state: WizardState; generating: boolean }) {
  const industry = INDUSTRY_TAXONOMY.find(n => n.id === state.primaryIndustry)?.label ?? 'your industry'
  return (
    <>
      <StepHeader step={4} title="You're all set!" subtitle="NEXUS will now generate personalised ideas for your workspace." />

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-paper2 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{state.emoji}</span>
            <div>
              <div className="font-semibold text-ink1">{state.name}</div>
              <div className="text-xs text-ink3 capitalize">{state.type} workspace · {industry}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-ink3">Market: </span><span className="text-ink2 capitalize">{state.targetMarket}</span></div>
            <div><span className="text-ink3">Revenue: </span><span className="text-ink2 capitalize">{state.preferredRevenueModel}</span></div>
            <div><span className="text-ink3">Complexity: </span><span className="text-ink2 capitalize">{state.buildComplexityPref}</span></div>
            <div><span className="text-ink3">Style: </span><span className="text-ink2 capitalize">{state.generationAggression}</span></div>
          </div>
        </div>

        {generating ? (
          <div className="rounded-xl border border-acid/30 bg-acid/5 p-4 text-center">
            <div className="text-sm font-medium text-acid animate-pulse">Generating ideas for {state.name}…</div>
            <div className="text-xs text-ink3 mt-1">AI is analysing {industry} opportunities. This takes ~15s.</div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-paper2 p-4">
            <div className="text-sm font-medium text-ink1">What happens next</div>
            <ul className="mt-2 space-y-1.5 text-xs text-ink3">
              <li>✓ Workspace created with your intelligence profile</li>
              <li>✓ AI generates 12 tailored ideas in your industry</li>
              <li>✓ Ideas refresh automatically every 24 hours</li>
              <li>✓ Any trending idea can be sent straight to FORGE</li>
            </ul>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function OnboardingWizard({ onComplete, onCancel }: OnboardingWizardProps) {
  const [step,       setStep]       = useState(1)
  const [state,      setState]      = useState<WizardState>(INITIAL)
  const [saving,     setSaving]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  function set(k: keyof WizardState, v: string) {
    setState(s => ({ ...s, [k]: v }))
  }

  function toggleSubcat(id: string) {
    setState(s => ({
      ...s,
      subcategories: s.subcategories.includes(id)
        ? s.subcategories.filter(x => x !== id)
        : [...s.subcategories, id],
    }))
  }

  function canAdvance(): boolean {
    if (step === 1) return state.name.trim().length >= 2
    if (step === 2) return !!state.primaryIndustry
    return true
  }

  async function handleFinish() {
    if (saving) return
    setSaving(true)
    setError(null)

    try {
      // 1. Create workspace
      const wsRes  = await fetch('/api/workspaces', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:  state.name.trim(),
          type:  state.type,
          emoji: state.emoji,
          color: state.color,
        }),
      })
      const wsJson = await wsRes.json()
      if (!wsJson.ok) throw new Error(wsJson.error ?? 'Failed to create workspace')

      const workspaceId: string = wsJson.data.workspace.id

      // 2. Save intelligence profile
      const profRes  = await fetch(`/api/workspaces/${workspaceId}/intelligence-profile`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryIndustry:       state.primaryIndustry,
          subcategories:         state.subcategories,
          targetMarket:          state.targetMarket,
          preferredRevenueModel: state.preferredRevenueModel,
          buildComplexityPref:   state.buildComplexityPref,
          generationAggression:  state.generationAggression,
        }),
      })
      const profJson = await profRes.json()
      if (!profJson.ok) throw new Error(profJson.error ?? 'Failed to save intelligence profile')

      // 3. Trigger first-run idea generation (non-blocking — shows generating state)
      setGenerating(true)
      fetch(`/api/workspaces/${workspaceId}/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      }).catch(console.error).finally(() => setGenerating(false))

      // 4. Notify parent (don't wait for generation — UX proceeds immediately)
      setTimeout(() => onComplete({ id: workspaceId, name: state.name.trim() }), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  const isLastStep = step === 4

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-paper rounded-2xl border border-border shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-paper2">
          <div
            className="h-full bg-acid transition-all duration-500"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {step === 1 && <Step1Identity state={state} set={set} />}
          {step === 2 && <Step2Industry state={state} set={set} toggleSubcat={toggleSubcat} />}
          {step === 3 && <Step3Preferences state={state} set={set} />}
          {step === 4 && <Step4Launch state={state} generating={generating} />}

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <button
            type="button"
            onClick={step === 1 ? onCancel : () => setStep(s => s - 1)}
            className="text-sm text-ink3 hover:text-ink2 transition-colors"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          <button
            type="button"
            onClick={isLastStep ? handleFinish : () => setStep(s => s + 1)}
            disabled={!canAdvance() || saving}
            className="px-5 py-2 rounded-lg bg-acid text-paper text-sm font-medium transition-all disabled:opacity-40 hover:bg-acid/90"
          >
            {saving ? 'Creating…' : isLastStep ? 'Create workspace & generate ideas →' : 'Continue →'}
          </button>
        </div>
      </div>
    </div>
  )
}
