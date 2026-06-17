import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { aiComplete } from '@/lib/ai'

export const runtime     = 'nodejs'
export const maxDuration = 60
export const dynamic     = 'force-dynamic'

const POST_STYLES = [
  { id: 'cold-open',        label: 'Cold Open',          badge: 'Pattern interrupt',       trigger: "Blunt truth, zero build-up. Three short declarative sentences that force the reader to agree before you've asked for anything." },
  { id: 'math-post',        label: 'The Math Post',      badge: 'Logical buyer trigger',   trigger: 'Numbers-first, zero emotion. Side-by-side cost breakdown — old consulting route vs NEXUS OS. Data makes the argument.' },
  { id: 'contrarian',       label: 'Contrarian Take',    badge: 'High share potential',    trigger: 'Challenge the default assumption. Feel productive vs. be productive. Quotable line that travels on its own.' },
  { id: 'question',         label: 'Question Post',      badge: 'Comment driver',          trigger: 'One uncomfortable question for founders. End with Genuinely curious — turns the comment section into a lead list.' },
  { id: 'manifesto',        label: "Builder's Manifesto", badge: 'Deep resonance',         trigger: 'First principles, values-led. If you share this belief is an identity invitation. Attracts followers who share your worldview.' },
  { id: 'technical',        label: 'Technical Breakdown', badge: 'Technical ICP magnet',   trigger: 'Engineer-to-engineer. Name the layers, agent counts, quality gates. Transforms 23 agents from marketing into real architecture.' },
  { id: 'opportunity-cost', label: 'Opportunity Cost',   badge: 'Urgency without pressure', trigger: 'Reframe the real price of waiting. Month-by-month timeline makes the cost of the old approach visceral.' },
  { id: 'outcome-first',    label: 'Outcome Not Tool',   badge: 'Non-technical founder pull', trigger: '"You don\'t need to understand how it works." Concrete outcome first, features last. Remove intimidation.' },
  { id: 'quiet-confidence', label: 'Quiet Confidence',   badge: 'Premium positioning',     trigger: 'Understatement. "No pitch. No urgency. No limited time." Openly names and rejects every manipulation tactic.' },
  { id: 'direct-offer',     label: 'Direct Offer',       badge: 'Highest conversion',      trigger: '"Tell me what you\'re building. That\'s all." Lowest-friction CTA. Position as the person being selective.' },
  { id: 'no-hype',          label: 'No Hype',            badge: 'Strongest trust signal',  trigger: '"I don\'t do hype. I build systems." Pattern interrupt. Draws in serious readers, filters casual scrollers.' },
  { id: 'not-for-everyone', label: 'Not For Everyone',   badge: 'High ICP filter',         trigger: 'Anti-hype positioning. "It\'s not for people who collect AI tools without using them." Disqualifies wrong audience.' },
  { id: 'frustration-origin', label: 'Frustration Origin', badge: 'Credibility + story',  trigger: '"Built out of frustration, not ambition." More believable than opportunity-spotting. Shows firsthand problem experience.' },
  { id: 'small-group',      label: 'Small Group Invite', badge: 'Warm lead magnet',        trigger: '"I\'m looking for a few serious people. Not the most. Just the right ones." Selectivity attracts quality.' },
  { id: 'time-money',       label: 'Time & Money',       badge: 'Core value statement',    trigger: 'Two things founders don\'t get back. Close with "Time. Results. No noise." — becomes a values signal.' },
]

