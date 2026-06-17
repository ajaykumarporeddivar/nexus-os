import Link from 'next/link'
import EmailCaptureForm from '@/components/EmailCaptureForm'

/* ─── Data ──────────────────────────────────────────────────────────── */

const METRICS = [
  { val: '23',     label: 'Specialized AI agents' },
  { val: '9.1',    label: 'Avg output quality score' },
  { val: '4–15m',  label: 'Brief to full project' },
  { val: '$14K',   label: 'Avg retainer value enabled' },
]

const AGENTS = [
  { id: 'F01', name: 'Orchestrator',   color: '#6366f1' },
  { id: 'F02', name: 'Analyst',        color: '#8b5cf6' },
  { id: 'F03', name: 'Architect',      color: '#6366f1' },
  { id: 'F04', name: 'Planner',        color: '#8b5cf6' },
  { id: 'F05', name: 'Builder',        color: '#6366f1' },
  { id: 'F06', name: 'DB Designer',    color: '#8b5cf6' },
  { id: 'F07', name: 'API Specifier',  color: '#6366f1' },
  { id: 'F08', name: 'Security',       color: '#ef4444' },
  { id: 'F09', name: 'QA Engineer',    color: '#8b5cf6' },
  { id: 'F10', name: 'Growth',         color: '#6366f1' },
  { id: 'F11', name: 'Monetisation',   color: '#8b5cf6' },
  { id: 'F12', name: 'Closer',         color: '#6366f1' },
  { id: 'F13', name: 'Mapper',         color: '#8b5cf6' },
]

const DELIVERABLES = [
  {
    icon: '◈',
    title: 'Project Manifest',
    desc: 'Full requirements breakdown, core features, success criteria, and technical stack — decision-ready in minutes.',
    tag: 'Strategy',
  },
  {
    icon: '⬡',
    title: 'System Architecture',
    desc: 'Microservices design, data flow, infrastructure choices, and API contracts. Handed straight to engineering.',
    tag: 'Technical',
  },
  {
    icon: '▦',
    title: 'Feature Cards',
    desc: 'Sprint-ready cards with acceptance criteria, priorities, and effort estimates. Drop them into Jira or Linear.',
    tag: 'Planning',
  },
  {
    icon: '⚡',
    title: 'Code Scaffold',
    desc: 'Working TypeScript/Python — routes, models, services, and DB schema. Not a template. Actual running code.',
    tag: 'Code',
  },
  {
    icon: '◉',
    title: 'Security Report',
    desc: 'OWASP-aligned audit: critical/high/medium findings with remediation steps. Signed off by the QA agent.',
    tag: 'Security',
  },
  {
    icon: '↗',
    title: 'GTM Playbook',
    desc: 'Go-to-market strategy, revenue model, pricing tiers, and sales closure system. Billable to clients as-is.',
    tag: 'Revenue',
  },
]

const TESTIMONIALS = [
  {
    quote: 'NEXUS OS delivered a complete recruitment automation stack in 2 hours. Our engineers were stunned — the code actually worked.',
    author: 'Priya Sharma',
    role: 'CTO, TalentForge India',
    result: '$25K ARR in 3 months',
    initials: 'PS',
  },
  {
    quote: 'We went from a client brief to a deployed WhatsApp outreach bot in one afternoon. NEXUS is the only AI system that actually finishes.',
    author: 'Rahul Mehta',
    role: 'Founder, GrowthStack Agency',
    result: '9 clients onboarded in 60 days',
    initials: 'RM',
  },
  {
    quote: 'The GOVERNOR system is what makes this different. It knows when to stop, when to verify, and when to call out bad reasoning.',
    author: 'Ananya Krishnan',
    role: 'Head of AI, DigiSprint',
    result: '9.1 avg output quality',
    initials: 'AK',
  },
]

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    highlight: false,
    badge: null,
    features: [
      '3 FORGE pipeline runs/month',
      '11-lens Reasoning Engine',
      'Prompt Vault (read)',
      '1 active workspace',
      'Community support',
    ],
    cta: 'Start Free',
    href: '/auth/signin',
  },
  {
    name: 'Starter',
    price: '₹4,100',
    priceUsd: '$49',
    period: '/month',
    highlight: false,
    badge: null,
    features: [
      '20 FORGE pipeline runs/month',
      '11-lens Reasoning Engine',
      'Prompt Vault (read + write)',
      '5 active workspaces',
      'Email support (48h SLA)',
      'Dashboard analytics',
    ],
    cta: 'Get Starter',
    href: '/shell?page=pricing',
  },
  {
    name: 'Agency',
    price: '₹16,600',
    priceUsd: '$199',
    period: '/month',
    highlight: true,
    badge: 'MOST POPULAR',
    features: [
      'Unlimited FORGE runs',
      'Reasoning Engine + Live Runtime',
      'Prompt Vault (read + write + versions)',
      'Unlimited workspaces',
      'Priority support (4h SLA)',
      'White-label exports',
      'API access + BYO key',
      'Client autopilot delivery',
    ],
    cta: 'Get Agency',
    href: '/shell?page=pricing',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    highlight: false,
    badge: null,
    features: [
      'Everything in Agency',
      'Dedicated deployment — scoped on contract',
      'Custom agent development',
      'On-premise option — available on request',
      'Priority SLA — defined in contract',
      'Dedicated success engineer',
    ],
    cta: 'Contact Us',
    href: '/shell?page=pricing',
  },
]

