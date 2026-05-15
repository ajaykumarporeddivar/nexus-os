# NEXUS OS — Execution Algebra

**ACORA Phase 8** — Formal semantics for the One Click Pipeline execution graph.

## Algebra Constructs

| Construct | Semantics |
|---|---|
| `SEQ(A)` | A runs alone. All dependencies complete before A starts. |
| `PAR[g](A, B, ...)` | All agents in parallel group `g` run via `Promise.all`. Each gets the same context snapshot captured before the group starts. |
| `COND(pred, A, B)` | If pred is true, execute A. Otherwise execute B. |
| `RETRY(A, policy)` | Run A up to `policy.maxAttempts` times with exponential backoff. On exhaustion: execute `failureBehavior`. |
| `ROLLBACK(A, undo)` | If downstream fails, `createForgeFallbackOutput(A, ...)` provides a degraded substitute. |

---

## FORGE Pipeline — Formal Expression

```
FORGE(brief, client) =
  SEQ(orchestrator)                                    [order=1, privileged]
  → SEQ(analyst)                                       [order=2, privileged]
  → SEQ(architect)                                     [order=3, privileged]
  → PAR[1](planner, builder, security, db-opt)         [order=4, trusted ×4]
  → SEQ(test-writer)                                   [order=5, privileged]
  → SEQ(qa)                                            [order=6, privileged]
  → COND(qa.score >= 7.0,
      SEQ(workflow-mapper)                             [order=7, trusted]
      → PAR[2](growth, monetisation)                  [order=8, trusted ×2]
      → SEQ(closer),                                  [order=9, trusted]
      RETRY(                                           [max 2 revisions]
        SEQ(analyst) → SEQ(architect)
        → PAR[1](planner, builder, security, db-opt)
        → SEQ(test-writer) → SEQ(qa),
        { maxAttempts: 2, escalate: abort }
      )
    )
```

**PAR group 1 agents:** Driven by `skill.parallelGroup === 1` in `FORGE_AGENTS`.  
**PAR group 2 agents:** Driven by `skill.parallelGroup === 2` in `FORGE_AGENTS`.  
No hardcoded agent IDs in PipelinePage.tsx — adding agents to a group requires only a data change.

---

## BUILD Pipeline — Formal Expression

```
BUILD(forge_spec) =
  SEQ(scaffold)                   [order=1, executor, abort-on-failure]
  → SEQ(mock-data)                [order=2, executor, fallback-on-failure]
  → SEQ(shell)                    [order=3, executor, degrade-on-failure]
  → SEQ(ui-core)                  [order=4, executor, fallback-on-failure]
  → SEQ(api)                      [order=5, executor, degrade-on-failure]
  → SEQ(landing)                  [order=6, executor, degrade-on-failure]
  → SEQ(interactions)             [order=7, executor, fallback-on-failure]
  → SEQ(dashboard)                [order=8, executor, fallback-on-failure]
  → SEQ(features)                 [order=9, executor, fallback-on-failure]
  → COND(errorManifest.length > 0,
      SEQ(repair),                [order=10, validator, abort-on-failure]
      skip
    )
```

**BUILD_ORDER** is computed at runtime:
```typescript
BUILD_AGENTS
  .filter(a => a.id !== 'repair' && a.id !== 'docs')
  .sort((a, b) => a.skill.executionOrder - b.skill.executionOrder)
  .map(a => a.id)
```
No hardcoded ordering strings. Reordering only requires changing `executionOrder` in `buildAgentData.ts`.

---

## Fault Tolerance Overlay

Every agent call goes through:

```
withTimeout(callAgentStreaming(...), agent.skill.timeoutMs, agentId)
  ↓ on success
recordAgentCost(agentId, tokens, durationMs, attempts)
recordBreakerSuccess(agentId)

  ↓ on permanent failure (all retries exhausted)
recordBreakerFailure(agentId)
  → if failureBehavior === 'abort'   → throw Error (stops pipeline)
  → if failureBehavior === 'fallback' → createForgeFallbackOutput() or errorManifest entry
  → if failureBehavior === 'degrade'  → empty output, pipeline continues
  → if failureBehavior === 'skip'     → omit silently, pipeline continues
```

## Circuit Breaker Overlay

On every call entry point:

```
isBreakerOpen(agentId)?
  yes → skip call, apply failureBehavior immediately
  no  → proceed with call
```

Breaker opens after `CIRCUIT_BREAKER_THRESHOLD = 3` consecutive failures.  
Breaker resets to `half-open` after `CIRCUIT_BREAKER_RESET_MS = 60_000` ms.  
Both refs (`circuitBreakers`, `agentCostLedger`) are cleared at the start of each new pipeline run.

---

## Memory State Map

| State Variable | Owner | Tier | Cleared |
|---|---|---|---|
| `content` (FORGE outputs) | `runForge` closure | working | on run start |
| `forgeContentRef` | component | session | on run start |
| `buildFilesRef` | component | session | on run start |
| `forgeSpecRef` | component | session | on run start |
| `circuitBreakers` | component | session | on run start |
| `agentCostLedger` | component | session | on run start |
| `errorManifest` (BUILD) | `runBuild` closure | working | on runBuild call |
| Session storage (forge-spec, build-files) | browser | episodic | on run start |
