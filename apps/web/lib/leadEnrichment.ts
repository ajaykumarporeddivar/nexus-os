/**
 * Lead Enrichment Engine — SME-2 / SME-4
 * Stage: Ingest → Enrich → Score → Route
 *
 * Priority chain:
 *   1. Clearbit Enrichment API  (if CLEARBIT_API_KEY set)
 *   2. Apollo.io People API     (if APOLLO_API_KEY set)
 *   3. Smart domain heuristics  (always — free, instant)
 */

export interface FirmographicData {
  companySize:  number | null    // employee count estimate
  industry:     string | null    // normalised industry label
  location:     string | null    // city/country
  linkedinUrl:  string | null
  website:      string | null
  description:  string | null
  enrichSource: 'clearbit' | 'apollo' | 'heuristic' | 'none'
}

// ── Well-known domain → size/industry heuristics (SME-9 tribal knowledge) ───
const KNOWN_DOMAINS: Record<string, Partial<FirmographicData>> = {
  'google.com':     { companySize: 150000, industry: 'tech',         location: 'Mountain View, US' },
  'microsoft.com':  { companySize: 200000, industry: 'tech',         location: 'Redmond, US' },
  'amazon.com':     { companySize: 1500000, industry: 'tech',        location: 'Seattle, US' },
  'meta.com':       { companySize: 80000,  industry: 'tech',         location: 'Menlo Park, US' },
  'apple.com':      { companySize: 160000, industry: 'tech',         location: 'Cupertino, US' },
  'stripe.com':     { companySize: 7000,   industry: 'fintech',      location: 'San Francisco, US' },
  'vercel.com':     { companySize: 400,    industry: 'SaaS',         location: 'San Francisco, US' },
  'linear.app':     { companySize: 80,     industry: 'SaaS',         location: 'San Francisco, US' },
  'notion.so':      { companySize: 400,    industry: 'SaaS',         location: 'San Francisco, US' },
  'figma.com':      { companySize: 800,    industry: 'SaaS/design',  location: 'San Francisco, US' },
  'clearbit.com':   { companySize: 200,    industry: 'SaaS',         location: 'San Francisco, US' },
  'hubspot.com':    { companySize: 6000,   industry: 'SaaS',         location: 'Cambridge, US' },
  'salesforce.com': { companySize: 70000,  industry: 'SaaS/CRM',     location: 'San Francisco, US' },
  'atlassian.com':  { companySize: 12000,  industry: 'SaaS',         location: 'Sydney, AU' },
  'shopify.com':    { companySize: 10000,  industry: 'SaaS/ecomm',   location: 'Ottawa, CA' },
}

// ── Free-email domains that should NOT be enriched as companies ──────────────
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','protonmail.com',
  'icloud.com','me.com','live.com','msn.com','aol.com','ymail.com',
  'zoho.com','tutanota.com','fastmail.com','rediffmail.com','yahoo.in',
])

// ── Industry normalisation ───────────────────────────────────────────────────
const INDUSTRY_MAP: Record<string, string> = {
  software: 'SaaS', saas: 'SaaS', 'software as a service': 'SaaS',
  'information technology': 'tech', 'computer software': 'SaaS',
  'internet': 'tech', 'technology': 'tech',
  'financial services': 'fintech', 'banking': 'fintech',
  'marketing': 'agency', 'advertising': 'agency',
  'management consulting': 'consulting', 'consulting': 'consulting',
  'healthcare': 'healthtech', 'health care': 'healthtech',
  'e-commerce': 'ecomm', 'retail': 'ecomm',
}
function normaliseIndustry(raw: string | null): string | null {
  if (!raw) return null
  const lower = raw.toLowerCase()
  for (const [k, v] of Object.entries(INDUSTRY_MAP)) {
    if (lower.includes(k)) return v
  }
  return raw
}

// ── Clearbit enrichment ──────────────────────────────────────────────────────
async function clearbitEnrich(email: string): Promise<FirmographicData | null> {
  const key = process.env.CLEARBIT_API_KEY
  if (!key) return null
  try {
    const r = await fetch(`https://person.clearbit.com/v2/combined/find?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return null
    const d = await r.json() as {
      company?: { metrics?: { employees?: number }; category?: { industry?: string }; geo?: { city?: string; country?: string }; domain?: string; description?: string; url?: string }
      person?: { linkedin?: { handle?: string } }
    }
    return {
      companySize:  d.company?.metrics?.employees ?? null,
      industry:     normaliseIndustry(d.company?.category?.industry ?? null),
      location:     d.company?.geo ? `${d.company.geo.city ?? ''}, ${d.company.geo.country ?? ''}`.replace(/^,\s*|,\s*$/, '') : null,
      linkedinUrl:  d.person?.linkedin?.handle ? `https://linkedin.com/in/${d.person.linkedin.handle}` : null,
      website:      d.company?.url ?? null,
      description:  d.company?.description ?? null,
      enrichSource: 'clearbit',
    }
  } catch { return null }
}

