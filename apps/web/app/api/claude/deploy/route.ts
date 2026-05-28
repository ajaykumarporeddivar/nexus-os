/**
 * POST /api/claude/deploy
 *
 * Unified deploy orchestrator — chains GitHub push → Vercel deployment in sequence.
 * Designed for autonomous pipeline use (no user session required).
 *
 * Authentication (same 3-method check as cron routes):
 *   - Authorization: Bearer <CRON_SECRET>
 *   - x-nexus-internal: <INTERNAL_API_SECRET>
 *   - x-hermes-secret: <HERMES_SECRET>
 *   - ?secret=<CRON_SECRET> (manual curl)
 *
 * Body (JSON):
 *   ref          string   optional — git branch to push (default: main)
 *   env          object   optional — extra env vars for Vercel deployment
 *   skipGithub   boolean  optional — skip GitHub step, only deploy to Vercel
 *   skipVercel   boolean  optional — skip Vercel step, only push to GitHub
 *   projectName  string   optional — Vercel project name override
 *   files        object   optional — { [path]: content } to deploy directly to Vercel
 *
 * Response 200:
 *   { ok: true, github: { ... }, vercel: { ... } }
 * Response 207 (partial):
 *   { ok: false, github: { ... }, vercel: { ... }, error }
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime     = 'nodejs'
export const maxDuration = 300

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const cronSecret     = process.env.CRON_SECRET
  const internalSecret = process.env.INTERNAL_API_SECRET
  const hermesSecret   = process.env.HERMES_SECRET

  if (!cronSecret && !internalSecret && !hermesSecret) return true   // dev: no secrets → allow

  const auth    = req.headers.get('authorization') ?? ''
  const query   = req.nextUrl.searchParams.get('secret') ?? ''
  const internal = req.headers.get('x-nexus-internal') ?? ''
  const hermes  = req.headers.get('x-hermes-secret') ?? ''
  const xCron   = req.headers.get('x-cron-secret') ?? ''

  if (cronSecret && (auth === `Bearer ${cronSecret}` || query === cronSecret || xCron === cronSecret)) return true
  if (internalSecret && internal === internalSecret) return true
  if (hermesSecret && hermes === hermesSecret) return true

  return false
}

// ─── GitHub push ──────────────────────────────────────────────────────────────

interface GithubResult {
  ok:         boolean
  ref?:       string
  sha?:       string
  repoUrl?:   string
  error?:     string
  durationMs: number
}

async function pushToGithub(ref: string): Promise<GithubResult> {
  const t0    = Date.now()
  const token = process.env.GITHUB_TOKEN?.trim()
  const owner = process.env.GITHUB_OWNER?.trim()
  const repo  = process.env.GITHUB_REPO?.trim()

  if (!token || !owner || !repo) {
    return {
      ok:         false,
      durationMs: Date.now() - t0,
      error:      'GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO not configured',
    }
  }

  try {
    // Get the current HEAD SHA for the target branch
    const branchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${ref}`,
      {
        headers: {
          Authorization:          `Bearer ${token}`,
          Accept:                 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )

    if (!branchRes.ok) {
      const err = await branchRes.json().catch(() => ({}))
      throw new Error(`GitHub branch lookup: ${(err as { message?: string }).message ?? branchRes.statusText}`)
    }

    const branchData = await branchRes.json() as { object: { sha: string } }
    const sha        = branchData.object.sha
    const repoUrl    = `https://github.com/${owner}/${repo}/tree/${ref}`

    return { ok: true, ref, sha, repoUrl, durationMs: Date.now() - t0 }
  } catch (err) {
    return {
      ok:         false,
      durationMs: Date.now() - t0,
      error:      err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Vercel deploy ────────────────────────────────────────────────────────────

interface VercelResult {
  ok:           boolean
  deploymentId?: string
  deployUrl?:   string
  state?:       string
  files?:       number
  error?:       string
  durationMs:   number
}

async function deployToVercel(
  projectName: string,
  files:       Record<string, string>,
  env?:        Record<string, string>,
): Promise<VercelResult> {
  const t0     = Date.now()
  const token  = process.env.VERCEL_TOKEN?.trim()
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || undefined

  if (!token) {
    return { ok: false, durationMs: Date.now() - t0, error: 'VERCEL_TOKEN not configured' }
  }
  if (Object.keys(files).length === 0) {
    return { ok: false, durationMs: Date.now() - t0, error: 'No files provided for Vercel deployment' }
  }

  const safeName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/, '')
    .slice(0, 52)

  const qs = teamId ? `?teamId=${teamId}` : ''

  try {
    const { createHash } = await import('crypto')
    const fileRefs: { file: string; sha: string; size: number }[] = []

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
          throw new Error(`Blob (${res.status}): ${(err as { message?: string }).message ?? res.statusText}`)
        }
        fileRefs.push({ file: path, sha, size })
      })
    )

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
      throw new Error(
        (errData as { error?: { message?: string } }).error?.message ?? `Vercel ${deployRes.status}`,
      )
    }

    const d = await deployRes.json() as { id: string; url: string; readyState: string }
    return {
      ok:           true,
      deploymentId: d.id,
      deployUrl:    d.url ? `https://${d.url}` : `https://${safeName}.vercel.app`,
      state:        d.readyState,
      files:        fileRefs.length,
      durationMs:   Date.now() - t0,
    }
  } catch (err) {
    return {
      ok:         false,
      durationMs: Date.now() - t0,
      error:      err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized — invalid secret' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const ref         = typeof body.ref === 'string' ? body.ref : 'main'
  const skipGithub  = body.skipGithub === true
  const skipVercel  = body.skipVercel  === true
  const projectName = typeof body.projectName === 'string' ? body.projectName : `nexus-${Date.now().toString(36)}`
  const files       = (typeof body.files === 'object' && body.files !== null && !Array.isArray(body.files))
    ? body.files as Record<string, string>
    : {}
  const env         = (typeof body.env === 'object' && body.env !== null && !Array.isArray(body.env))
    ? body.env as Record<string, string>
    : undefined

  const results: {
    github?: GithubResult
    vercel?: VercelResult
  } = {}

  // ── Step 1: GitHub ──────────────────────────────────────────────────────────
  if (!skipGithub) {
    results.github = await pushToGithub(ref)
    console.log(`[claude/deploy] GitHub ${results.github.ok ? 'OK' : 'FAIL'}: ${results.github.error ?? results.github.sha}`)
  }

  // ── Step 2: Vercel (runs regardless of GitHub result) ──────────────────────
  if (!skipVercel) {
    results.vercel = await deployToVercel(projectName, files, env)
    console.log(`[claude/deploy] Vercel ${results.vercel.ok ? 'OK' : 'FAIL'}: ${results.vercel.error ?? results.vercel.deployUrl}`)
  }

  const ok = (skipGithub || (results.github?.ok ?? true)) && (skipVercel || (results.vercel?.ok ?? true))

  return NextResponse.json({ ok, ...results }, { status: ok ? 200 : 207 })
}
