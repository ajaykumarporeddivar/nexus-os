import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/ratelimit'
import crypto from 'crypto'

const VERCEL_API = 'https://api.vercel.com'

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function vGet(path: string, token: string, teamId?: string) {
  const qs  = teamId ? `?teamId=${teamId}` : ''
  const res = await fetch(`${VERCEL_API}${path}${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return { ok: res.ok, data: await res.json() }
}

async function vPostRetry(path: string, token: string, body: object, teamId?: string, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await vPost(path, token, body, teamId)
    } catch (err) {
      const msg = (err as Error).message ?? ''
      const isTransient = /5\d\d|rate.?limit|timeout|ECONNRESET|ETIMEDOUT/i.test(msg)
      if (!isTransient || attempt === retries - 1) throw err
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 600))
    }
  }
  throw new Error('Vercel: exhausted retries')
}

async function vPost(path: string, token: string, body: object, teamId?: string) {
  const qs  = teamId ? `?teamId=${teamId}` : ''
  const res = await fetch(`${VERCEL_API}${path}${qs}`, {
    method:  'POST',
    headers: authHeaders(token),
    body:    JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.message ?? `${res.status} ${path}`
    throw new Error(msg)
  }
  return data
}

async function uploadBlob(
  buf: Buffer,
  token: string,
  teamId?: string,
): Promise<{ sha: string; size: number }> {
  const sha  = crypto.createHash('sha1').update(buf).digest('hex')
  const size = buf.length
  const qs   = teamId ? `?teamId=${teamId}` : ''

  const res = await fetch(`${VERCEL_API}/v2/files${qs}`, {
    method:  'POST',
    headers: {
      Authorization:     `Bearer ${token}`,
      'Content-Type':    'application/octet-stream',
      'x-vercel-digest': sha,
    } as Record<string, string>,
    body: new Uint8Array(buf),
  })
  // 200 = uploaded, 409 = already exists — both OK
  if (res.status !== 200 && res.status !== 409) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Blob upload (${res.status}): ${(err as Record<string,string>).message ?? res.statusText}`)
  }
  return { sha, size }
}

// Files that aren't part of the Next.js source build
const SKIP = ['.github/', 'README.md', '.env.example', 'vitest.config', '__tests__/']

