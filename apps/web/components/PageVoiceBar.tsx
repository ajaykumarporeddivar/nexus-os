'use client'

/**
 * PageVoiceBar — reusable voice assistant strip for any page.
 *
 * Extracted and generalised from the PipelineVoiceBar pattern in PipelinePage.tsx.
 * Drop one <PageVoiceBar> at the bottom of any page, feed it props from usePageVoice(),
 * and the page gets full voice control + TTS narration instantly.
 */

import { _activeVoiceName } from '@/lib/voice'

export interface VoiceCommand {
  phrases: string[]      // e.g. ['read summary', 'what is my status']
  description: string    // shown in "help" TTS narration
  action: () => void     // fires when any phrase is matched
}

interface PageVoiceBarProps {
  pageTitle: string
  commands: VoiceCommand[]
  readout: string          // text spoken on "read page" / "read summary"
  hint?: string            // override for bottom hint text
  isListening: boolean
  interim: string
  lastText: string
  error: string | null
  onToggle: () => void
  onClearError: () => void
  isSupported: boolean
}

export default function PageVoiceBar({
  pageTitle,
  hint,
  isListening,
  interim,
  lastText,
  error,
  onToggle,
  onClearError,
  isSupported,
}: PageVoiceBarProps) {
  if (!isSupported) return null

  const defaultHint = isListening
    ? 'Listening… say "help" to hear available commands'
    : 'Click the mic or say a voice command · Say "help" for options'

  const displayHint = hint ?? defaultHint

  return (
    <div
      role="status"
      aria-live={error ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 ${
        error
          ? 'border-orange-400 bg-orange-50/80 dark:bg-orange-950/30'
          : isListening
          ? 'border-red-400 bg-red-50 dark:bg-red-950/30 shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
          : 'border-border/60 bg-paper2 hover:border-border'
      }`}
    >
      {/* Animated ring when listening */}
      {isListening && (
        <span className="absolute inset-0 rounded-xl border-2 border-red-400 animate-ping opacity-30 pointer-events-none" />
      )}

      {/* Mic button */}
      <button
        type="button"
        onClick={onToggle}
        title={isListening ? `Stop ${pageTitle} voice assistant` : `Activate ${pageTitle} voice assistant`}
        aria-label={isListening ? `Stop ${pageTitle} voice assistant` : `Start ${pageTitle} voice assistant`}
        aria-pressed={isListening}
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 font-bold ${
          isListening
            ? 'bg-red-500 text-white shadow-[0_0_16px_4px_rgba(239,68,68,0.45)] scale-110'
            : error
            ? 'bg-orange-100 text-orange-600 border-2 border-orange-400 dark:bg-orange-950/40'
            : 'bg-paper border-2 border-border text-ink2 hover:border-[#c8f23c] hover:text-ink hover:bg-[#c8f23c]/10 hover:scale-105'
        }`}
      >
        {isListening ? (
          /* Animated waveform bars */
          <span className="flex items-end gap-[2px] h-4" aria-hidden>
            {[2, 4, 6, 4, 2].map((h, i) => (
              <span
                key={i}
                className="w-[3px] bg-white rounded-full"
                style={{
                  height: `${h * 2}px`,
                  animation: `voiceBar ${0.3 + i * 0.08}s ease-in-out infinite alternate`,
                }}
              />
            ))}
          </span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        )}
      </button>

      {/* Text area */}
      <div className="flex-1 min-w-0">
        {error ? (
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold leading-tight">{error}</p>
            <button
              type="button"
              onClick={onClearError}
              className="flex-shrink-0 text-[10px] text-orange-500 hover:text-orange-700 font-bold leading-none mt-0.5"
              aria-label="Dismiss voice assistant error"
              title="Dismiss error"
            >✕</button>
          </div>
        ) : isListening ? (
          <>
            <p className="text-xs font-bold text-red-600 dark:text-red-400 leading-tight">
              Listening…{interim && <span className="font-normal opacity-70 italic"> {interim}</span>}
            </p>
            {lastText && (
              <p className="text-[10px] text-ink3 truncate mt-0.5">Last: "{lastText}"</p>
            )}
          </>
        ) : lastText ? (
          <>
            <p className="text-xs text-ink2 truncate font-mono">"{lastText}"</p>
            <p className="text-[10px] text-ink3 mt-0.5">{displayHint}</p>
          </>
        ) : (
          <>
            <p className="text-xs text-ink2 font-medium">{pageTitle} voice assistant</p>
            <p className="text-[10px] text-ink3 mt-0.5">{displayHint}</p>
            {_activeVoiceName && (
              <p className="text-[9px] text-ink3/60 font-mono mt-0.5 truncate" title="Active TTS voice">
                🔊 {_activeVoiceName}
              </p>
            )}
          </>
        )}
      </div>

      {/* Screen reader summary */}
      <span className="sr-only">
        {error
          ? `Voice assistant error. ${error}`
          : isListening
          ? `Voice assistant listening. ${interim ? `Heard so far: ${interim}.` : 'Awaiting speech.'}`
          : lastText
          ? `Last voice message: ${lastText}.`
          : `${pageTitle} voice assistant ready. Say help to hear available commands.`}
      </span>

      {/* Status badge */}
      <div className="flex-shrink-0">
        <span className={`text-[9px] font-black font-mono tracking-widest uppercase px-2 py-1 rounded-lg border ${
          error
            ? 'text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/40'
            : isListening
            ? 'text-red-600 border-red-300 bg-red-50 dark:bg-red-950/40'
            : 'text-ink3 border-border bg-paper3'
        }`}>
          {error ? 'ERR' : isListening ? '● ON' : 'OFF'}
        </span>
      </div>
    </div>
  )
}
