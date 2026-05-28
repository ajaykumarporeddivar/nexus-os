export interface ReasoningPipelinePassportInput {
  problem: string
  reasoningContext?: string
  latestOutput?: string
  workspaceName?: string
}

export interface ReasoningPipelinePassport {
  brief: string
  clientName: string
}

function clean(value: string | undefined, fallback: string): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function shortSentence(value: string, fallback: string, max = 180): string {
  const text = clean(value, fallback)
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text
  return first.length > max ? `${first.slice(0, max).trim()}...` : first
}

function titleFromProblem(problem: string): string {
  const compact = clean(problem, 'Reasoning Validated Micro-SaaS')
    .replace(/^build\s+(a\s+)?(micro-)?saas\s+(product|app)?[:\-\s]*/i, '')
    .replace(/^should\s+i\s+build\s+/i, '')
    .replace(/\b(for|to help|that helps)\b[\s\S]*$/i, '')
    .trim()

  const words = compact.split(/\s+/).filter(Boolean).slice(0, 5)
  const title = words.join(' ').replace(/[^a-z0-9 &-]/gi, '').trim()
  if (!title) return 'Reasoning Validated Micro-SaaS'
  return title.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

function inferTarget(problem: string, workspaceName?: string): string {
  const text = clean(problem, '')
  const forMatch = text.match(/\bfor\s+([^.\n,;:]{6,90})/i)
  if (forMatch?.[1]) return clean(forMatch[1], '')
  return clean(workspaceName, 'A clearly defined B2B operator segment with urgent recurring workflow pain')
}

function contextBullets(context: string): string[] {
  const lines = context
    .split(/\n+/)
    .map(line => line.replace(/^[-*#\d.\s]+/, '').trim())
    .filter(line => line.length > 30)
  return lines.slice(0, 5).map(line => line.length > 220 ? `${line.slice(0, 220).trim()}...` : line)
}

export function buildReasoningPipelinePassport(input: ReasoningPipelinePassportInput): ReasoningPipelinePassport {
  const problem = clean(input.problem, 'Build a focused micro-SaaS application from the validated reasoning context.')
  const reasoning = clean(`${input.reasoningContext ?? ''}\n\n${input.latestOutput ?? ''}`, problem)
  const title = titleFromProblem(problem)
  const target = inferTarget(problem, input.workspaceName)
  const evidence = contextBullets(reasoning)
  const coreProblem = shortSentence(problem, `${target} need a faster, clearer way to complete a recurring high-value workflow.`)

  const brief = `Build a micro-SaaS product: ${title}

PROBLEM TO SOLVE
${coreProblem}

TARGET MARKET
${target}

NICHE / CATEGORY
Reasoning-validated workflow automation for a narrow paid buyer segment

REVENUE MODEL
$29/mo per user for self-serve teams, with an upgrade CTA for advanced automation and workspace features

WHY IT IS TRENDING NOW
Teams are under pressure to prove outcomes faster, reduce manual coordination, and turn scattered work into decision-ready outputs without hiring more operations headcount.

REASONING PASSPORT
- Source: NEXUS Reasoning Engine adversarial lens chain
- Signal requirement: preserve only workflows with clear buyer pain, repeat frequency, and measurable output value
- Buyer value test: the first screen must show the work queue, the risk/priority signal, and the finished exportable output
- Scope guard: reject broad platforms, empty dashboards, generic demo copy, and pages that do not move the buyer through the core workflow
${evidence.length ? evidence.map(item => `- Evidence: ${item}`).join('\n') : '- Evidence: No extra lens evidence was captured; treat the original problem statement as the controlling source of truth.'}

MVP SCOPE STRATEGY
Build a production-grade MVP that solves exactly the 3 most urgent operational pain points first. Do not attempt a bloated all-feature platform in the first generated application.

TOP 3 PAIN POINTS TO BUILD NOW
1. ${target} need a structured intake workflow that turns messy inputs into clean, actionable records.
2. ${target} need one operating dashboard to prioritize the highest-value work, see status, and decide the next action.
3. ${target} need an exportable, buyer-ready output that proves value without manual reporting, spreadsheet cleanup, or copy-paste assembly.

MVP WORKFLOWS TO IMPLEMENT
- Intake / input workflow: capture the core user input, validate required fields, normalize records, and expose the resulting queue.
- Operating dashboard: show priorities, status, metrics, owner/action fields, filters, and stateful next-step controls.
- Output / export workflow: generate a useful handoff, report, proof pack, or action plan the buyer can use immediately.

DEFERRED ROADMAP / SELLING POINTS
Highlight these as locked expansion features, not half-built pages:
1. AI-assisted intake parsing from notes, screenshots, links, or uploaded artifacts
2. Automated narrative summaries and recommendations
3. White-label exports, PDF packs, and client-ready delivery
4. Team roles, approvals, and permissions
5. Real database persistence and workspace accounts
6. Billing, entitlement checks, and upgrade flows
7. Advanced analytics, benchmarks, and trend reports
8. Integrations with the buyer workflow stack

POST-PAYMENT ONE-CLICK EXPANSION
Include an upgrade CTA such as "Unlock full roadmap". After payment, one button click should be presented as the mechanism that delivers the deferred roadmap features for ${target}. Do not integrate a real payment SDK in this generated MVP; represent it as a credible locked roadmap and upgrade flow.

PRODUCTION QUALITY BAR
- The generated app must be interactive, not static: forms, filters, stateful dashboard actions, modals, and CSV/export behavior.
- Use realistic local TypeScript data with at least 10 records per main entity.
- Avoid placeholder copy, demo-only language, TODOs, lorem ipsum, generic screenshots, and empty dashboard panels.
- Build for a paid buyer evaluating whether this can become their operational workflow today.
- Every primary page must answer: what changed, what needs action, what is at risk, and what can be exported now.`

  return {
    brief,
    clientName: input.workspaceName ? `${input.workspaceName} Pipeline Passport` : `${title} Pipeline Passport`,
  }
}
