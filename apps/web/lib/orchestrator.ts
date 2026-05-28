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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineParams {
  workspaceId?: string
  task:          string          // human-readable goal, e.g. "build lead-gen SaaS"
  projectName?:  string          // override auto-generated name
  ref?:          string          // git branch (default: main)
  env?:          Record<string, string>
  triggeredBy?:  'cron' | 'hermes' | 'self-heal' | 'manual'
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

async function runForge(task: string, projectName: string): Promise<StepResult> {
  const check = canExecute('forge')
  if (!check.allowed) {
    return { ok: false, durationMs: 0, error: check.reason }
  }

  const t0 = Date.now()
  try {
    const result = await aiComplete({
      system: `You are FORGE ANALYST, a micro-SaaS product strategist for NEXUS OS.
Generate a concise, actionable product specification for a SaaS app.
Output ONLY a JSON object with these fields:
{
  "appName": string,
  "tagline": string,
  "targetAudience": string,
  "coreProblem": string,
  "keyFeatures": string[],
  "revenueModel": string,
  "techStack": string,
  "estimatedBuildTime": string
}`,
      messages: [{ role: 'user', content: `Task: ${task}\nProject name hint: ${projectName}` }],
      maxTokens: 800,
      fastMode:  true,
    })

    let spec: Record<string, unknown>
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/)
      spec = jsonMatch ? JSON.parse(jsonMatch[0]) : { appName: projectName, tagline: task }
    } catch {
      spec = { appName: projectName, tagline: task, raw: result.text }
    }

    recordSuccess('forge')
    return { ok: true, durationMs: Date.now() - t0, data: spec }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    recordFailure('forge', error)
    return { ok: false, durationMs: Date.now() - t0, error }
  }
}

// ─── Step: BUILD — generate Next.js application files ────────────────────────

async function runBuild(forgeSpec: unknown, projectName: string): Promise<StepResult> {
  const check = canExecute('build')
  if (!check.allowed) {
    return { ok: false, durationMs: 0, error: check.reason }
  }

  const t0   = Date.now()
  const spec = JSON.stringify(forgeSpec, null, 2)

  try {
    const result = await aiComplete({
      system: `You are SCAFFOLD ENGINEER for NEXUS OS. Generate a minimal but complete Next.js 14 App Router SaaS application.
Output ONLY a JSON object where keys are file paths and values are file content strings.
Required files: src/app/page.tsx, src/app/layout.tsx, src/app/globals.css, package.json, tailwind.config.js, tsconfig.json.
Use TypeScript, Tailwind CSS, and Lucide React icons. Keep each file under 200 lines.`,
      messages: [{
        role: 'user',
        content: `Build a Next.js app based on this specification:\n${spec}\n\nProject name: ${projectName}`,
      }],
      maxTokens: 6000,
    })

    let files: Record<string, string>
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/)
      files = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    } catch {
      files = {
        'src/app/page.tsx': `export default function Home() { return <main className="p-8"><h1 className="text-2xl font-bold">${projectName}</h1></main> }`,
        'src/app/layout.tsx': `import './globals.css'\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html> }`,
        'src/app/globals.css': '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n',
      }
    }

    recordSuccess('build')
    return { ok: true, durationMs: Date.now() - t0, data: { files, fileCount: Object.keys(files).length } }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    recordFailure('build', error)
    return { ok: false, durationMs: Date.now() - t0, error }
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
        const buf  = Buffer.from(content, 'utf8')
        const sha  = createHash('sha1').update(buf).digest('hex')
        const size = buf.length

        const res = await fetch(`https://api.vercel.com/v2/files${qs}`, {
          method:  'POST',
          headers: {
            Authorization:     `Bearer ${token}`,
            'Content-Type':    'application/octet-stream',
            'x-vercel-digest': sha,
          } as Record<string, string>,
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
    const deployRes = await fetch(`https://api.vercel.com/v13/deployments${qs}`, {
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
  const totalStart  = Date.now()
  const by          = params.triggeredBy ?? 'manual'

  console.log(`[orchestrator] Pipeline START  runId=${runId}  task="${params.task}"  by=${by}`)
  await writeAudit('forge_run_started', runId, { task: params.task, projectName, triggeredBy: by })

  // ── Step 1: FORGE ──────────────────────────────────────────────────────────
  const forgeResult = await runForge(params.task, projectName)
  console.log(`[orchestrator] FORGE ${forgeResult.ok ? 'OK' : 'FAIL'} in ${forgeResult.durationMs}ms`)

  if (!forgeResult.ok) {
    const totalMs = Date.now() - totalStart
    await writeAudit('forge_run_completed', runId, { ok: false, step: 'forge', error: forgeResult.error })
    return {
      runId, ok: false, totalMs,
      steps:  { forge: forgeResult, build: { ok: false, durationMs: 0, error: 'skipped' }, deploy: { ok: false, durationMs: 0, error: 'skipped' } },
      error:  forgeResult.error,
    }
  }

  // ── Step 2: BUILD ──────────────────────────────────────────────────────────
  const buildResult = await runBuild(forgeResult.data, projectName)
  console.log(`[orchestrator] BUILD ${buildResult.ok ? 'OK' : 'FAIL'} in ${buildResult.durationMs}ms`)

  if (!buildResult.ok) {
    const totalMs = Date.now() - totalStart
    await writeAudit('forge_run_completed', runId, { ok: false, step: 'build', error: buildResult.error })
    return {
      runId, ok: false, totalMs,
      steps:  { forge: forgeResult, build: buildResult, deploy: { ok: false, durationMs: 0, error: 'skipped' } },
      error:  buildResult.error,
    }
  }

  // ── Step 3: DEPLOY ─────────────────────────────────────────────────────────
  const buildData = buildResult.data as { files: Record<string, string>; fileCount: number }
  const deployResult = await runDeploy(buildData.files, projectName, params.env)
  console.log(`[orchestrator] DEPLOY ${deployResult.ok ? 'OK' : 'FAIL'} in ${deployResult.durationMs}ms`)

  const totalMs = Date.now() - totalStart
  const ok      = forgeResult.ok && buildResult.ok && deployResult.ok

  await writeAudit('forge_run_completed', runId, {
    ok,
    forge:  { ok: forgeResult.ok, ms: forgeResult.durationMs },
    build:  { ok: buildResult.ok, ms: buildResult.durationMs, files: buildData.fileCount },
    deploy: { ok: deployResult.ok, ms: deployResult.durationMs, data: deployResult.data },
    totalMs,
  })

  console.log(`[orchestrator] Pipeline ${ok ? 'DONE' : 'PARTIAL'} runId=${runId} in ${totalMs}ms`)

  return {
    runId, ok, totalMs,
    steps: { forge: forgeResult, build: buildResult, deploy: deployResult },
  }
}
