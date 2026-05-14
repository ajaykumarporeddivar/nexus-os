'use client'

import { useState } from 'react'
import { useWorkspace, type Workspace } from '@/lib/workspaceContext'
import dynamic from 'next/dynamic'

const OnboardingWizard = dynamic(() => import('@/components/OnboardingWizard'), { ssr: false })

const TYPES    = ['client', 'feature', 'internal', 'personal'] as const
const COLORS   = ['acid', 'violet', 'blue', 'amber', 'red', 'default'] as const
const EMOJIS   = ['📁', '🏢', '🚀', '⚡', '🎯', '🔬', '💡', '🛠️', '📊', '🌐']

const COLOR_CLASSES: Record<string, string> = {
  acid:    'bg-acid/10 text-acid border-acid/30',
  violet:  'bg-violet-500/10 text-violet-400 border-violet-500/30',
  blue:    'bg-blue-500/10 text-blue-400 border-blue-500/30',
  amber:   'bg-amber-500/10 text-amber-400 border-amber-500/30',
  red:     'bg-red-500/10 text-red-400 border-red-500/30',
  default: 'bg-paper3 text-ink3 border-border',
}

const TYPE_LABELS: Record<string, string> = {
  client:   'Client',
  feature:  'Feature',
  internal: 'Internal',
  personal: 'Personal',
}

const EMPTY_FORM = { name: '', type: 'client' as string, description: '', context: '', emoji: '📁', color: 'acid' }

