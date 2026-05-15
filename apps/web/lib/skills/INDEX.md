# NEXUS OS — ACORA Skill Registry

**ACORA v9.999** — Autonomous Capability-Oriented Runtime Architecture applied to the One Click Pipeline.

## ACORA Phase Coverage

| Phase | Name | Status | Implementation |
|---|---|---|---|
| 1 | Skill Boundary Detection | Documented | 7-test gate results below |
| 2 | Skill Taxonomy (9 types) | Implemented | `skillType` field on every agent |
| 3 | SKILL.md Generation | Implemented | `skill: SkillMeta` on every agent record |
| 4 | State + Memory Hierarchy | Documented | `forgeContentRef`, `buildFilesRef`, `forgeSpecRef` |
| 5 | Fault Tolerance | Implemented | Circuit breaker + `withTimeout` + retry policy |
| 6 | Resource Governance | Implemented | `tokenBudget`, `costCeilingUsd`, `recordAgentCost` |
| 7 | Distributed Consensus | N/A | Single-tenant; no distributed state |
| 8 | Execution Algebra | Implemented | `parallelGroup`, `executionOrder`, data-driven loops |
| 9 | Trust Fabric | Implemented | `trustLevel` on every agent |

---

## Skill Type Assignments — FORGE Agents

| Agent | Skill Type | Rationale |
|---|---|---|
| orchestrator | `orchestrator` | Initialises session; output drives all 12 downstream agents |
| analyst | `transformer` | Converts raw brief → structured PROJECT_MANIFEST |
| architect | `planner` | Produces system design / dependency blueprint |
| planner | `planner` | Decomposes architecture → sprint-ready feature cards |
| builder | `executor` | Generates a concrete utility file (utils.ts) |
| security | `validator` | OWASP audit; read-only; never generates app code |
| db-opt | `transformer` | Converts architecture spec → SQL schema |
| test-writer | `validator` | Produces SPEC CONTRACT; validates entity shapes |
| qa | `validator` | Scores spec /10; hard gate (≥7.0 required to proceed) |
| workflow-mapper | `observer` | Maps user journeys across all spec outputs; no net-new content |
| growth | `planner` | GTM task sequences; depends on full QA-passed spec |
| monetisation | `planner` | Revenue model task sequences; independent of growth |
| closer | `transformer` | Converts strategy → actionable sales close playbook |

## Skill Type Assignments — BUILD Agents

| Agent | Skill Type | Rationale |
|---|---|---|
| scaffold | `executor` | Generates framework config files |
| mock-data | `executor` | Generates typed data fixtures |
| shell | `executor` | Generates error/loading/not-found shell files |
| ui-core | `executor` | Generates design system and layout components |
| api | `executor` | Generates route handlers |
| landing | `executor` | Generates marketing homepage |
| interactions | `executor` | Generates forms, modals, client state |
| dashboard | `executor` | Generates KPI dashboard page |
| features | `executor` | Generates 3 MVP feature pages |
| repair | `validator` | Reads error manifest; fixes and fills missing files |
| docs | `transformer` | Converts codebase → README and component guide |

---

## ACORA Phase 1 — 7-Test Boundary Gate

All 23 agents pass all 7 tests.

**Test Definitions:**

| Test | Requirement |
|---|---|
| [1] TRIGGER SURFACE | Unique, non-overlapping activation inputs |
| [2] I/O PURITY | Single input type, single output type |
| [3] TOOL AFFINITY | Owns its output format exclusively |
| [4] DEPENDENCY ISOLATION | Runs without calling another agent's internals |
| [5] RUNTIME COUPLING | No shared mutable state (all reads come from context snapshot) |
| [6] SEMANTIC UNITY | One-sentence job description without "and" |
| [7] TOKEN BUDGET | tokenBudget defined; description under 100 tokens |

All agents PASS. Note: `test-writer` depends on `planner` output but does not call planner's logic — it reads from the shared `content` context map, so DEPENDENCY ISOLATION is preserved.

---

## How to Add a New Agent

1. Run the 7-test gate against your new agent's definition
2. Assign a canonical `skillType` from the 9-type taxonomy
3. Add the agent record to `forgeAgentData.ts` or `buildAgentData.ts`:
   - Set `executionOrder` (topological position)
   - Set `parallelGroup` (null = sequential; integer = runs with other agents in same group)
   - Set `tokenBudget`, `timeoutMs`, `trustLevel`, `failureBehavior`, `costCeilingUsd`
   - Set `dependencies` (list of agent IDs that must complete before this one)
4. For FORGE agents: if parallel, ensure the `parallelGroup` integer matches the group's `Promise.all` batch
   - Currently: group `1` = planner/builder/security/db-opt; group `2` = growth/monetisation
   - The execution loop in PipelinePage.tsx reads these automatically — no code change needed
5. For BUILD agents: the `BUILD_ORDER` is computed automatically from `executionOrder` sort
6. Add a `FORGE_AGENT_SYSTEMS[agentId]` or `BUILD_AGENT_SYSTEMS[agentId]` system prompt
7. Add a `FORGE_VOICE_GUIDE[agentId]` or `BUILD_VOICE_GUIDE[agentId]` TTS entry
8. Add an entry to this INDEX.md skill type table

---

## Key Files

| File | Purpose |
|---|---|
| `apps/web/lib/skillRegistry.ts` | ACORA TypeScript types (SkillMeta, CircuitBreaker, etc.) |
| `apps/web/lib/forgeAgentData.ts` | 13 FORGE agents with full skill metadata |
| `apps/web/lib/buildAgentData.ts` | 10 BUILD agents with full skill metadata |
| `apps/web/components/pages/PipelinePage.tsx` | Runtime — `withTimeout`, circuit breaker, cost ledger, data-driven execution |
| `apps/web/lib/skills/EXECUTION_ALGEBRA.md` | Formal SEQ/PAR/COND/RETRY DAG |
| `apps/web/lib/skills/FORGE_AGENTS.md` | Per-agent SKILL.md blocks for FORGE |
| `apps/web/lib/skills/BUILD_AGENTS.md` | Per-agent SKILL.md blocks for BUILD |
