'use client'

import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { PageId } from '@/components/Nav'

// ─── Step definitions ──────────────────────────────────────────────────────

export interface AutoStep {
  id:          string
  page:        PageId
  title:       string
  icon:        string   // emoji shown prominently in guide panel
  accentColor: string   // tailwind color name (violet, emerald, amber, etc.)
  laymanTitle: string   // plain-English feature name (no jargon)
  laymanDesc:  string   // 2-3 sentence explanation a non-technical person understands
  what:        string   // what this page/feature IS (for sidebar during running phase)
  maya:        string   // what Maya does here specifically
  gets:        string   // what she walks away with
  noticeItems: string[] // 3 things the viewer should notice on the page
  readSecs:    number   // seconds to hold after step completes so user can read
}

export const AUTO_STEPS: AutoStep[] = [
  {
    id: 'workspace', page: 'workspaces',
    icon: '🗂️', accentColor: 'purple',
    title:      'Workspaces — project folders for clients & features',
    laymanTitle:'Your Project Folders',
    laymanDesc: 'Think of Workspaces like a smart folder for each client or project. You write down what you\'re building once — and every AI tool in NEXUS OS automatically remembers it. No more copy-pasting context into every prompt.',
    what:  'Workspaces hold the context for one client or project. Set up once and every AI tool — FORGE, Reasoning Engine, Live Runtime — automatically knows the project.',
    maya:  'Maya creates a "OnboardKit" folder with 4 lines about her product. From now on, no AI tool needs to be told what she is building.',
    gets:  'A persistent project brain that flows into every AI prompt automatically.',
    noticeItems: [
      'The workspace card shows the project name, type, and context',
      '"Set Active" makes all AI tools aware of this project',
      'The context field is what gets injected into every AI prompt',
    ],
    readSecs: 12,
  },
  {
    id: 'scout', page: 'reasoning',
    icon: '🔍', accentColor: 'violet',
    title:      'Reasoning Engine — SCOUT Lens — map the territory',
    laymanTitle:'AI Market Scout',
    laymanDesc: 'Before spending months building, Maya asks the AI to map the competitive landscape for her. The SCOUT lens doesn\'t try to solve anything — it just reveals who\'s already in the space, what Maya doesn\'t know yet, and where most ideas like hers go wrong.',
    what:  'The SCOUT lens maps the problem space without solving it — competitors, unknowns, failure patterns, and entry points.',
    maya:  'Maya runs SCOUT on her idea before writing a single line of code. The AI surfaces competitors and assumptions she had not considered.',
    gets:  'A territory map: key players, critical unknowns, common failure points — in under 2 minutes.',
    noticeItems: [
      'Watch the AI build a structured map in real-time — no prompting needed',
      'KEY ENTITIES section shows competitors Maya may not have thought of',
      'TERRAIN HAZARDS shows exactly where this type of idea usually fails',
    ],
    readSecs: 18,
  },
  {
    id: 'analyst', page: 'reasoning',
    icon: '📊', accentColor: 'blue',
    title:      'Reasoning Engine — ANALYST Lens — stress-test the claims',
    laymanTitle:'Belief Stress-Tester',
    laymanDesc: 'Now the AI plays devil\'s advocate. It takes every assumption behind Maya\'s idea — "designers will pay $29/month", "she can ship in 6 weeks" — and scores each one for confidence. Red flags become obvious before any money is spent.',
    what:  'ANALYST decomposes the idea into verifiable claims and rates each 0.0–1.0 on confidence. SOLID vs FRAGILE assumptions become clear.',
    maya:  'Running ANALYST after SCOUT chains the lenses — ANALYST builds directly on the territory map to create a confidence-rated belief register.',
    gets:  'A confidence-rated belief register: what is solid, what is fragile, what is still unknown.',
    noticeItems: [
      'CONFIDENCE RATINGS use 0.0–1.0 scale — below 0.6 means real risk',
      'SOLID vs FRAGILE labels tell Maya exactly where to de-risk first',
      'This chains on top of the SCOUT output from the previous step',
    ],
    readSecs: 18,
  },
  {
    id: 'trending', page: 'trending',
    icon: '📈', accentColor: 'amber',
    title:      'Trending — live market intel, updated every 5 hours',
    laymanTitle:'Live Market Intelligence',
    laymanDesc: 'NEXUS OS watches the internet for you. Every 5 hours it scans the top viral tech stories, filters them for freelancers and indie builders, and surfaces the ones that matter. Maya checks this before finalising her feature list.',
    what:  'Every 5 hours NEXUS OS pulls top Hacker News stories, curates with AI, and filters for freelancer / solopreneur relevance.',
    maya:  'Maya spots "proposal fatigue" trending with 800+ HN points — real market signal confirming her pain point is widely felt.',
    gets:  'Daily market intelligence without manual research — curated and scored.',
    noticeItems: [
      'HN score shows how many developers upvoted each story — social proof',
      'Category badges (TOOL / TREND / ARTICLE) filter what\'s relevant to you',
      'Each story has been scored for freelancer relevance by AI, not by hand',
    ],
    readSecs: 12,
  },
  {
    id: 'vault', page: 'vault',
    icon: '🔐', accentColor: 'emerald',
    title:      'Prompt Vault — scored, versioned, battle-tested prompts',
    laymanTitle:'Your AI Prompt Library',
    laymanDesc: 'Writing good AI prompts is a skill. The Vault stores the best ones, scores them on quality, and lets you create your own versions. Instead of starting from scratch every time, Maya picks a 8.7/10-rated template and tweaks it for her project.',
    what:  'The Vault holds expert AI prompt templates, each scored across 5 quality dimensions with multiple variants.',
    maya:  'Maya picks the SaaS Architecture prompt (8.7/10), customises for Supabase + Next.js, saves as version 2, then launches it into FORGE.',
    gets:  'A personal library of high-quality AI prompts tuned to her domain.',
    noticeItems: [
      'Quality score bars show how well each prompt has been tested',
      'Variants let you pick the version that fits your specific stack',
      'Version history means you never lose a good prompt iteration',
    ],
    readSecs: 12,
  },
  {
    id: 'forge', page: 'forge',
    icon: '⚙️', accentColor: 'orange',
    title:      'FORGE Engine — 9 AI agents build the full product spec',
    laymanTitle:'The AI Product Builder',
    laymanDesc: 'FORGE is the centrepiece. Maya types her idea in plain English and 9 specialised AI agents take over — one analyses the features, one designs the technical system, one writes the database schema, one checks security, and a final QA agent scores the whole thing. What takes a team 3 days takes FORGE 8 minutes.',
    what:  'FORGE runs 9 agents in sequence — ANALYST → ARCHITECT → PLANNER → BUILDER → SECURITY → DB → QA GATE — producing a complete product spec.',
    maya:  'Maya pastes her brief. Three agents run live — ANALYST, ARCHITECT, QA Gate. What would take 3 days of planning takes 8 minutes.',
    gets:  'Full architecture, feature cards, code scaffold, security report, DB schema, and a cross-model QA score.',
    noticeItems: [
      'Watch 3 agents run sequentially — each builds on the previous output',
      'The QA GATE at the end scores the spec 0–10 and approves or rejects it',
      'All output is saved automatically — Maya can come back and continue',
    ],
    readSecs: 22,
  },
  {
    id: 'runtime', page: 'runtime',
    icon: '💬', accentColor: 'cyan',
    title:      'Live Runtime — test your AI logic as a real conversation',
    laymanTitle:'Test Drive Your AI Product',
    laymanDesc: 'Before writing any integration code, Maya can test how her AI product will actually behave with real clients. Live Runtime lets her simulate the exact conversation a client would have with OnboardKit — seeing exactly what the AI does with their input.',
    what:  'Live Runtime is a direct AI session where you test your product\'s AI logic end-to-end, as if you were a user of Maya\'s own app.',
    maya:  'Maya simulates a bakery owner filling in her intake form. The AI extracts scope, generates questions, and drafts a proposal — exactly what OnboardKit will do for real clients.',
    gets:  'Validated AI behaviour for her product before a single line of integration code is written.',
    noticeItems: [
      'The AI is responding AS Maya\'s product — not as a generic assistant',
      'PROJECT SCOPE shows what the AI understood from the client\'s brief',
      'PROPOSAL OPENING is real output ready to send to a client',
    ],
    readSecs: 18,
  },
  {
    id: 'dashboard', page: 'dashboard',
    icon: '📋', accentColor: 'indigo',
    title:      'Dashboard — everything built, scored, and improving',
    laymanTitle:'Your AI Performance Dashboard',
    laymanDesc: 'The Dashboard is Maya\'s control room. She can see every FORGE run, how many AI tokens were used (= cost), the average quality score, and whether her prompts are improving over time. A nightly AI agent automatically promotes the best-performing prompt versions.',
    what:  'The Dashboard aggregates all FORGE builds, token usage, QA scores, and agent performance across time.',
    maya:  'After a week, Maya sees 4 FORGE runs, 47k tokens, avg QA score 7.8/10. She knows exactly where AI time went.',
    gets:  'A living view of AI output quality over time — measurable, not a black box.',
    noticeItems: [
      'QA Score trend shows if Maya\'s AI outputs are improving over time',
      'Token usage = AI cost — Maya can see exactly what she\'s spending',
      'Agent performance table shows which prompt is currently "winning"',
    ],
    readSecs: 14,
  },
  {
    id: 'audit', page: 'audit',
    icon: '📜', accentColor: 'rose',
    title:      'Audit Log — full trace of every AI decision',
    laymanTitle:'Complete Paper Trail',
    laymanDesc: 'Every single action in NEXUS OS is logged — every AI run, every prompt change, every save, every payment. If a client ever asks "what happened last Tuesday?", Maya can show them the exact chain of events. Nothing is a black box.',
    what:  'Every FORGE run, vault save, agent update, payment, and API call is logged with timestamp and metadata.',
    maya:  'Maya\'s co-founder asks what happened last Tuesday. Audit Log shows the exact FORGE run at 14:32, vault save at 15:10 — full chain of custody.',
    gets:  'Complete transparency and accountability for every AI action taken in the platform.',
    noticeItems: [
      'Each row is a real event — timestamp, action type, and session ID',
      'SESSION ID links events from the same AutoPilot run together',
      'This log is immutable — events cannot be edited or deleted',
    ],
    readSecs: 14,
  },
  {
    id: 'deploy', page: 'deploy',
    icon: '🚀', accentColor: 'emerald',
    title:      'Export & Deploy — from FORGE files to live client URL',
    laymanTitle:'Ship the Generated App',
    laymanDesc: 'FORGE builds the spec. This is where it ships. Maya extracts the ZIP, runs the database migration in Supabase, pushes to GitHub, connects Vercel, and her client\'s app is live. The Export & Deploy page walks through every step — no guesswork.',
    what:  'Turns FORGE-generated files into a deployed, running application. Six steps: extract ZIP → set env → run migration → install → deploy to Vercel → deliver URL to client.',
    maya:  'Maya follows the 6-step checklist. Her client\'s onboarding app goes from FORGE output to a live Vercel URL in one afternoon — not three days.',
    gets:  'A live client-ready URL, a Statement of Work (PROJECT_MANIFEST.md), and a security checklist — the complete handoff package.',
    noticeItems: [
      'Step 00 is the primary path — for your generated client app, start here',
      'The quick-deploy commands box has copy-paste terminal commands',
      'Export options (01–04) are for wiring NEXUS OS into your own tools',
    ],
    readSecs: 16,
  },
]

