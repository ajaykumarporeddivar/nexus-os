import type { Agent } from '@nexus-os/shared-types'

export const AGENTS: Omit<Agent, 'status'>[] = [
  { id: 'orchestrator', name: 'NEXUS ORCHESTRATOR', role: 'Boot + coordination' },
  { id: 'analyst',      name: 'ANALYST',            role: 'Requirements decomposition' },
  { id: 'architect',    name: 'ARCHITECT',          role: 'System design' },
  { id: 'planner',      name: 'PLANNER',            role: 'Feature card generation' },
  { id: 'test-writer',  name: 'TEST WRITER',        role: 'TDD spec generation' },
  { id: 'builder',      name: 'BUILDER',            role: 'Core code generation' },
  { id: 'security',     name: 'SECURITY',           role: 'Security audit' },
  { id: 'db-opt',       name: 'DB OPTIMIZER',       role: 'Schema + migrations' },
  { id: 'qa',           name: 'QA GATE',            role: 'Quality scoring' },
]

export const PIPES = ['Boot','Analyze','Architect','Plan','Scaffold','Build','Test','Secure','Deliver'] as const

export const agentFileMap: Record<string, string> = {
  analyst:       'PROJECT_MANIFEST.md',
  architect:     '.claude/architecture.md',
  planner:       '.claude/features/feature-cards.md',
  'test-writer': 'src/__tests__/specs.md',
  builder:       'src/index.ts',
  security:      '.claude/security-report.md',
  'db-opt':      'db/migrations/001_init.sql',
  qa:            '.forge/qa-report.md',
}

