/**
 * HSF — Human Sovereignty Framework  (AOI v6 Gap 4)
 *
 * 4-level escalation ladder for all pipeline and system actions.
 * Replaces the binary auto/block with graduated human oversight.
 *
 * Levels:
 *   L1 — AUTO:       Execute silently. Log only.
 *   L2 — NOTIFY:     Execute, then notify owner via email.
 *   L3 — RECOMMEND:  Prepare action, send recommendation email, await confirmation.
 *   L4 — HARD GATE:  Never execute autonomously. Require explicit human approval.
 *
 * Actions table maps every significant system action to an HSF level.
 * Notifications fire via Resend to the configured OWNER_EMAIL.
 */

import { Resend } from 'resend'

// ─── HSF Level ──────────────────────────────────────────────────────────────────

export type HsfLevel = 'L1_AUTO' | 'L2_NOTIFY' | 'L3_RECOMMEND' | 'L4_HARD_GATE'

export interface HsfDecision {
  action:      string
  level:       HsfLevel
  allowed:     boolean         // true for L1/L2, false for L3/L4 (pending human)
  notified:    boolean
  description: string
  data?:       Record<string, unknown>
}

// ─── Action → Level mapping ────────────────────────────────────────────────────

const ACTION_LEVELS: Record<string, HsfLevel> = {
  // ── L1: Fully autonomous ──────────────────────────────────────────────────
  'pipeline.forge':                 'L1_AUTO',
  'pipeline.build':                 'L1_AUTO',
  'pipeline.health_check':          'L1_AUTO',
  'cron.trending_refresh':          'L1_AUTO',
  'cron.learning_cycle':            'L1_AUTO',
  'cron.self_heal_check':           'L1_AUTO',
  'cron.lead_dlq_retry':            'L1_AUTO',
  'email.growth_drip':              'L1_AUTO',
  'session.token_refresh':          'L1_AUTO',

  // ── L2: Execute + notify owner ────────────────────────────────────────────
  'user.signup':                    'L2_NOTIFY',
  'payment.verified':               'L2_NOTIFY',
  'payment.failed':                 'L2_NOTIFY',
  'pipeline.qa_below_threshold':    'L2_NOTIFY',
  'pipeline.gate_blocked':          'L2_NOTIFY',
  'pipeline.deploy_success':        'L2_NOTIFY',
  'system.circuit_breaker_open':    'L2_NOTIFY',
  'subscription.cancelled':         'L2_NOTIFY',
  'subscription.expired':           'L2_NOTIFY',
  'cron.self_heal_triggered':       'L2_NOTIFY',
  'user.plan_upgraded':             'L2_NOTIFY',

  // ── L3: Prepare + recommend (require confirmation) ────────────────────────
  'email.bulk_blast':               'L3_RECOMMEND',
  'pipeline.autonomous_deploy':     'L3_RECOMMEND',
  'data.bulk_export':               'L3_RECOMMEND',
  'system.agent_config_change':     'L3_RECOMMEND',

  // ── L4: Never autonomous ──────────────────────────────────────────────────
  'git.push_master':                'L4_HARD_GATE',
  'data.bulk_delete_users':         'L4_HARD_GATE',
  'pricing.change':                 'L4_HARD_GATE',
  'subscription.force_cancel_all':  'L4_HARD_GATE',
  'system.kill_all_agents':         'L4_HARD_GATE',
  'legal.commitment':               'L4_HARD_GATE',
}

export function getHsfLevel(action: string): HsfLevel {
  return ACTION_LEVELS[action] ?? 'L3_RECOMMEND'   // default to safe
}

export function isAllowedAutonomously(action: string): boolean {
  const level = getHsfLevel(action)
  return level === 'L1_AUTO' || level === 'L2_NOTIFY'
}

// ─── Notification templates ────────────────────────────────────────────────────

