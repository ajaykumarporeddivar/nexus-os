'use client'

export default function OrbitalMissionControlPage() {
  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      height:         'calc(100vh - 58px)',
      background:     '#050807',
      gap:            32,
      padding:        24,
    }}>
      {/* Branding */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{
            border:        '1px solid #b7ff4a',
            color:         '#b7ff4a',
            fontFamily:    'monospace',
            fontSize:      10,
            fontWeight:    800,
            padding:       '4px 7px',
            letterSpacing: '0.5px',
          }}>NX</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#b7ff4a', fontFamily: 'monospace', letterSpacing: '2px' }}>
            ORBITAL MISSION CONTROL
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#f3f7f4', fontFamily: 'monospace', letterSpacing: '0.5px', marginBottom: 8 }}>
          N-body physics simulation · Velocity-Verlet integrator
        </div>
        <div style={{ fontSize: 11, color: '#89938e', fontFamily: 'monospace' }}>
          LEO orbits · Trans-lunar injection · Mars heliocentric · Lunar slingshot
        </div>
      </div>

      {/* Feature pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 520 }}>
        {['Burn execution', 'Circularize', 'Δv slider', 'Time warp ×86400', 'Kepler elements', 'Prediction line', 'Energy drift monitor', 'Guided demo mode'].map(f => (
          <span key={f} style={{
            fontSize:     10,
            fontFamily:   'monospace',
            color:        '#5ee7f2',
            border:       '1px solid rgba(94,231,242,0.25)',
            borderRadius: 4,
            padding:      '4px 10px',
          }}>{f}</span>
        ))}
      </div>

      {/* Launch button */}
      <a
        href="/orbital-mission-control.html"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          gap:            10,
          background:     '#b7ff4a',
          color:          '#071006',
          fontFamily:     'monospace',
          fontWeight:     800,
          fontSize:       13,
          letterSpacing:  '1px',
          padding:        '14px 32px',
          borderRadius:   6,
          textDecoration: 'none',
          border:         'none',
          cursor:         'pointer',
        }}
      >
        ⊙ LAUNCH SIMULATION
      </a>

      <div style={{ fontSize: 10, color: '#89938e', fontFamily: 'monospace' }}>
        Opens full-screen in a new tab · No install required
      </div>
    </div>
  )
}