export const DEMO_FORGE_RESPONSES: Record<string, string> = {
  orchestrator: `[NEXUS ORCHESTRATOR] Session initialized.
Mission: Build recruitment automation platform for demo agency.
API validated. 9-agent pipeline armed. Commencing Phase 1.`,

  analyst: `# PROJECT_MANIFEST.md

## Project Overview
Recruitment automation platform with AI-powered candidate screening,
automated follow-up sequences, and analytics reporting.

## Core Features
1. CV parsing and structured extraction
2. Candidate scoring engine (0–100 fit score)
3. Multi-touch follow-up automation (LinkedIn + Email + WhatsApp)
4. ATS integration via webhook
5. Weekly analytics report generation
6. GDPR compliance layer with PII handling

## Technical Requirements
- Backend: Node.js + PostgreSQL + Redis
- AI: Claude API for parsing and scoring
- Integrations: Gmail API, LinkedIn API, Twilio (WhatsApp)
- Auth: OAuth2 with role-based access

## Success Criteria
- Process 100+ CVs/day without manual intervention
- Response time < 500ms for scoring API
- 99.5% uptime SLA
- GDPR-compliant data retention (90 days default)`,

  architect: `# .claude/architecture.md

## System Architecture

### Microservices
1. **ingestion-service** — CV upload, parsing, S3 storage
2. **scoring-service** — AI-powered fit scoring, async queue
3. **comms-service** — Multi-channel outreach orchestration
4. **analytics-service** — Report generation, KPI aggregation
5. **compliance-service** — PII detection, consent management

### Data Flow
CV Upload → S3 → ingestion-service → scoring-service → candidate DB
→ comms-service → multi-channel outreach → analytics update

### Infrastructure
- ECS Fargate (containerized microservices)
- RDS PostgreSQL (candidate data, application state)
- ElastiCache Redis (queue, sessions, rate limiting)
- S3 (CV storage, generated reports)
- CloudFront (CDN for static assets)`,

  planner: `# .claude/features/feature-cards.md

## Feature Cards

### FC-001: CV Ingestion Pipeline
**Priority:** P0 | **Sprint:** 1
- Upload endpoint with multi-format support (PDF, DOCX, TXT)
- Claude API extraction: name, email, phone, skills, experience
- Structured JSON output to candidate DB
- **Acceptance:** Process PDF → structured JSON < 3s

### FC-002: Fit Scoring Engine
**Priority:** P0 | **Sprint:** 1
- Role-specific scoring rubric (configurable weights)
- 0–100 score with breakdown by dimension
- Async queue with BullMQ, max 50 concurrent
- **Acceptance:** Score 100 CVs in < 60s

### FC-003: Follow-Up Automation
**Priority:** P1 | **Sprint:** 2
- 3-step sequence: Day 0 (email), Day 3 (LinkedIn), Day 7 (WhatsApp)
- Template engine with variable substitution
- Opt-out handling with immediate suppression
- **Acceptance:** Sequence completes without manual intervention`,

  'test-writer': `# src/__tests__/specs.md

## TDD Specifications

### CV Ingestion
\`\`\`typescript
describe('ingestion-service', () => {
  it('parses PDF CV into structured JSON', async () => {
    const result = await ingestCV('test-cv.pdf', 'role-001')
    expect(result).toMatchObject({
      name: expect.any(String),
      email: expect.stringMatching(/@/),
      skills: expect.arrayContaining([expect.any(String)]),
      score: expect.any(Number),
    })
  })

  it('handles malformed PDFs gracefully', async () => {
    const result = await ingestCV('corrupt.pdf', 'role-001')
    expect(result.error).toBe('PARSE_FAILED')
    expect(result.score).toBeNull()
  })
})
\`\`\`

### Scoring Engine
\`\`\`typescript
describe('scoring-service', () => {
  it('scores candidate 0-100 against role rubric', async () => {
    const score = await scoreCandidate(mockCandidate, mockRole)
    expect(score.overall).toBeGreaterThanOrEqual(0)
    expect(score.overall).toBeLessThanOrEqual(100)
    expect(score.breakdown).toHaveProperty('skills')
    expect(score.breakdown).toHaveProperty('experience')
  })
})
\`\`\``,

  builder: `# src/index.ts

import express from 'express'
import { PrismaClient } from '@prisma/client'
import { Queue } from 'bullmq'
import { ingestRouter } from './routers/ingest'
import { scoringRouter } from './routers/scoring'
import { commsRouter } from './routers/comms'
import { analyticsRouter } from './routers/analytics'

const app = express()
const prisma = new PrismaClient()
const scoringQueue = new Queue('scoring', { connection: { url: process.env.REDIS_URL } })

app.use(express.json({ limit: '10mb' }))
app.use('/api/ingest',    ingestRouter({ prisma, queue: scoringQueue }))
app.use('/api/scoring',   scoringRouter({ prisma }))
app.use('/api/comms',     commsRouter({ prisma }))
app.use('/api/analytics', analyticsRouter({ prisma }))

app.get('/health', (_, res) => res.json({ status: 'ok', version: '1.0.0' }))

app.listen(process.env.PORT || 3001, () => {
  console.log('NEXUS Recruitment API running on port 3001')
})`,

  security: `# .claude/security-report.md

## Security Audit Report

### Critical Issues: 0
### High Issues: 0
### Medium Issues: 2
### Low Issues: 3

---

### MEDIUM: Rate Limiting on Scoring Endpoint
**Location:** \`src/routers/scoring.ts\`
**Finding:** No rate limiting on /api/scoring endpoint — susceptible to abuse
**Recommendation:** Add Redis-backed rate limiting: 100 req/min per API key

### MEDIUM: PII Logging Risk
**Location:** \`src/services/ingest.ts\`
**Finding:** Candidate email addresses logged at INFO level
**Recommendation:** Mask email in logs: \`user@***.com\` format

### LOW: Missing CORS Policy
Add explicit CORS allowlist rather than wildcard

### LOW: JWT Expiry Too Long
Current 30-day expiry — reduce to 24h for candidate-facing tokens

### LOW: S3 Bucket Versioning
Enable versioning on CV storage bucket for audit trail

### Overall Security Posture: GOOD (7.8/10)
No critical vulnerabilities. Proceed with medium-priority fixes before production.`,

  'db-opt': `# db/migrations/001_init.sql

-- NEXUS Recruitment Platform — Initial Schema
-- Generated by DB OPTIMIZER Agent

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  department  TEXT,
  rubric      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE candidates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id     UUID REFERENCES roles(id),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  cv_s3_key   TEXT,
  raw_text    TEXT,
  extracted   JSONB NOT NULL DEFAULT '{}',
  score       NUMERIC(5,2),
  score_breakdown JSONB DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_candidates_role_id ON candidates(role_id);
CREATE INDEX idx_candidates_score ON candidates(score DESC);
CREATE INDEX idx_candidates_status ON candidates(status);

CREATE TABLE outreach_sequences (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID REFERENCES candidates(id),
  step         INTEGER NOT NULL DEFAULT 0,
  channel      TEXT NOT NULL,
  sent_at      TIMESTAMPTZ,
  opened_at    TIMESTAMPTZ,
  replied_at   TIMESTAMPTZ,
  opted_out    BOOLEAN DEFAULT FALSE
);

COMMIT;

-- INDEXES: candidate lookups by role + score are the hot path
-- ESTIMATED ROW COUNT: 50K candidates/month at scale
-- RECOMMENDED PARTITION: candidates by created_at monthly after 500K rows`,

  qa: `# .forge/qa-report.md

## QA GATE REPORT

### Overall Quality Score: 8.7/10 ✓ APPROVED

---

### Dimension Scores

| Dimension              | Score | Weight |
|------------------------|-------|--------|
| Instruction Clarity    |  9.0  |  20%   |
| Schema Completeness    |  8.5  |  20%   |
| Code Quality           |  8.8  |  25%   |
| Security Posture       |  8.0  |  15%   |
| Test Coverage Estimate |  9.2  |  10%   |
| Deliverability         |  8.5  |  10%   |

### Delivery Status: APPROVED

### Strengths
- Clear microservice boundaries with well-defined data contracts
- TDD specs cover happy path and error cases
- Security audit identified issues before production
- Database schema indexed for the actual query patterns

### Gaps to Address
- Rate limiting on scoring endpoint (MEDIUM priority)
- PII logging masking (MEDIUM priority)
- Integration tests for comms-service (add in Sprint 2)

### Recommendation
Ship to staging. Address medium security findings before production.
Code quality is production-ready. Architecture is sound.`,
}