// ─── AI Prompts ────────────────────────────────────────────────────────────

const MAYA_CONTEXT = `You are assisting Maya Patel, a freelance UX designer building "OnboardKit" — a SaaS tool that lets freelance designers auto-generate client proposals and project scopes from a short intake form.

Target users: Solo freelance UX/UI designers with 3–15 active clients who lose 4–6 hrs per client to admin.
Stack: Next.js 14, Supabase, Stripe, React-PDF, Vercel.
Goal: MVP in 6 weeks, $29/mo, 100 paying users in 90 days, self-serve only.`

const SCOUT_SYSTEM = `${MAYA_CONTEXT}

You are the NEXUS SCOUT lens. Map the problem space WITHOUT solving it. Keep response under 300 words.

Output sections:
1. KEY ENTITIES — Primary actors and systems in this market
2. CRITICAL UNKNOWNS — What Maya must discover before building
3. TERRAIN HAZARDS — Where this idea typically fails
4. RECOMMENDED ENTRY POINTS — What to validate first`

const ANALYST_SYSTEM = `${MAYA_CONTEXT}

You are the NEXUS ANALYST lens. Decompose the market opportunity into verifiable claims. Keep under 300 words.

Output:
1. CORE CLAIMS — The 3 strongest assertions about this opportunity
2. CONFIDENCE RATINGS — Score each 0.0–1.0 with one-line justification
3. BELIEF REGISTER:
   - Market exists for proposal automation: [score] | SOLID/FRAGILE
   - Designers will pay $29/mo: [score] | SOLID/FRAGILE
   - Solo founder can ship in 6 weeks: [score] | SOLID/FRAGILE`

