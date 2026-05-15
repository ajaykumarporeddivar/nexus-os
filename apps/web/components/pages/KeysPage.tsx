'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { usePageVoice, speak } from '@/lib/voice'
import PageVoiceBar from '@/components/PageVoiceBar'

interface ApiKeyRow {
  id:        string
  keyHint:   string
  isValid:   boolean
  lastUsed:  string | null
  createdAt: string
}

export default function KeysPage() {
  const { data: session } = useSession()
  const sessionPlan = (session?.user as { plan?: string } | null)?.plan ?? 'free'

  // Agency+ only — show upsell for free/starter
  if (sessionPlan !== 'agency' && sessionPlan !== 'enterprise') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-xl border border-border bg-paper p-10 text-center space-y-5">
          <p className="text-3xl">🔑</p>
          <h1 className="text-xl font-bold text-ink">API Key Management</h1>
          <p className="text-sm text-ink3 max-w-sm mx-auto">
            Save your Anthropic API key to bypass shared quotas and bill directly to your account.
            This feature is available on the <span className="text-acid font-semibold">Agency plan</span>.
          </p>
          <div className="rounded-lg border border-border bg-paper2 p-4 text-left space-y-2 max-w-xs mx-auto">
            <p className="text-xs font-semibold text-ink">Agency — $199/mo includes:</p>
            {['BYO Anthropic API key', 'Unlimited FORGE runs', 'White-label ZIP export', 'Full analytics dashboard'].map(f => (
              <p key={f} className="text-xs text-ink2">✓ {f}</p>
            ))}
          </div>
          <a href="/shell?page=pricing" className="btn btn-primary inline-block">Upgrade to Agency →</a>
          <p className="text-xs text-ink3">
            Signed in as <span className="font-medium text-ink">{session?.user?.email}</span> · Current plan: {sessionPlan}
          </p>
        </div>
      </div>
    )
  }

  const [keys,      setKeys]      = useState<ApiKeyRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [revoking,  setRevoking]  = useState<string | null>(null)
  const [inputKey,  setInputKey]  = useState('')
  const [showKey,   setShowKey]   = useState(false)
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing,   setTesting]   = useState(false)

  const flash = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/keys')
      const json = await res.json()
      if (json.ok) setKeys(json.data)
    } catch {
      flash('Failed to load keys', false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  async function saveKey() {
    if (!inputKey.trim()) return
    setSaving(true)
    try {
      const res  = await fetch('/api/keys', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ apiKey: inputKey.trim() }),
      })
      const json = await res.json()
      if (!json.ok) { flash(json.error, false); return }
      setInputKey('')
      await fetchKeys()
      flash('API key saved and encrypted')
    } catch {
      flash('Save failed', false)
    } finally {
      setSaving(false)
    }
  }

  async function revokeKey(id: string) {
    setRevoking(id)
    try {
      const res  = await fetch(`/api/keys?id=${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.ok) { flash(json.error, false); return }
      await fetchKeys()
      flash('Key revoked')
    } catch {
      flash('Revoke failed', false)
    } finally {
      setRevoking(null)
    }
  }

  async function testKey() {
    if (!inputKey.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res  = await fetch('/api/claude/once', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          systemPrompt: 'You are a test assistant.',
          userMessage:  'Reply with exactly: KEY_VALID',
          apiKey:       inputKey.trim(),
        }),
      })
      const json = await res.json()
      if (json.ok && json.data?.content?.includes('KEY_VALID')) {
        setTestResult('valid')
      } else if (res.status === 401) {
        setTestResult('invalid')
      } else {
        setTestResult('error')
      }
    } catch {
      setTestResult('error')
    } finally {
      setTesting(false)
    }
  }

  const activeKey = keys.find(k => k.isValid)
  const validCount  = keys.filter(k => k.isValid).length
  const totalCount  = keys.length

  // ── Voice assistant ────────────────────────────────────────────────────────
  const keysReadout = loading
    ? 'API Keys page. Keys are loading.'
    : totalCount === 0
    ? 'API Keys page. No keys saved. You are using the shared quota.'
    : `API Keys page. You have ${totalCount} key${totalCount !== 1 ? 's' : ''} saved. ${validCount} active.`

  const { voiceBarProps } = usePageVoice({
    pageTitle: 'API Keys',
    readout: keysReadout,
    commands: [
      {
        phrases: ['read my keys', 'list keys', 'how many keys', 'key count'],
        description: 'Hear how many API keys are saved',
        action: () => speak(
          totalCount === 0
            ? 'No keys saved. Using shared quota.'
            : `You have ${totalCount} key${totalCount !== 1 ? 's' : ''}. ${validCount} active.`,
          { priority: 'high' },
        ),
      },
      {
        phrases: ['key status', 'is key active', 'active key'],
        description: 'Hear the status of your current API key',
        action: () => speak(
          activeKey
            ? `Active key ending in ${activeKey.keyHint}. Added ${new Date(activeKey.createdAt).toLocaleDateString()}.`
            : 'No active key found. Using shared quota.',
          { priority: 'high' },
        ),
      },
      {
        phrases: ['reload keys', 'refresh keys'],
        description: 'Reload the list of API keys',
        action: () => { fetchKeys(); speak('Refreshing keys.') },
      },
    ],
  })

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8" role="main" aria-label="API Key Management">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-ink">API Key Management</h1>
        <p className="text-sm text-ink3 mt-1">
          Save your Anthropic API key to skip usage quotas and bill directly to your account.
          Keys are AES-256-GCM encrypted at rest.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all ${toast.ok ? 'bg-acid text-paper' : 'bg-red-500 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Active key status */}
      <div className="rounded-xl border border-border bg-paper p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className={`w-2 h-2 rounded-full ${activeKey ? 'bg-green-400' : 'bg-ink3'}`} />
          <span className="text-sm font-semibold text-ink">
            {activeKey ? 'Active key' : 'No key saved — using shared quota'}
          </span>
        </div>

        {loading ? (
          <p className="text-xs text-ink3">Loading…</p>
        ) : activeKey ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-xs text-ink bg-surface rounded px-2 py-1 inline-block">{activeKey.keyHint}</p>
              <p className="text-xs text-ink3 mt-1">
                Saved {new Date(activeKey.createdAt).toLocaleDateString()}
                {activeKey.lastUsed && ` · Last used ${new Date(activeKey.lastUsed).toLocaleDateString()}`}
              </p>
            </div>
            <button
              onClick={() => revokeKey(activeKey.id)}
              disabled={revoking === activeKey.id}
              className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400 rounded-lg px-3 py-1.5 transition-all disabled:opacity-50"
            >
              {revoking === activeKey.id ? 'Revoking…' : 'Revoke'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-ink3">Add a key below to remove rate limits and use your own Anthropic budget.</p>
        )}
      </div>

      {/* Add / replace key */}
      <div className="rounded-xl border border-border bg-paper p-4 space-y-4">
        <h2 className="text-sm font-semibold text-ink">{activeKey ? 'Replace key' : 'Add API key'}</h2>

        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={inputKey}
            onChange={e => { setInputKey(e.target.value); setTestResult(null) }}
            placeholder="sk-ant-api03-…"
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-ink placeholder:text-ink3 focus:outline-none focus:border-acid pr-20"
          />
          <button
            onClick={() => setShowKey(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink3 hover:text-ink"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>

        {/* Test result badge */}
        {testResult && (
          <p className={`text-xs font-medium ${testResult === 'valid' ? 'text-green-400' : 'text-red-400'}`}>
            {testResult === 'valid'   && '✓ Key is valid'}
            {testResult === 'invalid' && '✗ Key rejected by Anthropic (401)'}
            {testResult === 'error'   && '⚠ Test failed — check console'}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={testKey}
            disabled={!inputKey.trim() || testing}
            className="text-xs px-3 py-1.5 rounded-lg border border-acid/40 text-acid hover:border-acid transition-all disabled:opacity-40"
          >
            {testing ? 'Testing…' : 'Test key'}
          </button>
          <button
            onClick={saveKey}
            disabled={!inputKey.trim() || saving || testResult === 'invalid'}
            className="text-xs px-4 py-1.5 rounded-lg bg-acid text-paper font-semibold hover:opacity-90 transition-all disabled:opacity-40"
          >
            {saving ? 'Saving…' : activeKey ? 'Replace & save' : 'Save key'}
          </button>
        </div>

        {activeKey && (
          <p className="text-xs text-ink3">Saving will revoke the current key and replace it.</p>
        )}
      </div>

      {/* Security notice */}
      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-1">
        <p className="text-xs font-semibold text-yellow-400">Security</p>
        <ul className="text-xs text-ink3 space-y-0.5 list-disc list-inside">
          <li>Keys are encrypted with AES-256-GCM before storage — never stored in plaintext.</li>
          <li>Only the last 4 characters are shown after saving.</li>
          <li>Revoking a key immediately invalidates it — any in-flight requests will fail.</li>
          <li>Your key is never logged or sent to any third party.</li>
        </ul>
      </div>

      {/* Plan note */}
      {session?.user && (
        <p className="text-xs text-ink3 text-center">
          Signed in as <span className="text-ink font-medium">{session.user.email}</span>
          {' '}· {activeKey ? 'Using your own API key — no quota applied' : 'Shared quota active'}
        </p>
      )}

      {/* Voice assistant bar */}
      <div role="region" aria-label="API Keys voice assistant">
        <PageVoiceBar {...voiceBarProps} />
      </div>
    </div>
  )
}
