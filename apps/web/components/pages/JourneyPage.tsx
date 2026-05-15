'use client'

import { useState } from 'react'
import { useWorkspace } from '@/lib/workspaceContext'
import { useAutoPilot } from '@/lib/autoPilotContext'
import type { PageId } from '@/components/Nav'

// ─── Demo client persona ───────────────────────────────────────────────────
const DEMO_CLIENT = {
  name:        'Maya Patel',
  role:        'Freelance UX Designer, 6 years exp.',
  avatar:      'MP',
  problem:     'Spends 4–6 hours per new client just on onboarding, scoping, and proposals — before any design work begins.',
  goal:        'Automate 80% of client onboarding in under 30 minutes.',
  building:    'A SaaS tool that lets freelance designers onboard clients, auto-generate project scopes, and produce branded proposals — all from a short intake form.',
  users:       'Freelance UX/UI designers with 3–15 active clients who lose revenue to admin overhead.',
  stack:       'Next.js, Supabase, Stripe, React PDF. MVP in 6 weeks.',
  challenge:   'No clear competitor charges under $49/mo. Most tools are bloated agency products. Opportunity to own the solo-designer niche.',
}

const WORKSPACE_CONTEXT = `What we are building: A SaaS client onboarding + proposal automation tool for freelance UX/UI designers.

Target users: Solo freelance designers with 3–15 active clients who spend 4–6 hrs per client on admin.

Problem we solve: Onboarding, scoping, and proposal generation takes too long and is not productised.

Goal: Automate 80% of client onboarding in under 30 minutes with a branded, sharable output.

Tech stack: Next.js 14, Supabase (auth + DB), Stripe (billing), React-PDF (proposals), Vercel (deploy).

Revenue model: $29/mo solo, $79/mo team. Target: 100 paying users in 90 days.

Key constraints: MVP in 6 weeks. Solo founder. Must be self-serve — no sales calls.`

// ─── Journey stages ────────────────────────────────────────────────────────
interface Stage {
  step:        number
  feature:     string
  page:        PageId
  icon:        string
  title:       string
  whatItDoes:  string
  howMayaUses: string
  action:      string
  prefill?:    { key: string; value: string }
}

