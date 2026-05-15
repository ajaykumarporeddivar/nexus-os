'use client'

import { useRef } from 'react'

type Plan = 'free' | 'starter' | 'agency' | 'enterprise'

const PLAN_RANK: Record<Plan, number> = { free: 0, starter: 1, agency: 2, enterprise: 3 }
const PLAN_PRICE: Record<Plan, string> = { free: 'Free', starter: '$49/mo', agency: '$199/mo', enterprise: 'Custom' }

interface Props {
  requiredPlan: Plan
  currentPlan: Plan
  feature: string
  onUpgrade: () => void
  children: React.ReactNode
}

/**
 * PlanGate — wraps a feature with a contextual upsell card when plan < required.
 * Tracks gate hits via localStorage and fires a lead event after 3 hits.
 */
export default function PlanGate({ requiredPlan, currentPlan, feature, onUpgrade, children }: Props) {
  const hasAccess = PLAN_RANK[currentPlan] >= PLAN_RANK[requiredPlan]
  const hitsKey   = `nexus_gate_hits_${feature.replace(/\s+/g, '_')}`
  const firedRef  = useRef(false)

  if (hasAccess) return <>{children}</>

  // Track gate hits and fire lead event at threshold
  if (typeof window !== 'undefined' && !firedRef.current) {
    firedRef.current = true
    const hits = (parseInt(localStorage.getItem(hitsKey) ?? '0', 10) || 0) + 1
    localStorage.setItem(hitsKey, String(hits))
    // Fire behavioral event (non-blocking, best-effort)
    fetch('/api/lead-event', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event: 'plan_gate_hit', meta: { feature, gateHits: hits } }),
    }).catch(() => {})
  }

  return (
    <div style={{
      border:       '1px solid var(--ink2, #2a2a2a)',
      borderRadius: '12px',
      padding:      '24px',
      textAlign:    'center',
      background:   'var(--paper2, #111)',
    }}>
      <div style={{ fontSize: '24px', marginBottom: '12px' }}>🔒</div>
      <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink, #e5e5e5)', margin: '0 0 6px' }}>
        {feature}
      </p>
      <p style={{ fontSize: '12px', color: 'var(--ink3, #888)', margin: '0 0 16px', lineHeight: 1.5 }}>
        Available on the <strong style={{ color: 'var(--acid, #c8ff00)' }}>
          {requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} plan
        </strong> ({PLAN_PRICE[requiredPlan]})
      </p>
      <button
        onClick={onUpgrade}
        style={{
          background:   'var(--acid, #c8ff00)',
          color:        '#000',
          fontWeight:   700,
          fontSize:     '12px',
          padding:      '10px 20px',
          borderRadius: '8px',
          border:       'none',
          cursor:       'pointer',
        }}
      >
        Upgrade to {requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} →
      </button>
    </div>
  )
}
