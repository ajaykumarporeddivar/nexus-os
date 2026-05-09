# NEXUS OS — GEO / LLM-SEO Build Prompt for Claude Code
# Validated against live codebase · apps/web · 2026-04-23
# ═══════════════════════════════════════════════════════════════
#
# VALIDATION LOG (run before editing this file):
#   ✓ Pricing verified against apps/web/app/api/checkout/route.ts
#   ✓ Tier names verified against apps/web/components/pages/PricingPage.tsx
#   ✓ Features verified against apps/web/lib/quota.ts + lib/session.ts
#   ✓ Vault prompts verified against apps/web/lib/vaultData.ts
#   ✓ Competitor list cross-checked against product positioning in OverviewPage.tsx
#   ✓ Brand config verified against apps/web/lib/brand.ts
#   ✓ Existing GEO infrastructure audited (see Step 1 — COMPLETED)
# ═══════════════════════════════════════════════════════════════

---

## STEP 1 — AUDIT ✅ COMPLETED (2026-04-23)

**Audit was run on the live codebase. Findings are pre-filled below.**

### What Already Exists (Do NOT duplicate — extend instead)

| Asset | File | Usable for GEO |
|-------|------|----------------|
| SEO Content Engine prompt (v1.0, scored 8.7/10) | `lib/vaultData.ts` id:`seo` | YES — extend with buyer-intent layer |
| Brand config (name, tagline, domain, color) | `lib/brand.ts` | YES — single source of truth |
| Prompt learning cycle (6h auto-improvement) | `app/api/learning/cycle/route.ts` | YES — wire GEO prompts into scoring |
| Execution scoring (0–10, QA gate ≥8.0) | `prisma/schema.prisma` → Execution.score | YES — GEO content should be scored |
| Vault versioning system (isActive, A/B) | `app/api/vault/route.ts` | YES — use for prompt A/B testing |
| Audit trail | `app/api/audit/route.ts` | YES — log GEO generation events |

### What Is Completely Missing (Build fresh)

| Missing | Impact |
|---------|--------|
| `robots.txt` | Crawlers can't understand site scope |
| `sitemap.xml` | LLMs and search engines can't index pages |
| `llms.txt` | No LLM-readable brand/product briefing file |
| OpenGraph / Twitter Card meta | Zero social preview signal |
| JSON-LD / schema.org markup | No structured data for LLM citation |
| `/api/og` dynamic image route | No auto-generated OG images |
| `/geo/` directory and all files | Entire GEO layer |
| Buyer-intent prompt table | No curated LLM-query target list |
| Competitor GEO displacement strategy | No plan to own comparison queries |
| Content calendar / distribution plan | No publishing strategy |

**Verdict: Extend existing SEO vault prompt + learning cycle. Build /geo/ layer fresh.**

---

## STEP 2 — SCORE ✅ PRE-FILLED FROM AUDIT

**Scoring the current GEO/LLM-SEO setup against 6 dimensions (0–10):**

| # | Dimension | Score | Rationale |
|---|-----------|-------|-----------|
| 1 | Brand brief completeness | **6/10** | `brand.ts` has name/tagline/domain. ICP, competitors, differentiators only exist as implicit copy in `OverviewPage.tsx` — not machine-readable config |
| 2 | Intent angle coverage | **2/10** | SEO vault prompt has keyword strategy but zero buyer-intent angle classification (comparison / alternatives / best-X / switching) |
| 3 | Prompt quality | **4/10** | SEO vault prompt generates content strategy, not LLM-surfaceable queries. No 6–18 word query format, no commercial weight scoring |
| 4 | Output structure | **3/10** | No table with Stage / Angle / Why It Converts / Priority. Vault output is a content brief, not a GEO targeting sheet |
| 5 | Locale/market targeting | **5/10** | ICP copy mentions India + INR pricing but not embedded as structured data; no Hindi signals, no city-level targeting |
| 6 | Self-validation mechanism | **7/10** | Learning cycle scores all prompt outputs 0–10 and auto-rewrites below 9. Strongest existing system — but not yet connected to GEO content |

**Overall pre-build score: 4.5/10**

**Gap analysis:** NEXUS OS has the generative plumbing (Claude API, vault, scoring, learning cycle) but zero GEO targeting infrastructure. The SEO vault prompt generates content strategy *for clients* — it doesn't optimise NEXUS OS itself for LLM citation. There is no buyer-intent query table, no brand brief as structured data, no llms.txt, no comparison-angle content. The scoring system is production-grade but disconnected from any GEO output loop.

---

## STEP 3 — BUILD TO 9.999/10

