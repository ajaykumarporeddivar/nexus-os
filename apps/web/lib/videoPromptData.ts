/**
 * videoPromptData.ts
 *
 * Complete brief for the NEXUS OS UGC video prompt AI agent.
 * Produces 8-second shot-level JSON prompts compatible with the
 * Nano Banana video generation model.
 *
 * Expert stack baked in:
 *   - UGC Ad Strategist: hook/proof/CTA beat structure
 *   - Performance Media Buyer: 9:16, 40%+ 3s view-through KPIs
 *   - Nano Banana Model Engineer: shot schema, motion vectors, audio cues
 *   - SaaS Lead-Gen Expert: ICP pain hooks, conversion copy
 *   - Creative Director: visual language, talent direction, color/audio palette
 */

// ── Hook types & ICP targets ──────────────────────────────────────────────────

export const HOOK_TYPES = [
  { id: 'pain_point',    label: 'Pain Confession',   desc: '"I was spending 3 days on proposals…"' },
  { id: 'transformation',label: 'Transformation',    desc: 'Before → After in 8 seconds' },
  { id: 'social_proof',  label: 'Social Proof Shock',desc: '"21 AI agents just did this in 4 minutes"' },
  { id: 'curiosity',     label: 'Curiosity Gap',     desc: '"This thing runs while I sleep…"' },
  { id: 'before_after',  label: 'Before / After',    desc: 'Split-screen contrast, no words needed' },
  { id: 'demo_reveal',   label: 'Live Demo Reveal',  desc: 'Screen recording + reaction shot' },
] as const

export type HookType = typeof HOOK_TYPES[number]['id']

export const ICP_TARGETS = [
  { id: 'freelancer', label: 'Freelance Developer',    pain: 'drowning in client admin while trying to build' },
  { id: 'agency',     label: 'Small Agency Owner',     pain: 'team of 2 competing against agencies of 20' },
  { id: 'founder',    label: 'Solo SaaS Founder',      pain: 'can\'t afford to hire but need to move fast' },
  { id: 'operator',   label: '1-Person Operator',      pain: 'spending more time on briefs than actual work' },
] as const

export type ICPTarget = typeof ICP_TARGETS[number]['id']

// ── Nano Banana shot schema (TypeScript reference — mirrors the JSON output) ──

export interface NanoBananaShot {
  shot_id:         number
  start_time:      number        // seconds from 0
  end_time:        number
  duration:        number        // must equal end_time - start_time
  type:            'hook' | 'proof' | 'demo' | 'social_proof' | 'cta' | 'transition'
  scene: {
    environment:   string        // detailed physical location description
    background:    string        // what's behind the subject
    atmosphere:    string        // mood, time of day, lighting quality
  }
  character: {
    description:   string        // MUST be identical across all shots for coherence
    action:        string        // what they are physically doing
    expression:    string        // micro-expression, gaze direction
    body_position: string        // framing in frame
    wardrobe:      string        // consistent across shots
  }
  camera: {
    type:          string        // handheld | tripod | gimbal | drone | POV
    shot_size:     string        // extreme_close | close | medium | wide
    angle:         string        // eye_level | low_angle | high_angle | over_shoulder
    movement:      string        // static | push_in | pull_back | pan_left | pan_right | whip_pan | rack_focus | handheld_drift
    focal_length:  string        // wide_angle | normal | telephoto
    focus_rack?:   string        // if rack focus: "from X to Y"
  }
  lighting: {
    primary:       string        // key light source and direction
    fill:          string        // fill light quality
    accent:        string        // rim or practical lights
    color_grade:   string        // warm | cool | neutral | high_contrast | desaturated
    screen_glow?:  string        // if phone/monitor present: glow color + direction
  }
  audio: {
    voiceover:     string        // exact spoken line for this shot (or "" if silent)
    sfx:           string[]      // sound effect cues e.g. ["notification_ping", "keyboard_clatter"]
    music_mood:    string        // lo_fi_chill | drill_beat | ambient_tension | silence | upbeat_trap
    music_volume:  'bg' | 'mid' | 'up'   // background / mid-level / up front
  }
  text_overlay: {
    enabled:       boolean
    text:          string        // caption or hook text (TikTok-style)
    style:         string        // bold_white_caption | acid_green_glitch | minimal_bottom | none
    position:      string        // top_third | center | bottom_third | bottom_safe
    animation:     string        // pop_in | fade_in | typewriter | slide_up | none
  }
  motion_keywords: string[]      // Nano Banana motion vectors: e.g. ["slight_camera_drift", "blink", "phone_tilt"]
  transition_to_next: string     // cut | smash_cut | whip_pan | dissolve | match_cut | jump_cut | none
}

export interface NanoBananaVideoPrompt {
  // ── Meta ──
  model_target:        'nano_banana'
  format:              'ugc_ad'
  version:             '1.0'
  project:             'NEXUS OS'

