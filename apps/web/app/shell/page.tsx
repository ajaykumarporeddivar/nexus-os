'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Nav, { type PageId } from '@/components/Nav'
import OverviewPage from '@/components/pages/OverviewPage'

const PageLoader = () => <div className="flex-1 flex items-center justify-center text-ink3 text-sm animate-pulse">Loading…</div>

const ReasoningEnginePage  = dynamic(() => import('@/components/pages/ReasoningEnginePage'),  { loading: PageLoader })
const LiveRuntimePage       = dynamic(() => import('@/components/pages/LiveRuntimePage'),       { loading: PageLoader })
const ForgeEnginePage       = dynamic(() => import('@/components/pages/ForgeEnginePage'),       { loading: PageLoader })
const DashboardPage         = dynamic(() => import('@/components/pages/DashboardPage'),         { loading: PageLoader })
const PromptVaultPage       = dynamic(() => import('@/components/pages/PromptVaultPage'),       { loading: PageLoader })
const AgentEditorPage       = dynamic(() => import('@/components/pages/AgentEditorPage'),       { loading: PageLoader })
const AuditPage             = dynamic(() => import('@/components/pages/AuditPage'),             { loading: PageLoader })
const TrendingPage          = dynamic(() => import('@/components/pages/TrendingPage'),          { loading: PageLoader })
const WorkspacesPage        = dynamic(() => import('@/components/pages/WorkspacesPage'),        { loading: PageLoader })
const JourneyPage           = dynamic(() => import('@/components/pages/JourneyPage'),           { loading: PageLoader })
const ClientDeliveryPage    = dynamic(() => import('@/components/pages/ClientDeliveryPage'),    { loading: PageLoader })
const PricingPage           = dynamic(() => import('@/components/pages/PricingPage'),           { loading: PageLoader })
const DeployPage            = dynamic(() => import('@/components/pages/DeployPage'),            { loading: PageLoader })
const BuildEnginePage       = dynamic(() => import('@/components/pages/BuildEnginePage'),       { loading: PageLoader })
const PipelinePage          = dynamic(() => import('@/components/pages/PipelinePage'),          { loading: PageLoader })
const EvolvePage            = dynamic(() => import('@/components/pages/EvolvePage'),            { loading: PageLoader })
const HiggsAIPage           = dynamic(() => import('@/components/pages/HiggsAIPage'),           { loading: PageLoader })
const KeysPage              = dynamic(() => import('@/components/pages/KeysPage'),              { loading: PageLoader })
import { WorkspaceProvider } from '@/lib/workspaceContext'
import { AutoPilotProvider } from '@/lib/autoPilotContext'
import AutoPilotBar from '@/components/AutoPilotBar'
import { useVoiceNavigation } from '@/lib/voice'

const VALID_PAGES = [
  'journey', 'client-delivery', 'overview', 'reasoning', 'runtime',
  'forge', 'dashboard', 'vault', 'agent-editor', 'audit',
  'trending', 'workspaces', 'pricing', 'deploy', 'build', 'pipeline', 'evolve',
  'higgs-ai', 'keys',
] as const

function ShellInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const rawPage      = searchParams.get('page') ?? 'overview'
  const currentPage: PageId = (VALID_PAGES as readonly string[]).includes(rawPage)
    ? rawPage as PageId : 'overview'

  const [collapsed,     setCollapsed]     = useState(false)
  const [theme,         setTheme]         = useState<'light' | 'dark' | 'system'>('light')
  const [apiConnected,  setApiConnected]  = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [onboarded,     setOnboarded]     = useState(true)
  const lastKeyRef = useRef<string | null>(null)
  const lastKeyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voiceNav = useVoiceNavigation()

  // Restore sidebar + theme from localStorage/cookie on mount
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('nexus-sidebar-collapsed')
    if (savedCollapsed === 'true') setCollapsed(true)

    const savedTheme = document.cookie.match(/nexus-theme=([^;]+)/)?.[1] as typeof theme | undefined
    if (savedTheme) applyTheme(savedTheme)

    if (!localStorage.getItem('nexus_onboarded')) setOnboarded(false)

    // Check server-side API key status — sets the badge correctly on first load
    fetch('/api/health')
      .then(r => r.json())
      .then((d: { checks?: Record<string, { ok: boolean }> }) => {
        const anthropicOk = d.checks?.anthropic?.ok ?? false
        if (anthropicOk) setApiConnected(true)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyTheme = useCallback((t: 'light' | 'dark' | 'system') => {
    setTheme(t)
    document.cookie = `nexus-theme=${t};path=/;max-age=31536000`
    const root = document.documentElement
    if (t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [])

  const onThemeToggle = useCallback(() => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    applyTheme(next)
  }, [theme, applyTheme])

  // Keyboard shortcuts: `?` for help, `g f` / `g d` etc. for navigation
  useEffect(() => {
    const KB_NAV: Record<string, PageId> = {
      f: 'forge', d: 'dashboard', t: 'trending', r: 'reasoning',
      a: 'audit', v: 'vault', p: 'pricing', w: 'workspaces',
    }
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '?') { setShowShortcuts(s => !s); return }
      if (e.key === 'Escape') { setShowShortcuts(false); return }
      if (lastKeyRef.current === 'g') {
        const dest = KB_NAV[e.key]
        if (dest) router.push(`?page=${dest}`, { scroll: false })
        lastKeyRef.current = null
        if (lastKeyTimer.current) clearTimeout(lastKeyTimer.current)
      } else if (e.key === 'g') {
        lastKeyRef.current = 'g'
        if (lastKeyTimer.current) clearTimeout(lastKeyTimer.current)
        lastKeyTimer.current = setTimeout(() => { lastKeyRef.current = null }, 1500)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [router])

  const toggleCollapse = useCallback(() => {
    setCollapsed(c => {
      localStorage.setItem('nexus-sidebar-collapsed', String(!c))
      return !c
    })
  }, [])

  const onNavigate = useCallback((page: PageId) => {
    router.push(`?page=${page}`, { scroll: false })
  }, [router])

  const onApiKeyChange = useCallback((connected: boolean) => {
    setApiConnected(connected)
  }, [])

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem('nexus_onboarded', '1')
    setOnboarded(true)
  }, [])

  return (
    <WorkspaceProvider>
      <AutoPilotProvider>
        {/* Outer: full-height flex row */}
        <div className="flex h-screen bg-paper overflow-hidden">

          {/* Sidebar */}
          <Nav
            currentPage={currentPage}
            onNavigate={onNavigate}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            apiConnected={apiConnected}
            theme={theme}
            onThemeToggle={onThemeToggle}
          />

          {/* Main content scrollable area */}
          <main className="flex-1 overflow-y-auto min-w-0 flex flex-col">
            {/* Onboarding banner */}
            {!onboarded && (
              <div className="border-b border-acid/30 bg-acid/5 px-6 py-3 flex items-center gap-4 flex-wrap">
                <span className="text-xs font-bold text-acid/80 font-mono uppercase tracking-widest">Get started</span>
                {([
                  { page: 'trending' as PageId, label: '1. Browse ideas' },
                  { page: 'forge' as PageId, label: '2. Build in FORGE' },
                  { page: 'deploy' as PageId, label: '3. Deploy' },
                  { page: 'dashboard' as PageId, label: '4. Track results' },
                ] as { page: PageId; label: string }[]).map(({ page, label }) => (
                  <button
                    key={page}
                    onClick={() => onNavigate(page)}
                    className={`text-xs px-3 py-1 rounded-full border transition-all ${currentPage === page ? 'bg-acid text-paper border-acid font-bold' : 'border-acid/30 text-ink3 hover:border-acid hover:text-acid'}`}
                  >
                    {label}
                  </button>
                ))}
                <button onClick={dismissOnboarding} className="ml-auto text-ink3 hover:text-ink text-xs">Got it ✕</button>
              </div>
            )}

            {/* Page content — key triggers re-animation on nav */}
            <div key={currentPage} className="flex-1 animate-fadein">
              {currentPage === 'journey'         && <JourneyPage onNavigate={onNavigate} />}
              {currentPage === 'client-delivery' && <ClientDeliveryPage />}
              {currentPage === 'overview'        && <OverviewPage onNavigate={onNavigate} />}
              {currentPage === 'reasoning'       && <ReasoningEnginePage />}
              {currentPage === 'runtime'         && <LiveRuntimePage onApiKeyChange={onApiKeyChange} onNavigateForge={() => onNavigate('forge')} />}
              {currentPage === 'forge'           && <ForgeEnginePage />}
              {currentPage === 'dashboard'       && <DashboardPage onNavigate={onNavigate} />}
              {currentPage === 'vault'           && <PromptVaultPage onNavigate={onNavigate} />}
              {currentPage === 'agent-editor'    && <AgentEditorPage />}
              {currentPage === 'audit'           && <AuditPage />}
              {currentPage === 'trending'        && <TrendingPage />}
              {currentPage === 'workspaces'      && <WorkspacesPage />}
              {currentPage === 'pricing'         && <PricingPage onNavigate={onNavigate} />}
              {currentPage === 'deploy'          && <DeployPage />}
              {currentPage === 'build'           && <BuildEnginePage />}
              {currentPage === 'pipeline'        && <PipelinePage />}
              {currentPage === 'evolve'          && <EvolvePage />}
              {currentPage === 'higgs-ai'        && <HiggsAIPage />}
              {currentPage === 'keys'            && <KeysPage />}
            </div>
          </main>

          {/* Keyboard shortcuts modal */}
          {showShortcuts && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
              <div className="bg-paper border border-border rounded-2xl p-6 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-sm">Keyboard shortcuts</h3>
                  <button onClick={() => setShowShortcuts(false)} className="text-ink3 hover:text-ink text-sm">✕</button>
                </div>
                <div className="space-y-2">
                  {[
                    { key: '?',     desc: 'Toggle this panel' },
                    { key: 'g f',   desc: 'Go to FORGE Engine' },
                    { key: 'g d',   desc: 'Go to Dashboard' },
                    { key: 'g t',   desc: 'Go to Trending' },
                    { key: 'g r',   desc: 'Go to Reasoning Engine' },
                    { key: 'g a',   desc: 'Go to Audit Log' },
                    { key: 'g v',   desc: 'Go to Prompt Vault' },
                    { key: 'g p',   desc: 'Go to Pricing' },
                    { key: 'g w',   desc: 'Go to Workspaces' },
                    { key: 'Esc',   desc: 'Close modal / shortcuts' },
                  ].map(({ key, desc }) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-ink3">{desc}</span>
                      <kbd className="px-2 py-0.5 rounded border border-border bg-paper2 font-mono text-xs text-ink2">{key}</kbd>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-ink3 mt-4 text-center font-mono">press ? to dismiss</p>
              </div>
            </div>
          )}

          {/* AutoPilot guide panel (fixed right) */}
          <AutoPilotBar />

          {/* Voice navigation button */}
          {voiceNav.isSupported && (
            <button
              onClick={voiceNav.toggle}
              title={voiceNav.isListening ? 'Stop voice navigation' : 'Voice navigation (say "Go to Forge", "Open Dashboard"…)'}
              className={`fixed bottom-16 right-5 z-40 w-9 h-9 rounded-full border shadow-sm transition-all flex items-center justify-center ${
                voiceNav.isListening
                  ? 'bg-red-500 border-red-400 text-white shadow-[0_0_14px_3px_rgba(239,68,68,0.35)] animate-pulse'
                  : 'bg-paper2 border-border text-ink3 hover:text-ink hover:border-acid/50'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>
          )}

          {/* Floating keyboard hint */}
          <button
            onClick={() => setShowShortcuts(true)}
            className="fixed bottom-5 right-5 z-40 w-8 h-8 rounded-full border border-border bg-paper2 text-ink3 hover:text-ink hover:border-acid/50 text-xs font-bold font-mono shadow-sm transition-all"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
        </div>
      </AutoPilotProvider>
    </WorkspaceProvider>
  )
}

export default function ShellPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-paper" />}>
      <ShellInner />
    </Suspense>
  )
}
