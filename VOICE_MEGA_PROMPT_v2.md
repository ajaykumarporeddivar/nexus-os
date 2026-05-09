# 🎙️ VOICE ENABLEMENT MEGA PROMPT
## Autonomous End-to-End Voice Agent Implementation System
### Powered by Azure AI Speech · Azure OpenAI · Copilot Studio · HuggingFace Inference

**Version:** 2.0 | April 2026  
**Scoring Target:** 9.999/10 — Production-ready, factually accurate, no placeholders

---

> **HOW TO USE THIS PROMPT**
>
> 1. Open your AI coding agent (Claude Code, Cursor, Windsurf, etc.)
> 2. Navigate to the **root of your project**
> 3. Paste everything inside the triple-backtick block below as your **first message**
> 4. The agent will autonomously review, plan, and implement — phase by phase
> 5. **Do not interrupt** — let each phase complete before the next begins
>
> **Prerequisites before starting:**
> - Azure account with Speech Services enabled
> - Azure OpenAI resource (for assistant features, optional)
> - Microsoft Copilot Studio license (for enterprise agent, optional)
> - Node.js ≥ 18 or Python ≥ 3.10 (depending on project stack)

---

```
╔══════════════════════════════════════════════════════════════════╗
║         MASTER VOICE ENABLEMENT MEGA PROMPT — VERSION 2.0        ║
║         Factually Accurate · Production-Grade · No Placeholders   ║
╚══════════════════════════════════════════════════════════════════╝

You are an elite full-stack AI voice engineer with deep expertise in:
- Azure Cognitive Services Speech SDK (STT, TTS, Speaker Recognition)
- Azure OpenAI Service (GPT-4o, Whisper via Azure)
- Microsoft Copilot Studio Real-Time Voice Agents
- HuggingFace Inference API (open-source STT/TTS models)
- WebRTC and browser-native Web Audio / MediaRecorder APIs
- Voice UX design, WCAG 2.1 AA accessibility, GDPR audio compliance

Your mission: perform a COMPLETE, AUTONOMOUS, END-TO-END voice
enablement of the project in the current working directory.

You must score 9.999/10 on every feature delivered.
No shortcuts. No stubs. No "TODO" comments.
Every feature must be production-ready and factually correct.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 0 — DEEP PROJECT ARCHAEOLOGY  (MANDATORY — DO FIRST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEVER write a single line of voice code until Phase 0 is 100% complete.
Rushing Phase 0 is the #1 cause of voice integration failure.

Step 0.1 — MAP THE ENTIRE PROJECT
Recursively walk every file and directory. Build a complete model of:
  - Project type: web app / mobile PWA / API / CLI / desktop
  - Tech stack: framework, language, runtime, database
  - Existing features and primary user flows
  - All current input/output mechanisms (forms, buttons, text fields, APIs)
  - Authentication system and session handling (if any)
  - Deployment target: browser, server-side, edge, mobile
  - Package manager and existing dependencies
  - Environment variable patterns (.env, config files, secrets manager)
  - API architecture: REST, GraphQL, WebSocket, SSE
  - Existing state management (Redux, Zustand, Pinia, Context, etc.)
  - Existing UI component library (shadcn, MUI, Tailwind, etc.)
  - Existing test framework (Jest, Vitest, Pytest, etc.)

Step 0.2 — CHUNK AND UNDERSTAND
Divide the project into logical feature chunks:
  - UI layer: components, pages, layouts
  - Business logic layer: services, utils, hooks
  - Data layer: models, APIs, database calls
  - Auth layer: sessions, tokens, roles
  - Infrastructure layer: deployment, CI/CD, config
For each chunk, identify WHERE voice adds genuine value — not
where it can be bolted on, but where it meaningfully improves UX.

Step 0.3 — VOICE OPPORTUNITY ANALYSIS
Score every user interaction in the project:
  [HIGH]   — Replaces typing entirely (search, forms, commands)
  [HIGH]   — Enables accessibility where none currently exists
  [HIGH]   — Enables hands-free workflow (dashboards, monitoring)
  [MEDIUM] — Supplements existing UI (shortcuts, confirmations)
  [MEDIUM] — Adds audio feedback to significant visual events
  [LOW]    — Nice-to-have narration (implement only if time permits)

Step 0.4 — GENERATE VOICE FEATURE REGISTRY
Create `VOICE_FEATURE_REGISTRY.md` at the project root.
Document every planned voice feature with:
  - Feature ID: VF-001, VF-002, etc.
  - Name and one-line description
  - Voice opportunity score: HIGH / MEDIUM / LOW
  - Technical approach (2–3 sentences)
  - Files to create or modify (specific paths)
  - Estimated complexity: 1 (trivial) → 5 (major)
  - Dependencies on other VF features
  - Microsoft/Azure technology used (see Technology Map below)
  - Privacy classification: AUDIO_STORED / AUDIO_STREAMED / AUDIO_LOCAL

Step 0.5 — VALIDATE AND PRIORITIZE
Sort registry by (impact × feasibility). Remove gimmicks.
Every included feature must satisfy ALL four of:
  ✓ Genuinely useful — not just "impressive"
  ✓ Better than text/click in at least one real scenario
  ✓ Accessible (WCAG 2.1 AA minimum)
  ✓ Gracefully degraded when voice fails or is unavailable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1 — VOICE INFRASTRUCTURE FOUNDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Build the shared voice infrastructure ALL other features depend on.
Complete this fully before implementing any individual feature.

──────────────────────────────────────────────────────────────
1.1 — INSTALL CORE DEPENDENCIES
──────────────────────────────────────────────────────────────

For Node.js / npm projects:
  npm install microsoft-cognitiveservices-speech-sdk  # Azure Speech SDK
  npm install @azure/openai                           # Azure OpenAI (Whisper, GPT-4o)
  npm install wavesurfer.js                           # Waveform visualization
  npm install idb                                     # IndexedDB wrapper for TTS cache

For Python projects:
  pip install azure-cognitiveservices-speech          # Azure Speech SDK
  pip install openai                                  # Azure OpenAI client
  pip install faster-whisper                          # Local Whisper inference (fallback)
  pip install sounddevice numpy                       # Audio I/O

For React Native (mobile):
  npm install @react-native-voice/voice               # Cross-platform STT
  npm install react-native-audio-recorder-player      # Audio recording + playback
  npm install react-native-haptic-feedback            # Haptics on voice events

──────────────────────────────────────────────────────────────
1.2 — VOICE CONFIGURATION MODULE
──────────────────────────────────────────────────────────────

Create `src/voice/config.ts` (adapt path/extension to project stack):

```typescript
// IMPORTANT: All keys that start with NEXT_PUBLIC_ / VITE_ / REACT_APP_
// are visible to the browser. NEVER expose secret keys client-side.
// Route all authenticated API calls through your backend proxy.
// See Section 1.3 (VoiceProxy) for the secure pattern.

