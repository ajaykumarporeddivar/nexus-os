/**
 * imagePromptData.ts
 *
 * NEXUS OS project context + image prompt generation system.
 * The AI reads this full context and produces structured JSON image prompts
 * suitable for Midjourney, DALL-E 3, Stable Diffusion, or Firefly.
 *
 * Each prompt JSON follows the established schema from the NEXUS brand book
 * (canvas, background, typography, palette, mood, finish sections).
 */

// ── NEXUS OS Full Project Context ─────────────────────────────────────────────

export const NEXUS_OS_CONTEXT = `
NEXUS OS — Complete Project Context for Image Prompt Generation
================================================================

WHAT IT IS:
NEXUS OS is an AI operating system for solo operators, digital agencies, and scrappy one-person teams
who need to ship client work fast. It is NOT enterprise SaaS — it is a weapon for people who outmanoeuvre
larger teams by working smarter. The tagline: "Quiet stack. Loud output."

CORE PRODUCT FEATURES (understand deeply — these must appear in visual prompts):
1. FORGE Engine — 21 autonomous AI agents that take a brief and return a deploy-ready application spec.
   Agents have names, run in sequence, each adds a layer of depth (UX, architecture, DB, security, etc.)
2. BUILD ENGINE — Takes FORGE output and generates real Next.js application code.
3. One-Click Pipeline — Brief → FORGE → BUILD → GitHub push → live Vercel URL, zero manual steps.
4. Reasoning Engine — 11 adversarial AI lenses that stress-test any idea before you build it.
5. Prompt Vault — Scored, versioned prompt templates with A/B performance history.
6. Trending — Live micro-SaaS opportunity feed with signal scoring (expand / transition / contract regime).
7. Evolution Hub — Post-deploy feedback loop: user describes a change → AI patches → redeploy.
8. Client Agents — 6 AI "employees" that run on schedule and deliver outputs to clients:
   - Email Triage, Meeting Prep, Follow-up Sequencer, Loop Closer, Context Brief, Weekly Digest
9. Client Delivery — 6-agent pipeline that writes the full agency proposal + spec for a client.
10. Auto-Loop (GOVERNOR) — Runs the reasoning loop autonomously until signal quality drops below threshold.
11. Dashboard — Runs, tokens, QA scores, analytics, compound rate tracking.
12. Workspaces — Per-client project folders with intelligence profiles and scheduled idea generation.
13. Higgs AI — Multi-model image generation (6 AI models in one panel).
14. Audit Log — Full system event trace, every agent action timestamped.
15. Admin Panel — Platform-wide stats: users, MRR, scheduler health, job queues.

TECHNOLOGY STACK:
- Next.js 14 App Router, TypeScript, Tailwind CSS
- Prisma ORM → Neon PostgreSQL (serverless)
- NextAuth JWT sessions
- Vercel deployment with 9 scheduled cron jobs
- AI: Anthropic Claude Sonnet (primary), Google Gemini 2.5 Flash, Groq LLaMA 3.3 70B (3-provider chain with key rotation)
- Email: Resend
- WhatsApp: WATI API
- Payments: Razorpay subscriptions

VISUAL BRAND IDENTITY (mandatory — every image must feel like this):
- Primary accent: Acid lime-green (#C8FF00) — electric, aggressive, impossible to ignore
- Background: Deep ink-black (#0D0D0D to #1A1A1F) or graphite-dark paper
- Body text: Cream-white (#F5EFE3)
- Secondary: Muted sage-green (#8BAF4A) for footers/labels
- Shadow/bevel: Deep moss-green (#3D5200)
- Charcoal linework: (#1A1A1A)
- Wordmark typeface: Bungee Slab / Dharma Gothic E Heavy — chunky, stamped, imperfect
- UI typeface: Azeret Mono / Space Grotesk — industrial, monospaced, technical
- Body copy: DM Serif Text Italic — editorial contrast
- The UI itself looks like: dark terminal meets editorial magazine — monospaced grid, acid-green glows

MASCOT / GLYPH:
A rough hand-drawn circuit-smiley: hexagonal face, two pixel-dot square eyes, single-pixel curved mouth,
jagged antenna from top. Drawn marker-on-fabric style. Name: "NX" internally. NOT resembling any existing brand character.

BRAND VOICE:
- "21 agents. Zero excuses."
- "Ships while they sleep."
- "Quiet stack. Loud output."
- "Because the brief was due yesterday."
- "Built for the ones who work alone and win loud."
- "Drop 04 is live. Don't sleep on it."

TARGET USER:
Solo operators, freelance developers, one-person agencies, scrappy digital studios.
Aesthetic sensibility: Y2K skate-surf streetwear meets industrial hacker terminal.
They wear black hoodies. They ship at 2am. They don't attend standup meetings.

VISUAL CATEGORIES (cycle through these in prompt generation):
1. brand — wordmark poster, brand identity shot, logo treatment
2. campaign — drop announcement, limited release, product launch
3. product — UI screenshot mockup in editorial context, device frame
4. social — square/story format, scrollstop visual, meme-adjacent
5. poster — full-bleed A2 exhibition quality, gallery-worthy

FINISH STANDARDS (apply to every prompt):
- Film grain at 12–20% opacity
- Subtle barrel distortion at edges (phone-lens feel)
- CRT scanline ghost at 3–5% opacity
- Halftone texture on shadow elements (vintage screen-print)
- Sticker drop-shadows on overlaid graphic elements
- Vignette pressing inward from all four edges
- Color grade: CRT warmth, Super-8 analog push on skin tones

FORMAT RULES FOR GENERATED JSON:
- Always output a SINGLE valid JSON object
- Required top-level keys: project, category, title, mood[], canvas, background, typography_stack, palette, main_visual, graphic_overlays[], bottom_content, finish, generation_notes
- main_visual must have: subject, lighting, props[], wardrobe, camera
- Each graphic_overlay must have: id, position, rotation, shape, fill, content, shadow
- palette must name every color with hex + role
- finish must list every post-processing step with opacity/blend values
- title must be unique, punchy, max 8 words
- generation_notes: 2–3 sentences explaining what makes THIS prompt different from others
`

