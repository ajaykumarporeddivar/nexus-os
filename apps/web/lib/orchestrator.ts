/**
 * NEXUS OS Pipeline Orchestrator — server-side autonomous FORGE → BUILD → DEPLOY chain.
 *
 * Design principles:
 *   - No HTTP round-trips through session-protected routes (imports directly)
 *   - Circuit breaker: 3 consecutive failures → 60 s cooldown per step
 *   - Audit: writes AuditEvent rows directly via Prisma (no session needed server-side)
 *   - Redis: persists run state for crash-recovery via pipeline/[runId] key
 *   - Callable by: cron jobs, /api/pipeline/trigger, /api/cron/self-heal, /api/hermes/dispatch
 */

import { randomUUID } from 'crypto'
import { aiComplete } from '@/lib/ai'
import { prisma } from '@/lib/prisma'
import {
  createPipelineRun,
  updatePipelineStep,
  completePipelineRun,
} from '@/lib/pipelineState'
import {
  runForgeGate,
  runBuildGate,
  logControlDecision,
} from '@/lib/controlEngine'
import { runForgeChain } from '@/lib/forgeChain'
import { runBuildChain } from '@/lib/buildChain'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineParams {
  workspaceId?: string
  task:          string          // human-readable goal, e.g. "build lead-gen SaaS"
  projectName?:  string          // override auto-generated name
  ref?:          string          // git branch (default: main)
  env?:          Record<string, string>
  triggeredBy?:  'cron' | 'hermes' | 'self-heal' | 'manual'
  vertical?:     string          // domain vertical hint (saas/marketplace/dashboard/etc.)
  skipGates?:    boolean         // bypass L2.75 control gates (admin/testing only)
}

export interface StepResult {
  ok:         boolean
  durationMs: number
  error?:     string
  data?:      unknown
}

export interface PipelineResult {
  runId:    string
  ok:       boolean
  steps:    {
    forge:  StepResult
    build:  StepResult
    deploy: StepResult
  }
  totalMs:  number
  error?:   string
  liveUrl?: string   // surfaced from steps.deploy.data.deployUrl for convenience
  qaScore?: number   // not available from the single-call orchestrator
}

// ─── Circuit Breaker (in-memory per process) ──────────────────────────────────

interface CBState {
  failures:     number
  openUntil:    number   // epoch ms when half-open retry is allowed
  lastError?:   string
}

const CB_FAILURE_THRESHOLD = 3
const CB_RESET_MS          = 60_000

const circuitBreakers: Record<string, CBState> = {}

function cbKey(step: string): string { return `cb:${step}` }

function canExecute(step: string): { allowed: boolean; reason?: string } {
  const cb = circuitBreakers[cbKey(step)]
  if (!cb) return { allowed: true }
  if (cb.openUntil > Date.now()) {
    return { allowed: false, reason: `Circuit open (${step}): ${cb.lastError}. Resets in ${Math.ceil((cb.openUntil - Date.now()) / 1000)}s` }
  }
  return { allowed: true }
}

function recordSuccess(step: string): void {
  circuitBreakers[cbKey(step)] = { failures: 0, openUntil: 0 }
}

function recordFailure(step: string, error: string): void {
  const key = cbKey(step)
  const cb  = circuitBreakers[key] ?? { failures: 0, openUntil: 0 }
  cb.failures++
  cb.lastError = error
  if (cb.failures >= CB_FAILURE_THRESHOLD) {
    cb.openUntil = Date.now() + CB_RESET_MS
    console.warn(`[orchestrator] Circuit OPEN for step "${step}" after ${cb.failures} failures. Resets at ${new Date(cb.openUntil).toISOString()}`)
  }
  circuitBreakers[key] = cb
}

// ─── Audit helper (server-side direct Prisma write) ──────────────────────────

async function writeAudit(action: string, runId: string, meta: Record<string, unknown>): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action,
        sessionId: `orchestrator-${runId}`,
        meta: { runId, ...meta },
      },
    })
  } catch (err) {
    console.error('[orchestrator] Audit write failed:', err)
    // Non-blocking — audit failure never halts the pipeline
  }
}

// ─── Step: FORGE — generate a SaaS concept spec ──────────────────────────────

