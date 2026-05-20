/**
 * leadSecurity.ts — Webhook signature verification utilities.
 */

import crypto from 'crypto'

/**
 * Verifies a Razorpay webhook HMAC-SHA256 signature.
 * Returns true if valid, false otherwise.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret?: string,
): boolean {
  if (!signature) return false
  try {
    const key = secret ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? ''
    if (!key) return false
    const expected = crypto
      .createHmac('sha256', key)
      .update(rawBody)
      .digest('hex')
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
