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

let _voicesLogged = false

// Filter to English voices FIRST (by lang code), then rank by quality.
// This avoids picking a non-English Microsoft/Google voice by name accident.
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Log once for debugging (visible in browser devtools console)
  if (!_voicesLogged && voices.length > 0) {
    _voicesLogged = true
    console.info('[NEXUS TTS] Available voices:', voices.map(v => `${v.name} (${v.lang})`).join(', '))
  }

  // Step 1: isolate English voices — must have en-* lang code
  const english = voices.filter(v =>
    v.lang === 'en-US' || v.lang === 'en-GB' || v.lang === 'en-AU' ||
    v.lang === 'en-IN' || v.lang === 'en-CA' || v.lang === 'en-NZ' ||
    v.lang.startsWith('en-')
  )

  if (english.length === 0) {
    console.warn('[NEXUS TTS] No English voices found — browser will use system default. Install an English TTS voice in Windows Settings → Speech.')
    return null  // utterance.lang='en-US' still hints the browser to use English
  }

  // Step 2: prefer highest-quality within English voices only
  // Tier-A: Azure Neural / Google Neural (best quality)
  const tA = english.find(v => /Natural|Neural|Premium|Online/i.test(v.name))
  if (tA) return tA

  // Tier-B: Google named English voices
  const tB = english.find(v => /Google/i.test(v.name))
  if (tB) return tB

  // Tier-C: Microsoft named English voices (Zira, David, Aria, Jenny, etc.)
  const tC = english.find(v => /Microsoft/i.test(v.name))
  if (tC) return tC

  // Tier-D: macOS / iOS voices
  const tD = english.find(v => /Samantha|Karen|Moira|Daniel/i.test(v.name))
  if (tD) return tD

  // Tier-E: any English voice
  return english[0]
}

// ─── TTS queue — prevents successive speak() calls from cancelling each other ──
// Messages play sequentially; high-priority clears queue and jumps the line.
interface TTSItem {
  text:   string
  rate:   number
  pitch:  number
  lang:   string
  volume: number
  voice:  SpeechSynthesisVoice | null
}

const _ttsQueue: TTSItem[] = []
let _ttsBusy      = false
let _ttsGen       = 0   // generation counter — incremented on cancel so stale callbacks no-op
const MAX_QUEUE   = 4   // drop oldest normal-priority item when over limit

let _ttsWatchdog: ReturnType<typeof setTimeout> | null = null

// Exported so PipelineVoiceBar can show which voice is active
export let _activeVoiceName = ''

function _ttsNext(): void {
  if (_ttsBusy || _ttsQueue.length === 0 || typeof window === 'undefined') return
  const item = _ttsQueue.shift()!
  _ttsBusy = true
  _activeVoiceName = item.voice?.name ?? `en-US (system)`

  // Watchdog: if onend/onerror never fires, unblock the queue after estimated duration + 5s
  const wordsPerSec = Math.max(1, (item.rate ?? 1) * 2.5)
  const estMs = Math.ceil((item.text.split(/\s+/).length / wordsPerSec) * 1000) + 5000
  const myGen = _ttsGen
  _ttsWatchdog = setTimeout(() => {
    if (_ttsGen === myGen && _ttsBusy) { _ttsBusy = false; _ttsNext() }
  }, estMs)

  const u    = new SpeechSynthesisUtterance(item.text)
  u.rate     = item.rate
  u.pitch    = item.pitch
  u.lang     = item.lang
  u.volume   = item.volume
  if (item.voice) u.voice = item.voice

  const done = () => {
    // Ignore stale callbacks from cancelled utterances (race condition on high-priority cancel)
    if (_ttsGen !== myGen) return
    if (_ttsWatchdog) { clearTimeout(_ttsWatchdog); _ttsWatchdog = null }
    _ttsBusy = false
    _ttsNext()
  }
  u.onend   = done
  u.onerror = done
  window.speechSynthesis.speak(u)
}

function _enqueue(item: TTSItem, priority: 'normal' | 'high'): void {
  if (priority === 'high') {
    // Increment generation BEFORE cancel so the in-flight utterance's callbacks become no-ops
    _ttsGen++
    if (typeof window !== 'undefined') window.speechSynthesis.cancel()
    if (_ttsWatchdog) { clearTimeout(_ttsWatchdog); _ttsWatchdog = null }
    _ttsQueue.length = 0
    _ttsBusy = false
    _ttsQueue.push(item)
  } else {
    // Drop oldest if queue is full to avoid stale backlog
    if (_ttsQueue.length >= MAX_QUEUE) _ttsQueue.shift()
    _ttsQueue.push(item)
  }
  _ttsNext()
}

export function speak(
  text: string,
  opts: { rate?: number; pitch?: number; lang?: string; volume?: number; priority?: 'normal' | 'high' } = {},
): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return

  const priority = opts.priority ?? 'normal'

  const buildItem = (voices: SpeechSynthesisVoice[]): TTSItem => {
    const voice = pickVoice(voices)
    return {
      text,
      rate:   opts.rate   ?? 1.0,
      pitch:  opts.pitch  ?? 1.0,
      // Always use the voice's own language if one is found — prevents the browser
      // selecting a non-English voice while lang='en-US' is set (Windows edge case).
      lang:   voice?.lang ?? opts.lang ?? 'en-US',
      volume: opts.volume ?? 1.0,
      voice,
    }
  }

  const voices = window.speechSynthesis.getVoices()
  if (voices.length > 0) {
    _enqueue(buildItem(voices), priority)
  } else {
    // Chrome loads voices async — wait for the event then enqueue
    window.speechSynthesis.addEventListener(
      'voiceschanged',
      () => _enqueue(buildItem(window.speechSynthesis.getVoices()), priority),
      { once: true },
    )
  }
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
    _ttsQueue.length = 0
    _ttsBusy = false
  }
}

// Resolves when the TTS queue is fully drained (both queue empty AND not currently speaking).
// maxMs caps the wait so a hung browser never blocks the pipeline.
export function waitForSpeech(maxMs = 15_000): Promise<void> {
  return new Promise(resolve => {
    const deadline = Date.now() + maxMs
    const check = () => {
      if ((!_ttsBusy && _ttsQueue.length === 0) || Date.now() >= deadline) {
        resolve()
      } else {
        setTimeout(check, 200)
      }
    }
    check()
  })
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