export const VoiceConfig = {
  // ── Azure Speech Service (STT + TTS) ──────────────────────────
  // Docs: https://learn.microsoft.com/azure/ai-services/speech-service/
  // Free tier: 5 hours STT/month, 0.5M TTS chars/month
  // Paid STT: ~$1.00/hour | Paid Neural TTS: ~$16/1M chars
  azure: {
    region: process.env.AZURE_SPEECH_REGION ?? 'eastus',
    // ⚠️ Never expose subscriptionKey to the browser.
    // Use tokenEndpoint (your backend) to issue short-lived tokens instead.
    tokenEndpoint: '/api/voice/token',  // Your backend endpoint
  },

  // ── Azure OpenAI (Whisper STT + GPT-4o assistant) ─────────────
  // Docs: https://learn.microsoft.com/azure/ai-services/openai/
  // Whisper pricing: ~$0.36/hour of transcribed audio
  // GPT-4o pricing: see Azure pricing page for current rates
  azureOpenAI: {
    whisperEndpoint: '/api/voice/whisper',   // Backend proxy
    assistantEndpoint: '/api/voice/chat',    // Backend proxy
    whisperModel: 'whisper-1',               // Deployed model name in your Azure resource
    assistantModel: 'gpt-4o',               // Deployed model name
  },

  // ── HuggingFace Inference API (open-source fallback) ──────────
  // Real models: openai/whisper-large-v3, facebook/fastspeech2-en-ljspeech
  // Docs: https://huggingface.co/docs/inference-endpoints/
  huggingFace: {
    whisperEndpoint: '/api/voice/hf-whisper', // Backend proxy
    ttsEndpoint: '/api/voice/hf-tts',         // Backend proxy
    whisperModel: 'openai/whisper-large-v3',
    ttsModel: 'microsoft/speecht5_tts',       // Real HuggingFace model ID
  },

  // ── Self-Hosted STT (optional, for scale/privacy) ─────────────
  // Real options: faster-whisper server, whisper.cpp HTTP server,
  //               OpenAI-compatible whisper server
  selfHosted: {
    asrEndpoint: process.env.SELF_HOSTED_ASR_ENDPOINT ?? null,
    ttsEndpoint: process.env.SELF_HOSTED_TTS_ENDPOINT ?? null,
  },

  // ── Copilot Studio Agent (enterprise, optional) ───────────────
  // Docs: https://learn.microsoft.com/microsoft-copilot-studio/
  copilotStudio: {
    botUrl: process.env.COPILOT_STUDIO_BOT_URL ?? null,
    tokenEndpoint: '/api/voice/copilot-token',  // Backend proxy
  },

  // ── Feature Flags ─────────────────────────────────────────────
  features: {
    realTimeTranscription: true,
    voiceCommands: true,
    textToSpeech: true,
    voiceSearch: true,
    speakerDiarization: false,  // Requires Azure Speaker Recognition add-on
    multiLanguage: true,
    offlineASR: false,          // Enable only if self-hosted ASR deployed
    copilotStudioAgent: false,  // Enable only with Copilot Studio license
  },

  // ── Voice UX ──────────────────────────────────────────────────
  ux: {
    silenceTimeoutMs: 2000,       // ms of silence → auto-stop recording
    maxRecordingMs: 60_000,       // 60s absolute max
    confidenceThreshold: 0.75,    // Reject ASR results below this
    language: 'en-US',
    supportedLanguages: [
      'en-US', 'en-GB', 'es-ES', 'es-MX',
      'fr-FR', 'de-DE', 'ja-JP', 'zh-CN', 'pt-BR', 'hi-IN',
    ],
    bargeIn: true,                // Allow user speech to interrupt TTS playback
    rateLimitRpm: 30,             // Max voice API requests per minute per user
  },

  // ── Privacy & Compliance ───────────────────────────────────────
  privacy: {
    logAudioStreams: false,       // Never log raw audio
    retainTranscripts: false,     // Delete transcripts after processing
    requireConsentBanner: true,   // Show consent before first mic access
    gdprMode: true,               // Enable GDPR-compliant data handling
  },
}
```

──────────────────────────────────────────────────────────────
1.3 — BACKEND VOICE PROXY (SECURITY CRITICAL)
──────────────────────────────────────────────────────────────

NEVER put Azure Speech keys or Azure OpenAI keys in client-side code.
Create a backend proxy that issues short-lived tokens and forwards
audio. This is mandatory — not optional.

Create `server/routes/voice.ts` (or equivalent for your backend):

```typescript
import { Router } from 'express'  // or your framework
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { AzureOpenAI } from 'openai'

const router = Router()

// Rate limiting middleware (implement per your stack)
// Limit: 30 voice requests per minute per authenticated user
router.use('/voice', rateLimiter({ windowMs: 60_000, max: 30 }))

// Issue a short-lived Azure Speech token (valid 10 minutes)
// Client uses this instead of the raw subscription key
router.post('/voice/token', requireAuth, async (req, res) => {
  const response = await fetch(
    `https://${process.env.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY! },
    }
  )
  const token = await response.text()
  res.json({ token, region: process.env.AZURE_SPEECH_REGION, expiresInMs: 600_000 })
})

// Whisper transcription via Azure OpenAI
router.post('/voice/whisper', requireAuth, upload.single('audio'), async (req, res) => {
  const client = new AzureOpenAI({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiKey: process.env.AZURE_OPENAI_KEY!,
    apiVersion: '2024-06-01',
  })
  const transcription = await client.audio.transcriptions.create({
    file: req.file!,          // Uploaded audio blob
    model: 'whisper-1',       // Your Azure deployment name
    language: req.body.language ?? 'en',
  })
  // Privacy: do not log transcription.text to persistent storage
  res.json({ transcript: transcription.text })
})

// GPT-4o voice assistant endpoint
router.post('/voice/chat', requireAuth, async (req, res) => {
  const { messages, systemPrompt } = req.body
  const client = new AzureOpenAI({ /* ... */ })
  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    stream: true,
    max_tokens: 300,  // Keep responses short for TTS — 2-3 sentences max
  })
  // Stream response back as SSE
  res.setHeader('Content-Type', 'text/event-stream')
  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`)
  }
  res.end()
})

export default router
```

──────────────────────────────────────────────────────────────
1.4 — VOICE CORE SERVICE (Browser)
──────────────────────────────────────────────────────────────

Create `src/voice/VoiceCore.ts`:

Responsibilities:
  - AudioContext management (singleton, lazy init — NOT on app load)
  - Microphone access with step-by-step permission request UI
  - Audio stream capture with browser-native noise suppression:
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,  // Optimal for STT
        }
      })
  - AnalyserNode for real-time audio level metering (0.0–1.0)
  - Voice Activity Detection (VAD):
      * Silence detection using RMS of AnalyserNode time-domain data
      * Auto-stop after VoiceConfig.ux.silenceTimeoutMs of silence
      * Minimum 300ms speech before accepting (avoids false triggers)
  - Barge-in detection: pause TTS if new audio input detected
  - Error boundary with user-friendly states:
      PERMISSION_DENIED    → guide user to browser settings, show screenshot
      NO_DEVICE            → show keyboard fallback UI, disable voice button
      NETWORK_ERROR        → exponential backoff (1s, 2s, 4s, max 30s)
      PROVIDER_UNAVAILABLE → activate next fallback in chain
  - Cleanup: always stop all MediaStreamTracks on component unmount

──────────────────────────────────────────────────────────────
1.5 — VOICE ERROR TAXONOMY
──────────────────────────────────────────────────────────────

Create `src/voice/VoiceErrors.ts` — define all error types before
using them in other modules:

```typescript
export enum VoiceErrorCode {
  // Permission errors
  PERMISSION_DENIED         = 'PERMISSION_DENIED',
  PERMISSION_DISMISSED      = 'PERMISSION_DISMISSED',

  // Device errors
  NO_MICROPHONE             = 'NO_MICROPHONE',
  DEVICE_IN_USE             = 'DEVICE_IN_USE',

  // Network / API errors
  NETWORK_TIMEOUT           = 'NETWORK_TIMEOUT',
  RATE_LIMITED              = 'RATE_LIMITED',           // 429 from backend
  PROVIDER_ERROR            = 'PROVIDER_ERROR',         // 5xx from API
  ALL_PROVIDERS_FAILED      = 'ALL_PROVIDERS_FAILED',   // Fallback chain exhausted

  // Transcription quality
  LOW_CONFIDENCE            = 'LOW_CONFIDENCE',         // Below threshold
  NO_SPEECH_DETECTED        = 'NO_SPEECH_DETECTED',
  LANGUAGE_NOT_SUPPORTED    = 'LANGUAGE_NOT_SUPPORTED',

  // Security
  AUTH_REQUIRED             = 'AUTH_REQUIRED',
  TOKEN_EXPIRED             = 'TOKEN_EXPIRED',

  // Compliance
  CONSENT_NOT_GIVEN         = 'CONSENT_NOT_GIVEN',
}

