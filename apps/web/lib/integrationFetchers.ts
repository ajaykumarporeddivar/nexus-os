/**
 * integrationFetchers.ts
 *
 * Per-provider live data fetchers used by agentContext.ts to enrich agent prompts.
 * Each fetcher receives a decrypted access token and returns structured markdown.
 *
 * Providers: gmail | google-calendar | notion | hubspot | slack
 */

export interface IntegrationData {
  provider: string
  summary:  string   // markdown snippet injected into agent userMessage
  raw?:     unknown  // raw API response for debugging
}

// ── Gmail ──────────────────────────────────────────────────────────────────────
export async function fetchGmailData(accessToken: string, maxMessages = 20): Promise<IntegrationData> {
  try {
    // List unread messages in INBOX
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&q=is:unread&maxResults=${maxMessages}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!listRes.ok) throw new Error(`Gmail list: ${listRes.status}`)
    const listJson = await listRes.json() as { messages?: Array<{ id: string }> }
    const messages = listJson.messages ?? []

    if (messages.length === 0) {
      return { provider: 'gmail', summary: '**Gmail Inbox**: No unread messages.' }
    }

    // Fetch metadata (subject, from, date) for each — parallel, max 10
    const toFetch = messages.slice(0, 10).map(m =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then(r => r.ok ? r.json() : null)
    )
    const details = await Promise.all(toFetch)

    const lines: string[] = [`**Gmail Inbox** (${messages.length} unread, showing ${Math.min(10, messages.length)}):`]
    for (const d of details) {
      if (!d) continue
      const headers: Array<{ name: string; value: string }> = d.payload?.headers ?? []
      const subject = headers.find((h: { name: string }) => h.name === 'Subject')?.value ?? '(no subject)'
      const from    = headers.find((h: { name: string }) => h.name === 'From')?.value ?? 'Unknown'
      const date    = headers.find((h: { name: string }) => h.name === 'Date')?.value ?? ''
      lines.push(`- From: ${from} | Subject: ${subject} | Date: ${date}`)
    }

    return { provider: 'gmail', summary: lines.join('\n'), raw: listJson }
  } catch (err) {
    return { provider: 'gmail', summary: `**Gmail**: Could not fetch (${err instanceof Error ? err.message : String(err)})` }
  }
}

// ── Google Calendar ────────────────────────────────────────────────────────────
export async function fetchCalendarData(accessToken: string, daysAhead = 7): Promise<IntegrationData> {
  try {
    const now     = new Date()
    const future  = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)
    const params  = new URLSearchParams({
      timeMin:      now.toISOString(),
      timeMax:      future.toISOString(),
      maxResults:   '15',
      singleEvents: 'true',
      orderBy:      'startTime',
    })
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) throw new Error(`Calendar: ${res.status}`)
    const json = await res.json() as { items?: Array<{
      summary?: string
      start?: { dateTime?: string; date?: string }
      end?:   { dateTime?: string; date?: string }
      attendees?: Array<{ email: string; displayName?: string }>
      description?: string
    }> }
    const items = json.items ?? []
    if (items.length === 0) {
      return { provider: 'google-calendar', summary: `**Calendar**: No events in the next ${daysAhead} days.` }
    }

    const lines: string[] = [`**Calendar** (next ${daysAhead} days, ${items.length} events):`]
    for (const ev of items) {
      const title     = ev.summary ?? '(untitled)'
      const start     = ev.start?.dateTime ?? ev.start?.date ?? ''
      const attendees = (ev.attendees ?? []).map(a => a.displayName ?? a.email).slice(0, 4).join(', ')
      lines.push(`- ${new Date(start).toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}: ${title}${attendees ? ` [${attendees}]` : ''}`)
    }

    return { provider: 'google-calendar', summary: lines.join('\n'), raw: json }
  } catch (err) {
    return { provider: 'google-calendar', summary: `**Calendar**: Could not fetch (${err instanceof Error ? err.message : String(err)})` }
  }
}

