'use client'

/**
 * ShellPageWrapper — wraps standalone /shell/* route pages with the same
 * Nav sidebar + layout used by the main /shell SPA.
 *
 * Usage:
 *   <ShellPageWrapper currentPage="leads">
 *     <LeadsContent />
 *   </ShellPageWrapper>
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Nav, { type PageId } from '@/components/Nav'
import { WorkspaceProvider } from '@/lib/workspaceContext'
import { AutoPilotProvider } from '@/lib/autoPilotContext'

interface Props {
  currentPage: PageId
  children: ReactNode
}

export default function ShellPageWrapper({ currentPage, children }: Props) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [theme,     setTheme]     = useState<'light' | 'dark' | 'system'>('light')
  const [apiConnected, setApiConnected] = useState(false)

  // Restore sidebar collapsed state + theme from storage/cookie
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('nexus-sidebar-collapsed')
    if (savedCollapsed === 'true') setCollapsed(true)

    const savedTheme = document.cookie.match(/nexus-theme=([^;]+)/)?.[1] as typeof theme | undefined
    if (savedTheme) applyTheme(savedTheme)

    fetch('/api/health', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { checks?: Record<string, { ok: boolean }> }) => {
        const checks = d.checks ?? {}
        setApiConnected(Boolean(checks.ai?.ok || checks.anthropic?.ok || checks.gemini?.ok || checks.groq?.ok))
      })
      .catch(() => setApiConnected(false))
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

  const cycleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    applyTheme(next)
  }, [theme, applyTheme])

  const toggleCollapse = useCallback(() => {
    setCollapsed(c => {
      localStorage.setItem('nexus-sidebar-collapsed', String(!c))
      return !c
    })
  }, [])

  const onNavigate = useCallback((page: PageId) => {
    if (page === 'leads')     { router.push('/shell/leads');     return }
    if (page === 'proposals') { router.push('/shell/proposals'); return }
    router.push(`/shell?page=${page}`, { scroll: false })
  }, [router])

  return (
    <WorkspaceProvider>
      <AutoPilotProvider>
        <div className="flex h-screen bg-paper overflow-hidden">
          <Nav
            currentPage={currentPage}
            onNavigate={onNavigate}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            apiConnected={apiConnected}
            theme={theme}
            onThemeToggle={cycleTheme}
          />
          <main className="flex-1 overflow-y-auto min-w-0">
            {children}
          </main>
        </div>
      </AutoPilotProvider>
    </WorkspaceProvider>
  )
}
