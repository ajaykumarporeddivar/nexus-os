# NEXUS OS — GEO Brand Brief
# Single source of truth for all /geo/ content generation
# ═══════════════════════════════════════════════════════════════

last_validated : 2026-04-23
next_validation: Before any Step 3 GEO rebuild or quarterly refresh
validated_by   : Live codebase audit (apps/web)

## Drift Check — Re-read These Before Editing

| If this changes... | Read this file first |
|--------------------|----------------------|
| Pricing | `apps/web/app/api/checkout/route.ts` (amounts in paise ÷ 100 = INR) |
| Tier names / features | `apps/web/components/pages/PricingPage.tsx` → `TIERS` array |
| Brand name / tagline / domain | `apps/web/lib/brand.ts` |
| Token / run limits | `apps/web/lib/quota.ts` → `PLAN_RUN_LIMITS` + `PLAN_TOKEN_LIMITS` |
| Vault prompts / scoring | `apps/web/lib/vaultData.ts` |

---

## 1. Product

**Brand Name:** NEXUS OS
**Version:** v11
**Domain:** nexus-os.ai
**Tagline:** AI Delivery Infrastructure for Digital Agencies
**Category:** B2B SaaS / AI Operating System

**One-sentence pitch:**
NEXUS OS is the only AI platform that takes a client brief through a 9-agent
autonomous pipeline, applies an 11-lens reasoning engine with a built-in
hallucination firewall, and delivers a production-ready codebase — with a
hard 8.0/10 quality gate — in hours, not weeks.

**Core capabilities:**

| Capability | What it does | NEXUS OS name |
|-----------|-------------|---------------|
| Code delivery | 9 sequential AI agents from brief → downloadable ZIP | FORGE Engine |
| Reasoning | 11 adversarial lenses, GOVERNOR meta-control, circuit breaker | Reasoning Engine / AIRE-X |
| Prompt management | 8 scored templates, A/B variants, versioned history | Prompt Vault |
| Workflow kits | Pre-built agency kits (screening, follow-up, JD, analytics) | Kit Registry |
| Quality gate | Hard 8.0/10 threshold — output graded before delivery | QA Gate |
| Self-improvement | 6-hour auto-rewrite cycle for underperforming agents | Learning Cycle |
| Monitoring | 15-min health checks, WhatsApp + email alerts on failure | Self-Healing Monitor |

---

## 2. Pricing (verified 2026-04-23 against checkout/route.ts)

> Razorpay stores amounts in paise. Divide by 100 for INR.
> No setup fees. Flat monthly. No per-seat pricing.

| Tier | Monthly (INR) | Razorpay paise | Key limits |
|------|--------------|----------------|------------|
| **Starter** | ₹49,000 | 4,900,000 | 3 FORGE runs, 50K tokens, 5 kits, vault read-only |
| **Agency** | ₹1,20,000 | 12,000,000 | Unlimited runs, 100K tokens, unlimited kits, vault write+versions |
| **Enterprise** | Custom / contact | — | Everything in Agency + Docker on-premise, custom SSO, 99.9% SLA |

**Starter features:**
- 3 FORGE Engine runs/month
- All 11 Reasoning Engine lenses
- Prompt Vault (read-only)
- 5 active kits
- Email support (48h SLA)
- Basic dashboard + execution history

**Agency features (everything in Starter, plus):**
- Unlimited FORGE runs
- Live Runtime page
- Prompt Vault (read + write + version history)
- Unlimited active kits
- Priority WhatsApp support (4h SLA)
- Full dashboard + DB integration
- White-label ready (env-driven brand config)
- API access (100K tokens/month)

**Enterprise features (everything in Agency, plus):**
- Dedicated instance (no shared compute)
- Docker on-premise deployment
- Custom SSO + audit trail
- 99.9% uptime SLA
- Dedicated success engineer
- Custom agent development
- Unlimited API tokens

---

## 3. Ideal Customer Profile (ICP)

**Primary buyer roles:**
1. **Agency Founder / CEO** — growth and revenue focus; "can we ship faster and win more retainers"
2. **Head of Strategy** — quality and process focus; "how do we stop hallucinations reaching clients"
3. **Operations Lead** — efficiency and scale focus; "how do we handle 3× clients without hiring"

