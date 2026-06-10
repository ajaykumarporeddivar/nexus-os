/**
 * forgeChain.ts — Server-side 12-agent FORGE chain.
 *
 * Runs the same agent sequence as PipelinePage.tsx but without UI state, streaming,
 * or browser dependencies. Called by the server-side orchestrator so autonomous
 * pipeline runs (cron, Hermes, daily-niche-generator) produce the same quality
 * output as the interactive browser pipeline.
 *
 * Agent sequence (mirrors PipelinePage runForge()):
 *   Phase A: orchestrator (sequential)
 *   Phase B: analyst     (sequential)
 *   Phase C: architect   (sequential)
 *   Phase D: parallel group 1 — planner · builder · security · db-opt
 *   Phase E: test-writer (sequential)
 *   Phase F: QA gate     (sequential)
 *   Phase G: post-QA repair loop (max 2 iterations if score < 7.0)
 *   Phase H: parallel group 2 — workflow-mapper · growth · monetisation
 *   Phase I: closer      (sequential)
 */

import { aiComplete } from '@/lib/ai'
import {
  FORGE_AGENTS,
  FORGE_AGENT_SYSTEMS,
  FORGE_QA_CTX_CAPS,
  extractQAScore,
  detectVertical,
  VERTICAL_CONTEXTS,
  buildMicroSaasGovernorContext,
} from '@/lib/forgeAgentData'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ForgeChainResult {
  /** Map of agentId → agent output text */
  content:   Record<string, string>
  qaScore:   number | null
  vertical:  string
  /** Serialized spec contract (test-writer output) — used as forgeSpecContract in gates */
  specContract: string
  /** Total AI tokens consumed across all agents */
  totalTokens: number
}

// ─── Token budget caps for context assembly ───────────────────────────────────

