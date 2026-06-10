/**
 * buildChain.ts — Server-side 10-agent BUILD chain.
 *
 * Runs the same dependency-ordered wave planner as PipelinePage.tsx runBuild()
 * but without UI state, streaming, or browser dependencies.
 *
 * Agent dependency graph (from BUILD_AGENTS skill.dependencies):
 *   scaffold → parallel(mock-data, shell) → ui-core → parallel(landing, interactions)
 *   → api → dashboard → features → repair (conditional) → docs (skipped for speed)
 */

import { aiComplete } from '@/lib/ai'
import { BUILD_AGENTS, BUILD_AGENT_SYSTEMS, buildRepairMessage, parseAgentFiles } from '@/lib/buildAgentData'
import type { ForgeChainResult } from '@/lib/forgeChain'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuildChainResult {
  files:       Record<string, string>
  fileCount:   number
  totalTokens: number
}

// ─── Context assembly helpers ─────────────────────────────────────────────────

function compactText(s: string, max: number): string {
  if (!s) return ''
  if (s.length <= max) return s
  return s.slice(0, max) + '\n…[truncated]'
}

function snippet(files: Record<string, string>, key: string, max = 800): string {
  const val = files[key]
  if (!val) return ''
  return `\n--- ${key} (${Math.min(max, val.length)} chars) ---\n${compactText(val, max)}`
}

function buildUserMessage(
  agentId:     string,
  projectName: string,
  brief:       string,
  forgeContent: Record<string, string>,
  generatedSoFar: Record<string, string>,
): string {
  const manifest     = forgeContent['analyst']      ?? ''
  const arch         = forgeContent['architect']    ?? ''
  const features     = forgeContent['planner']      ?? ''
  const specContract = forgeContent['test-writer']  ?? ''
  const sql          = forgeContent['db-opt']       ?? ''
  const monetisation = forgeContent['monetisation'] ?? ''
  const workflowMap  = forgeContent['workflow-mapper'] ?? ''
  const securityReport = forgeContent['security']   ?? ''
  const SECURITY_AGENTS = new Set(['api', 'interactions', 'shell'])
  const heavyAgents   = new Set(['interactions', 'api', 'dashboard', 'features', 'repair'])

  const prevFilesSummary = Object.keys(generatedSoFar).length > 0
    ? `\nPREVIOUSLY GENERATED FILES (${Object.keys(generatedSoFar).length} total — do NOT re-generate these):\n${Object.keys(generatedSoFar).join('\n')}\n`
    : ''

  const prevContext = prevFilesSummary
    + snippet(generatedSoFar, 'src/lib/utils.ts', 600)
    + snippet(generatedSoFar, 'src/lib/types.ts', heavyAgents.has(agentId) ? 900 : 1500)
    + snippet(generatedSoFar, 'src/lib/data.ts', heavyAgents.has(agentId) ? 900 : 1500)
    + snippet(generatedSoFar, 'src/components/ui.tsx', heavyAgents.has(agentId) ? 800 : 1200)
    + snippet(generatedSoFar, 'src/app/layout.tsx', 500)
    + snippet(generatedSoFar, 'src/components/layout.tsx', 550)
    + snippet(generatedSoFar, 'src/app/globals.css', 400)
    + snippet(generatedSoFar, 'src/app/dashboard/layout.tsx', 450)
    + snippet(generatedSoFar, 'src/app/dashboard/page.tsx', agentId === 'features' ? 450 : 250)

  return `PROJECT: ${projectName}
BRIEF: ${brief}

PROJECT_MANIFEST.md:
${compactText(manifest, heavyAgents.has(agentId) ? 900 : 1600)}

ARCHITECTURE:
${compactText(arch, heavyAgents.has(agentId) ? 800 : 1300)}

FEATURE CARDS:
${compactText(features, heavyAgents.has(agentId) ? 900 : 1400)}

SPEC CONTRACT (entity names, slugs, field names — use these exactly):
${compactText(specContract, heavyAgents.has(agentId) ? 1300 : 1800)}

MICRO-SAAS GOVERNOR RULES:
- Build one narrow ICP, one painful problem, and one repeatable workflow.
- Implement exactly the 3 MVP route-backed workflows from SPEC CONTRACT.
- Each workflow must be sequential, at most 5 steps, and produce a measurable micro-output.
- First meaningful output should be reachable in 60 seconds or less with no help docs.
- Keep UI decisions per workflow run to 2 or fewer; remove branching and optional detours.
- Do not create extra dashboards, roles, marketplace/social layers, native mobile, i18n, broad analytics, or extra routes unless SPEC CONTRACT explicitly accepts them.
- Every visible workflow should reduce a manual step, speed time-to-value, or support the monetized expansion path.
- Deferred roadmap items stay as locked CTAs or sales copy, not half-built pages.

DATABASE SCHEMA (SQL — for understanding data relationships):
${compactText(sql, 700)}

MONETISATION TIERS + POST-PAYMENT EXPANSION (use PRICING_TIERS and one-click expansion CTA in landing/dashboard):
${['landing', 'dashboard'].includes(agentId) ? compactText(monetisation, 700) : '(not needed for this BUILD agent)'}
${workflowMap && ['interactions', 'dashboard', 'features'].includes(agentId) ? `\nWORKFLOW MAP:\n${compactText(workflowMap, 700)}\n` : ''}${SECURITY_AGENTS.has(agentId) && securityReport ? `\nSECURITY REPORT:\n${compactText(securityReport, 700)}\n` : ''}${prevContext}
Generate the ${agentId.toUpperCase()} files now. Follow the output contract exactly.`
}

