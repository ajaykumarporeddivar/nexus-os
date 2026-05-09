import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'

const RENDER_API = 'https://api.render.com/v1'

async function renderFetch(token: string, path: string, options?: RequestInit) {
  const res = await fetch(`${RENDER_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!text) throw new Error(`Render API ${path} returned empty response (status ${res.status})`)
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error(`Render API ${path} returned non-JSON: ${text.slice(0, 200)}`) }
  if (!res.ok) {
    const msg = (data as { message?: string })?.message ?? text.slice(0, 200)
    throw new Error(msg)
  }
  return data
}

// GET — verify token + return owner info
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const token = process.env.RENDER_API_KEY?.trim()
  if (!token) return NextResponse.json({ ok: false, error: 'RENDER_API_KEY not configured' })

  try {
    const owners = await renderFetch(token, '/owners?limit=1') as { owner: { id: string; name: string; email: string } }[]
    const owner = owners[0]?.owner
    if (!owner) throw new Error('No owner found on Render account')
    return NextResponse.json({ ok: true, data: { id: owner.id, name: owner.name, email: owner.email } })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message })
  }
}

// POST — create a web service from a GitHub repo, return deploy URL
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const token = process.env.RENDER_API_KEY?.trim()
  if (!token) {
    return NextResponse.json({ ok: false, error: 'RENDER_API_KEY not configured — add it in .env' }, { status: 400 })
  }

  const { projectName, repoUrl } = await req.json() as { projectName: string; repoUrl: string }
  if (!projectName || !repoUrl) {
    return NextResponse.json({ ok: false, error: 'projectName and repoUrl are required' }, { status: 400 })
  }

  const safeName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'nexus-app'

  try {
    // 1. Get owner ID
    const owners = await renderFetch(token, '/owners?limit=1') as { owner: { id: string } }[]
    const ownerId = owners[0]?.owner?.id
    if (!ownerId) throw new Error('No owner found on Render account')

    // 2. Create web service linked to GitHub repo
    const service = await renderFetch(token, '/services', {
      method: 'POST',
      body: JSON.stringify({
        type:       'web_service',
        name:       safeName,
        ownerId,
        repo:       repoUrl,
        autoDeploy: 'yes',
        branch:     'main',
        serviceDetails: {
          env:          'node',
          buildCommand: 'npm install && npm run build',
          startCommand: 'npm start',
          plan:         'free',
          region:       'oregon',
          numInstances: 1,
          envSpecificDetails: {
            buildCommand: 'npm install && npm run build',
            startCommand: 'npm start',
          },
        },
      }),
    }) as { service: { id: string; name: string; serviceDetails: { url?: string } } }

    const serviceId  = service.service.id
    const serviceName = service.service.name
    const deployUrl  = `https://${serviceName}.onrender.com`

    return NextResponse.json({
      ok: true,
      data: {
        serviceId,
        deployUrl,
        dashboardUrl: `https://dashboard.render.com/web/${serviceId}`,
        state: 'BUILDING',
      },
    })
  } catch (err) {
    const msg = (err as Error).message
    console.error('[render deploy]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
