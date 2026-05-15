# FORGE Agent Skills — ACORA Phase 3

One SKILL.md-style block per FORGE agent. All values match `FORGE_AGENTS` in `forgeAgentData.ts`.

---

## orchestrator

```yaml
id: orchestrator
skill_type: orchestrator
execution_mode: sequential
parallel_group: null
execution_order: 1
token_budget: 3000
timeout_ms: 120000
trust_level: privileged
failure_behavior: fallback
cost_ceiling_usd: 0.05
dependencies: []
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** Initialises the FORGE session with mission context, project name, ICP, and vertical classification. Output is used as the ground truth for all 12 downstream agents. Privileged trust because it can set system-level context.

**7-Test Gate:** PASS all 7. Unique trigger (first agent); pure I/O (brief → session context); no shared state writes; one-sentence job: "Establish the project mission and ICP from the client brief."

---

## analyst

```yaml
id: analyst
skill_type: transformer
execution_mode: sequential
parallel_group: null
execution_order: 2
token_budget: 4000
timeout_ms: 150000
trust_level: privileged
failure_behavior: fallback
cost_ceiling_usd: 0.08
dependencies: [orchestrator]
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** Converts the raw brief + orchestrator context into a structured PROJECT_MANIFEST.md covering user personas, market analysis, pain points, and feature list.

---

## architect

```yaml
id: architect
skill_type: planner
execution_mode: sequential
parallel_group: null
execution_order: 3
token_budget: 4000
timeout_ms: 150000
trust_level: privileged
failure_behavior: fallback
cost_ceiling_usd: 0.08
dependencies: [analyst]
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** Produces the system architecture including routes, data models, API contracts, and tech stack decision. Privileged because architect output gates the parallel batch 1 agents.

---

## planner

```yaml
id: planner
skill_type: planner
execution_mode: parallel
parallel_group: 1
execution_order: 4
token_budget: 2500
timeout_ms: 120000
trust_level: trusted
failure_behavior: fallback
cost_ceiling_usd: 0.05
dependencies: [architect]
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** Decomposes the architecture into sprint-ready feature cards with user stories and acceptance criteria. Runs in parallel group 1 alongside builder, security, and db-opt.

---

## builder

```yaml
id: builder
skill_type: executor
execution_mode: parallel
parallel_group: 1
execution_order: 4
token_budget: 1200
timeout_ms: 90000
trust_level: trusted
failure_behavior: fallback
cost_ceiling_usd: 0.03
dependencies: [architect]
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** Generates `src/lib/utils.ts` — shared utilities (cn, formatDate, formatCurrency, generateId). Smallest token budget in FORGE because output scope is tightly bounded.

---

## security

```yaml
id: security
skill_type: validator
execution_mode: parallel
parallel_group: 1
execution_order: 4
token_budget: 2000
timeout_ms: 120000
trust_level: trusted
failure_behavior: degrade
cost_ceiling_usd: 0.04
dependencies: [architect]
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** OWASP audit of the system architecture — identifies threat vectors, injection risks, auth gaps, and GDPR considerations. Validator type: read-only, no output modifies the spec.

**Failure behavior: degrade** — a missing security audit is tolerable for MVP delivery; pipeline continues with an empty security section.

---

## db-opt

```yaml
id: db-opt
skill_type: transformer
execution_mode: parallel
parallel_group: 1
execution_order: 4
token_budget: 3000
timeout_ms: 120000
trust_level: trusted
failure_behavior: degrade
cost_ceiling_usd: 0.05
dependencies: [architect]
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** Transforms the architecture's data model into a production SQL schema with indexes, constraints, and migration files.

---

## test-writer

```yaml
id: test-writer
skill_type: validator
execution_mode: sequential
parallel_group: null
execution_order: 5
token_budget: 3500
timeout_ms: 120000
trust_level: privileged
failure_behavior: abort
cost_ceiling_usd: 0.06
dependencies: [planner]
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** Produces the SPEC CONTRACT — a machine-readable list of entity types, route slugs, and import paths. BUILD agents consume this directly; an absent contract breaks the code generation chain.

**Failure behavior: abort** — a missing SPEC CONTRACT means BUILD agents will generate inconsistent types and the app will not compile.

---

## qa

```yaml
id: qa
skill_type: validator
execution_mode: sequential
parallel_group: null
execution_order: 6
token_budget: 2500
timeout_ms: 150000
trust_level: privileged
failure_behavior: abort
cost_ceiling_usd: 0.05
dependencies: [test-writer]
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** Scores the entire FORGE spec /10. Hard gate: score < 7.0 triggers the coherence repair loop (up to 2 revisions re-running analyst → architect → planner → test-writer → db-opt → qa). Score ≥ 7.0 unlocks the revenue phase. Uses `FORGE_QA_CTX_CAPS` (wider context windows than normal `tokenBudget`) to see the full spec.

**Failure behavior: abort** — a QA agent that cannot score the spec means the BUILD phase has no quality signal.

---

## workflow-mapper

```yaml
id: workflow-mapper
skill_type: observer
execution_mode: sequential
parallel_group: null
execution_order: 7
token_budget: 2000
timeout_ms: 120000
trust_level: trusted
failure_behavior: degrade
cost_ceiling_usd: 0.04
dependencies: [qa]
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** Observer type — reads all upstream outputs and maps end-to-end user journeys, cross-feature dependencies, and edge case inventory. Does not generate new product decisions; synthesises existing ones.

---

## growth

```yaml
id: growth
skill_type: planner
execution_mode: parallel
parallel_group: 2
execution_order: 8
token_budget: 1500
timeout_ms: 120000
trust_level: trusted
failure_behavior: degrade
cost_ceiling_usd: 0.04
dependencies: [workflow-mapper]
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** GTM strategy, acquisition channels, viral loops, and pricing model. Runs in parallel group 2 alongside monetisation — both are independent of each other and only read the QA-passed spec.

---

## monetisation

```yaml
id: monetisation
skill_type: planner
execution_mode: parallel
parallel_group: 2
execution_order: 8
token_budget: 1500
timeout_ms: 120000
trust_level: trusted
failure_behavior: degrade
cost_ceiling_usd: 0.04
dependencies: [workflow-mapper]
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** Revenue model design — upsell triggers, churn prevention mechanics, LTV maximisation, and pricing tier logic.

---

## closer

```yaml
id: closer
skill_type: transformer
execution_mode: sequential
parallel_group: null
execution_order: 9
token_budget: 1800
timeout_ms: 120000
trust_level: trusted
failure_behavior: degrade
cost_ceiling_usd: 0.04
dependencies: [growth, monetisation]
retry_policy:
  max_attempts: 4
  backoff_ms: 4000
```

**Purpose:** Transforms the growth + monetisation strategy into an execution-ready sales close playbook: booking hooks, discovery questions, objection handling, and follow-up sequences. Final FORGE agent; output is delivered to the user as part of the done screen.
