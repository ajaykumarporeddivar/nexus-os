'use client'

// ─── NEXUS Voice Layer ────────────────────────────────────────────────────────
// Phase 1: Browser Web Speech API (zero credentials, works immediately)
// Phase 2 upgrade path: swap SpeechRecognition for Azure Speech SDK / MAI-Transcribe-1
// All consumers use the same useVoice() hook regardless of backend.

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoiceState = 'idle' | 'listening' | 'processing' | 'error'

export interface UseVoiceOptions {
  onTranscript?: (text: string) => void   // called on each final result
  onInterim?:   (text: string) => void    // called on interim results (live)
  language?:    string                    // default: 'en-US'
  continuous?:  boolean                  // keep listening after each result
  autoStop?:    number                   // ms of silence before auto-stop (0 = disabled)
}

export interface UseVoiceResult {
  state:             VoiceState
  transcript:        string        // latest final transcript
  interimTranscript: string        // live interim (while speaking)
  isSupported:       boolean       // browser supports Web Speech API
  isListening:       boolean
  error:             string | null
  start:             () => void
  stop:              () => void
  toggle:            () => void
  clear:             () => void
}

// ─── Browser compatibility ────────────────────────────────────────────────────

// Browser Web Speech API — typed manually since not in all lib.dom.d.ts versions
interface ISpeechRecognition extends EventTarget {
  lang:             string
  continuous:       boolean
  interimResults:   boolean
  maxAlternatives:  number
  start():          void
  stop():           void
  onresult:         ((e: ISpeechRecognitionEvent) => void) | null
  onerror:          ((e: ISpeechRecognitionErrorEvent) => void) | null
  onend:            (() => void) | null
}

interface ISpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length:  number
  [index: number]:  { readonly transcript: string }
}

interface ISpeechRecognitionEvent {
  readonly resultIndex: number
  readonly results:     { readonly length: number; [index: number]: ISpeechRecognitionResult }
}

interface ISpeechRecognitionErrorEvent {
  readonly error: string
}

type SpeechRecognitionCtor = new () => ISpeechRecognition

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition ??
    null
  )
}

// ─── TTS (Text-to-Speech) ─────────────────────────────────────────────────────
// Phase 1: Browser SpeechSynthesis (free, no credentials)
// Phase 2 upgrade: replace speak() with MAI-Voice-1 API call

export function speak(text: string, opts: { rate?: number; pitch?: number; lang?: string } = {}): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel() // stop any current speech
  const utterance    = new SpeechSynthesisUtterance(text)
  utterance.rate     = opts.rate  ?? 1.0
  utterance.pitch    = opts.pitch ?? 1.0
  utterance.lang     = opts.lang  ?? 'en-US'
  // Prefer a natural-sounding voice
  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium'))
  if (preferred) utterance.voice = preferred
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

// ─── Voice command engine ─────────────────────────────────────────────────────

const NAV_COMMANDS: Record<string, string> = {
  'go to forge':      '/shell?page=forge',
  'open forge':       '/shell?page=forge',
  'go to dashboard':  '/shell?page=dashboard',
  'open dashboard':   '/shell?page=dashboard',
  'go to pipeline':   '/shell?page=pipeline',
  'open pipeline':    '/shell?page=pipeline',
  'go to trending':   '/shell?page=trending',
  'go to vault':      '/shell?page=vault',
  'go to audit':      '/shell?page=audit',
  'go to evolve':     '/shell?page=evolve',
  'go to settings':   '/shell?page=workspaces',
  'go home':          '/shell?page=overview',
  'open overview':    '/shell?page=overview',
}

