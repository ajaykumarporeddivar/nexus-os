/**
 * POST /api/content/generate
 *
 * Given a completed pipeline run (projectName, brief, vertical, qaScore, liveUrl),
 * generates a full distribution content pack:
 *   - 5 X posts (hook + thread)
 *   - 1 LinkedIn article post
 *   - 1 Reddit post (r/SaaS or r/entrepreneur)
 *   - 1 WhatsApp/community message
 *
 * Persists each as a ContentItem row linked to the SharedRun.
 * Returns the full content pack.
 *
 * Auth required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/authOptions'
import { prisma }                    from '@/lib/prisma'
import { aiComplete }                from '@/lib/ai'

interface ContentPack {
  xThread:     string   // multi-tweet thread (numbered 1/ 2/ etc.)
  xSingle:     string   // single punchy tweet for standalone posting
  linkedin:    string   // full LinkedIn post
  reddit:      string   // Reddit post body (r/SaaS)
  community:   string   // WhatsApp/Slack/Discord message
  hook:        string   // the single best opening line across all content
}

async function generateContentPack(opts: {
  projectName: string
  brief:       string
  vertical:    string
  qaScore:     number | null
  elapsedSec:  number | null
  agentCount:  number
  liveUrl?:    string
  shareUrl?:   string
}): Promise<ContentPack> {
  const elapsed = opts.elapsedSec
    ? opts.elapsedSec >= 60
      ? `${Math.floor(opts.elapsedSec / 60)} minutes`
      : `${opts.elapsedSec} seconds`
    : 'minutes'

  const scoreStr = opts.qaScore ? `${opts.qaScore.toFixed(1)}/10` : null
  const link     = opts.shareUrl ?? opts.liveUrl ?? ''

  const system = `You are a world-class growth marketer for AI-native developer tools.
You write viral, authentic social content that drives real signups — not hype.
Your content is specific, shows proof, and makes the reader feel like they're missing out.
You never use generic phrases like "game-changer", "revolutionary", or "the future is here".
Write in first person. Sound like a founder sharing a genuine win.`

  const prompt = `Generate a complete distribution content pack for this AI-built app:

PROJECT: ${opts.projectName}
BRIEF: ${opts.brief.slice(0, 300)}
VERTICAL: ${opts.vertical}
BUILT BY: ${opts.agentCount} AI agents${elapsed ? ` in ${elapsed}` : ''}
QA SCORE: ${scoreStr ?? 'not scored'}
LIVE URL: ${link || 'pending'}

Return ONLY valid JSON matching this exact structure (no markdown, no extra text):
{
  "xThread": "1/ [hook line]\\n\\n2/ [what the pipeline did specifically]\\n\\n3/ [what 23 agents actually built — spec, code, deploy]\\n\\n4/ [the result — QA score, time, what's live]\\n\\n5/ [CTA — link + call to try it]",
  "xSingle": "[Single punchy tweet, max 240 chars, include the link]",
  "linkedin": "[Full LinkedIn post, 150-250 words. Professional but genuine. Structure: opening hook, what was built, how the pipeline works, result, CTA. No hashtag spam — max 3 relevant tags at end.]",
  "reddit": "[Reddit post for r/SaaS. Title on first line starting with TITLE:, then body. 100-150 words. Honest, not promotional. Focus on the process and what was learned. Link at end.]",
  "community": "[Short WhatsApp/Discord/Slack message, 2-3 sentences, casual. Share the win and the link.]",
  "hook": "[The single best opening line — could be used as the first line of any post]"
}`

  const result = await aiComplete({
    system,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2000,
    fastMode: false,
  })

  const match = result.text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in AI response')
  return JSON.parse(match[0]) as ContentPack
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId  = (session?.user as { id?: string } | null)?.id
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    projectName: string
    brief:       string
    vertical?:   string
    qaScore?:    number | null
    elapsedSec?: number | null
    agentCount?: number
    liveUrl?:    string
    shareSlug?:  string
  }

  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.projectName || !body.brief) {
    return NextResponse.json({ ok: false, error: 'projectName and brief required' }, { status: 400 })
  }

  const baseUrl  = process.env.NEXTAUTH_URL ?? 'https://web-xi-vert-58.vercel.app'
  const shareUrl = body.shareSlug ? `${baseUrl}/s/${body.shareSlug}` : undefined

  let pack: ContentPack
  try {
    pack = await generateContentPack({
      projectName: body.projectName,
      brief:       body.brief,
      vertical:    body.vertical ?? 'saas',
      qaScore:     body.qaScore    ?? null,
      elapsedSec:  body.elapsedSec ?? null,
      agentCount:  body.agentCount ?? 23,
      liveUrl:     body.liveUrl,
      shareUrl,
    })
  } catch (err) {
    console.error('[content/generate]', err)
    return NextResponse.json({ ok: false, error: 'Content generation failed' }, { status: 500 })
  }

  // Persist all 5 content items
  const sharedRunId = body.shareSlug
    ? (await prisma.sharedRun.findUnique({ where: { slug: body.shareSlug }, select: { id: true } }))?.id ?? null
    : null

  const items = [
    { platform: 'x_thread',  content: pack.xThread,   hook: pack.hook },
    { platform: 'x_single',  content: pack.xSingle,   hook: pack.xSingle.slice(0, 80) },
    { platform: 'linkedin',  content: pack.linkedin,  hook: pack.linkedin.split('\n')[0]?.slice(0, 100) ?? '' },
    { platform: 'reddit',    content: pack.reddit,    hook: pack.reddit.split('\n')[0]?.replace('TITLE:', '').trim().slice(0, 100) ?? '' },
    { platform: 'community', content: pack.community, hook: pack.community.slice(0, 80) },
  ]

  await prisma.contentItem.createMany({
    data: items.map(item => ({
      userId,
      sharedRunId,
      platform:   item.platform,
      content:    item.content,
      hook:       item.hook ?? null,
    })),
  })

  return NextResponse.json({ ok: true, pack })
}
