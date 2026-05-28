# Skill: pipeline-run

## Purpose
Trigger the full FORGE → BUILD → DEPLOY pipeline server-side for a given workspace.

## Endpoint
`POST /api/pipeline/trigger`

## Authentication
Header: `Authorization: Bearer $CRON_SECRET`
Or: `x-nexus-internal: $INTERNAL_API_SECRET`

## Request Body
```json
{
  "workspaceId": "<workspace-id>",
  "agents": ["ugc-forge", "ad-forge", "seo-forge"],
  "reason": "autonomous-loop"
}
```

## Response
```json
{
  "ok": true,
  "runId": "<uuid>",
  "steps": {
    "forge": { "ok": true, "agentsRun": 3, "durationMs": 4200 },
    "build": { "ok": true, "agentsRun": 2, "durationMs": 3100 },
    "deploy": { "ok": true, "ref": "main", "deploymentId": "dpl_xxx" }
  }
}
```

## When to Use
- After detecting new leads or high-intent signals
- On daily scheduled runs (02:00 UTC)
- After self-healing detects a stale deployment
- When Hermes dispatches a "build" task

## Notes
- Circuit breaker: 3 consecutive failures → 60s cooldown before retry
- All steps are logged as AuditEvents in the database
- Idempotent for the same runId
