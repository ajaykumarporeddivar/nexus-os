# BUILD Agent Skills — ACORA Phase 3

One SKILL.md-style block per BUILD agent. All values match `BUILD_AGENTS` in `buildAgentData.ts`.  
All BUILD agents run sequentially (1500ms gap between each) — no parallel groups.

---

## scaffold

```yaml
id: scaffold
skill_type: executor
execution_mode: sequential
parallel_group: null
execution_order: 1
token_budget: 1500
timeout_ms: 90000
trust_level: trusted
failure_behavior: abort
cost_ceiling_usd: 0.04
dependencies: []
retry_policy:
  max_attempts: 3
  backoff_ms: 4000
```

**Purpose:** Generates the framework config files: `package.json`, `next.config.js`, `tailwind.config.js`, `tsconfig.json`, `postcss.config.js`. First agent; no dependencies. Failure aborts the BUILD phase because all other agents import from these files.

---

## mock-data

```yaml
id: mock-data
skill_type: executor
execution_mode: sequential
parallel_group: null
execution_order: 2
token_budget: 2000
timeout_ms: 90000
trust_level: trusted
failure_behavior: fallback
cost_ceiling_usd: 0.04
dependencies: [scaffold]
retry_policy:
  max_attempts: 3
  backoff_ms: 4000
```

**Purpose:** Generates `src/lib/types.ts` and `src/lib/data.ts` — all TypeScript interfaces and 20+ realistic mock records. All other BUILD agents consume these types.

---

## shell

```yaml
id: shell
skill_type: executor
execution_mode: sequential
parallel_group: null
execution_order: 3
token_budget: 800
timeout_ms: 60000
trust_level: trusted
failure_behavior: degrade
cost_ceiling_usd: 0.02
dependencies: [scaffold]
retry_policy:
  max_attempts: 3
  backoff_ms: 4000
```

**Purpose:** Generates framework shell files: `error.tsx`, `not-found.tsx`, `loading.tsx`. Smallest token budget in BUILD — these files are short and formulaic. Failure degrades gracefully (safety net provides fallbacks).

---

## ui-core

```yaml
id: ui-core
skill_type: executor
execution_mode: sequential
parallel_group: null
execution_order: 4
token_budget: 2000
timeout_ms: 150000
trust_level: trusted
failure_behavior: fallback
cost_ceiling_usd: 0.06
dependencies: [mock-data]
retry_policy:
  max_attempts: 3
  backoff_ms: 4000
```

**Purpose:** Generates the design system: `globals.css`, `layout.tsx`, `ui.tsx`, `charts.tsx`, `layout.tsx`. All page agents (landing, interactions, dashboard, features) import from these components. Second-highest timeout because it generates the most files.

---

## api

```yaml
id: api
skill_type: executor
execution_mode: sequential
parallel_group: null
execution_order: 5
token_budget: 1200
timeout_ms: 90000
trust_level: trusted
failure_behavior: degrade
cost_ceiling_usd: 0.03
dependencies: [mock-data]
retry_policy:
  max_attempts: 3
  backoff_ms: 4000
```

**Purpose:** Generates API route handlers: `/api/health`, `/api/data`, `/api/search`. All return mock JSON; no real database. Failure degrades — the app still renders without working API routes.

---

## landing

```yaml
id: landing
skill_type: executor
execution_mode: sequential
parallel_group: null
execution_order: 6
token_budget: 1500
timeout_ms: 120000
trust_level: trusted
failure_behavior: degrade
cost_ceiling_usd: 0.04
dependencies: [ui-core]
retry_policy:
  max_attempts: 3
  backoff_ms: 4000
```

**Purpose:** Generates the marketing homepage (`src/app/page.tsx`) — hero section, features grid, pricing cards, CTA.

---

## interactions

```yaml
id: interactions
skill_type: executor
execution_mode: sequential
parallel_group: null
execution_order: 7
token_budget: 1500
timeout_ms: 120000
trust_level: trusted
failure_behavior: fallback
cost_ceiling_usd: 0.04
dependencies: [ui-core]
retry_policy:
  max_attempts: 3
  backoff_ms: 4000
```

**Purpose:** Generates client-side interaction layer: `useApp.ts`, `modals.tsx`, `forms.tsx`. These components are imported by the dashboard and feature pages.

---

## dashboard

```yaml
id: dashboard
skill_type: executor
execution_mode: sequential
parallel_group: null
execution_order: 8
token_budget: 2000
timeout_ms: 150000
trust_level: trusted
failure_behavior: fallback
cost_ceiling_usd: 0.06
dependencies: [ui-core]
retry_policy:
  max_attempts: 3
  backoff_ms: 4000
```

**Purpose:** Generates the main application dashboard: KPI cards, SVG charts, data table, activity feed. The most complex single-page BUILD artifact.

---

## features

```yaml
id: features
skill_type: executor
execution_mode: sequential
parallel_group: null
execution_order: 9
token_budget: 2000
timeout_ms: 180000
trust_level: trusted
failure_behavior: fallback
cost_ceiling_usd: 0.07
dependencies: [dashboard]
retry_policy:
  max_attempts: 3
  backoff_ms: 4000
```

**Purpose:** Generates 3 MVP pain-point workflow pages using dynamic routing (`src/app/dashboard/[feature]/page.tsx`). Longest timeout in BUILD because it generates three distinct interactive UIs. Highest cost ceiling because output is the most token-intensive.

---

## repair

```yaml
id: repair
skill_type: validator
execution_mode: sequential
parallel_group: null
execution_order: 10
token_budget: 2500
timeout_ms: 180000
trust_level: privileged
failure_behavior: abort
cost_ceiling_usd: 0.07
dependencies: [features]
retry_policy:
  max_attempts: 3
  backoff_ms: 4000
```

**Purpose:** Reads the `errorManifest` (list of agents that failed or produced incomplete output) and regenerates only the affected files. Privileged trust because its output can override successful agent outputs where dependencies require repair. Failure aborts — a failed repair means the app will not build.

**Conditional execution:** Only runs if `errorManifest.length > 0`. Skipped on clean runs.

---

## docs

```yaml
id: docs
skill_type: transformer
execution_mode: sequential
parallel_group: null
execution_order: 11
token_budget: 1000
timeout_ms: 90000
trust_level: trusted
failure_behavior: skip
cost_ceiling_usd: 0.02
dependencies: [repair]
retry_policy:
  max_attempts: 3
  backoff_ms: 4000
```

**Purpose:** Transforms the completed codebase into documentation: `README.md` and component guide. Failure behavior is `skip` — missing docs do not affect app functionality or deployment.

**Note:** docs is defined in BUILD_AGENTS but excluded from BUILD_ORDER by the `.filter(a => a.id !== 'docs')` in PipelinePage.tsx. It is available for future activation.