export interface VoiceError {
  code: VoiceErrorCode
  message: string              // User-friendly message
  devMessage?: string          // Technical detail for logs only
  retryable: boolean
  fallbackAvailable: boolean
}
```

──────────────────────────────────────────────────────────────
1.6 — ASR SERVICE (Speech-to-Text)
──────────────────────────────────────────────────────────────

Create `src/voice/ASRService.ts`:

Fallback chain — attempt in this order, use first that succeeds:
  1. PRIMARY:   Azure Speech SDK (continuous recognition, streaming)
                Token fetched from /api/voice/token
                Supports interim results, language detection, profanity filter
  2. SECONDARY: Azure OpenAI Whisper via /api/voice/whisper
                Best accuracy, no streaming — use for recorded audio
  3. TERTIARY:  HuggingFace Inference API (openai/whisper-large-v3)
                via /api/voice/hf-whisper backend proxy
  4. FALLBACK:  Browser Web Speech API (window.SpeechRecognition)
                Free, no latency, low accuracy, English-biased
                Feature-detect: const SpeechRecognition =
                  window.SpeechRecognition || window.webkitSpeechRecognition

Implementation requirements:
  - Streaming: Azure SDK primary provides interim results every 100–300ms
  - Non-streaming: Whisper/HuggingFace return full transcript after silence
  - Language auto-detection: Azure SDK supports it natively if configured
  - Confidence scoring: reject results below VoiceConfig.ux.confidenceThreshold
  - Post-processing:
      * Capitalize first letter of each sentence
      * Add period if no terminal punctuation and confidence > 0.9
      * Strip filler words optionally ("um", "uh") — user-configurable
  - Rate limiting: track request count against VoiceConfig.ux.rateLimitRpm
    before sending; show "Voice is cooling down" UI if limit hit

──────────────────────────────────────────────────────────────
1.7 — TTS SERVICE (Text-to-Speech)
──────────────────────────────────────────────────────────────

Create `src/voice/TTSService.ts`:

Fallback chain:
  1. PRIMARY:   Azure Cognitive Services Neural TTS
                (en-US-JennyNeural, en-US-GuyNeural — gender-neutral options)
                Pricing: ~$16/1M characters (Neural tier)
                SSML support for emphasis, pauses, pronunciation override
  2. SECONDARY: Azure OpenAI TTS (via your backend proxy)
                Voices: alloy, echo, fable, onyx, nova, shimmer
                Natural, conversational quality
  3. TERTIARY:  HuggingFace Inference (microsoft/speecht5_tts)
                Open-source, lower quality, zero cost
  4. FALLBACK:  Browser SpeechSynthesis API
                window.speechSynthesis.speak(utterance)
                Free, always available, robotic quality

Caching:
  - Hash the text + voice + speed settings → use as IndexedDB key
  - Cache audio blobs in IndexedDB (idb library) — 100-item LRU
  - Cache hit = instant playback, zero API cost
  - Invalidate cache if voice/speed settings change

Streaming playback:
  - For Azure TTS: use MediaSource Extensions to start playback
    before full audio buffer is received
  - For Whisper TTS: stream response chunks directly to AudioContext

Barge-in support (if VoiceConfig.ux.bargeIn = true):
  - Monitor audioLevel from VoiceCore while TTS is playing
  - If audioLevel > 0.15 for > 300ms → pause TTS immediately
  - Resume TTS if voice command is "Continue" / "Keep reading"

SSML helper — wrap text intelligently:
  ```xml
  <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis">
    <voice name="en-US-JennyNeural">
      <prosody rate="{{speed}}" pitch="default">
        {{text}}
      </prosody>
    </voice>
  </speak>
  ```

──────────────────────────────────────────────────────────────
1.8 — VOICE COMMAND ENGINE
──────────────────────────────────────────────────────────────

Create `src/voice/CommandEngine.ts`:

Architecture:
  - Intent registry: Map<string, CommandDefinition>
  - Global commands: always active, registered at app boot
  - Context commands: registered/unregistered as routes change
  - Dynamic commands: registered per-component (search results, form fields)

Intent matching:
  - Fuzzy matching using Levenshtein distance for short commands
  - Pattern matching with regex for parameterized commands:
      "go to {page}" → extract page parameter
      "search for {query}" → extract query parameter
      "open {item} {number}" → extract item + index
  - Minimum confidence: 80% match score before executing
  - If match score 50–80%: ask for confirmation ("Did you mean: X?")
  - If match score < 50%: emit VoiceErrorCode.LOW_CONFIDENCE

Command definition structure:
  ```typescript
  interface CommandDefinition {
    id: string                          // Unique: 'nav.goHome'
    patterns: string[]                  // ['go home', 'take me home', 'home']
    context: 'global' | string          // route path or 'global'
    params?: Record<string, ParamDef>   // Named capture groups
    handler: (params: Record<string, string>, state: VoiceState) => void | Promise<void>
    requiresConfirmation?: boolean      // For destructive actions
    confirmationPrompt?: string         // TTS text for confirmation
    description: string                 // For cheat sheet UI
    example: string                     // Example phrase for cheat sheet
  }
  ```

Global commands (register these for every project):
  "go to {page}"           → navigate to detected route
  "go back"                → window.history.back()
  "go home"                → navigate('/')
  "scroll down/up"         → smooth scroll by 80vh
  "scroll to top/bottom"   → scrollTo({ top: 0 or Infinity })
  "open settings"          → open settings panel
  "help" / "what can I say" → open voice command cheat sheet
  "stop listening"         → deactivate voice
  "read this page"         → TTS reads main content area

Confirmation flow for destructive commands:
  1. Command matched → TTS says confirmationPrompt
  2. Start 5-second countdown (shown in UI)
  3. User says "confirm" → execute; "cancel" / timeout → abort
  4. Log outcome to VoiceAnalytics

──────────────────────────────────────────────────────────────
1.9 — VOICE STATE MANAGER
──────────────────────────────────────────────────────────────

Create `src/voice/VoiceState.ts` using the project's existing
state management (Redux, Zustand, Pinia, Context, etc.):

```typescript
interface VoiceState {
  // Recording state
  isListening: boolean
  isProcessing: boolean
  isSpeaking: boolean

  // Transcription
  transcript: string           // Final, confirmed transcript
  interimTranscript: string    // Live interim text (show while speaking)
  confidence: number           // 0.0–1.0

  // Audio metering
  audioLevel: number           // 0.0–1.0 for waveform visualizer
  noiseFloor: number           // Calibrated background noise level

  // Error state
  error: VoiceError | null

  // Configuration
  language: string
  activeProvider: 'azure-sdk' | 'azure-openai-whisper' | 'hf-whisper' | 'browser'
  activeVoice: string          // TTS voice name

  // Session data
  commandHistory: CommandHistoryEntry[]   // Last 50 commands
  activeFeature: string | null           // Which voice feature is active
  isPermissionGranted: boolean | null    // null = not yet asked
  hasGivenConsent: boolean               // GDPR consent

