/**
 * Industry Taxonomy — static constant, not stored in DB.
 * Maps to the 8 TrendingItem niches for backward compatibility.
 *
 * Top-level: 15 industries.
 * Each industry has 5–10 subcategories.
 * nicheMapping: maps each industry to the closest TrendingItem niche.
 */

export interface TaxonomyNode {
  id:            string
  label:         string
  subcategories: TaxonomySubcategory[]
  nicheMapping:  string   // maps to TrendingItem.category niche
  forgeVertical?: string  // maps to detectVertical() return value (if applicable)
}

export interface TaxonomySubcategory {
  id:    string
  label: string
}

export const INDUSTRY_TAXONOMY: TaxonomyNode[] = [
  {
    id:           'healthcare',
    label:        'Healthcare',
    nicheMapping: 'health',
    subcategories: [
      { id: 'medical-billing',    label: 'Medical Billing & RCM' },
      { id: 'telehealth',         label: 'Telehealth & Remote Care' },
      { id: 'wellness-clinics',   label: 'Wellness & Fitness Clinics' },
      { id: 'mental-health',      label: 'Mental Health Platforms' },
      { id: 'dental',             label: 'Dental Practice Management' },
      { id: 'pharmacy',           label: 'Pharmacy & Medication' },
      { id: 'home-care',          label: 'Home Health Care' },
      { id: 'veterinary',         label: 'Veterinary Practice' },
    ],
  },
  {
    id:           'legal',
    label:        'Legal',
    nicheMapping: 'b2b',
    subcategories: [
      { id: 'contract-management', label: 'Contract Management' },
      { id: 'case-management',     label: 'Case & Matter Management' },
      { id: 'client-intake',       label: 'Client Intake & CRM' },
      { id: 'compliance',          label: 'Compliance & Regulatory' },
      { id: 'billing-timekeeping', label: 'Legal Billing & Timekeeping' },
      { id: 'ip-trademark',        label: 'IP & Trademark Management' },
    ],
  },
  {
    id:           'finance',
    label:        'Finance',
    nicheMapping: 'finance',
    subcategories: [
      { id: 'accounting',          label: 'Accounting & Bookkeeping' },
      { id: 'invoice-ap',          label: 'Invoicing & AP Automation' },
      { id: 'expense-management',  label: 'Expense Management' },
      { id: 'financial-planning',  label: 'Financial Planning & Advisory' },
      { id: 'payroll',             label: 'Payroll & HR Finance' },
      { id: 'tax',                 label: 'Tax Preparation & Compliance' },
      { id: 'lending',             label: 'Lending & Credit' },
      { id: 'insurance',           label: 'Insurance & Risk' },
    ],
  },
  {
    id:           'ecommerce',
    label:        'E-Commerce',
    nicheMapping: 'ecommerce',
    forgeVertical: 'ecommerce',
    subcategories: [
      { id: 'shopify-ops',       label: 'Shopify Store Operations' },
      { id: 'returns-refunds',   label: 'Returns & Refund Management' },
      { id: 'inventory',         label: 'Inventory & Procurement' },
      { id: 'marketplace',       label: 'Marketplace Selling (Amazon/eBay)' },
      { id: 'dropshipping',      label: 'Dropshipping & Print-on-Demand' },
      { id: 'subscription-box',  label: 'Subscription Box Commerce' },
      { id: 'b2b-wholesale',     label: 'B2B Wholesale & Distribution' },
    ],
  },
  {
    id:           'marketing',
    label:        'Marketing & Agencies',
    nicheMapping: 'b2b',
    subcategories: [
      { id: 'digital-agencies',  label: 'Digital Marketing Agencies' },
      { id: 'content-ops',       label: 'Content Operations' },
      { id: 'seo',               label: 'SEO & Search Marketing' },
      { id: 'paid-ads',          label: 'Paid Ads & PPC Management' },
      { id: 'social-media-mgmt', label: 'Social Media Management' },
      { id: 'email-marketing',   label: 'Email Marketing' },
      { id: 'influencer',        label: 'Influencer & Creator Marketing' },
      { id: 'pr-comms',          label: 'PR & Communications' },
    ],
  },
  {
    id:           'education',
    label:        'Education',
    nicheMapping: 'education',
    subcategories: [
      { id: 'online-courses',    label: 'Online Courses & LMS' },
      { id: 'tutoring',          label: 'Tutoring & Test Prep' },
      { id: 'k12',               label: 'K-12 School Admin' },
      { id: 'corporate-training', label: 'Corporate Training & L&D' },
      { id: 'language-learning', label: 'Language Learning' },
      { id: 'cohort-programs',   label: 'Cohort-Based Programs' },
    ],
  },
  {
    id:           'real-estate',
    label:        'Real Estate',
    nicheMapping: 'finance',
    subcategories: [
      { id: 'property-management', label: 'Property Management' },
      { id: 'real-estate-crm',     label: 'Real Estate CRM & Leads' },
      { id: 'listing-management',  label: 'Listing & MLS Management' },
      { id: 'construction',        label: 'Construction & Renovation' },
      { id: 'commercial-re',       label: 'Commercial Real Estate' },
    ],
  },
  {
    id:           'logistics',
    label:        'Logistics & Supply Chain',
    nicheMapping: 'ecommerce',
    subcategories: [
      { id: 'freight',           label: 'Freight & Shipping' },
      { id: 'last-mile',         label: 'Last-Mile Delivery' },
      { id: 'warehouse',         label: 'Warehouse Management' },
      { id: 'fleet-mgmt',        label: 'Fleet Management' },
      { id: 'import-export',     label: 'Import/Export & Customs' },
    ],
  },
  {
    id:           'hr',
    label:        'HR & People Ops',
    nicheMapping: 'b2b',
    subcategories: [
      { id: 'recruiting',        label: 'Recruiting & ATS' },
      { id: 'onboarding',        label: 'Employee Onboarding' },
      { id: 'performance',       label: 'Performance Management' },
      { id: 'benefits',          label: 'Benefits Administration' },
      { id: 'workforce-planning', label: 'Workforce Planning & Scheduling' },
      { id: 'offboarding',       label: 'Offboarding & Compliance' },
    ],
  },
  {
    id:           'developer-tools',
    label:        'Developer Tools',
    nicheMapping: 'ai-tools',
    subcategories: [
      { id: 'devops',            label: 'DevOps & CI/CD' },
      { id: 'api-management',    label: 'API Management & Testing' },
      { id: 'code-review',       label: 'Code Review & Quality' },
      { id: 'monitoring',        label: 'Monitoring & Observability' },
      { id: 'internal-tools',    label: 'Internal Tools & Admin Panels' },
      { id: 'no-code',           label: 'No-Code & Low-Code Builders' },
    ],
  },
  {
    id:           'creator',
    label:        'Creator Economy',
    nicheMapping: 'creator',
    subcategories: [
      { id: 'content-creators',  label: 'Content Creators & YouTubers' },
      { id: 'newsletters',       label: 'Newsletters & Writers' },
      { id: 'podcasters',        label: 'Podcasters & Audio' },
      { id: 'freelancers',       label: 'Freelancers & Solopreneurs' },
      { id: 'sponsorships',      label: 'Brand Deals & Sponsorships' },
      { id: 'community-ops',     label: 'Community Operations' },
    ],
  },
  {
    id:           'manufacturing',
    label:        'Manufacturing',
    nicheMapping: 'b2b',
    subcategories: [
      { id: 'quality-control',   label: 'Quality Control & Inspection' },
      { id: 'production-planning', label: 'Production Planning & Scheduling' },
      { id: 'equipment-maintenance', label: 'Equipment & Maintenance' },
      { id: 'supplier-mgmt',     label: 'Supplier Management' },
    ],
  },
  {
    id:           'hospitality',
    label:        'Hospitality & Food Service',
    nicheMapping: 'b2b',
    subcategories: [
      { id: 'restaurant-ops',    label: 'Restaurant Operations' },
      { id: 'hotel-management',  label: 'Hotel & Accommodation' },
      { id: 'catering',          label: 'Catering & Events' },
      { id: 'reservations',      label: 'Reservations & Booking' },
    ],
  },
  {
    id:           'non-profit',
    label:        'Non-Profit & NGO',
    nicheMapping: 'b2b',
    subcategories: [
      { id: 'donor-management',  label: 'Donor Management & Fundraising' },
      { id: 'volunteer-ops',     label: 'Volunteer Management' },
      { id: 'grant-management',  label: 'Grant Management' },
      { id: 'program-delivery',  label: 'Program Delivery & Impact' },
    ],
  },
  {
    id:           'government',
    label:        'Government & Public Sector',
    nicheMapping: 'b2b',
    subcategories: [
      { id: 'permitting',        label: 'Permitting & Licensing' },
      { id: 'citizen-services',  label: 'Citizen Services Portal' },
      { id: 'procurement',       label: 'Government Procurement' },
      { id: 'compliance-audit',  label: 'Compliance & Audit' },
    ],
  },
]

