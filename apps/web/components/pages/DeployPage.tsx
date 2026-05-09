'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ForgeBuild {
  projectName: string
  brief:       string
  score:       number | null
  files:       Record<string, string>
  builtAt:     string
}

type DeployStep = 'connect' | 'project' | 'deploy' | 'done'

interface DeployResult {
  repoUrl:      string
  vercelImport: string
  owner:        string
  repo:         string
  files:        number
}

// ─── Small UI atoms ───────────────────────────────────────────────────────────

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-7 h-7 rounded-lg border flex items-center justify-center text-[10px] font-black font-mono flex-shrink-0 transition-all ${
      done   ? 'border-border text-ink2 bg-paper3'   :
      active ? 'border-ink/30 text-ink bg-ink/8'     :
               'border-border/40 text-ink3'
    }`}>
      {done ? '✓' : `0${n}`}
    </div>
  )
}

function ConnectRow({ label, status, children }: {
  label: string; status: 'idle' | 'ok' | 'err'; children: React.ReactNode
}) {
  return (
    <div className="border border-border rounded-xl p-4 space-y-3 bg-paper">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-ink">{label}</p>
        {status === 'ok'  && <span className="text-[9px] font-mono font-bold text-ink2 border border-border rounded px-2 py-0.5">[✓] connected</span>}
        {status === 'err' && <span className="text-[9px] font-mono font-bold text-ink3 border border-border rounded px-2 py-0.5">[✗] failed</span>}
      </div>
      {children}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeployPage() {
  const [step,    setStep]    = useState<DeployStep>('connect')
  const [mode,    setMode]    = useState<'auto' | 'manual'>('auto')

  // Tokens (persisted in localStorage)
  const [ghToken,        setGhToken]        = useState('')
  const [ghUser,         setGhUser]         = useState('')
  const [ghStatus,       setGhStatus]       = useState<'idle'|'ok'|'err'>('idle')
  const [ghTesting,      setGhTesting]      = useState(false)
  const [ghServerKey,    setGhServerKey]    = useState(false)
  const [vercelUser,     setVercelUser]     = useState('')
  const [vercelReady,    setVercelReady]    = useState(false)

  // FORGE builds — history + selected
  const [builds,    setBuilds]    = useState<ForgeBuild[]>([])
  const [build,     setBuild]     = useState<ForgeBuild | null>(null)
  const [repoName,  setRepoName]  = useState('')
  const [isPrivate, setIsPrivate] = useState(true)

  // Deploy state
  const [deploying,     setDeploying]     = useState(false)
  const [deployLog,     setDeployLog]     = useState<string[]>([])
  const [deployResult,  setDeployResult]  = useState<DeployResult | null>(null)
  const [deployError,   setDeployError]   = useState('')

  // Manual tab state
  const [apiDocsOpen, setApiDocsOpen] = useState(false)
  const [copied,      setCopied]      = useState<string | null>(null)

  // Load persisted data + auto-verify server token on mount
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('nexus_gh_token') ?? ''
      const savedUser  = localStorage.getItem('nexus_gh_user')  ?? ''
      if (savedToken) { setGhToken(savedToken); setGhUser(savedUser) }

      // Load build history (new format) with fallback to single build
      const rawHistory = localStorage.getItem('nexus_forge_builds')
      const rawSingle  = localStorage.getItem('nexus_forge_last_build')
      let allBuilds: ForgeBuild[] = []
      if (rawHistory) {
        allBuilds = JSON.parse(rawHistory)
      } else if (rawSingle) {
        allBuilds = [JSON.parse(rawSingle)]
      }
      if (allBuilds.length > 0) {
        setBuilds(allBuilds)
        setBuild(allBuilds[0])
        setRepoName(allBuilds[0].projectName.toLowerCase().replace(/[^a-z0-9]/g, '-'))
      }
    } catch { /* storage unavailable */ }

    // Auto-check server tokens (GitHub + Vercel)
    Promise.all([
      fetch('/api/deploy/github').then(r => r.json()).catch(() => ({ ok: false })),
      fetch('/api/deploy/vercel').then(r => r.json()).catch(() => ({ ok: false })),
    ]).then(([gh, vrcl]) => {
      if (gh.ok) {
        setGhUser(gh.data.login)
        setGhStatus('ok')
        setGhServerKey(!!gh.data.isServerKey)
      }
      if (vrcl.ok) {
        setVercelUser(vrcl.data.username)
        setVercelReady(true)
      }
    })
  }, [])

  const testGhToken = useCallback(async (tok: string) => {
    if (!tok) return
    setGhTesting(true); setGhStatus('idle')
    try {
      const res  = await fetch(`/api/deploy/github?token=${encodeURIComponent(tok)}`)
      const data = await res.json()
      if (data.ok) {
        setGhUser(data.data.login)
        setGhStatus('ok')
        localStorage.setItem('nexus_gh_token', tok)
        localStorage.setItem('nexus_gh_user', data.data.login)
      } else throw new Error(data.error)
    } catch { setGhStatus('err') }
    finally { setGhTesting(false) }
  }, [])

  const log = (msg: string) => setDeployLog(l => [...l, msg])

  const runDeploy = useCallback(async () => {
    if (!build || ghStatus !== 'ok') return
    setDeploying(true); setDeployLog([]); setDeployError(''); setDeployResult(null)

    try {
      // Step 1: GitHub
      log('Creating GitHub repository…')
      const ghRes  = await fetch('/api/deploy/github', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoName,
          files:       build.files,
          token:       ghToken || undefined,
          isPrivate,
          description: build.brief,
        }),
      })
      const ghData = await ghRes.json()
      if (!ghRes.ok || !ghData.ok) throw new Error(ghData.error ?? 'GitHub push failed')

      log(`[✓] Repository created: ${ghData.data.repoUrl}`)
      log(`[✓] ${ghData.data.files} files pushed to ${ghData.data.branch}`)

      // Step 2: Vercel (direct file upload — no GitHub integration needed)
      let deployUrl  = ghData.data.vercelImport
      let vercelAuto = false
      if (vercelReady) {
        log('Uploading files to Vercel…')
        try {
          const vRes  = await fetch('/api/deploy/vercel', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectName: repoName,
              files:       build.files,
              score:       build.score,
              brief:       build.brief,
              repoUrl:     ghData.data.repoUrl,
              repoOwner:   ghData.data.owner,
              repoName:    ghData.data.repo,
            }),
          })
          const vData = await vRes.json()
          if (vData.ok) {
            deployUrl  = vData.data.deployUrl
            vercelAuto = true
            log(`[✓] Vercel deployment created — building…`)
            log(`[✓] Live URL: ${deployUrl}`)
          } else {
            log(`[⚠] Vercel deploy: ${vData.error} — using import link`)
          }
        } catch (e) {
          log(`[⚠] Vercel deploy error: ${(e as Error).message} — using import link`)
        }
      } else {
        log('Vercel token not configured — use the import link to deploy')
      }

      setDeployResult({ ...ghData.data, deployUrl, vercelAuto })
      setStep('done')
    } catch (err) {
      setDeployError((err as Error).message)
    } finally {
      setDeploying(false)
    }
  }, [build, ghToken, ghStatus, repoName, isPrivate, vercelReady, log])

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const canConnect = ghStatus === 'ok'
  const canDeploy  = canConnect && !!build && !!repoName.trim()

  // ── Auto-deploy wizard ────────────────────────────────────────────────────

  const autoWizard = (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">

      {/* Header */}
      <div className="space-y-1.5 pb-2">
        <p className="text-[10px] font-black font-mono tracking-widest text-ink3 uppercase">One-click deploy</p>
        <h1 className="text-2xl font-bold text-ink">FORGE → GitHub → Vercel</h1>
        <p className="text-sm text-ink3 leading-relaxed">
          Connect GitHub once. Every FORGE run becomes a live URL in under 3 minutes — no terminal, no manual steps.
        </p>
      </div>

      {/* Steps nav */}
      <div className="flex items-center gap-3 pb-2">
        {(['connect','project','deploy','done'] as DeployStep[]).map((s, i) => {
          const labels: Record<DeployStep, string> = { connect: 'GitHub', project: 'Project', deploy: 'Deploy', done: 'Live' }
          const isDone   = (['connect','project','deploy','done'] as DeployStep[]).indexOf(step) > i
          const isActive = step === s
          return (
            <div key={s} className="flex items-center gap-2">
              <button
                onClick={() => isDone ? setStep(s) : undefined}
                className={`flex items-center gap-2 text-xs font-semibold transition-colors ${isActive ? 'text-ink' : isDone ? 'text-ink2 hover:text-ink cursor-pointer' : 'text-ink3 cursor-default'}`}
              >
                <StepBadge n={i + 1} active={isActive} done={isDone} />
                {labels[s]}
              </button>
              {i < 3 && <div className="w-6 h-px bg-border flex-shrink-0" />}
            </div>
          )
        })}
      </div>

      {/* ── Step 01: Connect ─────────────────────────────────────────────── */}
      {step === 'connect' && (
        <div className="space-y-4">
          <ConnectRow label="GitHub" status={ghStatus}>
            {ghServerKey && ghStatus === 'ok' ? (
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-ink2">Connected as @{ghUser}</p>
                <p className="text-[9px] text-ink3">Using server-configured <span className="font-mono">GITHUB_TOKEN</span> — no manual token needed.</p>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-ink3 leading-relaxed">
                  No server token found. Generate a token at{' '}
                  <span className="font-mono">github.com/settings/tokens</span>
                  {' '}→ Generate new token (classic) → tick <span className="font-mono">repo</span> scope.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxx"
                    value={ghToken}
                    onChange={e => setGhToken(e.target.value)}
                    className="flex-1 bg-paper2 border border-border rounded-lg px-3 py-2 text-xs font-mono text-ink placeholder:text-ink3 focus:outline-none focus:border-ink/30"
                  />
                  <button
                    onClick={() => testGhToken(ghToken)}
                    disabled={!ghToken || ghTesting}
                    className="px-4 py-2 rounded-lg border border-border text-xs font-bold text-ink2 hover:border-ink/30 disabled:opacity-40 transition-colors flex-shrink-0"
                  >
                    {ghTesting ? '…' : 'Verify'}
                  </button>
                </div>
                {ghUser && ghStatus === 'ok' && (
                  <p className="text-[10px] font-mono text-ink2">Connected as @{ghUser}</p>
                )}
                {ghStatus === 'err' && (
                  <p className="text-[10px] text-ink3">Token invalid or missing <span className="font-mono">repo</span> scope.</p>
                )}
              </>
            )}
          </ConnectRow>

          {/* Vercel status */}
          <div className={`border rounded-xl p-4 space-y-1 ${vercelReady ? 'border-border bg-paper' : 'border-border/40 bg-paper2/40'}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-ink">Vercel</p>
              {vercelReady
                ? <span className="text-[9px] font-mono font-bold text-ink2 border border-border rounded px-2 py-0.5">[✓] connected{vercelUser ? ` · ${vercelUser}` : ''}</span>
                : <span className="text-[9px] font-mono text-ink3 border border-border rounded px-2 py-0.5">not configured</span>
              }
            </div>
            <p className="text-[10px] text-ink3">
              {vercelReady
                ? 'Vercel will be deployed automatically after GitHub push — no extra step.'
                : 'Add VERCEL_TOKEN to env to enable auto-deploy. Otherwise you\'ll get a one-click import link.'}
            </p>
          </div>

          <div className="panel space-y-2">
            <p className="text-[10px] font-mono text-ink3 uppercase tracking-widest">What happens when you click Deploy</p>
            <div className="space-y-1.5">
              {[
                vercelReady
                  ? '01 → GitHub repo created and all FORGE files pushed in one commit'
                  : '01 → GitHub repo created and all FORGE files pushed in one commit',
                vercelReady
                  ? '02 → Vercel project created and production deployment triggered automatically'
                  : '02 → One-click Vercel import link provided — click it to deploy in ~2 min',
                '03 → Live URL ready to send to the client',
              ].map((s, i) => (
                <p key={i} className="text-[11px] text-ink2 font-mono">{s}</p>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep('project')}
              disabled={!canConnect}
              className="px-5 py-2.5 rounded-xl bg-ink text-paper text-sm font-bold disabled:opacity-30 hover:bg-ink/80 transition-colors"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 02: Project ─────────────────────────────────────────────── */}
      {step === 'project' && (
        <div className="space-y-4">

          {/* Connection status banner — persists from step 1 */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-paper2 border border-border text-[10px] font-mono flex-wrap">
            <span className="text-ink3">Deploying as</span>
            <span className="font-bold text-ink">@{ghUser}</span>
            <span className="text-border">·</span>
            <span className="text-ink3">GitHub</span>
            <span className="text-ink2 font-bold">[✓]</span>
            <span className="text-border">·</span>
            <span className="text-ink3">Vercel</span>
            {vercelReady
              ? <span className="text-ink2 font-bold">[✓] {vercelUser}</span>
              : <span className="text-ink3">[—] import link only</span>
            }
            <button onClick={() => setStep('connect')} className="ml-auto text-ink3 hover:text-ink transition-colors">← Change</button>
          </div>

          {builds.length === 0 ? (
            <div className="border border-border rounded-xl p-6 text-center space-y-2">
              <p className="text-sm font-bold text-ink">No FORGE build found</p>
              <p className="text-[11px] text-ink3">Run FORGE Engine first — the output will appear here automatically.</p>
              <button
                onClick={() => { window.location.href = '/shell?page=forge' }}
                className="mt-2 px-4 py-2 rounded-lg border border-border text-xs font-bold text-ink2 hover:border-ink/30 transition-colors"
              >
                ▶ Open FORGE Engine
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[9px] font-mono text-ink3 uppercase tracking-widest">
                Select build to deploy — {builds.length} build{builds.length > 1 ? 's' : ''} available
              </p>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {builds.map((b, idx) => {
                  const isSelected = build?.builtAt === b.builtAt
                  return (
                    <button
                      key={b.builtAt}
                      onClick={() => {
                        setBuild(b)
                        setRepoName(b.projectName.toLowerCase().replace(/[^a-z0-9]/g, '-'))
                      }}
                      className={`w-full text-left border rounded-xl p-3 transition-all ${
                        isSelected
                          ? 'border-ink/30 bg-ink/5'
                          : 'border-border bg-paper hover:border-ink/15'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            {idx === 0 && <span className="text-[8px] font-mono font-bold text-ink3 border border-border rounded px-1.5 py-0.5">LATEST</span>}
                            <p className="text-xs font-bold text-ink truncate">{b.projectName}</p>
                          </div>
                          <p className="text-[10px] text-ink3">{new Date(b.builtAt).toLocaleString()} · {Object.keys(b.files).length} files</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {b.score !== null && (
                            <span className="text-xs font-black text-ink tabular-nums">{b.score?.toFixed(1)}<span className="text-[9px] font-normal text-ink3">/10</span></span>
                          )}
                          <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isSelected ? 'border-ink bg-ink' : 'border-border'}`} />
                        </div>
                      </div>
                      {isSelected && (
                        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/50">
                          {Object.keys(b.files).map(f => (
                            <span key={f} className="text-[9px] font-mono bg-paper2 border border-border rounded px-1.5 py-0.5 text-ink3">{f}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {build && (
            <div className="border border-border rounded-xl p-4 bg-paper space-y-3">
              <p className="text-xs font-bold text-ink">Repository settings</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[9px] font-mono text-ink3 mb-1.5">Repository name</p>
                  <input
                    value={repoName}
                    onChange={e => setRepoName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="my-project"
                    className="w-full bg-paper2 border border-border rounded-lg px-3 py-2 text-xs font-mono text-ink placeholder:text-ink3 focus:outline-none focus:border-ink/30"
                  />
                  <p className="text-[9px] text-ink3 mt-1">github.com/{ghUser}/{repoName || '…'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-mono text-ink3 mb-1.5">Visibility</p>
                  <div className="flex gap-2">
                    {[
                      { label: 'Private', val: true  },
                      { label: 'Public',  val: false },
                    ].map(({ label, val }) => (
                      <button
                        key={label}
                        onClick={() => setIsPrivate(val)}
                        className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-colors ${
                          isPrivate === val
                            ? 'border-ink/30 bg-ink/5 text-ink'
                            : 'border-border text-ink3 hover:border-ink/20'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep('connect')} className="px-4 py-2 rounded-xl border border-border text-xs text-ink3 hover:text-ink transition-colors">← Back</button>
            <button
              onClick={() => setStep('deploy')}
              disabled={!canDeploy}
              className="px-5 py-2.5 rounded-xl bg-ink text-paper text-sm font-bold disabled:opacity-30 hover:bg-ink/80 transition-colors"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 03: Deploy ──────────────────────────────────────────────── */}
      {step === 'deploy' && (
        <div className="space-y-4">
          <div className="border border-border rounded-xl p-4 bg-paper space-y-2">
            <p className="text-xs font-bold text-ink">Ready to deploy</p>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-ink3">
              <span>Repo</span>       <span className="text-ink2">github.com/{ghUser}/{repoName}</span>
              <span>Visibility</span> <span className="text-ink2">{isPrivate ? 'Private' : 'Public'}</span>
              <span>Files</span>      <span className="text-ink2">{build ? Object.keys(build.files).length : 0} files</span>
              <span>QA score</span>   <span className="text-ink2">{build?.score?.toFixed(1) ?? '—'}/10</span>
            </div>
          </div>

          {deployLog.length > 0 && (
            <div className="border border-border rounded-xl p-3 bg-paper2 space-y-1 font-mono text-[10px] text-ink3 max-h-36 overflow-y-auto">
              {deployLog.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          )}

          {deployError && (
            <div className="border border-border rounded-xl p-3 space-y-1">
              <p className="text-[10px] font-mono font-bold text-ink3">[✗] Deploy failed</p>
              <p className="text-[11px] text-ink2">{deployError}</p>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep('project')} disabled={deploying} className="px-4 py-2 rounded-xl border border-border text-xs text-ink3 hover:text-ink disabled:opacity-40 transition-colors">← Back</button>
            <button
              onClick={runDeploy}
              disabled={deploying || !canDeploy}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ink text-paper text-sm font-bold disabled:opacity-30 hover:bg-ink/80 transition-colors"
            >
              {deploying
                ? <><span className="flex gap-0.5">{[0,1,2].map(i => <span key={i} className="w-1 h-1 rounded-full bg-paper/50 animate-pulse" style={{ animationDelay: `${i*150}ms` }} />)}</span> Pushing…</>
                : <><span>↑</span> Push to GitHub</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Step Done ────────────────────────────────────────────────────── */}
      {step === 'done' && deployResult && (
        <div className="space-y-4">
          {deployLog.length > 0 && (
            <div className="border border-border rounded-xl p-3 bg-paper2 space-y-1 font-mono text-[10px] text-ink3 max-h-36 overflow-y-auto">
              {deployLog.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          )}
          <div className="border border-border rounded-xl p-5 bg-paper space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg border border-border bg-paper3 flex items-center justify-center text-sm font-black font-mono text-ink2">✓</div>
              <div>
                <p className="text-sm font-bold text-ink">Code is on GitHub</p>
                <p className="text-[10px] text-ink3">{deployResult.files} files pushed to {deployResult.repo}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <input readOnly value={deployResult.repoUrl} className="flex-1 bg-paper2 border border-border rounded-lg px-3 py-2 text-xs font-mono text-ink2 min-w-0" />
              <button onClick={() => copyText('repo', deployResult.repoUrl)} className="px-3 py-2 rounded-lg border border-border text-[10px] font-mono text-ink3 hover:text-ink transition-colors flex-shrink-0">
                {copied === 'repo' ? '✓' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Vercel result */}
          {(deployResult as any).vercelAuto ? (
            <div className="border-2 border-border rounded-xl p-5 bg-paper space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg border border-border bg-paper3 flex items-center justify-center text-sm font-black font-mono text-ink2">✓</div>
                <div>
                  <p className="text-sm font-bold text-ink">Deployed to Vercel</p>
                  <p className="text-[10px] text-ink3">Files live — click below to open your deployment.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <input readOnly value={(deployResult as any).deployUrl ?? ''} className="flex-1 bg-paper2 border border-border rounded-lg px-3 py-2 text-xs font-mono text-ink2 min-w-0" />
                <button onClick={() => copyText('deploy', (deployResult as any).deployUrl ?? '')} className="px-3 py-2 rounded-lg border border-border text-[10px] font-mono text-ink3 hover:text-ink transition-colors flex-shrink-0">
                  {copied === 'deploy' ? '✓' : 'Copy'}
                </button>
              </div>
              <a href={(deployResult as any).deployUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border text-xs font-bold text-ink2 hover:border-ink/30 transition-colors">
                ↗ Open site
              </a>
            </div>
          ) : (
            <div className="border-2 border-border rounded-xl p-5 bg-paper space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-ink">Deploy to Vercel — one click</p>
                  <p className="text-[10px] text-ink3 mt-0.5">Vercel imports the repo and deploys in ~2 min.</p>
                </div>
                <span className="text-[9px] font-mono text-ink3 border border-border rounded px-2 py-0.5">NEXT STEP</span>
              </div>
              <a href={deployResult.vercelImport} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-ink text-paper text-sm font-bold hover:bg-ink/80 transition-colors">
                ↗ Import on Vercel
              </a>
              <p className="text-[9px] text-ink3">In Vercel: add env vars (DATABASE_URL, API keys) → Deploy. You get a <span className="font-mono">*.vercel.app</span> URL.</p>
            </div>
          )}

          {/* What's next */}
          <div className="panel space-y-2">
            <p className="text-[9px] font-mono text-ink3 uppercase tracking-widest">After Vercel deploys</p>
            {[
              'Copy the *.vercel.app URL from your Vercel dashboard',
              'Paste it into Client Delivery → Project Kickoff → "Start building" confirmation',
              'Send the live URL + PROJECT_MANIFEST.md to the client as Statement of Work',
              'For DB: run db/migrations/001_init.sql on your Supabase SQL editor (paste and run)',
            ].map((t, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="text-[9px] font-mono text-ink3 flex-shrink-0 mt-0.5">0{i+1}</span>
                <p className="text-[11px] text-ink2 leading-relaxed">{t}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setStep('project')
                setDeployResult(null)
                setDeployLog([])
              }}
              className="flex-1 py-2.5 rounded-xl border border-border text-xs font-bold text-ink3 hover:text-ink transition-colors"
            >
              Deploy another project
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // ── Manual steps (kept as secondary path) ────────────────────────────────

  const manualSteps = (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
      <section>
        <p className="sec-label mb-3">Manual Path</p>
        <h2 className="text-3xl font-bold mb-3" style={{ fontFamily: 'var(--ff-d)' }}>Step-by-step deploy guide</h2>
        <p className="text-sm text-ink3 max-w-xl">For teams that prefer full control over each step.</p>
      </section>

      <div className="card space-y-6">
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { step: '01', icon: '↓', title: 'Extract the ZIP',          body: 'Unzip the FORGE download. You\'ll find: README.md, PROJECT_MANIFEST.md, src/index.ts, db/migrations/001_init.sql, .claude/architecture.md, and a QA report.' },
            { step: '02', icon: '⚙', title: 'Set up your environment',  body: 'Create a .env file with your DATABASE_URL and API keys listed in the security report. Use architecture.md to understand which services need credentials.' },
            { step: '03', icon: '▶', title: 'Run the DB migration',     body: 'Execute db/migrations/001_init.sql. For Supabase: paste into SQL editor. For Postgres: psql $DATABASE_URL < db/migrations/001_init.sql' },
            { step: '04', icon: '+', title: 'Install and start',         body: 'npm install && npm run dev — src/index.ts is your entry point. Open localhost:3000 and confirm it loads.' },
            { step: '05', icon: '↑', title: 'Deploy to Vercel',         body: 'Push to GitHub, then import the repo in Vercel. Add your env vars in the Vercel dashboard. vercel --prod gives you a live URL.' },
            { step: '06', icon: '✓', title: 'Deliver to client',        body: 'Send the client the live URL + PROJECT_MANIFEST.md as the Statement of Work. The security report is internal — fix CRITICAL items before handoff.' },
          ].map(({ step, icon, title, body }) => (
            <div key={step} className="panel space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-ink3 font-bold">{step}</span>
                <span className="font-mono text-xs">{icon}</span>
                <span className="font-semibold text-sm">{title}</span>
              </div>
              <p className="text-xs text-ink3 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        <div className="panel bg-paper2 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="sec-label">Quick deploy commands</p>
            <button onClick={() => copyText('cmds', `psql $DATABASE_URL < db/migrations/001_init.sql\nnpm install\nnpm run dev\nnpx vercel --prod`)} className="btn btn-ghost text-xs py-1 px-3">
              {copied === 'cmds' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre className="text-xs font-mono leading-relaxed whitespace-pre overflow-x-auto">{`# 1. Run DB migration
psql $DATABASE_URL < db/migrations/001_init.sql

# 2. Install deps
npm install

# 3. Start dev
npm run dev

# 4. Deploy to Vercel
npx vercel --prod`}</pre>
        </div>
      </div>

      {/* REST API docs */}
      <div>
        <button onClick={() => setApiDocsOpen(o => !o)} className="btn btn-ghost">
          {apiDocsOpen ? '[−] Hide REST API Docs' : '[+] View REST API Docs'}
        </button>
        {apiDocsOpen && (
          <div className="card space-y-4 mt-4 animate-fadein">
            <p className="sec-label">REST API Reference</p>
            {[
              { label: 'POST /api/claude/stream — SSE streaming', code: `curl -X POST /api/claude/stream \\\n  -H "Content-Type: application/json" \\\n  -d '{"systemPrompt":"You are helpful.","userMessage":"Hello"}'`, key: 'stream' },
              { label: 'POST /api/claude/once — Single response', code: `curl -X POST /api/claude/once \\\n  -H "Content-Type: application/json" \\\n  -d '{"systemPrompt":"You are helpful.","userMessage":"Hello"}'`, key: 'once' },
            ].map(({ label, code, key }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-ink3">{label}</span>
                  <button onClick={() => copyText(key, code)} className="btn btn-ghost text-xs py-1 px-3">{copied === key ? '✓ Copied' : 'Copy'}</button>
                </div>
                <pre className="stream-box text-xs overflow-x-auto whitespace-pre p-4">{code}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ── Tab bar + render ──────────────────────────────────────────────────────

  return (
    <div>
      {/* Mode tabs */}
      <div className="border-b border-border bg-paper px-6 flex items-center gap-1">
        {([
          { key: 'auto',   label: 'One-click deploy' },
          { key: 'manual', label: 'Manual steps'     },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all -mb-px ${
              mode === tab.key
                ? 'border-ink text-ink'
                : 'border-transparent text-ink3 hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'auto'   ? autoWizard  : manualSteps}
    </div>
  )
}
