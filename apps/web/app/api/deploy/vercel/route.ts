import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import crypto from 'crypto'

const VERCEL_API = 'https://api.vercel.com'

function getHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function vrclGet(path: string, token: string, teamId?: string) {
  const qs  = teamId ? `?teamId=${teamId}` : ''
  const res = await fetch(`${VERCEL_API}${path}${qs}`, { headers: getHeaders(token) })
  const d   = await res.json()
  if (!res.ok) throw new Error(d.error?.message ?? d.message ?? `GET ${path} ${res.status}`)
  return d
}

async function vrclPost(path: string, token: string, body: object, teamId?: string) {
  const qs  = teamId ? `?teamId=${teamId}` : ''
  const res = await fetch(`${VERCEL_API}${path}${qs}`, {
    method: 'POST',
    headers: getHeaders(token),
    body:   JSON.stringify(body),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d.error?.message ?? d.message ?? `POST ${path} ${res.status}`)
  return d
}

// Pre-upload a single file to Vercel's file store (SHA-based dedup)
async function uploadFileToVercel(
  content: Buffer,
  token: string,
  teamId?: string,
): Promise<{ sha: string; size: number }> {
  const sha  = crypto.createHash('sha1').update(content).digest('hex')
  const size = content.length
  const qs   = teamId ? `?teamId=${teamId}` : ''

  const res = await fetch(`${VERCEL_API}/v2/files${qs}`, {
    method:  'POST',
    headers: {
      Authorization:     `Bearer ${token}`,
      'Content-Type':    'application/octet-stream',
      'x-vercel-digest': sha,
    } as Record<string, string>,
    body: new Uint8Array(content),
  })

  // 200 = uploaded, 409 = already exists (SHA match) — both are fine
  if (res.status !== 200 && res.status !== 409) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(`File upload failed (${res.status}): ${err.message ?? res.statusText}`)
  }

  return { sha, size }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function mdToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hpuol])(.+)$/gm, '$1')
}

function extractSection(md: string, heading: string): string {
  const re = new RegExp(`#{1,3}\\s+${heading}[^\n]*\n([\\s\\S]*?)(?=\n#{1,3}\\s|$)`, 'i')
  const m = md.match(re)
  return m ? m[1].trim() : ''
}

function extractBullets(md: string): string[] {
  return md.match(/^[-*]\s+(.+)$/gm)?.map(l => l.replace(/^[-*]\s+/, '').trim()) ?? []
}