/** Flat map: industry id → niche mapping (for trending query filters) */
export const INDUSTRY_TO_NICHE: Record<string, string> = Object.fromEntries(
  INDUSTRY_TAXONOMY.map(n => [n.id, n.nicheMapping])
)

/** Flat map: industry id → forge vertical */
export const INDUSTRY_TO_VERTICAL: Record<string, string> = Object.fromEntries(
  INDUSTRY_TAXONOMY.filter(n => n.forgeVertical).map(n => [n.id, n.forgeVertical!])
)

/** All valid industry IDs */
export const VALID_INDUSTRY_IDS = new Set(INDUSTRY_TAXONOMY.map(n => n.id))

/** All valid subcategory IDs (flat, cross-industry) */
export const VALID_SUBCATEGORY_IDS = new Set(
  INDUSTRY_TAXONOMY.flatMap(n => n.subcategories.map(s => s.id))
)

/** Get a taxonomy node by industry id. Returns undefined if not found. */
export function getTaxonomyNode(industryId: string): TaxonomyNode | undefined {
  return INDUSTRY_TAXONOMY.find(n => n.id === industryId)
}

/** Get subcategory labels for an industry. Returns empty array for unknown industry. */
export function getSubcategoryLabels(industryId: string, subcategoryIds: string[]): string[] {
  const node = getTaxonomyNode(industryId)
  if (!node) return subcategoryIds  // fallback to raw IDs
  const labelMap = new Map(node.subcategories.map(s => [s.id, s.label]))
  return subcategoryIds.map(id => labelMap.get(id) ?? id)
}

/**
 * Freshness TTL by niche category (in hours).
 * Fast-moving categories expire sooner; evergreen categories last longer.
 */
export const NICHE_FRESHNESS_TTL_HOURS: Record<string, number> = {
  'ai-tools':    24,   // fast-moving — expires in 1 day
  'productivity': 72,
  'b2b':         48,
  'creator':     48,
  'finance':     96,
  'health':      120,
  'education':   96,
  'ecommerce':   48,
}

/** Default TTL for unknown niches */
export const DEFAULT_FRESHNESS_TTL_HOURS = 72

/** Compute freshUntil date from niche */
export function computeFreshUntil(niche: string): Date {
  const hours = NICHE_FRESHNESS_TTL_HOURS[niche] ?? DEFAULT_FRESHNESS_TTL_HOURS
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}