const STAGES: Stage[] = [
  {
    step:        1,
    feature:     'Workspaces',
    page:        'workspaces',
    icon:        '📁',
    title:       'Set up Maya\'s project folder',
    whatItDoes:  'Workspaces are folders that hold everything for one client or project. Every AI tool in NEXUS OS reads the active workspace context — so Maya never has to re-explain her project.',
    howMayaUses: 'Maya creates a "Client Onboarding SaaS" workspace, fills in 4 lines of project context (what she\'s building, who uses it, her stack, her goal). From this point, every FORGE build and every Reasoning Engine session automatically knows her project.',
    action:      'Create Maya\'s workspace →',
  },
  {
    step:        2,
    feature:     'Reasoning Engine',
    page:        'reasoning',
    icon:        '🔬',
    title:       'Validate the idea before writing a line of code',
    whatItDoes:  '11 adversarial AI lenses that stress-test an idea from every angle: market mapping (SCOUT), factual analysis (ANALYST), adversarial attack (CRITIC), reality check (OBSERVER-X), final synthesis (SYNTHESIS).',
    howMayaUses: 'Maya runs SCOUT on her idea to map the competitive landscape. Then ANALYST to identify the 3 strongest claims. Then CRITIC to find what could kill the idea. VALIDATOR checks if the CRITIC was right. After 30 minutes of lens chaining, she has a calibrated go/no-go decision — not gut feel.',
    action:      'Run SCOUT on Maya\'s idea →',
    prefill:     { key: 'reasoning-problem', value: 'Should I build a client onboarding + proposal automation SaaS for freelance UX designers? The market has generic tools but nothing priced and designed specifically for solo designers. My target: $29/mo, 100 users in 90 days, self-serve only.' },
  },
  {
    step:        3,
    feature:     'Trending',
    page:        'trending',
    icon:        '📈',
    title:       'Find what\'s viral in Maya\'s space right now',
    whatItDoes:  'Every 5 hours NEXUS OS pulls the top viral stories from Hacker News, curates them with Claude for freelancer/solopreneur relevance, and categorises them as tools, trends, opportunities, or articles.',
    howMayaUses: 'Maya checks Trending before finalising her feature list. She spots a viral post about "proposal fatigue" with 800 HN points — confirms she\'s solving a real, felt pain. She also finds a new AI PDF generation library that cuts her dev time by 2 weeks.',
    action:      'See what\'s trending →',
  },
  {
    step:        4,
    feature:     'Prompt Vault',
    page:        'vault',
    icon:        '🗄️',
    title:       'Customise battle-tested AI prompts for her product',
    whatItDoes:  'The Vault holds 8 pre-built expert prompts (SaaS architecture, API design, security audit, client brief extraction, etc.). Each has a quality score, gap analysis, and multiple tested variants. Maya can launch any vault prompt directly into FORGE.',
    howMayaUses: 'Maya opens the "SaaS Architecture" vault item, reads the scoring breakdown (instruction clarity, schema completeness, security posture). She customises the prompt variant for a solo-founder minimal stack, saves it as version 2 for her workspace, then launches it straight into FORGE.',
    action:      'Browse the Prompt Vault →',
  },
  {
    step:        5,
    feature:     'FORGE Engine',
    page:        'forge',
    icon:        '⚙️',
    title:       'Build the full product spec in one run',
    whatItDoes:  '9 AI agents run in sequence: ORCHESTRATOR sets context → ANALYST decomposes features → ARCHITECT designs the system → PLANNER writes feature cards → TEST WRITER generates tests → BUILDER produces code scaffolding → SECURITY audits it → DB OPTIMIZER writes the schema → QA GATE scores the entire deliverable.',
    howMayaUses: 'Maya pastes her brief. the 23-agent pipeline runs FORGE plus BUILD and produces: a PROJECT_MANIFEST, full system architecture, 20+ feature cards with acceptance criteria, TDD test specs, TypeScript scaffolding, a security report, a DB migration, and a QA score. What would take her 3 days takes 4–15 minutes.',
    action:      'Launch FORGE for Maya →',
    prefill:     { key: 'forge-input', value: 'Build a SaaS client onboarding and proposal automation tool for freelance UX designers.\n\nCore features:\n1. Client intake form (embed on designer\'s site)\n2. Auto-generate project scope document from intake answers\n3. Branded PDF proposal with e-signature\n4. Client portal (view proposal, sign, pay deposit)\n5. Designer dashboard (pipeline, status, revenue)\n6. Stripe payment integration (deposit + milestones)\n7. Email notifications (client + designer)\n8. Template library (scope + proposal templates)\n\nTech: Next.js 14, Supabase, Stripe, React-PDF, Resend, Vercel\nTarget: MVP in 6 weeks, solo founder, self-serve SaaS at $29/mo' },
  },
  {
    step:        6,
    feature:     'Live Runtime',
    page:        'runtime',
    icon:        '▶',
    title:       'Test reasoning chains with a real conversation',
    whatItDoes:  'A live Claude session where Maya can test her product\'s AI logic end-to-end — as if she were a user of her own app. Outputs can be pushed directly into FORGE for a second build pass.',
    howMayaUses: 'Maya simulates the client intake conversation: "I need a website redesign for my bakery, budget $3,000, 4-week timeline." She watches the AI extract scope, identify gaps, generate questions, and draft a proposal outline — exactly what her product will do. She copies the refined output into FORGE for the QA revision pass.',
    action:      'Open Live Runtime →',
    prefill:     { key: 'runtime-message', value: 'You are a client onboarding assistant for a freelance UX designer. A new client has filled in your intake form with this information:\n\nProject: Website redesign for a bakery\nBudget: $3,000\nTimeline: 4 weeks\nGoal: Modern, mobile-first site with online ordering\n\nGenerate: (1) a project scope document, (2) 5 clarifying questions you still need answered, (3) a one-paragraph proposal opening.' },
  },
  {
    step:        7,
    feature:     'Agent Editor',
    page:        'agent-editor',
    icon:        '✏️',
    title:       'Tune the AI agents to Maya\'s voice and standards',
    whatItDoes:  'Each of the 9 FORGE agents has a prompt that can be versioned, scored, and activated. The learning agent runs nightly to promote the highest-scoring prompt version automatically.',
    howMayaUses: 'Maya edits the ARCHITECT agent prompt to always output architecture diagrams in Mermaid format (her team\'s standard). She saves it as a new version. After 3 FORGE runs, the learning agent automatically promotes it because it scores 0.4 points higher than the default.',
    action:      'Open Agent Editor →',
  },
  {
    step:        8,
    feature:     'Dashboard',
    page:        'dashboard',
    icon:        '📊',
    title:       'See the full picture of everything built',
    whatItDoes:  'Aggregates all FORGE builds, token usage, QA scores, agent performance, and learning cycle results in one view. Shows which agents are improving and which need tuning.',
    howMayaUses: 'After her first week, Maya opens the Dashboard and sees: 4 FORGE runs, 47,000 tokens used, average QA score 7.8/10. The learning widget shows the ARCHITECT agent improved from 7.1 → 7.9 across runs. She can see exactly where AI time is going.',
    action:      'Open Dashboard →',
  },
  {
    step:        9,
    feature:     'Audit Log',
    page:        'audit',
    icon:        '📋',
    title:       'Full history of every AI action taken',
    whatItDoes:  'Every FORGE run, vault save, agent prompt change, payment, and API call is logged with timestamp, session, and metadata. Full transparency — nothing is a black box.',
    howMayaUses: 'Maya\'s co-founder wants to know what happened last Tuesday. Audit Log shows: FORGE run at 14:32 (8 min, 12k tokens, QA 8.1/10), vault save at 15:10, agent prompt update at 16:45. Every decision is traceable.',
    action:      'Open Audit Log →',
  },
  {
    step:        10,
    feature:     'Export & Deploy',
    page:        'deploy',
    icon:        '🚀',
    title:       'Ship the generated app — from ZIP to live URL',
    whatItDoes:  'Turns your FORGE-generated files into a deployed, running application. Step-by-step: extract the ZIP, run the database migration, install dependencies, set env variables, push to Vercel. One deploy command. Live in under 10 minutes.',
    howMayaUses: 'Maya unzips the FORGE package. She runs the SQL migration on her Supabase database. She opens src/index.ts in VS Code and confirms the scaffold matches the architecture spec. She pushes to GitHub, connects Vercel, and her client\'s onboarding app is live. The entire handoff from spec to URL took one afternoon.',
    action:      'Open Export & Deploy →',
  },
]