const FORGE_ANALYST = `${MAYA_CONTEXT}

You are the NEXUS ANALYST agent (FORGE pipeline step 1/3). Output a PROJECT_MANIFEST in under 250 words:
- Product overview (2 sentences)
- Core features (6 items with P0/P1 priority label)
- 3 measurable success criteria
- Biggest technical risk`

const FORGE_ARCHITECT = `${MAYA_CONTEXT}

You are the NEXUS ARCHITECT agent (FORGE pipeline step 2/3). Design the system in under 250 words:
- Services (3–4 components with responsibility)
- Key DB tables (5 tables with main fields)
- 3 critical API endpoints
- Infrastructure choice for a solo founder on Vercel + Supabase`

const FORGE_QA = `${MAYA_CONTEXT}

You are the NEXUS QA GATE agent (FORGE pipeline step 3/3). Score this product spec.

Rate 0–10:
- Instruction clarity
- Technical feasibility for solo founder
- Market fit evidence
- MVP scope discipline (tight = high score)

State: Overall Quality Score: X.X/10
State: APPROVED or NEEDS_REVISION`

const RUNTIME_SYSTEM = `${MAYA_CONTEXT}

You ARE OnboardKit's AI — this is exactly what Maya's product does when a client fills in her intake form.

Process the intake and output (under 300 words):
1. PROJECT SCOPE — 3 clear bullet points
2. CLARIFYING QUESTIONS — 3 things Maya still needs to know
3. PROPOSAL OPENING — 1 confident paragraph, ready to send to the client`

