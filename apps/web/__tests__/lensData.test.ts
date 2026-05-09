import { describe, it, expect } from 'vitest'
import { LENSES, LENS_MAP } from '../lib/lensData'

describe('LENSES', () => {
  it('has exactly 11 lenses', () => {
    expect(LENSES.length).toBe(11)
  })

  it('has a GOVERNOR lens of type gov', () => {
    const gov = LENSES.find(l => l.id === 'governor')
    expect(gov).toBeDefined()
    expect(gov?.type).toBe('gov')
  })

  it('all lenses have required fields', () => {
    for (const lens of LENSES) {
      expect(lens.id).toBeTruthy()
      expect(lens.name).toBeTruthy()
      expect(lens.type).toMatch(/^(gov|lens)$/)
      expect(lens.description).toBeTruthy()
      expect(lens.prompt.length).toBeGreaterThan(100)
    }
  })

  it('LENS_MAP contains all lens IDs', () => {
    for (const lens of LENSES) {
      expect(LENS_MAP[lens.id]).toBeDefined()
    }
  })
})
