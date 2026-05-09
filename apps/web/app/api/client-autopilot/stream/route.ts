import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { aiStream } from '@/lib/ai'

export const runtime = 'nodejs'
export const maxDuration = 120

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClientBrief {
  clientName:      string
  clientCompany:   string
  clientEmail:     string
  problem:         string
  targetUsers:     string
  coreFeatures:    string
  techStack:       string
  budget:          string
  timeline:        string
  specialReqs:     string
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 'scout',     title: 'Mapping the territory',          icon: '🔍', maxTokens: 700  },
  { id: 'analyst',   title: 'Stress-testing assumptions',     icon: '📊', maxTokens: 600  },
  { id: 'architect', title: 'Designing the system',           icon: '🏗️', maxTokens: 800  },
  { id: 'planner',   title: 'Writing feature specifications', icon: '📋', maxTokens: 1200 },
  { id: 'qa',        title: 'QA & delivery review',           icon: '🔐', maxTokens: 600  },
  { id: 'proposal',  title: 'Generating client proposal',     icon: '📄', maxTokens: 900  },
]

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildContext(b: ClientBrief) {
  return `CLIENT: ${b.clientName} at ${b.clientCompany}
PROBLEM: ${b.problem}
TARGET USERS: ${b.targetUsers}
CORE FEATURES REQUESTED:
${b.coreFeatures}
TECH STACK: ${b.techStack || 'Flexible / recommend best fit'}
BUDGET: ${b.budget}
TIMELINE: ${b.timeline}
SPECIAL REQUIREMENTS: ${b.specialReqs || 'None'}`
}

function scoutPrompt(ctx: string) {
  return {
    system: `You are a senior market analyst. Analyse this client project brief and output a concise market intelligence report. Be specific and direct — no filler. Under 260 words.

Use exactly these section headers:
MARKET LANDSCAPE
(2-3 sentences on the space, who already plays here, and what gap exists)

KEY COMPETITORS
(3-4 named competitors with one differentiator each, as bullet points)

WHAT WE DON'T KNOW YET
(3 critical questions that must be answered before building — as numbered list)

BIGGEST RISK
(One specific, honest sentence on the most likely way this project fails)

RECOMMENDED FIRST STEP
(One concrete action to take in the next 7 days)`,
    user: `Analyse this client project:\n\n${ctx}`,
  }
}

function analystPrompt(ctx: string) {
  return {
    system: `You are a business analyst. Review this project brief and produce a clear risk and confidence assessment. Under 240 words.

Use exactly these section headers:
CONFIDENCE ASSESSMENT
(Rate overall project confidence: HIGH / MEDIUM / LOW with one sentence why)

ASSUMPTIONS WE'RE MAKING
(5 bullet points — each ending with [SOLID] or [AT RISK])

THE SINGLE BIGGEST UNKNOWN
(One paragraph, the thing that could derail this entire project if wrong)

DECISION: GO / PAUSE / STOP
(One word verdict with two sentences of reasoning)`,
    user: `Assess the risk for this project:\n\n${ctx}`,
  }
}

function architectPrompt(ctx: string) {
  return {
    system: `You are a solutions architect. Design a practical, buildable system. Be specific. Under 300 words.

Use exactly these section headers:
RECOMMENDED TECH STACK
(One line: specific technologies for frontend, backend, database, auth, hosting)

HOW IT WORKS
(3-4 sentences explaining the system in plain English — no jargon)

CORE COMPONENTS
(4-5 bullet points — component name: what it does)

DATABASE TABLES
(5-6 tables in format: table_name — key fields, one per line)

CRITICAL API ENDPOINTS
(5-6 endpoints in format: METHOD /path — what it does, one per line)

ESTIMATED BUILD TIME
(Breakdown by phase with weeks, then total)`,
    user: `Design the system for this project:\n\n${ctx}`,
  }
}

function plannerPrompt(ctx: string) {
  return {
    system: `You are a product manager writing feature specifications that a developer can build from directly.

Output 5-6 feature specifications using EXACTLY this format for each (no deviations):

FEATURE: [Feature Name]
PRIORITY: P0 (must-have) or P1 (important)
AS A [type of user], I WANT TO [specific action] SO THAT [clear outcome].
DONE WHEN:
- [specific, testable criterion 1]
- [specific, testable criterion 2]
- [specific, testable criterion 3]
EFFORT: [X days]

After all features, add one line:
TOTAL: [X weeks] to build all features`,
    user: `Write feature specifications for this project:\n\n${ctx}`,
  }
}

