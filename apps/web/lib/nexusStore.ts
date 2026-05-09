import type { Build, NexusStore } from '@nexus-os/shared-types'

function createNexusStore(): NexusStore {
  const store: NexusStore = {
    builds: [],
    totalTokens: 0,
    totalCalls: 0,
    listeners: [],

    subscribe(fn) {
      this.listeners.push(fn)
      return () => {
        this.listeners = this.listeners.filter(l => l !== fn)
      }
    },

    publish() {
      this.listeners.forEach(fn => fn())
    },

    addBuild(entry: Build) {
      this.builds.unshift(entry)
      this.totalTokens += entry.tokens
      this.totalCalls  += entry.calls
      // Persist to DB
      fetch('/api/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      }).catch(console.error)
      this.publish()
    },

    restore() {
      fetch('/api/executions')
        .then(r => r.json())
        .then(data => {
          if (data.ok && Array.isArray(data.data)) {
            this.builds = data.data
            this.totalTokens = this.builds.reduce((s: number, b: Build) => s + b.tokens, 0)
            this.totalCalls  = this.builds.reduce((s: number, b: Build) => s + b.calls,  0)
            this.publish()
          }
        })
        .catch(console.error)
    },
  }
  return store
}

export const nexusStore = createNexusStore()