  // ── Brief ──
  title:               string
  hook_type:           HookType
  platform:            'tiktok' | 'reels' | 'shorts' | 'all'
  aspect_ratio:        '9:16'
  duration_seconds:    8
  target_icp:          ICPTarget
  pain_point:          string
  unique_selling_point:string
  conversion_goal:     string    // what action the viewer takes after watching

  // ── Talent brief ──
  talent: {
    persona:           string    // who is the UGC creator in this video
    appearance:        string    // consistent physical description for all shots
    wardrobe:          string    // outfit — consistent across shots
    energy:            string    // acting direction: authentic | excited | frustrated | calm_confident
  }

  // ── Shot list (3–4 shots summing to 8s) ──
  shots:               NanoBananaShot[]

  // ── Full VO script ──
  voiceover_script: {
    full_text:         string    // complete spoken words across all 8 seconds
    tone:              string    // conversational | confessional | excited | authoritative
    pacing:            string    // fast (120-150wpm) | medium (100-120wpm) | slow (80-100wpm)
    hook_line:         string    // first spoken line — must hook in <2s
    cta_line:          string    // final spoken CTA
  }

  // ── Performance targets ──
  performance: {
    hook_rate_target:  string    // "40%+ 3-second view-through"
    cta_position:      string    // "6.5 seconds"
    caption_style:     string    // TikTok auto-caption compatible
    thumb_stop_frame:  number    // which second has the thumb-stopping visual
  }

  // ── Lead gen metadata ──
  lead_strategy: {
    awareness_level:   'problem_aware' | 'solution_aware' | 'product_aware' | 'unaware'
    funnel_stage:      'tofu' | 'mofu' | 'bofu'
    ad_angle:          string
    objection_handled: string    // which common objection this video pre-empts
    follow_up_hook:    string    // what the viewer searches/DMs after watching
  }

  // ── A/B variant info ──
  ab_variant:          'A' | 'B' | 'C'
  generation_notes:    string    // what makes this prompt unique + expected conversion mechanic
}

// ── Full NEXUS OS context ─────────────────────────────────────────────────────

const NEXUS_OS_VIDEO_CONTEXT = `
NEXUS OS — Complete Context for UGC Video Ad Prompt Generation
==============================================================

PRODUCT: NEXUS OS is an AI operating system for solo operators and scrappy one-person agencies.
Tagline: "Quiet stack. Loud output." / "21 agents. Zero excuses."

CORE VALUE PROPS (ranked by conversion power for UGC ads):
1. FORGE Engine — brief in → deploy-ready app spec out. 21 AI agents, runs in 3-5 minutes.
   UGC hook: "I gave it a 2-sentence brief and got a 40-page technical spec in 4 minutes"
2. Client Agents — 6 AI "employees" that deliver reports to your clients automatically.
   UGC hook: "My AI employee sent my client a full weekly report while I was at the gym"
3. One-Click Pipeline — Brief → code → live URL. Zero manual steps between idea and deployed app.
   UGC hook: "I deployed a client's SaaS app in 47 minutes. No team. Just this."
4. Client Delivery — Proposal + spec + analysis in 6 agents.
   UGC hook: "Stop writing proposals manually. This writes them for you."
5. Weekly Digest — Automated client reports delivered on schedule.
   UGC hook: "My client thinks I have a team. It's just this tool and me."

ICP PAIN MOMENTS (use as hook scripts):
- "I was up until 2am writing a proposal that the client ghosted anyway"
- "I lost a ₹5 lakh project because my spec took 3 days and theirs took 1"
- "I can't scale because I spend 60% of my time on admin not actual building"
- "I had to say no to a client because I didn't have bandwidth — with AI I never say no"
- "I looked at my competitor's output and they had a team of 8. I have NEXUS OS."

PRICING ANCHOR (use in CTA): Drop 04 live now. Agency plan. Works immediately.

VISUAL LANGUAGE FOR VIDEO:
- Dark room / late night setup = relatable operator environment
- Phone screen with FORGE UI glowing acid-green = product hero shot
- Typing fast → cut to output appearing = before/after reveal
- Delivery ping notification = result moment (dopamine hit for viewer)
- Face reaction (genuine surprise/satisfaction) = social proof beat
- Comparison: competitor workflow (messy, complex) vs NEXUS (clean, fast) = transformation

NANO BANANA MODEL REQUIREMENTS (CRITICAL — follow exactly):
1. character.description MUST be IDENTICAL in every shot (model uses this for temporal coherence)
2. motion_keywords are the primary driver of motion quality — be specific:
   ["subtle_breathing", "finger_swipe_up", "head_tilt_left", "phone_screen_flicker"]
3. Each shot duration must be a clean number: 1.5, 2.0, 2.5, 3.0 (no sub-0.5 increments)
4. Shot durations MUST sum to exactly 8.0 seconds
5. sfx arrays use underscore format: "notification_ping", "keyboard_clatter", "whoosh_transition"
6. camera.movement must be one of the exact enum values — no custom strings
7. text_overlay.style must be: bold_white_caption | acid_green_glitch | minimal_bottom | none
8. transition_to_next on the final shot must be: "none"
9. Always include 3–4 shots (not 2, not 5)
10. music_mood affects the entire feel — choose carefully for the hook_type

CONVERSION COPY PRINCIPLES:
- Hook line must state the pain OR the result in ≤8 words
- Never mention price in the first 5 seconds
- Use "I" language (first person UGC) not "you" or "we"
- Social proof = specific numbers ("21 agents", "4 minutes", "47 minutes to deploy")
- CTA must be low friction: "Link in bio" or "Try it free" not "Sign up for enterprise"
`