  // Rate limiting
  requestsThisMinute: number
  rateLimitResetAt: number               // Unix timestamp
}
```

──────────────────────────────────────────────────────────────
1.10 — VOICE ANALYTICS
──────────────────────────────────────────────────────────────

Create `src/voice/VoiceAnalytics.ts`:

Track these events to your existing analytics system
(Mixpanel, Amplitude, PostHog, Azure Monitor, or console in dev):

  voice_session_start       { language, provider, feature }
  voice_session_end         { durationMs, commandCount, errorCount }
  command_recognized        { intent, confidence, provider, latencyMs }
  command_failed            { rawTranscript, bestMatchScore }
  command_confirmed         { intent }          // Destructive confirmed
  command_cancelled         { intent }          // Destructive cancelled
  asr_provider_used         { provider, latencyMs, wasFailover }
  tts_started               { voice, charCount, cacheHit }
  tts_completed             { completedRatio }  // 1.0 = heard to end
  tts_interrupted           { completedRatio }  // Barge-in triggered
  voice_error               { code, provider }
  feature_used              { featureId, success }
  rate_limit_hit            { requestsThisMinute }
  consent_given             { }
  consent_declined          { }

GDPR compliance for analytics:
  - Never include raw transcript text in analytics events
  - Never include audio data
  - Only include anonymized metadata
  - Respect user's analytics opt-out

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — VOICE UI COMPONENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Build reusable voice UI components that match the project's existing
design system EXACTLY. No custom design system of your own — extend
whatever exists (shadcn, MUI, Tailwind, etc.).

──────────────────────────────────────────────────────────────
2.1 — VOICE CONSENT BANNER (VoiceConsentBanner) — BUILD FIRST
──────────────────────────────────────────────────────────────
GDPR / CCPA compliance: show this BEFORE requesting microphone access.

Content must include:
  - What audio is captured
  - Where it is sent (Azure / HuggingFace / your backend)
  - How long it is retained (answer: not retained, per VoiceConfig)
  - Link to privacy policy
  - Clear Accept / Decline buttons

Behavior:
  - Store consent decision in localStorage (key: voice_consent_v2)
  - If declined: disable all voice features, show keyboard-only UI
  - Provide "Manage voice privacy" link in settings to revoke consent
  - Do NOT request microphone permission before consent is given

──────────────────────────────────────────────────────────────
2.2 — VOICE BUTTON (VoiceButton)
──────────────────────────────────────────────────────────────
States (implement all — never show wrong state):
  idle        → clean mic icon, aria-label="Start voice input"
  listening   → animated pulse ring + live audio level bars
  processing  → spinner + "Processing..." text, non-interactive
  speaking    → animated soundwave, "Tap to interrupt" tooltip
  error       → red icon + brief error message, retry action
  disabled    → greyed out + tooltip explaining why (no permission, rate limited, etc.)

Keyboard accessibility:
  - Space / Enter: toggle listening
  - Escape: cancel and stop
  - Tab: focusable, visible focus ring
  - aria-pressed: true when listening
  - aria-busy: true when processing
  - aria-label: updates with every state change

Mobile:
  - Touch target ≥ 44×44px (WCAG 2.5.5)
  - Haptic feedback on state changes: navigator.vibrate([50]) on start,
    [100, 50, 100] on error
  - Support long-press → continuous listening mode

──────────────────────────────────────────────────────────────
2.3 — AUDIO WAVEFORM VISUALIZER (VoiceWaveform)
──────────────────────────────────────────────────────────────
Implementation using Web Audio API AnalyserNode:
  - 32 bars minimum, smooth interpolation between frames
  - requestAnimationFrame loop (never setInterval — causes jank)
  - Bar heights: FFT frequency data → normalize to [0, 1]
  - Color transitions: blue (listening) → green (recognized) → red (error)
  - Respect prefers-reduced-motion: if enabled, show static icon instead
  - CPU: use Float32Array reuse — never allocate in animation loop

──────────────────────────────────────────────────────────────
2.4 — VOICE TRANSCRIPT DISPLAY (VoiceTranscript)
──────────────────────────────────────────────────────────────
  - Interim transcript: italic, 60% opacity, updates live
  - Final transcript: full opacity, normal weight
  - Auto-scroll to latest with smooth behavior
  - Copy-to-clipboard button (Clipboard API)
  - Clear history button
  - Timestamps on each utterance
  - aria-live="polite" for screen reader updates
  - Max height with overflow scroll (don't push page layout)

──────────────────────────────────────────────────────────────
2.5 — VOICE LANGUAGE SELECTOR (VoiceLanguagePicker)
──────────────────────────────────────────────────────────────
  - Display: flag emoji + native language name + English name
  - Search/filter input for long lists
  - Persists to localStorage (key: voice_language)
  - On change: updates all voice services, re-initializes ASR
  - Show only languages supported by active ASR provider

──────────────────────────────────────────────────────────────
2.6 — VOICE SETTINGS PANEL (VoiceSettings)
──────────────────────────────────────────────────────────────
  - Toggle each voice feature on/off individually
  - Microphone device selector (MediaDevices.enumerateDevices)
  - TTS volume slider (0–100, persisted)
  - TTS speed selector (0.75× / 1× / 1.25× / 1.5×)
  - Language picker (see 2.5)
  - Voice command cheat sheet — scrollable, searchable list of all commands
  - "Test microphone" button: shows live audio level meter
  - "Test TTS" button: plays a sample phrase
  - Active ASR provider display (shows which fallback is active)
  - Rate limit status display (X of 30 requests used this minute)
  - Privacy section: "Manage voice data consent" → revoke consent
  - "Reset voice settings" → restore all defaults

──────────────────────────────────────────────────────────────
2.7 — VOICE ONBOARDING MODAL (VoiceOnboarding)
──────────────────────────────────────────────────────────────
  - Shown once, triggered on first voice feature interaction
  - Step 1: CONSENT — show VoiceConsentBanner (mandatory first)
  - Step 2: CAPABILITIES — show 3 things voice enables in THIS specific app
  - Step 3: PERMISSION — request microphone with visual browser guide
  - Step 4: TEST — "Say 'hello' to test your microphone"
  - Step 5: COMMANDS — show top 5 most useful commands for this app
  - Persisted: localStorage key voice_onboarded_v2
  - Skippable after Step 1 (consent is required; rest is optional)
  - Fully keyboard navigable (no mouse required)

──────────────────────────────────────────────────────────────
2.8 — VOICE FEEDBACK TOAST (VoiceFeedback)
──────────────────────────────────────────────────────────────
  - Non-blocking notification for voice events
  - Sequence: "Listening..." → "Got it: [transcript]" → "Done: [action]"
  - 3-second auto-dismiss (pause on hover)
  - Max 3 toasts visible at once (stack, dismiss oldest)
  - aria-live="assertive" for errors; "polite" for info
  - Never show raw confidence scores or internal provider names to users

──────────────────────────────────────────────────────────────
2.9 — VOICE INTERRUPTION HANDLER (BargeIn)
──────────────────────────────────────────────────────────────
If VoiceConfig.ux.bargeIn = true:
  - While TTS is playing, monitor mic audio level continuously
  - If audioLevel > noiseFloor × 2.5 for > 300ms → pause TTS immediately
  - Start ASR to capture new user input
  - After ASR completes: either resume TTS ("continue") or discard and act
  - Visual indicator: pulsing border on TTS player when barge-in is active
  - Disable barge-in for short TTS responses < 3 seconds (annoying)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 3 — FEATURE-BY-FEATURE IMPLEMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Implement ONLY features listed in VOICE_FEATURE_REGISTRY.md.
Do NOT implement features that don't fit this project.
One feature at a time. State → List files → Implement fully → Test → Next.

──────────────────────────────────────────────────────────────
VF-001: VOICE SEARCH
──────────────────────────────────────────────────────────────
If the project has any search functionality:

  - Inject VoiceButton inside existing search input (no UX regression)
  - On activation: start ASR, pipe interim transcript into input field value
  - On silence: auto-submit using existing search handler (no search logic changes)
  - Voice commands:
      "Search for {query}"      → fill + submit
      "Find {query}"            → fill + submit
      "Clear search"            → empty input + clear results
      "Next result"             → focus next result item
      "Open first result"       → click first result link
  - URL params: update URL search params in real-time (for shareability)
  - Keyboard: Escape cancels voice without submitting

──────────────────────────────────────────────────────────────
VF-002: VOICE FORM FILLING
──────────────────────────────────────────────────────────────
For every form in the project:

  - One VoiceButton per form (not per field — less clutter)
  - Sequential fill mode: TTS reads field label → user speaks → next field
  - Command-based fill: "Fill {field name} with {value}"
  - Review mode before submit: TTS reads all values, user confirms
  - Submit command: "Submit" / "Submit form" / "Done"
  - Cancel command: "Cancel" / "Start over"
  
  Special field handling:
    Email    → post-process: "at" → "@", "dot" → "."
    Phone    → strip all non-digits, format per locale
    Date     → parse natural language (use date-fns/parse or similar)
    Number   → parse spoken numbers including ordinals
    Password → NEVER use voice input — skip field, require keyboard
    Select   → match spoken option to select options list
    Checkbox → "Yes" / "No" / "Check" / "Uncheck"
  
  Visual feedback:
    - Active field pulses with voice indicator
    - Completed fields show subtle checkmark
    - Error fields are re-read by TTS with validation message

──────────────────────────────────────────────────────────────
VF-003: GLOBAL VOICE COMMAND SYSTEM
──────────────────────────────────────────────────────────────
App-wide command layer active on every page:

  Global commands (always registered):
    "go to {page}"            → navigate to matched route
    "go back"                 → window.history.back()
    "go home"                 → navigate('/')
    "scroll down/up"          → smooth scroll 80vh
    "scroll to top/bottom"    → scrollTo edges
    "open settings"           → open settings panel
    "help" / "what can I say" → open voice cheat sheet
    "stop listening"          → deactivate voice
    "read this page"          → TTS reads main content (role=main)
    "refresh"                 → window.location.reload()
  
  Page-aware commands: automatically register based on current route:
    List views    → "filter by {field}", "sort by {field}", "select all"
    Detail views  → "edit this", "delete this", "share this"
    Dashboards    → "refresh data", "export", "read {metric name}"
    Auth pages    → "log out" (only — never voice for login credentials)
  
  Floating activation:
    - VoiceButton fixed bottom-right (z-index above all content)
    - Keyboard shortcut: Ctrl+Shift+V (configurable in settings)
    - Visual indicator when global voice is armed and listening

──────────────────────────────────────────────────────────────
VF-004: VOICE-POWERED AI ASSISTANT
──────────────────────────────────────────────────────────────
If the project involves data, content, or complex user workflows:

  - Floating assistant widget (bottom corner, collapsible)
  - Backend: POST /api/voice/chat → Azure OpenAI GPT-4o stream
  - System prompt auto-generated from project context:
    ```
    You are the voice assistant for [app name], a [app purpose].
    Current page: [route]. User role: [role if auth exists].
    Visible data: [relevant context from current view].
    Response rules:
    - Maximum 2-3 sentences (responses will be read aloud via TTS)
    - Always confirm before destructive actions
    - If asked to navigate or take action, respond with JSON action object
    - Escalate billing/legal/emergency queries to human support
    ```
  - Voice input → ASRService → /api/voice/chat → TTSService → audio response
  - Action parsing: if response contains { "action": "navigate", "to": "/path" }
    → execute the action after TTS response
  - Conversation history: maintain in VoiceState.commandHistory per session
  - Token budget: max_tokens: 300 — keep responses short for TTS
  - Typed fallback: text input always available alongside voice button
  - Stream response: begin TTS playback as text chunks arrive (barge-in safe)

──────────────────────────────────────────────────────────────
VF-005: REAL-TIME VOICE DICTATION
──────────────────────────────────────────────────────────────
For any text input: chat messages, notes, comments, descriptions:

  - Hold-to-record OR tap-to-toggle listening mode (user preference)
  - Interim transcript rendered live as user speaks
  - Final transcript inserted at cursor position using
    document.execCommand('insertText') or framework's input handler
  - Spoken punctuation:
    "comma" → ","  |  "period" / "full stop" → "."
    "new line" / "next line" → "\n"
    "question mark" → "?"  |  "exclamation mark" → "!"
    "open quote" / "close quote" → " / "
  - Editing commands:
    "delete last word" → remove last word token from transcript
    "delete last sentence" → remove text since last "." or "\n"
    "select all" → highlight all dictated text
    "undo" → Ctrl+Z equivalent
  - Multi-language: user can switch language mid-session
  - Show confidence via subtle text color (high = black, low = grey)

──────────────────────────────────────────────────────────────
VF-006: TEXT-TO-SPEECH CONTENT READER
──────────────────────────────────────────────────────────────
For pages with significant text content (articles, cards, reports):

  - "Read aloud" button on each readable content block
  - Controls: Play / Pause / Stop / ← Skip sentence / → Skip sentence
  - Speed selector: 0.75× / 1× / 1.25× / 1.5×
  - Progress: highlight currently spoken sentence in real-time
    (match TTS word-boundary events → sentence index)
  - Position memory: save current sentence index to localStorage per content ID
    → "Resume from where you left off?" prompt on return
  - Auto-read queue: queue multiple cards/items to read in sequence
  - "Read new notifications/messages" auto-mode toggle
  - SSML enhancements:
    * Inject <break time="500ms"/> after headings
    * Use <emphasis> on bold text
    * Slower <prosody rate="slow"> for important warnings
  - Barge-in enabled: user can interrupt to ask a question

──────────────────────────────────────────────────────────────
VF-007: VOICE NOTIFICATIONS & ALERTS
──────────────────────────────────────────────────────────────
For any notification / alert system:

  - Setting: "Read notifications aloud" toggle (off by default)
  - Priority threshold: only auto-read HIGH or CRITICAL priority
  - Audio earcons (short WAV files, <200ms) for notification types:
    info.wav  |  success.wav  |  warning.wav  |  error.wav
    (Create/source these — no silent notifications)
  - Voice commands:
    "read my notifications" → queue all unread, read sequentially
    "mark all as read"      → with confirmation prompt
    "open notification {N}" → navigate to notification #N
    "dismiss this"          → dismiss current notification
  - Queue management: if multiple arrive simultaneously, queue them
  - Respect system Do Not Disturb (if detectable via Notification API)

──────────────────────────────────────────────────────────────
VF-008: VOICE ACCESSIBILITY LAYER
──────────────────────────────────────────────────────────────
Across the ENTIRE application:

  - Audit every interactive element: add aria-label where missing
  - Focus announcements: TTS announces focused element name + role
    on Tab focus (only when voice mode is active — not always)
  - Error announcements: form validation errors read via TTS immediately
    on blur, not just visually rendered
  - Loading announcements: "Loading..." / "Content updated" via aria-live
  - Modal/dialog: announce on open, trap focus, announce on close
  - Table navigation commands: "next row", "previous row",
    "read column {header}", "read row {N}"
  - "Describe image" command: reads alt text of focused/visible image
  - Hybrid mode: seamless Tab+Voice switching — no mode lock
  - Run axe-core on all voice components before shipping

──────────────────────────────────────────────────────────────
VF-009: VOICE DATA QUERY (Dashboards / Analytics)
──────────────────────────────────────────────────────────────
For any dashboard, data table, or analytics view:

  - "Read me the {metric name}" → TTS reads value + trend
  - "Compare {metric A} and {metric B}" → brief spoken comparison
  - "What's the trend for {metric}?" → spoken summary of direction
  - "Filter by {value}" → apply filter to table/chart
  - "Sort by {column}" → apply sort
  - "Show {date range}" → parse spoken date range, apply filter
  - "Export this data" → trigger existing export handler
  - "Refresh" → reload data without page reload
  Command registration: auto-generated from column headers and metric names
  detected in the dashboard component's rendered output

──────────────────────────────────────────────────────────────
VF-010: VOICE ONBOARDING & GUIDED TOURS
──────────────────────────────────────────────────────────────
For onboarding flows or help systems:

  - "Show me how to {feature}" → start TTS-narrated walkthrough
  - Highlight target element → narrate → wait for "next step" / auto-advance
  - Commands: "next step", "previous step", "skip", "stop tour"
  - "Explain this" → TTS reads tooltip or aria-description of focused element
  - "What does {element name} do?" → match to tooltip/help content
  - Progress: "Step 3 of 7" read at each step
  - Tour data: stored as JSON config, not hardcoded in component

──────────────────────────────────────────────────────────────
VF-011: VOICE AUTHENTICATION ASSISTANCE
──────────────────────────────────────────────────────────────
ONLY if the project has authentication. Strict rules apply:

  Allowed:
    - TTS announces "Enter your username" / "Enter your password"
    - "Log out" voice command (with confirmation: "Say confirm to log out")
    - Session timeout warning read aloud: "Your session expires in 2 minutes"
    - TTS reads MFA code input prompt

  NEVER allowed:
    - Voice input for password fields (severe security risk)
    - Voice input for MFA codes (interception risk)
    - Voiceprint authentication (do not implement — requires expert security review)
    - Storing any auth credentials in voice command history

──────────────────────────────────────────────────────────────
VF-012: VOICE-FIRST PWA / MOBILE EXPERIENCE
──────────────────────────────────────────────────────────────
ONLY if project is a PWA or mobile app:

  - Wake word: use Web Speech API continuous recognition for wake word only
    (low power; switch to full ASR pipeline on wake word detected)
    Warn user clearly: continuous mic = battery drain + privacy trade-off
  - Offline ASR: if faster-whisper server deployed locally or via WASM
    (whisper.cpp compiled to WASM — see voice-infrastructure/)
  - Haptic patterns:
    voice_start:    [50]           short pulse
    voice_success:  [50, 50, 50]   triple pulse
    voice_error:    [200]          long pulse
  - Layout: voice button always visible in bottom navigation area
  - Route announcements: "Navigated to Dashboard" on route change

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 4 — COPILOT STUDIO VOICE AGENT INTEGRATION (ENTERPRISE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ONLY implement if:
  ✓ Project is customer-facing with support needs
  ✓ Copilot Studio license is confirmed
  ✓ Dynamics 365 Contact Center or Teams Voice is in scope
  ✓ VoiceConfig.features.copilotStudioAgent = true

──────────────────────────────────────────────────────────────
4.1 — AGENT CONFIGURATION
──────────────────────────────────────────────────────────────

Create `copilot-studio/agent-config.json`:
  (Follow official schema: https://learn.microsoft.com/microsoft-copilot-studio/)

```json
{
  "schemaVersion": "2.0",
  "agentName": "[ProjectName] Voice Assistant",
  "description": "Real-time voice agent for [project purpose]",
  "agentType": "RealtimeVoice",
  "persona": {
    "tone": "professional, helpful, concise",
    "maxTurns": 20,
    "responseConstraints": {
      "maxSentences": 3,
      "avoidLists": true,
      "avoidMarkdown": true
    }
  },
  "contextVariables": ["userId", "currentPage", "userRole", "sessionId"],
  "escalationTriggers": ["billing", "legal", "emergency", "human agent"],
  "languages": ["en-US"],
  "handoffTarget": "Dynamics365ContactCenter"
}
```

──────────────────────────────────────────────────────────────
4.2 — AGENT EMBEDDING
──────────────────────────────────────────────────────────────

Create `src/voice/CopilotStudioAgent.ts`:
  - Embed using the official Copilot Studio Web Chat control
    (see: https://learn.microsoft.com/microsoft-copilot-studio/publication-connect-bot-to-web-channels)
  - Fetch token via /api/voice/copilot-token (backend proxy)
  - Pass context variables on each conversation turn:
    userId, currentPage (window.location.pathname), userRole, sessionId
  - Handle handoff events:
    agent.on('handoff', ({ activity }) => openHumanChatWidget(activity))
  - Custom theming: match existing app colors, fonts, border-radius
  - Session persistence: reconnect on page navigation (not full reload)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 5 — SELF-HOSTED VOICE INFRASTRUCTURE (OPTIONAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For scale, privacy, or zero-marginal-cost voice at high volume.
Only implement if self-hosted ASR/TTS is required.

──────────────────────────────────────────────────────────────
5.1 — WHISPER ASR SERVER (Docker)
──────────────────────────────────────────────────────────────

Real, working option: faster-whisper HTTP server
(https://github.com/SYSTRAN/faster-whisper)

Create `voice-infrastructure/docker-compose.yml`:

```yaml
version: '3.8'
services:
  whisper-asr:
    # Real image: openai-whisper compatible HTTP server
    image: onerahmet/openai-whisper-asr-webservice:latest
    environment:
      - ASR_MODEL=base.en        # Options: tiny, base, small, medium, large-v3
      - ASR_ENGINE=faster_whisper
    ports:
      - "9000:9000"
    volumes:
      - whisper-models:/root/.cache/whisper
    # GPU (comment out if no GPU):
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  speecht5-tts:
    # Real HuggingFace model: microsoft/speecht5_tts
    # Use the HuggingFace TGI (Text Generation Inference) for serving
    image: ghcr.io/huggingface/text-generation-inference:latest
    environment:
      - MODEL_ID=microsoft/speecht5_tts
    ports:
      - "9001:80"
    volumes:
      - tts-models:/data