// ─── Single agent runner with retry ──────────────────────────────────────────

async function runBuildAgent(
  agentId:        string,
  system:         string,
  userMsg:        string,
  tokens:         { count: number },
): Promise<Record<string, string>> {
  const agentMeta  = BUILD_AGENTS.find(a => a.id === agentId)!
  const maxTokens  = agentMeta.skill.tokenBudget ?? 2000
  const maxAttempts = agentMeta.skill.retryPolicy.maxAttempts ?? 3

  let lastErr: Error | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await aiComplete({ system, messages: [{ role: 'user', content: userMsg }], maxTokens })
      tokens.count += result.tokens ?? 0
      const parsed = parseAgentFiles(result.text)

      // Single-file agents: try raw unwrap if parse fails
      if (Object.keys(parsed).length === 0 && agentMeta.files.length === 1) {
        const raw = result.text.trim()
          .replace(/^```(?:tsx?|jsx?|ts|js)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .replace(/^FILE:\s*[^\n]+\n/, '')
          .replace(/^<<<\s*\n/, '')
          .replace(/\n>>>\s*$/, '')
          .trim()
        if (/export\s+default\s+function|export\s+const\s+metadata|^['"]use client['"]|^import\s/m.test(raw)) {
          return { [agentMeta.files[0]]: raw }
        }
      }

      if (Object.keys(parsed).length > 0) return parsed

      // Missing files on retryable agent — retry
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, agentMeta.skill.retryPolicy.backoffMs * (attempt + 1)))
        continue
      }
      return {}
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (agentMeta.skill.failureBehavior === 'abort') throw lastErr
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, agentMeta.skill.retryPolicy.backoffMs * (attempt + 1)))
      }
    }
  }

  console.error(`[buildChain] Agent ${agentId} failed after ${maxAttempts} attempts:`, lastErr?.message)
  return {}  // degrade: return empty, safety net will fill missing files
}

// ─── Safety net — minimum viable files ───────────────────────────────────────

function buildSafetyNetFiles(projectName: string): Record<string, string> {
  const title = projectName.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'NEXUS App'
  return {
    'src/app/globals.css': '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nbody { margin:0; background:#f8fafc; color:#0f172a; }\n',
    'src/app/layout.tsx': `import type { Metadata } from 'next'\nimport type { ReactNode } from 'react'\nimport './globals.css'\nexport const metadata: Metadata = { title: '${title}', description: 'Generated by NEXUS OS' }\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return (<html lang="en"><body>{children}</body></html>)\n}\n`,
    'src/app/page.tsx': `export default function HomePage() {\n  return (<main className="flex items-center justify-center min-h-screen"><div className="text-center p-8"><h1 className="text-4xl font-bold mb-4">${title}</h1><p className="text-gray-600">Your AI-generated SaaS application</p></div></main>)\n}\n`,
    'src/lib/utils.ts': `import { clsx, type ClassValue } from 'clsx'\nimport { twMerge } from 'tailwind-merge'\nexport function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }\nexport function formatCurrency(v: number) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v) }\nexport function formatDate(v: string | Date) { return new Intl.DateTimeFormat('en-US',{dateStyle:'medium'}).format(new Date(v)) }\n`,
    'package.json': JSON.stringify({ name: projectName.toLowerCase().replace(/[^a-z0-9-]/g,'-'), version: '0.1.0', private: true, scripts: { dev: 'next dev', build: 'next build', start: 'next start' }, dependencies: { next: '15.5.18', react: '19.0.0', 'react-dom': '19.0.0', 'lucide-react': '0.468.0', clsx: '2.1.1', 'tailwind-merge': '2.5.4' }, devDependencies: { typescript: '5.4.5', '@types/react': '19.0.0', '@types/react-dom': '19.0.0', '@types/node': '20.17.9', tailwindcss: '3.4.17', postcss: '8.4.49', autoprefixer: '10.4.20' } }, null, 2),
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runBuildChain(
  forge: ForgeChainResult,
  projectName: string,
  brief:       string,
): Promise<BuildChainResult> {
  const allFiles: Record<string, string> = {}
  const tokens = { count: 0 }
  const forgeContent = forge.content

  console.log(`[buildChain] START projectName=${projectName}`)

  // Build dependency-ordered wave plan (matches PipelinePage logic exactly)
  const mainAgents = BUILD_AGENTS
    .filter(a => a.id !== 'repair' && a.id !== 'docs')
    .sort((a, b) => a.skill.executionOrder - b.skill.executionOrder)

  const waves: string[][] = []
  const completed = new Set<string>()
  const pending = new Map(mainAgents.map(a => [a.id, a]))

  while (pending.size > 0) {
    const ready = [...pending.values()]
      .filter(a => a.skill.dependencies.every(dep => completed.has(dep)))
      .sort((a, b) => a.skill.executionOrder - b.skill.executionOrder)

    if (ready.length === 0) throw new Error('[buildChain] Dependency graph blocked')

    const first = ready[0]
    const wave = first.skill.parallelGroup === null
      ? [first.id]
      : ready
          .filter(a =>
            a.skill.executionOrder === first.skill.executionOrder &&
            a.skill.parallelGroup  === first.skill.parallelGroup
          )
          .map(a => a.id)

    waves.push(wave)
    for (const id of wave) { completed.add(id); pending.delete(id) }
  }

  // Execute waves
  for (const wave of waves) {
    const waveCtx = { ...allFiles }
    console.log(`[buildChain] wave: ${wave.join(' + ')} (${tokens.count} tokens)`)

    const waveResults = await Promise.all(
      wave.map(agentId =>
        runBuildAgent(
          agentId,
          BUILD_AGENT_SYSTEMS[agentId] ?? `You are the NEXUS ${agentId.toUpperCase()} BUILD agent.`,
          buildUserMessage(agentId, projectName, brief, forgeContent, waveCtx),
          tokens,
        ).then(parsed => ({ agentId, parsed }))
      )
    )
    for (const { parsed } of waveResults) Object.assign(allFiles, parsed)
  }

  console.log(`[buildChain] main waves done: ${Object.keys(allFiles).length} files (${tokens.count} tokens)`)

  // Repair: always run it server-side (no preRepairQuality check — simpler, more reliable)
  const repairMsg = buildRepairMessage({ projectName, brief }, allFiles)
  const repairFiles = await runBuildAgent(
    'repair',
    BUILD_AGENT_SYSTEMS['repair'] ?? 'You are the NEXUS REPAIR agent.',
    repairMsg,
    tokens,
  )
  Object.assign(allFiles, repairFiles)
  console.log(`[buildChain] repair done: ${Object.keys(allFiles).length} files (${tokens.count} tokens)`)

  // Apply safety net for any missing critical files
  const safetyNet = buildSafetyNetFiles(projectName)
  for (const [file, content] of Object.entries(safetyNet)) {
    if (!allFiles[file]?.trim()) allFiles[file] = content
  }

  console.log(`[buildChain] DONE: ${Object.keys(allFiles).length} files total ${tokens.count} tokens`)

  return { files: allFiles, fileCount: Object.keys(allFiles).length, totalTokens: tokens.count }
}
