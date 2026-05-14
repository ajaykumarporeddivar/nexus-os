import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encrypt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/integrations/callback?code=...&state=...
 *
 * OAuth callback handler. Exchanges code for tokens, stores encrypted in DB,
 * then redirects back to the client-agents page.
 */

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? `https://${req.headers.get('host')}`

  if (error || !code || !state) {
    return NextResponse.redirect(`${baseUrl}/shell?page=client-agents&integration=error&reason=${encodeURIComponent(error ?? 'missing_code')}`)
  }

  let provider = '', workspaceId = '', userId = ''
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'))
    provider    = decoded.provider
    workspaceId = decoded.workspaceId
    userId      = decoded.userId
  } catch {
    return NextResponse.redirect(`${baseUrl}/shell?page=client-agents&integration=error&reason=invalid_state`)
  }

  const redirectUri = `${baseUrl}/api/integrations/callback`

  try {
    const tokens = await exchangeCode(provider, code, redirectUri)
    if (!tokens) throw new Error('Token exchange failed')

    // Determine account email for display
    let accountEmail: string | undefined
    if (provider === 'gmail' || provider === 'google-calendar') {
      accountEmail = await getGoogleEmail(tokens.access_token)
    } else if (provider === 'notion') {
      accountEmail = tokens.owner?.user?.person?.email
    }

    const expiresAt = typeof tokens.expires_in === 'number'
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null

    // Upsert integration record
    await prisma.workspaceIntegration.upsert({
      where:  { workspaceId_provider: { workspaceId, provider } },
      create: {
        workspaceId,
        provider,
        accessToken:  encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        expiresAt,
        scopes:       tokens.scope ? tokens.scope.split(/[\s,]+/).filter(Boolean) : [],
        accountEmail: accountEmail ?? null,
        enabled:      true,
      },
      update: {
        accessToken:  encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
        expiresAt:    expiresAt ?? undefined,
        scopes:       tokens.scope ? tokens.scope.split(/[\s,]+/).filter(Boolean) : undefined,
        accountEmail: accountEmail ?? undefined,
        enabled:      true,
        updatedAt:    new Date(),
      },
    })

    // Audit log
    await prisma.auditEvent.create({
      data: {
        action:    'integration_connected',
        userId,
        sessionId: `integration-${provider}-${workspaceId}`,
        meta:      { provider, workspaceId, accountEmail },
      },
    }).catch(console.error)

    return NextResponse.redirect(`${baseUrl}/shell?page=client-agents&integration=success&provider=${provider}`)
  } catch (err) {
    console.error('[integration callback]', err)
    return NextResponse.redirect(`${baseUrl}/shell?page=client-agents&integration=error&reason=${encodeURIComponent(String(err))}`)
  }
}

// ── Token exchange helpers ─────────────────────────────────────────────────────

interface TokenResponse {
  access_token:  string
  refresh_token?: string
  expires_in?:   number
  scope?:        string
  owner?: { user?: { person?: { email?: string } } }
}

async function exchangeCode(provider: string, code: string, redirectUri: string): Promise<TokenResponse | null> {
  const { tokenUrl, clientId, clientSecret } = getProviderCreds(provider)
  if (!tokenUrl || !clientId || !clientSecret) return null

  const body = new URLSearchParams({
    code,
    redirect_uri:  redirectUri,
    grant_type:    'authorization_code',
    client_id:     clientId,
    client_secret: clientSecret,
  })

  // Notion uses Basic auth
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (provider === 'notion') {
    headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  }

  const res = await fetch(tokenUrl, { method: 'POST', headers, body: body.toString() })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Token exchange ${res.status}: ${txt}`)
  }
  return res.json() as Promise<TokenResponse>
}

function getProviderCreds(provider: string) {
  switch (provider) {
    case 'gmail':
    case 'google-calendar':
      return {
        tokenUrl:     'https://oauth2.googleapis.com/token',
        clientId:     process.env.GOOGLE_CLIENT_ID     ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      }
    case 'notion':
      return {
        tokenUrl:     'https://api.notion.com/v1/oauth/token',
        clientId:     process.env.NOTION_CLIENT_ID     ?? '',
        clientSecret: process.env.NOTION_CLIENT_SECRET ?? '',
      }
    case 'hubspot':
      return {
        tokenUrl:     'https://api.hubapi.com/oauth/v1/token',
        clientId:     process.env.HUBSPOT_CLIENT_ID     ?? '',
        clientSecret: process.env.HUBSPOT_CLIENT_SECRET ?? '',
      }
    case 'slack':
      return {
        tokenUrl:     'https://slack.com/api/oauth.v2.access',
        clientId:     process.env.SLACK_CLIENT_ID     ?? '',
        clientSecret: process.env.SLACK_CLIENT_SECRET ?? '',
      }
    default:
      return { tokenUrl: '', clientId: '', clientSecret: '' }
  }
}

async function getGoogleEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return undefined
    const json = await res.json() as { email?: string }
    return json.email
  } catch {
    return undefined
  }
}