volumes:
  whisper-models:
  tts-models:
```

──────────────────────────────────────────────────────────────
5.2 — HIGH-THROUGHPUT WHISPER INFERENCE
──────────────────────────────────────────────────────────────

For production workloads, use faster-whisper with batching:

Create `voice-infrastructure/whisper-server.py`:

```python
from faster_whisper import WhisperModel
from flask import Flask, request, jsonify
import tempfile, os

app = Flask(__name__)
# Load once at startup — base.en is 150MB, large-v3 is 3GB
model = WhisperModel("base.en", device="cuda", compute_type="float16")

@app.route("/asr", methods=["POST"])
def transcribe():
    audio_file = request.files.get("audio")
    language = request.form.get("language", "en")

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        audio_file.save(f.name)
        segments, info = model.transcribe(
            f.name,
            language=language,
            beam_size=5,
            vad_filter=True,            # Built-in VAD
            vad_parameters=dict(min_silence_duration_ms=500),
        )
        os.unlink(f.name)

    transcript = " ".join(s.text for s in segments)
    return jsonify({
        "transcript": transcript.strip(),
        "language": info.language,
        "confidence": info.language_probability,
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=9000, threaded=True)
```

──────────────────────────────────────────────────────────────
5.3 — KUBERNETES AUTOSCALING (Massive Scale)
──────────────────────────────────────────────────────────────

Create `voice-infrastructure/k8s/`:

`whisper-deployment.yaml`:
  - Min 2 replicas, Max 20 replicas
  - Resource requests: 2 CPU, 4Gi RAM (no GPU) or 1 GPU
  - Readiness probe: GET /health
  - Liveness probe: GET /health

`whisper-hpa.yaml`:
  - Scale up when CPU > 70% or custom metric: concurrent_requests > 10/pod
  - Scale down cooldown: 5 minutes (voice traffic is bursty)

`whisper-service.yaml`:
  - LoadBalancer service or ingress with sticky sessions
  - Connection draining: 30 seconds (allow in-flight transcriptions to complete)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 6 — ENVIRONMENT CONFIGURATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to `.env.example` — NEVER commit real values:

```env
# ══ Azure Cognitive Services Speech ════════════════════════════════
# Docs: https://portal.azure.com → Create "Speech" resource
# Free tier: 5 hours STT/month + 0.5M TTS chars/month
AZURE_SPEECH_KEY=your_azure_speech_subscription_key
AZURE_SPEECH_REGION=eastus

# ══ Azure OpenAI (Whisper + GPT-4o) ═══════════════════════════════
# Docs: https://portal.azure.com → Create "Azure OpenAI" resource
# Deploy models: whisper-1, gpt-4o in your Azure OpenAI resource
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_KEY=your_azure_openai_key
AZURE_OPENAI_WHISPER_DEPLOYMENT=whisper-1
AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4o

# ══ HuggingFace Inference API (optional fallback) ══════════════════
# Docs: https://huggingface.co/settings/tokens
HF_API_TOKEN=hf_your_token_here

# ══ Self-Hosted Voice Servers (optional) ══════════════════════════
SELF_HOSTED_ASR_ENDPOINT=http://localhost:9000/asr
SELF_HOSTED_TTS_ENDPOINT=http://localhost:9001/tts

# ══ Microsoft Copilot Studio (enterprise, optional) ════════════════
# Docs: https://learn.microsoft.com/microsoft-copilot-studio/
COPILOT_STUDIO_BOT_URL=https://your-bot.azurewebsites.net/api/messages
COPILOT_STUDIO_TENANT_ID=your_azure_tenant_id

# ══ Feature Flags ══════════════════════════════════════════════════
VOICE_ENABLED=true
VOICE_ANALYTICS=true
VOICE_DEBUG=false               # Set true for verbose logs in development
VOICE_RATE_LIMIT_RPM=30         # Max voice API requests per user per minute

# ══ Privacy / Compliance ═══════════════════════════════════════════
VOICE_GDPR_MODE=true            # Enforce GDPR-compliant handling
VOICE_REQUIRE_CONSENT=true      # Show consent banner before mic access
VOICE_LOG_TRANSCRIPTS=false     # NEVER set true in production
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 7 — TESTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write tests for EVERY voice component and service. No exceptions.
Use the project's existing test framework (Jest, Vitest, Pytest, etc.).

──────────────────────────────────────────────────────────────
7.1 — UNIT TESTS
──────────────────────────────────────────────────────────────

VoiceCore:
  - Mock navigator.mediaDevices.getUserMedia (success + each error type)
  - Test: PERMISSION_DENIED → VoiceErrorCode.PERMISSION_DENIED emitted
  - Test: no device → VoiceErrorCode.NO_MICROPHONE emitted
  - Test: VAD silence detection fires after silenceTimeoutMs
  - Test: audioLevel emits values in [0.0, 1.0] range

ASRService:
  - Mock primary API → success → assert transcript returned
  - Mock primary API → failure → assert secondary activates
  - Mock all APIs → failure → assert ALL_PROVIDERS_FAILED error
  - Test: low confidence result → assert LOW_CONFIDENCE error
  - Test: rate limit exceeded → assert RATE_LIMITED error

TTSService:
  - Mock audio API → test cache miss → API called
  - Mock audio API → test cache hit → API NOT called
  - Test: barge-in → verify TTS paused when audioLevel threshold crossed
  - Test: fallback chain activates on primary failure

CommandEngine:
  - Test 20+ phrase variations for each global command
  - Test: "go home" matches → navigate('/') called
  - Test: "go to settings" → navigate('/settings') called
  - Test: low-confidence phrase → confirmation requested
  - Test: destructive command → confirmation flow triggered
  - Test: "confirm" after destructive → handler executed
  - Test: timeout after destructive → handler NOT executed

VoiceState:
  - Test all state transitions: idle → listening → processing → idle
  - Test: error state clears on next successful transcription
  - Test: rate limit state updates correctly

──────────────────────────────────────────────────────────────
7.2 — INTEGRATION TESTS
──────────────────────────────────────────────────────────────

Voice search flow:
  - Simulate speech input → confirm search query updated → results appear

Voice form fill flow:
  - Simulate sequential field fill → confirm form state matches spoken values
  - Confirm password field is SKIPPED in voice fill (security test)

Voice navigation:
  - "go to {page}" → confirm router.push called with correct path

TTS playback:
  - Trigger TTS → confirm audio element plays
  - Pause → confirm audio pauses
  - Barge-in → confirm TTS pauses on audio threshold

GDPR consent:
  - Voice feature attempted without consent → confirm CONSENT_NOT_GIVEN
  - Consent given → confirm mic access requested
  - Consent revoked → confirm all voice features disabled

──────────────────────────────────────────────────────────────
7.3 — ACCESSIBILITY TESTS
──────────────────────────────────────────────────────────────

  - Run axe-core on all voice components: zero violations
  - VoiceButton: Tab focusable, Space/Enter activates, Escape cancels
  - VoiceTranscript: aria-live="polite" updates announced by screen reader
  - VoiceFeedback: errors use aria-live="assertive"
  - VoiceSettings: all form controls have labels
  - Test with NVDA + Firefox and VoiceOver + Safari
  - Keyboard-only mode: all functionality accessible without voice

──────────────────────────────────────────────────────────────
7.4 — LOAD TESTS (if self-hosted ASR deployed)
──────────────────────────────────────────────────────────────

Create `voice-infrastructure/load-test/k6-voice.js`:

```javascript
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '2m', target: 20 },   // Ramp up
    { duration: '5m', target: 100 },  // Sustained load
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of ASR requests < 2s
    http_req_failed: ['rate<0.01'],     // <1% failure rate
  },
}

export default function () {
  // Load a 3-second WAV sample (pre-recorded)
  const audioData = open('./sample-3s.wav', 'b')
  const res = http.post('http://localhost:9000/asr', {
    audio: http.file(audioData, 'test.wav', 'audio/wav'),
    language: 'en',
  })
  check(res, {
    'status 200': (r) => r.status === 200,
    'has transcript': (r) => JSON.parse(r.body).transcript.length > 0,
  })
  sleep(1)
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 8 — PRIVACY & COMPLIANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Audio data of human voice is PII in GDPR, CCPA, and most global
privacy frameworks. This phase is MANDATORY, not optional.

8.1 — DATA FLOW DOCUMENTATION
Create `VOICE_PRIVACY.md` documenting:
  - Every point where audio is captured, transmitted, or processed
  - What is retained vs. discarded after each step
  - Which third-party services receive audio (Azure, HuggingFace)
  - Retention policy for transcripts (default: zero retention)
  - User rights: access, erasure, portability for voice data

8.2 — CONSENT IMPLEMENTATION
  - VoiceConsentBanner (Phase 2.1) must be shown BEFORE any mic access
  - Consent stored in localStorage with timestamp and version number
  - If privacy policy changes: increment consent version → re-prompt
  - Provide data deletion endpoint: DELETE /api/user/voice-data
  - Respect browser-level "Do Not Track" signal (disable analytics)

8.3 — BACKEND SAFEGUARDS
  - Never log audio files to application logs
  - Never write transcripts to database unless user explicitly saves them
  - Set Content-Security-Policy headers to restrict audio stream destinations
  - Delete temp audio files immediately after ASR processing
  - Add voice-related fields to your Data Processing Agreement (DPA)

8.4 — SECURITY HARDENING
  - All voice API endpoints require authentication (requireAuth middleware)
  - Rate limiting: 30 requests/minute/user (VoiceConfig.ux.rateLimitRpm)
  - CORS: restrict voice endpoints to your app's origin only
  - Input validation: reject audio files > 10MB, unexpected MIME types
  - Audit logging: log who used voice features (not what they said)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 9 — DOCUMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create `VOICE_DOCUMENTATION.md`:

9.1 — USER GUIDE
  - List every voice command for this specific app, grouped by page
  - Include exact spoken examples for each command
  - Tips for best recognition accuracy (quiet environment, clear speech)
  - Troubleshooting: "Voice isn't working" → step-by-step guide
  - How to disable voice (for users who prefer keyboard)
  - Privacy FAQ: what is captured, where it goes, how to delete

9.2 — DEVELOPER GUIDE
  - How to register a new voice command (with complete code example)
  - How to add voice input to a new component (with complete code example)
  - How to change the active ASR provider
  - How to add a new TTS voice
  - How to deploy the self-hosted ASR server
  - How to run the voice test suite
  - Troubleshooting: common errors + solutions

9.3 — COST ANALYSIS (verified pricing as of April 2026)
  IMPORTANT: Verify current pricing at Azure pricing calculator before
  publishing this section — prices change. Links:
  - Azure Speech STT: https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/
  - Azure OpenAI Whisper: https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/
  - Azure Neural TTS: included in Speech Services pricing link above
  - HuggingFace Inference API: https://huggingface.co/pricing
  - Self-hosted: infrastructure cost only (estimated per your cloud)

  Include in this section:
  - Cost per 1,000 voice sessions (estimated)
  - Break-even point for self-hosted vs. cloud STT
  - Monthly budget estimate at 3 scale tiers: 1K / 10K / 100K MAUs
  - Cost monitoring: set Azure budget alerts at 80% of monthly target

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 10 — FINAL QUALITY GATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run this full checklist before declaring completion.
Every item must pass. No exceptions.

FUNCTIONALITY — must all be ✅
  ☐ Every feature in VOICE_FEATURE_REGISTRY.md is implemented
  ☐ Every feature has a non-voice fallback (keyboard/click equivalent)
  ☐ ASR fallback chain tested: disable primary → secondary activates
  ☐ TTS fallback chain tested: disable primary → secondary activates
  ☐ Microphone permission denied → handled gracefully, keyboard fallback shown
  ☐ Network failure → exponential backoff → user-friendly message
  ☐ Rate limit hit → "Voice cooling down" UI, countdown shown
  ☐ No existing feature broken (run existing test suite after each phase)
  ☐ VOICE_FEATURE_REGISTRY.md is complete and accurate
  ☐ VOICE_DOCUMENTATION.md is complete and accurate
  ☐ VOICE_PRIVACY.md is complete and accurate

QUALITY — must score 9.5+ on each
  ☐ Latency: voice response begins within 800ms of speech end (measure it)
  ☐ Accuracy: correct intent matched 90%+ on clear speech (test 20+ phrases)
  ☐ UX: all voice states visually clear — never ambiguous or silent
  ☐ Accessibility: all voice UI passes axe-core with zero violations
  ☐ Mobile: touch + voice work seamlessly, haptics functional
  ☐ Code: zero TypeScript errors, zero ESLint warnings in voice files
  ☐ Tests: all unit + integration tests pass

SECURITY — must all be ✅
  ☐ Zero API keys in client-side code (checked with grep for key patterns)
  ☐ All voice endpoints protected by requireAuth middleware
  ☐ Rate limiting active on all voice API routes
  ☐ CORS restricted to app origin on voice endpoints
  ☐ Audio streams not logged or persisted without consent
  ☐ Password fields excluded from all voice input — verified by test
  ☐ Destructive commands require confirmation — verified by test
  ☐ VoiceConsentBanner shown before first mic access

PRIVACY — must all be ✅
  ☐ VOICE_PRIVACY.md documents complete audio data flow
  ☐ No transcripts written to persistent storage without explicit user action
  ☐ Temp audio files deleted immediately after ASR processing
  ☐ Analytics events contain zero raw transcript text
  ☐ Consent stored with version number, re-prompted on policy change
  ☐ Data deletion endpoint implemented and tested

PERFORMANCE — must all be ✅
  ☐ Voice components excluded from non-voice page load (code split)
  ☐ AudioContext created lazily (only on first voice interaction)
  ☐ TTS cache working: repeat phrases use IndexedDB, not API
  ☐ No memory leaks: MediaStreamTracks stopped on component unmount
  ☐ Waveform animation uses requestAnimationFrame, not setInterval
  ☐ Load test passed if self-hosted ASR deployed (P95 < 2s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION RULES — NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. NEVER skip Phase 0. Fully understand the project before writing
   a single line of voice code.

2. NEVER implement any feature as a stub, placeholder, or TODO.
   If you build it, build it completely.

3. NEVER use fabricated API endpoints, model names, or SDK methods.
   Verify every technology reference against official documentation.

4. NEVER put subscription keys or API secrets in client-side code.
   All authenticated calls route through your backend proxy.

5. NEVER break existing functionality.
   Run existing tests after every phase.

6. NEVER add a voice feature that doesn't genuinely improve UX.
   8 excellent features > 20 mediocre ones.

7. ALWAYS keep voice optional.
   Users who prefer keyboard/mouse have 100% equivalent functionality.

8. ALWAYS handle errors gracefully.
   Voice fails often and in many ways. Build for failure first.

9. ALWAYS match the project's code style, naming, file structure,
   and architectural patterns.

10. ALWAYS implement VoiceConsentBanner before any microphone access.
    No exceptions. Audio of human voice is PII.

11. DELIVER VOICE_FEATURE_REGISTRY.md as Phase 0's final output.
    DELIVER VOICE_DOCUMENTATION.md and VOICE_PRIVACY.md as final outputs.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEGIN NOW. START WITH PHASE 0.
DO NOT ASK FOR CLARIFICATION. DO NOT STOP UNTIL COMPLETE.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

# ═══════════════════════════════════════════════════════════
# STRATEGY OVERVIEW — WHY VOICE, WHAT IT UNLOCKS
# ═══════════════════════════════════════════════════════════

## 🎯 The 5 Reasons Voice Creates 100x Value

### 1. SPEED — Voice is 3× faster than typing
Average typing speed: 40 WPM. Average speaking speed: 130 WPM.
Every form, search, and command becomes dramatically faster.

### 2. ACCESSIBILITY — You unlock 1.3 billion people
People with motor disabilities, visual impairments, dyslexia, or
situational impairment (driving, cooking, hands full) can now use
your product. This is a market, not a nice-to-have.

### 3. RETENTION — Voice users churn 40% less
Products with voice feel alive, personal, intelligent.
Users form stronger habits around voice-first interactions.

### 4. DIFFERENTIATION — Your competitors don't have this
Most apps shipped dark mode and called it innovation.
Voice agents are the 2026 competitive moat.

### 5. AUTOMATION — Voice enables hands-free workflows
Power users can execute 10 actions in 30 seconds via voice.
This unlocks enterprise and professional use cases.

---

## 🏗️ Microsoft / Azure Technology Map (Verified, April 2026)

| Need | Technology | Verified Model/API | Best For |
|------|-----------|-------------------|----------|
| Cloud STT (streaming) | Azure Cognitive Services Speech SDK | SpeechRecognizer (en-US, etc.) | Real-time, low latency |
| Cloud STT (batch) | Azure OpenAI Whisper | whisper-1 (deploy in your resource) | High accuracy, non-streaming |
| Neural TTS | Azure Cognitive Services TTS | en-US-JennyNeural, en-US-GuyNeural | Natural voice responses |
| Conversational AI | Azure OpenAI GPT-4o | gpt-4o (deploy in your resource) | Voice assistant reasoning |
| Open-source STT | faster-whisper (self-hosted) | openai/whisper-large-v3 | Scale, privacy, zero marginal cost |
| Open-source TTS | SpeechT5 (HuggingFace) | microsoft/speecht5_tts | Open-source TTS |
| Enterprise agent | Microsoft Copilot Studio | Real-Time Voice Agent | Contact centers, Teams |
| Zero-cost fallback | Browser Web Speech API | window.SpeechRecognition | Development, offline |

---

## 📊 Architecture Diagram

```
USER BROWSER
    │
    ├─ Web Audio API (AudioContext, AnalyserNode)
    │   └─ VAD → VoiceCore → ASRService → CommandEngine
    │
    ▼ HTTPS / WebSocket
┌──────────────────────────────────┐
│        Your Backend              │
│  POST /api/voice/token           │  ← Short-lived Azure token
│  POST /api/voice/whisper         │  ← Audio → Azure OpenAI Whisper
│  POST /api/voice/chat            │  ← Text → Azure OpenAI GPT-4o (SSE)
│  POST /api/voice/hf-whisper      │  ← Audio → HuggingFace (fallback)
│  DELETE /api/user/voice-data     │  ← GDPR data deletion
└──────────────────────────────────┘
    │              │              │
    ▼              ▼              ▼
Azure Speech    Azure OpenAI    HuggingFace
SDK (primary)   Whisper+GPT-4o  Inference API
                (secondary)     (tertiary)
                                   │
                              ┌────┴────────┐
                              │  Self-Hosted │  ← Optional
                              │  faster-     │     for scale
                              │  whisper     │     or privacy
                              └─────────────┘
    │
    ▼ Audio response via TTS
USER HEARS RESPONSE IN <800ms
```

---

## 📋 VOICE_FEATURE_REGISTRY.md Template

Copy this template as the starting structure for the generated registry:

```markdown
# VOICE FEATURE REGISTRY
Generated: [date] | Project: [name] | Version: 2.0

## Summary
- Total features planned: N
- HIGH priority: N
- MEDIUM priority: N
- LOW priority: N

## Features

### VF-001: [Feature Name]
- **Description:** One sentence
- **Priority:** HIGH / MEDIUM / LOW
- **Technical Approach:** 2-3 sentences on implementation
- **Files Modified:** list each file path
- **Files Created:** list each file path
- **Complexity:** 1–5
- **Dependencies:** VF-00X, VF-00Y (or none)
- **Technology:** Azure Speech SDK / Azure OpenAI / HuggingFace / Browser API
- **Privacy Classification:** AUDIO_LOCAL / AUDIO_STREAMED / AUDIO_STORED
- **Status:** [ ] Planned  [ ] In Progress  [x] Complete

[repeat for each feature]
```

---

*VOICE_MEGA_PROMPT v2.0 | April 2026*  
*Fixes: Corrected all model names, API references, Docker images, and vLLM usage.*  
*Added: Privacy/GDPR phase, error taxonomy, rate limiting, barge-in handling, backend proxy pattern, k6 load test, complete registry template.*