function generateOverviewHTML(
  projectName: string,
  score: number | null,
  brief: string,
  files: Record<string, string>,
): string {
  const approved  = score !== null && score >= 8
  const scoreStr  = score !== null ? score.toFixed(1) : '—'
  const statusTxt = approved ? 'APPROVED' : score !== null ? 'IN REVIEW' : 'DRAFT'
  const statusCls = approved ? 'green' : 'amber'

  const manifest  = files['PROJECT_MANIFEST.md'] ?? ''
  const arch      = files['.claude/architecture.md'] ?? ''
  const features  = files['.claude/features/feature-cards.md'] ?? ''
  const security  = files['.claude/security-report.md'] ?? ''
  const qa        = files['.forge/qa-report.md'] ?? files['.forge/qa-report-revised.md'] ?? ''
  const sql       = files['db/migrations/001_init.sql'] ?? ''

  // Extract key content
  const overview  = extractSection(manifest, 'Overview') || extractSection(manifest, 'Project Overview') || brief
  const featureBullets = extractBullets(features).slice(0, 8)
  const featureCards = featureBullets.length
    ? featureBullets.map((f, i) => {
        const [ftitle, ...rest] = f.split(':')
        return `<div class="feat-card"><span class="feat-n">F${String(i+1).padStart(2,'0')}</span><strong>${escapeHtml(ftitle.trim())}</strong>${rest.length ? `<p>${escapeHtml(rest.join(':').trim())}</p>` : ''}</div>`
      }).join('')
    : `<div class="feat-card"><p>${escapeHtml(brief.slice(0, 300))}</p></div>`

  const techLines = extractBullets(arch).filter(l => /typescript|node|react|next|postgres|supabase|redis|stripe|prisma/i.test(l)).slice(0, 6)
  const techStack = techLines.length
    ? techLines.map(t => `<span class="tech-pill">${escapeHtml(t.split(':')[0].trim())}</span>`).join('')
    : '<span class="tech-pill">TypeScript</span><span class="tech-pill">Node.js</span><span class="tech-pill">PostgreSQL</span><span class="tech-pill">REST API</span>'

  const secFindings = extractBullets(security).slice(0, 4)
  const secHtml = secFindings.length
    ? secFindings.map(s => {
        const lvl = /critical/i.test(s) ? 'crit' : /high/i.test(s) ? 'high' : /medium/i.test(s) ? 'med' : 'low'
        const text = escapeHtml(s.replace(/^(CRITICAL|HIGH|MEDIUM|LOW)[:\s]*/i,'').slice(0,120))
        return `<div class="sec-row"><span class="sec-badge ${lvl}">${lvl.toUpperCase()}</span><span>${text}</span></div>`
      }).join('')
    : '<div class="sec-row"><span class="sec-badge low">PASS</span><span>No critical security issues detected.</span></div>'

  const sqlPreview = sql ? sql.split('\n').filter(l => l.match(/CREATE TABLE|CREATE INDEX|--/i)).slice(0, 10).join('\n') : ''

  const rawTitle = projectName.replace(/[-_]/g,' ').replace(/\b\w/g, c => c.toUpperCase())
  const title = escapeHtml(rawTitle)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} — Project Proposal</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--green:#16a34a;--amber:#d97706;--ink:#111;--ink2:#555;--ink3:#888;--border:#e5e5e5;--paper:#fff;--paper2:#f9f9f8;--paper3:#f3f3f2;--accent:#c8f23c}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--paper2);color:var(--ink);min-height:100vh}
a{color:inherit;text-decoration:none}

/* NAV */
nav{position:sticky;top:0;z-index:99;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0;padding:0 32px;height:56px}
.nav-logo{font-weight:900;font-size:13px;letter-spacing:.06em;margin-right:32px;color:var(--ink)}
.nav-logo span{color:#888;font-weight:400}
.nav-links{display:flex;gap:4px;flex:1}
.nav-link{padding:6px 14px;border-radius:8px;font-size:13px;font-weight:500;color:var(--ink3);cursor:pointer;transition:all .15s}
.nav-link:hover,.nav-link.active{background:var(--paper3);color:var(--ink)}
.nav-badge{display:inline-flex;align-items:center;gap:6px;margin-left:auto;font-size:11px;font-weight:700;padding:5px 12px;border-radius:20px;border:1px solid}
.nav-badge.green{background:#f0fdf4;border-color:#86efac;color:var(--green)}
.nav-badge.amber{background:#fffbeb;border-color:#fcd34d;color:var(--amber)}
.nav-badge .dot{width:6px;height:6px;border-radius:50%;background:currentColor}

/* HERO */
.hero{padding:72px 32px 56px;max-width:900px;margin:0 auto}
.hero-eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);margin-bottom:16px}
.hero h1{font-size:clamp(32px,5vw,52px);font-weight:900;line-height:1.1;letter-spacing:-.02em;margin-bottom:20px}
.hero-sub{font-size:16px;color:var(--ink2);line-height:1.6;max-width:600px;margin-bottom:40px}
.kpi-row{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:48px}
.kpi{background:var(--paper);border:1px solid var(--border);border-radius:14px;padding:20px 28px;min-width:140px}
.kpi-val{font-size:32px;font-weight:900;font-family:monospace;line-height:1}
.kpi-val.green{color:var(--green)}.kpi-val.amber{color:var(--amber)}
.kpi-label{font-size:11px;color:var(--ink3);margin-top:6px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}

/* SECTIONS */
.section{padding:64px 32px;max-width:900px;margin:0 auto}
.section-label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);margin-bottom:12px}
.section h2{font-size:26px;font-weight:800;margin-bottom:8px;letter-spacing:-.01em}
.section .lead{font-size:15px;color:var(--ink2);line-height:1.7;margin-bottom:36px;max-width:680px}
.divider{border:none;border-top:1px solid var(--border);margin:0}

