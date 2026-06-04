/**
 * NEXUS OS — Niche Vault
 *
 * 20 research-validated high-ticket micro-SaaS niches.
 * Sources: vibrantsnap.com ($1K-$100K MRR study), ideaproof.io (238K complaint analysis),
 *          superframeworks.com (profitable niches), Product Hunt June 2026 trending.
 *
 * Each niche has a production-quality brief that generates a compelling, saleable app.
 * Briefs are written to maximize FORGE QA score and real-world landing page quality.
 */

export interface Niche {
  id:           string
  title:        string           // short product name e.g. "SOC 2 Tracker"
  tagline:      string           // one-line value prop
  vertical:     string           // prisma vertical tag
  category:     string           // ui category
  tier:         'high' | 'mid'  // ticket size
  pricing:      string           // e.g. "$299/mo"
  mrrPotential: string           // e.g. "$20K-50K"
  targetICPs:   string[]         // who pays
  painPoint:    string           // 1-sentence problem
  brief:        string           // full production-quality pipeline brief
  tags:         string[]
}

export const NICHE_VAULT: Niche[] = [
  // ── Tier 1: High-ticket ($199-499/mo) ─────────────────────────────────────

  {
    id:           'soc2-compliance-tracker',
    title:        'SOC 2 Compliance Tracker',
    tagline:      'From audit-terrified to enterprise-ready in 30 days',
    vertical:     'compliance',
    category:     'b2b',
    tier:         'high',
    pricing:      '$299/mo',
    mrrPotential: '$20K-50K',
    targetICPs:   ['B2B SaaS startups seeking enterprise deals', 'CTOs selling to Fortune 500'],
    painPoint:    'Startups lose enterprise deals because SOC 2 audit costs $30K+ and takes 6 months — they need a guided checklist, evidence vault, and audit-ready dashboard.',
    brief:        'Build SOC 2 Compliance Tracker — a guided SaaS for startups pursuing SOC 2 Type II certification. Target customer: B2B SaaS founders and CTOs who need SOC 2 to close enterprise deals. Core workflow: onboard with company profile and target audit date, auto-generate a tailored control checklist (CC6, CC7, CC8, A1, C1 categories), assign controls to team members with due dates, upload evidence artifacts (screenshots, policies, logs) per control, track overall readiness score as a percentage, generate a polished audit-ready report PDF. Dashboard: compliance score gauge (0-100%), controls by status (not started/in progress/complete/not applicable), upcoming deadlines, evidence gaps. Pricing: $299/month (pays back on first enterprise deal worth $50K+). Key differentiator: AI-suggested evidence templates per control — no security expert needed. Revenue model: monthly SaaS + $499 one-time audit prep consultation add-on. Tech: React dashboard with Kanban board, file upload to Vercel Blob, email reminders via Resend.',
    tags:         ['compliance', 'b2b', 'security', 'audit', 'enterprise', 'checklist'],
  },

  {
    id:           'ai-client-portal-agencies',
    title:        'ClientVault — Agency Client Portal',
    tagline:      'Stop chasing clients on Slack — give them a portal',
    vertical:     'agency',
    category:     'b2b',
    tier:         'high',
    pricing:      '$199/mo',
    mrrPotential: '$10K-30K',
    targetICPs:   ['Digital agencies', 'Web design studios', 'Marketing consultancies'],
    painPoint:    'Agencies lose 8 hours/week to client status requests, file deliveries, and invoice chases — a white-label portal eliminates all of it.',
    brief:        'Build ClientVault — a white-label client portal for digital agencies and freelancers. Agency side: create client workspaces, assign projects with Kanban stages (Discovery, Design, Development, Review, Live), upload deliverables per milestone, auto-generate weekly progress report emails, manage invoices (create, send, mark paid). Client side (no login friction — magic link): view project board, approve or request revisions on deliverables, download files, see invoice history and pay via Stripe link, send messages in a threaded inbox. AI feature: auto-draft weekly status update email from project board state — one click to send. Revenue: $199/month per agency (unlimited clients). Key differentiator: clients access via magic link, zero onboarding friction. Monetization hook: agencies save 8h/week — at $150/hr that is $1,200/month in recovered time.',
    tags:         ['agency', 'client-management', 'portal', 'invoicing', 'workflow'],
  },

  {
    id:           'ai-proposal-generator',
    title:        'ProposeAI — Agency Proposal Generator',
    tagline:      'Win more clients with proposals in 5 minutes, not 5 hours',
    vertical:     'agency',
    category:     'b2b',
    tier:         'high',
    pricing:      '$149/mo',
    mrrPotential: '$10K-30K',
    targetICPs:   ['Freelancers', 'Agencies', 'Consultants billing $5K+/project'],
    painPoint:    'Freelancers and agencies spend 5-10 hours writing proposals that look identical to competitors and close at under 20%.',
    brief:        'Build ProposeAI — an AI-powered proposal generator for freelancers and agencies. Core workflow: client fills intake form (project type, budget range, timeline, key deliverables), AI generates a fully-formatted proposal in under 60 seconds covering: executive summary, proposed approach and methodology, deliverable breakdown with timeline, team and credentials, investment breakdown (line items + totals), payment schedule, next steps. Proposal is interactive: client can accept online, request revisions, or schedule a call — all tracked. Analytics: open rate, time spent reading, section drop-off, conversion rate per proposal type. AI improvement loop: tracks which proposal templates and pricing structures win most often, surfaces recommendations. Revenue: $149/month for unlimited proposals. Key differentiator: proposal acceptance rate shown on dashboard — agencies using it average 34% close rate vs 18% industry average. Template library: 20 professional proposal templates by service type.',
    tags:         ['agency', 'proposals', 'ai', 'sales', 'freelance', 'conversion'],
  },

  {
    id:           'healthcare-compliance-docs',
    title:        'ClinixDocs — Healthcare Documentation AI',
    tagline:      'HIPAA-compliant clinical notes in 30 seconds',
    vertical:     'healthcare',
    category:     'health',
    tier:         'high',
    pricing:      '$299/mo',
    mrrPotential: '$15K-40K',
    targetICPs:   ['Private practice clinicians', 'Telehealth providers', 'Therapy practices'],
    painPoint:    'Clinicians spend 2-3 hours/day on documentation — AI clinical note generation recovers 60% of that time.',
    brief:        'Build ClinixDocs — an AI clinical documentation assistant for private practice clinicians and telehealth providers. Core feature: clinician speaks or types session notes in plain language, AI formats them into SOAP format (Subjective, Objective, Assessment, Plan) compliant with insurance billing requirements. Supports: therapy session notes, primary care visits, telehealth consultations. Document library: store all patient notes with search, filter by date/patient/note type. Compliance: HIPAA-aligned data handling notice, audit trail on every note edit, 7-year retention with export. Billing integration: link notes to ICD-10 codes and CPT codes for insurance claims. Practice dashboard: daily notes completed, average documentation time, billable hours recovered. Revenue: $299/month per clinician. Key differentiator: generates note AND the insurance claim simultaneously — saves 45 minutes per patient. Target: 800K private practice clinicians in the US spending $400/mo on EHR systems they hate.',
    tags:         ['healthcare', 'clinical', 'hipaa', 'documentation', 'telehealth', 'billing'],
  },

  {
    id:           'ai-pr-code-reviewer',
    title:        'GuardPR — AI Pull Request Reviewer',
    tagline:      'Catch bugs before your team does',
    vertical:     'devtools',
    category:     'b2b',
    tier:         'high',
    pricing:      '$49/seat/mo',
    mrrPotential: '$10K-50K',
    targetICPs:   ['Engineering teams 5-50 devs', 'Solo founders with contractors', 'CTOs'],
    painPoint:    'PRs get merged with bugs because human reviewers are slow, inconsistent, and miss security issues — AI review is instant and never fatigued.',
    brief:        'Build GuardPR — an AI-powered pull request reviewer that integrates with GitHub. Core: GitHub App that auto-comments on every PR with: security vulnerabilities found (OWASP Top 10), performance issues (N+1 queries, missing indexes), code quality violations (naming, complexity, duplication), suggested fixes with code snippets. Review quality improves over time: learns team coding style from merged PRs, flags deviations from your patterns. Dashboard: PR review history, issues caught by category, estimated time saved, reviewer leaderboard. Team settings: configure severity thresholds, mute specific rule categories, add custom rules in plain English. Revenue: $49/seat/month. Key differentiator: "learns your codebase" — reviews are personalized to your architecture, not generic. Integration: GitHub, GitLab, Bitbucket. MRR potential: $10K-50K (dev tools have 70-85% margins, 24-month average subscription).',
    tags:         ['devtools', 'github', 'code-review', 'security', 'ai', 'engineering'],
  },

  // ── Tier 1: High-ticket continued ─────────────────────────────────────────

  {
    id:           'tenant-communication-platform',
    title:        'LandlordHQ — Property Management for Small Landlords',
    tagline:      'Manage 20 units like you have a full property management team',
    vertical:     'proptech',
    category:     'b2b',
    tier:         'high',
    pricing:      '$99/mo',
    mrrPotential: '$10K-30K',
    targetICPs:   ['Small landlords (5-20 units)', 'Accidental landlords', 'Real estate investors'],
    painPoint:    'Small landlords with 5-20 units lose $500+/month to late rent, missed maintenance, and manual accounting — they cannot afford full property management software.',
    brief:        'Build LandlordHQ — a property management SaaS for small landlords managing 5-20 rental units. Tenant portal: submit maintenance requests with photos, view lease terms, pay rent online (Stripe), receive automated rent reminders. Landlord dashboard: portfolio view (all units, occupancy, rent status), maintenance ticket queue with priority labels, automated rent collection with late-fee enforcement, lease expiry calendar. Financials: income/expense tracker per property, monthly P&L report, Schedule E tax export (US landlord tax form). AI features: AI-drafted maintenance request responses, lease renewal email drafts, screening criteria scoring from rental applications. Revenue: $99/month for up to 20 units, $149 for 50 units. Key differentiator: built specifically for accidental landlords with no property management experience — plain-English guidance throughout. Market: 20 million small landlords in the US; 70% still use spreadsheets.',
    tags:         ['proptech', 'real-estate', 'rental', 'tenant', 'property-management'],
  },

  {
    id:           'ugc-rights-management',
    title:        'UGCVault — Creator Rights & Brand Licensing Platform',
    tagline:      'License your UGC content. Get paid automatically.',
    vertical:     'creator',
    category:     'creator',
    tier:         'high',
    pricing:      '$199/mo',
    mrrPotential: '$10K-30K',
    targetICPs:   ['DTC brands', 'Influencer agencies', 'Content creators with 10K+ followers'],
    painPoint:    'Brands pay $500-5K per UGC video but usage rights expire, license terms are buried in email threads, and creators get screwed when brands reuse without paying.',
    brief:        'Build UGCVault — a creator content rights management and licensing platform. Creator side: upload UGC content (images, videos, reels), set license terms per piece (usage type, duration, platform, exclusivity, price), generate a legally-binding digital license agreement. Brand side: browse creator catalog, request license, sign digitally, pay via Stripe, download licensed content with rights certificate. Rights tracking: auto-flag when license is expiring, send renewal offer to brand, track revenue per content piece. Portfolio analytics: total earnings, license renewal rate, top-performing content, brand repeat purchase rate. Escrow: payment held until creator approves the intended usage. Revenue: 8% platform fee on transactions + $199/month for agency seats. Key differentiator: license expiry enforcement — automated renewal emails sent 30 days before expiry with one-click renewal.',
    tags:         ['creator', 'ugc', 'licensing', 'content', 'brand', 'marketplace'],
  },

  // ── Tier 2: Mid-ticket ($49-149/mo) ───────────────────────────────────────

  {
    id:           'invoice-collections-automation',
    title:        'ChasePay — Invoice Collections Automation',
    tagline:      'Stop chasing invoices. Get paid on time, automatically.',
    vertical:     'fintech',
    category:     'finance',
    tier:         'mid',
    pricing:      '$79/mo',
    mrrPotential: '$5K-20K',
    targetICPs:   ['Freelancers', 'Agencies', 'Consultants with 10+ active clients'],
    painPoint:    'Freelancers lose 5-10% of revenue to late payments — the average late invoice is 27 days overdue because chasing is awkward and time-consuming.',
    brief:        'Build ChasePay — an automated invoice collections SaaS for freelancers and agencies. Core: connect to existing invoicing (import from CSV or create fresh), define a collections schedule per client (Day 3: friendly reminder, Day 7: firmer follow-up, Day 14: final notice with late fee, Day 21: escalation email). AI tone adjustment: friendly vs firm vs urgent based on client relationship score and days overdue. Payment links: every reminder includes a Stripe payment link, one-click pay. Client health score: tracks each client payment history (always early, sometimes late, always late, bad debt risk). Dashboard: outstanding balance by age, cash flow forecast (expected payments next 30 days), collections performance (paid on time rate, average days to pay, total recovered). Analytics: show "you recovered $X in late payments this month." Revenue: $79/month. Key differentiator: AI writes every chase email in your voice — tone calibrated per client relationship.',
    tags:         ['fintech', 'invoicing', 'collections', 'payments', 'freelance', 'automation'],
  },

  {
    id:           'ai-content-repurposer',
    title:        'RepurposeAI — Content Repurposing Engine',
    tagline:      'One long-form → 15 platform-native posts. Automatically.',
    vertical:     'marketing',
    category:     'creator',
    tier:         'mid',
    pricing:      '$49/mo',
    mrrPotential: '$5K-20K',
    targetICPs:   ['Content creators', 'Solopreneurs', 'Agency social media teams'],
    painPoint:    'Content creators publish 1 blog post or podcast and get 10% of the reach they would get by repurposing it — they skip repurposing because it takes 3 hours.',
    brief:        'Build RepurposeAI — an AI content repurposing platform. Input: paste a blog post, YouTube transcript, or podcast transcript. Output in one click: 5 Twitter/X threads (different angles), 3 LinkedIn posts (personal story, insight, opinion angles), 1 Instagram carousel script with slide-by-slide copy, 2 short-form video scripts (TikTok/Reels hooks + body), 1 email newsletter version, 3 quote cards for Stories. Platform-native formatting: each piece is adapted to platform norms — threads are max 280 chars, LinkedIn posts have no external links, video scripts start with pattern-interrupt hook. Brand voice: upload 3 sample pieces, AI learns your writing style and matches it. Content calendar: schedule repurposed content directly to connected platforms. Library: browse all repurposed content, filter by source and platform, one-click edit. Revenue: $49/month for 10 repurposes/month, $99/month unlimited. Key differentiator: brand voice matching — feels like you wrote it.',
    tags:         ['content', 'marketing', 'social-media', 'ai', 'repurposing', 'creator'],
  },

  {
    id:           'competitor-price-monitor',
    title:        'PriceRadar — Competitor Pricing Intelligence',
    tagline:      'Know every time a competitor changes their price',
    vertical:     'analytics',
    category:     'b2b',
    tier:         'mid',
    pricing:      '$79/mo',
    mrrPotential: '$5K-15K',
    targetICPs:   ['SaaS founders', 'E-commerce owners', 'Product managers'],
    painPoint:    'SaaS founders find out a competitor lowered prices from a churned customer 3 months after it happened — real-time pricing intelligence costs $500/mo from enterprise tools.',
    brief:        'Build PriceRadar — a competitor pricing intelligence platform. Core: add competitors by URL (SaaS pricing pages, e-commerce product pages), system scrapes pricing daily, alerts you via email/Slack when anything changes. Tracked data per competitor: price points, plan names, feature inclusions per tier, annual vs monthly discount, free trial terms. Change history: timeline view of every pricing change with before/after diff. Analysis dashboard: side-by-side pricing comparison table across all competitors, your relative price position (cheapest/middle/premium), pricing change velocity per competitor. AI insights: auto-generated competitive positioning recommendation when a competitor changes price ("Acme dropped Pro from $99 to $79 — you are now 60% more expensive at the same tier — consider a response"). Alerts: instant email when price drops >10%, weekly digest of all changes. Revenue: $79/month for up to 10 competitors, $149 for 50. Market: every SaaS and e-commerce founder needs this — currently only enterprise tools serve it.',
    tags:         ['analytics', 'competitive-intelligence', 'pricing', 'monitoring', 'saas'],
  },

  {
    id:           'seo-rank-tracker-niche',
    title:        'RankRadar — Niche SEO Rank Tracker',
    tagline:      'Track your rankings without enterprise pricing',
    vertical:     'seo',
    category:     'b2b',
    tier:         'mid',
    pricing:      '$49/mo',
    mrrPotential: '$10K-30K',
    targetICPs:   ['Indie bloggers', 'Affiliate marketers', 'Small SaaS marketing teams'],
    painPoint:    'Ahrefs costs $99-999/month; indie bloggers and small teams need rank tracking without paying enterprise prices for features they never use.',
    brief:        'Build RankRadar — a focused SEO rank tracker for indie bloggers and small SaaS teams. Core: add domain and keywords (up to 500 on Pro plan), daily rank checks for Google, weekly report emailed automatically. Dashboard: keyword rank table with 30-day trend sparklines, top movers (biggest gains/losses this week), estimated traffic from current rankings, quick wins (keywords ranking 11-20 with high volume — prime for optimization). Site audit: weekly crawl of 1000 pages, flags broken links, missing meta tags, thin content, slow pages. Competitor tracking: add 3 competitors, see their rankings for your same keywords. Reports: branded PDF report for clients (white-label on Agency plan). Revenue: $49/month for 500 keywords, $99/month for 2000 keywords + white-label. Key differentiator: "quick wins" feature — AI identifies keywords one optimization away from page 1, with specific recommendations. Market: 50M bloggers worldwide, 95% using free/no tools.',
    tags:         ['seo', 'rank-tracking', 'analytics', 'content', 'marketing'],
  },

  {
    id:           'customer-health-score-dashboard',
    title:        'PulseScore — Customer Health Score Dashboard',
    tagline:      'Know which customers will churn before they do',
    vertical:     'csm',
    category:     'b2b',
    tier:         'mid',
    pricing:      '$99/mo',
    mrrPotential: '$10K-30K',
    targetICPs:   ['SaaS founders', 'Customer success teams 2-10 people', 'B2B subscription businesses'],
    painPoint:    'SaaS founders discover customer churn when they receive the cancellation — by then it is too late; they need a 30-day early warning system.',
    brief:        'Build PulseScore — a customer health score dashboard for B2B SaaS teams. Core: connect via CSV or API (pull data from Stripe, Intercom, product analytics), compute a health score per customer from: login frequency, feature adoption rate, support ticket volume, payment history, NPS score (if collected), contract age. Health tiers: Green (score 70+, growing), Amber (40-70, at-risk), Red (below 40, churn imminent). Action queue: daily "5 customers need attention today" list with suggested actions (re-onboarding call, feature tutorial, executive sponsor outreach). Revenue at risk: dashboard widget showing MRR tied to Red + Amber accounts. CSM workflow: assign at-risk accounts to team members, log outreach notes, track resolution outcomes. AI insight: "Customers who skip Feature X in their first 30 days churn at 3x the rate — 12 new customers have not used it yet." Revenue: $99/month for teams up to 1,000 customers. Key differentiator: action queue not just a dashboard — tells you what to do, not just what is wrong.',
    tags:         ['csm', 'customer-success', 'churn', 'analytics', 'b2b', 'saas'],
  },

  {
    id:           'async-standup-bot',
    title:        'StandupBot — Async Daily Standup for Remote Teams',
    tagline:      'Replace your 9am meeting with a 2-minute async check-in',
    vertical:     'productivity',
    category:     'productivity',
    tier:         'mid',
    pricing:      '$4/seat/mo',
    mrrPotential: '$5K-20K',
    targetICPs:   ['Remote-first startups', 'Distributed engineering teams', 'Agencies with freelancers'],
    painPoint:    'Remote teams waste 30 minutes/day on standup meetings that should be 3-minute async text updates — the synchronous meeting costs $500/month in lost productivity for a 10-person team.',
    brief:        'Build StandupBot — an async daily standup platform for remote teams. Core: every morning (time set per team), each team member receives a Slack DM or email with 3 questions (What did you do yesterday? What will you do today? Any blockers?). Responses auto-collected and compiled into a shared team digest posted to a Slack channel or email. Dashboard: team standup feed (who responded, who is blocked, response rate trend), individual response history, team mood tracker (optional emoji). Blocker alerts: if someone flags a blocker, manager gets instant notification. Weekly summary: AI-written team summary "This week your team shipped X, Y, Z. Current blockers: A, B." Integrations: Slack, Microsoft Teams, email. Customization: add/remove questions, change standup time per team, set weekend auto-skip. Revenue: $4/seat/month (minimum $20/month). Viral mechanic: team invites teammates — grows per seat. Key differentiator: blocker escalation with context — manager sees the blocker AND 3 days of work context automatically.',
    tags:         ['productivity', 'remote', 'standup', 'slack', 'async', 'team'],
  },

  {
    id:           'social-proof-widget',
    title:        'TrustPop — Social Proof Notification Widget',
    tagline:      'Show visitors what others are buying. Convert 30% more.',
    vertical:     'marketing',
    category:     'ecommerce',
    tier:         'mid',
    pricing:      '$29/mo',
    mrrPotential: '$5K-20K',
    targetICPs:   ['E-commerce stores', 'SaaS landing pages', 'Course creators'],
    painPoint:    'New visitors have no social proof — they leave without buying because they see a blank site with no evidence others trust it; social proof widgets convert 2.5% → 3-4%.',
    brief:        'Build TrustPop — a social proof notification widget for e-commerce and SaaS landing pages. Core: embed a single script tag, widget shows live popups: "Sarah from Austin just purchased [product]", "47 people viewed this page in the last hour", "Only 3 left in stock", "⭐⭐⭐⭐⭐ Mike: Best purchase this year." Data sources: connect Shopify, WooCommerce, or Stripe for real purchase data; optional manual entry; live visitor count from UTM analytics. Widget customization: position (bottom-left/right), dark/light theme, timing (delay, frequency cap), animation style, include/exclude pages. A/B testing: test widget vs no widget, measure conversion rate difference in dashboard. Analytics: popup impressions, click rate, pages with highest social proof impact, revenue attributed to widget. Revenue: $29/month for 1 site, $79/month for 10 sites. Key differentiator: real data from your payment processor, not fake notifications — shows real customer names and products.',
    tags:         ['marketing', 'social-proof', 'conversion', 'ecommerce', 'widget'],
  },

  {
    id:           'ai-meeting-notes',
    title:        'MeetMind — AI Meeting Notes & Action Items',
    tagline:      'Join meetings. Stop taking notes. Never miss an action item.',
    vertical:     'productivity',
    category:     'productivity',
    tier:         'mid',
    pricing:      '$15/seat/mo',
    mrrPotential: '$5K-20K',
    targetICPs:   ['Sales teams', 'Consultants', 'Remote-first startups'],
    painPoint:    'Professionals spend 10+ hours/week in meetings and manually transcribe notes — AI meeting notes save 2h/week per person while producing better action tracking.',
    brief:        'Build MeetMind — an AI meeting notes and action tracking SaaS. Core: join meetings via calendar integration (Google Calendar, Outlook), bot joins Zoom/Teams/Google Meet, records and transcribes, generates: structured meeting summary (3-5 bullets), action items with owner and due date extracted from conversation, key decisions made, follow-up questions. All notes searchable by person, topic, or date. CRM sync: detected action items pushed to connected CRM (HubSpot, Salesforce) as tasks. Smart follow-up: one-click "send follow-up email" that drafts a summary email to all attendees from the notes. Meeting intelligence: tracks which recurring meetings produce the most action items, flags meetings with no clear outcomes. Privacy: opt-in recording with consent notification, data stored in your region. Revenue: $15/seat/month. Integration: Zoom, Teams, Google Meet, Slack (posts summary). Key differentiator: action item ownership extraction — AI identifies who said they would do what, not just what was said.',
    tags:         ['productivity', 'meetings', 'ai', 'notes', 'action-items', 'calendar'],
  },

  {
    id:           'email-warmup-service',
    title:        'WarmInbox — Cold Email Deliverability Warmer',
    tagline:      'Send cold emails that land in inbox, not spam',
    vertical:     'marketing',
    category:     'b2b',
    tier:         'mid',
    pricing:      '$49/mo',
    mrrPotential: '$5K-15K',
    targetICPs:   ['Sales teams', 'Outbound agencies', 'SDRs with new domains'],
    painPoint:    'New email domains get 90% of cold emails flagged as spam — a 30-day warmup process using real inbox-to-inbox interactions fixes deliverability permanently.',
    brief:        'Build WarmInbox — an email domain warmup service that improves cold email deliverability. Core: connect email account (Gmail, Outlook, custom SMTP), bot automatically sends human-like emails to a network of 50K+ warm accounts, those accounts open, reply, and remove from spam — training email providers that your domain is legitimate. Warmup schedule: ramps from 2 emails/day to 50/day over 30 days, following safe warmup curves. Real-time monitoring: inbox placement rate (what % land in primary inbox vs spam vs promotions), sender reputation score from major providers (Gmail, Outlook, Yahoo), blacklist monitoring (immediate alert if domain gets blacklisted). Warmup templates: rotates through 200+ conversation templates across topics (sports, news, business, casual) to look natural. Email health score: 0-100 rating with specific improvement recommendations. Dashboard: daily graphs of inbox rate, reputation score trend, warmup progress. Revenue: $49/month per email account. Key differentiator: 50K+ real mailbox network (not bots) — legitimate open and reply signals.',
    tags:         ['email', 'deliverability', 'cold-email', 'outbound', 'marketing', 'automation'],
  },

  {
    id:           'podcast-guest-matching',
    title:        'PodMatch — Podcast Guest Booking Marketplace',
    tagline:      'Find your perfect podcast guest in 60 seconds',
    vertical:     'creator',
    category:     'creator',
    tier:         'mid',
    pricing:      '$39/mo',
    mrrPotential: '$5K-20K',
    targetICPs:   ['Podcast hosts', 'Authors and thought leaders seeking exposure', 'PR agencies'],
    painPoint:    'Podcast hosts spend 3+ hours finding guests via DMs; thought leaders send 20+ cold pitches for 1 appearance — a matching platform collapses this to minutes.',
    brief:        'Build PodMatch — a two-sided marketplace connecting podcast hosts with guests. Host profile: podcast name, niche, episode count, average downloads, preferred guest type, booking calendar. Guest profile: bio, expertise areas, talking points (3-5 topics), past appearances, speaking fee (paid/free), media kit PDF upload. Matching: host posts an open booking slot with topic focus, AI matches top 5 guests by niche relevance and audience fit, host picks one, automated intro email sent. Guest discovery: search by expertise, follower count, episode experience, availability. Booking flow: host requests guest, guest accepts/declines, calendar invite auto-sent, pre-show questionnaire sent 48h before recording. Reviews: post-episode rating for both host and guest. Revenue: $39/month for hosts (unlimited bookings), $19/month for guests (unlimited pitches). Marketplace dynamic: more guests make hosts more valuable, more hosts make guests more valuable — viral flywheel.',
    tags:         ['podcast', 'creator', 'marketplace', 'booking', 'media', 'networking'],
  },

  {
    id:           'sustainability-esg-tracker',
    title:        'ESGtrack — SMB Sustainability & ESG Reporting',
    tagline:      'EU CSRD compliance without a $50K consultant',
    vertical:     'compliance',
    category:     'b2b',
    tier:         'high',
    pricing:      '$299/mo',
    mrrPotential: '$15K-40K',
    targetICPs:   ['Mid-market EU companies', 'Supply chain vendors of large corporates', 'B-corp applicants'],
    painPoint:    'EU CSRD regulations now require 50K+ companies to report ESG data — most SMBs have no idea where to start and cannot afford a $50K/year sustainability consultant.',
    brief:        'Build ESGtrack — an EU CSRD-ready sustainability and ESG reporting platform for SMBs. Core workflow: company profile setup (industry, size, jurisdiction), auto-generate required disclosure checklist based on CSRD materiality assessment, data collection forms for each metric (Scope 1/2/3 emissions, social metrics, governance policies), calculate GHG emissions from activity data (fuel, electricity, travel, waste), benchmark against industry peers, generate CSRD-compliant report PDF. Automated data imports: electricity bills, travel receipts, supplier surveys. Supplier ESG survey: send questionnaire to your top 20 suppliers, track response rates, aggregate supply chain ESG score. Audit trail: every data point linked to source document (upload or URL). Report formats: CSRD, GRI, TCFD — one dataset, multiple report outputs. Revenue: $299/month. Key differentiator: pre-built CSRD checklist updated automatically when regulations change — never read a regulation PDF again. Market: 50K companies newly subject to CSRD in 2025-2026, no affordable tool exists.',
    tags:         ['esg', 'sustainability', 'compliance', 'csrd', 'reporting', 'eu'],
  },

  {
    id:           'course-completion-analytics',
    title:        'CourseIQ — Course Creator Analytics Platform',
    tagline:      'Know exactly where students quit — and fix it',
    vertical:     'edtech',
    category:     'education',
    tier:         'mid',
    pricing:      '$49/mo',
    mrrPotential: '$5K-15K',
    targetICPs:   ['Course creators on Teachable/Podia/Kajabi', 'Online educators', 'Corporate L&D teams'],
    painPoint:    'Course creators publish courses with 8% average completion rates but have no insight into which lesson causes the drop — fixing one video can double completion rates.',
    brief:        'Build CourseIQ — analytics for online course creators. Connect via API to Teachable, Podia, Kajabi, Thinkific, or upload CSV student progress export. Dashboard: course-level completion funnel (% students who complete each lesson), drop-off heatmap (which lesson loses the most students), engagement score per lesson (time spent vs expected duration), quiz performance by question. Student segments: completers vs quitters (demographic and behavioral differences), at-risk students (enrolled but no activity in 7 days). Intervention automation: trigger email to students who stall at a specific lesson (customizable message per lesson, sent automatically after X days of inactivity). A/B testing: rename a lesson title and see if completion rate changes. Revenue prediction: "If you improve Lesson 7 completion from 40% to 70%, projected certification rate increases by 18%, adding $1,200/month in upsell revenue." Revenue: $49/month per course platform connected. Key differentiator: intervention emails + lesson-level attribution — not just a dashboard, an action system.',
    tags:         ['edtech', 'course', 'analytics', 'completion', 'creator', 'learning'],
  },

  {
    id:           'ai-legal-contract-reviewer',
    title:        'ContractScan — AI Contract Review for Freelancers',
    tagline:      'Know if a contract is fair before you sign it',
    vertical:     'legaltech',
    category:     'b2b',
    tier:         'mid',
    pricing:      '$39/mo',
    mrrPotential: '$5K-15K',
    targetICPs:   ['Freelancers signing NDAs and service agreements', 'Small business owners', 'Startup founders'],
    painPoint:    'Freelancers sign contracts with toxic clauses (unlimited revisions, IP assignment, non-compete) because legal review costs $300+ per contract and lawyers take 3 days.',
    brief:        'Build ContractScan — an AI contract review tool for freelancers and small businesses. Core: upload PDF or paste contract text, AI scans and highlights: red flags (unlimited revision clauses, broad IP assignment, non-compete scope, indemnification exposure, payment terms over 45 days), missing protections (no kill fee, no late payment penalty, no scope change process), industry-standard benchmarks (is this NDA more restrictive than standard?). Output: risk score (0-100), red/yellow/green highlights on contract PDF, plain-English explanation of every flagged clause, suggested replacement language for risky clauses. Comparison: "This contract is 40% more restrictive than the industry standard freelance agreement." Template library: 20 standard contracts (NDA, service agreement, SOW, independent contractor) to use instead. Negotiation helper: AI-drafted email response suggesting specific contract edits with justification. Revenue: $39/month for 10 reviews, $79/month unlimited. Key differentiator: suggested replacement language — not just "this is risky" but "replace with this instead."',
    tags:         ['legaltech', 'contracts', 'ai', 'freelance', 'review', 'nda'],
  },

  {
    id:           'revenue-dashboard-multisource',
    title:        'MRRDash — Bootstrapped Founder Revenue Dashboard',
    tagline:      'All your revenue in one place. Know your MRR, instantly.',
    vertical:     'analytics',
    category:     'b2b',
    tier:         'mid',
    pricing:      '$29/mo',
    mrrPotential: '$5K-20K',
    targetICPs:   ['Bootstrapped SaaS founders', 'Indie hackers', 'Solo founders with multiple income streams'],
    painPoint:    'Solo founders with Stripe + Gumroad + AppSumo + Paddle revenue calculate MRR manually from 4 different dashboards — they have no single accurate view of their business.',
    brief:        'Build MRRDash — a revenue dashboard for bootstrapped founders and indie hackers. Integrations: Stripe, Paddle, Gumroad, LemonSqueezy, AppSumo, PayPal (one-click OAuth connect each). Unified metrics: real MRR (not GMV), ARR, net new MRR (new + expansion - churn - contraction), churn rate, LTV, CAC by acquisition channel. Charts: MRR over time (daily granularity), revenue by product/plan, churn events timeline. Milestones: auto-celebration when you hit $1K, $5K, $10K, $50K MRR — shareable card for Twitter. Goals: set MRR goal, see daily tracker to goal, runway projection based on burn rate. Tax estimate: real-time estimated quarterly tax liability based on revenue and jurisdiction. Founder digest: weekly email with key metrics summary ("You had your best week — $3,240 in new MRR"). Revenue: $29/month — the tool pays for itself the first time you file taxes without spending 4 hours in spreadsheets. Key differentiator: milestone celebrations + shareable MRR cards — viral among indie hacker community.',
    tags:         ['analytics', 'revenue', 'mrr', 'bootstrapped', 'saas', 'indie-hacker'],
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Pick the niche for a given date (UTC day number modulo vault length). */
export function getNicheOfTheDay(date = new Date()): Niche {
  const dayNumber = Math.floor(date.getTime() / 86400000)
  return NICHE_VAULT[dayNumber % NICHE_VAULT.length]
}

/** Pick niche by ID. Returns undefined if not found. */
export function getNicheById(id: string): Niche | undefined {
  return NICHE_VAULT.find(n => n.id === id)
}

/** Get the next N niches starting from today (for preview). */
export function getUpcomingNiches(count = 5, date = new Date()): Niche[] {
  const dayNumber = Math.floor(date.getTime() / 86400000)
  return Array.from({ length: count }, (_, i) =>
    NICHE_VAULT[(dayNumber + i) % NICHE_VAULT.length]
  )
}

/** Returns niches sorted by tier (high first), then MRR potential descending. */
export function getTopNiches(count = 10): Niche[] {
  return [...NICHE_VAULT]
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier === 'high' ? -1 : 1
      const mrrA = parseInt(a.mrrPotential.replace(/[^0-9]/g, ''), 10) || 0
      const mrrB = parseInt(b.mrrPotential.replace(/[^0-9]/g, ''), 10) || 0
      return mrrB - mrrA
    })
    .slice(0, count)
}
