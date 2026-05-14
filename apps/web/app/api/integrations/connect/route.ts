import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/integrations/connect?provider=gmail&workspaceId=xxx
 *
 * Initiates OAuth flow for a workspace integration.
 * Redirects user to the provider's OAuth consent screen.
 *
 * Supported providers: gmail | google-calendar | notion | hubspot | slack
 */

const OAUTH_CONFIGS: Record<string, {
  authUrl: string
  scopes:  string[]
}> = {
  'gmail': {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes:  ['https://www.googleapis.com/auth/gmail.readonly', 'email', 'profile'],
  },
  'google-calendar': {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes:  ['https://www.googleapis.com/auth/calendar.readonly', 'email', 'profile'],
  },
  'notion': {
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    scopes:  [],  // Notion uses fixed scopes
  },
  'hubspot': {
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    scopes:  ['crm.objects.deals.read', 'crm.objects.contacts.read'],
  },
  'slack': {
    authUrl: 'https://slack.com/oauth/v2/authorize',
    scopes:  ['channels:read', 'channels:history', 'users:read'],
  },
}

export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const provider    = searchParams.get('provider') ?? ''
  const workspaceId = searchParams.get('workspaceId') ?? ''

  if (!provider || !workspaceId) {
    return NextResponse.json({ error: 'provider and workspaceId required' }, { status: 400 })
  }

  const config = OAUTH_CONFIGS[provider]
  if (!config) {
    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 })
  }

  // Verify workspace ownership
  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, ownerId: auth.user.id! },
    select: { id: true },
  })
  if (!ws) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const baseUrl     = process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? `https://${req.headers.get('host')}`
  const redirectUri = `${baseUrl}/api/integrations/callback`
  const state       = Buffer.from(JSON.stringify({ provider, workspaceId, userId: auth.user.id })).toString('base64url')

  const clientId = getClientId(provider)
  if (!clientId) {
    return NextResponse.json({ error: `${provider} client ID not configured` }, { status: 500 })
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    state,
    access_type:   'offline',  // Google: request refresh token
    prompt:        'consent',  // Google: always show consent for refresh token
  })

  if (provider === 'notion') {
    params.set('owner', 'user')
    params.delete('access_type')
    params.delete('prompt')
  } else if (provider === 'hubspot') {
    params.delete('access_type')
    params.delete('prompt')
    params.set('scope', config.scopes.join(' '))
  } else if (provider === 'slack') {
    params.delete('access_type')
    params.delete('prompt')
    params.set('scope', config.scopes.join(','))
    params.set('user_scope', '')
  } else {
    // Google providers
    params.set('scope', config.scopes.join(' '))
  }

  return NextResponse.redirect(`${config.authUrl}?${params}`)
}

function getClientId(provider: string): string | undefined {
  switch (provider) {
    case 'gmail':
    case 'google-calendar': return process.env.GOOGLE_CLIENT_ID
    case 'notion':          return process.env.NOTION_CLIENT_ID
    case 'hubspot':         return process.env.HUBSPOT_CLIENT_ID
    case 'slack':           return process.env.SLACK_CLIENT_ID
    default:                return undefined
  }
}