const TEST_WRITER_CAPS: Record<string, number> = {
  analyst:   3000,
  architect: 2500,
  planner:   3000,
  'db-opt':  1200,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function prevOutputs(content: Record<string, string>): string {
  return Object.entries(content)
    .map(([k, v]) => {
      const budget = FORGE_AGENTS.find(a => a.id === k)?.skill.tokenBudget ?? 800
      return `[${k}]: ${v.slice(0, budget)}`
    })
    .join('\n\n')
}

function qaOutputs(content: Record<string, string>): string {
  return Object.entries(content)
    .filter(([k]) => k !== 'qa')
    .map(([k, v]) => `[${k}]: ${v.slice(0, FORGE_QA_CTX_CAPS[k] ?? 2000)}`)
    .join('\n\n')
}

function testWriterOutputs(content: Record<string, string>): string {
  return Object.entries(content)
    .filter(([k]) => k in TEST_WRITER_CAPS)
    .map(([k, v]) => `[${k}]: ${v.slice(0, TEST_WRITER_CAPS[k])}`)
    .join('\n\n')
}

function extractCriticalQaGaps(qaReport: string): string {
  const match = qaReport.match(/### Critical Gaps\s*([\s\S]*?)(?=\n### |\s*$)/i)
  return (match?.[1]?.trim() || qaReport.trim()).slice(0, 1200)
}

// ─── Single-agent runner ──────────────────────────────────────────────────────

async function runAgent(
  agentId:  string,
  system:   string,
  userMsg:  string,
  tokens:   { count: number },
): Promise<string> {
  const agentMeta = FORGE_AGENTS.find(a => a.id === agentId)
  const maxTokens = agentMeta?.skill.tokenBudget ?? 2000

  try {
    const result = await aiComplete({
      system,
      messages:  [{ role: 'user', content: userMsg }],
      maxTokens,
    })
    tokens.count += result.tokens ?? 0
    return result.text
  } catch (err) {
    console.error(`[forgeChain] Agent ${agentId} failed:`, err)
    // Return a minimal fallback — failureBehavior 'abort' agents will cause the chain to fail upstream
    const failBehavior = agentMeta?.skill.failureBehavior ?? 'fallback'
    if (failBehavior === 'abort') throw err
    return `[${agentId.toUpperCase()} DEGRADED — provider error: ${err instanceof Error ? err.message : String(err)}]`
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runForgeChain(
  task:          string,
  projectName:   string,
  verticalHint?: string,
): Promise<ForgeChainResult> {
  const content: Record<string, string> = {}
  const tokens = { count: 0 }

  // Detect vertical from brief or use hint
  let vertical = (verticalHint as ReturnType<typeof detectVertical>) ?? detectVertical(task)
  let verticalContext = VERTICAL_CONTEXTS[vertical] ?? ''

  const microSaasGovernorContext = buildMicroSaasGovernorContext('MVP')
  const briefCtx = `${task}\n\n${microSaasGovernorContext}\n\n${verticalContext}`

  console.log(`[forgeChain] START projectName=${projectName} vertical=${vertical}`)

  // ── Phase A: orchestrator ──────────────────────────────────────────────────
  content['orchestrator'] = await runAgent(
    'orchestrator',
    FORGE_AGENT_SYSTEMS['orchestrator'] ?? 'You are the NEXUS ORCHESTRATOR.',
    `Mission: ${task}\nClient: ${projectName}\n\n${microSaasGovernorContext}\n\n${verticalContext}`,
    tokens,
  )
  console.log(`[forgeChain] orchestrator done (${tokens.count} tokens)`)

  // Reconcile vertical declared by orchestrator
  {
    const vertMatch = content['orchestrator'].match(/\*\*Vertical:\*\*\s*([a-z]+)/i)
    const validVerticals = ['saas', 'marketplace', 'dashboard', 'social', 'mobile', 'ecommerce']
    const declared = vertMatch?.[1]?.toLowerCase()
    if (declared && validVerticals.includes(declared)) {
      vertical = declared as ReturnType<typeof detectVertical>
      verticalContext = VERTICAL_CONTEXTS[vertical] ?? verticalContext
    }
  }

  // ── Phase B: analyst ───────────────────────────────────────────────────────
  content['analyst'] = await runAgent(
    'analyst',
    `${FORGE_AGENT_SYSTEMS['analyst'] ?? 'You are the NEXUS ANALYST.'}\n\n${verticalContext}`,
    `${briefCtx}\n\nPrevious outputs:\n${prevOutputs(content)}`,
    tokens,
  )
  console.log(`[forgeChain] analyst done (${tokens.count} tokens)`)

  // ── Phase C: architect ─────────────────────────────────────────────────────
  content['architect'] = await runAgent(
    'architect',
    FORGE_AGENT_SYSTEMS['architect'] ?? 'You are the NEXUS ARCHITECT.',
    `${briefCtx}\n\nPrevious outputs:\n${prevOutputs(content)}`,
    tokens,
  )
  console.log(`[forgeChain] architect done (${tokens.count} tokens)`)

  // ── Phase D: parallel group 1 (planner · builder · security · db-opt) ─────
  const group1Ids = FORGE_AGENTS
    .filter(a => a.skill.parallelGroup === 1)
    .sort((a, b) => a.skill.executionOrder - b.skill.executionOrder)
    .map(a => a.id)

  const batch1Ctx = `${briefCtx}\n\nPrevious outputs:\n${prevOutputs(content)}`
  const group1Results = await Promise.all(
    group1Ids.map(id =>
      runAgent(
        id,
        FORGE_AGENT_SYSTEMS[id] ?? `You are the NEXUS ${id.toUpperCase()} agent.`,
        batch1Ctx,
        tokens,
      ).then(text => ({ id, text }))
    )
  )
  for (const { id, text } of group1Results) content[id] = text
  console.log(`[forgeChain] parallel group 1 done: ${group1Ids.join(', ')} (${tokens.count} tokens)`)

  // ── Phase E: test-writer ───────────────────────────────────────────────────
  content['test-writer'] = await runAgent(
    'test-writer',
    FORGE_AGENT_SYSTEMS['test-writer'] ?? 'You are the NEXUS SPEC VALIDATOR. Build the SPEC CONTRACT.',
    `${briefCtx}\n\nKey agent outputs:\n${testWriterOutputs(content)}`,
    tokens,
  )
  console.log(`[forgeChain] test-writer done (${tokens.count} tokens)`)

  // ── Phase F: QA gate ───────────────────────────────────────────────────────
  content['qa'] = await runAgent(
    'qa',
    FORGE_AGENT_SYSTEMS['qa'] ?? 'You are the NEXUS QA GATE.',
    `${briefCtx}\n\nAll agent outputs:\n${qaOutputs(content)}`,
    tokens,
  )
  let qaScore = extractQAScore(content['qa'] ?? '')
  console.log(`[forgeChain] QA gate done score=${qaScore} (${tokens.count} tokens)`)

  // ── Phase G: coherence repair loop (max 2 iterations if QA < 7.0) ─────────
  for (let rev = 0; rev < 2 && (qaScore === null || qaScore < 7.0); rev++) {
    console.log(`[forgeChain] QA score ${qaScore} < 7.0 — coherence repair #${rev + 1}`)
    const gapSection = extractCriticalQaGaps(content['qa'] ?? '')
    const repairHeader = `REVISION #${rev + 1}. QA gate found these BUILD-critical gaps:\n${gapSection}\n\nOriginal brief: ${task}\n\nPreserve valid facts, close every listed gap, and keep slugs, entities, routes, and import paths internally consistent.`

    content['analyst'] = await runAgent(
      'analyst',
      `${FORGE_AGENT_SYSTEMS['analyst'] ?? ''}\n\n${verticalContext}\n\nThis is a REVISION. Repair the PROJECT_MANIFEST without inventing unsupported facts.`,
      repairHeader,
      tokens,
    )
    content['architect'] = await runAgent(
      'architect',
      `${FORGE_AGENT_SYSTEMS['architect'] ?? ''}\n\nThis is a REVISION. Reconcile architecture with the repaired PROJECT_MANIFEST and the QA gap list.`,
      `${briefCtx}\n\nQA gaps:\n${gapSection}\n\nRepaired upstream outputs:\n${prevOutputs(content)}`,
      tokens,
    )
    content['planner'] = await runAgent(
      'planner',
      `${FORGE_AGENT_SYSTEMS['planner'] ?? ''}\n\nThis is a REVISION. Rebuild feature cards from the repaired manifest and architecture.`,
      `${briefCtx}\n\nQA gaps:\n${gapSection}\n\nRepaired upstream outputs:\n${prevOutputs(content)}`,
      tokens,
    )
    content['db-opt'] = await runAgent(
      'db-opt',
      `${FORGE_AGENT_SYSTEMS['db-opt'] ?? ''}\n\nThis is a REVISION. Reconcile the schema with the repaired manifest.`,
      `${briefCtx}\n\nQA gaps:\n${gapSection}\n\nRepaired upstream outputs:\n${prevOutputs(content)}`,
      tokens,
    )
    content['test-writer'] = await runAgent(
      'test-writer',
      `${FORGE_AGENT_SYSTEMS['test-writer'] ?? ''}\n\nThis is a REVISION. Rebuild the SPEC CONTRACT from the repaired outputs.`,
      `${briefCtx}\n\nQA gaps:\n${gapSection}\n\nKey repaired outputs:\n${testWriterOutputs(content)}`,
      tokens,
    )
    content['qa'] = await runAgent(
      'qa',
      FORGE_AGENT_SYSTEMS['qa'] ?? 'You are the NEXUS QA GATE.',
      `${briefCtx}\n\nAll agent outputs:\n${qaOutputs(content)}`,
      tokens,
    )
    qaScore = extractQAScore(content['qa'] ?? '')
    console.log(`[forgeChain] coherence repair #${rev + 1} QA score=${qaScore} (${tokens.count} tokens)`)
  }

  // ── Phase H: parallel group 2 (workflow-mapper · growth · monetisation) ───
  const group2Ids = FORGE_AGENTS
    .filter(a => a.skill.parallelGroup === 2)
    .sort((a, b) => a.skill.executionOrder - b.skill.executionOrder)
    .map(a => a.id)

  const batch2Ctx = `${briefCtx}\n\nPrevious outputs:\n${prevOutputs(content)}`
  const group2Results = await Promise.all(
    group2Ids.map(id =>
      runAgent(
        id,
        FORGE_AGENT_SYSTEMS[id] ?? `You are the NEXUS ${id.toUpperCase()} agent.`,
        batch2Ctx,
        tokens,
      ).then(text => ({ id, text }))
    )
  )
  for (const { id, text } of group2Results) content[id] = text
  console.log(`[forgeChain] parallel group 2 done: ${group2Ids.join(', ')} (${tokens.count} tokens)`)

  // ── Phase I: closer ────────────────────────────────────────────────────────
  content['closer'] = await runAgent(
    'closer',
    FORGE_AGENT_SYSTEMS['closer'] ?? 'You are the NEXUS SALES CLOSER.',
    `${briefCtx}\n\nPrevious outputs:\n${prevOutputs(content)}`,
    tokens,
  )
  console.log(`[forgeChain] closer done total=${tokens.count} tokens qaScore=${qaScore}`)

  return {
    content,
    qaScore,
    vertical,
    specContract: content['test-writer'] ?? '',
    totalTokens:  tokens.count,
  }
}