// ── System prompt ─────────────────────────────────────────────────────────────

export function buildVideoPromptSystemPrompt(): string {
  return `You are a world-class UGC ad creative director, performance marketer, and Nano Banana video generation model expert.

Your expertise spans:
- UGC ad strategy: hook/proof/CTA beat structure, 8-second format optimization
- Performance marketing: TikTok/Reels/Shorts creative, 40%+ hook rate engineering
- Nano Banana video model: precise shot schemas, motion vector keywords, temporal coherence requirements
- SaaS lead generation: ICP targeting, pain-point copy, funnel-stage creative
- Conversion copywriting: scroll-stopping hooks, objection handling, low-friction CTAs

You know NEXUS OS completely. Here is the full context:

${NEXUS_OS_VIDEO_CONTEXT}

YOUR TASK:
Generate a single Nano Banana-compatible 8-second UGC video prompt JSON for NEXUS OS.

CRITICAL FORMAT RULES:
1. Output ONLY valid JSON — no markdown fences, no explanation text
2. Top-level key must be: model_target: "nano_banana"
3. shots[] array must have 3–4 shots summing to EXACTLY 8.0 seconds
4. character.description must be WORD-FOR-WORD IDENTICAL in every shot
5. motion_keywords must be specific underscore_case descriptors (minimum 3 per shot)
6. voiceover_script.full_text must match the sum of all shot voiceover lines exactly
7. All duration values must be multiples of 0.5
8. Final shot transition_to_next must be "none"
9. lead_strategy and performance blocks are mandatory
10. generation_notes: 2–3 sentences on conversion mechanic and what makes this unique

QUALITY BAR: This prompt must produce a video that stops the scroll in frame 1,
builds desire by frame 240, and drives a profile visit or link click by frame 480.
Every creative decision must serve conversion. Output ONLY the raw JSON object.`
}

// ── User message builder ──────────────────────────────────────────────────────

export function buildVideoPromptUserMessage(
  hookType:  HookType,
  icpTarget: ICPTarget,
  seed:      string,
  batchIndex?: number
): string {
  const icp   = ICP_TARGETS.find(i => i.id === icpTarget)!
  const hook  = HOOK_TYPES.find(h => h.id === hookType)!
  const batch = batchIndex !== undefined
    ? `This is prompt ${batchIndex + 1} of 10 — make it DISTINCTLY different from others in this batch.`
    : ''

  return `Generate a NEXUS OS 8-second UGC video prompt JSON for Nano Banana.

Hook type: "${hookType}" — ${hook.desc}
Target ICP: "${icpTarget}" — ${icp.label} who is ${icp.pain}
Creative seed: "${seed}"
${batch}

Requirements:
- hook_type field: "${hookType}"
- target_icp field: "${icpTarget}"
- 3–4 shots summing to exactly 8.0 seconds
- character.description identical across ALL shots
- motion_keywords: minimum 3 specific underscore_case descriptors per shot
- voiceover hook line must reference a specific NEXUS OS feature or result
- CTA must appear at or after 6.5 seconds
- lead_strategy.funnel_stage must be appropriate for this hook type
- ab_variant: randomly assign A, B, or C
- Output ONLY raw JSON. No markdown. No explanation.`
}

// ── Variation seeds ───────────────────────────────────────────────────────────

export const VIDEO_SEEDS = [
  'Freelancer at cluttered desk, 2am, client deadline tomorrow, discovers FORGE',
  'Agency owner on phone with client, casually mentions AI delivered the weekly report',
  'Split-screen: competitor manually writing proposal vs NEXUS pipeline running',
  'Founder reacts to seeing deploy URL go live while holding coffee cup',
  'Close-up of phone screen: FORGE 21 agents running with acid-green progress bar',
  'Developer looks exhausted, opens NEXUS, face transforms to calm confidence',
  'Creator records themselves as "client" receiving automated weekly digest email',
  'Hands-only video: brief typed → 4-minute timer → spec document appearing',
  'Late-night desk: multiple client tabs open, one NEXUS tab closes them all',
  'Reaction video: scrolling competitor pricing page vs NEXUS agency plan',
  'Walking outside, checking phone, getting notified client report was auto-delivered',
  'Before: 3-day proposal timeline on whiteboard. After: 4-minute FORGE timer',
  'Fake "team meeting" reveal: it is just one person and a NEXUS dashboard',
  'Client Slack message "this brief is incredible" — reveal: AI wrote it',
  'Typing brief into FORGE, cutting to finished spec, then to live URL — 47 seconds',
]
