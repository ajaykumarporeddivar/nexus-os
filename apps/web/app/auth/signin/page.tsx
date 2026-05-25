'use client'

import { signIn, getProviders } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

interface Provider {
  id: string
  name: string
  type: string
}

const PROVIDER_ICONS: Record<string, string> = {
  google: 'G',
  email:  '✉',
}

const ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin:        'Failed to start sign-in. Please try again.',
  OAuthCallback:      'Authentication callback failed. Start a fresh Google sign-in or use dev login below.',
  OAuthCreateAccount: 'Could not create account.',
  EmailCreateAccount: 'Could not create email account.',
  Callback:           'Callback error.',
  OAuthAccountNotLinked: 'Email already linked to another provider.',
  EmailSignin:        'Check your email for a sign-in link.',
  CredentialsSignin:  'Invalid credentials.',
  SessionRequired:    'Please sign in to access this page.',
  default:            'An error occurred. Please try again.',
}

function normalizeCallbackUrl(value: string | null) {
  if (!value) return '/shell'
  if (value.startsWith('/')) return value
  try {
    const parsed = new URL(value)
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/shell'
  } catch {
    return '/shell'
  }
}

function SignInInner() {
  const searchParams = useSearchParams()
  const callbackUrl = normalizeCallbackUrl(searchParams.get('callbackUrl'))
  const errorCode = searchParams.get('error') ?? ''
  const [localError, setLocalError] = useState('')

  const [providers, setProviders] = useState<Record<string, Provider>>({})
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [devPassword, setDevPassword] = useState('')
  const [devEmail, setDevEmail] = useState('')

  useEffect(() => {
    getProviders().then(p => { if (p) setProviders(p) })
  }, [])

  const handleOAuth = async (providerId: string) => {
    try {
      setLocalError('')
      setLoading(providerId)
      await signIn(providerId, { callbackUrl })
    } catch {
      setLocalError('Could not start sign-in. Please try again.')
      setLoading(null)
    }
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading('email')
    await signIn('email', { email, callbackUrl, redirect: false })
    setEmailSent(true)
    setLoading(null)
  }

  const oauthProviders = Object.values(providers).filter(p => p.type === 'oauth')
  const hasEmail = 'email' in providers
  const hasDevCredentials = 'dev-credentials' in providers

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!devEmail || !devPassword) return
    try {
      setLocalError('')
      setLoading('dev-credentials')
      const result = await signIn('dev-credentials', {
        email: devEmail,
        password: devPassword,
        callbackUrl,
        redirect: false,
      })
      if (result?.error || result?.ok === false) {
        setLocalError(ERROR_MESSAGES.CredentialsSignin)
        setLoading(null)
        return
      }
      window.location.assign(result?.url ?? callbackUrl)
    } catch {
      setLocalError('Dev sign-in failed. Please try again.')
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--ff-d)' }}>
            NEXUS <em className="not-italic" style={{ color: 'var(--acid)' }}>OS</em>
          </h1>
          <p className="text-sm text-ink3 mt-2">Sign in to your workspace</p>
        </div>

        {/* Error */}
        {(errorCode || localError) && (
          <div className="panel border-red-500/30 bg-red-500/5 text-red-400 text-sm p-4 text-center">
            {localError || ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.default}
          </div>
        )}

        {/* Email sent state */}
        {emailSent ? (
          <div className="panel border-acid/30 bg-acid/5 text-sm p-6 text-center space-y-2">
            <p className="font-semibold">Check your inbox</p>
            <p className="text-ink3">A sign-in link was sent to <strong>{email}</strong></p>
            <button
              onClick={() => setEmailSent(false)}
              className="text-xs text-ink3 underline mt-2"
            >
              Try a different email
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* OAuth providers */}
            {oauthProviders.map(provider => (
              <button
                key={provider.id}
                onClick={() => handleOAuth(provider.id)}
                disabled={loading === provider.id}
                className="btn btn-ghost w-full flex items-center justify-center gap-3 py-3 disabled:opacity-50"
              >
                <span className="w-5 h-5 flex items-center justify-center font-bold text-sm">
                  {PROVIDER_ICONS[provider.id] ?? provider.name[0]}
                </span>
                {loading === provider.id ? 'Redirecting…' : `Continue with ${provider.name}`}
              </button>
            ))}

            {/* Divider */}
            {oauthProviders.length > 0 && hasEmail && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-ink3">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {/* Email magic link */}
            {hasEmail && (
              <form onSubmit={handleEmail} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full px-3 py-2.5 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
                />
                <button
                  type="submit"
                  disabled={loading === 'email' || !email}
                  className="btn btn-primary w-full py-2.5 disabled:opacity-50"
                >
                  {loading === 'email' ? 'Sending…' : 'Send sign-in link'}
                </button>
              </form>
            )}

            {/* Dev credentials form */}
            {hasDevCredentials && (
              <>
                {(oauthProviders.length > 0 || hasEmail) && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-ink3 font-mono">DEV</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <form onSubmit={handleDevLogin} className="space-y-2 border border-border/50 rounded-xl p-4 bg-paper3/40">
                  <p className="text-[10px] font-mono text-ink3 uppercase tracking-widest mb-3">Dev login (local only)</p>
                  <input
                    type="email"
                    value={devEmail}
                    onChange={e => {
                      setDevEmail(e.target.value)
                      if (localError) setLocalError('')
                    }}
                    placeholder="any@email.com"
                    required
                    className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
                  />
                  <input
                    type="password"
                    value={devPassword}
                    onChange={e => {
                      setDevPassword(e.target.value)
                      if (localError) setLocalError('')
                    }}
                    placeholder={`password (default: nexus-dev)`}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-paper2 outline-none focus:border-acid"
                  />
                  <button
                    type="submit"
                    disabled={loading === 'dev-credentials' || !devEmail || !devPassword}
                    className="btn w-full py-2 text-sm disabled:opacity-50 bg-paper2 hover:bg-paper3 border border-border"
                  >
                    {loading === 'dev-credentials' ? 'Signing in…' : 'Dev sign in'}
                  </button>
                </form>
              </>
            )}

            {/* No providers configured */}
            {oauthProviders.length === 0 && !hasEmail && !hasDevCredentials && (
              <div className="panel text-sm text-ink3 text-center p-6">
                <p>No sign-in providers configured.</p>
                <p className="text-xs mt-2">Set <code>GOOGLE_CLIENT_ID</code> or <code>EMAIL_SERVER</code> in your environment.</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-ink3">
          By signing in you agree to our{' '}
          <a href="/terms" className="underline hover:text-ink">Terms</a> and{' '}
          <a href="/privacy" className="underline hover:text-ink">Privacy Policy</a>
        </p>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <SignInInner />
    </Suspense>
  )
}
