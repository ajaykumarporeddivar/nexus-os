#!/usr/bin/env node
/**
 * NEXUS OS — One-command setup wizard
 *
 * Usage:
 *   node scripts/setup.mjs          # interactive
 *   node scripts/setup.mjs --yes    # non-interactive (uses defaults / existing values)
 *   node scripts/setup.mjs --check  # health check only, no changes
 *
 * What this does:
 *   1. Checks Node.js ≥ 18 and pnpm
 *   2. Copies .env.example → .env if .env doesn't exist
 *   3. Auto-generates NEXTAUTH_SECRET, CRON_SECRET, ENCRYPTION_SECRET
 *   4. Prompts for required keys (DATABASE_URL, ANTHROPIC_API_KEY, etc.)
 *   5. Runs pnpm install
 *   6. Runs prisma db push
 *   7. Validates the setup with a readiness report
 *   8. Optionally opens localhost:3000
 */

import { execSync, spawn }     from 'child_process'
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs'
import { createInterface }      from 'readline'
import { randomBytes }          from 'crypto'
import { resolve, dirname }     from 'path'
import { fileURLToPath }        from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = resolve(__dirname, '..')
const ENV_FILE  = resolve(ROOT, '.env')
const ENV_EXAMPLE = resolve(ROOT, '.env.example')

const YES  = process.argv.includes('--yes')
const CHECK = process.argv.includes('--check')

// ─── Colours ──────────────────────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  acid:   '\x1b[38;2;200;242;60m',
}

const ok   = (msg) => console.log(`${c.green}  ✓${c.reset} ${msg}`)
const warn = (msg) => console.log(`${c.yellow}  ⚠${c.reset} ${msg}`)
const err  = (msg) => console.log(`${c.red}  ✗${c.reset} ${msg}`)
const info = (msg) => console.log(`${c.dim}  →${c.reset} ${msg}`)
const head = (msg) => console.log(`\n${c.acid}${c.bold}${msg}${c.reset}`)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readEnv(file) {
  if (!existsSync(file)) return {}
  const vars = {}
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    vars[key] = val
  }
  return vars
}

function writeEnv(file, vars) {
  // Read existing file to preserve comments and ordering
  let content = existsSync(file) ? readFileSync(file, 'utf-8') : readFileSync(ENV_EXAMPLE, 'utf-8')
  for (const [key, val] of Object.entries(vars)) {
    const escaped = val.includes(' ') || val.includes('#') ? `"${val}"` : val
    const pattern = new RegExp(`^${key}=.*$`, 'm')
    if (pattern.test(content)) {
      content = content.replace(pattern, `${key}=${escaped}`)
    } else {
      content += `\n${key}=${escaped}`
    }
  }
  writeFileSync(file, content, 'utf-8')
}

function generateSecret(bytes = 32) {
  return randomBytes(bytes).toString('base64').replace(/[+/=]/g, '').slice(0, bytes * 1.3 | 0)
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit', cwd: ROOT, ...opts })
  } catch (e) {
    if (!opts.noThrow) throw e
    return null
  }
}

function runSilent(cmd) {
  return run(cmd, { silent: true, noThrow: true })
}

async function prompt(question, defaultVal = '') {
  if (YES) return defaultVal
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    const display = defaultVal ? `${question} [${c.dim}${defaultVal}${c.reset}]: ` : `${question}: `
    rl.question(display, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultVal)
    })
  })
}

// ─── Step 1: Prerequisites ────────────────────────────────────────────────────

function checkPrerequisites() {
  head('Step 1 — Prerequisites')

  // Node.js version
  const nodeVersion = process.versions.node
  const [major] = nodeVersion.split('.').map(Number)
  if (major < 18) {
    err(`Node.js ${nodeVersion} detected. Need ≥ 18.`)
    process.exit(1)
  }
  ok(`Node.js ${nodeVersion}`)

  // pnpm
  const pnpmOut = runSilent('pnpm --version')
  if (!pnpmOut) {
    err('pnpm not found. Install: npm i -g pnpm')
    process.exit(1)
  }
  ok(`pnpm ${pnpmOut.toString().trim()}`)

  // git
  const gitOut = runSilent('git --version')
  if (gitOut) ok(`git ${gitOut.toString().split(' ')[2]?.trim()}`)
  else warn('git not found — version control unavailable')
}

// ─── Step 2: Env file ─────────────────────────────────────────────────────────

