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
  signature: string,
  secret: string,
): boolean {
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