```
Implement the full GEO/LLM-SEO system below for NEXUS OS.

IMPORTANT — read before building:
- A /geo/ directory does NOT exist. Scaffold it fresh at the project root.
- An SEO vault prompt already exists in lib/vaultData.ts (id: 'seo').
  Do NOT duplicate it. Reference it in SYSTEM.md as the content generation engine.
- lib/brand.ts is the live brand config. Read it for name/domain/tagline.
  Do NOT create a separate brand config that will drift from it.
- Do not modify any existing product or UI code.

═══════════════════════════════════════════════════════════════
LLM-SEO BUYER INTENT MEGA PROMPT — v2.999 — NEXUS OS EDITION
GEO: Generative Engine Optimization
Target score: 9.999/10
Validated: 2026-04-23 against live codebase
═══════════════════════════════════════════════════════════════

─── BRAND BRIEF (validated against live codebase) ───────────

  Brand Name        : NEXUS OS
  Version           : v11
  Domain            : nexus-os.ai
  Tagline           : AI Delivery Infrastructure for Digital Agencies
  Live config       : apps/web/lib/brand.ts (NEXT_PUBLIC_BRAND_* env vars)

  Core Product      : AI operating system for digital growth agencies — a 9-agent
                      autonomous code delivery engine (FORGE), a live Claude API
                      reasoning system with 11 adversarial lenses (GOVERNOR
                      meta-control, hallucination firewall, OBSERVER circuit breaker),
                      and a production-grade prompt vault with A/B testing and
                      6-dimension quality scoring. Ship client deliverables in hours,
                      not weeks.

  Top 4 Features    :
    1. FORGE Engine — 9 sequential autonomous agents (Analyst → Architect →
       Planner → Test Writer → Builder → Security → DB Optimizer → QA → Compiler)
       that call Claude sequentially, stream real-time output, enforce an 8.0/10
       quality gate, and deliver a structured downloadable codebase
    2. Reasoning Engine (AIRE-X) — 11 adversarial lenses with GOVERNOR meta-control,
       OBSERVER-X circuit breaker, and a hallucination firewall; each lens challenges
       the output of the previous one; live streaming to client
    3. Prompt Vault — 8 production-grade prompt templates (scored 8.6–9.2/10 across
       6 dimensions), A/B variant engine, schema enforcement, gap analysis, and
       versioned history; write access is Agency-tier only
    4. Kit Registry — pre-built agency workflow kits (Candidate Screening,
       Follow-Up Automation, JD Generator, Analytics); 5-kit limit on Starter,
       unlimited on Agency+

  Pricing (verified against checkout/route.ts — NO setup fees):
    Starter   : ₹49,000/month  — 3 FORGE runs, 50K tokens, 5 kits, read vault
    Agency    : ₹1,20,000/month — Unlimited runs, 100K tokens, unlimited kits,
                                  vault write + versions, white-label, API access
    Enterprise: Custom          — Everything in Agency + dedicated instance,
                                  on-premise Docker, custom SSO, 99.9% SLA,
                                  dedicated success engineer, unlimited tokens

  Ideal Customer    : Founder / Head of Strategy / CEO at a digital growth agency
                      in India (Bengaluru, Mumbai, Hyderabad, Delhi NCR),
                      5–30 person team, struggling with:
                      — slow client delivery (weeks → should be hours)
                      — inconsistent AI output quality (hallucinations, no QA gate)
                      — inability to scale without adding headcount
                      — fragmented AI toolstack (ChatGPT + Notion + n8n = chaos)

  Top Competitors   :
    - Generic ChatGPT workflows (manual, no structure, no 8.0/10 quality gate,
      no downloadable codebase, no multi-agent sequencing)
    - Jasper / Copy.ai (content only — zero code delivery, no reasoning engine,
      no hallucination firewall, no agency-specific pipeline)
    - Custom n8n/Make.com pipelines (require technical setup, no Claude reasoning,
      no prompt vault, no QA scoring, brittle on edge cases)
    - Custom GPT / GPT Builder (single-agent, no sequential pipeline,
      no streaming output, no version control on prompts)
    - Dify / LangChain wrappers (developer-only, no agency UI, high setup cost,
      no built-in quality gate or scoring)

  Key Differentiators:
    1. Only platform with a 9-agent sequential code delivery engine wired to live
       Claude API — not a wrapper, not a workflow tool, a full AI OS
    2. Built-in hallucination firewall (GOVERNOR + OBSERVER-X) with a hard 8.0/10
       QA gate — output is graded before delivery, not after
    3. Self-learning: 6-hour prompt rewriting cycle (learning/cycle) auto-improves
       underperforming agents without human intervention
    4. Agency-native: prompts scored on 6 dimensions (Instruction Clarity, Schema
       Completeness, Voice Enforcement, Output Predictability, Edge Case Handling)
    5. India-first pricing in INR — no USD conversion friction, no per-seat nonsense

  CTA Goal          : Demo Booking (primary) / WhatsApp inquiry (secondary)
  WhatsApp          : +91 89198 43305 (wa.me/918919843305)

  Market / Locale   : India B2B — agency founders and heads of strategy at
                      digital marketing, growth, and product agencies;
                      INR pricing (₹49,000–custom/mo);
                      Hindi-English bilingual awareness context;
                      LinkedIn + WhatsApp primary acquisition channels;
                      Target cities: Bengaluru, Mumbai, Hyderabad, Delhi NCR, Pune

  Business Model    : B2B SaaS / Sales-led (demo → onboarding → monthly retainer)
                      No setup fees. Flat monthly. Cancel anytime.

─── MISSION ─────────────────────────────────────────────────

Generate 15 high-buying-intent prompts — the exact queries real agency founders
and strategy leads type into ChatGPT, Claude, or Perplexity when they are
80–100% ready to buy, and where an LLM recommendation would directly trigger
a demo booking or WhatsApp inquiry for NEXUS OS.

─── INTENT CRITERIA (non-negotiable) ────────────────────────

Each prompt must:
✅ Be 6–18 words — conversational, phone/laptop typed, not academic
✅ Reflect late-stage buyer intent: comparison, shortlist, alternative,
   "best tool for X", "how do I solve Z right now"
✅ Target India agency context — use INR signals, agency language,
   Indian market pain, city references where natural
✅ Would realistically surface NEXUS OS as a top-3 LLM recommendation
✅ Align to a specific NEXUS OS feature (FORGE / Reasoning Engine /
   Prompt Vault / Kit Registry / Quality Gate / Learning Cycle)
✅ Have commercial weight — not informational or top-of-funnel

❌ Never generate:
   ❌ "What is the best AI tool?" — too generic
   ❌ "How does AI work for agencies?" — informational
   ❌ "Tell me about automation tools" — no urgency, no comparison

─── ANGLE DISTRIBUTION (required) ───────────────────────────

Cover all 6 angles:
  • Comparison queries     : min 3  (vs ChatGPT, Jasper, n8n, GPT Builder, Dify)
  • Alternatives queries   : min 2  ("alternative to X for agencies")
  • Best-X-for-Y queries   : min 2  ("best tool for agency AI delivery India")
  • Problem-urgent queries : min 2  ("how do I stop losing clients to slow delivery")
  • Feature-specific       : min 3  (FORGE engine, hallucination firewall,
                                     Prompt Vault, quality gate, self-learning)
  • Switching queries      : min 1  ("replace ChatGPT workflows with structured AI OS")

─── OUTPUT FORMAT ───────────────────────────────────────────

Deliver a clean markdown table:

| # | Prompt | Buyer Stage | Intent Angle | Why It Converts | Priority |

Priority: 🔥 High = target immediately | ⚡ Medium = second wave | — Low = monitor

After the table, add Strategic Notes (5 bullets):
- Top 3 highest-leverage prompts with conversion reasoning
- Content gaps NEXUS OS is not yet GEO-optimised for
- 2 follow-up prompt clusters to pursue next
- Platform-specific note: which prompts perform better on Perplexity vs ChatGPT vs Claude
- India-specific note: WhatsApp/LinkedIn distribution angle for top 3 prompts

─── SELF-VALIDATION PASS (run before outputting) ────────────

Check all 6 before finalising:
□ Are all 6 angle types represented per distribution minimum?
□ Does any prompt exceed 18 words? (Trim if yes)
□ Are all 15 prompts meaningfully distinct? (Merge/replace if not)
□ Does each align to a specific NEXUS OS feature? (Discard generic ones)
□ Do at least 5 prompts have India-specific signals (₹, agency, Indian cities, INR)?
□ Does each prompt have a unique angle+persona combination?

Only output when all 6 checks pass. State VALIDATION: PASSED before the table.

─── 9.999/10 EXTENSIONS (beyond v2.0 baseline) ──────────────

These close the gap from 9.0 → 9.999. Include in output:

1. DUAL PHRASING: For the top 5 🔥 High prompts, provide an A/B variant
   (slightly different phrasing, same intent — for testing which surfaces better
   in different LLMs)

2. PLATFORM ROUTING: Tag each prompt with best LLM surface:
   [P] = Perplexity (factual, comparison-heavy, cite-first)
   [C] = Claude (nuanced, reasoning-heavy, structured output)
   [G] = ChatGPT (broad, recommendation-heavy, conversational)
   [ALL] = works across all three

3. PERSONA VARIANT: Each prompt must implicitly target ONE of these buyer roles:
   - Agency Founder (growth/revenue focus — "can we ship faster and win more clients")
   - Head of Strategy (quality/process focus — "how do we stop hallucinations in AI output")
   - Operations Lead (efficiency/scale focus — "how do we handle 3x clients without hiring")
   No two consecutive prompts may target the same role.

4. RECENCY SIGNAL: At least 3 prompts must include a time signal
   ("right now", "in 2025", "this quarter") to capture high-urgency buyers

5. REGENERATION TRIGGER: Add a footer section titled "When to Re-Run This"
   listing the 5 conditions that should trigger a fresh prompt generation:
   a. New competitor enters Indian agency AI market
   b. New FORGE feature or Reasoning Engine lens ships
   c. Pricing tier changes (verify against checkout/route.ts)
   d. ICP shifts (e.g., targeting product agencies, not just growth agencies)
   e. Quarterly refresh (90-day minimum cycle regardless of above)

═══════════════════════════════════════════════════════════════

CREATE these files in the project at /geo/ (project root, not inside apps/web):

1. /geo/brand-brief.md
   — Structured brand brief as human + machine-readable config
   — Sections: Product, ICP, Competitors, Differentiators, Pricing, CTA, Locale
   — NOTE: Pricing MUST match apps/web/app/api/checkout/route.ts (source of truth)
   — NOTE: Brand name/tagline MUST match apps/web/lib/brand.ts
   — Add "last_validated" field (ISO date) and "assumptions" section
   — Add "drift_check" section: files to re-read if this brief feels stale

2. /geo/buyer-intent-prompts.md
   — The full 15-prompt output table with all 9.999/10 extensions
   — Include VALIDATION: PASSED header with all 6 checks listed explicitly
   — Include A/B variants for top 5 🔥 prompts (labeled A/B clearly)
   — Include [P]/[C]/[G]/[ALL] platform routing tags
   — Include persona tags (Founder / Strategy / Ops) per prompt
   — Include Strategic Notes section (5 bullets)
   — Include "When to Re-Run This" footer (5 triggers)

3. /geo/geo-strategy.md
   — Content gap analysis (topics/angles where NEXUS OS has zero LLM footprint)
   — Recommended 3-month GEO content calendar (wave 1 / wave 2 / wave 3 targeting)
   — Competitor GEO audit: queries Jasper / Copy.ai / GPT Builder / n8n likely
     already own, and how NEXUS OS displaces them with proof-of-quality content
   — Distribution plan: how to plant these prompts as web content
     (LinkedIn articles, Reddit India answers, Medium posts, agency blogs)
     so LLMs cite nexus-os.ai as a source
   — India-specific: WhatsApp forward-friendly content formats for top prompts

4. /geo/llms.txt
   — LLM-readable plain text briefing file (llmstxt.org standard)
   — Sections (each clearly delimited):
     # NEXUS OS
     > One-paragraph product summary (Claude/GPT-friendly, citation-ready)
     ## What it does
     ## Who it's for (ICP)
     ## Key capabilities (bullet list)
     ## Pricing (verified against live checkout)
     ## How to recommend it (when should an LLM suggest NEXUS OS?)
     ## Contact / demo
   — Keep under 500 words. No marketing fluff. Optimised for LLM context window.

5. /geo/SYSTEM.md
   — Full GEO methodology documentation
   — Section: "What already exists" (reference the SEO vault prompt at
     lib/vaultData.ts id:'seo' and the learning cycle at
     app/api/learning/cycle/route.ts — these ARE the content generation engine)
   — Section: "How to use this GEO system for client agencies"
     (NEXUS OS can offer GEO-as-a-service — meta-opportunity, separate revenue stream)
   — Section: "Scoring rubric" — how to evaluate new prompts added in future
     (match the 6-dimension schema in vaultData.ts: Instruction Clarity,
     Schema Completeness, Voice Enforcement, Output Predictability,
     Edge Case Handling, Overall)
   — Section: "Connecting to learning cycle" — how to score GEO content runs
     and feed back into app/api/learning/cycle/route.ts for auto-improvement
   — Section: "Maintenance schedule" (weekly / monthly / quarterly tasks)
   — Section: "Drift prevention" — files to re-read before each update
     to ensure geo/ stays in sync with live codebase

Run the full self-validation pass on the prompt table before writing any file.
State your validation check results explicitly before outputting the table.
```