function sanitiseTask(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[INST\]|\[\/INST\]|<s>|<\/s>|<\|im_start\|>|<\|im_end\|>|<\|eot_id\|>/gi, '')
    .replace(/^(SYSTEM|USER|ASSISTANT|HUMAN|AI)\s*:/gim, '')
    .replace(/ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi, '')
    .trim()
}

// ─── Step: FORGE — 12-agent chain (full quality parity with PipelinePage) ─────
//
// Set ORCHESTRATOR_FULL_CHAIN=0 to fall back to the legacy single-call stub.

async function runForge(task: string, projectName: string, vertical?: string): Promise<StepResult> {
  const check = canExecute('forge')
  if (!check.allowed) return { ok: false, durationMs: 0, error: check.reason }
  const t0 = Date.now()

  if (process.env.ORCHESTRATOR_FULL_CHAIN !== '0') {
    try {
      const chain = await runForgeChain(sanitiseTask(task), projectName, vertical)
      recordSuccess('forge')
      return {
        ok: true, durationMs: Date.now() - t0,
        data: { chain, specContract: chain.specContract, qaScore: chain.qaScore, vertical: chain.vertical },
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      recordFailure('forge', error)
      return { ok: false, durationMs: Date.now() - t0, error }
    }
  }

  // Legacy stub (ORCHESTRATOR_FULL_CHAIN=0)
  try {
    const result = await aiComplete({
      system: `You are FORGE ANALYST. Output ONLY a JSON object: { "appName": string, "tagline": string, "targetAudience": string, "coreProblem": string, "keyFeatures": string[], "revenueModel": string, "techStack": string, "estimatedBuildTime": string }`,
      messages: [{ role: 'user', content: `Task: ${sanitiseTask(task)}\nProject name hint: ${projectName}` }],
      maxTokens: 800, fastMode: true,
    })
    let spec: Record<string, unknown>
    try {
      const m = result.text.match(/\{[\s\S]*\}/)
      spec = m ? JSON.parse(m[0]) : { appName: projectName, tagline: task }
    } catch { spec = { appName: projectName, tagline: task, raw: result.text } }
    recordSuccess('forge')
    return { ok: true, durationMs: Date.now() - t0, data: spec }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    recordFailure('forge', error)
    return { ok: false, durationMs: Date.now() - t0, error }
  }
}

// ─── Step: BUILD — 10-agent chain (full quality parity with PipelinePage) ─────

async function runBuild(forgeResult: StepResult, task: string, projectName: string): Promise<StepResult> {
  const check = canExecute('build')
  if (!check.allowed) return { ok: false, durationMs: 0, error: check.reason }
  const t0 = Date.now()

  if (process.env.ORCHESTRATOR_FULL_CHAIN !== '0') {
    try {
      const forgeData = forgeResult.data as { chain?: import('@/lib/forgeChain').ForgeChainResult } | undefined
      const forgeChain = forgeData?.chain
      if (!forgeChain) throw new Error('FORGE chain result missing — cannot run full BUILD chain')
      const build = await runBuildChain(forgeChain, projectName, task)
      recordSuccess('build')
      return { ok: true, durationMs: Date.now() - t0, data: { files: build.files, fileCount: build.fileCount } }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      recordFailure('build', error)
      return { ok: false, durationMs: Date.now() - t0, error }
    }
  }

  // Legacy stub (ORCHESTRATOR_FULL_CHAIN=0)
  const t0l = Date.now()
  const spec = JSON.stringify(forgeResult.data, null, 2)
  try {
    const result = await aiComplete({
      system: `You are SCAFFOLD ENGINEER. Output ONLY a JSON object where keys are file paths and values are file content strings. Required: src/app/page.tsx, src/app/layout.tsx, src/app/globals.css, package.json, tailwind.config.js, tsconfig.json.`,
      messages: [{ role: 'user', content: `Build a Next.js app based on:\n${spec}\nProject name: ${projectName}` }],
      maxTokens: 6000,
    })
    let files: Record<string, string>
    try {
      const stripped = result.text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '')
      const jsonMatch = stripped.match(/\{[\s\S]*\}/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
        files = parsed as Record<string, string>
      } else throw new Error('not a file map')
    } catch {
      files = {
        'src/app/page.tsx': `export default function Home() { return <main className="p-8"><h1 className="text-2xl font-bold">${projectName}</h1></main> }`,
        'src/app/layout.tsx': `import './globals.css'\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html> }`,
        'src/app/globals.css': '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n',
        'package.json': `{"name":"${projectName.toLowerCase().replace(/[^a-z0-9-]/g,'-')}","version":"0.1.0","private":true,"scripts":{"dev":"next dev","build":"next build","start":"next start"},"dependencies":{"next":"14.2.0","react":"^18","react-dom":"^18"},"devDependencies":{"typescript":"^5","@types/node":"^20","@types/react":"^18","tailwindcss":"^3","autoprefixer":"^10","postcss":"^8"}}`,
        'tsconfig.json': '{"compilerOptions":{"target":"es2017","lib":["dom","dom.iterable","esnext"],"allowJs":true,"skipLibCheck":true,"strict":true,"noEmit":true,"esModuleInterop":true,"module":"esnext","moduleResolution":"bundler","resolveJsonModule":true,"isolatedModules":true,"jsx":"preserve","incremental":true,"plugins":[{"name":"next"}],"paths":{"@/*":["./src/*"]}},"include":["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"],"exclude":["node_modules"]}',
      }
    }
    recordSuccess('build')
    return { ok: true, durationMs: Date.now() - t0l, data: { files, fileCount: Object.keys(files).length } }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    recordFailure('build', error)
    return { ok: false, durationMs: Date.now() - t0l, error }
  }
}

