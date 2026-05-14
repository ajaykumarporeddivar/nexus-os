import Link from 'next/link'

const OUTPUTS = [
  { icon: '📋', title: 'Project Manifest', desc: 'Full requirements breakdown, core features, success criteria, and technical stack.' },
  { icon: '🏗️', title: 'System Architecture', desc: 'Microservices design, data flow diagrams, infrastructure choices, and API contracts.' },
  { icon: '🃏', title: 'Feature Cards', desc: 'Sprint-ready feature cards with acceptance criteria, priorities, and effort estimates.' },
  { icon: '⚡', title: 'Code Scaffold', desc: 'Working TypeScript/Python code — routes, models, services, and database schema.' },
  { icon: '🔒', title: 'Security Report', desc: 'OWASP-aligned audit: critical/high/medium findings with remediation steps included.' },
  { icon: '🚀', title: 'GTM Playbook', desc: 'Go-to-market strategy, revenue model, pricing tiers, and sales closure system.' },
]

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    highlight: false,
    features: [
      '3 FORGE pipeline runs/month',
      'Reasoning Engine (all 11 lenses)',
      'Prompt Vault (read)',
      '1 active workspace',
      'Community support',
    ],
    cta: 'Start Free',
    href: '/auth/signin',
  },
  {
    name: 'Starter',
    price: '$49',
    period: '/month',
    highlight: false,
    features: [
      '20 FORGE pipeline runs/month',
      'Reasoning Engine (all 11 lenses)',
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
    price: '$199',
    period: '/month',
    highlight: true,
    features: [
      'Unlimited FORGE runs',
      'Reasoning Engine + Live Runtime',
      'Prompt Vault (read + write + versions)',
      'Unlimited workspaces',
      'Priority support (4h SLA)',
      'White-label exports',
      'API access',
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
    features: [
      'Everything in Agency',
      'Dedicated instance',
      'Custom agent development',
      'On-premise option',
      '99.9% uptime SLA',
      'Dedicated success engineer',
    ],
    cta: 'Contact Us',
    href: '/shell?page=pricing',
  },
]

const FAQS = [
  {
    q: 'How quickly can I get results?',
    a: 'Most pipeline runs complete in under 10 minutes. You get a full project spec, architecture, code scaffold, security audit, and GTM playbook — ready to hand to a developer or push to GitHub.',
  },
  {
    q: 'Do I need to know how to code?',
    a: 'No. Describe your idea in plain English. NEXUS OS handles the technical decomposition. The output is structured for both technical teams and non-technical founders.',
  },
  {
    q: 'Can I use my own Anthropic API key?',
    a: 'Yes. Bring your own key in Settings and it bypasses the monthly quota entirely. You pay Anthropic directly at cost — typically $0.50–$2 per full pipeline run.',
  },
  {
    q: 'What if the output quality is low?',
    a: 'The pipeline has a built-in QA gate. If the score falls below 8.0/10, a self-healing loop runs automatically — the Builder revises and QA re-scores. You only see approved output.',
  },
  {
    q: 'Is there a long-term contract?',
    a: 'No. Month-to-month on all plans. Cancel anytime. Enterprise contracts are custom — typically 12 months with quarterly reviews.',
  },
]

export default function LandingPage() {
  return (
    <div style={{ background: '#0a0a0f', color: '#e2e8f0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace', minHeight: '100vh' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 2rem', borderBottom: '1px solid #1e1e2e', position: 'sticky', top: 0, background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(12px)', zIndex: 50 }}>
        <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.1em', color: '#a78bfa' }}>NEXUS OS</span>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
          <a href="#how-it-works" style={{ color: '#94a3b8', textDecoration: 'none' }}>How it works</a>
          <a href="#what-you-get" style={{ color: '#94a3b8', textDecoration: 'none' }}>Outputs</a>
          <a href="#pricing" style={{ color: '#94a3b8', textDecoration: 'none' }}>Pricing</a>
          <Link href="/auth/signin" style={{ background: '#8b5cf6', color: '#fff', padding: '0.45rem 1.1rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>Sign in</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: '800px', margin: '0 auto', padding: '5rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: '#1e1b4b', color: '#a78bfa', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', padding: '0.35rem 0.9rem', borderRadius: '999px', marginBottom: '2rem', border: '1px solid #4c1d95' }}>
          23 SPECIALIZED AI AGENTS · ONE PROMPT
        </div>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1.5rem', color: '#f1f5f9' }}>
          Build production-ready<br />software in{' '}
          <span style={{ color: '#a78bfa' }}>10 minutes</span>
        </h1>
        <p style={{ fontSize: '1.15rem', color: '#94a3b8', lineHeight: 1.7, marginBottom: '2.5rem', maxWidth: '580px', margin: '0 auto 2.5rem' }}>
          Describe your idea. NEXUS OS runs 23 AI agents in parallel — generating spec, architecture, code, database schema, security audit, and GTM playbook automatically.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/auth/signin" style={{ background: '#8b5cf6', color: '#fff', padding: '0.8rem 2rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 700, fontSize: '1rem' }}>
            Start Free →
          </Link>
          <a href="#pricing" style={{ background: 'transparent', color: '#a78bfa', padding: '0.8rem 2rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '1rem', border: '1px solid #4c1d95' }}>
            See Pricing
          </a>
        </div>
      </section>

      {/* Proof bar */}
      <div style={{ borderTop: '1px solid #1e1e2e', borderBottom: '1px solid #1e1e2e', padding: '1.25rem 2rem' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '2.5rem', fontSize: '0.8rem', color: '#64748b', letterSpacing: '0.08em', fontWeight: 600 }}>
          {['23 SPECIALIZED AGENTS', 'ONE-CLICK GITHUB DEPLOY', 'BUILT-IN SECURITY AUDIT', 'QA SELF-HEALING LOOP', 'GTM + SALES PLAYBOOK', 'BRING YOUR OWN API KEY'].map(t => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>

      {/* How it works */}
      <section id="how-it-works" style={{ maxWidth: '860px', margin: '0 auto', padding: '5rem 2rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem', color: '#f1f5f9' }}>How it works</h2>
        <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '3rem', fontSize: '0.95rem' }}>Three steps. No configuration. No waiting.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
          {[
            { step: '01', title: 'Describe your idea', desc: 'Paste a plain-English description of what you want to build. One sentence or ten paragraphs — the agents handle the rest.' },
            { step: '02', title: '23 agents run in parallel', desc: 'Orchestrator, Analyst, Architect, Planner, Builder, Security, QA, Growth, Monetisation, Closer — and 13 more — all run in sequence with full context sharing.' },
            { step: '03', title: 'Download your project', desc: 'Spec docs, code scaffold, DB migrations, security report, and GTM playbook delivered as a ZIP. Push to GitHub in one click.' },
          ].map(({ step, title, desc }) => (
            <div key={step} style={{ background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#4c1d95', fontWeight: 700, letterSpacing: '0.12em', marginBottom: '0.75rem' }}>{step}</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#e2e8f0', marginBottom: '0.6rem' }}>{title}</div>
              <div style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* What you get */}
      <section id="what-you-get" style={{ background: '#0d0d18', borderTop: '1px solid #1e1e2e', borderBottom: '1px solid #1e1e2e', padding: '5rem 2rem' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem', color: '#f1f5f9' }}>What you get</h2>
          <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '3rem', fontSize: '0.95rem' }}>Every pipeline run produces six production-ready deliverables.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
            {OUTPUTS.map(({ icon, title, desc }) => (
              <div key={title} style={{ background: '#0a0a0f', border: '1px solid #1e1e2e', borderRadius: '10px', padding: '1.5rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{icon}</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#e2e8f0', marginBottom: '0.5rem' }}>{title}</div>
                <div style={{ fontSize: '0.825rem', color: '#64748b', lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ maxWidth: '1000px', margin: '0 auto', padding: '5rem 2rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem', color: '#f1f5f9' }}>Simple pricing</h2>
        <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '3rem', fontSize: '0.95rem' }}>Start free. Upgrade when you need more runs.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
          {TIERS.map(tier => (
            <div key={tier.name} style={{ background: tier.highlight ? '#1e1b4b' : '#0f0f1a', border: `1px solid ${tier.highlight ? '#6d28d9' : '#1e1e2e'}`, borderRadius: '12px', padding: '1.75rem', position: 'relative' }}>
              {tier.highlight && (
                <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: '#7c3aed', color: '#fff', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', padding: '0.25rem 0.75rem', borderRadius: '999px' }}>MOST POPULAR</div>
              )}
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#94a3b8', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>{tier.name.toUpperCase()}</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f1f5f9', marginBottom: '0' }}>{tier.price}</div>
              <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '1.5rem' }}>{tier.period || ' '}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {tier.features.map(f => (
                  <li key={f} style={{ fontSize: '0.825rem', color: '#94a3b8', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <span style={{ color: '#7c3aed', marginTop: '1px', flexShrink: 0 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href={tier.href} style={{ display: 'block', textAlign: 'center', background: tier.highlight ? '#7c3aed' : 'transparent', color: tier.highlight ? '#fff' : '#a78bfa', border: tier.highlight ? 'none' : '1px solid #4c1d95', padding: '0.65rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 700, fontSize: '0.875rem' }}>
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: '#475569', fontSize: '0.8rem', marginTop: '1.5rem' }}>
          No contracts. Cancel anytime. Bring your own Anthropic API key to bypass monthly quotas.
        </p>
      </section>

      {/* FAQ */}
      <section style={{ background: '#0d0d18', borderTop: '1px solid #1e1e2e', padding: '5rem 2rem' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 700, marginBottom: '3rem', color: '#f1f5f9' }}>Frequently asked</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {FAQS.map(({ q, a }) => (
              <div key={q} style={{ background: '#0a0a0f', border: '1px solid #1e1e2e', borderRadius: '10px', padding: '1.25rem 1.5rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#e2e8f0', marginBottom: '0.6rem' }}>{q}</div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.65 }}>{a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '1rem', color: '#f1f5f9' }}>
          Start building in 60 seconds
        </h2>
        <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '0.95rem' }}>
          Free to start. No credit card required.
        </p>
        <Link href="/auth/signin" style={{ background: '#8b5cf6', color: '#fff', padding: '0.9rem 2.5rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 700, fontSize: '1.05rem', display: 'inline-block' }}>
          Start Free →
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #1e1e2e', padding: '2rem', textAlign: 'center', fontSize: '0.8rem', color: '#475569' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <Link href="/terms" style={{ color: '#475569', textDecoration: 'none' }}>Terms</Link>
          <Link href="/privacy" style={{ color: '#475569', textDecoration: 'none' }}>Privacy</Link>
          <Link href="/auth/signin" style={{ color: '#475569', textDecoration: 'none' }}>Sign in</Link>
          <Link href="/shell?page=pricing" style={{ color: '#475569', textDecoration: 'none' }}>Pricing</Link>
        </div>
        <div>© {new Date().getFullYear()} NEXUS OS. All rights reserved.</div>
      </footer>
    </div>
  )
}
