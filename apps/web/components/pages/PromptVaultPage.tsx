'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { VAULT_DATA } from '@/lib/vaultData'
import { auditEvent } from '@/lib/auditEvent'
import type { VaultItem } from '@nexus-os/shared-types'
import type { PageId } from '@/components/Nav'

interface Props { onNavigate: (page: PageId) => void }

interface VaultVersion {
  id: string
  version: number
  title: string
  content: string
  isActive: boolean
  createdAt: string
}

export default function PromptVaultPage({ onNavigate }: Props) {
  const { data: session } = useSession()
  const plan = (session?.user as { plan?: string } | null)?.plan ?? 'free'
  const canWrite = plan === 'agency' || plan === 'enterprise'

  const [selectedId, setSelectedId]     = useState(VAULT_DATA[0].id)
  const [search, setSearch]             = useState('')
  const [activeVariant, setActiveVariant] = useState('a')
  const [copied, setCopied]             = useState(false)
  const [toast, setToast]               = useState<string | null>(null)
  const [toastKind, setToastKind]       = useState<'ok' | 'err'>('ok')

  // Edit state
  const [editing, setEditing]           = useState(false)
  const [draftContent, setDraftContent] = useState('')
  const [draftTitle, setDraftTitle]     = useState('')
  const [saving, setSaving]             = useState(false)

  // Version history state
  const [versionsOpen, setVersionsOpen]     = useState(false)
  const [versions, setVersions]             = useState<VaultVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [activating, setActivating]         = useState<string | null>(null)

  // Active DB content (may differ from static VAULT_DATA after user edits)
  const [activeContent, setActiveContent]   = useState<Record<string, string>>({})

  const selected = VAULT_DATA.find(v => v.id === selectedId) ?? VAULT_DATA[0]

  // Resolve displayed prompt: use DB active version if one exists, else static
  const displayPrompt = activeContent[selectedId] ?? selected.prompt

  const filtered = VAULT_DATA.filter(v =>
    search === '' ||
    v.title.toLowerCase().includes(search.toLowerCase()) ||
    v.category.toLowerCase().includes(search.toLowerCase())
  )

  // On mount, fetch active DB versions to show real content
  useEffect(() => {
    fetch('/api/vault')
      .then(r => r.json())
      .then(d => {
        if (!d.ok) return
        const map: Record<string, string> = {}
        for (const item of d.data) {
          if (item.hasUserEdits) map[item.id] = item.prompt
        }
        setActiveContent(map)
      })
      .catch(() => {})
  }, [])

  const showToast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast(msg)
    setToastKind(kind)
    setTimeout(() => setToast(null), 3500)
  }, [])

  const handleSelect = useCallback(async (item: VaultItem) => {
    setSelectedId(item.id)
    setActiveVariant('a')
    setEditing(false)
    setVersionsOpen(false)
    setVersions([])
    await auditEvent('vault_view', { vaultId: item.id, title: item.title })
  }, [])

  const handleCopy = useCallback(async () => {
    const variantPrompt = selected.variants.find(v => v.id === activeVariant)?.prompt
    const text = activeVariant === 'a' ? displayPrompt : (variantPrompt ?? displayPrompt)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [selected, activeVariant, displayPrompt])

  const handleLaunchInForge = useCallback(async () => {
    const snippet = `[VAULT: ${selected.title}]\n\n${displayPrompt.slice(0, 400)}`
    sessionStorage.setItem('nexus-forge-prefill', snippet)
    await auditEvent('vault_launch_forge', { vaultId: selected.id, title: selected.title })
    onNavigate('forge')
  }, [selected, displayPrompt, onNavigate])

  // ── Edit handlers ────────────────────────────────────────────────────────────
  const handleEditOpen = useCallback(() => {
    if (!canWrite) {
      showToast('Vault editing requires Agency plan ($199/mo). Upgrade at nexus-os.ai/pricing.', 'err')
      return
    }
    setDraftContent(displayPrompt)
    setDraftTitle(selected.title)
    setEditing(true)
    setVersionsOpen(false)
  }, [canWrite, displayPrompt, selected.title, showToast])

  const handleEditCancel = useCallback(() => {
    setEditing(false)
    setDraftContent('')
    setDraftTitle('')
  }, [])

  const handleSave = useCallback(async () => {
    if (!draftContent.trim()) {
      showToast('Prompt content cannot be empty.', 'err')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultItemId: selected.id,
          content: draftContent.trim(),
          title: draftTitle.trim() || selected.title,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        showToast(data.error ?? 'Save failed.', 'err')
        return
      }
      // Update local active content so the UI reflects the new version immediately
      setActiveContent(prev => ({ ...prev, [selected.id]: draftContent.trim() }))
      setEditing(false)
      showToast(`Saved as version ${data.data.version}. Active version updated.`)
      await auditEvent('vault_prompt_saved', { vaultId: selected.id, version: data.data.version })
      // Refresh version history if it was open
      if (versionsOpen) loadVersions(selected.id)
    } catch {
      showToast('Network error — please try again.', 'err')
    } finally {
      setSaving(false)
    }
  }, [draftContent, draftTitle, selected, versionsOpen, showToast])

  // ── Version history ──────────────────────────────────────────────────────────
  const loadVersions = useCallback(async (vaultItemId: string) => {
    setVersionsLoading(true)
    try {
      const res = await fetch(`/api/vault?id=${encodeURIComponent(vaultItemId)}`)
      const data = await res.json()
      if (data.ok) setVersions(data.data.versions ?? [])
    } catch {
      showToast('Failed to load version history.', 'err')
    } finally {
      setVersionsLoading(false)
    }
  }, [showToast])

  const handleVersionsToggle = useCallback(async () => {
    if (!canWrite) {
      showToast('Version history requires Agency plan.', 'err')
      return
    }
    if (!versionsOpen) {
      setVersionsOpen(true)
      setEditing(false)
      await loadVersions(selected.id)
    } else {
      setVersionsOpen(false)
      setVersions([])
    }
  }, [canWrite, versionsOpen, selected.id, loadVersions, showToast])

  const handleActivateVersion = useCallback(async (versionId: string, versionNum: number) => {
    setActivating(versionId)
    try {
      const res = await fetch('/api/vault', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: versionId, isActive: true }),
      })
      const data = await res.json()
      if (!data.ok) {
        showToast(data.error ?? 'Activation failed.', 'err')
        return
      }
      // Update local active content from the activated version's content
      const activated = versions.find(v => v.id === versionId)
      if (activated) {
        setActiveContent(prev => ({ ...prev, [selected.id]: activated.content }))
      }
      // Refresh version list to update isActive flags
      await loadVersions(selected.id)
      showToast(`Version ${versionNum} is now active.`)
    } catch {
      showToast('Network error — please try again.', 'err')
    } finally {
      setActivating(null)
    }
  }, [versions, selected.id, loadVersions, showToast])

  const overallScore = selected.scoring.find(s => s.label === 'Overall')?.score ?? 0
  const hasUserEdits = Boolean(activeContent[selectedId])

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="sec-label mb-2">Prompt Vault</p>
          <h2 className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>
            Production Prompt Library
          </h2>
          <p className="text-sm text-ink3 mt-2">8 scored, validated prompts with A/B variants and gap analysis.</p>
        </div>
        {!canWrite && (
          <div className="flex items-center gap-2 text-xs text-ink3 border border-border rounded-lg px-3 py-2">
            <span>◐</span>
            <span>Read-only — <button className="underline hover:text-ink" onClick={() => onNavigate('pricing')}>upgrade to Agency</button> to edit</span>
          </div>
        )}
      </div>

      <div className="flex gap-6 min-h-[700px]">
        {/* ─── Sidebar ─── */}
        <div className="w-64 flex-shrink-0 space-y-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vault…"
            className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
          />
          <div className="space-y-1">
            {filtered.map(item => {
              const hasEdits = Boolean(activeContent[item.id])
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                    item.id === selectedId
                      ? 'border-acid bg-acid/5 text-ink'
                      : 'border-transparent hover:border-border hover:bg-paper2 text-ink3'
                  }`}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-xs font-semibold line-clamp-1 leading-snug flex-1">{item.title}</span>
                    {hasEdits && <span className="chip acid text-[9px] px-1 flex-shrink-0">Edited</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="chip text-[10px]">{item.category}</span>
                    <span className="text-[10px] font-mono text-green ml-auto">
                      {(item.scoring.find(s => s.label === 'Overall')?.score ?? 0).toFixed(1)}/10
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── Detail panel ─── */}
        <div className="flex-1 min-w-0 space-y-6 animate-fadein">
          {/* Header */}
          <div className="card">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold leading-tight">{selected.title}</h3>
                  {hasUserEdits && <span className="chip acid text-xs">Custom version active</span>}
                </div>
                <p className="text-sm text-ink3 mt-1">{selected.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="chip ok">{overallScore.toFixed(1)}/10</span>
                <span className="chip">{selected.category}</span>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleLaunchInForge} className="btn btn-primary text-sm py-1.5">
                ⚡ Launch in FORGE →
              </button>
              <button onClick={handleCopy} className="btn btn-ghost text-sm py-1.5">
                {copied ? '✓ Copied' : 'Copy Prompt'}
              </button>
              <button
                onClick={handleEditOpen}
                className={`btn text-sm py-1.5 ${canWrite ? 'btn-ghost border-acid/40 text-acid hover:bg-acid/5' : 'btn-ghost opacity-50'}`}
              >
                {canWrite ? (editing ? '✕ Cancel Edit' : '✎ Edit Prompt') : '⊘ Edit (Agency+)'}
              </button>
              {canWrite && (
                <button
                  onClick={handleVersionsToggle}
                  className={`btn text-sm py-1.5 ${versionsOpen ? 'btn-ghost border-border' : 'btn-ghost'}`}
                >
                  {versionsOpen ? 'Hide History' : `◎ Version History`}
                </button>
              )}
            </div>
          </div>

          {/* ── Edit panel ── */}
          {editing && (
            <div className="card border-acid/30 bg-acid/5 space-y-4 animate-fadein">
              <div className="flex items-center justify-between">
                <p className="sec-label">Editing Prompt</p>
                <span className="text-xs text-ink3">{draftContent.length} chars</span>
              </div>

              <div>
                <label className="text-xs text-ink3 mb-1 block">Title</label>
                <input
                  value={draftTitle}
                  onChange={e => setDraftTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
                  placeholder="Prompt title…"
                />
              </div>

              <div>
                <label className="text-xs text-ink3 mb-1 block">Prompt content</label>
                <textarea
                  value={draftContent}
                  onChange={e => setDraftContent(e.target.value)}
                  rows={16}
                  className="w-full px-3 py-3 rounded-lg text-sm font-mono border border-border bg-paper leading-relaxed outline-none focus:border-acid resize-y"
                  placeholder="Enter your prompt here…"
                  spellCheck={false}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving || !draftContent.trim()}
                  className="btn btn-primary text-sm py-1.5 disabled:opacity-50"
                >
                  {saving ? '⟳ Saving…' : '✓ Save as New Version'}
                </button>
                <button onClick={handleEditCancel} className="btn btn-ghost text-sm py-1.5">
                  Cancel
                </button>
                <span className="text-xs text-ink3 ml-auto">
                  Saves as a new version — previous version preserved
                </span>
              </div>
            </div>
          )}

          {/* ── Version history ── */}
          {versionsOpen && (
            <div className="card space-y-4 animate-fadein">
              <p className="sec-label">Version History — {selected.title}</p>
              {versionsLoading ? (
                <div className="text-sm text-ink3 py-4 text-center">Loading versions…</div>
              ) : versions.length === 0 ? (
                <div className="text-sm text-ink3 py-4 text-center">
                  No saved versions yet. Edit the prompt above to create version 1.
                </div>
              ) : (
                <div className="space-y-3">
                  {versions.map(v => (
                    <div
                      key={v.id}
                      className={`rounded-lg border p-4 transition-colors ${
                        v.isActive ? 'border-acid bg-acid/5' : 'border-border bg-paper2'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold">v{v.version}</span>
                          <span className="text-xs text-ink3">{v.title}</span>
                          {v.isActive && <span className="chip acid text-[10px]">Active</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-ink3">
                            {new Date(v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {!v.isActive && (
                            <button
                              onClick={() => handleActivateVersion(v.id, v.version)}
                              disabled={activating === v.id}
                              className="btn btn-ghost text-xs py-1 disabled:opacity-50"
                            >
                              {activating === v.id ? '⟳' : 'Activate'}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="prompt-block text-xs max-h-24 overflow-y-auto opacity-70">
                        {v.content.slice(0, 300)}{v.content.length > 300 ? '…' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Scoring table */}
          <div className="card">
            <p className="sec-label mb-4">Quality Scoring</p>
            <div className="space-y-3">
              {selected.scoring.map(dim => (
                <div key={dim.label} className="flex items-center gap-3">
                  <span className="text-xs w-44 text-ink3 flex-shrink-0">{dim.label}</span>
                  <div className="flex-1 score-bar-wrap h-1.5">
                    <div className="score-bar-fill" style={{ width: `${(dim.score / dim.max) * 100}%` }} />
                  </div>
                  <span className={`text-xs font-mono w-12 text-right ${
                    dim.label === 'Overall' ? 'font-bold text-green' : 'text-ink3'
                  }`}>{dim.score.toFixed(1)}/{dim.max}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Gaps */}
          {selected.gaps.length > 0 && (
            <div className="card">
              <p className="sec-label mb-3">Identified Gaps</p>
              <ul className="space-y-2">
                {selected.gaps.map((gap, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="chip warn flex-shrink-0">Gap</span>
                    <span className="text-ink3">{gap}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Prompt with A/B tabs */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="sec-label">Prompt</p>
                {hasUserEdits && !editing && (
                  <span className="text-xs text-ink3">(showing your custom version)</span>
                )}
              </div>
              <div className="flex border border-border rounded-lg overflow-hidden">
                {[{ id: 'a', label: 'Base' }, ...selected.variants.map(v => ({ id: v.id, label: v.label.split('—')[0].trim() }))].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveVariant(tab.id)}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      activeVariant === tab.id
                        ? 'bg-acid text-ink2'
                        : 'text-ink3 hover:bg-paper3'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {activeVariant === 'a' ? (
              <div className="prompt-block max-h-80 overflow-y-auto">{displayPrompt}</div>
            ) : (
              <div className="space-y-3">
                {selected.variants.filter(v => v.id === activeVariant).map(v => (
                  <div key={v.id}>
                    <p className="text-xs font-semibold mb-2">{v.label}</p>
                    <div className="prompt-block max-h-80 overflow-y-auto">{v.prompt}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm shadow-lg animate-fadein border max-w-sm ${
          toastKind === 'err'
            ? 'bg-paper2 border-red-500/40 text-red-400'
            : 'bg-paper2 border-acid/40 text-ink'
        }`}>
          {toast}
        </div>
      )}
    </div>
  )
}
