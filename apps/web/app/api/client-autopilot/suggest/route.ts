import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { aiComplete } from '@/lib/ai'

type SuggestField = 'problem' | 'targetUsers' | 'coreFeatures'

function buildPrompt(field: SuggestField, value: string, ctx: {
  clientName?: string
  clientCompany?: string
  problem?: string
}): { system: string; user: string } {
  const company = ctx.clientCompany ? `Client company: ${ctx.clientCompany}.` : ''
  const name    = ctx.clientName    ? `Client contact: ${ctx.clientName}.`    : ''

  switch (field) {
    case 'problem':
      return {
        system: `You help agency teams write specific, concrete client project briefs. The user typed a vague problem statement. Rewrite it as 2–3 tight sentences that include: (1) what is currently slow, manual, or broken, (2) who is affected and how often, (3) what the consequence is (lost time, revenue, errors). Stay grounded in what they wrote — extrapolate plausibly, don't invent. Output only the improved problem statement, no preamble.`,
        user:   `${company} ${name}\nThey typed: "${value}"\n\nWrite a specific, concrete version.`,
      }
    case 'targetUsers':
      return {
        system: `You help agency teams write specific client project briefs. The user typed a vague target user description. Rewrite it as one specific sentence covering: role title, company type, company size (employees or team size), and one defining characteristic that makes them the ideal user. Output only the improved description, no preamble.`,
        user:   `${company} Project context: ${ctx.problem?.slice(0, 150) ?? 'not provided'}.\nThey wrote: "${value}"\n\nWrite a specific target user description.`,
      }
    case 'coreFeatures':
      return {
        system: `You help agency teams write specific client project briefs. The user listed vague features. Do two things: (1) rewrite each existing feature as a specific, buildable action (e.g. "Dashboard" → "Analytics dashboard showing weekly report views, open rates, and link clicks by recipient"), (2) add 2–3 logical features they forgot. Return as a numbered list, one feature per line. No preamble, no section headers.`,
        user:   `${company} Problem: ${ctx.problem?.slice(0, 120) ?? 'not provided'}.\nCurrent features:\n${value}\n\nExpand and improve this list.`,
      }
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const { field, value, context } = await req.json() as {
    field:   SuggestField
    value:   string
    context: { clientName?: string; clientCompany?: string; problem?: string }
  }

  if (!field || !value?.trim()) {
    return NextResponse.json({ ok: false, error: 'field and value required' }, { status: 400 })
  }

  const prompts = buildPrompt(field, value, context ?? {})

  const result = await aiComplete({
    system:    prompts.system,
    messages:  [{ role: 'user', content: prompts.user }],
    maxTokens: 400,
  })

  return NextResponse.json({ ok: true, suggestion: result.text.trim() })
}