// ── Notion ─────────────────────────────────────────────────────────────────────
export async function fetchNotionData(accessToken: string, maxPages = 10): Promise<IntegrationData> {
  try {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        filter:   { value: 'page', property: 'object' },
        sort:     { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: maxPages,
      }),
    })
    if (!res.ok) throw new Error(`Notion: ${res.status}`)
    const json = await res.json() as { results?: Array<{
      id: string
      last_edited_time: string
      properties?: Record<string, { title?: Array<{ plain_text: string }> }>
      url?: string
    }> }
    const pages = json.results ?? []
    if (pages.length === 0) {
      return { provider: 'notion', summary: '**Notion**: No pages found.' }
    }

    const lines: string[] = [`**Notion** (${pages.length} recently edited pages):`]
    for (const page of pages) {
      // Title extraction: properties.title or properties.Name
      const titleProp = page.properties?.title ?? page.properties?.Name
      const title = titleProp?.title?.[0]?.plain_text ?? '(untitled)'
      const edited = new Date(page.last_edited_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      lines.push(`- ${title} (edited ${edited})`)
    }

    return { provider: 'notion', summary: lines.join('\n'), raw: json }
  } catch (err) {
    return { provider: 'notion', summary: `**Notion**: Could not fetch (${err instanceof Error ? err.message : String(err)})` }
  }
}

// ── HubSpot ────────────────────────────────────────────────────────────────────
export async function fetchHubSpotData(accessToken: string): Promise<IntegrationData> {
  try {
    // Fetch open deals (pipeline stage != closed)
    const res = await fetch(
      'https://api.hubapi.com/crm/v3/objects/deals?limit=15&properties=dealname,amount,dealstage,closedate,hs_last_modified_date&associations=contacts',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) throw new Error(`HubSpot: ${res.status}`)
    const json = await res.json() as { results?: Array<{
      id: string
      properties: { dealname?: string; amount?: string; dealstage?: string; closedate?: string }
    }> }
    const deals = (json.results ?? []).filter(d => {
      const stage = d.properties.dealstage ?? ''
      return !stage.includes('closed') && !stage.includes('won') && !stage.includes('lost')
    })
    if (deals.length === 0) {
      return { provider: 'hubspot', summary: '**HubSpot**: No open deals found.' }
    }

    const lines: string[] = [`**HubSpot** (${deals.length} open deals):`]
    for (const deal of deals.slice(0, 10)) {
      const { dealname = '(unnamed)', amount, dealstage = '', closedate } = deal.properties
      const amt   = amount ? `₹${Number(amount).toLocaleString('en-IN')}` : ''
      const close = closedate ? new Date(closedate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
      lines.push(`- ${dealname}${amt ? ` | ${amt}` : ''}${dealstage ? ` | Stage: ${dealstage}` : ''}${close ? ` | Close: ${close}` : ''}`)
    }

    return { provider: 'hubspot', summary: lines.join('\n'), raw: json }
  } catch (err) {
    return { provider: 'hubspot', summary: `**HubSpot**: Could not fetch (${err instanceof Error ? err.message : String(err)})` }
  }
}

// ── Slack ──────────────────────────────────────────────────────────────────────
export async function fetchSlackData(accessToken: string, maxChannels = 5): Promise<IntegrationData> {
  try {
    // List public channels sorted by activity
    const chRes = await fetch(
      `https://slack.com/api/conversations.list?limit=${maxChannels}&exclude_archived=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!chRes.ok) throw new Error(`Slack channels: ${chRes.status}`)
    const chJson = await chRes.json() as { ok: boolean; channels?: Array<{ id: string; name: string }> }
    if (!chJson.ok) throw new Error('Slack API returned ok=false')
    const channels = (chJson.channels ?? []).slice(0, maxChannels)

    if (channels.length === 0) {
      return { provider: 'slack', summary: '**Slack**: No channels found.' }
    }

    // Fetch last 3 messages from each channel
    const lines: string[] = [`**Slack** (recent activity):`]
    for (const ch of channels) {
      const msgRes = await fetch(
        `https://slack.com/api/conversations.history?channel=${ch.id}&limit=3`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!msgRes.ok) continue
      const msgJson = await msgRes.json() as { ok: boolean; messages?: Array<{ text: string; ts: string }> }
      if (!msgJson.ok) continue
      const msgs = msgJson.messages ?? []
      if (msgs.length === 0) continue
      lines.push(`**#${ch.name}**:`)
      for (const m of msgs) {
        const text = m.text.replace(/<[^>]+>/g, '').slice(0, 120)
        lines.push(`  - ${text}`)
      }
    }

    return { provider: 'slack', summary: lines.join('\n') }
  } catch (err) {
    return { provider: 'slack', summary: `**Slack**: Could not fetch (${err instanceof Error ? err.message : String(err)})` }
  }
}
