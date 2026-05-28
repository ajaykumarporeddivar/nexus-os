/**
 * imageRender.ts
 *
 * Converts a structured NEXUS OS JSON prompt into a flat Imagen-compatible
 * text prompt, then calls Google Gemini Imagen 3 with key rotation.
 *
 * Key pool: GEMINI_API_KEY + GEMINI_API_KEY1…GEMINI_API_KEY14 (all active in .env)
 * Model: imagen-3.0-generate-002
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{gemini-image-model}:generateContent
 */

const GEMINI_IMAGE_MODELS = [
  process.env.GEMINI_IMAGE_MODEL,
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image',
].filter(Boolean) as string[]

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// ── Key pool (mirrors quotaTracker pattern) ───────────────────────────────────

function getGeminiKeys(): string[] {
  const keys: string[] = []
  const base = process.env.GEMINI_API_KEY
  if (base) keys.push(base)
  for (let i = 1; i <= 50; i++) {
    const k = process.env[`GEMINI_API_KEY${i}`]
    if (k) keys.push(k)
  }
  return keys.filter(Boolean)
}

// Simple round-robin index (module-level, resets each cold start)
let _keyIdx = 0
function nextKey(): string | null {
  const keys = getGeminiKeys()
  if (keys.length === 0) return null
  const key = keys[_keyIdx % keys.length]
  _keyIdx++
  return key
}

// ── JSON → flat prompt ────────────────────────────────────────────────────────

interface PromptJson {
  title?:            string
  category?:         string
  mood?:             string[]
  canvas?:           { aspect_ratio?: string }
  background?:       { type?: string; gradient_start?: { color?: string }; gradient_end?: { color?: string }; accent_bloom?: { color?: string; description?: string } }
  main_visual?:      {
    subject?:    string
    type?:       string
    framing?:    string
    lighting?:   { key_light?: { color?: string; description?: string }; rim_light?: { color?: string; description?: string } } | string
    wardrobe?:   { top?: { item?: string; chest_glyph?: { character?: { shape?: string; color?: string }; text_below_glyph?: { text?: string } } }; headwear?: { item?: string } }
    props?:      Array<{ item?: string; screen_content?: { description?: string }; screen_glow?: { color?: string } }>
    camera?:     { depth_of_field?: string; grain?: string; feel?: string }
  }
  palette?:          Record<string, string | { color?: string; opacity?: number }>
  typography_stack?: Record<string, unknown>
  finish?:           { film_grain?: { opacity?: number }; color_grade?: string; crt_scanlines?: { opacity?: number } }
  generation_notes?: string
  bottom_content?:   { headline?: { text?: string }; body_copy?: { lines?: string[] } }
  graphic_overlays?: Array<{ content?: { text?: string; image_clipping?: string } }>
}