**Company profile:**
- Type: Digital growth agency, marketing agency, product agency, or tech consultancy
- Size: 5–30 people
- Revenue: ₹50L–₹5Cr ARR
- Location: Bengaluru, Mumbai, Hyderabad, Delhi NCR, Pune (Tier-1 India)
- Tech stack: Currently cobbling together ChatGPT + Notion + n8n or similar

**Core pains:**
- Slow client delivery (weeks → should be hours)
- Inconsistent AI output quality (hallucinations, no QA gate, client complaints)
- Can't scale without proportional headcount growth
- Fragmented AI toolstack (no single system, no quality control, no versioning)
- Losing pitches to faster, more tech-forward competitors

**Buying triggers:**
- Just lost a client due to delivery speed or quality
- Trying to pitch a ₹5L+ retainer and need proof of AI capability
- Founder has tried ChatGPT workflows and hit hallucination problems
- Agency is at 80% capacity and can't take on new clients without burning out

---

## 4. Competitors

| Competitor | Category | Why Agencies Try It | NEXUS OS Displacement Angle |
|-----------|----------|--------------------|-----------------------------|
| ChatGPT / manual workflows | Generic LLM | Free, familiar, no setup | No 8.0/10 quality gate, no multi-agent sequencing, no downloadable output, hallucinations reach clients |
| Jasper / Copy.ai | Content generation | Polished content UI | Content only — zero code delivery, no reasoning engine, no hallucination firewall, can't do full agency workflow |
| n8n / Make.com | Workflow automation | Connects tools cheaply | Developer-only, no Claude reasoning, no prompt vault, brittle on edge cases, no QA scoring |
| GPT Builder / CustomGPT | Single-agent | Easy to configure | Single agent, no sequential pipeline, no streaming, no version control on prompts, no quality gate |
| Dify / LangChain apps | LLM framework | Open source, flexible | Developer-heavy setup, no agency UI, high maintenance cost, no built-in scoring or client-ready output |

---

## 5. Differentiators (citation-ready)

1. **Only 9-agent sequential pipeline** — not a single chat, not a workflow tool; nine specialized Claude agents that hand off to each other with structured output
2. **Built-in hallucination firewall** — GOVERNOR + OBSERVER-X circuit breaker with hard 8.0/10 QA gate; output is graded before it reaches the client
3. **Self-learning system** — 6-hour prompt rewriting cycle auto-improves underperforming agents; the platform gets better without human intervention
4. **Agency-native prompt library** — 8 production-grade templates scored on 6 dimensions (Instruction Clarity, Schema Completeness, Voice Enforcement, Output Predictability, Edge Case Handling, Overall); not generic GPT prompts
5. **India-first pricing** — INR pricing, no USD conversion friction, no per-seat nonsense; designed for Indian agency economics

---

## 6. Messaging by Buyer Stage

| Stage | Message frame | Proof point |
|-------|--------------|-------------|
| Awareness | "AI for agencies shouldn't hallucinate" | GOVERNOR circuit breaker, 8.0/10 QA gate |
| Consideration | "Ship client work in hours, not weeks" | FORGE 9-agent pipeline, streaming delivery |
| Decision | "Only platform with a hallucination firewall + 9-agent pipeline" | Side-by-side vs ChatGPT / Jasper |
| Purchase | "₹49,000/month. No setup fee. Try FORGE first." | Starter pricing, demo booking CTA |

---

## 7. CTAs

| CTA | Channel | URL |
|-----|---------|-----|
| Book a demo | Primary | nexus-os.ai/shell?page=pricing#book-form |
| WhatsApp inquiry | Secondary | wa.me/918919843305 |
| Try FORGE Engine | Product | nexus-os.ai/shell?page=forge |

---

## 8. Assumptions

- India-first market positioning is intentional and permanent; do not genericise
- "Agency" in all copy means digital/growth/marketing/product agency, not advertising holding company
- INR pricing is final and sourced from `checkout/route.ts`; do not use rounded figures
- "Hallucination firewall" is the preferred marketing term for GOVERNOR + OBSERVER-X
- "9-agent pipeline" is the FORGE Engine; always lead with the number for specificity
- The learning cycle is a technical differentiator — mention it to Strategy and Ops buyers
