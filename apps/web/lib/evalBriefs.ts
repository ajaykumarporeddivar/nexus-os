// 5 seed briefs for the evaluation harness.
// Each maps to a real agency use-case and drives a full 21-agent NEXUS run
// so PromptVersion.avgScore populates with real quality scores.

export interface EvalBrief {
  id: string
  client: string
  brief: string
  expectedPhases: number  // minimum phases expected in a passing run
  minScore: number        // minimum QA score considered passing
}

export const EVAL_BRIEFS: EvalBrief[] = [
  {
    id: 'eval-01-recruitment',
    client: 'TalentFirst Agency',
    brief: `Build a candidate screening system for a digital marketing agency.
Requirements:
- CV parsing with Claude API (extract: name, skills, experience years, LinkedIn URL)
- Fit score 0-100 based on role rubric (configurable weights: skills 40%, experience 35%, culture 25%)
- PostgreSQL storage with candidate status tracking (new/screened/shortlisted/rejected)
- REST API: POST /candidates (upload), GET /candidates?role=X (filtered list), PATCH /candidates/:id/status
- GDPR: PII masked in logs, 90-day retention policy, soft-delete
- Weekly report: top 10 candidates per role with score breakdown
Tech stack: Node.js + Express + Prisma + PostgreSQL`,
    expectedPhases: 7,
    minScore: 7.5,
  },
  {
    id: 'eval-02-ecommerce',
    client: 'ShopLift Commerce',
    brief: `Build a product recommendation engine for a Shopify-based e-commerce client.
Requirements:
- Ingest product catalog via Shopify Admin API (sync on webhook + daily cron)
- Collaborative filtering: users who bought X also bought Y (Redis sorted sets)
- Personalised homepage widget: top 6 recommendations per session
- A/B test: control (manual picks) vs treatment (AI recs) — track CTR + conversion
- Admin dashboard: recommendation performance by category, weekly uplift report
- API: GET /recs?session=X (< 50ms p95), POST /events (click/purchase tracking)
Tech stack: Next.js API routes + Redis (Upstash) + Prisma + Neon PostgreSQL`,
    expectedPhases: 7,
    minScore: 7.5,
  },
  {
    id: 'eval-03-whatsapp-crm',
    client: 'LeadFlow CRM',
    brief: `Build a WhatsApp-first lead nurturing CRM for a real-estate agency.
Requirements:
- Webhook receiver for WATI/Twilio incoming messages
- Lead scoring from conversation history using Claude API (intent detection: hot/warm/cold)
- Automated response sequences: day 0 (welcome), day 3 (follow-up), day 7 (offer)
- CRM view: lead list with score, last message, assigned agent, stage
- Escalation: if lead asks "price" or "visit" → notify assigned agent via WhatsApp
- Opt-out handling: "STOP" keyword → immediate suppression + audit log
- Integrations: Google Sheets export, Zapier webhook on stage change
Tech stack: Next.js + Prisma + PostgreSQL + WATI API`,
    expectedPhases: 7,
    minScore: 7.5,
  },
  {
    id: 'eval-04-content-pipeline',
    client: 'ContentOS Agency',
    brief: `Build an AI content production pipeline for a social media agency managing 15 clients.
Requirements:
- Brief intake form: client name, tone, target audience, key messages, platforms (IG/LI/X/FB)
- Claude API: generate 30-day content calendar (post title + caption + hashtags + CTA per day)
- Approval workflow: draft → client review → approved/revision-requested → scheduled
- Platform adapters: auto-resize caption length per platform (IG: 2200, X: 280, LI: 3000)
- Asset briefs: for each post, generate image prompt for Midjourney/DALL-E
- Export: CSV for Buffer/Hootsuite scheduling, PDF for client presentation
- Analytics: post approval rate per client, avg revision rounds, time-to-publish
Tech stack: Next.js + Prisma + PostgreSQL + Resend (approval emails)`,
    expectedPhases: 8,
    minScore: 8.0,
  },
  {
    id: 'eval-05-analytics-saas',
    client: 'MetricsIQ',
    brief: `Build a multi-tenant analytics SaaS for digital marketing agencies.
Requirements:
- Multi-tenancy: each agency = isolated schema, max 10 sub-users per agency
- Data ingestion: Google Analytics 4 API + Meta Ads API + LinkedIn Ads API connectors
- KPI dashboard: sessions, conversions, ROAS, CPL — with WoW and MoM deltas
- AI narrative: weekly auto-generated insight summary ("ROAS dropped 18% due to...")
- Alerting: email + WhatsApp when metric deviates > 2σ from 30-day average
- White-label: each agency gets custom domain + logo + colour scheme
- Billing: Razorpay subscription, per-seat pricing (₹5,000/seat/month), usage-based overages
Tech stack: Next.js + FastAPI (Python) + Prisma + Neon + Redis + Razorpay`,
    expectedPhases: 9,
    minScore: 8.5,
  },
]