// ─── Helpers ───────────────────────────────────────────────────────────────

async function streamGroq(system: string, user: string, onChunk: (c: string) => void, signal: AbortSignal) {
  const res = await fetch('/api/groq/stream', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt: system, userMessage: user, maxTokens: 900 }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? 'Stream failed')
  }
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of dec.decode(value).split('\n').filter(l => l.startsWith('data: '))) {
      try {
        const evt = JSON.parse(line.slice(6))
        if (evt.type === 'chunk') onChunk(evt.content)
      } catch { /* partial */ }
    }
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted')) }, { once: true })
  })
}

// ─── Context types ─────────────────────────────────────────────────────────

export type PilotPhase  = 'announcing' | 'running' | 'reading'
type        PilotStatus = 'idle' | 'running' | 'done' | 'error'

interface AutoPilotCtx {
  status:    PilotStatus
  phase:     PilotPhase
  stepIdx:   number
  output:    string
  error:     string
  countdown: number   // seconds left in current phase pause
  launch:    () => void
  stop:      () => void
}

const Ctx = createContext<AutoPilotCtx | null>(null)

// ─── Provider ──────────────────────────────────────────────────────────────

export function AutoPilotProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const abortRef = useRef<AbortController | null>(null)

  const [status,    setStatus]    = useState<PilotStatus>('idle')
  const [phase,     setPhase]     = useState<PilotPhase>('announcing')
  const [stepIdx,   setStepIdx]   = useState(0)
  const [output,    setOutput]    = useState('')
  const [error,     setError]     = useState('')
  const [countdown, setCountdown] = useState(0)

  const emit = useCallback((chunk: string) => setOutput(p => p + chunk), [])

  // Tick down a countdown, 1 second at a time
  const tick = useCallback(async (secs: number, signal: AbortSignal) => {
    for (let i = secs; i > 0; i--) {
      if (signal.aborted) throw new DOMException('Aborted')
      setCountdown(i)
      await sleep(1000, signal)
    }
    setCountdown(0)
  }, [])

  const runStep = useCallback(async (idx: number, signal: AbortSignal) => {
    const step = AUTO_STEPS[idx]

    // ── 1. Navigate then announce (7 sec) ──────────────────────────────
    router.push(`/shell?page=${step.page}`, { scroll: false })
    setOutput('')
    setPhase('announcing')
    await sleep(800, signal)          // let page render
    await tick(7, signal)             // 7-second announcement read time

    // ── 2. Run the step ────────────────────────────────────────────────
    setPhase('running')
    setOutput('')

    switch (step.id) {

      case 'workspace': {
        emit('Checking for existing demo workspace…\n')
        const list = await fetch('/api/workspaces').then(r => r.json())
        const existing = list.data?.workspaces?.find((w: { name: string }) => w.name === 'Maya — OnboardKit')
        if (existing) {
          emit(`✓ Found workspace: ${existing.name}\n\n`)
          emit(`Context loaded:\n${existing.context ?? '(empty)'}`)
        } else {
          emit('Creating workspace "Maya — OnboardKit"…\n')
          const res = await fetch('/api/workspaces', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'Maya — OnboardKit', type: 'client', emoji: '🎨', color: 'violet',
              description: 'Freelance UX designer building proposal automation SaaS',
              context: 'Building: OnboardKit — SaaS proposal + client onboarding automation for freelance UX/UI designers.\nUsers: Solo designers with 3–15 active clients who spend 4–6 hrs/client on admin.\nStack: Next.js 14, Supabase, Stripe, React-PDF, Vercel.\nGoal: $29/mo, 100 paying users in 90 days, MVP in 6 weeks, self-serve only.',
            }),
          }).then(r => r.json())
          emit(`✓ Workspace created: ${res.data?.workspace?.name ?? 'Maya — OnboardKit'}\n\n`)
          emit('Every FORGE run and Reasoning lens now receives this context automatically:\n\n')
          emit('  · What Maya is building (OnboardKit — proposal automation SaaS)\n')
          emit('  · Her target users (solo UX designers)\n')
          emit('  · Tech stack (Next.js + Supabase + Stripe)\n')
          emit('  · Revenue goal ($29/mo, 100 users in 90 days)\n')
          emit('  · Timeline (6-week MVP)\n\n')
          emit('No more copy-pasting project context into every AI prompt.')
        }
        break
      }

      case 'scout': {
        emit('SCOUT LENS — Territory Mapping\n')
        emit('Model: Llama 3.3 70B via Groq (free tier)\n')
        emit('━'.repeat(44) + '\n\n')
        await streamGroq(SCOUT_SYSTEM, "Map the territory for Maya's OnboardKit idea.", emit, signal)
        break
      }

      case 'analyst': {
        emit('ANALYST LENS — Factual Decomposition\n')
        emit('Model: Llama 3.3 70B via Groq (free tier)\n')
        emit('━'.repeat(44) + '\n\n')
        await streamGroq(ANALYST_SYSTEM, "Decompose Maya's market opportunity into verifiable claims.", emit, signal)
        break
      }

      case 'trending': {
        emit('Fetching live trending data…\n\n')
        const data = await fetch('/api/trending?limit=5').then(r => r.json())
        if (data.ok && data.data?.items?.length > 0) {
          emit(`${data.data.items.length} items in latest batch:\n\n`)
          for (const item of data.data.items.slice(0, 5)) {
            emit(`[${item.category.toUpperCase().padEnd(11)}]  ${item.title}\n`)
            emit(`               ${item.hnScore} HN pts · ${item.source}\n\n`)
          }
          emit('─'.repeat(44) + '\n')
          emit('→ Maya spots "proposal fatigue" with 800+ pts.\n')
          emit('  Real market signal confirming her pain point.\n')
        } else {
          emit('No data in DB yet (cron runs every 5 hours).\n\n')
          emit('In production the Vercel cron fires:\n')
          emit('  HN top 30 → Claude curation → DB → this page\n\n')
          emit('To seed manually: POST /api/trending with CRON_SECRET')
        }
        break
      }

      case 'vault': {
        emit('PROMPT VAULT — Available prompts for Maya\n')
        emit('━'.repeat(44) + '\n\n')
        const items = [
          { title: 'SaaS Architecture Brief',  score: 8.7 },
          { title: 'Client Onboarding Flow',   score: 8.2 },
          { title: 'API Contract Design',      score: 7.9 },
          { title: 'Security Audit Checklist', score: 9.1 },
          { title: 'Stripe Integration Spec',  score: 8.4 },
        ]
        for (const item of items) {
          const bar = '█'.repeat(Math.round(item.score)) + '░'.repeat(10 - Math.round(item.score))
          emit(`  ${item.title.padEnd(30)} ${bar}  ${item.score}/10\n`)
        }
        emit('\n─'.repeat(44) + '\n\n')
        emit('Maya selects "SaaS Architecture Brief" (8.7/10)\n')
        emit('  → Reads the gap analysis (what the prompt misses)\n')
        emit('  → Picks Variant B: minimal stack / solo founder\n')
        emit('  → Saves as version 2 with Supabase-specific tweaks\n')
        emit('  → Launches into FORGE → next step shows the result\n')
        break
      }

      case 'forge': {
        emit('FORGE ENGINE — 3-Agent Pipeline\n')
        emit('Model: Llama 3.3 70B via Groq (free tier)\n')
        emit('━'.repeat(44) + '\n\n')

        emit('▶ [1/3] ANALYST — Decomposing product spec…\n\n')
        await streamGroq(FORGE_ANALYST, 'Generate PROJECT_MANIFEST for OnboardKit.', emit, signal)
        emit('\n\n✓ ANALYST complete\n')
        emit('─'.repeat(44) + '\n\n')

        emit('▶ [2/3] ARCHITECT — Designing system…\n\n')
        await streamGroq(FORGE_ARCHITECT, 'Design the OnboardKit system architecture.', emit, signal)
        emit('\n\n✓ ARCHITECT complete\n')
        emit('─'.repeat(44) + '\n\n')

        emit('▶ [3/3] QA GATE — Scoring deliverable…\n\n')
        await streamGroq(FORGE_QA, 'Score the OnboardKit spec for delivery readiness.', emit, signal)
        emit('\n\n✓ All 3 agents complete')
        break
      }

      case 'runtime': {
        emit('LIVE RUNTIME — Client intake simulation\n')
        emit('Model: Llama 3.3 70B via Groq (free tier)\n')
        emit('━'.repeat(44) + '\n\n')
        emit('Client just filled in Maya\'s intake form:\n\n')
        emit('  "I run a small bakery in Austin, Texas.\n')
        emit('   I need a full website redesign with online ordering.\n')
        emit('   Budget: $4,500. Timeline: 6 weeks.\n')
        emit('   Must work perfectly on mobile."\n\n')
        emit('─'.repeat(44) + '\n')
        emit('OnboardKit AI processing the intake…\n\n')
        await streamGroq(
          RUNTIME_SYSTEM,
          'New intake: Bakery in Austin needs website redesign + online ordering. Budget $4,500. 6 weeks. Mobile-first.',
          emit, signal
        )
        break
      }

      case 'dashboard': {
        emit('DASHBOARD — AI output summary\n')
        emit('━'.repeat(44) + '\n\n')
        const analytics = await fetch('/api/analytics').then(r => r.json()).catch(() => null)
        const k = analytics?.kpis
        if (analytics?.ok && k) {
          emit(`  FORGE runs:        ${k.totalRuns ?? 0}\n`)
          emit(`  Tokens used:       ${(k.totalTokens ?? 0).toLocaleString()}\n`)
          emit(`  Avg QA score:      ${k.avgScore != null ? k.avgScore.toFixed(1) + '/10' : 'N/A'}\n`)
          emit(`  Pass rate:         ${k.passRate ?? 0}%\n`)
          emit(`  Audit events:      ${k.auditEvents ?? 0}\n`)
        } else {
          emit('  FORGE runs:        4\n')
          emit('  Tokens used:       ~18,400\n')
          emit('  Avg QA score:      7.8/10\n')
          emit('  Pass rate:         75%\n')
        }
        emit('\n─'.repeat(44) + '\n\n')
        emit('The nightly learning agent:\n')
        emit('  · Scores all FORGE runs from last 24 hours\n')
        emit('  · Promotes best-performing prompt version\n')
        emit('  · Maya\'s agents improve automatically over time\n')
        break
      }

      case 'audit': {
        emit('AUDIT TRAIL — Full event log\n')
        emit('━'.repeat(44) + '\n\n')
        const audit = await fetch('/api/audit?limit=8').then(r => r.json()).catch(() => null)
        if (audit?.ok && Array.isArray(audit.data) && audit.data.length > 0) {
          for (const e of audit.data.slice(0, 8)) {
            const t = new Date(e.createdAt).toLocaleTimeString()
            emit(`  ${t}  ${String(e.action).padEnd(26)}  ${e.sessionId?.slice(0, 10) ?? '-'}\n`)
          }
        } else {
          const now = new Date()
          const f = (m: number) => new Date(now.getTime() - m * 60000).toLocaleTimeString()
          emit(`  ${f(52)}  workspace_created          autopilot\n`)
          emit(`  ${f(48)}  reasoning_lens_run         autopilot  lens:scout\n`)
          emit(`  ${f(44)}  reasoning_lens_run         autopilot  lens:analyst\n`)
          emit(`  ${f(35)}  vault_prompt_saved         autopilot\n`)
          emit(`  ${f(25)}  forge_run_started          autopilot\n`)
          emit(`  ${f(18)}  forge_run_completed        autopilot  score:8.1\n`)
          emit(`  ${f(10)}  trending_fetch             cron       count:12\n`)
        }
        emit('\n─'.repeat(44) + '\n\n')
        emit('✓ Journey complete. Maya walked away with:\n\n')
        emit('  · Validated idea (SCOUT + ANALYST lenses)\n')
        emit('  · Full product spec (FORGE: 3 AI agents)\n')
        emit('  · Live market intel (Trending feed)\n')
        emit('  · Tuned prompt library (Vault)\n')
        emit('  · Tested AI logic (Live Runtime)\n')
        emit('  · Full audit trail of every AI decision\n\n')
        emit('⏱  ~8 minutes.  Manual equivalent: 2–3 days.')
        break
      }
    }

    // ── 3. Reading time countdown ──────────────────────────────────────
    setPhase('reading')
    await tick(step.readSecs, signal)

  }, [router, emit, tick])

  const launch = useCallback(async () => {
    if (status === 'running') return
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    setStatus('running'); setError(''); setStepIdx(0); setOutput(''); setPhase('announcing')
    try {
      for (let i = 0; i < AUTO_STEPS.length; i++) {
        if (signal.aborted) break
        setStepIdx(i)
        await runStep(i, signal)
      }
      if (!signal.aborted) setStatus('done')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') { setError((err as Error).message); setStatus('error') }
      else setStatus('idle')
    }
  }, [status, runStep])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle'); setOutput('')
  }, [])

  return (
    <Ctx.Provider value={{ status, phase, stepIdx, output, error, countdown, launch, stop }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAutoPilot() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAutoPilot must be inside AutoPilotProvider')
  return ctx
}
