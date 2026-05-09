import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch for store tests
global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ ok: true, data: [] }) })) as unknown as typeof fetch

describe('nexusStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with empty builds', async () => {
    const { nexusStore } = await import('../lib/nexusStore')
    expect(nexusStore.builds).toEqual([])
    expect(nexusStore.totalTokens).toBe(0)
    expect(nexusStore.totalCalls).toBe(0)
  })

  it('addBuild adds to front of builds array', async () => {
    const { nexusStore } = await import('../lib/nexusStore')
    const build = {
      id: 1, date: '2026-04-22', time: '10:00:00',
      input: 'Test build', client: 'Test Client',
      phases: ['Boot'], tokens: 1000, calls: 5,
      score: 9.0, passed: true, status: 'APPROVED' as const, files: 8,
    }
    nexusStore.addBuild(build)
    expect(nexusStore.builds[0]).toMatchObject({ input: 'Test build' })
    expect(nexusStore.totalTokens).toBe(1000)
  })

  it('subscribe registers a listener', async () => {
    const { nexusStore } = await import('../lib/nexusStore')
    const fn = vi.fn()
    nexusStore.subscribe(fn)
    expect(nexusStore.listeners).toContain(fn)
  })

  it('publish calls all listeners', async () => {
    const { nexusStore } = await import('../lib/nexusStore')
    const fn = vi.fn()
    nexusStore.subscribe(fn)
    nexusStore.publish()
    expect(fn).toHaveBeenCalled()
  })
})