// ── Apollo.io enrichment ─────────────────────────────────────────────────────
async function apolloEnrich(email: string): Promise<FirmographicData | null> {
  const key = process.env.APOLLO_API_KEY
  if (!key) return null
  try {
    const r = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ email, reveal_personal_emails: false }),
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) return null
    const d = await r.json() as {
      person?: {
        organization?: { estimated_num_employees?: number; industry?: string; primary_domain?: string; short_description?: string }
        city?: string; country?: string
        linkedin_url?: string
      }
    }
    const org = d.person?.organization
    return {
      companySize:  org?.estimated_num_employees ?? null,
      industry:     normaliseIndustry(org?.industry ?? null),
      location:     d.person?.city ? `${d.person.city}, ${d.person.country ?? ''}` : null,
      linkedinUrl:  d.person?.linkedin_url ?? null,
      website:      org?.primary_domain ? `https://${org.primary_domain}` : null,
      description:  org?.short_description ?? null,
      enrichSource: 'apollo',
    }
  } catch { return null }
}

// ── Domain heuristics fallback (always runs) ─────────────────────────────────
function heuristicEnrich(email: string): FirmographicData {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''

  if (FREE_EMAIL_DOMAINS.has(domain)) {
    return { companySize: null, industry: null, location: null, linkedinUrl: null, website: null, description: null, enrichSource: 'heuristic' }
  }

  const known = KNOWN_DOMAINS[domain]
  if (known) {
    return {
      companySize:  known.companySize ?? null,
      industry:     known.industry ?? null,
      location:     known.location ?? null,
      linkedinUrl:  null,
      website:      `https://${domain}`,
      description:  null,
      enrichSource: 'heuristic',
    }
  }

  // TLD-based industry signals
  const tld = domain.split('.').pop() ?? ''
  const domainBase = domain.split('.').slice(0, -1).join('.') ?? ''
  let industry: string | null = null
  if (['io', 'ai', 'tech', 'dev', 'app'].includes(tld)) industry = 'SaaS/tech'
  if (tld === 'agency') industry = 'agency'
  if (tld === 'finance' || domainBase.includes('bank') || domainBase.includes('fin')) industry = 'fintech'
  if (domainBase.includes('consult')) industry = 'consulting'
  if (domainBase.includes('health') || domainBase.includes('med') || domainBase.includes('clinic')) industry = 'healthtech'
  if (domainBase.includes('agency') || domainBase.includes('studio') || domainBase.includes('creative')) industry = 'agency'
  if (domainBase.includes('saas') || domainBase.includes('platform') || domainBase.includes('cloud')) industry = 'SaaS'

  // G8: Heuristic company size estimate from domain patterns
  // Short 1-word domains (.com) tend to be bigger brands; 2+ word or hyphenated = startup
  let companySize: number | null = null
  const parts = domainBase.split(/[-_.]/)
  if (parts.length === 1 && domainBase.length >= 4 && domainBase.length <= 10 && tld === 'com') {
    companySize = 200  // short memorable .com → likely established company
  } else if (['io', 'ai', 'co'].includes(tld)) {
    companySize = 50   // startup TLDs → seed/series-A range
  } else if (['tech', 'app', 'dev'].includes(tld)) {
    companySize = 25   // product-focused TLDs → small team
  } else if (domainBase.includes('enterprise') || domainBase.includes('corp') || domainBase.includes('global')) {
    companySize = 500  // enterprise keywords → larger org
  } else if (['in', 'uk', 'au', 'ca', 'de', 'fr'].includes(tld)) {
    companySize = 100  // country TLDs → regional businesses
  }

  return {
    companySize,
    industry,
    location:     null,
    linkedinUrl:  null,
    website:      `https://${domain}`,
    description:  null,
    enrichSource: 'heuristic',
  }
}

// ── Main enrichment function (SME-2 Enrich stage) ───────────────────────────
export async function enrichLead(email: string): Promise<FirmographicData> {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''

  // Skip API enrichment for free-email domains (SME-9 tribal: don't disqualify)
  if (FREE_EMAIL_DOMAINS.has(domain)) {
    return heuristicEnrich(email)
  }

  // Try Clearbit first, then Apollo, then heuristics
  const clearbit = await clearbitEnrich(email)
  if (clearbit) return clearbit

  const apollo = await apolloEnrich(email)
  if (apollo) return apollo

  return heuristicEnrich(email)
}

// ── Merge enrichment into existing firmographic (don't overwrite real data) ──
export function mergeFirmographic(
  existing: FirmographicData | null,
  fresh: FirmographicData,
): FirmographicData {
  if (!existing) return fresh
  return {
    companySize:  existing.companySize  ?? fresh.companySize,
    industry:     existing.industry     ?? fresh.industry,
    location:     existing.location     ?? fresh.location,
    linkedinUrl:  existing.linkedinUrl  ?? fresh.linkedinUrl,
    website:      existing.website      ?? fresh.website,
    description:  existing.description  ?? fresh.description,
    enrichSource: (existing.enrichSource !== 'heuristic' && existing.enrichSource !== 'none')
                    ? existing.enrichSource
                    : fresh.enrichSource,
  }
}