function shouldSkipLegacyDuplicatePath(path: string, allPaths: Set<string>): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\/+/, '')
  const hasCanonicalApp = allPaths.has('src/app/page.tsx') || allPaths.has('src/app/dashboard/page.tsx')
  if (!hasCanonicalApp) return false

  // The BUILD safety net emits a canonical App Router app under src/.
  // Provider outputs sometimes also include legacy Pages Router files and
  // top-level component/lib duplicates. Those optional files can break
  // `next build` even though the canonical app is deployable, so exclude them
  // from the deployment payload.
  if (/^pages\//.test(normalized)) return true
  if (/^components\//.test(normalized)) return true
  if (/^hooks\//.test(normalized)) return true
  if (/^context\//.test(normalized)) return true
  if (/^lib\//.test(normalized)) return true
  return false
}

function normaliseGeneratedImportPaths(source: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/from\s+['"](?:\.\.\/)+(?:src\/)?lib\/data['"]/g, "from '@/lib/data'"],
    [/from\s+['"](?:\.\.\/)+(?:src\/)?lib\/types['"]/g, "from '@/lib/types'"],
    [/from\s+['"](?:\.\.\/)+(?:src\/)?lib\/utils['"]/g, "from '@/lib/utils'"],
    [/from\s+['"](?:\.\.\/)+(?:src\/)?hooks\/useApp['"]/g, "from '@/hooks/useApp'"],
    [/from\s+['"](?:\.\.\/)+(?:src\/)?components\/ui['"]/g, "from '@/components/ui'"],
    [/from\s+['"](?:\.\.\/)+(?:src\/)?components\/layout['"]/g, "from '@/components/layout'"],
    [/from\s+['"](?:\.\.\/)+(?:src\/)?components\/charts['"]/g, "from '@/components/charts'"],
    [/from\s+['"](?:\.\.\/)+(?:src\/)?components\/forms['"]/g, "from '@/components/forms'"],
    [/from\s+['"](?:\.\.\/)+(?:src\/)?components\/modals['"]/g, "from '@/components/modals'"],
  ]
  return replacements.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), source)
}

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  // Rate-limit deploy calls — 5/min per user (one Vercel deploy per pipeline run)
  const rl = await checkRateLimit(`deploy:vrcl:${auth.user.id}`)
  if (!rl.success) {
    return NextResponse.json(
      { ok: false, error: 'Deploy rate limit reached. Max 5 Vercel deployments per minute.' },
      { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0' } }
    )
  }

  const token  = process.env.VERCEL_TOKEN?.trim()
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || undefined

  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'VERCEL_TOKEN not configured — add it in Vercel project settings or .env' },
      { status: 400 },
    )
  }

  const { projectName, files } = await req.json() as {
    projectName: string
    files:       Record<string, string>
  }

  if (!projectName || !files || Object.keys(files).length === 0) {
    return NextResponse.json({ ok: false, error: 'projectName and files are required' }, { status: 400 })
  }

  const safeName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/, '')
    .slice(0, 52)

  try {
    // ── 1. Get or create Vercel project ───────────────────────────────────────
    let projectId:   string
    let finalName:   string = safeName

    const existing = await vGet(`/v9/projects/${safeName}`, token, teamId)
    if (existing.ok) {
      projectId = existing.data.id
      finalName = existing.data.name
    } else {
      try {
        const proj = await vPost('/v10/projects', token, { name: safeName, framework: 'nextjs' }, teamId)
        projectId = proj.id
        finalName = proj.name
      } catch {
        // Name taken — add a short suffix
        finalName = `${safeName}-${Date.now().toString(36).slice(-5)}`
        const proj = await vPost('/v10/projects', token, { name: finalName, framework: 'nextjs' }, teamId)
        projectId = proj.id
        finalName = proj.name
      }
    }

    // ── 2. Filter to actual source files + normalize misplaced Next.js files ──
    // Next.js App Router requires special files inside app/ — LLMs sometimes drop the prefix.
    const NEXTJS_REMAP: Record<string, string> = {
      'not-found.tsx':       'src/app/not-found.tsx',
      'error.tsx':           'src/app/error.tsx',
      'loading.tsx':         'src/app/loading.tsx',
      'global-error.tsx':    'src/app/global-error.tsx',
      // root layout only remapped if it's at bare layout.tsx
      'layout.tsx':          'src/app/layout.tsx',
    }

    const inputPaths = new Set(Object.keys(files).map(path => path.replace(/\\/g, '/').replace(/^\.\/+/, '')))
    const sourceFiles = Object.entries(files)
      .filter(([path, content]) => {
        if (!content || !path) return false
        if (SKIP.some(s => path.includes(s))) return false
        return !shouldSkipLegacyDuplicatePath(path, inputPaths)
      })
      .map(([path, content]): [string, string] => {
        const normalizedContent = normaliseGeneratedImportPaths(String(content))
        // Remap bare filename → correct app directory location
        const remapped = NEXTJS_REMAP[path]
        if (remapped) return [remapped, normalizedContent]
        // Also fix paths like "app/not-found.tsx" → "src/app/not-found.tsx"
        if (/^app\//.test(path)) return [`src/${path}`, normalizedContent]
        return [path, normalizedContent]
      })

    // ── 3. Inject missing critical files that Tailwind/Next.js require ────────
    const has = (name: string) => sourceFiles.some(([p]) => p === name)

    // postcss.config.js — required for Tailwind CSS to compile
    if (!has('postcss.config.js')) {
      sourceFiles.push(['postcss.config.js', `module.exports = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n}\n`])
    }

    // next.config.js — ALWAYS override (not just if missing).
    // The SCAFFOLD agent generates its own next.config.js, but it won't have
    // typescript.ignoreBuildErrors, which causes type errors to fail the build.
    // We force-replace it with a build-resilient version every time.
    {
      const idx = sourceFiles.findIndex(([p]) => p === 'next.config.js')
      const content = `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  reactStrictMode: true,\n  images: { unoptimized: true },\n  typescript: { ignoreBuildErrors: true },\n  eslint: { ignoreDuringBuilds: true },\n}\nmodule.exports = nextConfig\n`
      if (idx >= 0) sourceFiles[idx] = ['next.config.js', content]
      else          sourceFiles.push(['next.config.js', content])
    }

    // tailwind.config.js — required for Tailwind
    if (!has('tailwind.config.js')) {
      sourceFiles.push(['tailwind.config.js', `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  content: ['./src/**/*.{ts,tsx}'],\n  theme: { extend: { fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui'] } } },\n  plugins: [],\n}\n`])
    }

    // package.json — required for npm install
    if (!has('package.json')) {
      sourceFiles.push(['package.json', JSON.stringify({
        name: finalName,
        version: '0.1.0',
        private: true,
        scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint' },
        dependencies: {
          next: '15.5.18', react: '19.0.0', 'react-dom': '19.0.0',
          'lucide-react': '0.468.0', clsx: '2.1.1', 'tailwind-merge': '2.5.4',
        },
        devDependencies: {
          typescript: '5.4.5', '@types/react': '19.0.0', '@types/react-dom': '19.0.0',
          '@types/node': '20.17.9', tailwindcss: '3.4.17', postcss: '8.4.49',
          autoprefixer: '10.4.20', eslint: '8.57.1', 'eslint-config-next': '15.5.18',
        },
      }, null, 2)])
    }

    // ── 3a-inject. Auto-detect missing npm packages from import statements ───
    // AI agents freely import recharts, framer-motion, @radix-ui/*, etc.
    // `ignoreBuildErrors` doesn't help with Module not found — we must add them.
    {
      // Curated registry of packages AI models commonly import → pinned safe versions
      const KNOWN_PACKAGES: Record<string, string> = {
        // Charts / data viz
        'recharts':                    '2.12.7',
        'd3':                          '7.9.0',
        'victory':                     '37.3.2',
        'chart.js':                    '4.4.3',
        'react-chartjs-2':             '5.2.0',
        'apexcharts':                  '3.54.0',
        'react-apexcharts':            '1.4.0',
        // Animation
        'framer-motion':               '11.11.17',
        '@motionone/react':            '10.18.0',
        // Radix UI primitives
        '@radix-ui/react-accordion':   '1.2.0',
        '@radix-ui/react-alert-dialog':'1.1.1',
        '@radix-ui/react-avatar':      '1.1.0',
        '@radix-ui/react-checkbox':    '1.1.1',
        '@radix-ui/react-collapsible': '1.1.0',
        '@radix-ui/react-context-menu':'2.2.1',
        '@radix-ui/react-dialog':      '1.1.1',
        '@radix-ui/react-dropdown-menu':'2.1.1',
        '@radix-ui/react-hover-card':  '1.1.1',
        '@radix-ui/react-label':       '2.1.0',
        '@radix-ui/react-menubar':     '1.1.1',
        '@radix-ui/react-navigation-menu':'1.2.0',
        '@radix-ui/react-popover':     '1.1.1',
        '@radix-ui/react-progress':    '1.1.0',
        '@radix-ui/react-radio-group': '1.2.0',
        '@radix-ui/react-scroll-area': '1.1.0',
        '@radix-ui/react-select':      '2.1.1',
        '@radix-ui/react-separator':   '1.1.0',
        '@radix-ui/react-slider':      '1.2.0',
        '@radix-ui/react-slot':        '1.1.0',
        '@radix-ui/react-switch':      '1.1.0',
        '@radix-ui/react-tabs':        '1.1.0',
        '@radix-ui/react-toast':       '1.2.1',
        '@radix-ui/react-toggle':      '1.1.0',
        '@radix-ui/react-tooltip':     '1.1.2',
        // Shadcn/ui deps
        'cmdk':                        '1.0.0',
        'vaul':                        '0.9.9',
        'sonner':                      '1.7.1',
        'react-resizable-panels':      '2.1.7',
        'embla-carousel-react':        '8.5.1',
        'input-otp':                   '1.4.1',
        'react-day-picker':            '8.10.1',
        // Utilities
        'date-fns':                    '3.6.0',
        'dayjs':                       '1.11.13',
        'lodash':                      '4.17.21',
        'lodash-es':                   '4.17.21',
        'zod':                         '3.23.8',
        'react-hook-form':             '7.54.2',
        '@hookform/resolvers':         '3.9.1',
        'zustand':                     '5.0.1',
        'jotai':                       '2.10.1',
        'immer':                       '10.1.1',
        'uuid':                        '10.0.0',
        'nanoid':                      '5.0.7',
        // Table / list
        '@tanstack/react-table':       '8.20.5',
        '@tanstack/react-query':       '5.62.8',
        // Icons beyond lucide
        'react-icons':                 '5.3.0',
        '@heroicons/react':            '2.1.5',
        'phosphor-react':              '1.4.1',
        // UI kits
        '@headlessui/react':           '2.2.0',
        'flowbite-react':              '0.10.2',
        'react-aria':                  '3.35.2',
        // Misc React utilities
        'react-use':                   '17.5.1',
        'usehooks-ts':                 '3.1.0',
        '@uidotdev/usehooks':          '2.4.1',
        'react-intersection-observer': '9.13.1',
        'react-hot-toast':             '2.4.1',
        'notistack':                   '3.0.1',
        // Math / formatting
        'numeral':                     '2.0.6',
        'accounting':                  '0.4.1',
        // Markdown
        'react-markdown':              '9.0.1',
        'remark-gfm':                  '4.0.0',
        'marked':                      '12.0.0',
        // Syntax highlighting
        'highlight.js':                '11.10.0',
        'prismjs':                     '1.29.0',
        // Dnd
        '@dnd-kit/core':               '6.3.1',
        '@dnd-kit/sortable':           '8.0.0',
        'react-beautiful-dnd':         '13.1.1',
        // Next.js specific
        'next-themes':                 '0.4.3',
        'next-auth':                   '4.24.10',
        '@next/font':                  '14.2.5',
      }

      // Find the package.json in sourceFiles
      const pkgIdx = sourceFiles.findIndex(([p]) => p === 'package.json')
      if (pkgIdx >= 0) {
        let pkg: Record<string, unknown>
        try { pkg = JSON.parse(sourceFiles[pkgIdx][1] as string) } catch { pkg = {} }
        const deps = (pkg.dependencies ?? {}) as Record<string, string>
        const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>
        deps.next = '15.5.18'
        deps.react = deps.react ?? '19.0.0'
        deps['react-dom'] = deps['react-dom'] ?? '19.0.0'
        devDeps['eslint-config-next'] = '15.5.18'
        pkg.dependencies = deps
        pkg.devDependencies = devDeps

        // Scan all TS/TSX files for bare package imports
        const importRe = /(?:^|\n)\s*(?:import|export)[^'"]*['"]([^.'"@][^'"]*)['"]/g
        const dynamicRe = /(?:require|import)\s*\(\s*['"]([^.'"@][^'"]*)['"]\s*\)/g
        const detected = new Set<string>()

        for (const [filePath, content] of sourceFiles) {
          if (!filePath.match(/\.(ts|tsx|js|jsx)$/)) continue
          const src = content as string
          for (const re of [importRe, dynamicRe]) {
            re.lastIndex = 0
            let m: RegExpExecArray | null
            while ((m = re.exec(src)) !== null) {
              // Extract the package name (handle scoped packages like @radix-ui/react-dialog)
              const raw = m[1]
              const pkg = raw.startsWith('@')
                ? raw.split('/').slice(0, 2).join('/')  // @scope/package
                : raw.split('/')[0]                       // bare package
              if (pkg && !deps[pkg] && !devDeps[pkg]) detected.add(pkg)
            }
          }
        }

        // Add missing packages that are in our registry
        const added: string[] = []
        for (const pkgName of detected) {
          const version = KNOWN_PACKAGES[pkgName]
          if (version) {
            deps[pkgName] = version
            added.push(pkgName)
          }
        }

        if (added.length > 0) {
          console.info(`[vercel-app] Auto-injected ${added.length} missing packages:`, added.join(', '))
        }
        sourceFiles[pkgIdx] = ['package.json', JSON.stringify(pkg, null, 2)]
      }
    }

    // globals.css — Tailwind directives (required for any styles)
    if (!has('src/app/globals.css')) {
      sourceFiles.push(['src/app/globals.css', `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n@layer base {\n  body { @apply bg-zinc-50 text-zinc-900 antialiased; }\n}\n`])
    }

    // favicon.svg — brand icon for generated app (avoids 404 noise)
    if (!has('public/favicon.svg') && !has('src/app/favicon.ico')) {
      sourceFiles.push(['public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#18181b"/><text x="16" y="22" font-family="ui-sans-serif,system-ui" font-size="16" font-weight="900" fill="#c8f23c" text-anchor="middle">N</text></svg>\n`])
    }

    // tsconfig.json — ALWAYS override (SCAFFOLD generates its own with strict: true).
    // strict: false prevents AI-generated type errors from blocking the build.
    {
      const tsconfigContent = JSON.stringify({
        compilerOptions: {
          target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true, skipLibCheck: true, strict: false, noEmit: true,
          esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler',
          resolveJsonModule: true, isolatedModules: true, jsx: 'preserve',
          incremental: true, plugins: [{ name: 'next' }], paths: { '@/*': ['./src/*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      }, null, 2)
      const idx = sourceFiles.findIndex(([p]) => p === 'tsconfig.json')
      if (idx >= 0) sourceFiles[idx] = ['tsconfig.json', tsconfigContent]
      else          sourceFiles.push(['tsconfig.json', tsconfigContent])
    }

    // tsconfig.json always handled by the override block above

    // ── 3b. Sanitize API route files — strip invalid export names ────────────
    // Next.js only allows GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS as route exports.
    // AI models sometimes invent names like GET_DEMO_CART which fail the type check.
    const VALID_HTTP_EXPORTS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
    for (let i = 0; i < sourceFiles.length; i++) {
      const [filePath, content] = sourceFiles[i]
      if (!filePath.match(/src\/app\/api\/.*\/route\.tsx?$/)) continue
      // Replace `export async function INVALID_NAME` or `export const INVALID_NAME`
      // that don't match valid HTTP methods
      const sanitized = (content as string).replace(
        /\bexport\s+(?:async\s+)?(?:function|const)\s+([A-Z][A-Z0-9_]*)\b/g,
        (match, name: string) => {
          // If the name starts with a valid method but has extra chars, extract the method
          const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
            .find(m => name.startsWith(m))
          if (VALID_HTTP_EXPORTS.has(name)) return match           // already valid
          if (method) return match.replace(name, method)           // GET_DEMO_CART → GET
          return match.replace(/^export\s+/, '// export ')         // comment out unknown
        },
      )
      if (sanitized !== content) sourceFiles[i] = [filePath, sanitized]
    }

    // LLM pages often agree on domain-specific import names before MOCK DATA
    // settles on the same export names. Append compatibility exports instead
    // of replacing otherwise useful generated data.
    {
      const dataIdx = sourceFiles.findIndex(([p]) => p === 'src/lib/data.ts')
      if (dataIdx >= 0) {
        const current = String(sourceFiles[dataIdx][1] ?? '')
        const compat: string[] = []
        if (!/\bexport\s+const\s+STATS\b/.test(current)) {
          compat.push(`export const STATS = [
  { label: 'Active Workflows', value: '128', change: 12.4, trend: 'up' as const },
  { label: 'Revenue Protected', value: '$42,800', change: 18.2, trend: 'up' as const },
  { label: 'Approval Rate', value: '86%', change: 9.1, trend: 'up' as const },
  { label: 'Cycle Time', value: '2.4 days', change: -14.0, trend: 'down' as const },
]`)
        }
        if (!/\bexport\s+const\s+MOCK_SPONSORS\b/.test(current)) {
          compat.push(`export const MOCK_SPONSORS = [
  { id: 'spon-1', name: 'Northstar Ventures', status: 'active', owner: 'Partnerships', value: 48000, createdAt: '2026-05-01' },
  { id: 'spon-2', name: 'Atlas Commerce', status: 'pending', owner: 'Revenue', value: 32000, createdAt: '2026-05-03' },
  { id: 'spon-3', name: 'Signal Labs', status: 'active', owner: 'Success', value: 27500, createdAt: '2026-05-05' },
]`)
        }
        if (!/\bexport\s+const\s+MOCK_CAMPAIGNS\b/.test(current)) {
          compat.push(`export const MOCK_CAMPAIGNS = [
  { id: 'camp-1', name: 'Launch Pipeline', status: 'active', owner: 'Growth', value: 84, createdAt: '2026-05-06' },
  { id: 'camp-2', name: 'Sponsor Renewal', status: 'pending', owner: 'Partnerships', value: 62, createdAt: '2026-05-07' },
  { id: 'camp-3', name: 'Executive Proof Pack', status: 'completed', owner: 'Delivery', value: 91, createdAt: '2026-05-08' },
]`)
        }
        if (!/\bexport\s+const\s+MOCK_DELIVERABLES\b/.test(current)) {
          compat.push(`export const MOCK_DELIVERABLES = [
  { id: 'del-1', name: 'ROI summary deck', status: 'active', owner: 'Delivery', value: 95, dueDate: '2026-05-24' },
  { id: 'del-2', name: 'Campaign report', status: 'pending', owner: 'Analytics', value: 72, dueDate: '2026-05-26' },
  { id: 'del-3', name: 'Renewal brief', status: 'completed', owner: 'Revenue', value: 88, dueDate: '2026-05-28' },
]`)
        }
        if (!/\bexport\s+const\s+KPI_STATS\b/.test(current)) compat.push('export const KPI_STATS = STATS')
        if (!/\bexport\s+const\s+DASHBOARD_STATS\b/.test(current)) compat.push('export const DASHBOARD_STATS = STATS')
        if (compat.length > 0) {
          sourceFiles[dataIdx] = ['src/lib/data.ts', `${current.trim()}\n\n// Deploy compatibility exports for generated pages.\n${compat.join('\n\n')}\n`]
        }
      }
    }

    // ── 3c. Inject stubs for missing critical files ───────────────────────────
    // If BUILD agents failed to produce parseable output for core files,
    // webpack will throw Module not found. Stubs keep the build alive.
    {
      const existingPaths = new Set(sourceFiles.map(([p]) => p))

      const CRITICAL_STUBS: Record<string, string> = {
        'src/lib/utils.ts': `import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
export function formatDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
export function formatCurrency(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n) }
export function formatRelativeTime(d: string) { const diff = Date.now() - new Date(d).getTime(); const m = Math.floor(diff / 60000); return m < 60 ? \`\${m}m ago\` : m < 1440 ? \`\${Math.floor(m/60)}h ago\` : \`\${Math.floor(m/1440)}d ago\` }
export function generateId() { return Math.random().toString(36).slice(2) }
export function truncate(s: string, n = 40) { return s.length > n ? s.slice(0, n) + '…' : s }
`,
        'src/lib/types.ts': `export interface DataItem { id: string; name: string; status: 'active' | 'pending' | 'completed' | 'inactive'; value?: number; createdAt: string; updatedAt: string }
export interface DemoUser { id: string; name: string; email: string; role: 'admin' | 'member' | 'viewer'; plan: string; avatar: string; joinedAt: string }
export interface ActivityItem { id: string; action: string; user: string; timestamp: string; type: 'create' | 'update' | 'delete' | 'view' }
export interface MetricCard { label: string; value: string | number; change: number; trend: 'up' | 'down' | 'flat'; sparkline?: number[] }
export type ApiResponse<T> = { ok: boolean; data?: T; error?: string }
export type SortDir = 'asc' | 'desc'
export interface PaginationMeta { total: number; page: number; pageSize: number; totalPages: number }
`,
        'src/components/ui.tsx': `'use client'
import { type ReactNode, useState, forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'
import { clsx, type ClassValue } from 'clsx'
function cn(...i: ClassValue[]) { return twMerge(clsx(i)) }
// ── Button ──────────────────────────────────────────────────────────────────
type BtnVariant = 'primary'|'secondary'|'ghost'|'danger'|'outline'|'link'|'default'|'destructive'
export function Button({ children, onClick, className, variant = 'primary', disabled, type = 'button', size }: { children: ReactNode; onClick?: () => void; className?: string; variant?: BtnVariant; disabled?: boolean; type?: 'button'|'submit'; size?: 'sm'|'md'|'lg'|'icon'|'default' }) {
  const v: Record<BtnVariant,string> = { primary:'bg-zinc-900 text-white hover:bg-zinc-700', secondary:'bg-zinc-100 text-zinc-900 hover:bg-zinc-200', ghost:'bg-transparent text-zinc-600 hover:bg-zinc-100', danger:'bg-red-600 text-white hover:bg-red-700', outline:'border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50', link:'underline-offset-4 hover:underline text-zinc-900 bg-transparent', default:'bg-zinc-900 text-white hover:bg-zinc-700', destructive:'bg-red-600 text-white hover:bg-red-700' }
  const s = { sm:'px-3 py-1.5 text-xs', md:'px-4 py-2 text-sm', lg:'px-5 py-2.5 text-base', icon:'p-2', default:'px-4 py-2 text-sm' }
  return <button type={type} onClick={onClick} disabled={disabled} className={cn('rounded-lg font-semibold transition-colors disabled:opacity-50', v[variant], s[size ?? 'default'], className)}>{children}</button>
}
// ── Card family ──────────────────────────────────────────────────────────────
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('bg-white border border-zinc-200 rounded-xl shadow-sm', className)}>{children}</div>
}
export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col space-y-1.5 p-6', className)}>{children}</div>
}
export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-lg font-semibold leading-none tracking-tight text-zinc-900', className)}>{children}</h3>
}
export function CardDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-sm text-zinc-500', className)}>{children}</p>
}
export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-6 pt-0', className)}>{children}</div>
}
export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center p-6 pt-0', className)}>{children}</div>
}
// ── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = 'default'|'success'|'warning'|'danger'|'info'|'secondary'|'outline'|'destructive'
export function Badge({ children, variant = 'default', className }: { children: ReactNode; variant?: BadgeVariant; className?: string }) {
  const v: Record<BadgeVariant,string> = { default:'bg-zinc-100 text-zinc-700', success:'bg-emerald-50 text-emerald-700 border-emerald-200', warning:'bg-amber-50 text-amber-700 border-amber-200', danger:'bg-red-50 text-red-700 border-red-200', info:'bg-blue-50 text-blue-700 border-blue-200', secondary:'bg-zinc-100 text-zinc-600', outline:'border border-zinc-300 text-zinc-700', destructive:'bg-red-100 text-red-700' }
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-transparent', v[variant], className)}>{children}</span>
}
// ── Input / Textarea / Label / Select ────────────────────────────────────────
export const Input = forwardRef<HTMLInputElement, { value?: string; onChange?: (v: string) => void; placeholder?: string; className?: string; type?: string; name?: string; id?: string; disabled?: boolean }>(
  ({ value, onChange, placeholder, className, type = 'text', name, id, disabled }, ref) =>
    <input ref={ref} type={type} value={value} name={name} id={id} disabled={disabled} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} className={cn('w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none focus:border-zinc-900 bg-white disabled:opacity-50', className)} />
)
Input.displayName = 'Input'
export function Textarea({ value, onChange, placeholder, className, rows = 3 }: { value?: string; onChange?: (v: string) => void; placeholder?: string; className?: string; rows?: number }) {
  return <textarea value={value} rows={rows} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} className={cn('w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none focus:border-zinc-900 bg-white resize-none', className)} />
}
export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return <label htmlFor={htmlFor} className={cn('block text-sm font-medium text-zinc-700', className)}>{children}</label>
}
export function Select({ value, onChange, options, className }: { value?: string; onChange?: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return <select value={value} onChange={e => onChange?.(e.target.value)} className={cn('w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none focus:border-zinc-900 bg-white', className)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
}
// ── Separator ────────────────────────────────────────────────────────────────
export function Separator({ className, orientation = 'horizontal' }: { className?: string; orientation?: 'horizontal'|'vertical' }) {
  return <div className={cn(orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full', 'bg-zinc-200', className)} />
}
// ── Avatar ───────────────────────────────────────────────────────────────────
export function Avatar({ src, alt, fallback, className }: { src?: string; alt?: string; fallback?: string; className?: string }) {
  return src ? <img src={src} alt={alt ?? ''} className={cn('w-8 h-8 rounded-full object-cover', className)} /> : <div className={cn('w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold', className)}>{fallback ?? '?'}</div>
}
export function AvatarImage({ src, alt, className }: { src?: string; alt?: string; className?: string }) {
  return <img src={src} alt={alt ?? ''} className={cn('w-full h-full object-cover rounded-full', className)} />
}
export function AvatarFallback({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-center w-full h-full bg-zinc-200 text-zinc-700 text-xs font-semibold rounded-full', className)}>{children}</div>
}
// ── Progress ─────────────────────────────────────────────────────────────────
export function Progress({ value = 0, className }: { value?: number; className?: string }) {
  return <div className={cn('w-full h-2 bg-zinc-100 rounded-full overflow-hidden', className)}><div className="h-full bg-zinc-900 transition-all" style={{ width: \`\${Math.min(100, Math.max(0, value))}%\` }} /></div>
}
// ── Switch / Checkbox ─────────────────────────────────────────────────────────
export function Switch({ checked, onCheckedChange, disabled }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; disabled?: boolean }) {
  return <button role="switch" aria-checked={checked} disabled={disabled} onClick={() => onCheckedChange?.(!checked)} className={cn('w-10 h-6 rounded-full transition-colors relative', checked ? 'bg-zinc-900' : 'bg-zinc-200', disabled && 'opacity-50')}><span className={cn('absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-1')} /></button>
}
export function Checkbox({ checked, onCheckedChange, disabled, className }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; disabled?: boolean; className?: string }) {
  return <button role="checkbox" aria-checked={checked} disabled={disabled} onClick={() => onCheckedChange?.(!checked)} className={cn('w-4 h-4 rounded border border-zinc-300 flex items-center justify-center transition-colors', checked ? 'bg-zinc-900 border-zinc-900' : 'bg-white', disabled && 'opacity-50', className)}>{checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}</button>
}
// ── Skeleton ──────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-zinc-200', className)} />
}
// ── Alert ─────────────────────────────────────────────────────────────────────
export function Alert({ children, variant = 'default', className }: { children: ReactNode; variant?: 'default'|'destructive'; className?: string }) {
  return <div className={cn('rounded-lg border p-4 text-sm', variant === 'destructive' ? 'border-red-200 bg-red-50 text-red-800' : 'border-zinc-200 bg-zinc-50 text-zinc-800', className)}>{children}</div>
}
export function AlertTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-semibold mb-1', className)}>{children}</p>
}
export function AlertDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-sm opacity-90', className)}>{children}</p>
}
// ── Tabs ──────────────────────────────────────────────────────────────────────
export function Tabs({ children, defaultValue, className }: { children: ReactNode; defaultValue?: string; className?: string }) {
  return <div className={cn('w-full', className)} data-default={defaultValue}>{children}</div>
}
export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('inline-flex h-9 items-center rounded-lg bg-zinc-100 p-1 gap-1', className)}>{children}</div>
}
export function TabsTrigger({ children, value, className }: { children: ReactNode; value?: string; className?: string }) {
  return <button className={cn('px-3 py-1 rounded-md text-sm font-medium transition-colors text-zinc-600 hover:text-zinc-900', className)} data-value={value}>{children}</button>
}
export function TabsContent({ children, value, className }: { children: ReactNode; value?: string; className?: string }) {
  return <div className={cn('mt-4', className)} data-value={value}>{children}</div>
}
// ── Table ─────────────────────────────────────────────────────────────────────
export function Table({ headers, rows, children, className }: { headers?: string[]; rows?: (string | number | ReactNode)[][]; children?: ReactNode; className?: string }) {
  if (children) return <div className={cn('overflow-x-auto', className)}><table className="w-full text-sm">{children}</table></div>
  return <div className={cn('overflow-x-auto', className)}><table className="w-full text-sm"><thead><tr className="border-b border-zinc-200">{(headers ?? []).map(h => <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>)}</tr></thead><tbody>{(rows ?? []).map((row, i) => <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">{Array.isArray(row) ? row.map((cell, j) => <td key={j} className="py-3 px-4">{cell}</td>) : <td className="py-3 px-4">{row}</td>}</tr>)}</tbody></table></div>
}
export function TableHeader({ children }: { children: ReactNode }) { return <thead>{children}</thead> }
export function TableBody({ children }: { children: ReactNode }) { return <tbody>{children}</tbody> }
export function TableRow({ children, className }: { children: ReactNode; className?: string }) { return <tr className={cn('border-b border-zinc-100 hover:bg-zinc-50', className)}>{children}</tr> }
export function TableHead({ children, className }: { children: ReactNode; className?: string }) { return <th className={cn('text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide', className)}>{children}</th> }
export function TableCell({ children, className }: { children: ReactNode; className?: string }) { return <td className={cn('py-3 px-4 text-sm', className)}>{children}</td> }
// ── Dialog / Modal ────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}><div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-zinc-900">{title}</h2><button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl">×</button></div>{children}</div></div>
}
export function Dialog({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (v: boolean) => void; children: ReactNode }) {
  if (!open) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => onOpenChange?.(false)}><div onClick={e => e.stopPropagation()}>{children}</div></div>
}
export function DialogContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4', className)}>{children}</div>
}
export function DialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col space-y-1.5 mb-4', className)}>{children}</div>
}
export function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-lg font-bold text-zinc-900', className)}>{children}</h2>
}
export function DialogDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-sm text-zinc-500', className)}>{children}</p>
}
export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex justify-end gap-2 mt-4', className)}>{children}</div>
}
// ── Dropdown ──────────────────────────────────────────────────────────────────
export function DropdownMenu({ children }: { children: ReactNode }) { return <div className="relative inline-block">{children}</div> }
export function DropdownMenuTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) { return <div>{children}</div> }
export function DropdownMenuContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('absolute right-0 mt-1 w-48 bg-white border border-zinc-200 rounded-lg shadow-lg z-50 py-1', className)}>{children}</div>
}
export function DropdownMenuItem({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return <button onClick={onClick} className={cn('w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors', className)}>{children}</button>
}
export function DropdownMenuSeparator({ className }: { className?: string }) { return <div className={cn('my-1 h-px bg-zinc-100', className)} /> }
export function DropdownMenuLabel({ children, className }: { children: ReactNode; className?: string }) { return <div className={cn('px-3 py-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide', className)}>{children}</div> }
// ── Tooltip ───────────────────────────────────────────────────────────────────
export function Tooltip({ children }: { children: ReactNode }) { return <div className="relative group inline-flex">{children}</div> }
export function TooltipTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) { return <div>{children}</div> }
export function TooltipContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none', className)}>{children}</div>
}
export function TooltipProvider({ children }: { children: ReactNode }) { return <>{children}</> }
// ── Popover ───────────────────────────────────────────────────────────────────
export function Popover({ children }: { children: ReactNode }) { return <div className="relative inline-block">{children}</div> }
export function PopoverTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) { return <div>{children}</div> }
export function PopoverContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('absolute z-50 mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg p-3 w-64', className)}>{children}</div>
}
// ── Sheet ─────────────────────────────────────────────────────────────────────
export function Sheet({ children, open, onOpenChange }: { children: ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  if (!open) return null
  return <div className="fixed inset-0 z-50 flex"><div className="flex-1 bg-black/40" onClick={() => onOpenChange?.(false)} />{children}</div>
}
export function SheetContent({ children, className, side = 'right' }: { children: ReactNode; className?: string; side?: 'left'|'right'|'top'|'bottom' }) {
  const pos = { right:'right-0 top-0 h-full w-80', left:'left-0 top-0 h-full w-80', top:'top-0 left-0 w-full h-80', bottom:'bottom-0 left-0 w-full h-80' }
  return <div className={cn('absolute bg-white shadow-xl p-6', pos[side], className)}>{children}</div>
}
export function SheetHeader({ children, className }: { children: ReactNode; className?: string }) { return <div className={cn('mb-4', className)}>{children}</div> }
export function SheetTitle({ children, className }: { children: ReactNode; className?: string }) { return <h2 className={cn('text-lg font-bold text-zinc-900', className)}>{children}</h2> }
export function SheetDescription({ children, className }: { children: ReactNode; className?: string }) { return <p className={cn('text-sm text-zinc-500 mt-1', className)}>{children}</p> }
// ── StatCard ──────────────────────────────────────────────────────────────────
export function StatCard({ label, value, change, trend }: { label: string; value: string | number; change?: number; trend?: 'up'|'down'|'flat' }) {
  return <Card><CardContent className="pt-6"><p className="text-xs text-zinc-500 font-medium">{label}</p><p className="text-2xl font-bold text-zinc-900 mt-1">{value}</p>{change !== undefined && <p className={cn('text-xs font-semibold mt-1', trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-zinc-500')}>{trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {Math.abs(change)}%</p>}</CardContent></Card>
}
`,
        'src/components/layout.tsx': `'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode } from 'react'
const NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: '▦' },
  { label: 'Analytics', href: '/dashboard/analytics', icon: '◈' },
  { label: 'Settings', href: '/dashboard/settings', icon: '⚙' },
]
export function AppSidebar({ projectName = 'App' }: { projectName?: string }) {
  const path = usePathname()
  return <aside className="w-64 bg-zinc-900 text-zinc-100 flex flex-col min-h-screen"><div className="px-6 py-5 border-b border-zinc-800"><p className="text-xs font-black tracking-widest text-zinc-400 uppercase">Nexus OS</p><p className="font-bold text-white mt-0.5 truncate">{projectName}</p></div><nav className="flex-1 py-4 px-3 space-y-1">{NAV.map(n => <Link key={n.href} href={n.href} className={\`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors \${path === n.href ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}\`}><span>{n.icon}</span>{n.label}</Link>)}</nav><div className="px-4 py-4 border-t border-zinc-800"><p className="text-xs text-zinc-500">Demo Mode</p></div></aside>
}
export function AppHeader({ title, subtitle, actions }: { title?: string; subtitle?: string; actions?: ReactNode }) {
  return <header className="h-14 bg-white border-b border-zinc-200 flex items-center px-6 gap-4"><div className="flex flex-col justify-center"><h1 className="text-base font-bold text-zinc-900 leading-tight">{title ?? 'Dashboard'}</h1>{subtitle && <p className="text-xs text-zinc-500 leading-tight">{subtitle}</p>}</div><div className="ml-auto flex items-center gap-3">{actions}<span className="text-xs text-zinc-400">Demo User</span><div className="w-8 h-8 bg-zinc-900 rounded-full flex items-center justify-center text-white text-xs font-bold">D</div></div></header>
}
export function DemoBanner({ projectName }: { projectName?: string }) {
  return <div className="bg-zinc-900 text-zinc-100 text-center py-1.5 text-xs font-semibold tracking-wide">DEMO — {projectName ?? 'App'} · Built by NEXUS OS</div>
}
export function AppLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen"><AppSidebar /><div className="flex-1 flex flex-col"><AppHeader /><main className="flex-1 p-6 bg-zinc-50">{children}</main></div></div>
}
`,
        'src/components/charts.tsx': `'use client'
export function Sparkline({ data, color = '#18181b' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const w = 80, h = 32, pts = data.map((v, i) => \`\${(i / (data.length - 1)) * w},\${h - ((v - min) / range) * h}\`).join(' ')
  return <svg viewBox={\`0 0 \${w} \${h}\`} className="w-20 h-8"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" /></svg>
}
export function BarChart({ data, labels }: { data: number[]; labels?: string[] }) {
  const max = Math.max(...data) || 1
  return <div className="flex items-end gap-1 h-32">{data.map((v, i) => <div key={i} className="flex flex-col items-center gap-1 flex-1"><div className="w-full bg-zinc-900 rounded-t-sm transition-all" style={{ height: \`\${(v / max) * 100}%\` }} />{labels?.[i] && <p className="text-[10px] text-zinc-400 truncate w-full text-center">{labels[i]}</p>}</div>)}</div>
}
export function LineChart({ data, labels }: { data: number[]; labels?: string[] }) {
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const w = 400, h = 120, pts = data.map((v, i) => \`\${(i / (data.length - 1)) * w},\${h - ((v - min) / range) * h}\`).join(' ')
  return <div className="w-full overflow-hidden"><svg viewBox={\`0 0 \${w} \${h + 20}\`} className="w-full h-32"><polyline points={pts} fill="none" stroke="#18181b" strokeWidth="2.5" strokeLinejoin="round" />{data.map((_, i) => <text key={i} x={(i / (data.length - 1)) * w} y={h + 16} textAnchor="middle" className="text-[10px] fill-zinc-400" fontSize={10}>{labels?.[i] ?? ''}</text>)}</svg></div>
}
export function DonutChart({ data, labels, colors }: { data: number[]; labels?: string[]; colors?: string[] }) {
  const total = data.reduce((a, b) => a + b, 0) || 1
  const COLORS = colors ?? ['#18181b','#52525b','#a1a1aa','#d4d4d8','#e4e4e7']
  let angle = -90
  const slices = data.map((v, i) => { const sweep = (v / total) * 360; const a1 = angle; angle += sweep; const r = 60, cx = 70, cy = 70; const toRad = (d: number) => (d * Math.PI) / 180; const x1 = cx + r * Math.cos(toRad(a1)), y1 = cy + r * Math.sin(toRad(a1)), x2 = cx + r * Math.cos(toRad(a1 + sweep)), y2 = cy + r * Math.sin(toRad(a1 + sweep)); const large = sweep > 180 ? 1 : 0; return { d: \`M \${cx} \${cy} L \${x1} \${y1} A \${r} \${r} 0 \${large} 1 \${x2} \${y2} Z\`, color: COLORS[i % COLORS.length], label: labels?.[i] ?? '', pct: Math.round((v / total) * 100) } })
  return <div className="flex items-center gap-6"><svg viewBox="0 0 140 140" className="w-28 h-28">{slices.map((s, i) => <path key={i} d={s.d} fill={s.color} />)}<circle cx="70" cy="70" r="36" fill="white" /></svg><div className="space-y-1.5">{slices.map((s, i) => <div key={i} className="flex items-center gap-2 text-xs"><div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} /><span className="text-zinc-600">{s.label}</span><span className="font-semibold text-zinc-900 ml-auto">{s.pct}%</span></div>)}</div></div>
}
`,
        'src/components/forms.tsx': `'use client'
import { useState } from 'react'
export function SearchAndFilter({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none focus:border-zinc-900 bg-white w-full max-w-xs" />
}
export function ExportButton({ label = 'Export CSV', onClick }: { label?: string; onClick?: () => void }) {
  return <button onClick={onClick} className="px-4 py-2 border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">↓ {label}</button>
}
export function CreateEntityForm({ fields, onSubmit, submitLabel = 'Create' }: { fields: { name: string; label: string; type?: string }[]; onSubmit: (data: Record<string, string>) => void; submitLabel?: string }) {
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(fields.map(f => [f.name, ''])))
  return <form onSubmit={e => { e.preventDefault(); onSubmit(vals) }} className="space-y-3">{fields.map(f => <div key={f.name}><label className="block text-xs font-semibold text-zinc-600 mb-1">{f.label}</label><input type={f.type ?? 'text'} value={vals[f.name] ?? ''} onChange={e => setVals(v => ({ ...v, [f.name]: e.target.value }))} className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none focus:border-zinc-900" /></div>)}<button type="submit" className="w-full py-2.5 bg-zinc-900 text-white rounded-lg text-sm font-semibold hover:bg-zinc-700 transition-colors">{submitLabel}</button></form>
}
`,
        'src/components/modals.tsx': `'use client'
import { useState, type ReactNode } from 'react'
export function ConfirmModal({ open, onClose, onConfirm, title, message }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string }) {
  if (!open) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4"><h2 className="font-bold text-zinc-900 mb-2">{title}</h2><p className="text-sm text-zinc-600 mb-5">{message}</p><div className="flex gap-3"><button onClick={onClose} className="flex-1 py-2 border border-zinc-200 rounded-lg text-sm font-semibold hover:bg-zinc-50">Cancel</button><button onClick={() => { onConfirm(); onClose() }} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">Confirm</button></div></div></div>
}
export function EntityDetailModal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}><div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-zinc-900">{title}</h2><button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none">×</button></div>{children}</div></div>
}
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  if (!open) return null
  return <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40" onClick={onClose}><div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Type a command or search…" className="w-full px-4 py-3.5 text-sm outline-none border-b border-zinc-100" /><div className="p-3 text-sm text-zinc-400 text-center">No results for &quot;{q}&quot;</div></div></div>
}
`,
        'src/app/dashboard/[feature]/page.tsx': `'use client'
import { useParams } from 'next/navigation'
export default function FeaturePage() {
  const params = useParams()
  const slug = (params.feature as string) ?? ''
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2 capitalize">{slug.replace(/-/g, ' ')}</h1>
      <p className="text-zinc-500">This feature page is under construction.</p>
    </div>
  )
}
`,
        'src/hooks/useApp.ts': `'use client'
import { useState, useCallback } from 'react'
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : initial } catch { return initial } })
  const set = useCallback((v: T) => { setVal(v); try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }, [key])
  return [val, set]
}
export function useFilter<T>(items: T[], fn: (item: T, q: string) => boolean) {
  const [q, setQ] = useState('')
  return { q, setQ, filtered: q ? items.filter(i => fn(i, q.toLowerCase())) : items }
}
export function useModal() {
  const [open, setOpen] = useState(false)
  return { open, show: () => setOpen(true), hide: () => setOpen(false), toggle: () => setOpen(v => !v) }
}
export function useDemoToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000) }, [])
  return { msg, show }
}
`,
        'src/lib/data.ts': `import type { DataItem, DemoUser, ActivityItem, MetricCard } from './types'
export const DEMO_USER: DemoUser = { id: 'u1', name: 'Alex Johnson', email: 'alex@demo.com', role: 'admin', plan: 'Pro', avatar: 'AJ', joinedAt: '2024-01-15T10:00:00Z' }
export const METRICS: MetricCard[] = [
  { label: 'Total Revenue', value: '$48,295', change: 12.5, trend: 'up', sparkline: [30,45,28,60,55,75,68] },
  { label: 'Active Users', value: '2,847', change: 8.2, trend: 'up', sparkline: [200,220,215,240,260,270,285] },
  { label: 'Conversion Rate', value: '3.6%', change: -0.4, trend: 'down', sparkline: [4.0,3.9,4.1,3.8,3.7,3.6,3.6] },
  { label: 'Avg. Order Value', value: '$127', change: 5.1, trend: 'up', sparkline: [110,115,120,118,122,125,127] },
]
export const ITEMS: DataItem[] = Array.from({ length: 20 }, (_, i) => ({
  id: \`item-\${i + 1}\`,
  name: \`Item \${i + 1}\`,
  status: (['active','pending','completed','inactive'] as const)[i % 4],
  value: Math.floor(Math.random() * 10000) + 1000,
  createdAt: new Date(Date.now() - i * 86400000 * 3).toISOString(),
  updatedAt: new Date(Date.now() - i * 86400000).toISOString(),
}))
export const ACTIVITIES: ActivityItem[] = Array.from({ length: 15 }, (_, i) => ({
  id: \`act-\${i + 1}\`,
  action: ['Created new record', 'Updated settings', 'Deleted item', 'Viewed report', 'Exported data'][i % 5],
  user: ['Alex J.', 'Maria S.', 'Tom W.', 'Sara K.'][i % 4],
  timestamp: new Date(Date.now() - i * 3600000).toISOString(),
  type: (['create','update','delete','view'] as const)[i % 4],
}))
export const USERS: DemoUser[] = Array.from({ length: 8 }, (_, i) => ({
  id: \`u\${i + 1}\`,
  name: ['Alex Johnson','Maria Silva','Tom Walker','Sara Kim','Chris Lee','Emma Davis','Ryan Park','Zoe Chen'][i],
  email: \`user\${i + 1}@demo.com\`,
  role: (['admin','member','member','viewer','member','member','viewer','member'] as const)[i],
  plan: i < 2 ? 'Pro' : 'Starter',
  avatar: ['AJ','MS','TW','SK','CL','ED','RP','ZC'][i],
  joinedAt: new Date(2024, i % 12, (i + 1) * 2).toISOString(),
}))
// ── Navigation / Layout exports AI agents commonly reference ─────────────────
export const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
  { label: 'Analytics', href: '/dashboard/analytics', icon: 'BarChart2' },
  { label: 'Users', href: '/dashboard/users', icon: 'Users' },
  { label: 'Settings', href: '/dashboard/settings', icon: 'Settings' },
]
export const SIDEBAR_LINKS = NAV_ITEMS
export const NAVIGATION = NAV_ITEMS
export const NAV_LINKS = NAV_ITEMS
export const MENU_ITEMS = NAV_ITEMS
// ── Plans / Pricing ───────────────────────────────────────────────────────────
export const PLANS = [
  { id: 'free', name: 'Free', price: 0, features: ['Up to 3 projects', 'Basic analytics', 'Email support'] },
  { id: 'starter', name: 'Starter', price: 29, features: ['Up to 10 projects', 'Advanced analytics', 'Priority support', 'API access'] },
  { id: 'pro', name: 'Pro', price: 79, features: ['Unlimited projects', 'Full analytics suite', '24/7 support', 'API access', 'Custom domains'] },
]
export const PRICING_PLANS = PLANS
export const SUBSCRIPTION_PLANS = PLANS
// ── Testimonials / Social proof ───────────────────────────────────────────────
export const TESTIMONIALS = [
  { id: 't1', name: 'Sarah Chen', role: 'CTO at TechFlow', text: 'This product transformed how our team works. Highly recommended.', avatar: 'SC', rating: 5 },
  { id: 't2', name: 'Marcus Rivera', role: 'Founder at BuildFast', text: 'The best investment we made this year. ROI was immediate.', avatar: 'MR', rating: 5 },
  { id: 't3', name: 'Priya Patel', role: 'Head of Product at Scale', text: 'Incredibly intuitive. Our team was up and running in minutes.', avatar: 'PP', rating: 5 },
]
// ── Features / Landing page ───────────────────────────────────────────────────
export const FEATURES = [
  { id: 'f1', title: 'Lightning Fast', description: 'Built for speed and performance from the ground up.', icon: 'Zap' },
  { id: 'f2', title: 'Secure by Default', description: 'Enterprise-grade security with zero configuration.', icon: 'Shield' },
  { id: 'f3', title: 'Easy Integration', description: 'Connect with your existing tools in minutes.', icon: 'Plug' },
  { id: 'f4', title: 'Real-time Analytics', description: 'Understand your users with live data.', icon: 'BarChart' },
  { id: 'f5', title: 'Team Collaboration', description: 'Work together seamlessly with your entire team.', icon: 'Users' },
  { id: 'f6', title: '24/7 Support', description: 'Expert support whenever you need it.', icon: 'HeadphonesIcon' },
]
export const FEATURE_LIST = FEATURES
export const APP_FEATURES = FEATURES
// ── Stats / KPIs ──────────────────────────────────────────────────────────────
export const STATS = [
  { label: 'Active Users', value: '12,847', change: 8.2, trend: 'up' as const },
  { label: 'Revenue MRR', value: '$48,295', change: 12.5, trend: 'up' as const },
  { label: 'Conversion Rate', value: '3.6%', change: -0.4, trend: 'down' as const },
  { label: 'Avg. Session', value: '4m 32s', change: 5.1, trend: 'up' as const },
]
export const KPI_STATS = STATS
export const DASHBOARD_STATS = STATS
`,
      }

      for (const [stubPath, stubContent] of Object.entries(CRITICAL_STUBS)) {
        if (!existingPaths.has(stubPath)) {
          sourceFiles.push([stubPath, stubContent])
          existingPaths.add(stubPath)
        }
      }
    }

    // ── 3d. Barrel files for directory-style component imports ─────────────────
    // LLMs often import @/components/layout/AppSidebar when the file is actually
    // src/components/layout.tsx. Parse all imports and auto-generate re-export stubs.
    {
      const existingPaths = new Set(sourceFiles.map(([p]) => p))
      const newBarrels: [string, string][] = []

      for (const [, rawContent] of sourceFiles) {
        const content = rawContent as string
        const importRe = /from\s+['"](@\/[^'"]+)['"]/g
        let m: RegExpExecArray | null
        while ((m = importRe.exec(content)) !== null) {
          const importPath = m[1] // e.g. @/components/layout/AppSidebar
          const srcPath    = importPath.replace(/^@\//, 'src/')

          // Already resolves?
          const resolves = ['.tsx', '.ts', '.jsx', '.js'].some(e => existingPaths.has(srcPath + e))
            || existingPaths.has(srcPath)
            || ['.tsx', '.ts'].some(e => existingPaths.has(srcPath + '/index' + e))
          if (resolves) continue

          // Walk up the path looking for a flat parent file
          const parts = srcPath.split('/')
          for (let len = parts.length - 1; len >= 2; len--) {
            const parentSrc    = parts.slice(0, len).join('/')
            const parentImport = '@/' + parts.slice(1, len).join('/')
            if (existingPaths.has(parentSrc + '.tsx') || existingPaths.has(parentSrc + '.ts')) {
              const barrelPath = srcPath + '.tsx'
              if (!existingPaths.has(barrelPath)) {
                newBarrels.push([barrelPath,
                  `// auto-generated re-export barrel\nexport * from '${parentImport}'\n`])
                existingPaths.add(barrelPath)
              }
              break
            }
          }
        }
      }

      sourceFiles.push(...newBarrels)
    }

    // ── 3e. Catch-all stub generator for unresolved local imports ─────────────
    // After barrels, some @/ imports still have no file. We generate typed stubs
    // so webpack doesn't throw Module not found during `next build`.
    {
      const existingPaths = new Set(sourceFiles.map(([p]) => p))
      const newStubs: [string, string][] = []

      for (const [, rawContent] of sourceFiles) {
        const content = rawContent as string
        const importRe = /from\s+['"](@\/[^'"]+)['"]/g
        let m: RegExpExecArray | null
        while ((m = importRe.exec(content)) !== null) {
          const importPath = m[1]  // e.g. @/components/product-card
          const srcPath   = importPath.replace(/^@\//, 'src/')

          // Check if it resolves already
          const resolves =
            ['.tsx', '.ts', '.jsx', '.js'].some(e => existingPaths.has(srcPath + e)) ||
            existingPaths.has(srcPath) ||
            ['.tsx', '.ts'].some(e => existingPaths.has(srcPath + '/index' + e))
          if (resolves) continue

          // Determine stub type from path segments
          const lower = srcPath.toLowerCase()
          const isHook      = lower.includes('/hooks/') || lower.includes('/use')
          const isLib       = lower.includes('/lib/') || lower.includes('/utils') || lower.includes('/helpers')
          const isApi       = lower.includes('/api/')
          const isPage      = lower.includes('/app/') && lower.includes('/page')
          const isTypes     = lower.includes('/types') || lower.includes('/interfaces')
          const isContext   = lower.includes('/context') || lower.includes('/store')

          let stubContent: string
          // Extract component name from path
          const parts    = srcPath.split('/')
          const fileName = parts[parts.length - 1]
          const compName = fileName
            .replace(/\.(tsx?|jsx?)$/, '')
            .replace(/[-_](.)/g, (_, c: string) => (c as string).toUpperCase())
            .replace(/^./, (c: string) => (c as string).toUpperCase())

          if (isTypes) {
            stubContent = `// auto-generated type stub\nexport type ${compName}Item = { id: string; name: string; [key: string]: unknown }\nexport type ${compName}Props = Record<string, unknown>\nexport interface ${compName} { id: string; name: string }\n`
          } else if (isHook) {
            stubContent = `'use client'\nimport { useState } from 'react'\n// auto-generated hook stub\nexport function use${compName}() {\n  const [data, setData] = useState<unknown[]>([])\n  const [loading, setLoading] = useState(false)\n  return { data, loading, setData, setLoading, refetch: () => void 0 }\n}\nexport default use${compName}\n`
          } else if (isContext) {
            stubContent = `'use client'\nimport { createContext, useContext, useState, type ReactNode } from 'react'\n// auto-generated context stub\nconst Ctx = createContext<Record<string, unknown>>({})\nexport function ${compName}Provider({ children }: { children: ReactNode }) {\n  const [state, setState] = useState<Record<string, unknown>>({})\n  return <Ctx.Provider value={{ state, setState }}>{children}</Ctx.Provider>\n}\nexport function use${compName}() { return useContext(Ctx) }\n`
          } else if (isLib || isApi) {
            stubContent = `// auto-generated utility stub\nexport const ${compName} = {}\nexport function get${compName}() { return [] }\nexport function create${compName}(data: unknown) { return data }\nexport function update${compName}(id: string, data: unknown) { return { id, ...Object(data) } }\nexport function delete${compName}(id: string) { return { ok: true, id } }\nexport default {}\n`
          } else if (isPage) {
            stubContent = `export default function ${compName}Page() {\n  return <div className="p-8"><h1 className="text-2xl font-bold text-zinc-900">${compName}</h1><p className="text-zinc-500 mt-2">Page under construction.</p></div>\n}\n`
          } else {
            // Default: React component stub
            stubContent = `'use client'\nimport { type ReactNode } from 'react'\n// auto-generated component stub\nexport function ${compName}({ children, className }: { children?: ReactNode; className?: string }) {\n  return <div className={className}>{children}</div>\n}\nexport default ${compName}\n`
          }

          const stubPath = srcPath.endsWith('.tsx') || srcPath.endsWith('.ts') ? srcPath
            : (isLib || isHook || isTypes || isApi || isContext) ? srcPath + '.ts'
            : srcPath + '.tsx'

          if (!existingPaths.has(stubPath)) {
            newStubs.push([stubPath, stubContent])
            existingPaths.add(stubPath)
          }
        }
      }

      if (newStubs.length > 0) {
        console.info(`[vercel-app] Auto-stubbed ${newStubs.length} missing local imports:`, newStubs.map(([p]) => p).join(', '))
        sourceFiles.push(...newStubs)
      }
    }

    // ── 4. Upload blobs in parallel (10 at a time) — per-blob catch so one failure doesn't kill the batch
    const BLOB_CONCURRENCY = 10
    const fileRefs: { file: string; sha: string; size: number }[] = []
    const blobErrors: string[] = []
    for (let i = 0; i < sourceFiles.length; i += BLOB_CONCURRENCY) {
      const batch = sourceFiles.slice(i, i + BLOB_CONCURRENCY)
      const settled = await Promise.allSettled(batch.map(async ([filePath, content]) => {
        const buf = Buffer.from(content as string, 'utf8')
        const { sha, size } = await uploadBlob(buf, token, teamId)
        return { file: filePath, sha, size }
      }))
      for (const r of settled) {
        if (r.status === 'fulfilled') fileRefs.push(r.value)
        else blobErrors.push((r.reason as Error).message?.slice(0, 120) ?? 'unknown blob error')
      }
    }
    if (blobErrors.length > 0) {
      console.warn(`Vercel blob upload: ${blobErrors.length} file(s) failed —`, blobErrors.slice(0, 5))
    }
    if (fileRefs.length === 0) {
      throw new Error(`All ${sourceFiles.length} Vercel blob uploads failed — check Vercel token permissions`)
    }

    // ── 5. Create deployment — return immediately, let client poll ───────────
    const aliasUrl = `https://${finalName}.vercel.app`

    const deployment = await vPostRetry('/v13/deployments', token, {
      name:           finalName,
      files:          fileRefs,
      framework:      'nextjs',
      target:         'production',
      installCommand: 'npm install --legacy-peer-deps',
      buildCommand:   'next build',
      env: { NEXT_PUBLIC_APP_URL: aliasUrl },
    }, teamId)

    const deploymentId = deployment.id as string
    const state        = (deployment.readyState as string) ?? 'BUILDING'

    // Use the actual deployment URL (with hash) — always valid once READY.
    // The alias (finalName.vercel.app) propagates asynchronously; client polls status.
    const deployUrl = deployment.url
      ? `https://${deployment.url as string}`
      : aliasUrl

    return NextResponse.json({
      ok: true,
      data: {
        projectId,
        projectName:  finalName,
        deployUrl,
        aliasUrl,
        deploymentId,
        state,
        files:        fileRefs.length,
        ready:        state === 'READY',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[vercel-app deploy]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