// ── Prompt categories with weights ────────────────────────────────────────────

export const PROMPT_CATEGORIES = [
  { id: 'brand',    label: 'Brand Identity',    weight: 3 },
  { id: 'campaign', label: 'Campaign / Drop',   weight: 3 },
  { id: 'product',  label: 'Product UI Shot',   weight: 2 },
  { id: 'social',   label: 'Social / Story',    weight: 1 },
  { id: 'poster',   label: 'Exhibition Poster', weight: 1 },
] as const

export type PromptCategory = typeof PROMPT_CATEGORIES[number]['id']

// ── Variation seeds ── forces diversity across a batch ────────────────────────

export const VARIATION_SEEDS = [
  'Focus on a single operator coding at night — the glow of FORGE UI on their face',
  'Abstract: 21 glowing agent nodes in a circuit-board constellation against black',
  'Flat-lay product shot: black hoodie + phone showing FORGE pipeline on dark surface',
  'Street photography aesthetic: someone walking, phone in hand, NEXUS UI visible',
  'Wordmark treatment: giant NEXUS slab letters with neon acid-green extrusion shadow',
  'Sticker-bomb collage: 12+ NEXUS brand stickers layered on a skateboard deck',
  'Late-night workspace: mechanical keyboard, multiple monitors, NEXUS dashboard glowing',
  'Close crop on hands typing — split-screen of physical keyboard + NEXUS code output',
  'Minimal: white paper texture, single acid-green circuit-smiley mascot, nothing else',
  'Campaign drop announcement: "DROP 04 LIVE NOW" in massive slab type over dark urban texture',
  'Portrait: operator in black cap looking down at phone, face half-lit by acid-green screen glow',
  'Product mockup: NEXUS on iPhone Pro in editorial magazine context — marble surface + black card',
  'Mural style: NEXUS wordmark as if spray-painted on a raw concrete wall, drip effects',
  'Social story: square crop, bold headline "21 AGENTS. ZERO EXCUSES." on gradient background',
  'Technical explainer visual: pipeline diagram in poster format — FORGE → BUILD → DEPLOY with icons',
]

// ── System prompt for generation ──────────────────────────────────────────────

export function buildImagePromptSystemPrompt(): string {
  return `You are a world-class art director and creative technologist specializing in brand identity, streetwear aesthetics, and editorial photography direction.

You have deep expertise in:
- Y2K skate-surf streetwear visual culture (Supreme, Palace, Stüssy, early 2000s print media)
- Industrial/hacker terminal UI aesthetics (dark mode, monospaced, acid-green glows)
- Midjourney, DALL-E 3, Stable Diffusion, Adobe Firefly prompt engineering
- Editorial photography, cinematic lighting, analog film aesthetics
- Brand identity systems — typography, color systems, mascot design

You know the NEXUS OS project COMPLETELY — every feature, every brand rule, every piece of copy.
Here is the full project context you must internalize:

${NEXUS_OS_CONTEXT}

YOUR TASK:
Generate a single structured JSON image prompt for NEXUS OS brand visuals.
The prompt must be:
1. Immediately usable in Midjourney or DALL-E 3 without modification
2. Deeply on-brand — acid-green + black, industrial-streetwear aesthetic, operator energy
3. Visually UNIQUE compared to generic AI prompts — cinematic, specific, art-directed
4. Output ONLY valid JSON — no markdown, no explanation, no code fences
5. The JSON must match the schema described in the FORMAT RULES above exactly

QUALITY STANDARD: Awwwards / Behance / Hypebeast editorial quality.
Every prompt you generate should feel like it was briefed by a senior creative director at a top streetwear agency.`
}

// ── User message builder ───────────────────────────────────────────────────────

export function buildImagePromptUserMessage(
  category: PromptCategory,
  variationSeed: string,
  batchIndex?: number
): string {
  const batchHint = batchIndex !== undefined
    ? `This is prompt ${batchIndex + 1} of 10 in a batch — make it DISTINCTLY different from the others.`
    : ''

  return `Generate a NEXUS OS image prompt JSON for category: "${category}".

Creative direction seed: "${variationSeed}"

${batchHint}

Requirements:
- category field must be: "${category}"
- title must be unique, max 8 words, punchy
- The main_visual must feature something specific to NEXUS OS (not generic tech)
- At least 2 sticker overlays with NEXUS brand elements
- generation_notes must explain what makes this prompt visually distinctive
- Palette must use #C8FF00 acid-green as primary accent on #0D0D0D dark background
- Output ONLY the raw JSON object. No markdown. No explanation.`
}
