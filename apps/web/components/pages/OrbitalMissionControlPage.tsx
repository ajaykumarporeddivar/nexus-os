'use client'

import { useState } from 'react'

export default function OrbitalMissionControlPage() {
  const [fullscreen, setFullscreen] = useState(false)

  return (
    <div
      style={{
        position:   fullscreen ? 'fixed' : 'relative',
        inset:      fullscreen ? 0 : 'auto',
        zIndex:     fullscreen ? 9999 : 'auto',
        display:    'flex',
        flexDirection: 'column',
        height:     fullscreen ? '100vh' : 'calc(100vh - 58px)',
        background: '#050807',
      }}
    >
      {/* Minimal top bar — only visible outside fullscreen */}
      {!fullscreen && (
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '8px 16px',
          borderBottom:   '0.5px solid rgba(183,255,74,0.18)',
          background:     'rgba(5,8,7,0.9)',
          flexShrink:     0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              border:     '1px solid #b7ff4a',
              color:      '#b7ff4a',
              fontFamily: 'monospace',
              fontSize:   9,
              fontWeight: 800,
              padding:    '3px 5px',
              letterSpacing: '0.5px',
            }}>NX</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f3f7f4', letterSpacing: '1.5px', fontFamily: 'monospace' }}>
                ORBITAL MISSION CONTROL
              </div>
              <div style={{ fontSize: 9, color: '#89938e', fontFamily: 'monospace', marginTop: 1 }}>
                N-body physics · Velocity-Verlet integrator · Kepler elements
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href="/orbital-mission-control.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize:    10,
                fontFamily:  'monospace',
                color:       '#89938e',
                border:      '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                padding:     '5px 10px',
                textDecoration: 'none',
                cursor:      'pointer',
              }}
            >
              ↗ OPEN FULL TAB
            </a>
            <button
              onClick={() => setFullscreen(true)}
              style={{
                fontSize:    10,
                fontFamily:  'monospace',
                color:       '#071006',
                background:  '#b7ff4a',
                border:      '1px solid #b7ff4a',
                borderRadius: 4,
                padding:     '5px 10px',
                cursor:      'pointer',
                fontWeight:  700,
              }}
            >
              ⛶ FULLSCREEN
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen exit button */}
      {fullscreen && (
        <button
          onClick={() => setFullscreen(false)}
          style={{
            position:   'fixed',
            top:        16,
            right:      16,
            zIndex:     10000,
            fontSize:   10,
            fontFamily: 'monospace',
            color:      '#071006',
            background: '#b7ff4a',
            border:     '1px solid #b7ff4a',
            borderRadius: 4,
            padding:    '5px 10px',
            cursor:     'pointer',
            fontWeight: 700,
          }}
        >
          ✕ EXIT
        </button>
      )}

      {/* Simulation iframe — gets its own full viewport */}
      <iframe
        src="/orbital-mission-control.html"
        title="Orbital Mission Control — N-body physics simulation"
        style={{
          flex:        1,
          border:      'none',
          width:       '100%',
          display:     'block',
          background:  '#050807',
        }}
        allow="fullscreen"
        loading="eager"
      />
    </div>
  )
}