async function setupEnv() {
  head('Step 2 — Environment')

  if (!existsSync(ENV_FILE)) {
    if (existsSync(ENV_EXAMPLE)) {
      copyFileSync(ENV_EXAMPLE, ENV_FILE)
      ok('.env created from .env.example')
    } else {
      writeFileSync(ENV_FILE, '', 'utf-8')
      ok('.env created (empty)')
    }
  } else {
    ok('.env already exists')
  }

  const vars = readEnv(ENV_FILE)
  const updates = {}

  // Auto-generate secrets if missing
  for (const key of ['NEXTAUTH_SECRET', 'CRON_SECRET', 'ENCRYPTION_SECRET']) {
    if (!vars[key] || vars[key].startsWith('generate') || vars[key].startsWith('your-')) {
      updates[key] = generateSecret(32)
      ok(`${key} auto-generated`)
    } else {
      ok(`${key} already set`)
    }
  }

  // NEXTAUTH_URL default
  if (!vars['NEXTAUTH_URL'] || vars['NEXTAUTH_URL'].includes('your-')) {
    updates['NEXTAUTH_URL'] = 'http://localhost:3000'
    updates['NEXT_PUBLIC_APP_URL'] = 'http://localhost:3000'
    ok('NEXTAUTH_URL set to http://localhost:3000')
  }

  if (Object.keys(updates).length > 0) {
    writeEnv(ENV_FILE, updates)
  }

  return { ...vars, ...updates }
}

// ─── Step 3: Required keys ────────────────────────────────────────────────────

const REQUIRED_KEYS = [
  {
    key:     'DATABASE_URL',
    label:   'PostgreSQL connection string',
    hint:    'Free: https://neon.tech — create a project, copy the connection string',
    example: 'postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require',
    test:    v => v.startsWith('postgresql://') || v.startsWith('postgres://'),
  },
  {
    key:     'ANTHROPIC_API_KEY',
    label:   'Anthropic API key (primary AI)',
    hint:    'Get at https://console.anthropic.com',
    example: 'sk-ant-...',
    test:    v => v.startsWith('sk-ant-'),
  },
]

const OPTIONAL_KEYS = [
  {
    key:     'GROQ_API_KEY',
    label:   'Groq API key (fast fallback AI — free)',
    hint:    'Get at https://console.groq.com',
    example: 'gsk_...',
  },
  {
    key:     'GEMINI_API_KEY',
    label:   'Google Gemini API key (fallback AI — free)',
    hint:    'Get at https://aistudio.google.com',
    example: 'AIzaSy...',
  },
  {
    key:     'RESEND_API_KEY',
    label:   'Resend API key (emails — free tier: 100/day)',
    hint:    'Get at https://resend.com',
    example: 're_...',
  },
  {
    key:     'GOOGLE_CLIENT_ID',
    label:   'Google OAuth Client ID (sign in with Google)',
    hint:    'Get at https://console.cloud.google.com → Credentials',
    example: '123456789-xxx.apps.googleusercontent.com',
  },
  {
    key:     'GOOGLE_CLIENT_SECRET',
    label:   'Google OAuth Client Secret',
    hint:    'Same console as above',
    example: 'GOCSPX-...',
  },
]

