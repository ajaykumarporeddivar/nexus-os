import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — NEXUS OS',
  description: 'Privacy policy for NEXUS OS.',
}

const EFFECTIVE_DATE = '1 May 2025'

export default function PrivacyPage() {
  return (
    <div style={{ background: '#0a0a0f', color: '#e2e8f0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace', minHeight: '100vh', padding: '3rem 2rem' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        <Link href="/" style={{ color: '#a78bfa', textDecoration: 'none', fontSize: '0.85rem' }}>← NEXUS OS</Link>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '2rem', marginBottom: '0.5rem', color: '#f1f5f9' }}>Privacy Policy</h1>
        <p style={{ color: '#475569', fontSize: '0.85rem', marginBottom: '3rem' }}>Effective date: {EFFECTIVE_DATE}</p>

        {[
          {
            title: '1. What we collect',
            body: 'We collect: (a) Account data — name, email address, and authentication provider when you sign up; (b) Usage data — pipeline inputs, generated outputs, and quota usage to provide the Service; (c) Payment data — order IDs and plan status (we never store full card numbers; payments are processed by Razorpay); (d) Technical data — IP address, browser type, and access logs for security and abuse prevention.',
          },
          {
            title: '2. How we use your data',
            body: 'We use your data to: provide and improve the Service; send transactional emails (account confirmation, payment receipts, plan changes); detect and prevent abuse; comply with legal obligations. We do not use your pipeline inputs for AI training without your explicit consent.',
          },
          {
            title: '3. Data sharing',
            body: 'We do not sell your personal data. We share data only with: (a) Infrastructure providers (Vercel, Neon/PostgreSQL, Upstash Redis) necessary to run the Service; (b) Resend for transactional email delivery; (c) Anthropic for AI inference (your prompts are processed per Anthropic\'s data policies); (d) Razorpay for payment processing; (e) Law enforcement when required by valid legal process.',
          },
          {
            title: '4. Data retention',
            body: 'Account data is retained while your account is active and for 90 days after deletion. Pipeline outputs are stored for 30 days and then purged unless you export or save them. Payment records are retained for 7 years for tax and compliance purposes.',
          },
          {
            title: '5. Your rights (GDPR / CCPA)',
            body: 'You have the right to: access your personal data; correct inaccurate data; delete your account and associated data; export your data in machine-readable format; opt out of non-essential data processing. To exercise these rights, email support@nexus-os.ai.',
          },
          {
            title: '6. Cookies',
            body: 'We use strictly necessary cookies for session authentication (NextAuth session token). We do not use advertising or tracking cookies. We do not use third-party analytics services that track you across sites.',
          },
          {
            title: '7. Security',
            body: 'We use industry-standard measures: TLS in transit, encrypted storage at rest, access controls, and regular security audits. No method of transmission or storage is 100% secure. We will notify you promptly in the event of a data breach affecting your personal data.',
          },
          {
            title: '8. Children',
            body: 'The Service is not directed to children under 16. We do not knowingly collect data from children. If you believe a child has provided us with personal data, contact us and we will delete it.',
          },
          {
            title: '9. Changes to this policy',
            body: 'We may update this policy. We will notify you by email or in-app notice at least 14 days before material changes take effect.',
          },
          {
            title: '10. Contact',
            body: 'For privacy questions or to exercise your rights: support@nexus-os.ai',
          },
        ].map(({ title, body }) => (
          <div key={title} style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#a78bfa', marginBottom: '0.5rem' }}>{title}</h2>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.7 }}>{body}</p>
          </div>
        ))}

        <div style={{ borderTop: '1px solid #1e1e2e', paddingTop: '2rem', marginTop: '2rem', display: 'flex', gap: '2rem', fontSize: '0.8rem' }}>
          <Link href="/terms" style={{ color: '#a78bfa', textDecoration: 'none' }}>Terms of Service</Link>
          <Link href="/" style={{ color: '#475569', textDecoration: 'none' }}>Home</Link>
        </div>
      </div>
    </div>
  )
}
