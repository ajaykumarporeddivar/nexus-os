import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'

const EVOLUTION_SYSTEM = `You are NEXUS EVOLUTION AGENT — you handle iterative project improvements.

You receive the current application's file tree, a subset of key file contents, and client feedback / enhancement requests.

Your job:
1. Understand what needs to change based on the feedback
2. Generate ONLY the files that need to be modified or newly created
3. Make targeted, minimal changes — do NOT rewrite files that don't need to change

OUTPUT CONTRACT — follow exactly:
Each changed file MUST be wrapped like this:

FILE: path/to/file.ts
<<<
[complete file content — the full file, not a diff or snippet]
>>>

Rules:
- Output COMPLETE file content for each changed file (not a diff)
- Only output files that actually need to change — skip unchanged files entirely
- Preserve all existing functionality; add/modify per the feedback only
- Maintain same stack: Next.js 15, TypeScript strict, Tailwind CSS, Prisma
- No placeholder comments like "// rest of implementation" or "// TODO"
- After the files, write one line: EVOLUTION SUMMARY: [what changed and why]`.trim()

function buildKeyFiles(files: Record<string, string>): string {
  // Priority: package.json, pages, globals, constants, core service
  const PRIORITY = [
    'package.json',
    'src/app/page.tsx',
    'src/app/dashboard/page.tsx',
    'src/app/globals.css',
    'src/lib/constants.ts',
    'src/lib/utils.ts',
    'src/services/core.ts',
    'src/types/index.ts',
    'src/lib/validations.ts',
  ]

  const sections: string[] = []
  let charBudget = 6000

  for (const key of PRIORITY) {
    const content = files[key]
    if (!content) continue
    const snippet = content.slice(0, Math.min(600, charBudget))
    sections.push(`--- ${key} ---\n${snippet}${content.length > 600 ? '\n[truncated]' : ''}`)
    charBudget -= snippet.length
    if (charBudget <= 0) break
  }

  return sections.join('\n\n')
}

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const {
    projectName,
    brief,
    feedback,
    currentVersion,
    files,
    apiKey,
  } = await req.json() as {
    projectName:    string
    brief:          string
    feedback:       string
    currentVersion: number
    files:          Record<string, string>
    apiKey?:        string
  }

  if (!feedback?.trim() || !files || Object.keys(files).length === 0) {
    return NextResponse.json({ ok: false, error: 'feedback and files are required' }, { status: 400 })
  }

  const key       = apiKey?.trim() || process.env.ANTHROPIC_API_KEY
  const fileTree  = Object.keys(files).sort().join('\n')
  const keyFiles  = buildKeyFiles(files)
  const nextVer   = currentVersion + 1

  const userMessage = `PROJECT: ${projectName}
BRIEF: ${brief?.slice(0, 300) ?? 'Not provided'}
CURRENT VERSION: v${currentVersion}
EVOLVING TO: v${nextVer}

FILE TREE (${Object.keys(files).length} files):
${fileTree}

KEY FILE CONTENTS:
${keyFiles}

CLIENT FEEDBACK / ENHANCEMENT REQUEST:
${feedback.trim()}

Generate the files that need to change to address this feedback. Output ONLY changed or new files.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         key ?? '',
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 8000,
        system:     EVOLUTION_SYSTEM,
        messages:   [{ role: 'user', content: userMessage }],
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data?.error?.message ?? `Claude API ${res.status}`)
    }

    const content: string = data.content?.[0]?.text ?? ''
    const tokens: number  = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)

    // Parse changed files from Claude output
    const changedFiles: Record<string, string> = {}
    const re = /FILE:\s*`?([^\n`]+)`?\s*\n<<<\n([\s\S]*?)>>>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      changedFiles[m[1].trim()] = m[2].trimEnd()
    }

    // Extract summary line
    const summaryMatch = content.match(/EVOLUTION SUMMARY:\s*(.+)/i)
    const summary = summaryMatch ? summaryMatch[1].trim() : `v${nextVer} improvements applied`

    return NextResponse.json({
      ok: true,
      data: {
        changedFiles,
        filesChanged:  Object.keys(changedFiles),
        summary,
        tokens,
        rawContent: content,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[projects/evolve]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