// ─── Step: DEPLOY — push to Vercel via direct API ────────────────────────────

async function runDeploy(
  files:       Record<string, string>,
  projectName: string,
  env?:        Record<string, string>,
): Promise<StepResult> {
  const check = canExecute('deploy')
  if (!check.allowed) {
    return { ok: false, durationMs: 0, error: check.reason }
  }

  const t0    = Date.now()
  const token = process.env.VERCEL_TOKEN?.trim()
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || undefined

  if (!token) {
    return { ok: false, durationMs: Date.now() - t0, error: 'VERCEL_TOKEN not configured' }
  }

  const safeName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/, '')
    .slice(0, 52)

  try {
    // Upload file blobs to Vercel
    const { createHash } = await import('crypto')
    const fileRefs: { file: string; sha: string; size: number }[] = []
    const qs = teamId ? `?teamId=${teamId}` : ''

    await Promise.all(
      Object.entries(files).map(async ([path, content]) => {
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
        const buf  = Buffer.from(contentStr, 'utf8')
        const sha  = createHash('sha1').update(buf).digest('hex')
        const size = buf.length

        const res = await fetch(`https://api.vercel.com/v2/files${qs}`, {
          method:  'POST',
          headers: {
            'Authorization':   `Bearer ${token}`,
            'Content-Type':    'application/octet-stream',
            'x-vercel-digest': sha,
          },
          body: new Uint8Array(buf),
        })

        if (res.status !== 200 && res.status !== 409) {
          const err = await res.json().catch(() => ({}))
          throw new Error(`Blob upload (${res.status}): ${(err as { message?: string }).message ?? res.statusText}`)
        }
        fileRefs.push({ file: path, sha, size })
      })
    )

    // Create deployment
    const deployRes = await fetch(`https://api.vercel.com/v13/deployments${qs ? qs + '&' : '?'}skipAutoDetectionConfirmation=1`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name:           safeName,
        files:          fileRefs,
        framework:      'nextjs',
        target:         'production',
        installCommand: 'npm install --legacy-peer-deps',
        buildCommand:   'next build',
        env:            env ?? {},
      }),
    })

    if (!deployRes.ok) {
      const errData = await deployRes.json().catch(() => ({}))
      const msg = (errData as { error?: { message?: string } }).error?.message ?? `Vercel ${deployRes.status}`
      throw new Error(msg)
    }

    const deployment = await deployRes.json() as { id: string; url: string; readyState: string }
    const deployUrl  = deployment.url ? `https://${deployment.url}` : `https://${safeName}.vercel.app`

    recordSuccess('deploy')
    return {
      ok:        true,
      durationMs: Date.now() - t0,
      data: {
        deploymentId: deployment.id,
        deployUrl,
        state:        deployment.readyState,
        files:        fileRefs.length,
      },
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    recordFailure('deploy', error)
    return { ok: false, durationMs: Date.now() - t0, error }
  }
}