const SYSTEM_PROMPT = `You are a world-class founder content writer. You write honest, no-hype, direct posts for NEXUS OS — an AI delivery infrastructure for digital agencies.

NEXUS OS facts (use these precisely):
- 23 specialized AI agents run in sequence (FORGE → BUILD → DEPLOY)
- One prompt generates: product strategy, architecture, backend scaffold, security audit, QA, GTM strategy, deployment
- Internal quality gates score every output — auto-rebuilds anything below threshold
- Equivalent to $15K–$50K consulting engagement, done in minutes
- Free to try
- Built by Ajay Kumar Poreddi (India-based, solo builder)

Voice rules:
- Never say: "game-changer", "revolutionary", "you won't believe", "limited time", "act now", "insane results"
- Always: direct, specific, honest, no performance
- Write like a builder who shares what they built — not like a marketer
- Short paragraphs. White space. No fluff.
- End every post with the contact details provided

Output format — return ONLY valid JSON, nothing else:
{
  "title": "Post title describing the style",
  "style": "one-line style description",
  "body": "full post body text (use \\n for newlines)",
  "score": 9.4,
  "metrics": [
    { "label": "Trust", "score": 9.5 },
    { "label": "Clarity", "score": 9.3 },
    { "label": "CTA pull", "score": 9.4 },
    { "label": "Hook", "score": 9.2 }
  ],
  "psychology_tip": "one insight about why this post works psychologically (2-3 sentences)"
}`

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const { styleId, contactUrl, contactWhatsApp, count = 1 } = await req.json().catch(() => ({})) as {
    styleId?: string
    contactUrl?: string
    contactWhatsApp?: string
    count?: number
  }

  // Pick styles to generate
  let stylesToGenerate = POST_STYLES
  if (styleId && styleId !== 'random') {
    const found = POST_STYLES.find(s => s.id === styleId)
    stylesToGenerate = found ? [found] : POST_STYLES
  } else {
    // Random — pick `count` distinct styles
    const shuffled = [...POST_STYLES].sort(() => Math.random() - 0.5)
    stylesToGenerate = shuffled.slice(0, Math.min(count, 5))
  }

  const url    = contactUrl      || 'https://nexus-os.vercel.app'
  const phone  = contactWhatsApp || '+91 8919843305'

  const results = []
  for (const style of stylesToGenerate) {
    const userPrompt = `Write a NEXUS OS founder community post in the following style:

STYLE: ${style.label}
BADGE: ${style.badge}
TECHNIQUE: ${style.trigger}

Contact URL to include: ${url}
WhatsApp to include: ${phone}

Generate a high-scoring (9.0+) post in this exact style. The post should feel authentic, direct, and completely non-salesy. Include the URL and WhatsApp at the natural end of the post.`

    try {
      const { text } = await aiComplete({
        system:    SYSTEM_PROMPT,
        messages:  [{ role: 'user', content: userPrompt }],
        modelTier: 'fast',
        maxTokens: 1200,
      })

      // Extract JSON — strip markdown fences, then sanitize raw control chars
      // that Groq sometimes emits as literal bytes inside string values
      const raw = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```\s*$/m, '').trim()
      // Walk char-by-char: inside JSON strings replace bare control chars with escapes
      let jsonStr = ''
      let inStr = false
      let escaped = false
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i]
        if (escaped) { jsonStr += ch; escaped = false; continue }
        if (ch === '\\' && inStr) { jsonStr += ch; escaped = true; continue }
        if (ch === '"') { inStr = !inStr; jsonStr += ch; continue }
        if (inStr) {
          if (ch === '\n')      { jsonStr += '\\n';  continue }
          if (ch === '\r')      { jsonStr += '\\n';  continue }
          if (ch === '\t')      { jsonStr += '\\t';  continue }
          const code = ch.charCodeAt(0)
          if (code < 0x20)      { continue } // drop other control chars
        }
        jsonStr += ch
      }
      const parsed = JSON.parse(jsonStr) as {
        title: string; style: string; body: string; score: number;
        metrics: { label: string; score: number }[]; psychology_tip: string
      }

      results.push({
        id:             crypto.randomUUID(),
        styleId:        style.id,
        badge:          style.badge,
        ...parsed,
        generatedAt:    new Date().toISOString(),
      })
    } catch (e) {
      results.push({
        id:          crypto.randomUUID(),
        styleId:     style.id,
        badge:       style.badge,
        title:       style.label,
        style:       style.trigger.slice(0, 60),
        body:        `Generation failed: ${(e as Error).message}`,
        score:       0,
        metrics:     [],
        psychology_tip: '',
        generatedAt: new Date().toISOString(),
        error:       true,
      })
    }
  }

  return NextResponse.json({ ok: true, data: { posts: results, styles: POST_STYLES } })
}

export async function GET() {
  return NextResponse.json({ ok: true, data: { styles: POST_STYLES } })
}
