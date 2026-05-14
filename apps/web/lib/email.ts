import { Resend } from 'resend'
import { brand, appUrl } from './brand'

let _resend: Resend | null = null
function getResend(): Resend | null {
  if (_resend) return _resend
  if (process.env.RESEND_API_KEY) {
    _resend = new Resend(process.env.RESEND_API_KEY)
    return _resend
  }
  return null
}

const FROM = () => process.env.EMAIL_FROM ?? `${brand.name} <noreply@${brand.domain}>`

function baseHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;margin:0;padding:40px 20px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;max-width:520px;margin:0 auto}
  .logo{font-size:11px;letter-spacing:.15em;color:#888;margin-bottom:24px}
  h1{font-size:22px;font-weight:700;margin:0 0 8px;color:#fff}
  .accent{color:#c8ff00}
  p{font-size:14px;color:#aaa;line-height:1.6;margin:8px 0}
  .box{background:#111;border-radius:8px;padding:16px;margin:20px 0;font-size:13px}
  .box span{color:#888;font-size:12px}
  .box strong{color:#e5e5e5;display:block;margin-top:2px}
  .cta{display:inline-block;background:#c8ff00;color:#000;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:20px}
  .footer{font-size:11px;color:#555;margin-top:28px}
  .chip{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:#c8ff0020;color:#c8ff00;border:1px solid #c8ff0040}
</style></head>
<body><div class="card">
  <div class="logo">${brand.name} · ${brand.version}</div>
  <h1>${title}</h1>
  ${body}
  <div class="footer">${brand.name} · ${brand.tagline} · <a href="https://${brand.domain}" style="color:#555">${brand.domain}</a></div>
</div></body></html>`
}

// ── Welcome email (first sign-in) ──────────────────────────────────────────
export function welcomeHtml(name: string): string {
  return baseHtml(
    `Welcome to <span class="accent">${brand.name}</span>`,
    `<p>Hi ${name || 'there'} — you're in. Your workspace is live on the free plan.</p>
     <p>Here's what you can do right now:</p>
     <div class="box">
       <span>FORGE Engine</span><strong>Run your first 23-agent pipeline (3 runs/month on free plan)</strong>
       <span style="margin-top:12px;display:block">Reasoning Engine</span><strong>11-lens hallucination-proof reasoning — unlimited</strong>
       <span style="margin-top:12px;display:block">Prompt Vault</span><strong>Browse and read production-tested agency prompts</strong>
     </div>
     <a href="${appUrl}/shell?page=forge" class="cta">Launch FORGE Engine →</a>
     <p style="margin-top:20px">Need more runs or write access to the Vault? <a href="${appUrl}/shell?page=pricing" style="color:#c8ff00">Upgrade your plan →</a></p>`
  )
}

// ── Plan upgrade confirmation ──────────────────────────────────────────────
const PLAN_LABELS: Record<string, string> = {
  starter:    'Starter — $49/mo',
  agency:     'Agency — $199/mo',
  enterprise: 'Enterprise',
}

const PLAN_FEATURES: Record<string, string[]> = {
  starter: [
    '20 FORGE Engine runs/month',
    'All 11 reasoning lenses',
    'Prompt Vault read access',
    '5 active kits',
  ],
  agency: [
    'Unlimited FORGE Engine runs',
    'Prompt Vault — read + write + version history',
    'Unlimited kits + Agent Editor',
    'Full analytics dashboard',
    'API access — 100K tokens/month',
    'WhatsApp priority support (4h SLA)',
  ],
  enterprise: [
    'Everything in Agency',
    'On-premise Docker deployment',
    'Custom SSO configuration',
    'Dedicated success engineer',
    'SLA: 99.9% uptime',
    'Unlimited API tokens',
  ],
}

export function planUpgradeHtml(opts: {
  name: string
  email: string
  plan: string
  paymentId: string
  orderId: string
  amount: number
}): string {
  const label = PLAN_LABELS[opts.plan] ?? opts.plan
  const features = PLAN_FEATURES[opts.plan] ?? []
  // Show USD display price regardless of INR paise collected by Razorpay
  const PLAN_USD: Record<string, string> = { starter: '$49', agency: '$199', enterprise: 'Custom' }
  const amountStr = PLAN_USD[opts.plan] ?? (opts.amount > 0 ? `$${(opts.amount / 100).toFixed(2)}` : 'Custom')

  return baseHtml(
    `Plan activated <span class="accent">✓</span>`,
    `<p>Hi ${opts.name || opts.email} — your <strong style="color:#fff">${label}</strong> plan is now active.</p>
     <div class="box">
       <span>Plan</span><strong>${label}</strong>
       <span style="margin-top:10px;display:block">Amount paid</span><strong>${amountStr}</strong>
       <span style="margin-top:10px;display:block">Payment ID</span><strong style="font-size:11px;color:#888">${opts.paymentId}</strong>
       <span style="margin-top:10px;display:block">Renews</span><strong>30 days from today</strong>
     </div>
     ${features.length ? `<div class="box">
       <span>What's unlocked</span>
       ${features.map(f => `<strong style="margin-top:6px">✓ ${f}</strong>`).join('')}
     </div>` : ''}
     <a href="${appUrl}/shell" class="cta">Go to your workspace →</a>
     <p style="margin-top:20px;font-size:12px;color:#666">
       Save this email as your receipt. Payment ID: ${opts.paymentId} · Order ID: ${opts.orderId}
     </p>`
  )
}

// ── Internal notification (new payment) ────────────────────────────────────
export function paymentInternalHtml(opts: {
  name: string
  email: string
  plan: string
  paymentId: string
  amount: number
}): string {
  const PLAN_USD_INT: Record<string, string> = { starter: '$49', agency: '$199', enterprise: 'Custom' }
  const amountStr = PLAN_USD_INT[opts.plan] ?? (opts.amount > 0 ? `$${(opts.amount / 100).toFixed(2)}` : '$0')
  return `<div style="font-family:monospace;font-size:13px;background:#0f0f0f;color:#e5e5e5;padding:24px;border-radius:8px">
  <strong style="color:#c8ff00">💰 New payment — ${amountStr}</strong><br><br>
  Plan: ${opts.plan}<br>
  Name: ${opts.name || '—'}<br>
  Email: ${opts.email}<br>
  Payment ID: ${opts.paymentId}<br>
  Time: ${new Date().toISOString()}
</div>`
}

// ── Plan expiry notification ────────────────────────────────────────────────
function planExpiryHtml(name: string, plan: string): string {
  return baseHtml(
    `Your ${plan} plan has expired`,
    `<p>Hi ${name || 'there'} — your <strong style="color:#fff">${plan.charAt(0).toUpperCase() + plan.slice(1)}</strong> plan has expired and your account has been moved back to the free tier.</p>
     <p>You still have full access to:</p>
     <div class="box">
       <span>Free Plan</span><strong>3 FORGE pipeline runs/month — no credit card needed</strong>
       <span style="margin-top:10px;display:block">Reasoning Engine</span><strong>All 11 lenses — unlimited</strong>
       <span style="margin-top:10px;display:block">Prompt Vault</span><strong>Read access to all prompts</strong>
     </div>
     <p>To continue with unlimited runs and all Agency features, renew your plan:</p>
     <a href="${appUrl}/shell?page=pricing" class="cta">Renew now — $199/month →</a>
     <p style="margin-top:20px;font-size:12px;color:#666">Questions? Reply to this email or message us on WhatsApp.</p>`
  )
}

// ── Send helpers ────────────────────────────────────────────────────────────
export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const resend = getResend()
  if (!resend) return
  await resend.emails.send({
    from: FROM(),
    to,
    subject: `Welcome to ${brand.name} — your workspace is live`,
    html: welcomeHtml(name),
  })
}

export async function sendPlanExpiryEmail(opts: {
  to:   string
  name: string
  plan: string
}): Promise<void> {
  const resend = getResend()
  if (!resend) return
  const internalEmail = process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'
  await Promise.all([
    resend.emails.send({
      from:    FROM(),
      to:      opts.to,
      subject: `Your ${brand.name} ${opts.plan} plan has expired — renew to continue`,
      html:    planExpiryHtml(opts.name, opts.plan),
    }),
    resend.emails.send({
      from:    FROM(),
      to:      internalEmail,
      subject: `Plan expired — ${opts.plan} — ${opts.to}`,
      html:    `<div style="font-family:monospace;font-size:13px;background:#0f0f0f;color:#e5e5e5;padding:24px;border-radius:8px">
        <strong style="color:#ff6b6b">⏰ Subscription expired</strong><br><br>
        Plan: ${opts.plan}<br>Email: ${opts.to}<br>Time: ${new Date().toISOString()}
      </div>`,
    }),
  ])
}

export async function sendPlanUpgradeEmail(opts: {
  to: string
  name: string
  email: string
  plan: string
  paymentId: string
  orderId: string
  amount: number
}): Promise<void> {
  const resend = getResend()
  if (!resend) return
  const internalEmail = process.env.INTERNAL_NOTIFY_EMAIL ?? 'aporeddiporeddy8@gmail.com'
  await Promise.all([
    resend.emails.send({
      from: FROM(),
      to: opts.to,
      subject: `${brand.name} ${opts.plan} plan activated ✓ — payment receipt`,
      html: planUpgradeHtml(opts),
    }),
    resend.emails.send({
      from: FROM(),
      to: internalEmail,
      subject: `New payment — ${opts.plan} — ${opts.email}`,
      html: paymentInternalHtml(opts),
    }),
  ])
}
