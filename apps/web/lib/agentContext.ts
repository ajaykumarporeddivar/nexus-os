/**
 * agentContext.ts
 *
 * Assembles the full input context for a client agent run.
 * Combines:
 *   1. Manual inputText (if provided by user)
 *   2. Live data from connected workspace integrations (Gmail / Calendar / Notion / etc.)
 *   3. Workspace knowledge base entries
 *
 * Returns the enriched userMessage string to pass to aiComplete().
 */

import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import {
  fetchGmailData,
  fetchCalendarData,
  fetchNotionData,
  fetchHubSpotData,
  fetchSlackData,
} from '@/lib/integrationFetchers'
import type { ClientAgentType } from '@/lib/clientAgentData'

// Which integrations are relevant for each agent type
const AGENT_INTEGRATION_MAP: Record<ClientAgentType, string[]> = {
  'email-triage':  ['gmail'],
  'meeting-prep':  ['google-calendar', 'notion'],
  'followup-seq':  ['hubspot', 'gmail'],
  'loop-closer':   ['slack', 'notion', 'hubspot'],
  'context-brief': ['notion', 'gmail', 'slack'],
  'weekly-digest': ['gmail', 'google-calendar', 'hubspot', 'slack'],
}

async function fetchIntegrationData(provider: string, accessToken: string) {
  switch (provider) {
    case 'gmail':            return fetchGmailData(accessToken)
    case 'google-calendar':  return fetchCalendarData(accessToken)
    case 'notion':           return fetchNotionData(accessToken)
    case 'hubspot':          return fetchHubSpotData(accessToken)
    case 'slack':            return fetchSlackData(accessToken)
    default:                 return null
  }
}

export async function buildAgentUserMessage({
  workspaceId,
  agentType,
  workspaceName,
  inputText,
}: {
  workspaceId:   string
  agentType:     ClientAgentType
  workspaceName: string
  inputText?:    string
}): Promise<{ message: string; integrationSummary: string[] }> {
  const relevantProviders = AGENT_INTEGRATION_MAP[agentType] ?? []
  const integrationSummaries: string[] = []

  if (relevantProviders.length > 0) {
    // Load enabled integrations for this workspace
    const integrations = await prisma.workspaceIntegration.findMany({
      where: {
        workspaceId,
        provider: { in: relevantProviders },
        enabled:  true,
      },
      select: {
        provider:     true,
        accessToken:  true,
        refreshToken: true,
        expiresAt:    true,
      },
    }).catch(() => [])

    // Fetch live data from each connected integration (parallel)
    const fetches = integrations.map(async (integ) => {
      try {
        let token = decrypt(integ.accessToken)

        // Basic token refresh check — if expired and refresh available, attempt refresh
        if (integ.expiresAt && integ.refreshToken && new Date() > integ.expiresAt) {
          const refreshed = await refreshGoogleToken(decrypt(integ.refreshToken))
          if (refreshed) {
            token = refreshed.access_token
            // Update DB with new encrypted token (fire-and-forget)
            const { encrypt: encFn } = await import('@/lib/encrypt')
            prisma.workspaceIntegration.update({
              where:  { workspaceId_provider: { workspaceId, provider: integ.provider } },
              data: {
                accessToken: encFn(token),
                expiresAt:   new Date(Date.now() + refreshed.expires_in * 1000),
              },
            }).catch(console.error)
          }
        }

        return fetchIntegrationData(integ.provider, token)
      } catch {
        return null
      }
    })

    const results = await Promise.all(fetches)
    for (const r of results) {
      if (r?.summary) integrationSummaries.push(r.summary)
    }
  }

  // Build final message
  const parts: string[] = []
  const today = new Date().toDateString()

  parts.push(`Today is ${today}. Workspace: ${workspaceName}.`)

  if (integrationSummaries.length > 0) {
    parts.push('\n--- LIVE DATA FROM CONNECTED TOOLS ---')
    parts.push(integrationSummaries.join('\n\n'))
    parts.push('--- END LIVE DATA ---\n')
  }

  if (inputText?.trim()) {
    parts.push('Additional context provided:')
    parts.push(inputText.trim())
  } else if (integrationSummaries.length === 0) {
    // No integrations and no input — generic fallback
    parts.push(`Please generate the ${agentType} report based on the workspace context provided.`)
  }

  return {
    message:            parts.join('\n'),
    integrationSummary: integrationSummaries,
  }
}

// ── Google token refresh helper ────────────────────────────────────────────────
async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID     ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
      }),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
