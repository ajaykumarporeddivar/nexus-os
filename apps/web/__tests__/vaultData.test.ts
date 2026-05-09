import { describe, it, expect } from 'vitest'
import { VAULT_DATA } from '../lib/vaultData'

describe('VAULT_DATA', () => {
  it('has exactly 8 vault items', () => {
    expect(VAULT_DATA.length).toBe(8)
  })

  it('all vault items have required fields', () => {
    for (const item of VAULT_DATA) {
      expect(item.id).toBeTruthy()
      expect(item.title).toBeTruthy()
      expect(item.prompt.length).toBeGreaterThan(200)
      expect(item.scoring.length).toBeGreaterThan(0)
      expect(item.variants.length).toBeGreaterThan(0)
    }
  })

  it('every item has an Overall score', () => {
    for (const item of VAULT_DATA) {
      const overall = item.scoring.find(s => s.label === 'Overall')
      expect(overall).toBeDefined()
      expect(overall?.score).toBeGreaterThan(0)
    }
  })

  it('all expected vault IDs exist', () => {
    const ids = VAULT_DATA.map(v => v.id)
    const expected = ['bakery', 'generic', 'linkedin', 'email', 'seo', 'jd', 'report', 'whatsapp']
    for (const id of expected) {
      expect(ids).toContain(id)
    }
  })
})