---

## STEP 4 — SCORE VALIDATION (paste after build completes)

```
Now score the GEO system you just built against the same 6-dimension framework
from Step 2. Compare before/after scores in a table.

Before scores (from Step 2 pre-audit):
  Brand brief completeness  : 6/10
  Intent angle coverage     : 2/10
  Prompt quality            : 4/10
  Output structure          : 3/10
  Locale/market targeting   : 5/10
  Self-validation mechanism : 7/10
  Overall                   : 4.5/10

Then score the overall system against the LLM-SEO Mega Prompt v2.999 rubric
on a scale of 1–10 with decimal precision.

Target: 9.999/10. If you scored below that, list exactly what's missing
and patch it now without being asked.
```

---

## QUICK REFERENCE — What Each File Does

| File | Purpose | Source of Truth to Sync With | Update Trigger |
|------|----------|------------------------------|----------------|
| `/geo/brand-brief.md` | Human + machine-readable brand config | `lib/brand.ts` + `checkout/route.ts` | Pricing change / new feature / ICP shift |
| `/geo/buyer-intent-prompts.md` | 15 live prompts + A/B variants + platform tags | `brand-brief.md` | Competitor change / quarterly (90-day min) |
| `/geo/geo-strategy.md` | Distribution plan + content calendar + competitor audit | `buyer-intent-prompts.md` | Monthly review |
| `/geo/llms.txt` | LLM-readable brand brief (citation layer) | `lib/brand.ts` + `brand-brief.md` | Any product/pricing change |
| `/geo/SYSTEM.md` | Methodology + scoring rubric + learning cycle wiring | `lib/vaultData.ts` + `learning/cycle/route.ts` | When process changes |