function qaPrompt(ctx: string) {
  return {
    system: `You are a delivery director reviewing a project plan before signing off. Be direct and honest. Under 220 words.

Use exactly these section headers:
DELIVERY SCORE
(Write: X/10 — then one sentence explaining the score)

WHAT'S SOLID
(3 bullet points — specific things that are well-defined and ready to build)

WHAT NEEDS CLARITY BEFORE STARTING
(3 bullet points — specific gaps that will cause problems if not resolved)

VERDICT
(Write: APPROVED TO BUILD or NEEDS MORE CLARITY — then two sentences of reasoning)`,
    user: `Review this project for delivery readiness:\n\n${ctx}`,
  }
}

function proposalPrompt(b: ClientBrief, ctx: string) {
  const budgetLine = b.budget ? `Budget agreed: ${b.budget}` : 'Budget: to be confirmed'
  const timelineLine = b.timeline ? `Timeline: ${b.timeline}` : 'Timeline: to be confirmed'
  return {
    system: `You are writing a professional client proposal on behalf of an agency. Confident, warm, specific. No filler. Under 400 words.

Use EXACTLY these section headers (all caps, no ## symbols):

EXECUTIVE SUMMARY
(2 sentences: what the client gets and the primary business outcome)

WHAT WE WILL BUILD
(5-6 bullet points — each a specific, tangible deliverable the client can picture)

HOW WE WORK
(2 sentences on the delivery approach — emphasise speed and quality)

TIMELINE
Phase 1 — Discovery & Design: [X] weeks — [what client sees at end]
Phase 2 — Build & Test: [X] weeks — [what client sees at end]
Phase 3 — Launch & Handover: [X] weeks — [what client sees at end]

INVESTMENT
${budgetLine}
${timelineLine}
Payment terms: 50% to start, 50% on launch
Includes: [3 short bullet points of what's covered]

NEXT STEP
[One clear action sentence — what the client does to kick this off]`,
    user: `Write the proposal for this project:\n\n${ctx}`,
  }
}

// ─── Server-side brief validation ────────────────────────────────────────────

function validateBrief(b: ClientBrief): string | null {
  if (!b.clientName?.trim())    return 'Client name is required.'
  if (!b.clientCompany?.trim()) return 'Client company is required.'

  const problem = b.problem?.trim() ?? ''
  if (problem.length < 60) {
    return `Problem statement is too short (${problem.length} chars). Describe the specific pain — what is slow, broken, or manual? Aim for at least 60 characters.`
  }

  const users = b.targetUsers?.trim() ?? ''
  if (users.length < 20) {
    return `Target users field is too vague (${users.length} chars). Specify who uses this — role, company type, team size.`
  }

  const features = (b.coreFeatures ?? '').split('\n').filter(l => l.trim().length > 10)
  if (features.length < 3) {
    return `Only ${features.length} feature(s) listed. Add at least 3 specific features — each should describe what a user can do, not just a section name.`
  }

  return null
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const brief: ClientBrief = await req.json()

  const validationError = validateBrief(brief)
  if (validationError) {
    return new Response(JSON.stringify({ error: validationError }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const ctx = buildContext(brief)

  const encoder = new TextEncoder()
  const signal  = req.signal

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }

      try {
        const steps: Record<string, string> = {}

        for (const step of STEPS) {
          if (signal.aborted) break
          emit({ type: 'step', id: step.id, title: step.title, icon: step.icon })

          let buf = ''
          const onChunk = (c: string) => {
            buf += c
            emit({ type: 'chunk', id: step.id, content: c })
          }

          let prompts: { system: string; user: string }
          switch (step.id) {
            case 'scout':     prompts = scoutPrompt(ctx);               break
            case 'analyst':   prompts = analystPrompt(ctx);             break
            case 'architect': prompts = architectPrompt(ctx);           break
            case 'planner':   prompts = plannerPrompt(ctx);             break
            case 'qa':        prompts = qaPrompt(ctx);                  break
            case 'proposal':  prompts = proposalPrompt(brief, ctx);     break
            default: continue
          }

          for await (const chunk of aiStream({
            system:    prompts.system,
            messages:  [{ role: 'user', content: prompts.user }],
            maxTokens: step.maxTokens,
          })) {
            if (signal.aborted) break
            onChunk(chunk)
          }
          steps[step.id] = buf
          emit({ type: 'step_done', id: step.id })
        }

        emit({ type: 'done', brief })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          emit({ type: 'error', message: (err as Error).message })
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
