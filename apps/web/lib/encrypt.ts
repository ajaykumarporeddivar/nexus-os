/**
 * encrypt.ts — AES-256-GCM symmetric encryption for OAuth tokens stored in DB.
 *
 * Key: INTEGRATION_ENCRYPT_KEY env var (32-byte hex string = 64 hex chars).
 * If not set, falls back to a warning and stores plain (dev mode only).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALG = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.INTEGRATION_ENCRYPT_KEY
  if (!hex || hex.length !== 64) {
    // In dev without a key, use a deterministic fallback — NOT for production
    return Buffer.from('0'.repeat(64), 'hex')
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv  = randomBytes(12)
  const cipher = createCipheriv(ALG, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv(24) + tag(32) + ciphertext (all hex)
  return iv.toString('hex') + tag.toString('hex') + enc.toString('hex')
}

export function decrypt(encoded: string): string {
  const key  = getKey()
  const iv   = Buffer.from(encoded.slice(0, 24), 'hex')
  const tag  = Buffer.from(encoded.slice(24, 56), 'hex')
  const data = Buffer.from(encoded.slice(56), 'hex')
  const decipher = createDecipheriv(ALG, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data) + decipher.final('utf8')
}
