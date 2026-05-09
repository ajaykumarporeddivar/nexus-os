'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { BUILD_AGENTS, BUILD_AGENT_SYSTEMS, parseAgentFiles, buildRepairMessage } from '@/lib/buildAgentData'
import type { EvolvableProject, ProjectVersion } from '@/components/pages/EvolvePage'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ForgeBuild {
  projectName: string
  brief:       string
  score:       number | null
  files:       Record<string, string>
  builtAt:     string
}

type AgentStatus = 'idle' | 'run' | 'done' | 'err'

interface AgentState {
  status:  AgentStatus
  files:   Record<string, string>
  tokens:  number
  elapsed: number
}

// ─── File tree helpers ────────────────────────────────────────────────────────

function groupByDir(files: Record<string, string>): Record<string, string[]> {
  const dirs: Record<string, string[]> = {}
  for (const path of Object.keys(files)) {
    const parts = path.split('/')
    const dir   = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
    if (!dirs[dir]) dirs[dir] = []
    dirs[dir].push(path)
  }
  return dirs
}

function langFromPath(path: string): string {
  const ext = path.split('.').pop() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', sql: 'sql', css: 'css', md: 'markdown',
    prisma: 'prisma', yaml: 'yaml', yml: 'yaml', env: 'env',
  }
  return map[ext] ?? 'text'
}

function fileIcon(path: string): string {
  if (path.endsWith('.prisma')) return '🗄'
  if (path.endsWith('.sql'))   return '💾'
  if (path.endsWith('.md'))    return '📝'
  if (path.endsWith('.json'))  return '{}'
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return '⚙'
  if (path.endsWith('.css'))   return '🎨'
  if (path.includes('test') || path.includes('spec')) return '✓'
  if (path.includes('auth'))   return '🔒'
  if (path.includes('api'))    return '⟨⟩'
  if (path.endsWith('.tsx') || path.endsWith('.jsx')) return '⚛'
  return '◈'
}

// ─── Syntax highlight (CSS-only, no deps) ────────────────────────────────────

function HighlightedCode({ code, lang }: { code: string; lang: string }) {
  const lines = code.split('\n')
  return (
    <div className="text-[11px] font-mono leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className="flex group">
          <span className="select-none w-10 text-right pr-4 text-[#484f58] group-hover:text-[#6e7681] flex-shrink-0 tabular-nums">{i + 1}</span>
          <span className={`flex-1 ${colorLine(line, lang)}`}>{line || ' '}</span>
        </div>
      ))}
    </div>
  )
}

