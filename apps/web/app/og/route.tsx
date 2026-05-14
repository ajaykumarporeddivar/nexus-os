import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') ?? 'Build AI Software in 10 Minutes'
  const sub   = searchParams.get('sub')   ?? '23 AI agents: spec, architecture, code, security audit & GTM playbook from one prompt.'

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#0a0a0f',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '80px',
          fontFamily: 'monospace',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Grid lines */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundImage: 'linear-gradient(rgba(139,92,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.06) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          display: 'flex',
        }} />
        {/* Glow */}
        <div style={{
          position: 'absolute', top: '-200px', right: '-200px',
          width: '600px', height: '600px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
          display: 'flex',
        }} />

        {/* Brand badge */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: '#1e1b4b', border: '1px solid #4c1d95',
          borderRadius: '999px', padding: '6px 18px',
          fontSize: '13px', color: '#a78bfa', fontWeight: 700,
          letterSpacing: '0.12em', marginBottom: '28px',
        }}>
          NEXUS OS
        </div>

        {/* Title */}
        <div style={{
          fontSize: '60px', fontWeight: 900, color: '#f1f5f9',
          lineHeight: 1.1, marginBottom: '24px', maxWidth: '900px',
        }}>
          {title}
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: '22px', color: '#64748b', lineHeight: 1.5,
          maxWidth: '780px', marginBottom: '52px',
        }}>
          {sub}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '40px' }}>
          {['23 AGENTS', 'ONE PROMPT', '10 MINUTES', 'PRODUCTION-READY'].map(stat => (
            <div key={stat} style={{
              fontSize: '12px', color: '#7c3aed', fontWeight: 700,
              letterSpacing: '0.1em', borderLeft: '2px solid #4c1d95', paddingLeft: '12px',
            }}>
              {stat}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