function WorkspaceForm({
  initial, onSave, onCancel, saving,
}: {
  initial: typeof EMPTY_FORM
  onSave: (d: typeof EMPTY_FORM) => Promise<void>
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState(initial)
  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => set('emoji', e)}
              className={`text-xl p-1.5 rounded-lg transition-colors ${form.emoji === e ? 'bg-acid/20 ring-1 ring-acid/50' : 'hover:bg-paper2'}`}
            >{e}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="sec-label mb-1 block">Workspace name *</label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Acme Corp, Auth Redesign…"
            className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
          />
        </div>

        <div>
          <label className="sec-label mb-1 block">Type</label>
          <select
            value={form.type}
            onChange={e => set('type', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
          >
            {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        <div>
          <label className="sec-label mb-1 block">Color tag</label>
          <div className="flex gap-2 flex-wrap pt-1">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => set('color', c)}
                aria-label={c}
                className={`px-2 py-0.5 rounded text-[10px] border-2 transition-all font-mono ${COLOR_CLASSES[c]} ${form.color === c ? 'ring-2 ring-offset-1 ring-ink/30 font-bold' : ''}`}
              >{c}</button>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <label className="sec-label mb-1 block">Description</label>
          <input
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="One-line summary of this workspace…"
            className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
          />
        </div>

        <div className="col-span-2">
          <label className="sec-label mb-1 block">Project context</label>
          <p className="text-[10px] text-ink3 mb-1">This gets auto-injected into every FORGE run and Reasoning Engine session in this workspace.</p>
          <textarea
            value={form.context}
            onChange={e => set('context', e.target.value)}
            rows={4}
            placeholder={`What are we building?\nWho are the users?\nCurrent stage / key challenge?\nTech stack or constraints?`}
            className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid resize-none font-mono"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn btn-ghost text-xs">Cancel</button>
        <button
          onClick={() => onSave(form)}
          disabled={!form.name.trim() || saving}
          className="btn btn-primary text-xs disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save workspace'}
        </button>
      </div>
    </div>
  )
}

export default function WorkspacesPage() {
  const { workspaces, active, setActive, createWorkspace, updateWorkspace, deleteWorkspace, isLoading, refresh } = useWorkspace()
  const [creating,    setCreating]    = useState(false)
  const [wizardOpen,  setWizardOpen]  = useState(false)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const handleCreate = async (form: typeof EMPTY_FORM) => {
    setSaving(true); setError('')
    try {
      const w = await createWorkspace(form)
      setActive(w)
      setCreating(false)
    } catch (e) {
      setError((e as Error).message)
    } finally { setSaving(false) }
  }

  const handleWizardComplete = async (ws: { id: string; name: string }) => {
    setWizardOpen(false)
    // Refresh workspace list so newly created workspace appears immediately
    await refresh()
  }

  const handleUpdate = async (id: string, form: typeof EMPTY_FORM) => {
    setSaving(true); setError('')
    try {
      await updateWorkspace(id, form)
      setEditingId(null)
    } catch (e) {
      setError((e as Error).message)
    } finally { setSaving(false) }
  }

  const handleDelete = async (w: Workspace) => {
    if (!confirm(`Delete workspace "${w.name}"? Builds tagged to it will be unlinked.`)) return
    try { await deleteWorkspace(w.id) } catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      {wizardOpen && (
        <OnboardingWizard
          onComplete={handleWizardComplete}
          onCancel={() => setWizardOpen(false)}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="sec-label mb-1">Workspaces</p>
          <h2 className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>Manage folders</h2>
          <p className="text-sm text-ink3 mt-1">Organise clients, features, and projects. Active workspace context flows into every AI tool.</p>
        </div>
        {!creating && (
          <button onClick={() => setWizardOpen(true)} className="btn btn-primary text-sm">
            + New workspace
          </button>
        )}
      </div>

      {error && <div className="panel border-red-400/30 bg-red-400/5 px-4 py-2 text-xs text-red-400">{error}</div>}

      {creating && (
        <WorkspaceForm
          initial={EMPTY_FORM}
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
          saving={saving}
        />
      )}

      {isLoading ? (
        <div className="text-sm text-ink3 animate-pulse">Loading workspaces…</div>
      ) : workspaces.length === 0 && !creating ? (
        <div className="space-y-4">
          <div className="card text-center py-10 space-y-2">
            <p className="text-4xl">📁</p>
            <p className="text-sm font-medium">No workspaces yet</p>
            <p className="text-xs text-ink3">Choose a starter template or create from scratch.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { emoji: '🏢', name: 'Client Project', type: 'client', color: 'acid', description: 'Billable client work', context: 'This is a billable client project. Deliverables should be production-ready with clear documentation.' },
              { emoji: '🚀', name: 'Product Feature', type: 'feature', color: 'violet', description: 'Internal product build', context: 'Internal product feature. Prioritise speed, testing coverage, and clean API contracts.' },
              { emoji: '⚡', name: 'Freelance Gig', type: 'personal', color: 'amber', description: 'Solo freelance project', context: 'Solo freelance work. Focus on deliverability and clear client communication.' },
            ].map(tpl => (
              <button
                key={tpl.name}
                onClick={() => setWizardOpen(true)}
                className="card text-left hover:border-acid/40 hover:bg-acid/3 transition-all group"
              >
                <p className="text-2xl mb-2">{tpl.emoji}</p>
                <p className="text-sm font-semibold group-hover:text-acid transition-colors">{tpl.name}</p>
                <p className="text-xs text-ink3">{tpl.description}</p>
              </button>
            ))}
          </div>
          <div className="text-center">
            <button onClick={() => setWizardOpen(true)} className="btn btn-primary text-xs">+ Create from scratch</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {workspaces.map(w => (
            <div key={w.id}>
              {editingId === w.id ? (
                <WorkspaceForm
                  initial={{ name: w.name, type: w.type, description: w.description ?? '', context: w.context ?? '', emoji: w.emoji, color: w.color }}
                  onSave={form => handleUpdate(w.id, form)}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
              ) : (
                <div className={`card flex items-start gap-4 transition-all ${active?.id === w.id ? 'border-l-4 border-l-acid border-acid/30 bg-acid/3' : ''}`}>
                  <div className="text-2xl select-none">{w.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-semibold font-mono text-sm">{w.name}</span>
                      <span className={`chip text-[10px] border ${COLOR_CLASSES[w.color] ?? COLOR_CLASSES.default}`}>{TYPE_LABELS[w.type]}</span>
                      {active?.id === w.id && <span className="chip acid text-[10px] font-bold">◉ ACTIVE</span>}
                    </div>
                    {w.description && <p className="text-xs text-ink3 mb-1">{w.description}</p>}
                    {w.context && (
                      <p className="text-[10px] text-ink3 font-mono bg-paper2 rounded px-2 py-1 line-clamp-2 mt-1">{w.context}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {active?.id !== w.id && (
                      <button onClick={() => setActive(w)} className="btn btn-ghost text-xs py-1 px-2">
                        Set active
                      </button>
                    )}
                    <button onClick={() => setEditingId(w.id)} className="btn btn-ghost text-xs py-1 px-2">Edit</button>
                    <button onClick={() => handleDelete(w)} className="btn btn-ghost text-xs py-1 px-2 text-red-400">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
