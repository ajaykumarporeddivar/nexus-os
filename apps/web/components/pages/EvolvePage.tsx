'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectVersion {
  version:      number
  repoUrl:      string
  deployUrl:    string
  files:        Record<string, string>
  changedFiles?: string[]
  feedback?:    string
  summary?:     string
  deployedAt:   string
}

export interface EvolvableProject {
  id:         string
  name:       string
  brief:      string
  score:      number | null
  versions:   ProjectVersion[]
  createdAt:  string
}

const STORAGE_KEY = 'nexus_deployed_projects'

function loadProjects(): EvolvableProject[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch { return [] }
}

function saveProjects(projects: EvolvableProject[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)) } catch { /* quota */ }
}

// ─── Step indicator ───────────────────────────────────────────────────────────

type EvolvePhase = 'idle' | 'ai' | 'github' | 'vercel' | 'done' | 'error'

function PhaseRow({ label, phase, active, done, err }: {
  label: string; phase: EvolvePhase; active: EvolvePhase
  done: boolean; err: boolean
}) {
  const isActive = active === phase
  return (
    <div className={`flex items-center gap-2.5 text-[11px] font-mono transition-all ${
      err     ? 'text-red-500'   :
      done    ? 'text-green-600' :
      isActive ? 'text-acid animate-pulse' :
                 'text-ink3/50'
    }`}>
      <span className="w-4 text-center flex-shrink-0">
        {err ? '✗' : done ? '✓' : isActive ? '▸' : '○'}
      </span>
      {label}
    </div>
  )
}

// ─── Version pill ─────────────────────────────────────────────────────────────

function VersionPill({
  v, isCurrent, onClick,
}: { v: ProjectVersion; isCurrent: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black font-mono transition-all flex-shrink-0 ${
        isCurrent
          ? 'border-acid/60 bg-acid/10 text-ink shadow-[0_0_10px_2px_rgba(200,242,60,0.15)]'
          : 'border-border text-ink3 hover:border-ink/20 hover:text-ink'
      }`}
    >
      v{v.version}
      {v.deployUrl && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isCurrent ? 'bg-acid' : 'bg-border2'}`} />
      )}
    </button>
  )
}

// ─── Version connector ────────────────────────────────────────────────────────

function VersionArrow() {
  return <span className="text-ink3/30 text-xs flex-shrink-0 select-none">→</span>
}

// ─── Project card (sidebar) ───────────────────────────────────────────────────

