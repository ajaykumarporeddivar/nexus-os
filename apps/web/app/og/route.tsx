import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const brandName  = process.env.NEXT_PUBLIC_BRAND_NAME    ?? 'NEXUS OS'
const brandLine  = process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? 'AI Delivery Infrastructure for Digital Agencies'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title   = searchParams.get('title')   ?? brandName
  const sub     = searchParams.get('sub')     ?? brandLine
  const page    = searchParams.get('page')    ?? ''

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#0f0f0f',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', letterSpacing: '0.15em', color: '#888' }}>
            {brandName.toUpperCase()}
          </span>
          {page && (
            <span style={{ fontSize: '11px', background: '#1a1a1a', color: '#c8ff00', border: '1px solid #c8ff0040', borderRadius: '4px', padding: '2px 8px', letterSpacing: '0.08em' }}>
              {page.toUpperCase()}
            </span>
          )}
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '58px', fontWeight: 800, color: '#ffffff', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            {title.includes('NEXUS') ? (
              <>
                {title.replace('OS', '')}
                <span style={{ color: '#c8ff00' }}>OS</span>
              </>
            ) : title}
          </div>
          <div style={{ fontSize: '24px', color: '#888', lineHeight: 1.4, maxWidth: '800px' }}>
            {sub}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '24px' }}>
            {['9-Agent FORGE', '11-Lens Reasoning', 'Prompt Vault'].map(feat => (
              <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c8ff00' }} />
                <span style={{ fontSize: '13px', color: '#666' }}>{feat}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '13px', color: '#444', letterSpacing: '0.08em' }}>
            nexus-os.ai
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