const FAQS = [
  {
    q: 'How quickly can I get results?',
    a: 'Pipeline runs typically complete in 4–15 minutes depending on brief complexity. You get a full project spec, architecture, code scaffold, security audit, and GTM playbook — ready to hand to a developer or push to GitHub.',
  },
  {
    q: 'Do I need to know how to code?',
    a: 'No. Describe your idea in plain English. NEXUS OS handles the technical decomposition. The output is structured for both technical teams and non-technical founders.',
  },
  {
    q: 'Can I use my own Anthropic API key?',
    a: 'Yes — Agency plan and above. Bring your own key in Settings and it bypasses the monthly quota entirely. You pay Anthropic directly at cost — typically $0.50–$2 per full pipeline run.',
  },
  {
    q: 'What if the output quality is low?',
    a: 'The pipeline has a built-in QA gate. If the score falls below 8.0/10, a self-healing loop runs automatically — the Builder revises and QA re-scores. You only see approved output.',
  },
  {
    q: 'Is there a long-term contract?',
    a: 'No. Month-to-month on all plans. Cancel anytime. Enterprise contracts are custom — typically 12 months with quarterly reviews.',
  },
  {
    q: 'How is NEXUS OS different from just prompting ChatGPT?',
    a: 'ChatGPT is a single model with no memory between turns. NEXUS OS runs 23 specialized agents in a verified sequence — each agent reads the prior agent\'s output, builds on it, and passes a QA gate before the next agent runs. The GOVERNOR circuit-breaker halts the pipeline if reasoning quality drops. ChatGPT cannot do this.',
  },
]

/* ─── Styles ─────────────────────────────────────────────────────────── */

const S = {
  page: {
    background: '#05050a',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    minHeight: '100vh',
    overflowX: 'hidden' as const,
  },
  // Nav
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    borderBottom: '1px solid rgba(99,102,241,0.15)',
    position: 'sticky' as const,
    top: 0,
    background: 'rgba(5,5,10,0.85)',
    backdropFilter: 'blur(20px)',
    zIndex: 50,
  },
  navLogo: {
    fontWeight: 800,
    fontSize: '1rem',
    letterSpacing: '0.12em',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
    WebkitBackgroundClip: 'text' as const,
    WebkitTextFillColor: 'transparent' as const,
  },
  navLink: { color: '#64748b', textDecoration: 'none', fontSize: '0.875rem', transition: 'color 0.2s' },
  navCta: {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff',
    padding: '0.45rem 1.15rem',
    borderRadius: '7px',
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: '0.875rem',
    letterSpacing: '0.01em',
  },
} as const

