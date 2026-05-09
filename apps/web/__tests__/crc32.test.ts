import { describe, it, expect } from 'vitest'
import { crc32, formatCRC32 } from '../lib/crc32'

describe('crc32', () => {
  it('returns a number', () => {
    expect(typeof crc32('hello')).toBe('number')
  })

  it('is deterministic', () => {
    expect(crc32('test string')).toBe(crc32('test string'))
  })

  it('different inputs produce different checksums', () => {
    expect(crc32('abc')).not.toBe(crc32('xyz'))
  })

  it('formats as 8-char hex', () => {
    const result = formatCRC32('hello world')
    expect(result).toMatch(/^CRC32 [0-9A-F]{8}$/)
  })

  it('empty string returns consistent value', () => {
    expect(typeof crc32('')).toBe('number')
  })
})