// ─── Main export: triggerPipeline ─────────────────────────────────────────────

export async function triggerPipeline(params: PipelineParams): Promise<PipelineResult> {
  const runId       = randomUUID()
  const projectName = params.projectName ?? `nexus-${Date.now().toString(36)}`
  // Sanitize task at entry — prevents prompt injection in server-side runs
  params = { ...params, task: sanitiseTask(params.task) }
  const totalStart  = Date.now()
  const by          = params.triggeredBy ?? 'manual'

  console.log(`[orchestrator] Pipeline START  runId=${runId}  task="${params.task}"  by=${by}`)
  await Promise.all([
    writeAudit('forge_run_started', runId, { task: params.task, projectName, triggeredBy: by }),
    createPipelineRun(runId, params.task, projectName, by),   // ← Redis state init
  ])

  // ── Step 1: FORGE ──────────────────────────────────────────────────────────
  await updatePipelineStep(runId, 'forge', { status: 'running', startedAt: new Date().toISOString() })
  const forgeResult = await runForge(params.task, projectName, params.vertical)
  console.log(`[orchestrator] FORGE ${forgeResult.ok ? 'OK' : 'FAIL'} in ${forgeResult.durationMs}ms`)
  await updatePipelineStep(runId, 'forge', {
    status:     forgeResult.ok ? 'done' : 'failed',
    doneAt:     new Date().toISOString(),
    durationMs: forgeResult.durationMs,
    error:      forgeResult.error,
    data:       forgeResult.ok ? forgeResult.data : undefined,
  })

  if (!forgeResult.ok) {
    const totalMs = Date.now() - totalStart
    await Promise.all([
      writeAudit('forge_run_completed', runId, { ok: false, step: 'forge', error: forgeResult.error }),
      completePipelineRun(runId, false, totalMs, forgeResult.error),
    ])
    return {
      runId, ok: false, totalMs,
      steps:  { forge: forgeResult, build: { ok: false, durationMs: 0, error: 'skipped' }, deploy: { ok: false, durationMs: 0, error: 'skipped' } },
      error:  forgeResult.error,
    }
  }

  // ── L2.75 FORGE Gate ─────────────────────────────────────────────────────────
  // Full chain mode: use actual QA score and spec contract from the 12-agent run.
  // Legacy stub mode: derive coarse score from field presence.
  const forgeData = forgeResult.data as Record<string, unknown> | undefined
  const chainResult = forgeData?.chain as { specContract?: string; qaScore?: number | null } | undefined
  const forgeSpecContract = chainResult?.specContract ?? (forgeData ? JSON.stringify(forgeData) : '')
  const forgeQaScore = chainResult?.qaScore != null
    ? chainResult.qaScore
    : (() => {
        const hasFields = forgeData &&
          typeof forgeData.appName === 'string'     && (forgeData.appName as string).length > 2 &&
          typeof forgeData.coreProblem === 'string' && (forgeData.coreProblem as string).length > 10 &&
          Array.isArray(forgeData.keyFeatures)      && (forgeData.keyFeatures as unknown[]).length >= 2
        return hasFields ? 8.0 : (forgeData ? 5.0 : 0)
      })()

  const forgeGate    = params.skipGates ? { allowed: true, checks: [], blocking: null } : await runForgeGate({
    qaScore:      forgeQaScore,
    briefText:    params.task,
    specContract: forgeSpecContract,
    projectName,
    vertical:     params.vertical,
  })
  if (!params.skipGates) await logControlDecision(runId, 'forge', forgeGate)
  console.log(`[orchestrator] FORGE GATE ${forgeGate.allowed ? 'PASS' : 'BLOCK'}: ${forgeGate.blocking?.reason ?? 'all checks passed'}`)

  if (!forgeGate.allowed) {
    const gateError = `L2.75 Control Gate blocked BUILD: ${forgeGate.blocking?.reason}`
    const totalMs   = Date.now() - totalStart
    await Promise.all([
      writeAudit('forge_run_completed', runId, { ok: false, step: 'forge_gate', error: gateError, gate: forgeGate }),
      completePipelineRun(runId, false, totalMs, gateError),
    ])
    return {
      runId, ok: false, totalMs,
      steps:  { forge: forgeResult, build: { ok: false, durationMs: 0, error: gateError }, deploy: { ok: false, durationMs: 0, error: 'skipped' } },
      error:  gateError,
    }
  }

  // ── Step 2: BUILD ──────────────────────────────────────────────────────────
  await updatePipelineStep(runId, 'build', { status: 'running', startedAt: new Date().toISOString() })
  const buildResult = await runBuild(forgeResult, params.task, projectName)
  console.log(`[orchestrator] BUILD ${buildResult.ok ? 'OK' : 'FAIL'} in ${buildResult.durationMs}ms`)
  await updatePipelineStep(runId, 'build', {
    status:     buildResult.ok ? 'done' : 'failed',
    doneAt:     new Date().toISOString(),
    durationMs: buildResult.durationMs,
    error:      buildResult.error,
  })

  if (!buildResult.ok) {
    const totalMs = Date.now() - totalStart
    await Promise.all([
      writeAudit('forge_run_completed', runId, { ok: false, step: 'build', error: buildResult.error }),
      completePipelineRun(runId, false, totalMs, buildResult.error),
    ])
    return {
      runId, ok: false, totalMs,
      steps:  { forge: forgeResult, build: buildResult, deploy: { ok: false, durationMs: 0, error: 'skipped' } },
      error:  buildResult.error,
    }
  }

  // ── L2.75 BUILD Gate — file count + deployment readiness ──────────────────
  const buildData = buildResult.data as { files: Record<string, string>; fileCount: number }
  const buildGate = params.skipGates ? { allowed: true, checks: [], blocking: null } : runBuildGate({ files: buildData.files })
  if (!params.skipGates) await logControlDecision(runId, 'build', buildGate)
  console.log(`[orchestrator] BUILD GATE ${buildGate.allowed ? 'PASS' : 'BLOCK'}: ${buildGate.blocking?.reason ?? 'all checks passed'}`)

  if (!buildGate.allowed) {
    const gateError = `L2.75 Control Gate blocked DEPLOY: ${buildGate.blocking?.reason}`
    const totalMs   = Date.now() - totalStart
    await Promise.all([
      writeAudit('forge_run_completed', runId, { ok: false, step: 'build_gate', error: gateError, gate: buildGate }),
      completePipelineRun(runId, false, totalMs, gateError),
    ])
    return {
      runId, ok: false, totalMs,
      steps:  { forge: forgeResult, build: buildResult, deploy: { ok: false, durationMs: 0, error: gateError } },
      error:  gateError,
    }
  }

  // ── Step 3: DEPLOY ─────────────────────────────────────────────────────────
  await updatePipelineStep(runId, 'deploy', { status: 'running', startedAt: new Date().toISOString() })
  const deployResult = await runDeploy(buildData.files, projectName, params.env)
  console.log(`[orchestrator] DEPLOY ${deployResult.ok ? 'OK' : 'FAIL'} in ${deployResult.durationMs}ms`)
  await updatePipelineStep(runId, 'deploy', {
    status:     deployResult.ok ? 'done' : 'failed',
    doneAt:     new Date().toISOString(),
    durationMs: deployResult.durationMs,
    error:      deployResult.error,
    data:       deployResult.ok ? deployResult.data : undefined,
  })

  const totalMs = Date.now() - totalStart
  const ok      = forgeResult.ok && buildResult.ok && deployResult.ok

  await Promise.all([
    writeAudit('forge_run_completed', runId, {
      ok,
      forge:  { ok: forgeResult.ok, ms: forgeResult.durationMs },
      build:  { ok: buildResult.ok, ms: buildResult.durationMs, files: buildData.fileCount },
      deploy: { ok: deployResult.ok, ms: deployResult.durationMs, data: deployResult.data },
      totalMs,
    }),
    completePipelineRun(runId, ok, totalMs),
  ])

  const deployData = deployResult.data as { deployUrl?: string } | undefined
  const liveUrl    = deployData?.deployUrl ?? undefined

  console.log(`[orchestrator] Pipeline ${ok ? 'DONE' : 'PARTIAL'} runId=${runId} in ${totalMs}ms${liveUrl ? ` url=${liveUrl}` : ''}`)

  return {
    runId, ok, totalMs, liveUrl,
    steps: { forge: forgeResult, build: buildResult, deploy: deployResult },
  }
}
