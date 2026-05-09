import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2'

async function gql(token: string, query: string, variables?: object) {
  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const data = await res.json()
  if (data.errors?.length) throw new Error(data.errors[0].message)
  return data.data
}

// GET — verify token
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const token = process.env.RAILWAY_TOKEN?.trim()
  if (!token) return NextResponse.json({ ok: false, error: 'RAILWAY_TOKEN not configured' })

  try {
    const data = await gql(token, `{ me { id name email } }`)
    return NextResponse.json({ ok: true, data: { id: data.me.id, name: data.me.name, email: data.me.email } })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message })
  }
}

// POST — create project + service from GitHub repo, return deploy URL
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const token = process.env.RAILWAY_TOKEN?.trim()
  if (!token) {
    return NextResponse.json({ ok: false, error: 'RAILWAY_TOKEN not configured — add it in .env' }, { status: 400 })
  }

  const { projectName, repoUrl } = await req.json() as { projectName: string; repoUrl: string }
  if (!projectName || !repoUrl) {
    return NextResponse.json({ ok: false, error: 'projectName and repoUrl are required' }, { status: 400 })
  }

  const safeName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40)

  try {
    // 1. Create project
    const projData = await gql(token, `
      mutation CreateProject($name: String!) {
        projectCreate(input: { name: $name }) { id name }
      }
    `, { name: safeName })
    const projectId: string = projData.projectCreate.id

    // 2. Get default environment (Railway auto-creates "production")
    const envData = await gql(token, `
      query GetEnv($id: String!) {
        project(id: $id) { environments { edges { node { id name } } } }
      }
    `, { id: projectId })
    const envId: string = envData.project.environments.edges[0]?.node?.id
    if (!envId) throw new Error('No environment found in Railway project')

    // 3. Create service linked to GitHub repo
    // Extract owner/repo from URL: https://github.com/owner/repo
    const repoPath = repoUrl.replace('https://github.com/', '')
    const serviceData = await gql(token, `
      mutation CreateService($projectId: String!, $name: String!, $repo: String!) {
        serviceCreate(input: {
          projectId: $projectId
          name: $name
          source: { repo: $repo }
        }) { id name }
      }
    `, { projectId, name: safeName, repo: repoPath })
    const serviceId: string = serviceData.serviceCreate.id

    // 4. Trigger deployment
    await gql(token, `
      mutation Deploy($serviceId: String!, $environmentId: String!) {
        serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
      }
    `, { serviceId, environmentId: envId })

    // 5. Generate domain
    const domainData = await gql(token, `
      mutation GenDomain($serviceId: String!, $environmentId: String!) {
        serviceInstanceDeploymentDomainCreate(serviceId: $serviceId, environmentId: $environmentId) {
          domain
        }
      }
    `, { serviceId, environmentId: envId }).catch(() => null)

    const domain: string = domainData?.serviceInstanceDeploymentDomainCreate?.domain
      ?? `${safeName}.up.railway.app`

    const deployUrl = `https://${domain}`

    return NextResponse.json({
      ok: true,
      data: {
        projectId,
        serviceId,
        deployUrl,
        projectUrl: `https://railway.app/project/${projectId}`,
        state: 'BUILDING',
      },
    })
  } catch (err) {
    const msg = (err as Error).message
    console.error('[railway deploy]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