async function collectKeys(existingVars) {
  head('Step 3 — API Keys')

  const updates = {}
  let allRequired = true

  console.log(`\n${c.bold}Required (pipeline won't work without these):${c.reset}`)
  for (const def of REQUIRED_KEYS) {
    const current = existingVars[def.key] ?? ''
    const isSet   = current && !current.startsWith('your-') && !current.startsWith('postgresql://user:')
    const valid   = isSet && (!def.test || def.test(current))

    if (valid) {
      ok(`${def.key} — set`)
    } else {
      warn(`${def.key} — ${isSet ? 'invalid format' : 'missing'}`)
      info(def.hint)
      info(`Example: ${c.dim}${def.example}${c.reset}`)
      if (!YES) {
        const val = await prompt(`  Enter ${def.label}`, current || '')
        if (val && (!def.test || def.test(val))) {
          updates[def.key] = val
          ok(`${def.key} saved`)
        } else {
          err(`${def.key} not set — some features will not work`)
          allRequired = false
        }
      } else {
        allRequired = false
      }
    }
  }

  console.log(`\n${c.bold}Optional (recommended, but not blocking):${c.reset}`)
  for (const def of OPTIONAL_KEYS) {
    const current = existingVars[def.key] ?? ''
    const isSet   = current && !current.startsWith('your-')
    if (isSet) {
      ok(`${def.key} — set`)
    } else {
      info(`${def.key} — not set (${def.label})`)
      if (!YES) {
        const val = await prompt(`  Enter ${def.label} (Enter to skip)`, '')
        if (val) { updates[def.key] = val; ok(`${def.key} saved`) }
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    writeEnv(ENV_FILE, updates)
  }

  return allRequired
}

// ─── Step 4: Install dependencies ─────────────────────────────────────────────

function installDeps() {
  head('Step 4 — Install dependencies')
  info('Running pnpm install (this may take a minute on first run)…')
  run('pnpm install --frozen-lockfile')
  ok('Dependencies installed')
}

// ─── Step 5: Database ─────────────────────────────────────────────────────────

function setupDatabase() {
  head('Step 5 — Database')
  info('Pushing Prisma schema to database…')
  try {
    run('pnpm db:push', { env: { ...process.env, ...readEnv(ENV_FILE) } })
    ok('Database schema is up to date')
  } catch {
    err('Database push failed — check DATABASE_URL in .env')
    warn('If using Neon, ensure the connection string includes ?sslmode=require')
    warn('Run manually: pnpm db:push')
  }
}

// ─── Step 6: Readiness report ─────────────────────────────────────────────────

function readinessReport(vars) {
  head('Step 6 — Readiness Report')

  const checks = [
    // Core
    { label: 'Database',            ok: !!(vars.DATABASE_URL && !vars.DATABASE_URL.includes('user:password')),    required: true },
    { label: 'Auth secret',         ok: !!(vars.NEXTAUTH_SECRET && vars.NEXTAUTH_SECRET.length > 20),             required: true },
    { label: 'Anthropic (primary)', ok: !!(vars.ANTHROPIC_API_KEY?.startsWith('sk-ant-')),                        required: true },
    { label: 'Groq (fallback)',     ok: !!(vars.GROQ_API_KEY?.startsWith('gsk_')),                                required: false },
    { label: 'Gemini (fallback)',   ok: !!(vars.GEMINI_API_KEY?.startsWith('AIzaSy')),                            required: false },
    { label: 'Email (Resend)',      ok: !!(vars.RESEND_API_KEY?.startsWith('re_')),                               required: false },
    { label: 'Google OAuth',        ok: !!(vars.GOOGLE_CLIENT_ID && vars.GOOGLE_CLIENT_SECRET),                   required: false },
    { label: 'Cron secret',         ok: !!(vars.CRON_SECRET && vars.CRON_SECRET.length > 16),                    required: false },
    { label: 'Encryption secret',   ok: !!(vars.ENCRYPTION_SECRET && vars.ENCRYPTION_SECRET.length > 16),        required: false },
  ]

  const width = Math.max(...checks.map(c => c.label.length)) + 2
  let allRequiredPassing = true

  for (const check of checks) {
    const pad    = ' '.repeat(width - check.label.length)
    const status = check.ok
      ? `${c.green}✓ ready${c.reset}`
      : check.required
        ? `${c.red}✗ MISSING${c.reset}  ← required`
        : `${c.yellow}○ not set${c.reset}  (optional)`
    console.log(`  ${check.label}${pad}${status}`)
    if (check.required && !check.ok) allRequiredPassing = false
  }

  console.log('')
  if (allRequiredPassing) {
    ok(`${c.bold}All required checks passing — NEXUS OS is ready to run${c.reset}`)
  } else {
    warn('Some required keys are missing — set them in .env and re-run')
  }

  return allRequiredPassing
}

// ─── Step 7: Start dev server ─────────────────────────────────────────────────

async function startDev(ready) {
  head('Step 7 — Start')

  if (!ready) {
    warn('Skipping dev server start — required keys are missing')
    info('Fix the issues above, then run: pnpm dev')
    return
  }

  const start = await prompt('\nStart the dev server now? (pnpm dev)', YES ? 'y' : 'y')
  if (!start.toLowerCase().startsWith('y')) {
    info('Run manually: pnpm dev')
    return
  }

  console.log(`\n${c.acid}${c.bold}Starting NEXUS OS…${c.reset}`)
  info('Local: http://localhost:3000')
  console.log('')

  const child = spawn('pnpm', ['dev'], {
    cwd:   ROOT,
    stdio: 'inherit',
    shell: true,
    env:   { ...process.env, ...readEnv(ENV_FILE), FORCE_COLOR: '1' },
  })

  // Try to open browser after 4s
  setTimeout(() => {
    const openCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    runSilent(`${openCmd} http://localhost:3000`)
  }, 4000)

  await new Promise(resolve => child.on('exit', resolve))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.clear()
  console.log(`\n${c.acid}${c.bold}
  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗     ██████╗ ███████╗
  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝    ██╔═══██╗██╔════╝
  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗    ██║   ██║███████╗
  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║    ██║   ██║╚════██║
  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║    ╚██████╔╝███████║
  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝     ╚═════╝ ╚══════╝
${c.reset}`)
  console.log(`  ${c.dim}23 AI agents · Brief → FORGE → BUILD → Live URL${c.reset}\n`)
  console.log(`  ${c.bold}Setup wizard${c.reset} ${CHECK ? '(health check mode)' : YES ? '(non-interactive)' : '(interactive)'}`)

  if (CHECK) {
    const vars = readEnv(ENV_FILE)
    readinessReport(vars)
    return
  }

  checkPrerequisites()
  const vars    = await setupEnv()
  await collectKeys(vars)
  installDeps()
  setupDatabase()
  const ready   = readinessReport(readEnv(ENV_FILE))
  await startDev(ready)
}

main().catch(e => {
  console.error(`\n${c.red}Setup failed:${c.reset}`, e.message)
  process.exit(1)
})
