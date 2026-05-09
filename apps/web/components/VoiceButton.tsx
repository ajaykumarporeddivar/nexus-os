'use client'

// ─── VoiceButton — reusable mic input component ───────────────────────────────
// Drop into any textarea/input to add voice dictation.
// Uses Browser Web Speech API (zero credentials).

import { useRef, useEffect, useState } from 'react'
import { useVoice, type UseVoiceOptions } from '@/lib/voice'
import { clsx } from 'clsx'

interface VoiceButtonProps {
  /** Called when user finishes speaking — use this to set the field value */
  onTranscript: (text: string) => void
  /** Called with live interim results while speaking */
  onInterim?: (text: string) => void
  /** If true, append to existing text; if false, replace */
  append?: boolean
  /** Size of the button */
  size?: 'sm' | 'md' | 'lg'
  /** Extra classes */
  className?: string
  /** Tooltip label */
  label?: string
  /** Language override */
  language?: string
}

export default function VoiceButton({
  onTranscript,
  onInterim,
  append   = false,
  size     = 'md',
  className,
  label    = 'Dictate',
  language = 'en-US',
}: VoiceButtonProps) {
  const voice = useVoice({
    language,
    continuous: false,
    autoStop:   1800,
    onTranscript,
    onInterim,
  } as UseVoiceOptions)

  const sizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
  }

  const iconSize = { sm: 12, md: 15, lg: 18 }[size]

  if (!voice.isSupported) return null   // hide silently in unsupported browsers

  return (
    <div className="relative group inline-flex">
      <button
        type="button"
        onClick={voice.toggle}
        title={label}
        aria-label={voice.isListening ? 'Stop dictation' : label}
        className={clsx(
          'flex items-center justify-center rounded-lg border transition-all duration-200 flex-shrink-0',
          sizes[size],
          voice.state === 'listening'
            ? 'bg-red-500 border-red-400 text-white shadow-[0_0_12px_3px_rgba(239,68,68,0.35)] animate-pulse'
            : voice.state === 'error'
            ? 'bg-amber-50 border-amber-300 text-amber-600 hover:bg-amber-100'
            : 'bg-paper border-border text-ink3 hover:text-ink hover:border-ink/25 hover:bg-paper2',
          className,
        )}
      >
        {voice.state === 'listening' ? (
          // Animated waveform bars while listening
          <span className="flex items-end gap-[2px] h-4">
            {[2, 3, 4, 3, 2].map((h, i) => (
              <span
                key={i}
                className="w-[3px] bg-white rounded-full"
                style={{
                  height:           `${h * 3}px`,
                  animationName:    'voiceBar',
                  animationDuration: `${0.4 + i * 0.1}s`,
                  animationIterationCount: 'infinite',
                  animationTimingFunction: 'ease-in-out',
                  animationDirection: 'alternate',
                }}
              />
            ))}
          </span>
        ) : (
          // Mic icon (inline SVG — no lucide dep for this file)
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        )}
      </button>

      {/* Error tooltip */}
      {voice.state === 'error' && voice.error && (
        <div className="absolute bottom-full right-0 mb-2 w-56 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 shadow-md z-50 leading-relaxed">
          {voice.error}
        </div>
      )}

      {/* "Listening…" tooltip */}
      {voice.state === 'listening' && (
        <div className="absolute bottom-full right-0 mb-2 text-[10px] font-mono font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1 shadow-sm z-50 whitespace-nowrap">
          ● Listening… speak now
        </div>
      )}
    </div>
  )
}

// ─── Waveform keyframe animation (injected once) ──────────────────────────────

function injectVoiceStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById('nexus-voice-styles')) return
  const style = document.createElement('style')
  style.id = 'nexus-voice-styles'
  style.textContent = `
    @keyframes voiceBar {
      from { transform: scaleY(0.4); opacity: 0.7; }
      to   { transform: scaleY(1.0); opacity: 1.0; }
    }
  `
  document.head.appendChild(style)
}

if (typeof window !== 'undefined') {
  injectVoiceStyles()
}

// ─── VoiceTextarea — textarea with integrated voice button ────────────────────

interface VoiceTextareaProps {
  value:       string
  onChange:    (v: string) => void
  placeholder?: string
  rows?:        number
  disabled?:    boolean
  className?:   string
  label?:       string
  language?:    string
}

export function VoiceTextarea({
  value,
  onChange,
  placeholder,
  rows     = 4,
  disabled = false,
  className,
  label,
  language,
}: VoiceTextareaProps) {
  const [interim, setInterim] = useState('')

  return (
    <div className="relative">
      {label && (
        <label className="block text-xs font-semibold text-ink2 mb-1.5">{label}</label>
      )}
      <div className="relative">
        <textarea
          value={interim ? `${value}${value ? ' ' : ''}${interim}…` : value}
          onChange={e => { setInterim(''); onChange(e.target.value) }}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={clsx(
            'w-full px-3 py-2.5 pr-11 rounded-xl text-sm border border-border bg-paper2 outline-none',
            'focus:border-acid focus:ring-2 focus:ring-acid/20 resize-none text-ink placeholder:text-ink3 transition-colors',
            interim && 'italic text-ink3',
            className,
          )}
        />
        <div className="absolute right-2.5 bottom-2.5">
          <VoiceButton
            size="sm"
            append
            language={language}
            onTranscript={text => {
              setInterim('')
              onChange(value ? `${value} ${text}` : text)
            }}
            onInterim={text => setInterim(text)}
            label="Dictate brief"
          />
        </div>
      </div>
      {interim && (
        <p className="text-[10px] font-mono text-ink3 mt-1 italic">
          Live: {interim}…
        </p>
      )}
    </div>
  )
}