// ─── Component ─────────────────────────────────────────────────────────────
export default function JourneyPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { createWorkspace, setActive, workspaces } = useWorkspace()
  const { launch, stop, status: pilotStatus } = useAutoPilot()
  const [demoCreated, setDemoCreated]  = useState(false)
  const [creating, setCreating]        = useState(false)
  const [activeStep, setActiveStep]    = useState<number | null>(null)

  const launchDemo = async () => {
    setCreating(true)
    try {
      // Check if demo workspace already exists
      const existing = workspaces.find(w => w.name === 'Maya — Client Onboarding SaaS')
      if (existing) {
        setActive(existing)
        setDemoCreated(true)
        return
      }
      const w = await createWorkspace({
        name:        'Maya — Client Onboarding SaaS',
        type:        'client',
        emoji:       '🎨',
        color:       'violet',
        description: 'Freelance UX designer building proposal + onboarding automation SaaS',
        context:     WORKSPACE_CONTEXT,
      })
      setActive(w)
      setDemoCreated(true)
    } catch (e) {
      console.error(e)
    } finally {
      setCreating(false)
    }
  }

  const handleLaunch = (stage: Stage) => {
    // Store prefill data for the target page to read
    if (stage.prefill) {
      sessionStorage.setItem(`nexus-prefill-${stage.prefill.key}`, stage.prefill.value)
    }
    onNavigate(stage.page)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">

      {/* Header */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <p className="sec-label mb-2">End-to-End Journey</p>
          <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--ff-d)' }}>
            How NEXUS OS works — with a real client
          </h2>
          <p className="text-sm text-ink3 max-w-2xl">
            Follow Maya, a freelance UX designer, through every feature of NEXUS OS. Each step is real — you can launch it live with one click.
          </p>
        </div>

        {/* Autonomous run button */}
        <div className="flex flex-col items-end gap-2">
          {pilotStatus === 'running' ? (
            <button
              onClick={stop}
              className="btn btn-ghost text-sm border border-red-400/40 text-red-400 hover:bg-red-400/10 px-6 py-3 rounded-xl"
            >
              ■ Stop AutoPilot
            </button>
          ) : (
            <button
              onClick={launch}
              disabled={false}
              className="px-6 py-3 rounded-xl text-sm font-bold text-paper bg-acid hover:bg-acid/90 transition-colors shadow-lg shadow-acid/20 disabled:opacity-50"
            >
              ▶ Run Full Autonomous Demo
            </button>
          )}
          <p className="text-[10px] text-ink3 text-right max-w-[200px]">
            Llama 3.3 70B · 10 steps · auto-navigates all features · ~8 min
          </p>
        </div>
      </div>

      {/* Client persona card */}
      <div className="card border-violet-500/30 bg-violet-500/5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-lg flex-shrink-0">
            {DEMO_CLIENT.avatar}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <h3 className="font-bold text-base">{DEMO_CLIENT.name}</h3>
              <span className="chip violet text-[10px]">Demo client</span>
            </div>
            <p className="text-xs text-ink3">{DEMO_CLIENT.role}</p>
          </div>
          <div className="flex-shrink-0">
            {demoCreated ? (
              <span className="chip acid text-xs">✓ Workspace active</span>
            ) : (
              <button
                onClick={launchDemo}
                disabled={creating}
                className="btn btn-primary text-xs disabled:opacity-50"
              >
                {creating ? 'Creating…' : '🚀 Set up Maya\'s workspace'}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-paper/60 rounded-lg p-3">
            <p className="sec-label mb-1">The problem</p>
            <p className="text-ink3">{DEMO_CLIENT.problem}</p>
          </div>
          <div className="bg-paper/60 rounded-lg p-3">
            <p className="sec-label mb-1">What she&apos;s building</p>
            <p className="text-ink3">{DEMO_CLIENT.building}</p>
          </div>
          <div className="bg-paper/60 rounded-lg p-3">
            <p className="sec-label mb-1">Success metric</p>
            <p className="text-ink3">{DEMO_CLIENT.goal}</p>
          </div>
        </div>

        {demoCreated && (
          <div className="flex items-center gap-2 text-xs text-acid border-t border-violet-500/20 pt-3">
            <span>🎨</span>
            <span className="font-medium">Maya&apos;s workspace is active.</span>
            <span className="text-ink3">All AI tools below now know her project context automatically.</span>
          </div>
        )}
      </div>

      {/* Journey steps */}
      <div className="space-y-4">
        <h3 className="font-bold text-lg" style={{ fontFamily: 'var(--ff-d)' }}>The 10-step journey</h3>

        {STAGES.map((stage, idx) => (
          <div
            key={stage.step}
            className={`card cursor-pointer transition-all ${activeStep === idx ? 'border-l-4 border-l-acid border-acid/30' : 'hover:border-border2'}`}
            onClick={() => setActiveStep(activeStep === idx ? null : idx)}
          >
            {/* Collapsed header */}
            <div className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold font-mono flex-shrink-0 ${activeStep === idx ? 'border-acid bg-acid/10 text-acid' : 'bg-paper2 border-border text-ink3'}`}>
                {stage.step}
              </div>
              <div className="text-xl flex-shrink-0">{stage.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{stage.title}</span>
                  <span className="chip text-[10px] font-mono border border-border">{stage.feature}</span>
                </div>
                {activeStep !== idx && (
                  <p className="text-xs text-ink3 truncate mt-0.5">{stage.whatItDoes}</p>
                )}
              </div>
              <span className="text-ink3 text-xs flex-shrink-0 font-mono">{activeStep === idx ? '[−]' : '[+]'}</span>
            </div>

            {/* Expanded detail */}
            {activeStep === idx && (
              <div className="mt-4 space-y-4 border-t border-border pt-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <p className="sec-label mb-1">What this feature does</p>
                    <p className="text-sm text-ink3 leading-relaxed">{stage.whatItDoes}</p>
                  </div>
                  <div className="bg-paper2 border border-border2 rounded-lg p-3">
                    <p className="sec-label mb-1">[ Maya ] How she uses it</p>
                    <p className="text-sm text-ink3 leading-relaxed">{stage.howMayaUses}</p>
                  </div>
                </div>

                {stage.prefill && (
                  <div>
                    <p className="sec-label mb-1">Pre-filled input for this demo</p>
                    <pre className="prompt-block text-[10px] leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {stage.prefill.value}
                    </pre>
                  </div>
                )}

                <button
                  onClick={e => { e.stopPropagation(); handleLaunch(stage) }}
                  className="btn btn-primary text-xs"
                >
                  {stage.action}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* What clients get out */}
      <div className="card bg-acid/3 border-acid/20 space-y-4">
        <h3 className="font-bold" style={{ fontFamily: 'var(--ff-d)' }}>What Maya walks away with</h3>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          {[
            ['Go/no-go decision', 'Validated by 5 adversarial lenses — not gut feel'],
            ['Full product spec', 'Architecture, feature cards, DB schema, security report'],
            ['Working code scaffold', 'TypeScript, ready to drop into a real repo'],
            ['TDD test suite', 'Every feature has acceptance criteria and test specs'],
            ['Market intel', 'Real trending data on tools and opportunities in her space'],
            ['Reusable prompt library', 'Saved, scored, versioned AI prompts for her exact domain'],
            ['Full audit trail', 'Every AI decision logged — nothing is a black box'],
            ['QA score', 'Cross-model quality gate — knows exactly how production-ready the output is'],
            ['Live deployed URL', 'FORGE output → database migration → Vercel deploy. Client-ready app in one afternoon'],
          ].map(([title, desc]) => (
            <div key={title} className="flex gap-2">
              <span className="font-bold text-xs mt-0.5 font-mono">[✓]</span>
              <div>
                <span className="font-medium text-xs">{title}: </span>
                <span className="text-xs text-ink3">{desc}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink3 border-t border-border pt-3">
          Time: ~45 minutes idea to spec + ~1 afternoon spec to deployed URL. A freelance developer or product person would spend 2–3 weeks reaching the same output manually.
        </p>
      </div>

    </div>
  )
}