export function jsonPromptToText(jsonString: string): string {
  let p: PromptJson
  try {
    p = JSON.parse(jsonString) as PromptJson
  } catch {
    // If not valid JSON, return as-is (user may have pasted raw text)
    return jsonString.slice(0, 1200)
  }

  const parts: string[] = []

  // ── Style anchor — always first ──
  parts.push(
    'Editorial brand photography, Awwwards quality, 4K vertical poster, Y2K skate-surf streetwear aesthetic, ' +
    'industrial hacker terminal meets fashion editorial, film grain texture, analog warmth'
  )

  // ── Subject / main visual ──
  const mv = p.main_visual
  if (mv?.subject)  parts.push(`Subject: ${mv.subject}`)
  if (mv?.type)     parts.push(`Shot type: ${mv.type}, ${mv.framing ?? ''}`)

  // Wardrobe
  if (mv?.wardrobe?.top?.item) {
    let w = `Wearing ${mv.wardrobe.top.item}`
    const glyph = mv.wardrobe.top.chest_glyph
    if (glyph?.character?.shape) {
      w += `. On chest: hand-drawn ${glyph.character.color ?? '#C8FF00'} ${glyph.character.shape} circuit smiley glyph with pixel eyes and antenna, rough marker-on-fabric screenprint style`
    }
    if (glyph?.text_below_glyph?.text) w += `, text "${glyph.text_below_glyph.text}" below`
    parts.push(w)
  }
  if (mv?.wardrobe?.headwear?.item) parts.push(`Headwear: ${mv.wardrobe.headwear.item}`)

  // Props
  if (mv?.props?.length) {
    for (const prop of mv.props) {
      if (prop.item) {
        let propStr = `Prop: ${prop.item}`
        if (prop.screen_content?.description) propStr += ` showing ${prop.screen_content.description}`
        if (prop.screen_glow?.color) propStr += `, casting ${prop.screen_glow.color} glow`
        parts.push(propStr)
      }
    }
  }

  // ── Lighting ──
  if (mv?.lighting) {
    if (typeof mv.lighting === 'string') {
      parts.push(`Lighting: ${mv.lighting}`)
    } else {
      const l = mv.lighting
      if (l.rim_light?.color)  parts.push(`Rim light: ${l.rim_light.color} from behind, ${l.rim_light.description ?? ''}`)
      if (l.key_light?.color)  parts.push(`Key light: ${l.key_light.color}, ${l.key_light.description ?? ''}`)
    }
  }

  // ── Camera ──
  if (mv?.camera) {
    const c = mv.camera
    const camParts = [c.depth_of_field, c.grain, c.feel].filter(Boolean)
    if (camParts.length) parts.push(`Camera: ${camParts.join(', ')}`)
  }

  // ── Background ──
  const bg = p.background
  if (bg) {
    let bgStr = 'Background:'
    if (bg.gradient_start?.color && bg.gradient_end?.color) {
      bgStr += ` gradient from ${bg.gradient_start.color} to ${bg.gradient_end.color}`
    }
    if (bg.accent_bloom?.description) bgStr += `, ${bg.accent_bloom.description}`
    parts.push(bgStr)
  }

  // ── Mood ──
  if (p.mood?.length) parts.push(`Mood: ${p.mood.slice(0, 4).join(', ')}`)

  // ── Palette ──
  if (p.palette) {
    const swatches = Object.entries(p.palette)
      .slice(0, 5)
      .map(([role, val]) => {
        const hex = typeof val === 'string' ? val : val?.color ?? ''
        return hex ? `${role}: ${hex}` : null
      })
      .filter(Boolean)
    if (swatches.length) parts.push(`Color palette: ${swatches.join(', ')}`)
  }

  // ── Finish ──
  const fin = p.finish
  if (fin) {
    const finParts: string[] = []
    if (fin.film_grain?.opacity)    finParts.push(`film grain ${Math.round((fin.film_grain.opacity) * 100)}%`)
    if (fin.crt_scanlines?.opacity) finParts.push(`subtle CRT scanlines`)
    if (fin.color_grade)            finParts.push(fin.color_grade)
    if (finParts.length) parts.push(`Post-processing: ${finParts.join(', ')}`)
  }

  // ── Overlays summary ──
  if (p.graphic_overlays?.length) {
    const overlayTexts = p.graphic_overlays
      .map(o => o.content?.text ?? o.content?.image_clipping ?? '')
      .filter(Boolean)
      .slice(0, 3)
    if (overlayTexts.length) {
      parts.push(`Sticker overlays: ${overlayTexts.join(' · ')} — acid-green star-shaped vinyl stickers with white borders and drop shadows, scattered at playful angles`)
    }
  }

  // ── Title / generation notes ──
  if (p.title)            parts.push(`Visual concept: ${p.title}`)
  if (p.generation_notes) parts.push(p.generation_notes.slice(0, 200))

  // ── Hard style suffix — always appended ──
  parts.push(
    'Style: acid lime-green #C8FF00 on deep black #0D0D0D, ' +
    'Bungee Slab wordmark typography, monospaced grid UI elements, ' +
    'sticker-collage DIY feel, vintage screen-print halftone texture, ' +
    'vignette edges, barrel lens distortion, Super-8 analog color grade, ' +
    'hyper-detailed, sharp focus, professional studio quality'
  )

  return parts.filter(Boolean).join('. ')
}

// ── Imagen 3 generation ───────────────────────────────────────────────────────

export interface ImageGenResult {
  base64:   string
  mimeType: string
  model:    string
  prompt:   string   // the flat text prompt used
}

export async function generateImage(
  promptJson: string,
  aspectRatio: '9:16' | '1:1' | '16:9' | '4:3' = '9:16'
): Promise<ImageGenResult> {
  const flatPrompt = jsonPromptToText(promptJson)

  const body = {
    contents: [{
      parts: [{ text: `${flatPrompt}. Render exactly one finished ${aspectRatio} image.` }],
    }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  }

  const keysToTry = Math.min(getGeminiKeys().length, 3)
  if (keysToTry === 0) throw new Error('No Gemini API keys configured')

  const errors: string[] = []
  for (const model of GEMINI_IMAGE_MODELS) {
    for (let attempt = 0; attempt < keysToTry; attempt++) {
      const key = nextKey()
      if (!key) break
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body:    JSON.stringify(body),
      })
      if (res.ok) return parseGeminiImageResponse(await res.json(), flatPrompt, model)
      const errText = await res.text().catch(() => '')
      errors.push(`${model} ${res.status}: ${errText.slice(0, 180)}`)
      if (![400, 403, 404, 429].includes(res.status)) break
    }
  }

  throw new Error(`Gemini image generation failed. ${errors.slice(0, 3).join(' | ')}`)
}

function parseGeminiImageResponse(json: unknown, flatPrompt: string, model: string): ImageGenResult {
  const j = json as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string }
          inline_data?: { data?: string; mime_type?: string; mimeType?: string }
        }>
      }
    }>
  }
  for (const candidate of j.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inline: { data?: string; mimeType?: string; mime_type?: string } | undefined = part.inlineData ?? part.inline_data
      if (inline?.data) {
        return {
          base64:   inline.data,
          mimeType: inline.mimeType ?? inline.mime_type ?? 'image/png',
          model,
          prompt:   flatPrompt,
        }
      }
    }
  }
  throw new Error('Gemini returned no image data. Response: ' + JSON.stringify(j).slice(0, 240))
}