function colorLine(line: string, lang: string): string {
  if (lang === 'markdown') return 'text-[#c9d1d9]'
  if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) return 'text-[#8b949e] italic'
  if (line.trimStart().startsWith('import') || line.trimStart().startsWith('export')) return 'text-violet-400'
  if (/^(interface|type|class|enum|const|let|var|function|async|return|if|else|for|while|try|catch)\b/.test(line.trimStart())) return 'text-blue-400'
  if (line.includes('prisma') || line.includes('schema') || (line.includes('@') && lang === 'prisma')) return 'text-green-400'
  if (lang === 'sql' && /^(CREATE|ALTER|INSERT|SELECT|UPDATE|DELETE|DROP)/i.test(line.trimStart())) return 'text-yellow-400'
  return 'text-[#e6edf3]'
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({ agent, state, isActive }: { agent: typeof BUILD_AGENTS[0]; state?: AgentState; isActive: boolean }) {
  const fileCount = Object.keys(state?.files ?? {}).length
  return (
    <div className={`border rounded-xl p-3 transition-all ${
      isActive             ? 'border-acid/50 bg-acid/5 shadow-[0_0_12px_1px_rgba(200,242,60,0.15)]' :
      state?.status==='done' ? 'border-border bg-paper' :
      state?.status==='err'  ? 'border-red-300/50 bg-red-50/30' :
                               'border-border/50 bg-paper2/50'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{agent.icon}</span>
          <div>
            <p className="text-[11px] font-black font-mono text-ink">{agent.name}</p>
            <p className="text-[9px] text-ink3 leading-tight">{agent.role}</p>
          </div>
        </div>
        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${
          state?.status==='done' ? 'border-green-300 text-green-700 bg-green-50' :
          state?.status==='run'  ? 'border-acid/50 text-ink2 bg-acid/10' :
          state?.status==='err'  ? 'border-red-300 text-red-700 bg-red-50' :
                                   'border-border text-ink3'
        }`}>
          {state?.status==='run' ? '▸ GEN' : state?.status==='done' ? `✓ ${fileCount}f` : state?.status==='err' ? '✗ ERR' : 'IDLE'}
        </span>
      </div>
      {isActive && (
        <div className="w-full h-1 bg-border rounded-full overflow-hidden">
          <div className="h-full bg-acid rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      )}
      {state?.status==='done' && state.tokens > 0 && (
        <p className="text-[9px] font-mono text-ink3 mt-1">{state.tokens.toLocaleString()} tokens · {state.elapsed}s</p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BuildEnginePage() {
  const { data: session } = useSession()
  const sessionId  = (session?.user as { id?: string } | null)?.id ?? 'anon'
  const sessionPlan = (session?.user as { plan?: string } | null)?.plan ?? 'free'

  // Input state
  const [builds,     setBuilds]     = useState<ForgeBuild[]>([])
  const [selected,   setSelected]   = useState<ForgeBuild | null>(null)
  const [apiKey,     setApiKey]     = useState('')

  // Runtime state
  const [isRunning,  setIsRunning]  = useState(false)
  const [isDone,     setIsDone]     = useState(false)
  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({})
  const [allFiles,   setAllFiles]   = useState<Record<string, string>>({})
  const [logLines,   setLogLines]   = useState<string[]>([])
  const [totalTokens, setTotalTokens] = useState(0)
  const [elapsed,    setElapsed]    = useState(0)

  // Publish state
  const [publishing,    setPublishing]    = useState(false)
  const [publishStep,   setPublishStep]   = useState<'idle' | 'github' | 'vercel' | 'done'>('idle')
  const [repoUrl,       setRepoUrl]       = useState('')
  const [appUrl,        setAppUrl]        = useState('')
  const [vercelImport,  setVercelImport]  = useState('')
  const [publishError,  setPublishError]  = useState('')

  // Code viewer state
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [viewMode,   setViewMode]   = useState<'tree' | 'recent'>('recent')
  const [recentFiles, setRecentFiles] = useState<string[]>([])

  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef  = useRef(0)
  const logRef    = useRef<HTMLDivElement>(null)

  // Load FORGE builds from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('nexus_forge_builds')
      if (raw) {
        const parsed: ForgeBuild[] = JSON.parse(raw)
        setBuilds(parsed)
        setSelected(parsed[0] ?? null)
      }
    } catch { /* storage unavailable */ }
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logLines])

  const log = useCallback((msg: string, type: 'info'|'ok'|'warn'|'err' = 'info') => {
    const ts     = new Date().toLocaleTimeString('en', { hour12: false })
    const prefix = type==='ok' ? '[✓]' : type==='warn' ? '[⚠]' : type==='err' ? '[✗]' : '[→]'
    setLogLines(ls => [...ls, `${ts} ${prefix} ${msg}`])
  }, [])

  const setAgent = useCallback((id: string, patch: Partial<AgentState>) => {
    setAgentStates(s => ({ ...s, [id]: { ...{ status:'idle' as AgentStatus, files:{}, tokens:0, elapsed:0 }, ...s[id], ...patch } }))
  }, [])

  const buildUserMessage = useCallback((agentId: string, forge: ForgeBuild): string => {
    const manifest = forge.files['PROJECT_MANIFEST.md'] ?? ''
    const arch     = forge.files['.claude/architecture.md'] ?? ''
    const features = forge.files['.claude/features/feature-cards.md'] ?? ''
    const security = forge.files['.claude/security-report.md'] ?? ''
    const sql      = forge.files['db/migrations/001_init.sql'] ?? ''
    const qa       = forge.files['.forge/qa-report.md'] ?? ''

    return `PROJECT: ${forge.projectName}
BRIEF: ${forge.brief}
QA SCORE: ${forge.score ?? 'N/A'}/10

PROJECT_MANIFEST.md:
${manifest.slice(0, 1200)}

ARCHITECTURE:
${arch.slice(0, 800)}

FEATURE CARDS:
${features.slice(0, 800)}

SECURITY REPORT:
${security.slice(0, 400)}

DATABASE SCHEMA (SQL):
${sql.slice(0, 600)}

QA REPORT:
${qa.slice(0, 400)}

Generate the ${agentId.toUpperCase()} files now. Follow the output contract exactly.`
  }, [])

  const runBuild = useCallback(async () => {
    if (!selected || isRunning) return
    const key = apiKey.trim()

    setIsRunning(true)
    setIsDone(false)
    setLogLines([])
    setAllFiles({})
    setAgentStates({})
    setActiveAgent(null)
    setTotalTokens(0)
    setRecentFiles([])
    setSelectedFile(null)
    setRepoUrl('')
    setAppUrl('')
    setPublishError('')
    setPublishStep('idle')

    startRef.current = Date.now()
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)

    let tokens = 0
    const accumulated: Record<string, string> = {}

    log(`BUILD ENGINE INITIATED — ${selected.projectName}`)
    log(`FORGE score: ${selected.score ?? '?'}/10 · ${Object.keys(selected.files).length} spec files`)
    log(`Running ${BUILD_AGENTS.length} code-generation agents`)

    try {
      for (const agent of BUILD_AGENTS) {
        setActiveAgent(agent.id)
        setAgent(agent.id, { status: 'run' })
        const agentStart = Date.now()
        log(`Agent ${agent.name} — ${agent.role}`)

        // REPAIR agent gets accumulated files so it can fix what's broken/missing
        const userMsg = agent.id === 'repair'
          ? buildRepairMessage(selected, accumulated)
          : buildUserMessage(agent.id, selected)

        // Per-agent retry: attempt up to 2 times before aborting the pipeline
        let data: { ok: boolean; data: { content: string; tokens: number }; error?: string } | null = null
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch('/api/claude/once', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
              body:    JSON.stringify({
                systemPrompt: BUILD_AGENT_SYSTEMS[agent.id],
                userMessage:  userMsg,
                apiKey:       key || undefined,
                plan:         sessionPlan,
                sessionId,
              }),
            })
            data = await res.json()
            if (data?.ok) break
            throw new Error(data?.error ?? 'Agent failed')
          } catch (err) {
            if (attempt === 0) {
              log(`⚠ ${agent.name} failed — retrying in 6s…`, 'warn')
              await new Promise(r => setTimeout(r, 6000))
            } else {
              throw new Error(`${agent.name}: ${(err as Error).message}`)
            }
          }
        }
        if (!data?.ok) throw new Error(`${agent.name}: no response after retry`)

        const agentFiles = parseAgentFiles(data.data.content)
        const fileCount  = Object.keys(agentFiles).length
        const agentMs    = Math.round((Date.now() - agentStart) / 100) / 10

        Object.assign(accumulated, agentFiles)
        setAllFiles({ ...accumulated })
        setRecentFiles(rf => [...Object.keys(agentFiles), ...rf].slice(0, 20))
        if (!selectedFile && fileCount > 0) setSelectedFile(Object.keys(agentFiles)[0])

        tokens += data.data.tokens
        setTotalTokens(tokens)
        setAgent(agent.id, { status: 'done', files: agentFiles, tokens: data.data.tokens, elapsed: agentMs })
        log(`✓ ${agent.name} — ${fileCount} files · ${data.data.tokens.toLocaleString()} tokens`, 'ok')

        // Spread requests to avoid Groq rate limits on free tier
        await new Promise(r => setTimeout(r, 400))
      }

      // File-count quality gate
      const totalGenerated = Object.keys(accumulated).length
      if (totalGenerated < 8) {
        log(`⚠ Only ${totalGenerated} files — vercel-app deploy route will inject missing critical files automatically`, 'warn')
      }

      log(`BUILD COMPLETE — ${Object.keys(accumulated).length} files · ${tokens.toLocaleString()} total tokens`, 'ok')
    } catch (err) {
      log((err as Error).message, 'err')
    } finally {
      setActiveAgent(null)
      setIsRunning(false)
      setIsDone(true)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [selected, isRunning, apiKey, sessionId, sessionPlan, log, setAgent, buildUserMessage, selectedFile])

  const publish = useCallback(async () => {
    if (!selected || Object.keys(allFiles).length === 0) return
    setPublishing(true)
    setPublishError('')
    setRepoUrl('')
    setAppUrl('')
    setVercelImport('')

    const repoName = selected.projectName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60)

    try {
      // ── Step 1: Push to GitHub ──────────────────────────────────────────────
      setPublishStep('github')
      log('Pushing to GitHub…')
      const ghRes  = await fetch('/api/deploy/github', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          repoName:    `${repoName}-app`,
          files:       allFiles,
          isPrivate:   false,
          description: `${selected.projectName} — Generated by NEXUS OS BUILD ENGINE · QA ${selected.score ?? '?'}/10`,
        }),
      })
      const ghData = await ghRes.json()
      if (!ghData.ok) throw new Error(`GitHub: ${ghData.error}`)
      setRepoUrl(ghData.data.repoUrl)
      log(`✓ GitHub: ${ghData.data.repoUrl} (${ghData.data.files} files)`, 'ok')

      // ── Step 2: Deploy to Vercel ────────────────────────────────────────────
      setPublishStep('vercel')
      log('Deploying to Vercel (Next.js build)…')
      const vrclRes  = await fetch('/api/deploy/vercel-app', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          projectName: repoName,
          files:       allFiles,
        }),
      })
      const vrclData = await vrclRes.json()
      if (vrclData.ok) {
        setAppUrl(vrclData.data.deployUrl)
        setVercelImport(`https://vercel.com/new/clone?repository-url=${encodeURIComponent(ghData.data.repoUrl)}&project-name=${repoName}`)
        log(`✓ Vercel: ${vrclData.data.deployUrl} — ${vrclData.data.state}`, 'ok')
        log('App is building on Vercel — live in ~60s', 'ok')
      } else {
        // Vercel not configured — surface the import URL as fallback
        const importUrl = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(ghData.data.repoUrl)}&project-name=${repoName}`
        setVercelImport(importUrl)
        log(`⚠ Vercel auto-deploy: ${vrclData.error}`, 'warn')
        log('Use the "Deploy on Vercel" button below to deploy manually', 'warn')
      }

      setPublishStep('done')

      // Save to Evolution Hub
      try {
        const version: ProjectVersion = {
          version:    1,
          repoUrl:    ghData.data.repoUrl,
          deployUrl:  vrclData.ok ? vrclData.data.deployUrl : '',
          files:      allFiles,
          deployedAt: new Date().toISOString(),
        }
        const project: EvolvableProject = {
          id:        crypto.randomUUID(),
          name:      repoName,
          brief:     selected.brief,
          score:     selected.score,
          versions:  [version],
          createdAt: new Date().toISOString(),
        }
        const existing: EvolvableProject[] = JSON.parse(
          localStorage.getItem('nexus_deployed_projects') ?? '[]'
        )
        localStorage.setItem(
          'nexus_deployed_projects',
          JSON.stringify([project, ...existing].slice(0, 20)),
        )
      } catch { /* storage unavailable */ }

    } catch (err) {
      setPublishError((err as Error).message)
      setPublishStep('idle')
    } finally {
      setPublishing(false)
    }
  }, [selected, allFiles, log])

  const fileList = Object.keys(allFiles)
  const dirs     = groupByDir(allFiles)
  const selectedCode = selectedFile ? (allFiles[selectedFile] ?? '') : ''
  const totalFiles   = fileList.length
  const approvedBuilds = builds.filter(b => b.score !== null && b.score >= 8)

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-screen">

      {/* Header bar */}
      <div className="border-b border-border bg-paper px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-[10px] font-black font-mono tracking-widest text-ink3 uppercase">BUILD ENGINE</p>
          <p className="text-sm font-bold text-ink">Phase 2 — FORGE spec → production code</p>
        </div>
        <div className="flex items-center gap-3">
          {isDone && totalFiles > 0 && (
            <span className="text-[10px] font-mono text-ink3">{totalFiles} files · {totalTokens.toLocaleString()} tokens · {elapsed}s</span>
          )}
          {isRunning && (
            <span className="text-[10px] font-mono text-acid animate-pulse">{elapsed}s running…</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left panel: config + agents ──────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 border-r border-border flex flex-col overflow-y-auto bg-paper2">

          {/* Build selector */}
          <div className="p-4 border-b border-border space-y-3">
            <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">Select FORGE Build</p>

            {builds.length === 0 ? (
              <div className="text-center py-4 space-y-2">
                <p className="text-xs text-ink3">No approved builds found</p>
                <p className="text-[10px] text-ink3">Run FORGE Engine first (score ≥ 8.0)</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {builds.map(b => (
                  <button
                    key={b.builtAt}
                    onClick={() => setSelected(b)}
                    className={`w-full text-left border rounded-xl p-3 transition-all ${
                      selected?.builtAt === b.builtAt
                        ? 'border-ink/30 bg-ink/5'
                        : 'border-border bg-paper hover:border-ink/15'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs font-bold text-ink truncate">{b.projectName}</p>
                      {b.score !== null && (
                        <span className={`text-[9px] font-black font-mono ml-2 flex-shrink-0 ${b.score >= 8 ? 'text-green-600' : 'text-amber-600'}`}>
                          {b.score.toFixed(1)}/10
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-ink3">{new Date(b.builtAt).toLocaleString()} · {Object.keys(b.files).length} spec files</p>
                  </button>
                ))}
              </div>
            )}

            {approvedBuilds.length === 0 && builds.length > 0 && (
              <p className="text-[9px] text-amber-600 font-mono">⚠ No builds with score ≥ 8. Showing all builds.</p>
            )}
          </div>

          {/* API Key */}
          <div className="p-4 border-b border-border space-y-2">
            <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">API Key (optional)</p>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-… (uses server key if blank)"
              className="w-full bg-paper border border-border rounded-lg px-3 py-1.5 text-[11px] font-mono text-ink placeholder:text-ink3 focus:outline-none focus:border-ink/30"
            />
          </div>

          {/* Agent grid */}
          <div className="p-4 space-y-2 flex-1">
            <p className="text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">{BUILD_AGENTS.length}-Agent Code Pipeline</p>
            <div className="space-y-1.5">
              {BUILD_AGENTS.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  state={agentStates[agent.id]}
                  isActive={activeAgent === agent.id}
                />
              ))}
            </div>
          </div>

          {/* Launch button */}
          <div className="p-4 border-t border-border space-y-2">
            <button
              onClick={runBuild}
              disabled={isRunning || !selected}
              className={`w-full py-3 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 ${
                isRunning
                  ? 'bg-ink/50 text-paper/50 cursor-not-allowed'
                  : !selected
                  ? 'bg-paper3 text-ink3 cursor-not-allowed border border-border'
                  : 'bg-ink text-paper hover:bg-ink/80 shadow-[0_0_20px_2px_rgba(0,0,0,0.15)]'
              }`}
            >
              {isRunning ? (
                <><span className="flex gap-0.5">{[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-paper/60 animate-pulse" style={{ animationDelay:`${i*150}ms` }} />)}</span> Building…</>
              ) : (
                <>⚡ Launch Build Engine</>
              )}
            </button>

            {isDone && Object.keys(allFiles).length > 0 && publishStep === 'idle' && (
              <button
                onClick={publish}
                className="w-full py-2.5 rounded-xl text-sm font-bold border border-ink/20 text-ink hover:border-ink/40 hover:bg-paper3 transition-all flex items-center justify-center gap-2"
              >
                ↑ Publish — GitHub + Vercel
              </button>
            )}

            {publishing && (
              <div className="space-y-1">
                <div className={`flex items-center gap-2 text-[10px] font-mono ${publishStep === 'github' ? 'text-acid animate-pulse' : repoUrl ? 'text-green-600' : 'text-ink3'}`}>
                  <span>{repoUrl ? '✓' : publishStep === 'github' ? '▸' : '○'}</span>
                  <span>GitHub push</span>
                </div>
                <div className={`flex items-center gap-2 text-[10px] font-mono ${publishStep === 'vercel' ? 'text-acid animate-pulse' : appUrl ? 'text-green-600' : 'text-ink3'}`}>
                  <span>{appUrl ? '✓' : publishStep === 'vercel' ? '▸' : '○'}</span>
                  <span>Vercel deploy</span>
                </div>
              </div>
            )}

            {publishStep === 'done' && (
              <div className="space-y-2">
                {repoUrl && (
                  <a href={repoUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg border border-border hover:border-ink/20 transition-colors group"
                  >
                    <span className="text-[10px] font-mono text-ink3 group-hover:text-ink truncate">{repoUrl.replace('https://github.com/', '')}</span>
                    <span className="text-[9px] font-mono text-ink3 flex-shrink-0 ml-2">GitHub ↗</span>
                  </a>
                )}
                {appUrl ? (
                  <a href={appUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold border border-green-400 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                  >
                    ▲ Open Live App ↗
                  </a>
                ) : vercelImport ? (
                  <a href={vercelImport} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold border border-ink/20 text-ink hover:bg-paper3 transition-colors"
                  >
                    ▲ Deploy on Vercel →
                  </a>
                ) : null}
                {appUrl && (
                  <p className="text-[9px] font-mono text-ink3 text-center">Building on Vercel — live in ~60s</p>
                )}
              </div>
            )}

            {publishError && (
              <p className="text-[10px] font-mono text-red-500">{publishError}</p>
            )}
          </div>
        </div>

        {/* ── Right panel: code viewer ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {totalFiles === 0 && !isRunning ? (
            /* Empty state */
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-sm space-y-4">
                <div className="w-16 h-16 rounded-2xl border border-border bg-paper3 flex items-center justify-center text-2xl mx-auto">⚡</div>
                <h2 className="text-lg font-bold text-ink">BUILD ENGINE ready</h2>
                <p className="text-sm text-ink3 leading-relaxed">
                  Select an approved FORGE build (score ≥ 8.0) and launch the build pipeline.
                  {BUILD_AGENTS.length} agents will generate a complete Next.js 15 application — real TypeScript, real components, real API routes.
                </p>
                <div className="grid grid-cols-2 gap-2 text-left mt-4">
                  {BUILD_AGENTS.map(a => (
                    <div key={a.id} className="flex items-center gap-1.5 p-2 border border-border rounded-lg bg-paper2">
                      <span className="text-sm flex-shrink-0">{a.icon}</span>
                      <span className="text-[9px] font-mono text-ink3 truncate">{a.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Top: file nav */}
              <div className="border-b border-border bg-paper flex-shrink-0">
                {/* Tab row: recent files */}
                <div className="flex items-center overflow-x-auto px-2 pt-1 gap-0.5 min-h-[36px]">
                  {recentFiles.slice(0, 8).map(path => (
                    <button
                      key={path}
                      onClick={() => setSelectedFile(path)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono whitespace-nowrap rounded-t-md border border-b-0 transition-all flex-shrink-0 ${
                        selectedFile === path
                          ? 'border-border bg-paper text-ink font-bold'
                          : 'border-transparent text-ink3 hover:text-ink hover:bg-paper2'
                      }`}
                    >
                      <span>{fileIcon(path)}</span>
                      <span>{path.split('/').pop()}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* File tree */}
                <div className="w-56 flex-shrink-0 border-r border-border overflow-y-auto bg-paper2 py-2">
                  <p className="px-3 py-1 text-[9px] font-black font-mono tracking-widest text-ink3 uppercase">{totalFiles} files generated</p>
                  {Object.entries(dirs).sort().map(([dir, paths]) => (
                    <div key={dir} className="mb-1">
                      {dir !== '.' && (
                        <p className="px-3 py-0.5 text-[9px] font-mono text-ink3/60">📁 {dir}/</p>
                      )}
                      {paths.sort().map(path => (
                        <button
                          key={path}
                          onClick={() => setSelectedFile(path)}
                          className={`w-full text-left px-3 py-0.5 flex items-center gap-1.5 transition-colors ${
                            selectedFile === path ? 'bg-ink/5 text-ink' : 'text-ink3 hover:text-ink hover:bg-paper3'
                          }`}
                        >
                          <span className="text-[10px] flex-shrink-0">{fileIcon(path)}</span>
                          <span className="text-[10px] font-mono truncate">{path.split('/').pop()}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Code display */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                  {selectedFile ? (
                    <>
                      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-paper flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{fileIcon(selectedFile)}</span>
                          <span className="text-[11px] font-mono text-ink">{selectedFile}</span>
                          <span className="text-[9px] font-mono text-ink3 border border-border rounded px-1.5 py-0.5">{langFromPath(selectedFile)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-ink3">{selectedCode.split('\n').length} lines</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(selectedCode)}
                            className="text-[9px] font-mono text-ink3 hover:text-ink border border-border rounded px-2 py-0.5 transition-colors"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto bg-[#0d1117] p-4">
                        <HighlightedCode code={selectedCode} lang={langFromPath(selectedFile)} />
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center bg-[#0d1117]">
                      <p className="text-sm font-mono text-[#484f58]">select a file to view</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Log strip (bottom) */}
          {(logLines.length > 0 || isRunning) && (
            <div
              ref={logRef}
              className="h-28 flex-shrink-0 border-t border-border bg-paper2/80 overflow-y-auto p-3 space-y-0.5"
            >
              {logLines.map((l, i) => (
                <p key={i} className={`text-[10px] font-mono ${
                  l.includes('[✓]') ? 'text-green-600' :
                  l.includes('[✗]') ? 'text-red-500' :
                  l.includes('[⚠]') ? 'text-amber-500' :
                  'text-ink3'
                }`}>{l}</p>
              ))}
              {isRunning && (
                <p className="text-[10px] font-mono text-acid animate-pulse">▸ generating…</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