export function matchVoiceCommand(transcript: string): { type: 'navigate'; url: string } | null {
  const lower = transcript.toLowerCase().trim()
  for (const [phrase, url] of Object.entries(NAV_COMMANDS)) {
    if (lower.includes(phrase)) return { type: 'navigate', url }
  }
  return null
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useVoice(opts: UseVoiceOptions = {}): UseVoiceResult {
  const {
    onTranscript,
    onInterim,
    language  = 'en-US',
    continuous = false,
    autoStop  = 0,
  } = opts

  const [state,             setState]             = useState<VoiceState>('idle')
  const [transcript,        setTranscript]        = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error,             setError]             = useState<string | null>(null)

  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const autoStopRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Start false so server and first client render match, then update after mount
  const [isSupported, setIsSupported] = useState(false)
  const SpeechRecog = useRef<SpeechRecognitionCtor | null>(null)

  useEffect(() => {
    const ctor = getSpeechRecognition()
    SpeechRecog.current = ctor
    setIsSupported(!!ctor)
  }, [])

  const clearAutoStop = useCallback(() => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    clearAutoStop()
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setInterimTranscript('')
    setState('idle')
  }, [clearAutoStop])

  const start = useCallback(() => {
    if (!SpeechRecog.current) {
      setError('Voice input is not supported in this browser. Try Chrome or Edge.')
      setState('error')
      return
    }
    if (recognitionRef.current) stop()

    setError(null)
    setState('listening')
    setInterimTranscript('')

    const recognition = new SpeechRecog.current()
    recognition.lang        = language
    recognition.continuous  = continuous
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      clearAutoStop()
      let interim = ''
      let final   = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }

      if (interim) {
        setInterimTranscript(interim)
        onInterim?.(interim)
      }

      if (final) {
        setTranscript(final.trim())
        setInterimTranscript('')
        onTranscript?.(final.trim())

        if (autoStop > 0) {
          autoStopRef.current = setTimeout(() => stop(), autoStop)
        }
      }
    }

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      clearAutoStop()
      const msgs: Record<string, string> = {
        'not-allowed':    'Microphone permission denied. Click the mic icon in your browser address bar to allow access.',
        'no-speech':      'No speech detected. Please speak clearly.',
        'audio-capture':  'No microphone found. Please connect a microphone.',
        'network':        'Network error. Check your connection.',
        'aborted':        '',
      }
      const msg = msgs[event.error] ?? `Voice error: ${event.error}`
      if (msg) {
        setError(msg)
        setState('error')
      } else {
        setState('idle')
      }
      recognitionRef.current = null
    }

    recognition.onend = () => {
      if (!continuous) {
        setState('idle')
        setInterimTranscript('')
        recognitionRef.current = null
      } else {
        // Auto-restart if ended naturally (not from explicit stop()).
        // stop() nulls recognitionRef.current synchronously before onend fires.
        if (recognitionRef.current !== null) {
          setTimeout(() => {
            try { recognitionRef.current?.start() } catch { /* already starting */ }
          }, 150)
        } else {
          setState('idle')
          setInterimTranscript('')
        }
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [language, continuous, autoStop, onTranscript, onInterim, stop, clearAutoStop])

  const toggle = useCallback(() => {
    if (state === 'listening') stop()
    else start()
  }, [state, start, stop])

  const clear = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
    setError(null)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAutoStop()
      recognitionRef.current?.stop()
    }
  }, [clearAutoStop])

  return {
    state,
    transcript,
    interimTranscript,
    isSupported,
    isListening: state === 'listening',
    error,
    start,
    stop,
    toggle,
    clear,
  }
}

// ─── Global navigation voice hook (for shell-level use) ──────────────────────

export function useVoiceNavigation(): { isListening: boolean; toggle: () => void; isSupported: boolean } {
  const voice = useVoice({
    continuous: true,
    language:   'en-US',
    onTranscript: (text) => {
      const cmd = matchVoiceCommand(text)
      if (cmd?.type === 'navigate') {
        speak(`Navigating to ${text.replace(/^go to |^open /, '')}`)
        setTimeout(() => { window.location.href = cmd.url }, 600)
      }
    },
  })

  return { isListening: voice.isListening, toggle: voice.toggle, isSupported: voice.isSupported }
}