function buildNotificationEmail(
  action:      string,
  level:       HsfLevel,
  description: string,
  data?:       Record<string, unknown>,
): { subject: string; html: string } {
  const levelColors: Record<HsfLevel, string> = {
    L1_AUTO:       '#666',
    L2_NOTIFY:     '#4ecdc4',
    L3_RECOMMEND:  '#f0c040',
    L4_HARD_GATE:  '#ff6b6b',
  }
  const color   = levelColors[level]
  const appUrl  = process.env.NEXTAUTH_URL ?? 'http://localhost:3005'
  const subject = `[NEXUS OS ${level}] ${description}`

  const dataRows = data ? Object.entries(data)
    .filter(([,v]) => v !== undefined && v !== null)
    .map(([k,v]) => `<tr><td style="color:#666;padding:4px 8px;font-family:monospace;font-size:12px">${k}</td><td style="padding:4px 8px;font-size:12px">${String(v).slice(0,100)}</td></tr>`)
    .join('') : ''

  const html = `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#e5e5e5;font-family:system-ui,sans-serif;padding:32px">
<div style="max-width:480px;margin:0 auto;background:#141414;border:1px solid #222;border-radius:12px;padding:28px">
  <div style="font-size:10px;letter-spacing:.2em;color:#666;text-transform:uppercase;margin-bottom:16px">NEXUS OS · Sovereignty Framework</div>
  <div style="display:inline-block;background:${color}20;color:${color};border:1px solid ${color}30;border-radius:4px;font-size:10px;padding:3px 10px;font-family:monospace;letter-spacing:.1em;margin-bottom:16px">${level}</div>
  <h2 style="font-size:18px;font-weight:700;margin:0 0 12px;color:#fff">${description}</h2>
  <p style="font-size:13px;color:#888;margin:0 0 20px">Action: <code style="color:#ccc">${action}</code></p>
  ${dataRows ? `<table style="width:100%;border-collapse:collapse;background:#111;border-radius:6px;overflow:hidden;margin-bottom:20px">${dataRows}</table>` : ''}
  ${level === 'L2_NOTIFY' ? `<p style="font-size:12px;color:#555">This action was executed automatically. No action required.</p>` : ''}
  ${level === 'L3_RECOMMEND' ? `
    <p style="font-size:12px;color:#f0c040;margin-bottom:16px">⚠️ This action requires your approval before it executes.</p>
    <a href="${appUrl}/shell?page=admin" style="display:inline-block;background:#f0c040;color:#000;font-weight:700;font-size:13px;padding:10px 20px;border-radius:6px;text-decoration:none">Review in Admin →</a>
  ` : ''}
  <div style="margin-top:24px;font-size:11px;color:#333;border-top:1px solid #1e1e1e;padding-top:16px">NEXUS OS · <a href="${appUrl}" style="color:#444">nexus-os.ai</a></div>
</div></body></html>`

  return { subject, html }
}

// ─── Main notification sender ──────────────────────────────────────────────────

export async function notifyOwner(
  action:      string,
  description: string,
  data?:       Record<string, unknown>,
): Promise<boolean> {
  const level     = getHsfLevel(action)
  const ownerEmail = process.env.OWNER_EMAIL ?? process.env.ADMIN_EMAIL ?? 'aporeddiporeddy8@gmail.com'
  const resendKey  = process.env.RESEND_API_KEY

  if (!resendKey) {
    console.warn(`[sovereignty] RESEND not configured — skipping L${level} notification for ${action}`)
    return false
  }
  if (level === 'L1_AUTO') return true  // No notification needed

  try {
    const resend = new Resend(resendKey)
    const { subject, html } = buildNotificationEmail(action, level, description, data)
    await resend.emails.send({
      from:    process.env.EMAIL_FROM ?? 'NEXUS OS <noreply@resend.dev>',
      to:      ownerEmail,
      subject,
      html,
    })
    console.log(`[sovereignty] Notified owner: ${action} (${level})`)
    return true
  } catch (err) {
    console.error(`[sovereignty] Notification failed for ${action}:`, err)
    return false
  }
}

/** Evaluate and enforce HSF for an action. Returns decision object. */
export async function enforceHsf(
  action:      string,
  description: string,
  data?:       Record<string, unknown>,
): Promise<HsfDecision> {
  const level   = getHsfLevel(action)
  const allowed = isAllowedAutonomously(action)

  let notified = false
  if (level === 'L2_NOTIFY' || level === 'L3_RECOMMEND') {
    notified = await notifyOwner(action, description, data)
  }

  return { action, level, allowed, notified, description, data }
}
