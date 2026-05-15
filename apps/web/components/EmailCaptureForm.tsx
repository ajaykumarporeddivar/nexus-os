'use client'

import { useState, FormEvent } from 'react'

interface Props {
  style?: React.CSSProperties
  inputStyle?: React.CSSProperties
  buttonStyle?: React.CSSProperties
  placeholder?: string
  buttonText?: string
}

export default function EmailCaptureForm({
  style,
  inputStyle,
  buttonStyle,
  placeholder = 'your@agency.com',
  buttonText   = 'Get Early Access →',
}: Props) {
  const [email,    setEmail]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [status,   setStatus]   = useState<'idle' | 'ok' | 'err'>('idle')
  const [errMsg,   setErrMsg]   = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || loading) return
    setLoading(true)
    setStatus('idle')

    // Read UTM cookie for attribution (set by middleware on landing)
    let utmSource: string | undefined
    let utmMedium: string | undefined
    let utmCampaign: string | undefined
    let utmContent: string | undefined
    try {
      const raw = document.cookie.split('; ').find(c => c.startsWith('nexus_utm='))
      if (raw) {
        const val = decodeURIComponent(raw.split('=')[1])
        const parsed = JSON.parse(val) as Record<string, string>
        utmSource   = parsed.source   || undefined
        utmMedium   = parsed.medium   || undefined
        utmCampaign = parsed.campaign || undefined
        utmContent  = parsed.content  || undefined
      }
    } catch { /* ignore */ }

    try {
      const res = await fetch('/api/lead-capture', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, utmSource, utmMedium, utmCampaign, utmContent }),
      })
      const data = await res.json() as { ok: boolean; error?: string }
      if (data.ok) {
        setStatus('ok')
        setEmail('')
      } else {
        setStatus('err')
        setErrMsg(data.error ?? 'Something went wrong')
      }
    } catch {
      setStatus('err')
      setErrMsg('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'ok') {
    return (
      <div style={{ padding: '14px 20px', borderRadius: '10px', background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.3)', fontSize: '14px', color: '#c8ff00', fontWeight: 600, ...style }}>
        ✓ Got it — check your inbox for next steps
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', ...style }}>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder={placeholder}
        required
        disabled={loading}
        style={{
          flex:         '1 1 200px',
          padding:      '12px 16px',
          borderRadius: '8px',
          border:       status === 'err' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.12)',
          background:   'rgba(255,255,255,0.05)',
          color:        '#e5e5e5',
          fontSize:     '14px',
          outline:      'none',
          ...inputStyle,
        }}
      />
      <button
        type="submit"
        disabled={loading || !email}
        style={{
          padding:      '12px 24px',
          borderRadius: '8px',
          background:   loading ? 'rgba(200,255,0,0.5)' : '#c8ff00',
          color:        '#000',
          fontWeight:   700,
          fontSize:     '14px',
          border:       'none',
          cursor:       loading || !email ? 'not-allowed' : 'pointer',
          whiteSpace:   'nowrap',
          ...buttonStyle,
        }}
      >
        {loading ? 'Saving…' : buttonText}
      </button>
      {status === 'err' && (
        <p style={{ width: '100%', fontSize: '12px', color: '#ef4444', margin: '4px 0 0' }}>{errMsg}</p>
      )}
    </form>
  )
}