function ProjectCard({
  project, isActive, onClick,
}: { project: EvolvableProject; isActive: boolean; onClick: () => void }) {
  const latest  = project.versions[project.versions.length - 1]
  const vCount  = project.versions.length
  return (
    <button
      onClick={onClick}
      className={`w-full text-left border rounded-xl p-3 transition-all ${
        isActive ? 'border-ink/25 bg-ink/4' : 'border-border bg-paper hover:border-ink/15'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-[12px] font-bold text-ink truncate leading-tight">{project.name.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</p>
        <span className="text-[9px] font-black font-mono text-ink3 flex-shrink-0 border border-border rounded px-1.5 py-0.5">
          v{vCount}
        </span>
      </div>
      <p className="text-[10px] text-ink3 truncate leading-tight">{project.brief.slice(0,80)}</p>
      {latest?.deployUrl && (
        <p className="text-[9px] font-mono text-ink3/60 mt-1 truncate">{latest.deployUrl.replace('https://','')}</p>
      )}
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EvolvePage() {
  const { data: session } = useSession()
  const sessionId   = (session?.user as { id?: string } | null)?.id ?? 'anon'

  const [projects,        setProjectsState] = useState<EvolvableProject[]>([])
  const [selectedId,      setSelectedId]    = useState<string | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<number>(1)

  // Feedback
  const [feedback,    setFeedback]    = useState('')
  const [apiKey,      setApiKey]      = useState('')

  // Evolution progress
  const [phase,       setPhase]       = useState<EvolvePhase>('idle')
  const [phaseError,  setPhaseError]  = useState('')
  const [logLines,    setLogLines]    = useState<string[]>([])
  const [evolvedUrl,  setEvolvedUrl]  = useState('')

  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setProjectsState(loadProjects())
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logLines])

  const log = useCallback((msg: string, type: 'info'|'ok'|'warn'|'err' = 'info') => {
    const ts     = new Date().toLocaleTimeString('en', { hour12: false })
    const prefix = type==='ok' ? '[✓]' : type==='warn' ? '[⚠]' : type==='err' ? '[✗]' : '[→]'
    setLogLines(ls => [...ls, `${ts} ${prefix} ${msg}`])
  }, [])

  const selected = projects.find(p => p.id === selectedId) ?? null
  const viewVersion = selected?.versions.find(v => v.version === selectedVersion) ?? selected?.versions[selected.versions.length - 1] ?? null
  const latestVersion = selected ? selected.versions[selected.versions.length - 1] : null

  const handleSelectProject = useCallback((id: string) => {
    setSelectedId(id)
    const p = projects.find(x => x.id === id)
    if (p) setSelectedVersion(p.versions[p.versions.length - 1]?.version ?? 1)
    setFeedback('')
    setPhase('idle')
    setPhaseError('')
    setLogLines([])
    setEvolvedUrl('')
  }, [projects])

  // ── Delete project ───────────────────────────────────────────────────────────

  const deleteProject = useCallback((id: string) => {
    if (!confirm('Remove this project from the Evolution Hub?')) return
    const next = projects.filter(p => p.id !== id)
    setProjectsState(next)
    saveProjects(next)
    if (selectedId === id) { setSelectedId(null); setSelectedVersion(1) }
  }, [projects, selectedId])

  // ── Full evolve flow ─────────────────────────────────────────────────────────

  const evolve = useCallback(async () => {
    if (!selected || !latestVersion || !feedback.trim() || phase !== 'idle') return

    setPhase('ai')
    setPhaseError('')
    setLogLines([])
    setEvolvedUrl('')

    const currentFiles = latestVersion.files
    const nextVer      = latestVersion.version + 1

    log(`Evolving ${selected.name} → v${nextVer}`)
    log(`Analyzing feedback: "${feedback.slice(0, 80)}${feedback.length > 80 ? '…' : ''}"`)

    try {
      // ── Step 1: Claude generates changed files ────────────────────────────
      log('Running Evolution Agent (Claude)…')
      const evoRes  = await fetch('/api/projects/evolve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
        body:    JSON.stringify({
          projectName:    selected.name,
          brief:          selected.brief,
          feedback:       feedback.trim(),
          currentVersion: latestVersion.version,
          files:          currentFiles,
          apiKey:         apiKey || undefined,
        }),
      })
      const evoData = await evoRes.json()
      if (!evoData.ok) throw new Error(`Evolution Agent: ${evoData.error}`)

      const { changedFiles, filesChanged, summary } = evoData.data as {
        changedFiles:  Record<string, string>
        filesChanged:  string[]
        summary:       string
      }
      log(`✓ ${filesChanged.length} files changed — ${summary}`, 'ok')
      filesChanged.slice(0, 5).forEach(f => log(`  · ${f}`))
      if (filesChanged.length > 5) log(`  · …and ${filesChanged.length - 5} more`)

      // Merge changed files into full codebase
      const mergedFiles: Record<string, string> = { ...currentFiles, ...changedFiles }

      // ── Step 2: Push to GitHub ────────────────────────────────────────────
      setPhase('github')
      const repoSlug = selected.name.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').slice(0,60)
      log('Pushing evolved codebase to GitHub…')

      const ghRes  = await fetch('/api/deploy/github', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          repoName:    `${repoSlug}-app`,
          files:       mergedFiles,
          isPrivate:   false,
          description: `${selected.name} v${nextVer} — evolved by NEXUS OS · feedback: "${feedback.slice(0,100)}"`,
        }),
      })
      const ghData = await ghRes.json()
      const newRepoUrl = ghData.ok ? ghData.data.repoUrl : latestVersion.repoUrl
      if (ghData.ok) {
        log(`✓ GitHub: ${ghData.data.files} files on ${ghData.data.branch}`, 'ok')
      } else {
        log(`⚠ GitHub: ${ghData.error} — reusing existing repo`, 'warn')
      }

      // ── Step 3: Deploy to Vercel ──────────────────────────────────────────
      setPhase('vercel')
      log('Deploying v' + nextVer + ' to Vercel…')

      const vrclRes  = await fetch('/api/deploy/vercel-app', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectName: repoSlug, files: mergedFiles }),
      })
      const vrclData = await vrclRes.json()
      const newDeployUrl = vrclData.ok ? vrclData.data.deployUrl : ''
      if (vrclData.ok) {
        log(`✓ Vercel: ${vrclData.data.deployUrl} — ${vrclData.data.state}`, 'ok')
        setEvolvedUrl(vrclData.data.deployUrl)
      } else {
        log(`⚠ Vercel: ${vrclData.error}`, 'warn')
      }

      // ── Step 4: Save new version ──────────────────────────────────────────
      const newVersion: ProjectVersion = {
        version:      nextVer,
        repoUrl:      newRepoUrl,
        deployUrl:    newDeployUrl || `${latestVersion.deployUrl}?v=${nextVer}`,
        files:        mergedFiles,
        changedFiles: filesChanged,
        feedback:     feedback.trim(),
        summary,
        deployedAt:   new Date().toISOString(),
      }

      const updatedProjects = projects.map(p =>
        p.id === selected.id
          ? { ...p, versions: [...p.versions, newVersion] }
          : p,
      )
      setProjectsState(updatedProjects)
      saveProjects(updatedProjects)
      setSelectedVersion(nextVer)
      setFeedback('')
      setPhase('done')
      log(`Evolution to v${nextVer} complete`, 'ok')

    } catch (err) {
      const msg = (err as Error).message
      setPhaseError(msg)
      setPhase('error')
      log(msg, 'err')
    }
  }, [selected, latestVersion, feedback, apiKey, phase, projects, sessionId, log])

  const isEvolving = phase === 'ai' || phase === 'github' || phase === 'vercel'

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-screen">

      {/* Header */}
      <div className="border-b border-border bg-paper px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-[10px] font-black font-mono tracking-widest text-ink3 uppercase">Evolution Hub</p>
          <p className="text-sm font-bold text-ink">Client feedback → AI changes → redeploy → next version</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-ink3">
          <span>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{projects.reduce((a, p) => a + p.versions.length, 0)} total versions</span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: project list ──────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 border-r border-border bg-paper2 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border flex-shrink-0">
            <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Deployed Projects</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {projects.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <div className="w-12 h-12 rounded-xl border border-border bg-paper flex items-center justify-center text-xl mx-auto">⚡</div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-ink3">No projects yet</p>
                  <p className="text-[10px] text-ink3/70 leading-relaxed">Run BUILD ENGINE and click<br/>"Publish — GitHub + Vercel"<br/>to create your first project</p>
                </div>
              </div>
            ) : (
              projects.map(p => (
                <div key={p.id} className="group relative">
                  <ProjectCard
                    project={p}
                    isActive={selectedId === p.id}
                    onClick={() => handleSelectProject(p.id)}
                  />
                  <button
                    onClick={() => deleteProject(p.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-ink3/50 hover:text-red-500 text-xs transition-all"
                    title="Remove project"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          {/* API key */}
          <div className="p-3 border-t border-border flex-shrink-0 space-y-1.5">
            <p className="text-[9px] font-mono text-ink3">API Key (optional)</p>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-… or uses server key"
              className="w-full bg-paper border border-border rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-ink placeholder:text-ink3 focus:outline-none focus:border-ink/30"
            />
          </div>
        </div>

        {/* ── Right: project detail ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

          {!selected ? (
            /* Empty state */
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-sm space-y-4">
                <div className="w-16 h-16 rounded-2xl border border-border bg-paper3 flex items-center justify-center text-3xl mx-auto">↻</div>
                <h2 className="text-lg font-bold text-ink">Select a project to evolve</h2>
                <p className="text-sm text-ink3 leading-relaxed">
                  Every deployed project lives here. Paste client feedback, hit Evolve,
                  and the AI makes targeted changes — then redeploys automatically.
                </p>
                <div className="grid grid-cols-3 gap-2 text-left mt-6">
                  {[
                    { icon: '▸', label: 'AI diff gen' },
                    { icon: '↑', label: 'GitHub push' },
                    { icon: '▲', label: 'Vercel deploy' },
                  ].map(({ icon, label }) => (
                    <div key={label} className="flex items-center gap-1.5 p-2 border border-border rounded-lg bg-paper2">
                      <span className="text-sm font-mono">{icon}</span>
                      <span className="text-[9px] font-mono text-ink3">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6 max-w-3xl">

              {/* Project header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-ink tracking-tight">
                    {selected.name.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
                  </h2>
                  <p className="text-sm text-ink3 mt-0.5 leading-relaxed max-w-lg">{selected.brief.slice(0,200)}</p>
                </div>
                {selected.score !== null && (
                  <div className={`flex-shrink-0 border rounded-xl px-3 py-2 text-center ${selected.score >= 8 ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                    <p className={`text-lg font-black font-mono ${selected.score >= 8 ? 'text-green-700' : 'text-amber-700'}`}>{selected.score.toFixed(1)}</p>
                    <p className="text-[9px] font-mono text-ink3 uppercase">QA Score</p>
                  </div>
                )}
              </div>

              {/* Version timeline */}
              <div className="border border-border rounded-2xl bg-paper overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Version Timeline</p>
                  <p className="text-[9px] font-mono text-ink3">{selected.versions.length} version{selected.versions.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selected.versions.map((v, i) => (
                      <div key={v.version} className="flex items-center gap-2">
                        <VersionPill
                          v={v}
                          isCurrent={selectedVersion === v.version}
                          onClick={() => setSelectedVersion(v.version)}
                        />
                        {i < selected.versions.length - 1 && <VersionArrow />}
                      </div>
                    ))}
                    {phase === 'done' || isEvolving ? null : (
                      <div className="flex items-center gap-2">
                        <VersionArrow />
                        <div className="px-3 py-1.5 rounded-full border border-dashed border-border text-[10px] font-mono text-ink3/50">
                          v{(latestVersion?.version ?? 0) + 1}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Selected version detail */}
                  {viewVersion && (
                    <div className="mt-4 p-4 bg-paper2 rounded-xl border border-border space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black font-mono text-ink3 uppercase border border-border rounded px-1.5 py-0.5">
                            v{viewVersion.version}
                          </span>
                          <span className="text-[10px] text-ink3">
                            {new Date(viewVersion.deployedAt).toLocaleDateString('en', { month:'short', day:'numeric', year:'numeric' })}
                          </span>
                          {viewVersion.version === latestVersion?.version && (
                            <span className="text-[9px] font-black font-mono text-green-600 border border-green-200 bg-green-50 rounded px-1.5 py-0.5">LIVE</span>
                          )}
                        </div>
                        {viewVersion.changedFiles && (
                          <span className="text-[9px] font-mono text-ink3">{viewVersion.changedFiles.length} files changed</span>
                        )}
                      </div>

                      {viewVersion.feedback && (
                        <div>
                          <p className="text-[9px] font-black font-mono text-ink3 uppercase tracking-widest mb-1">Feedback that triggered this version</p>
                          <p className="text-[11px] text-ink2 leading-relaxed italic">"{viewVersion.feedback.slice(0, 200)}"</p>
                        </div>
                      )}

                      {viewVersion.summary && (
                        <div>
                          <p className="text-[9px] font-black font-mono text-ink3 uppercase tracking-widest mb-1">What changed</p>
                          <p className="text-[11px] text-ink2">{viewVersion.summary}</p>
                        </div>
                      )}

                      {viewVersion.changedFiles && viewVersion.changedFiles.length > 0 && (
                        <div>
                          <p className="text-[9px] font-black font-mono text-ink3 uppercase tracking-widest mb-1.5">Modified files</p>
                          <div className="flex flex-wrap gap-1">
                            {viewVersion.changedFiles.slice(0, 12).map(f => (
                              <span key={f} className="text-[9px] font-mono text-ink3 bg-paper border border-border rounded px-1.5 py-0.5 truncate max-w-[200px]">{f}</span>
                            ))}
                            {viewVersion.changedFiles.length > 12 && (
                              <span className="text-[9px] font-mono text-ink3/50">+{viewVersion.changedFiles.length - 12} more</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Live URL row */}
                      {viewVersion.deployUrl && (
                        <div className="flex items-center gap-2 pt-1">
                          <div className="flex-1 min-w-0 bg-paper border border-border rounded-lg px-3 py-2 flex items-center gap-2">
                            <span className="text-[10px] font-mono text-ink3 truncate flex-1">{viewVersion.deployUrl}</span>
                            <button
                              onClick={() => navigator.clipboard.writeText(viewVersion.deployUrl)}
                              className="text-[9px] font-mono text-ink3 hover:text-ink border border-border rounded px-1.5 py-0.5 flex-shrink-0 transition-colors"
                            >
                              Copy
                            </button>
                          </div>
                          <a
                            href={viewVersion.deployUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-paper text-[11px] font-bold text-ink hover:border-ink/30 hover:bg-paper3 transition-colors"
                          >
                            Open ↗
                          </a>
                        </div>
                      )}

                      {viewVersion.repoUrl && (
                        <a href={viewVersion.repoUrl} target="_blank" rel="noopener noreferrer"
                          className="block text-[9px] font-mono text-ink3/60 hover:text-ink3 transition-colors truncate"
                        >
                          {viewVersion.repoUrl.replace('https://','')} ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Evolution input */}
              <div className="border border-border rounded-2xl bg-paper overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Evolve to v{(latestVersion?.version ?? 0) + 1}</p>
                    <p className="text-[10px] text-ink3 mt-0.5">AI generates targeted changes · pushes to GitHub · redeploys to Vercel</p>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  <textarea
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    disabled={isEvolving}
                    placeholder={`What should change in v${(latestVersion?.version ?? 0) + 1}?\n\nExamples:\n• "Add a dark mode toggle in the header"\n• "The dashboard KPI cards need real-time updates every 30s"\n• "Replace the hero image with a short explainer video embed"\n• "Add CSV export to the data table on /dashboard/reports"`}
                    rows={6}
                    className="w-full px-3 py-2.5 rounded-xl text-sm border border-border bg-paper2 outline-none focus:border-acid resize-none text-ink placeholder:text-ink3/60 transition-colors disabled:opacity-50"
                  />

                  {/* Evolution step progress */}
                  {(isEvolving || phase === 'done' || phase === 'error') && (
                    <div className="bg-paper2 border border-border rounded-xl p-3 space-y-1.5">
                      {[
                        { key: 'ai'     as EvolvePhase, label: 'Evolution Agent — AI diffs the codebase' },
                        { key: 'github' as EvolvePhase, label: 'GitHub — pushing merged codebase'        },
                        { key: 'vercel' as EvolvePhase, label: 'Vercel — building + deploying v' + ((latestVersion?.version ?? 0) + 1) },
                      ].map(({ key, label }) => {
                        const PHASE_ORDER: EvolvePhase[] = ['ai','github','vercel','done']
                        const keyIdx    = PHASE_ORDER.indexOf(key)
                        const activeIdx = PHASE_ORDER.indexOf(phase)
                        const isDone    = activeIdx > keyIdx || phase === 'done'
                        const isErr     = phase === 'error' && activeIdx === keyIdx
                        return (
                          <PhaseRow
                            key={key} label={label} phase={key} active={phase}
                            done={isDone} err={isErr}
                          />
                        )
                      })}
                    </div>
                  )}

                  {/* Log */}
                  {logLines.length > 0 && (
                    <div
                      ref={logRef}
                      className="bg-paper2 border border-border rounded-xl p-3 max-h-28 overflow-y-auto space-y-0.5"
                    >
                      {logLines.map((l, i) => (
                        <p key={i} className={`text-[10px] font-mono ${
                          l.includes('[✓]') ? 'text-green-600' :
                          l.includes('[✗]') ? 'text-red-500'   :
                          l.includes('[⚠]') ? 'text-amber-500' :
                          'text-ink3'
                        }`}>{l}</p>
                      ))}
                    </div>
                  )}

                  {phaseError && (
                    <p className="text-[11px] font-mono text-red-500">{phaseError}</p>
                  )}

                  {/* Live URL after evolution */}
                  {phase === 'done' && evolvedUrl && (
                    <a
                      href={evolvedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-black border border-green-400 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                    >
                      ▲ Open v{selectedVersion} Live App ↗
                    </a>
                  )}

                  {/* Evolve button */}
                  <button
                    onClick={phase === 'done' || phase === 'error' ? () => { setPhase('idle'); setLogLines([]); setPhaseError(''); setEvolvedUrl('') } : evolve}
                    disabled={isEvolving || (!feedback.trim() && phase === 'idle')}
                    className={`w-full py-3 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 ${
                      isEvolving
                        ? 'bg-ink/50 text-paper/50 cursor-not-allowed'
                        : phase === 'done'
                        ? 'bg-paper border border-border text-ink3 hover:text-ink'
                        : phase === 'error'
                        ? 'border border-red-300 text-red-600 hover:bg-red-50'
                        : !feedback.trim()
                        ? 'bg-paper3 text-ink3 cursor-not-allowed border border-border'
                        : 'bg-ink text-paper hover:bg-ink/80 shadow-[0_0_20px_2px_rgba(0,0,0,0.12)]'
                    }`}
                  >
                    {isEvolving ? (
                      <><span className="flex gap-0.5">{[0,1,2].map(i=><span key={i} className="w-1.5 h-1.5 rounded-full bg-paper/60 animate-pulse" style={{animationDelay:`${i*150}ms`}}/>)}</span> Evolving…</>
                    ) : phase === 'done' ? (
                      '← Start another evolution'
                    ) : phase === 'error' ? (
                      '↺ Retry'
                    ) : (
                      `↻ Evolve to v${(latestVersion?.version ?? 0) + 1} →`
                    )}
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
