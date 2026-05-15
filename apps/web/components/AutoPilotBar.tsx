'use client'

import { useEffect, useRef, useState } from 'react'
import { useAutoPilot, AUTO_STEPS } from '@/lib/autoPilotContext'

// ── Accent colour maps ────────────────────────────────────────────────────────

const ACCENT: Record<string, {
  border: string; bg: string; text: string; badge: string; badgeBg: string;
  bar: string; ring: string; dot: string; glow: string;
}> = {
  purple:  { border:'border-purple-500/40',  bg:'bg-purple-500/6',   text:'text-purple-300',  badge:'text-purple-200',  badgeBg:'bg-purple-500/20 border-purple-400/30',  bar:'bg-purple-500',  ring:'ring-purple-500/30',  dot:'bg-purple-400',  glow:'shadow-purple-500/20' },
  violet:  { border:'border-violet-500/40',  bg:'bg-violet-500/6',   text:'text-violet-300',  badge:'text-violet-200',  badgeBg:'bg-violet-500/20 border-violet-400/30',  bar:'bg-violet-500',  ring:'ring-violet-500/30',  dot:'bg-violet-400',  glow:'shadow-violet-500/20' },
  blue:    { border:'border-blue-500/40',    bg:'bg-blue-500/6',     text:'text-blue-300',    badge:'text-blue-200',    badgeBg:'bg-blue-500/20 border-blue-400/30',      bar:'bg-blue-500',    ring:'ring-blue-500/30',    dot:'bg-blue-400',    glow:'shadow-blue-500/20'   },
  amber:   { border:'border-amber-500/40',   bg:'bg-amber-500/6',    text:'text-amber-300',   badge:'text-amber-200',   badgeBg:'bg-amber-500/20 border-amber-400/30',    bar:'bg-amber-500',   ring:'ring-amber-500/30',   dot:'bg-amber-400',   glow:'shadow-amber-500/20'  },
  emerald: { border:'border-emerald-500/40', bg:'bg-emerald-500/6',  text:'text-emerald-300', badge:'text-emerald-200', badgeBg:'bg-emerald-500/20 border-emerald-400/30',bar:'bg-emerald-500', ring:'ring-emerald-500/30', dot:'bg-emerald-400', glow:'shadow-emerald-500/20'},
  orange:  { border:'border-orange-500/40',  bg:'bg-orange-500/6',   text:'text-orange-300',  badge:'text-orange-200',  badgeBg:'bg-orange-500/20 border-orange-400/30',  bar:'bg-orange-500',  ring:'ring-orange-500/30',  dot:'bg-orange-400',  glow:'shadow-orange-500/20' },
  cyan:    { border:'border-cyan-500/40',    bg:'bg-cyan-500/6',     text:'text-cyan-300',    badge:'text-cyan-200',    badgeBg:'bg-cyan-500/20 border-cyan-400/30',      bar:'bg-cyan-500',    ring:'ring-cyan-500/30',    dot:'bg-cyan-400',    glow:'shadow-cyan-500/20'   },
  indigo:  { border:'border-indigo-500/40',  bg:'bg-indigo-500/6',   text:'text-indigo-300',  badge:'text-indigo-200',  badgeBg:'bg-indigo-500/20 border-indigo-400/30',  bar:'bg-indigo-500',  ring:'ring-indigo-500/30',  dot:'bg-indigo-400',  glow:'shadow-indigo-500/20' },
  rose:    { border:'border-rose-500/40',    bg:'bg-rose-500/6',     text:'text-rose-300',    badge:'text-rose-200',    badgeBg:'bg-rose-500/20 border-rose-400/30',      bar:'bg-rose-500',    ring:'ring-rose-500/30',    dot:'bg-rose-400',    glow:'shadow-rose-500/20'   },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function PhaseLabel({ phase, accent }: { phase: string; accent: ReturnType<typeof getAccent> }) {
  if (phase === 'announcing') return (
    <span className={`inline-flex items-center gap-1.5 text-[9px] font-bold font-mono px-2.5 py-1 rounded-full border ${accent.badgeBg} ${accent.badge} uppercase tracking-widest`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      Preparing
    </span>
  )
  if (phase === 'running') return (
    <span className="inline-flex items-center gap-1.5 text-[9px] font-bold font-mono px-2.5 py-1 rounded-full border bg-acid/20 border-acid/30 text-acid uppercase tracking-widest">
      <span className="w-1.5 h-1.5 rounded-full bg-acid animate-pulse" />
      AI Working
    </span>
  )
  if (phase === 'reading') return (
    <span className="inline-flex items-center gap-1.5 text-[9px] font-bold font-mono px-2.5 py-1 rounded-full border bg-blue-500/15 border-blue-400/30 text-blue-300 uppercase tracking-widest">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
      Explore
    </span>
  )
  return null
}

function getAccent(color: string) {
  return ACCENT[color] ?? ACCENT['violet']
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AutoPilotBar() {
  const { status, phase, stepIdx, output, error, countdown, stop } = useAutoPilot()
  const outputRef  = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  // Auto-scroll output during streaming
  useEffect(() => {
    if (outputRef.current && phase === 'running') {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output, phase])

  // Expand panel on each new step
  useEffect(() => {
    if (status === 'running') setCollapsed(false)
  }, [stepIdx, status])

  if (status === 'idle') return null

  const step    = AUTO_STEPS[stepIdx]
  const isDone  = status === 'done'
  const isError = status === 'error'
  const total   = AUTO_STEPS.length
  const pct     = Math.round(((stepIdx + (isDone ? 1 : 0)) / total) * 100)
  const accent  = getAccent(isDone ? 'emerald' : isError ? 'rose' : (step?.accentColor ?? 'violet'))

  // ─── DONE state ─────────────────────────────────────────────────────────────
  if (isDone) {
    return (
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-[400px] max-w-[95vw]
                      bg-[#0b0f1a]/97 backdrop-blur-2xl border-l border-emerald-500/30
                      shadow-2xl shadow-emerald-500/10">
        {/* Top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-acid to-emerald-400" />

        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
          {/* Icon */}
          <div className="w-20 h-20 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-4xl shadow-lg shadow-emerald-500/20">
            ✓
          </div>

          <div>
            <p className="text-2xl font-bold text-white mb-2">Demo Complete</p>
            <p className="text-sm text-ink3 leading-relaxed">
              Maya walked through all 10 features of NEXUS OS — from raw idea to validated,
              specced, and deployed product — in 4 to 15 minutes.
            </p>
          </div>

          {/* What Maya got */}
          <div className="w-full bg-emerald-500/8 border border-emerald-500/20 rounded-2xl p-4 text-left space-y-2">
            <p className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-widest mb-3">What Maya walked away with</p>
            {[
              ['🗂️', 'Project context set up once, used everywhere'],
              ['🔍', 'Competitive landscape + risk map (SCOUT)'],
              ['📊', 'Confidence-rated belief register (ANALYST)'],
              ['📈', 'Live market signal from Trending'],
              ['🔐', 'Tuned prompt library (Vault)'],
              ['⚙️', 'Full product spec from 3 AI agents (FORGE)'],
              ['💬', 'Validated AI behaviour (Live Runtime)'],
              ['📋', 'Performance dashboard with quality scores'],
              ['📜', 'Complete immutable audit trail'],
              ['🚀', 'Live deployed URL — spec to client-ready app'],
            ].map(([icon, text]) => (
              <div key={text as string} className="flex items-start gap-2.5">
                <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
                <span className="text-xs text-ink2">{text as string}</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-ink3">Manual equivalent: 2–3 days of planning &amp; research</p>

          <button
            onClick={stop}
            className="w-full py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold hover:bg-emerald-500/25 transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    )
  }

  // ─── ERROR state ─────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-[400px] max-w-[95vw]
                      bg-[#0b0f1a]/97 backdrop-blur-2xl border-l border-rose-500/30 shadow-2xl">
        <div className="h-1 w-full bg-rose-500" />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
          <div className="text-4xl">⚠️</div>
          <p className="text-base font-bold text-rose-300">Something went wrong</p>
          <p className="text-xs text-ink3 font-mono bg-paper2 rounded-lg px-3 py-2 w-full text-left break-all">{error}</p>
          <button onClick={stop} className="mt-2 w-full py-2.5 rounded-xl border border-rose-500/30 text-rose-300 text-sm hover:bg-rose-500/10 transition-colors">
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  // ─── RUNNING state ───────────────────────────────────────────────────────────
  return (
    <>
      {/* Subtle backdrop hint so user knows panel is overlay */}
      <div className="fixed inset-y-0 right-0 w-[400px] max-w-[95vw] z-40 pointer-events-none
                      bg-gradient-to-l from-black/30 to-transparent" />

      {/* Main panel */}
      <div className={`fixed inset-y-0 right-0 z-50 flex flex-col w-[400px] max-w-[95vw]
                       bg-[#0b0f1a]/97 backdrop-blur-2xl border-l ${accent.border}
                       shadow-2xl transition-all duration-500`}>

        {/* Top: phase-coloured progress bar */}
        <div className="h-1 w-full bg-paper3 flex-shrink-0">
          <div className={`h-1 ${accent.bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            {/* Guide label */}
            <span className="text-[9px] font-bold font-mono text-ink3 uppercase tracking-widest">Autopilot Guide</span>
            <span className="w-1 h-1 rounded-full bg-ink3/40" />
            <PhaseLabel phase={phase} accent={accent} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCollapsed(c => !c)}
              className="p-1.5 rounded-lg text-ink3 hover:text-ink hover:bg-white/5 transition-colors text-xs"
              title={collapsed ? 'Expand' : 'Minimise'}
            >
              {collapsed ? '◀' : '▶'}
            </button>
            <button
              onClick={stop}
              className="text-[9px] px-2.5 py-1 rounded-lg border border-white/10 text-ink3 hover:text-rose-400 hover:border-rose-400/30 transition-colors font-mono uppercase tracking-wider"
            >
              ■ Stop
            </button>
          </div>
        </div>

        {/* ── Collapsed strip ─────────────────────────────────────────────────── */}
        {collapsed && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
            <span className="text-3xl">{step?.icon}</span>
            <p className="text-xs font-semibold text-center text-ink2">{step?.laymanTitle}</p>
            <p className="text-[9px] text-ink3 font-mono">{stepIdx + 1} / {total}</p>
          </div>
        )}

        {/* ── Expanded body ───────────────────────────────────────────────────── */}
        {!collapsed && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

            {/* Step counter strip */}
            <div className="px-4 pt-4 pb-3 flex-shrink-0">
              <div className="flex items-center gap-1.5 mb-3">
                {AUTO_STEPS.map((s, i) => (
                  <div
                    key={s.id}
                    className={`flex-1 h-1 rounded-full transition-all duration-500 ${
                      i < stepIdx || isDone  ? 'bg-acid/70' :
                      i === stepIdx          ? `${accent.dot} opacity-100` :
                                               'bg-white/8'
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold font-mono uppercase tracking-widest ${accent.text}`}>
                  Step {stepIdx + 1} of {total}
                </span>
                <span className="text-[10px] text-ink3 font-mono">{pct}% complete</span>
              </div>
            </div>

            {/* ── ANNOUNCE phase ──────────────────────────────────────────────── */}
            {phase === 'announcing' && step && (
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4 min-h-0">

                {/* Feature hero card */}
                <div className={`rounded-2xl border ${accent.border} ${accent.bg} p-5 space-y-4`}>
                  {/* Icon + step number */}
                  <div className="flex items-start justify-between">
                    <div className={`w-14 h-14 rounded-2xl bg-white/5 border ${accent.border} flex items-center justify-center text-3xl shadow-lg ${accent.glow}`}>
                      {step.icon}
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-mono text-ink3 uppercase tracking-widest">Feature</p>
                      <p className={`text-3xl font-black ${accent.text} opacity-30 leading-none`}>
                        {String(stepIdx + 1).padStart(2, '0')}
                      </p>
                    </div>
                  </div>

                  {/* Feature name */}
                  <div>
                    <p className={`text-[9px] font-bold font-mono uppercase tracking-widest mb-1 ${accent.text}`}>
                      You are now looking at
                    </p>
                    <p className="text-lg font-bold text-white leading-tight">{step.laymanTitle}</p>
                  </div>

                  {/* Plain English description */}
                  <p className="text-sm text-ink2 leading-relaxed">{step.laymanDesc}</p>
                </div>

                {/* What Maya does */}
                <div className="rounded-xl border border-white/6 bg-white/2 p-4 space-y-1.5">
                  <p className="text-[9px] font-bold font-mono text-ink3 uppercase tracking-widest">What Maya does here</p>
                  <p className="text-xs text-ink2 leading-relaxed">{step.maya}</p>
                </div>

                {/* What she gets */}
                <div className="rounded-xl border border-white/6 bg-white/2 p-4 space-y-1.5">
                  <p className="text-[9px] font-bold font-mono text-ink3 uppercase tracking-widest">What she walks away with</p>
                  <p className="text-xs text-ink2 leading-relaxed">{step.gets}</p>
                </div>

                {/* Countdown */}
                <div className={`rounded-xl border ${accent.border} ${accent.bg} p-3`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className={`text-[10px] font-mono ${accent.text}`}>AI starts working in</p>
                    <p className={`text-lg font-black font-mono tabular-nums ${accent.text}`}>{countdown}s</p>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-1 ${accent.bar} rounded-full transition-all duration-1000`}
                      style={{ width: `${((7 - countdown) / 7) * 100}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-ink3 mt-2">Read this page — the AI will demonstrate it shortly →</p>
                </div>
              </div>
            )}

            {/* ── RUNNING phase ───────────────────────────────────────────────── */}
            {phase === 'running' && step && (
              <div className="flex-1 flex flex-col min-h-0">

                {/* Feature header */}
                <div className="px-4 pb-3 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{step.icon}</span>
                    <div>
                      <p className="text-[9px] font-mono text-ink3 uppercase tracking-widest">Active feature</p>
                      <p className="text-sm font-bold text-white">{step.laymanTitle}</p>
                    </div>
                  </div>
                </div>

                {/* AI working banner */}
                <div className="mx-4 mb-3 flex-shrink-0 rounded-xl bg-acid/8 border border-acid/25 px-3 py-2.5 flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-acid animate-pulse flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-acid">Llama 3.3 70B is working</p>
                    <p className="text-[9px] text-ink3 truncate">{step.what}</p>
                  </div>
                </div>

                {/* Streaming output */}
                <div className="flex-1 min-h-0 mx-4 mb-4 rounded-xl border border-white/6 bg-[#080c14] overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 flex-shrink-0">
                    <div className="flex gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
                    </div>
                    <span className="text-[9px] font-mono text-ink3">AI Output — Live Stream</span>
                  </div>
                  <div
                    ref={outputRef}
                    className="flex-1 p-3 font-mono text-[10.5px] leading-relaxed text-ink2 whitespace-pre-wrap overflow-y-auto"
                  >
                    {output
                      ? <>
                          {output}
                          <span className="inline-block w-1.5 h-3.5 bg-acid/80 ml-0.5 animate-pulse align-text-bottom" />
                        </>
                      : <span className="text-ink3 animate-pulse">Calling Llama 3.3 70B via Groq…</span>
                    }
                  </div>
                </div>
              </div>
            )}

            {/* ── READING phase ───────────────────────────────────────────────── */}
            {phase === 'reading' && step && (
              <div className="flex-1 flex flex-col min-h-0 px-4 pb-4 gap-4 overflow-y-auto">

                {/* Step complete card */}
                <div className="rounded-2xl border border-blue-500/30 bg-blue-500/6 p-4 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-300 text-base">
                      ✓
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Step {stepIdx + 1} complete!</p>
                      <p className="text-[10px] text-blue-300">
                        {stepIdx + 1 < total ? `Up next: ${AUTO_STEPS[stepIdx + 1]?.laymanTitle}` : 'Final step — wrapping up'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Explore prompt */}
                <div className="rounded-xl border border-white/6 bg-white/2 p-4 space-y-3">
                  <p className="text-[9px] font-bold font-mono text-ink3 uppercase tracking-widest">
                    Explore this page now
                  </p>
                  <p className="text-xs text-ink2 leading-relaxed">
                    Take a moment to look at the {step.laymanTitle} page. Here are three things worth noticing:
                  </p>
                  <div className="space-y-2.5">
                    {step.noticeItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="w-4 h-4 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-[11px] text-ink2 leading-relaxed">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Countdown */}
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 mt-auto">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-blue-300 font-mono">Next step in</p>
                    <p className="text-xl font-black font-mono tabular-nums text-blue-300">{countdown}s</p>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-1 bg-blue-500 rounded-full transition-all duration-1000"
                      style={{ width: `${((step.readSecs - countdown) / step.readSecs) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Footer: step dots (always visible when expanded) ─────────────── */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-white/5 flex-shrink-0">
            <div className="flex items-center gap-1 justify-center">
              {AUTO_STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className="group relative"
                  title={s.laymanTitle}
                >
                  <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    i < stepIdx  ? 'bg-acid/60 scale-100' :
                    i === stepIdx ? `${accent.dot} scale-125 ring-2 ${accent.ring}` :
                                    'bg-white/10 scale-90'
                  }`} />
                </div>
              ))}
            </div>
            <p className="text-center text-[9px] text-ink3 font-mono mt-1.5">
              {AUTO_STEPS[stepIdx]?.laymanTitle ?? ''}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
