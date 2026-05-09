import type { AuditAction } from '@nexus-os/shared-types'

export async function auditEvent(action: AuditAction, meta: Record<string, unknown> = {}) {
  try {
    await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, meta }),
    })
  } catch {
    // non-blocking — audit failure never breaks the UI
  }
}