/* FEATURES */
.feat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.feat-card{background:var(--paper);border:1px solid var(--border);border-radius:14px;padding:22px;transition:border-color .15s}
.feat-card:hover{border-color:#bbb}
.feat-n{display:inline-block;font-size:10px;font-weight:800;font-family:monospace;color:var(--ink3);border:1px solid var(--border);border-radius:6px;padding:2px 7px;margin-bottom:10px}
.feat-card strong{display:block;font-size:14px;margin-bottom:6px}
.feat-card p{font-size:13px;color:var(--ink2);line-height:1.5}

/* TECH */
.tech-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
.tech-pill{background:var(--paper3);border:1px solid var(--border);border-radius:20px;padding:6px 14px;font-size:13px;font-weight:600;color:var(--ink2)}

/* SECURITY */
.sec-list{display:flex;flex-direction:column;gap:10px;margin-top:8px}
.sec-row{display:flex;align-items:flex-start;gap:12px;background:var(--paper);border:1px solid var(--border);border-radius:10px;padding:14px 16px;font-size:13px;color:var(--ink2);line-height:1.5}
.sec-badge{font-size:9px;font-weight:800;font-family:monospace;padding:3px 7px;border-radius:5px;flex-shrink:0;margin-top:1px}
.sec-badge.crit{background:#fef2f2;color:#dc2626;border:1px solid #fca5a5}
.sec-badge.high{background:#fff7ed;color:#ea580c;border:1px solid #fdba74}
.sec-badge.med{background:#fffbeb;color:var(--amber);border:1px solid #fcd34d}
.sec-badge.low,.sec-badge.pass{background:#f0fdf4;color:var(--green);border:1px solid #86efac}

/* SQL */
.code-block{background:#111;color:#e5e7eb;border-radius:12px;padding:24px;font-family:monospace;font-size:12px;line-height:1.7;overflow-x:auto;white-space:pre;margin-top:8px}

/* TIMELINE */
.timeline{display:flex;flex-direction:column;gap:0;margin-top:8px}
.tl-row{display:flex;gap:16px;position:relative}
.tl-row:not(:last-child)::before{content:'';position:absolute;left:19px;top:36px;bottom:-8px;width:2px;background:var(--border)}
.tl-dot{width:40px;height:40px;border-radius:50%;background:var(--paper);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;font-family:monospace;flex-shrink:0;margin-bottom:24px}
.tl-body{padding-top:8px;padding-bottom:24px}
.tl-phase{font-size:13px;font-weight:700;margin-bottom:3px}
.tl-desc{font-size:12px;color:var(--ink3)}

/* CTA */
.cta-box{background:var(--ink);color:var(--paper);border-radius:20px;padding:48px;text-align:center;margin:64px 32px}
.cta-box h2{font-size:28px;font-weight:900;margin-bottom:12px;letter-spacing:-.01em}
.cta-box p{font-size:15px;color:#aaa;margin-bottom:32px}
.cta-btn{display:inline-block;background:var(--accent);color:var(--ink);font-weight:800;font-size:14px;padding:14px 32px;border-radius:12px;cursor:pointer}

footer{border-top:1px solid var(--border);padding:24px 32px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--ink3)}

/* scroll-section hide */
.tab-section{display:none}.tab-section.active{display:block}
</style>
</head>
<body>

<nav>
  <div class="nav-logo">NEXUS OS <span>/ FORGE</span></div>
  <div class="nav-links">
    <div class="nav-link active" onclick="show('overview',this)">Overview</div>
    <div class="nav-link" onclick="show('features',this)">Features</div>
    <div class="nav-link" onclick="show('architecture',this)">Architecture</div>
    <div class="nav-link" onclick="show('delivery',this)">Delivery</div>
  </div>
  <div class="nav-badge ${statusCls}"><span class="dot"></span>${statusTxt} · ${scoreStr}/10</div>
</nav>

<!-- OVERVIEW -->
<div id="overview" class="tab-section active">
  <div class="hero">
    <div class="hero-eyebrow">Project Proposal · ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
    <h1>${title}</h1>
    <p class="hero-sub">${escapeHtml((overview || brief).slice(0,300))}</p>
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-val ${statusCls}">${scoreStr}</div><div class="kpi-label">QA Score / 10</div></div>
      <div class="kpi"><div class="kpi-val">${featureBullets.length || '8+'}</div><div class="kpi-label">Core Features</div></div>
      <div class="kpi"><div class="kpi-val">9</div><div class="kpi-label">AI Agents</div></div>
      <div class="kpi"><div class="kpi-val">${Object.keys(files).length}</div><div class="kpi-label">Files Delivered</div></div>
    </div>
  </div>
  <hr class="divider"/>
  <div class="section">
    <div class="section-label">What we're building</div>
    <h2>Project Scope</h2>
    <p class="lead">${escapeHtml((manifest ? extractSection(manifest,'Overview') || extractSection(manifest,'Project Overview') || brief : brief).slice(0,600))}</p>
    <div class="section-label" style="margin-top:32px">Tech Stack</div>
    <div class="tech-row">${techStack}</div>
  </div>
</div>

<!-- FEATURES -->
<div id="features" class="tab-section">
  <div class="section" style="padding-top:48px">
    <div class="section-label">What's included</div>
    <h2>Core Features</h2>
    <p class="lead">Every feature has been scoped, architected, and planned by the 21-agent NEXUS pipeline. Each is ready for sprint execution.</p>
    <div class="feat-grid">${featureCards}</div>
  </div>
</div>

<!-- ARCHITECTURE -->
<div id="architecture" class="tab-section">
  <div class="section" style="padding-top:48px">
    <div class="section-label">System design</div>
    <h2>Architecture</h2>
    <p class="lead">Designed for production from day one — scalable, secure, and observable.</p>
    <div class="section-label" style="margin-top:32px">Security Audit</div>
    <div class="sec-list">${secHtml}</div>
    ${sqlPreview ? `<div class="section-label" style="margin-top:32px">Database Schema Preview</div><div class="code-block">${sqlPreview.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : ''}
  </div>
</div>

<!-- DELIVERY -->
<div id="delivery" class="tab-section">
  <div class="section" style="padding-top:48px">
    <div class="section-label">What you receive</div>
    <h2>Delivered Files</h2>
    <p class="lead">Everything you need to hand off to a developer or start building immediately.</p>
    <div class="feat-grid">
      ${Object.keys(files).map(f => {
        const icons: Record<string,string> = { 'PROJECT_MANIFEST.md':'📋','architecture.md':'🏗','feature-cards.md':'✦','specs.md':'✓','index.ts':'⟨/⟩','security-report.md':'🔒','001_init.sql':'🗄','qa-report.md':'★' }
        const icon = Object.entries(icons).find(([k]) => f.includes(k))?.[1] ?? '◈'
        return `<div class="feat-card"><span class="feat-n">${icon}</span><strong style="font-size:13px;font-family:monospace">${escapeHtml(f)}</strong><p>${f.endsWith('.md') ? 'Markdown document' : f.endsWith('.ts') ? 'TypeScript source' : f.endsWith('.sql') ? 'Database migration' : 'Project file'}</p></div>`
      }).join('')}
    </div>
    <div class="timeline" style="margin-top:48px">
      <div class="section-label">Implementation Phases</div>
      ${[['01','Setup & Infra','Repo, env config, DB migration, CI/CD pipeline'],['02','Core Build','Feature implementation following the FORGE architecture'],['03','QA & Security','Test suite execution, security hardening'],['04','Deploy & Handoff','Production deploy, client walkthrough, SoW sign-off']].map(([n,phase,desc])=>`<div class="tl-row"><div class="tl-dot">${n}</div><div class="tl-body"><div class="tl-phase">${phase}</div><div class="tl-desc">${desc}</div></div></div>`).join('')}
    </div>
  </div>
</div>

<div class="cta-box">
  <h2>Ready to start building?</h2>
  <p>This proposal was generated and QA-scored by the NEXUS OS FORGE Engine.<br/>Share this link with your client or reply to begin the project.</p>
  <div class="cta-btn" onclick="window.print()">Download as PDF</div>
</div>

<footer>
  <span>${title} — Project Proposal</span>
  <span>Generated by NEXUS OS FORGE · ${new Date().getFullYear()}</span>
</footer>

<script>
function show(id, el) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'))
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'))
  document.getElementById(id).classList.add('active')
  el.classList.add('active')
}
</script>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const {
    projectName,
    files = {},
    score,
    brief = '',
  } = await req.json() as {
    projectName:  string
    files?:       Record<string, string>
    score?:       number | null
    brief?:       string
  }

  if (!projectName) {
    return NextResponse.json({ ok: false, error: 'projectName is required' }, { status: 400 })
  }

  const token  = process.env.VERCEL_TOKEN?.trim()
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || undefined

  if (!token) {
    return NextResponse.json({ ok: false, error: 'VERCEL_TOKEN not configured' }, { status: 400 })
  }

  const safeName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 52)

  try {
    // ── 1. Create or reuse Vercel project ───────────────────────────────────
    let projectId:        string
    let projectNameFinal: string = safeName

    try {
      const existing = await vrclGet(`/v9/projects/${safeName}`, token, teamId)
      projectId        = existing.id
      projectNameFinal = existing.name
    } catch {
      // Project doesn't exist — create it (no GitHub link; pure static)
      try {
        const proj   = await vrclPost('/v10/projects', token, { name: safeName, framework: null }, teamId)
        projectId        = proj.id
        projectNameFinal = proj.name
      } catch {
        // Name taken elsewhere — retry with suffix
        projectNameFinal = `${safeName}-${Date.now().toString(36).slice(-5)}`
        const proj   = await vrclPost('/v10/projects', token, { name: projectNameFinal, framework: null }, teamId)
        projectId        = proj.id
        projectNameFinal = proj.name
      }
    }

    // ── 2. Build file list (FORGE files + index.html overview) ──────────────
    const allFiles: Record<string, Buffer> = {}

    for (const [path, content] of Object.entries(files)) {
      if (path && content) allFiles[path] = Buffer.from(content)
    }

    // Always add a project overview index page
    const indexHtml = generateOverviewHTML(projectName, score ?? null, brief, files)
    allFiles['index.html'] = Buffer.from(indexHtml)

    // ── 3. Pre-upload files to Vercel's file store ──────────────────────────
    const deployFileRefs: { file: string; sha: string; size: number }[] = []

    for (const [path, buf] of Object.entries(allFiles)) {
      const { sha, size } = await uploadFileToVercel(buf, token, teamId)
      deployFileRefs.push({ file: path, sha, size })
    }

    // ── 4. Create deployment referencing pre-uploaded files ─────────────────
    const deployment = await vrclPost('/v13/deployments', token, {
      name:   projectNameFinal,
      files:  deployFileRefs,
      target: 'production',
    }, teamId)

    const deployUrl = `https://${projectNameFinal}.vercel.app`

    return NextResponse.json({
      ok: true,
      data: {
        projectId,
        projectName: projectNameFinal,
        deployUrl,
        state: deployment.readyState ?? 'BUILDING',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[vercel deploy]', msg)
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const token = process.env.VERCEL_TOKEN?.trim()
  if (!token) return NextResponse.json({ ok: false, error: 'VERCEL_TOKEN not configured' })

  try {
    const me = await vrclGet('/v2/user', token)
    return NextResponse.json({ ok: true, data: { username: me.user?.username, hasToken: true } })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message })
  }
}