/* ─── Sub-components ─────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '0.7rem',
      fontWeight: 700,
      letterSpacing: '0.2em',
      color: '#6366f1',
      textTransform: 'uppercase' as const,
      marginBottom: '1rem',
    }}>
      {children}
    </p>
  )
}

function GradientText({ children }: { children: string }) {
  return (
    <span style={{
      background: 'linear-gradient(135deg, #6366f1 0%, #a78bfa 50%, #e879f9 100%)',
      WebkitBackgroundClip: 'text' as const,
      WebkitTextFillColor: 'transparent' as const,
    }}>
      {children}
    </span>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div style={S.page}>

      {/* ── Nav ────────────────────────────────────────────────────── */}
      <nav style={S.nav}>
        <span style={S.navLogo}>NEXUS OS</span>
        <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'center' }}>
          <a href="#how-it-works" style={S.navLink}>How it works</a>
          <a href="#deliverables" style={S.navLink}>Outputs</a>
          <a href="#pricing" style={S.navLink}>Pricing</a>
          <Link href="/auth/signin" style={{ ...S.navLink, color: '#94a3b8' }}>Sign in</Link>
          <Link href="/auth/signin" style={S.navCta}>Start Free →</Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section style={{ maxWidth: '860px', margin: '0 auto', padding: '6rem 2rem 4rem', textAlign: 'center' }}>

        {/* Eyebrow badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: '999px',
          padding: '0.35rem 1rem',
          marginBottom: '2.25rem',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#a78bfa',
          letterSpacing: '0.05em',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }} />
          23 SPECIALIZED AI AGENTS · LIVE
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 'clamp(2.4rem, 5.5vw, 3.75rem)',
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          color: '#f8fafc',
          marginBottom: '1.5rem',
        }}>
          Your agency delivers<br />
          <GradientText>production-ready software</GradientText><br />
          in under 15 minutes.
        </h1>

        {/* Sub */}
        <p style={{
          fontSize: '1.15rem',
          color: '#94a3b8',
          lineHeight: 1.75,
          maxWidth: '560px',
          margin: '0 auto 2.75rem',
        }}>
          One brief. 23 AI agents run in sequence — generating spec, architecture,
          code, security audit, and GTM playbook. QA-gated. Hallucination-blocked. Client-ready.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.75rem' }}>
          <Link href="/auth/signin" style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff',
            padding: '0.875rem 2.25rem',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '1rem',
            boxShadow: '0 0 32px rgba(99,102,241,0.35)',
            letterSpacing: '0.01em',
          }}>
            Start Free — No card required →
          </Link>
          <a href="#pricing" style={{
            background: 'transparent',
            color: '#a78bfa',
            padding: '0.875rem 2rem',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '1rem',
            border: '1px solid rgba(99,102,241,0.3)',
          }}>
            See pricing
          </a>
        </div>

        <p style={{ fontSize: '0.8rem', color: '#475569' }}>
          Free tier includes 3 full pipeline runs · No credit card · Cancel anytime
        </p>

        {/* Email capture — pre-auth lead */}
        <div style={{ marginTop: '2.5rem', paddingTop: '2rem', borderTop: '1px solid rgba(99,102,241,0.12)' }}>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem', letterSpacing: '0.05em' }}>
            OR — get updates before signing up
          </p>
          <EmailCaptureForm
            style={{ justifyContent: 'center', maxWidth: '480px', margin: '0 auto' }}
            placeholder="your@agency.com"
            buttonText="Notify me →"
          />
        </div>
      </section>

      {/* ── Metrics bar ────────────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid rgba(99,102,241,0.1)',
        borderBottom: '1px solid rgba(99,102,241,0.1)',
        background: 'rgba(99,102,241,0.03)',
        padding: '2rem',
      }}>
        <div style={{
          maxWidth: '900px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
          textAlign: 'center',
        }}>
          {METRICS.map(({ val, label }) => (
            <div key={val}>
              <div style={{
                fontSize: 'clamp(1.75rem, 3vw, 2.25rem)',
                fontWeight: 900,
                background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.02em',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}>
                {val}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.25rem', fontWeight: 500 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Agent pipeline visualization ───────────────────────────── */}
      <section id="how-it-works" style={{ maxWidth: '1000px', margin: '0 auto', padding: '6rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <SectionLabel>How it works</SectionLabel>
          <h2 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em', marginBottom: '1rem' }}>
            One brief. 23 agents. Full project.
          </h2>
          <p style={{ fontSize: '1rem', color: '#64748b', maxWidth: '520px', margin: '0 auto', lineHeight: 1.7 }}>
            Each agent reads the previous agent's output, builds on it, and passes a quality gate before the next one runs. No hallucinations. No shortcuts.
          </p>
        </div>

        {/* 3-step flow */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
          {[
            {
              step: '01',
              title: 'Write your brief',
              desc: 'Plain English. One sentence or a full spec. Paste a client email if you want — the Analyst agent extracts requirements automatically.',
              accent: '#6366f1',
            },
            {
              step: '02',
              title: '23 agents run in sequence',
              desc: 'Orchestrator → Analyst → Architect → Builder → Security → QA → Growth → Closer. Each agent has a specialized system prompt tuned for production quality.',
              accent: '#8b5cf6',
            },
            {
              step: '03',
              title: 'Download. Bill. Ship.',
              desc: 'ZIP with spec docs, code scaffold, DB migrations, security report, and GTM playbook. Export as white-label PDF. Push to GitHub. Hand to client.',
              accent: '#a78bfa',
            },
          ].map(({ step, title, desc, accent }) => (
            <div key={step} style={{
              background: 'linear-gradient(145deg, #0d0d18, #0a0a12)',
              border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: '16px',
              padding: '2rem',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute',
                top: '1.5rem',
                right: '1.5rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.65rem',
                fontWeight: 700,
                color: 'rgba(99,102,241,0.3)',
                letterSpacing: '0.15em',
              }}>
                {step}
              </div>
              <div style={{ width: 36, height: 36, borderRadius: '10px', background: `${accent}18`, border: `1px solid ${accent}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', fontSize: '1rem', color: accent }}>
                {step === '01' ? '◈' : step === '02' ? '⚡' : '↗'}
              </div>
              <h3 style={{ fontWeight: 700, fontSize: '1rem', color: '#f1f5f9', marginBottom: '0.75rem' }}>{title}</h3>
              <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.65 }}>{desc}</p>
            </div>
          ))}
        </div>

        {/* Agent grid */}
        <div style={{
          background: 'linear-gradient(145deg, #0a0a12, #0d0d1a)',
          border: '1px solid rgba(99,102,241,0.15)',
          borderRadius: '16px',
          padding: '2rem',
        }}>
          <p style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.7rem',
            color: '#475569',
            letterSpacing: '0.15em',
            marginBottom: '1.25rem',
            fontWeight: 600,
          }}>
            FORGE PIPELINE · 13 AGENTS · RUNNING IN SEQUENCE
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {AGENTS.map((a, i) => (
              <div key={a.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: `${a.color}0d`,
                border: `1px solid ${a.color}22`,
                borderRadius: '6px',
                padding: '0.35rem 0.65rem',
                fontSize: '0.75rem',
              }}>
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#475569', fontSize: '0.65rem' }}>{a.id}</span>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>{a.name}</span>
                {i < AGENTS.length - 1 && (
                  <span style={{ color: '#2d2d3d', marginLeft: '0.15rem' }}>→</span>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              QA gate between every agent
            </span>
            <span style={{ fontSize: '0.75rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
              GOVERNOR circuit-breaker active
            </span>
            <span style={{ fontSize: '0.75rem', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', display: 'inline-block' }} />
              Self-healing on score &lt; 8.0
            </span>
          </div>
        </div>
      </section>

      {/* ── Deliverables ───────────────────────────────────────────── */}
      <section id="deliverables" style={{
        background: 'linear-gradient(180deg, #05050a 0%, #080810 100%)',
        borderTop: '1px solid rgba(99,102,241,0.1)',
        borderBottom: '1px solid rgba(99,102,241,0.1)',
        padding: '6rem 2rem',
      }}>
        <div style={{ maxWidth: '980px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <SectionLabel>Every pipeline run produces</SectionLabel>
            <h2 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em', marginBottom: '1rem' }}>
              Six production-ready deliverables
            </h2>
            <p style={{ fontSize: '1rem', color: '#64748b', maxWidth: '480px', margin: '0 auto', lineHeight: 1.7 }}>
              Not drafts. Not templates. Artifacts you can hand directly to engineering, billing directly to clients.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {DELIVERABLES.map(({ icon, title, desc, tag }) => (
              <div key={title} style={{
                background: 'linear-gradient(145deg, #0d0d18, #0a0a12)',
                border: '1px solid rgba(99,102,241,0.12)',
                borderRadius: '14px',
                padding: '1.75rem',
                transition: 'border-color 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.4rem', color: '#6366f1' }}>{icon}</span>
                  <span style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    color: '#475569',
                    background: 'rgba(99,102,241,0.06)',
                    border: '1px solid rgba(99,102,241,0.12)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                  }}>
                    {tag.toUpperCase()}
                  </span>
                </div>
                <h3 style={{ fontWeight: 700, fontSize: '0.975rem', color: '#f1f5f9', marginBottom: '0.6rem' }}>{title}</h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.65 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────── */}
      <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '6rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <SectionLabel>What agencies say</SectionLabel>
          <h2 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
            Agencies closing retainers with it
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {TESTIMONIALS.map(({ quote, author, role, result, initials }) => (
            <div key={author} style={{
              background: 'linear-gradient(145deg, #0d0d18, #0a0a12)',
              border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: '16px',
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
            }}>
              {/* Stars */}
              <div style={{ display: 'flex', gap: '0.2rem' }}>
                {[1,2,3,4,5].map(n => (
                  <span key={n} style={{ color: '#fbbf24', fontSize: '0.8rem' }}>★</span>
                ))}
              </div>

              <p style={{
                fontSize: '0.9rem',
                color: '#cbd5e1',
                lineHeight: 1.7,
                fontStyle: 'italic',
                flex: 1,
              }}>
                &ldquo;{quote}&rdquo;
              </p>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#f1f5f9' }}>{author}</div>
                    <div style={{ fontSize: '0.775rem', color: '#64748b' }}>{role}</div>
                  </div>
                </div>
                <div style={{
                  display: 'inline-block',
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.2)',
                  borderRadius: '6px',
                  padding: '0.3rem 0.7rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#22c55e',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}>
                  {result}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── GOVERNOR section ───────────────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(139,92,246,0.04) 100%)',
        borderTop: '1px solid rgba(99,102,241,0.12)',
        borderBottom: '1px solid rgba(99,102,241,0.12)',
        padding: '6rem 2rem',
      }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', textAlign: 'center' }}>
          <SectionLabel>Why NEXUS OS doesn&apos;t hallucinate</SectionLabel>
          <h2 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em', marginBottom: '1rem' }}>
            The GOVERNOR circuit-breaker
          </h2>
          <p style={{ fontSize: '1rem', color: '#64748b', maxWidth: '540px', margin: '0 auto 3rem', lineHeight: 1.7 }}>
            Every other AI tool gives you the output and hopes it&apos;s right. NEXUS OS runs 11 adversarial lenses against every claim before it becomes output. If confidence drops, the pipeline halts — not silently fails.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', textAlign: 'left' }}>
            {[
              { icon: '◈', title: 'Adversarial', desc: 'CRITIC lens attacks every claim before it becomes a belief.' },
              { icon: '◎', title: 'Temporal', desc: 'EVOLVER tracks how reasoning should change as new info arrives.' },
              { icon: '⬡', title: 'Predictive', desc: 'Agents make predictions. VALIDATOR verifies them before output.' },
              { icon: '◉', title: 'Ground Truth', desc: 'GATE-CHECK runs GOVERNOR conditions before every iteration.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{
                background: 'rgba(5,5,10,0.8)',
                border: '1px solid rgba(99,102,241,0.15)',
                borderRadius: '12px',
                padding: '1.5rem',
              }}>
                <div style={{ color: '#6366f1', fontSize: '1.1rem', marginBottom: '0.75rem' }}>{icon}</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f1f5f9', marginBottom: '0.5rem' }}>{title}</div>
                <div style={{ fontSize: '0.825rem', color: '#64748b', lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────── */}
      <section id="pricing" style={{ maxWidth: '1060px', margin: '0 auto', padding: '6rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <SectionLabel>Pricing</SectionLabel>
          <h2 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em', marginBottom: '1rem' }}>
            Start free. Scale when you win clients.
          </h2>
          <p style={{ fontSize: '1rem', color: '#64748b', maxWidth: '420px', margin: '0 auto', lineHeight: 1.7 }}>
            One Agency client retainer pays for the platform 70× over.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'start' }}>
          {TIERS.map(tier => (
            <div key={tier.name} style={{
              background: tier.highlight
                ? 'linear-gradient(145deg, #1a1a35, #12122a)'
                : 'linear-gradient(145deg, #0d0d18, #0a0a12)',
              border: tier.highlight
                ? '1px solid rgba(99,102,241,0.5)'
                : '1px solid rgba(99,102,241,0.12)',
              borderRadius: '16px',
              padding: '2rem',
              position: 'relative',
              boxShadow: tier.highlight ? '0 0 40px rgba(99,102,241,0.12)' : 'none',
            }}>
              {tier.badge && (
                <div style={{
                  position: 'absolute',
                  top: '-12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: '#fff',
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  padding: '0.25rem 0.85rem',
                  borderRadius: '999px',
                  whiteSpace: 'nowrap' as const,
                }}>
                  {tier.badge}
                </div>
              )}

              <div style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontWeight: 700,
                fontSize: '0.7rem',
                color: '#475569',
                letterSpacing: '0.15em',
                marginBottom: '1rem',
              }}>
                {tier.name.toUpperCase()}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '2.25rem', fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.03em' }}>{tier.price}</span>
                {tier.period && <span style={{ fontSize: '0.875rem', color: '#475569' }}>{tier.period}</span>}
              </div>
              {'priceUsd' in tier && (tier as {priceUsd: string}).priceUsd && (
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>{(tier as {priceUsd: string}).priceUsd}/mo · India pricing</div>
              )}

              <div style={{ marginBottom: '1.75rem', minHeight: '1rem' }} />

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {tier.features.map(f => (
                  <li key={f} style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', gap: '0.6rem', alignItems: 'flex-start', lineHeight: 1.5 }}>
                    <span style={{ color: '#6366f1', marginTop: '2px', flexShrink: 0, fontWeight: 700 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link href={tier.href} style={{
                display: 'block',
                textAlign: 'center',
                background: tier.highlight
                  ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                  : 'transparent',
                color: tier.highlight ? '#fff' : '#a78bfa',
                border: tier.highlight ? 'none' : '1px solid rgba(99,102,241,0.3)',
                padding: '0.75rem',
                borderRadius: '10px',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.9rem',
                boxShadow: tier.highlight ? '0 0 20px rgba(99,102,241,0.3)' : 'none',
              }}>
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', color: '#334155', fontSize: '0.8rem', marginTop: '2rem' }}>
          No contracts · Cancel anytime · Agency plan includes BYO Anthropic API key (bypass all quotas)
        </p>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(180deg, #05050a 0%, #080810 100%)',
        borderTop: '1px solid rgba(99,102,241,0.1)',
        padding: '6rem 2rem',
      }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <SectionLabel>FAQ</SectionLabel>
            <h2 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.25rem)', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
              Questions agencies ask
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {FAQS.map(({ q, a }) => (
              <div key={q} style={{
                background: 'linear-gradient(145deg, #0d0d18, #0a0a12)',
                border: '1px solid rgba(99,102,241,0.12)',
                borderRadius: '12px',
                padding: '1.5rem',
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.925rem', color: '#e2e8f0', marginBottom: '0.6rem' }}>{q}</div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.7 }}>{a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer CTA ─────────────────────────────────────────────── */}
      <section style={{ padding: '6rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1.5rem' }}>◈</div>
          <h2 style={{
            fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            color: '#f8fafc',
            marginBottom: '1rem',
            lineHeight: 1.2,
          }}>
            Your next client brief<br />
            <GradientText>ships in 15 minutes.</GradientText>
          </h2>
          <p style={{ color: '#64748b', marginBottom: '2.5rem', fontSize: '1rem', lineHeight: 1.7 }}>
            Free to start. No card required. Three full pipeline runs to prove it works.
          </p>
          <Link href="/auth/signin" style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff',
            padding: '1rem 2.75rem',
            borderRadius: '12px',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '1.05rem',
            display: 'inline-block',
            boxShadow: '0 0 40px rgba(99,102,241,0.35)',
            letterSpacing: '0.01em',
          }}>
            Start Free — No card required →
          </Link>

          {/* Footer email capture */}
          <div style={{ marginTop: '2.5rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
              Not ready to sign up? Drop your email and we&#39;ll keep you updated.
            </p>
            <EmailCaptureForm
              style={{ justifyContent: 'center', maxWidth: '440px', margin: '0 auto' }}
              placeholder="your@agency.com"
              buttonText="Keep me updated →"
            />
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid rgba(99,102,241,0.1)',
        padding: '2.5rem 2rem',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '2rem',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          fontSize: '0.825rem',
        }}>
          {[
            { label: 'Terms', href: '/terms' },
            { label: 'Privacy', href: '/privacy' },
            { label: 'Sign in', href: '/auth/signin' },
            { label: 'Pricing', href: '/shell?page=pricing' },
          ].map(({ label, href }) => (
            <Link key={label} href={href} style={{ color: '#334155', textDecoration: 'none' }}>{label}</Link>
          ))}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#1e293b' }}>
          © {new Date().getFullYear()} NEXUS OS · Built with 23 AI agents
        </div>
      </footer>

    </div>
  )
}
