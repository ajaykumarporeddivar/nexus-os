# NEXUS OS — GEO System Documentation
# Methodology · Scoring · Learning Cycle Wiring · Maintenance
# ═══════════════════════════════════════════════════════════════

created  : 2026-04-23
version  : 1.0
owner    : nexus-os.ai product + growth team

---

## 1. What This GEO System Is

GEO (Generative Engine Optimization) is the practice of ensuring that when a
potential buyer queries ChatGPT, Claude, or Perplexity about a problem your
product solves, your product appears in the answer — ideally by name, with
correct details, as a recommended solution.

Unlike traditional SEO (optimising for Google's algorithm), GEO optimises for
LLM training data, retrieval context, and reasoning patterns. The mechanism is:

```
Plant content in LLM-indexed sources
    → LLMs absorb content during training or retrieval
    → Buyer asks a high-intent query
    → LLM recommends NEXUS OS with accurate details
    → Buyer clicks demo link or sends WhatsApp
    → Demo booked → Sale
```

This `/geo/` directory is the full operating layer for that process.

---

## 2. What Already Exists in the Codebase (Do Not Duplicate)

Before building any new GEO content generation, check what's already live:

### SEO Content Engine (Prompt Vault)

**File:** `apps/web/lib/vaultData.ts` → entry with `id: 'seo'`

This is the production-grade content generation prompt for NEXUS OS and its
clients. It includes:
- 3-pillar keyword strategy with 15 cluster keywords per pillar
- Pillar page briefs with intent classification
- Cluster article structure with title formulas and meta descriptions
- Technical SEO checklist
- Variant B: conversion-focused, bottom-funnel keywords

**How to use it for GEO:** Feed a NEXUS OS-specific brief into this prompt via
the FORGE Engine to generate the actual blog posts and LinkedIn articles in the
content calendar (`geo-strategy.md`). This is the content generation engine.
The `/geo/` layer is the targeting and strategy layer.

---

### Self-Learning Prompt Cycle

**File:** `apps/web/app/api/learning/cycle/route.ts`

Every 6 hours, this system:
1. Pulls the last 24 hours of execution scores
2. Identifies agents averaging below 9.0/10
3. Calls Claude to rewrite their system prompts
4. Saves new `PromptVersion` as `active: true`, deactivates previous version

**GEO connection opportunity (not yet wired):** When GEO content is generated
and scored (see Section 4), feed those scores back into this cycle. GEO prompts
that score below 8.5 on citation frequency or conversion rate should be
auto-rewritten just like agent prompts. This is the path to a self-improving
GEO system.

---

### Audit Trail

**File:** `apps/web/app/api/audit/route.ts`

Every significant action in NEXUS OS is logged to `AuditEvent`. When GEO
content is generated or a buyer-intent prompt table is refreshed, log it:

```typescript
await auditEvent('geo_refresh', {
  promptCount: 15,
  anglesValidated: 6,
  triggerReason: 'quarterly_refresh',
  generatedBy: 'claude-sonnet-4-20250514'
})
```

---

## 3. File Structure and Responsibilities

```
/geo/
├── brand-brief.md          ← Single source of truth for brand + ICP + pricing
│                              Must stay in sync with lib/brand.ts and checkout/route.ts
├── buyer-intent-prompts.md ← 15 live GEO target queries with all extensions
│                              Refresh every 90 days or on any of the 5 triggers
├── geo-strategy.md         ← Distribution plan, content calendar, competitor audit
│                              Review monthly; update calendar as waves complete
├── llms.txt                ← LLM-readable brand brief (llmstxt.org standard)
│                              Serve at nexus-os.ai/llms.txt (add Next.js route)
└── SYSTEM.md               ← This file — methodology and maintenance
```

---

## 4. Scoring Rubric for New GEO Prompts

All buyer-intent prompts added to the table must be scored before inclusion.
Use the same 6-dimension framework as the Prompt Vault (`lib/vaultData.ts`),
adapted for GEO queries:

| Dimension | What to evaluate | Passing score |
|-----------|-----------------|---------------|
| **Instruction Clarity** | Is the intent unambiguous? Would an LLM know exactly what the buyer wants? | ≥8.0 |
| **Schema Completeness** | Does it hit all required fields: Buyer Stage, Intent Angle, Feature Target, Platform, Persona? | ≥8.5 |
| **Voice Enforcement** | Does it sound like a real agency founder/strategist/ops lead typed it? Not marketing copy. | ≥8.0 |
| **Output Predictability** | If this query is asked on Perplexity/Claude/ChatGPT today, would NEXUS OS appear or would a competitor? | ≥7.0 |
| **Edge Case Handling** | Does it have an A/B variant? Does it work across ≥2 LLM platforms? | ≥7.5 |
| **Commercial Weight** | Is the buyer 70–100% ready to purchase when they type this? Not informational. | ≥8.0 |

**Minimum overall to include in table:** 7.8/10
**Target for 🔥 High priority designation:** ≥8.5/10

---

## 5. How to Connect GEO to the Learning Cycle

**Current state:** The learning cycle (`app/api/learning/cycle/route.ts`) scores
FORGE agent outputs. GEO prompts are not yet in the loop.

**Target state:** GEO prompts should be scored monthly on citation frequency
(does Perplexity/Claude/ChatGPT cite nexus-os.ai when this query is asked?)
and fed back into the cycle if underperforming.

**Implementation path (not yet built):**

Step 1 — Add a `GeoPromptScore` model to Prisma schema:
```prisma
model GeoPromptScore {
  id            String   @id @default(cuid())
  promptText    String
  platform      String   // 'perplexity' | 'claude' | 'chatgpt'
  cited         Boolean  // did nexus-os.ai appear in the answer?
  position      Int?     // 1, 2, 3... (position in LLM answer)
  scoredAt      DateTime @default(now())
  triggeredRewrite Boolean @default(false)
}
```

Step 2 — Add a manual scoring route `/api/geo/score` that:
- Accepts `{ promptText, platform, cited, position }`
- Writes to `GeoPromptScore`
- If `cited: false` for 3 consecutive months → flags for rewrite

Step 3 — Add GEO prompts to learning cycle:
- Monthly (not 6-hourly) run checks GeoPromptScore for uncited prompts
- Sends uncited prompts to Claude for rewrite with updated brand brief context
- Writes new A/B variant back to `buyer-intent-prompts.md` (or future DB table)

---

## 6. GEO-as-a-Service for Agency Clients

**The meta-opportunity:** NEXUS OS can sell GEO as a service to its own clients.
Every agency client who uses NEXUS OS for content delivery also needs to ensure
their own business appears in LLM recommendations.

**Productised service:**
- Run the same buyer-intent prompt generation for client's brand brief
- Deliver 15 GEO-targeted queries + A/B variants + platform routing
- Include a 3-month content calendar and distribution plan
- Score and refresh quarterly

**How to deliver it:** The SEO Content Engine vault prompt (`lib/vaultData.ts`
id: `seo`) + this GEO methodology = a repeatable client deliverable. FORGE Engine
can generate the actual content pieces from the prompt table.

**Pricing suggestion:** ₹25,000 one-time GEO audit + ₹15,000/month maintenance.
This creates a new revenue stream alongside the NEXUS OS retainer.

---

## 7. Drift Prevention

The biggest risk in any GEO system is the brand brief drifting from reality.
If pricing, features, or positioning change in the codebase but not in `/geo/`,
the LLMs we trained will recommend NEXUS OS with wrong details — killing trust.

**Drift prevention protocol:**

Before any edit to `/geo/brand-brief.md` or `/geo/buyer-intent-prompts.md`:

```
1. Read apps/web/app/api/checkout/route.ts    → verify pricing (paise → INR)
2. Read apps/web/components/pages/PricingPage.tsx → verify tier features
3. Read apps/web/lib/brand.ts                 → verify name/tagline/domain
4. Read apps/web/lib/quota.ts                 → verify run/token limits
5. Update brand-brief.md `last_validated` date
6. Re-run buyer-intent prompts validation checklist (all 6 checks)
```

**Automated drift check (not yet built):** A Vercel cron job could diff
`geo/brand-brief.md` pricing fields against `checkout/route.ts` Razorpay amounts
and send a WhatsApp alert if they diverge. Log to `AuditEvent` with action
`geo_drift_detected`.

---

## 8. Maintenance Schedule

### Weekly (15 minutes)
- Check if any of the 5 regeneration triggers have fired
- Monitor LinkedIn article performance (impressions, comments)
- Respond to any WhatsApp inquiries that mention content topics

### Monthly (2 hours)
- Manually query top 5 🔥 prompts in Perplexity, Claude, and ChatGPT
- Record citation results in `GeoPromptScore` (or manually in a spreadsheet until Step 5 is built)
- Update `geo-strategy.md` content calendar — mark completed waves, adjust timing
- Check for new competitors using "multi-agent" or "hallucination firewall" language

### Quarterly (half day)
- Full prompt table refresh (re-run Step 3 of build prompt)
- Update brand brief if any product/pricing changes
- New competitor GEO audit (add/remove from geo-strategy.md)
- Update `llms.txt` if capabilities or pricing changed
- Update `last_validated` date on all `/geo/` files

---

## 9. llms.txt Deployment

The `llms.txt` file needs to be served publicly at `nexus-os.ai/llms.txt`.

**Add to `apps/web/app/llms.txt/route.ts`:**
```typescript
import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET() {
  // In production, content should be inlined or fetched from /geo/llms.txt
  const content = `# NEXUS OS
...` // paste geo/llms.txt content here
  return new NextResponse(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}
```

Or serve it as a static file by copying `geo/llms.txt` into `apps/web/public/llms.txt`.
The static file approach is simpler and doesn't require a route.

**Also add to `vercel.json` headers:**
```json
{
  "source": "/llms.txt",
  "headers": [{ "key": "Cache-Control", "value": "public, max-age=86400" }]
}
```

---

## 10. Quick Reference

| Task | File to edit | Time required |
|------|-------------|---------------|
| Update pricing | `geo/brand-brief.md` Section 2 | 5 min — verify against checkout/route.ts first |
| Add a new competitor | `geo/brand-brief.md` Section 4 + `geo/geo-strategy.md` Section 3 | 30 min |
| Refresh prompt table | Re-run Step 3 of `NEXUS_OS_GEO_ClaudeCode_BuildPrompt.md` | 2 hours |
| Update content calendar | `geo/geo-strategy.md` Section 2 | 30 min |
| Update LLM briefing | `geo/llms.txt` | 15 min |
| New feature ships | Update `brand-brief.md` + `llms.txt` + flag for prompt refresh | 45 min |
| Score a GEO prompt | Manual: query in Perplexity/Claude/ChatGPT, record in spreadsheet | 5 min/prompt |