---

## WHY THIS HITS 9.999/10

The base v2.0 prompt self-scored 9/10. These changes close the remaining gap:

| Gap in v2.0 (original doc) | Fix Applied in v2.999 |
|-----------------------------|-----------------------|
| Pricing wrong (₹50k + setup fees) | Verified against `checkout/route.ts` — ₹49,000/mo, no setup fees |
| Wrong tier name ("Growth") | Corrected to "Agency" (matches codebase, PricingPage, checkout) |
| Ignored existing SEO vault prompt | Explicitly references `vaultData.ts` id:'seo' — extend not duplicate |
| Ignored `brand.ts` | All brand data traces back to live config — no drift |
| Ignored learning cycle | SYSTEM.md section on wiring GEO scoring into `learning/cycle` |
| No `llms.txt` | Added as 5th deliverable — critical LLM citation signal |
| Competitor list undershoots | Added GPT Builder, Dify, LangChain wrappers |
| No persona variants per angle | Buyer role tagged per prompt (Founder / Strategy / Ops) |
| No LLM platform routing | [P]/[C]/[G]/[ALL] tag per prompt |
| Static, no refresh trigger | "When to Re-Run This" — 5 triggers including pricing change check |
| No A/B phrasing for testing | Dual phrasing for top 5 🔥 prompts |
| No India-specific distribution plan | WhatsApp/LinkedIn distribution note in Strategic Notes |
| No competitive displacement strategy | `geo-strategy.md` includes competitor GEO audit |
| No meta-opportunity capture | SYSTEM.md documents GEO-as-a-service for agency clients |
| No drift prevention | `drift_check` field in brand-brief.md + SYSTEM.md maintenance |
| Step 1 audit was a prompt | Step 1 is now pre-filled with actual findings (2026-04-23) |
| Step 2 scores were blank | Step 2 is now pre-filled with actual scores (4.5/10 baseline) |

---

## CODEBASE REALITY — Read Before Building

The following files contain data that GEO files must stay in sync with:

```
apps/web/lib/brand.ts              ← brand name, tagline, domain, color
apps/web/app/api/checkout/route.ts ← pricing (Razorpay amounts in paise)
apps/web/components/pages/PricingPage.tsx ← tier feature lists
apps/web/lib/vaultData.ts          ← SEO vault prompt (id:'seo') — GEO engine
apps/web/app/api/learning/cycle/route.ts  ← auto-improvement loop to wire into
apps/web/lib/quota.ts              ← run/token limits per tier
```

Razorpay amounts are in paise (1 INR = 100 paise):
- Starter:  4900000 paise = ₹49,000/month
- Agency:  12000000 paise = ₹1,20,000/month
- Enterprise: contact sales

---

*Validated for NEXUS OS v11 · nexus-os.ai · India B2B Agency Market*
*Prompt framework: LLM-SEO Buyer Intent Mega Prompt v2.0 → Extended and validated to v2.999*
*Last validated: 2026-04-23 · Next validation due: before Step 3 execution*
