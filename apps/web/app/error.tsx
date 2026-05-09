'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ background: '#0f0f0f', color: '#e5e5e5', fontFamily: '-apple-system, sans-serif', margin: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '16px', padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: '#888' }}>NEXUS OS</div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, color: '#fff' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '14px', color: '#888', margin: 0, maxWidth: '400px', lineHeight: 1.6 }}>
            An unexpected error occurred. The incident has been logged.
            {error.digest && (
              <span style={{ display: 'block', marginTop: '8px', fontFamily: 'monospace', fontSize: '11px', color: '#555' }}>
                Ref: {error.digest}
              </span>
            )}
          </p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button
              onClick={reset}
              style={{ background: '#c8ff00', color: '#000', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
            >
              Try again
            </button>
            <a
              href="/shell"
              style={{ background: '#1a1a1a', color: '#e5e5e5', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '10px 20px', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}
            >
              Go to dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
