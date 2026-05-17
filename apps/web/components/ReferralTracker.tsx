'use client'

/**
 * ReferralTracker — reads ?ref=CODE from the URL and records the click.
 * Stores the code in sessionStorage so signup/checkout can attribute it.
 * Renders nothing visible.
 */

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export function ReferralTracker() {
  const params = useSearchParams()

  useEffect(() => {
    const code = params.get('ref')
    if (!code) return

    // Store for later attribution (signup, upgrade)
    try { sessionStorage.setItem('nexus-ref-code', code) } catch { /* ignore */ }

    // Track the click — fire-and-forget
    fetch('/api/referral/track', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code, event: 'click' }),
    }).catch(() => {})
  }, [params])

  return null
}
