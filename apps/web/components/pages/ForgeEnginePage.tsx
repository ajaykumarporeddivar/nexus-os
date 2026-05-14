'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { AGENTS, PIPES, agentFileMap, DEMO_FORGE_RESPONSES } from '@/lib/agentData'
import { FORGE_AGENT_SYSTEMS, extractQAScore } from '@/lib/forgeAgentData'
import { nexusStore } from '@/lib/nexusStore'
import { formatCRC32 } from '@/lib/crc32'
import { VoiceTextarea } from '@/components/VoiceButton'
import { auditEvent } from '@/lib/auditEvent'
import { useWorkspace } from '@/lib/workspaceContext'
import type { AgentStatus, Build, ExecutionStatus } from '@nexus-os/shared-types'

function extractDeliveryStatus(text: string): ExecutionStatus {
  if (/APPROVED/i.test(text)) return 'APPROVED'
  if (/NEEDS[_\s]REVISION/i.test(text)) return 'NEEDS_REVISION'
  return 'COMPLETE'
}

interface AgentState {
  status: AgentStatus
  output: string
  tokens: number
  progress: number
}

export default function ForgeEnginePage() {
  const { data: session }     = useSession()
  const { active: workspace } = useWorkspace()
  const sessionPlan = (session?.user as { plan?: string } | null)?.plan ?? 'free'
  const sessionId   = (session?.user as { id?: string } | null)?.id ?? 'anon'

  const [input, setInput]         = useState('')
  const [clientName, setClientName] = useState('')
  const [apiKey, setApiKey]       = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isDone, setIsDone]       = useState(false)
  const [logLines, setLogLines]   = useState<string[]>([])
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({})
  const [pipeStatus, setPipeStatus]   = useState<Record<string, 'idle'|'run'|'done'>>({})
  const [files, setFiles]         = useState<Record<string, string>>({})
  const [totalTokens, setTotalTokens] = useState(0)
  const [totalCalls, setTotalCalls]   = useState(0)
  const [elapsed, setElapsed]     = useState(0)
  const [qaScore, setQaScore]     = useState<number | null>(null)
  const [integrity, setIntegrity] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [isDemo, setIsDemo]       = useState(false)
  const [trendingTitle, setTrendingTitle] = useState<string | null>(null)

  const [displayTokens, setDisplayTokens] = useState(0)

  const logRef        = useRef<HTMLDivElement>(null)
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef      = useRef<number>(0)
  const progressRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const runningAgent  = useRef<string | null>(null)

  useEffect(() => {
    const runtimePrefill = sessionStorage.getItem('nexus-forge-prefill')
    if (runtimePrefill) {
      setInput(prev => prev || `[Reasoning context from Runtime]\n\n${runtimePrefill}`)
      sessionStorage.removeItem('nexus-forge-prefill')
    }
    const journeyPrefill = sessionStorage.getItem('nexus-prefill-forge-input')
    if (journeyPrefill) {
      setInput(prev => prev || journeyPrefill)
      sessionStorage.removeItem('nexus-prefill-forge-input')
    }
    const clientPrefill = sessionStorage.getItem('nexus-prefill-forge-client')
    if (clientPrefill) {
      setClientName(prev => prev || clientPrefill)
      setTrendingTitle(clientPrefill)
      sessionStorage.removeItem('nexus-prefill-forge-client')
    }
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logLines])

  // Animate token counter smoothly
  useEffect(() => {
    if (totalTokens === 0) { setDisplayTokens(0); return }
    const target = totalTokens
    const steps  = 20
    const stepSz = Math.max(1, Math.ceil((target - displayTokens) / steps))
    let cur = displayTokens
    const t = setInterval(() => {
      cur = Math.min(cur + stepSz, target)
      setDisplayTokens(cur)
      if (cur >= target) clearInterval(t)
    }, 25)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalTokens])

  const log = useCallback((msg: string, type: 'info' | 'ok' | 'warn' | 'err' = 'info') => {
    const ts = new Date().toLocaleTimeString('en', { hour12: false })
    const prefix = type === 'ok' ? '[✓]' : type === 'warn' ? '[⚠]' : type === 'err' ? '[✗]' : '[→]'
    setLogLines(ls => [...ls, `${ts} ${prefix} ${msg}`])
  }, [])

  const setAgent = useCallback((agentId: string, patch: Partial<AgentState>) => {
    setAgentStates(s => {
      const prev = s[agentId] ?? { status: 'idle' as const, output: '', tokens: 0, progress: 0 }
      return { ...s, [agentId]: { ...prev, ...patch } }
    })
  }, [])

  const startAgentProgress = useCallback((agentId: string) => {
    runningAgent.current = agentId
    if (progressRef.current) clearInterval(progressRef.current)
    let prog = 0
    progressRef.current = setInterval(() => {
      prog = Math.min(prog + Math.random() * 4 + 1, 88)
      setAgent(agentId, { progress: Math.floor(prog) })
    }, 350)
  }, [setAgent])

  const stopAgentProgress = useCallback(() => {
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null }
    runningAgent.current = null
  }, [])

  const callAgent = useCallback(async (agentId: string, system: string, userMsg: string, key: string): Promise<{ content: string; tokens: number }> => {
    const res = await fetch('/api/claude/once', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({ systemPrompt: system, userMessage: userMsg, apiKey: key || undefined, plan: sessionPlan, sessionId }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error ?? 'Agent call failed')
    return data.data
  }, [sessionId, sessionPlan])

  const pushExecution = useCallback((qaText: string, score: number | null, generatedFiles: Record<string, string>, calls: number, tokens: number) => {
    const entry: Build = {
      id: nexusStore.builds.length + 1,
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      input: input.slice(0, 60),
      client: clientName || 'Demo',
      phases: Object.keys(generatedFiles),
      tokens,
      calls,
      score,
      passed: score !== null ? score >= 8.0 : null,
      status: extractDeliveryStatus(qaText),
      files: Object.keys(generatedFiles).length,
    }
    nexusStore.addBuild(entry)
  }, [input, clientName])

  const runForge = useCallback(async () => {
    if (isRunning || !input.trim()) return
    const key = apiKey.trim()

    setIsRunning(true)
    setIsDone(false)
    setLogLines([])
    setFiles({})
    setQaScore(null)
    setIntegrity(null)
    setTotalTokens(0)
    setTotalCalls(0)
    setDisplayTokens(0)
    setAgentStates({})
    setPipeStatus({})

    startRef.current = Date.now()
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)

    const generatedContent: Record<string, string> = {}
    let tokens = 0
    let calls = 0

    await auditEvent('forge_run_started', { client: clientName, inputSnippet: input.slice(0, 60) })

    try {
      for (let i = 0; i < AGENTS.length; i++) {
        const agent = AGENTS[i]
        const pipe  = PIPES[i]

        setPipeStatus(s => ({ ...s, [pipe]: 'run' }))
        setAgent(agent.id, { status: 'run', progress: 0 })
        startAgentProgress(agent.id)
        log(`Phase ${i} · ${agent.name} — ${agent.role}`)

        const prevOutputs = Object.entries(generatedContent)
          .map(([k, v]) => `[${k}]: ${v.slice(0, 400)}`)
          .join('\n\n')

        const wsBlock = workspace?.context
          ? `\n\nWORKSPACE CONTEXT [${workspace.emoji} ${workspace.name}]:\n${workspace.context}`
          : ''
        const userMsg = i === 0
          ? `Mission: ${input}${wsBlock}\nClient: ${clientName || workspace?.name || 'Client'}`
          : `${input}${wsBlock}\n\nPrevious agent outputs:\n${prevOutputs}`

        const result = await callAgent(agent.id, FORGE_AGENT_SYSTEMS[agent.id] ?? `You are the NEXUS ${agent.id.toUpperCase()} agent. Complete your task.`, userMsg, key)
        stopAgentProgress()
        generatedContent[agent.id] = result.content
        tokens += result.tokens
        calls++

        const filePath = agentFileMap[agent.id]
        if (filePath) {
          setFiles(f => ({ ...f, [filePath]: result.content }))
        }

        setAgent(agent.id, { status: 'done', output: result.content.slice(0, 200), tokens: result.tokens, progress: 100 })
        setPipeStatus(s => ({ ...s, [pipe]: 'done' }))
        setTotalTokens(tokens)
        setTotalCalls(calls)
        log(`✓ ${agent.name} complete (${result.tokens} tokens)`, 'ok')
      }

      /* QA Gate check + self-healing */
      const qaText = generatedContent['qa'] ?? ''
      let score = extractQAScore(qaText)
      setQaScore(score)

      if (score !== null && score < 8.0) {
        log(`Score ${score}/10 — below 8.0 gate. Triggering Builder revision…`, 'warn')

        try {
          const builderOutput = generatedContent['builder'] ?? ''
          const revisionResult = await callAgent(
            'builder',
            'You are the BUILDER agent performing a REVISION. The QA gate flagged quality issues. Fix the code based on QA findings.',
            `QA findings:\n${qaText.slice(0, 600)}\n\nRevise and improve this code:\n${builderOutput.slice(0, 800)}`,
            key
          )
          tokens += revisionResult.tokens
          calls++
          generatedContent['builder'] = revisionResult.content
          setFiles(f => ({ ...f, ['src/index.revised.ts']: revisionResult.content }))
          log('✓ Revision complete — re-running QA gate', 'ok')

          const revisedQAResult = await callAgent(
            'qa',
            'You are the QA GATE agent. Run a final quality assessment of the REVISED build.',
            `Assess the REVISED build. Score each dimension 0-10. Produce overall_quality_score/10 and delivery_recommendation: APPROVED | NEEDS_REVISION.\n\nRevised code:\n${revisionResult.content.slice(0, 600)}`,
            key
          )
          tokens += revisedQAResult.tokens
          calls++
          generatedContent['qa'] = revisedQAResult.content
          score = extractQAScore(revisedQAResult.content)
          setQaScore(score)
          setFiles(f => ({ ...f, ['.forge/qa-report-revised.md']: revisedQAResult.content }))
          log(`✓ Revised QA score: ${score ?? '?'}/10`, score !== null && score >= 8 ? 'ok' : 'warn')
        } catch (revErr) {
          log(`⚠ Revision failed: ${(revErr as Error).message}`, 'warn')
        }
      } else {
        log(`QA Gate: ${score ?? '?'}/10 — ${score !== null && score >= 8 ? 'APPROVED' : 'COMPLETE'}`, score !== null && score >= 8 ? 'ok' : 'warn')
      }

      /* Integrity checksum */
      const allContent = Object.values(generatedContent).join('\n')
      setIntegrity(formatCRC32(allContent))

      setTotalTokens(tokens)
      setTotalCalls(calls)

      pushExecution(generatedContent['qa'] ?? '', score, generatedContent, calls, tokens)
      await auditEvent('forge_run_completed', { score, tokens, calls, files: Object.keys(generatedContent).length })

      // Persist build for one-click deploy on the Deploy page
      try {
        const buildEntry = {
          projectName: clientName || 'nexus-app',
          brief:       input.slice(0, 200),
          score,
          files:       Object.fromEntries(
            Object.entries(generatedContent)
              .filter(([id]) => agentFileMap[id])
              .map(([id, content]) => [agentFileMap[id], content])
          ),
          builtAt: new Date().toISOString(),
        }
        // Keep a rolling history of last 10 builds
        const prev = JSON.parse(localStorage.getItem('nexus_forge_builds') ?? '[]')
        localStorage.setItem('nexus_forge_builds', JSON.stringify([buildEntry, ...prev].slice(0, 10)))
        localStorage.setItem('nexus_forge_last_build', JSON.stringify(buildEntry))
      } catch { /* storage full or unavailable */ }

      log('Pipeline complete', 'ok')
    } catch (err) {
      log(`Error: ${(err as Error).message}`, 'err')
    } finally {
      stopAgentProgress()
      if (timerRef.current) clearInterval(timerRef.current)
      setIsRunning(false)
      setIsDone(true)
    }
  }, [isRunning, input, apiKey, clientName, callAgent, log, setAgent, startAgentProgress, stopAgentProgress, pushExecution])

  const runDemo = useCallback(async () => {
    if (isRunning) return
    setIsDemo(true)
    setInput('Build a recruitment automation platform with AI-powered candidate screening, follow-up sequences, and analytics reporting.')
    setClientName('Demo Agency')
    setIsRunning(true)
    setIsDone(false)
    setLogLines([])
    setFiles({})
    setQaScore(null)

    startRef.current = Date.now()
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)

    const generatedContent: Record<string, string> = {}
    let tokens = 0

    for (let agentIdx = 0; agentIdx < AGENTS.length; agentIdx++) {
      const agent = AGENTS[agentIdx]
      const response = DEMO_FORGE_RESPONSES[agent.id] ?? `[${agent.name}] Demo output complete.`
      setPipeStatus(s => ({ ...s, [PIPES[agentIdx]]: 'run' }))
      setAgent(agent.id, { status: 'run', progress: 0 })
      log(`Phase ${agentIdx} · ${agent.name} (DEMO)`)

      // character-stream animation
      let streamed = ''
      for (let c = 0; c < response.length; c += 6) {
        await new Promise(r => setTimeout(r, 18))
        streamed = response.slice(0, c + 6)
        setLogLines(ls => {
          const copy = [...ls]
          copy[copy.length - 1] = `${new Date().toLocaleTimeString('en', { hour12: false })} [→] ${agent.name}: ${streamed.slice(-80)}`
          return copy
        })
      }

      generatedContent[agent.id] = response
      tokens += Math.floor(response.length / 4)
      const filePath = agentFileMap[agent.id]
      if (filePath) setFiles(f => ({ ...f, [filePath]: response }))

      setAgent(agent.id, { status: 'done', output: response.slice(0, 200), tokens: Math.floor(response.length / 4), progress: 100 })
      setPipeStatus(s => ({ ...s, [PIPES[agentIdx]]: 'done' }))
      setTotalTokens(tokens)
      setTotalCalls(c => c + 1)
      log(`✓ ${agent.name} complete`, 'ok')
    }

    setQaScore(8.7)
    const allContent = Object.values(generatedContent).join('\n')
    setIntegrity(formatCRC32(allContent))

    pushExecution(generatedContent['qa'] ?? '', 8.7, generatedContent, AGENTS.length, tokens)

    // Persist demo build for Deploy page
    try {
      const demoFiles = Object.fromEntries(
        Object.entries(generatedContent)
          .filter(([id]) => agentFileMap[id])
          .map(([id, content]) => [agentFileMap[id], content])
      )
      const buildEntry = {
        projectName: 'recruitment-automation-platform',
        brief:       'Build a recruitment automation platform with AI-powered candidate screening, follow-up sequences, and analytics reporting.',
        score:       8.7,
        files:       demoFiles,
        builtAt:     new Date().toISOString(),
      }
      const prev = JSON.parse(localStorage.getItem('nexus_forge_builds') ?? '[]')
      localStorage.setItem('nexus_forge_builds', JSON.stringify([buildEntry, ...prev].slice(0, 10)))
      localStorage.setItem('nexus_forge_last_build', JSON.stringify(buildEntry))
    } catch { /* storage unavailable */ }

    log('Demo pipeline complete', 'ok')

    if (timerRef.current) clearInterval(timerRef.current)
    setIsRunning(false)
    setIsDone(true)
  }, [isRunning, log, setAgent, pushExecution])

  const downloadZIP = useCallback(async () => {
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      Object.entries(files).forEach(([path, content]) => zip.file(path, content))

      const safeClient = clientName || 'Client'
      const qaLabel = qaScore !== null ? `${qaScore}/10` : 'N/A'
      const approval = qaScore !== null && qaScore >= 8 ? 'APPROVED' : 'QUALITY REVIEW'
      const readme = `# NEXUS FORGE Delivery Package
## ${safeClient}

> Generated by NEXUS OS FORGE Engine on ${new Date().toLocaleString()}
> QA Score: **${qaLabel}** · Status: **${approval}** · Tokens used: ${totalTokens.toLocaleString()}

---

## What's in this package

| File | What it does |
|------|-------------|
| \`PROJECT_MANIFEST.md\` | Full project scope, features, success criteria, timeline — share this with your client as the SoW |
| \`.claude/architecture.md\` | System design: services, data flow, infrastructure, API contracts |
| \`.claude/features/feature-cards.md\` | Sprint-ready feature cards with user stories and acceptance criteria |
| \`src/__tests__/specs.md\` | Test specifications (TDD) — hand off to your dev team |
| \`src/index.ts\` | Core application scaffold — production-ready TypeScript starting point |
| \`.claude/security-report.md\` | OWASP security audit with CRITICAL/HIGH/MEDIUM/LOW findings |
| \`db/migrations/001_init.sql\` | Database schema with indexes and constraints — run this first |
| \`.forge/qa-report.md\` | Quality gate report — internal use, not for the client |

---

## How to use this package

### Step 1 — Client delivery (today)
1. Open \`PROJECT_MANIFEST.md\` — this is your **Statement of Work**
2. Review features, timeline, and success criteria with your client
3. Get sign-off before development begins

### Step 2 — Hand off to your dev team
1. Share the entire ZIP with your development team
2. They start with \`db/migrations/001_init.sql\` — run this against your database first
3. \`src/index.ts\` is the application entry point — scaffold from here
4. \`.claude/architecture.md\` answers every "how does X connect to Y?" question
5. \`.claude/features/feature-cards.md\` maps directly to Jira/Linear tickets

### Step 3 — Development setup
\`\`\`bash
# Install dependencies (adjust for your stack)
npm install

# Set up environment
cp .env.example .env
# Fill in your API keys, database URL, etc.

# Run the database migration
psql $DATABASE_URL < db/migrations/001_init.sql

# Start development
npm run dev
\`\`\`

### Step 4 — Quality & security
- Read \`.claude/security-report.md\` — fix all CRITICAL and HIGH findings before launch
- Use \`src/__tests__/specs.md\` as your test suite baseline
- Re-run FORGE after major changes to regenerate an updated QA report

---

## QA Score breakdown

The QA gate scored this deliverable **${qaLabel}** across:
- Instruction clarity
- Schema completeness
- Code quality
- Security posture
- Test coverage estimate
- Deliverability

${qaScore !== null && qaScore >= 8
  ? '**This package is APPROVED for client delivery.**'
  : '**This package scored below the 8.0 threshold.** Review `.forge/qa-report.md` and address findings before delivery.'
}

---

## Need help?

Contact NEXUS OS support or re-run the FORGE engine with a more detailed brief to improve scores.

*Package integrity verified by NEXUS FORGE · nexus-os.ai*
`
      zip.file('README.md', readme)
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nexus-forge-${clientName || 'build'}-${Date.now()}.zip`
      a.click()
      URL.revokeObjectURL(url)
      await auditEvent('forge_download', { client: clientName, files: Object.keys(files).length })
    } catch (err) {
      log(`ZIP download failed: ${(err as Error).message}`, 'err')
    }
  }, [files, clientName, totalTokens, qaScore, log])

  const downloadWhiteLabelZIP = useCallback(async () => {
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      // Strip NEXUS OS branding from each file's content
      const brandTerms = [
        /NEXUS OS FORGE Engine/gi,
        /NEXUS FORGE/gi,
        /NEXUS OS/gi,
        /nexus-os\.ai/gi,
        /Contact NEXUS OS support[^.]*\./gi,
        /Package integrity verified[^\n]*/gi,
      ]
      const agencyName = (session?.user?.name ?? '').trim() || 'Your Agency'
      Object.entries(files).forEach(([path, content]) => {
        let clean = content
        brandTerms.forEach(re => { clean = clean.replace(re, agencyName) })
        zip.file(path, clean)
      })

      const safeClient = clientName || 'Client'
      const qaLabel = qaScore !== null ? `${qaScore}/10` : 'N/A'
      const approval = qaScore !== null && qaScore >= 8 ? 'APPROVED' : 'QUALITY REVIEW'
      const readme = `# Software Delivery Package
## ${safeClient}

> Prepared by ${agencyName} on ${new Date().toLocaleString()}
> QA Score: **${qaLabel}** · Status: **${approval}**

---

## What's in this package

| File | What it does |
|------|-------------|
| \`PROJECT_MANIFEST.md\` | Full project scope, features, success criteria, timeline — your Statement of Work |
| \`.claude/architecture.md\` | System design: services, data flow, infrastructure, API contracts |
| \`.claude/features/feature-cards.md\` | Sprint-ready feature cards with user stories and acceptance criteria |
| \`src/__tests__/specs.md\` | Test specifications — hand off to your dev team |
| \`src/index.ts\` | Core application scaffold — production-ready TypeScript starting point |
| \`.claude/security-report.md\` | OWASP security audit with CRITICAL/HIGH/MEDIUM/LOW findings |
| \`db/migrations/001_init.sql\` | Database schema with indexes and constraints — run this first |

---

## How to use this package

### Step 1 — Client delivery (today)
1. Open \`PROJECT_MANIFEST.md\` — this is your **Statement of Work**
2. Review features, timeline, and success criteria with your client
3. Get sign-off before development begins

### Step 2 — Hand off to your dev team
1. Share the entire ZIP with your development team
2. They start with \`db/migrations/001_init.sql\` — run this against your database first
3. \`src/index.ts\` is the application entry point — scaffold from here
4. \`.claude/architecture.md\` answers every "how does X connect to Y?" question
5. \`.claude/features/feature-cards.md\` maps directly to Jira/Linear tickets

### Step 3 — Development setup
\`\`\`bash
# Install dependencies (adjust for your stack)
npm install

# Set up environment
cp .env.example .env

# Run the database migration
psql $DATABASE_URL < db/migrations/001_init.sql

# Start development
npm run dev
\`\`\`

### Step 4 — Quality & security
- Read \`.claude/security-report.md\` — fix CRITICAL and HIGH findings before launch
- Use \`src/__tests__/specs.md\` as your test suite baseline

---

## QA Score breakdown

This deliverable scored **${qaLabel}** across instruction clarity, schema completeness, code quality, security posture, test coverage, and deliverability.

${qaScore !== null && qaScore >= 8
  ? '**This package is APPROVED for client delivery.**'
  : '**Review findings before delivery.**'
}

*Prepared by ${agencyName}*
`
      zip.file('README.md', readme)
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeClient.toLowerCase().replace(/\s+/g, '-')}-delivery-${Date.now()}.zip`
      a.click()
      URL.revokeObjectURL(url)
      await auditEvent('forge_whitelabel_download', { client: clientName, files: Object.keys(files).length })
    } catch (err) {
      log(`White-label ZIP failed: ${(err as Error).message}`, 'err')
    }
  }, [files, clientName, qaScore, session, log])

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-8">
        <p className="sec-label mb-2">FORGE Engine</p>
        <h2 className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>
          9-Agent Delivery Pipeline
        </h2>
      </div>

      {trendingTitle && !isRunning && !isDone && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-paper2">
          <span className="text-[10px] font-black font-mono tracking-widest text-ink3 border border-border rounded px-2 py-0.5">FROM TRENDING</span>
          <span className="text-sm text-ink font-medium flex-1">{trendingTitle} — brief loaded. Hit Launch to build.</span>
          <button
            onClick={runForge}
            disabled={isRunning || !input.trim()}
            className="btn btn-primary text-xs py-1.5 px-4 disabled:opacity-50"
          >
            ⚡ Launch now
          </button>
          <button onClick={() => setTrendingTitle(null)} className="text-ink3 hover:text-ink text-xs">✕</button>
        </div>
      )}

      {isDemo && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-lg border border-acid/40 bg-acid/5">
          <span className="chip acid">DEMO MODE</span>
          <span className="text-sm text-ink3">Running demo with pre-seeded responses — no API key required.</span>
          <button onClick={() => setIsDemo(false)} className="ml-auto text-ink3 hover:text-ink text-xs">Dismiss</button>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-8">
        {/* ─── Left column ─── */}
        <div className="space-y-6">
          {/* Input area */}
          <div className="card space-y-4">
            <p className="sec-label">Mission Brief</p>
            <VoiceTextarea
              value={input}
              onChange={setInput}
              placeholder="Describe your deliverable — the client brief, project scope, and desired output... (or click the mic to dictate)"
              rows={5}
              disabled={isRunning}
              label=""
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Client name"
                className="px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
                disabled={isRunning}
              />
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Anthropic API key (optional)"
                className="px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid font-mono"
                disabled={isRunning}
              />
            </div>
            {input.trim() && !isRunning && !isDone && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-acid/5 border border-acid/20 text-xs text-acid/80 font-mono">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-acid animate-[pulse_1s_ease-in-out_infinite]" />
                <span>FORGE agents ready · {AGENTS.length} phases · hit launch</span>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={runForge}
                disabled={isRunning || !input.trim()}
                className={`btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                  input.trim() && !isRunning && !isDone
                    ? 'shadow-[0_0_18px_2px_rgba(200,242,60,0.28)] scale-[1.02]'
                    : ''
                }`}
              >
                {isRunning && !isDemo ? '⟳ RUNNING…' : '⚡ LAUNCH ENGINE'}
              </button>
              <button
                onClick={runDemo}
                disabled={isRunning}
                className="btn btn-ghost disabled:opacity-50"
              >
                ▶ Try Demo
              </button>
              {isDone && (
                <>
                  <button onClick={downloadZIP} className="btn btn-dark">⬇ Download ZIP</button>
                  {(sessionPlan === 'agency' || sessionPlan === 'enterprise') ? (
                    <button onClick={downloadWhiteLabelZIP} className="btn btn-dark" title="Download with your agency name — no NEXUS OS branding">
                      ⬇ White-Label ZIP
                    </button>
                  ) : (
                    <button
                      onClick={() => { window.location.href = '/shell?page=pricing' }}
                      className="btn btn-ghost opacity-60 text-xs"
                      title="Agency plan required"
                    >
                      🔒 White-Label ZIP
                    </button>
                  )}
                  <button
                    onClick={() => setPreviewOpen(true)}
                    className="btn btn-ghost"
                    disabled={isRunning}
                  >
                    Preview Files
                  </button>
                  <button
                    onClick={() => { window.location.href = '/shell?page=deploy' }}
                    className="btn btn-primary"
                  >
                    ↑ Deploy
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Stream log */}
          <div className="card space-y-2">
            <p className="sec-label">Pipeline Log</p>
            <div ref={logRef} className="stream-box h-56 overflow-y-auto">
              {logLines.length === 0
                ? <span className="text-ink3">Pipeline log will appear here…</span>
                : logLines.map((l, i) => (
                  <div
                    key={`log-${i}-${l.slice(0, 16)}`}
                    className={
                      l.includes('[✓]') ? 'al-ok' :
                      l.includes('[⚠]') ? 'al-warn' :
                      l.includes('[✗]') ? 'al-err' :
                      'al-info'
                    }
                  >{l}</div>
                ))
              }
            </div>
          </div>

          {/* Agent fleet */}
          <div>
            <p className="sec-label mb-3">Agent Fleet</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {AGENTS.map((agent, idx) => {
                const as = agentStates[agent.id]
                const status: AgentStatus = as?.status ?? 'idle'
                const isActive = status === 'run'
                return (
                  <div
                    key={agent.id}
                    className={`panel space-y-2 transition-all duration-300 ${
                      isActive
                        ? 'border-acid/60 shadow-[0_0_14px_2px_rgba(200,242,60,0.18)] scale-[1.01]'
                        : status === 'done' ? 'border-green/20' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {isActive && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-acid animate-[pulse_0.7s_ease-in-out_infinite]" />
                        )}
                        <span className="text-xs font-mono font-semibold">{agent.name}</span>
                      </div>
                      <span className={`chip ${status === 'done' ? 'ok' : status === 'run' ? 'acid' : status === 'err' ? 'err' : ''}`}>
                        {status === 'run' ? 'active' : status}
                      </span>
                    </div>
                    <p className="text-xs text-ink3">{agent.role}</p>
                    <div className="score-bar-wrap overflow-hidden">
                      <div
                        className={`score-bar-fill transition-all duration-500 ${isActive ? 'bg-acid' : ''}`}
                        style={{ width: `${as?.progress ?? 0}%` }}
                      />
                    </div>
                    {as?.output && (
                      <p className="text-xs text-ink3 line-clamp-2 font-mono">{as.output}</p>
                    )}
                    {isActive && as?.tokens === 0 && (
                      <p className="text-[10px] text-acid/70 font-mono animate-pulse">processing…</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* File tree */}
          {Object.keys(files).length > 0 && (
            <div className="card space-y-2">
              <p className="sec-label">Generated Files ({Object.keys(files).length})</p>
              <div className="space-y-1">
                {Object.keys(files).map(path => (
                  <div key={path} className="flex items-center gap-2 text-xs font-mono py-1 px-2 rounded hover:bg-paper3">
                    <span className="text-acid">◈</span>
                    <span className="text-ink2">{path}</span>
                  </div>
                ))}
              </div>
              {integrity && (
                <p className="text-xs font-mono text-ink3 mt-2 pt-2 border-t border-border">
                  Integrity: {integrity}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ─── Right column ─── */}
        <div className="space-y-5">
          {/* Pipeline viz */}
          <div className="card space-y-3">
            <p className="sec-label">Pipeline</p>
            <div className="space-y-2">
              {PIPES.map((pipe, i) => {
                const status = pipeStatus[pipe] ?? 'idle'
                return (
                  <div key={pipe} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-mono flex-shrink-0 transition-all ${
                      status === 'done' ? 'border-green bg-green/10 text-green' :
                      status === 'run'  ? 'border-acid bg-acid/20 text-acid shadow-[0_0_8px_1px_rgba(200,242,60,0.4)] animate-[pulse_0.8s_ease-in-out_infinite]' :
                      'border-border bg-paper3 text-ink3'
                    }`}>
                      {status === 'done' ? '✓' : i}
                    </div>
                    <span className={`text-xs font-mono transition-colors ${
                      status === 'done' ? 'text-green' :
                      status === 'run'  ? 'text-acid font-semibold' :
                      'text-ink3'
                    }`}>{pipe}</span>
                    {status === 'run' && (
                      <span className="text-[9px] text-acid/60 font-mono ml-auto animate-pulse">running</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Stats */}
          <div className="card space-y-3">
            <p className="sec-label">Stats</p>
            {(() => {
              const completedCount = Object.values(pipeStatus).filter(s => s === 'done').length
              const eta = isRunning && completedCount > 0 && elapsed > 0
                ? Math.max(0, Math.round((elapsed / completedCount) * (AGENTS.length - completedCount)))
                : null
              return [
                { label: 'Tokens', val: displayTokens.toLocaleString(), highlight: isRunning },
                { label: 'API Calls', val: String(totalCalls), highlight: false },
                { label: 'Phases', val: `${completedCount}/${AGENTS.length}`, highlight: false },
                { label: isRunning && eta !== null ? 'ETA' : 'Elapsed', val: isRunning && eta !== null ? `~${eta}s` : `${elapsed}s`, highlight: isRunning },
              ]
            })().map(({ label, val, highlight }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-ink3">{label}</span>
                <span className={`font-mono font-semibold transition-colors ${highlight ? 'text-acid' : ''}`}>{val}</span>
              </div>
            ))}
          </div>

          {/* QA score */}
          {qaScore !== null && (
            <div className={`card space-y-2 border ${qaScore >= 8 ? 'border-green/40' : 'border-amber/40'}`}>
              <div className="flex items-center justify-between">
                <p className="sec-label">QA Score</p>
                <span className={`chip ${qaScore >= 8 ? 'ok' : 'warn'}`}>
                  {qaScore >= 8 ? 'Approved' : 'Quality Review'}
                </span>
              </div>
              <div className="score-display text-4xl">{qaScore.toFixed(1)}<span className="text-lg text-ink3">/10</span></div>
            </div>
          )}
        </div>
      </div>

      {/* Preview modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm" onClick={() => setPreviewOpen(false)}>
          <div className="bg-paper border border-border rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">Build Preview</h3>
              <button onClick={() => setPreviewOpen(false)} className="text-ink3 hover:text-ink">✕</button>
            </div>
            <div className="space-y-3 mb-4">
              <div className="flex gap-2"><span className="chip">{Object.keys(files).length} files</span><span className="chip">application/zip</span></div>
              {integrity && <p className="text-xs font-mono text-ink3">Integrity: {integrity}</p>}
            </div>
            <div className="space-y-1 mb-4">
              {Object.keys(files).map(path => (
                <div key={path} className="text-xs font-mono text-ink2 py-0.5">◈ {path}</div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => { setPreviewOpen(false); downloadZIP() }} className="btn btn-primary w-full">
                ⬇ Download ZIP →
              </button>
              {(sessionPlan === 'agency' || sessionPlan === 'enterprise') ? (
                <button onClick={() => { setPreviewOpen(false); downloadWhiteLabelZIP() }} className="btn btn-dark w-full text-sm">
                  ⬇ White-Label ZIP — no NEXUS branding
                </button>
              ) : (
                <button onClick={() => { setPreviewOpen(false); window.location.href = '/shell?page=pricing' }} className="btn btn-ghost w-full text-xs opacity-60">
                  🔒 White-Label ZIP — Agency plan required
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
