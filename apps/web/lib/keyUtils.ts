import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

export function getSecret(): Buffer {
  const raw = process.env.ENCRYPTION_SECRET
  if (raw && raw.length === 64) return Buffer.from(raw, 'hex')
  if (process.env.NODE_ENV !== 'production') return Buffer.alloc(32, 0x42)
  throw new Error('ENCRYPTION_SECRET must be a 64-char hex string in production')
}

export function encrypt(plaintext: string): string {
  const iv     = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getSecret(), iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return [iv.toString('hex'), enc.toString('hex'), tag.toString('hex')].join('.')
}

export function decrypt(ciphertext: string): string {
  const [ivHex, encHex, tagHex] = ciphertext.split('.')
  const iv       = Buffer.from(ivHex, 'hex')
  const enc      = Buffer.from(encHex, 'hex')
  const tag      = Buffer.from(tagHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', getSecret(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

export async function getActiveKeyForUser(userId: string): Promise<string | null> {
  try {
    const key = await prisma.apiKey.findFirst({
      where:   { userId, isValid: true },
      orderBy: { createdAt: 'desc' },
    })
    if (!key) return null
    const plaintext = decrypt(key.encryptedKey)
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsed: new Date() } })
    return plaintext
  } catch {
    return null
  }
}
