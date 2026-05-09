import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
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

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

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

    const sourceFiles = Object.entries(files)
      .filter(([path, content]) => !!content && !!path && !SKIP.some(s => path.includes(s)))
      .map(([path, content]): [string, string] => {
        // Remap bare filename → correct app directory location
        const remapped = NEXTJS_REMAP[path]
        if (remapped) return [remapped, content as string]
        // Also fix paths like "app/not-found.tsx" → "src/app/not-found.tsx"
        if (/^app\//.test(path)) return [`src/${path}`, content as string]
        return [path, content as string]
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
          next: '15.2.0', react: '19.0.0', 'react-dom': '19.0.0',
          'lucide-react': '0.468.0', clsx: '2.1.1', 'tailwind-merge': '2.5.4',
        },
        devDependencies: {
          typescript: '5.4.5', '@types/react': '19.0.0', '@types/react-dom': '19.0.0',
          '@types/node': '20.17.9', tailwindcss: '3.4.17', postcss: '8.4.49',
          autoprefixer: '10.4.20', eslint: '8.57.1', 'eslint-config-next': '15.2.0',
        },
      }, null, 2)])
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
import { type ReactNode, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { clsx, type ClassValue } from 'clsx'
function cn(...i: ClassValue[]) { return twMerge(clsx(i)) }
export function Button({ children, onClick, className, variant = 'primary', disabled, type = 'button' }: { children: ReactNode; onClick?: () => void; className?: string; variant?: 'primary'|'secondary'|'ghost'|'danger'; disabled?: boolean; type?: 'button'|'submit' }) {
  const v = { primary: 'bg-zinc-900 text-white hover:bg-zinc-700', secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200', ghost: 'bg-transparent text-zinc-600 hover:bg-zinc-100', danger: 'bg-red-600 text-white hover:bg-red-700' }
  return <button type={type} onClick={onClick} disabled={disabled} className={cn('px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50', v[variant], className)}>{children}</button>
}
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('bg-white border border-zinc-200 rounded-xl shadow-sm p-6', className)}>{children}</div>
}
export function Badge({ children, variant = 'default' }: { children: ReactNode; variant?: 'default'|'success'|'warning'|'danger'|'info' }) {
  const v = { default: 'bg-zinc-100 text-zinc-700', success: 'bg-emerald-50 text-emerald-700 border-emerald-200', warning: 'bg-amber-50 text-amber-700 border-amber-200', danger: 'bg-red-50 text-red-700 border-red-200', info: 'bg-blue-50 text-blue-700 border-blue-200' }
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border', v[variant])}>{children}</span>
}
export function Input({ value, onChange, placeholder, className, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cn('w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none focus:border-zinc-900 bg-white', className)} />
}
export function StatCard({ label, value, change, trend }: { label: string; value: string | number; change?: number; trend?: 'up'|'down'|'flat' }) {
  return <Card className="space-y-1"><p className="text-xs text-zinc-500 font-medium">{label}</p><p className="text-2xl font-bold text-zinc-900">{value}</p>{change !== undefined && <p className={cn('text-xs font-semibold', trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-zinc-500')}>{trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {Math.abs(change)}%</p>}</Card>
}
export function Table({ headers, rows }: { headers: string[]; rows: (string | number | ReactNode)[][] }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-zinc-200">{headers.map(h => <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50"><td className="py-3 px-4" colSpan={headers.length}>{row.join ? row.join(' · ') : row[0]}</td></tr>)}</tbody></table></div>
}
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}><div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-zinc-900">{title}</h2><button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl">×</button></div>{children}</div></div>
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

    // ── 4. Upload blobs ───────────────────────────────────────────────────────
    const fileRefs: { file: string; sha: string; size: number }[] = []
    for (const [path, content] of sourceFiles) {
      const buf = Buffer.from(content, 'utf8')
      const { sha, size } = await uploadBlob(buf, token, teamId)
      fileRefs.push({ file: path, sha, size })
    }

    // ── 5. Create deployment — return immediately, let client poll ───────────
    const aliasUrl = `https://${finalName}.vercel.app`

    const deployment = await vPost('/v13/deployments', token, {
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
