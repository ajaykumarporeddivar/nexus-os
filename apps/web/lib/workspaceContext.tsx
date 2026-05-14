'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Workspace {
  id:               string
  name:             string
  type:             string
  description:      string | null
  context:          string | null
  emoji:            string
  color:            string
  ownerId:          string | null
  industryCategory: string | null
  createdAt:        string
  updatedAt:        string
}

export interface WorkspaceIntelligenceProfile {
  id:                    string
  workspaceId:           string
  primaryIndustry:       string
  subcategories:         string[]
  targetMarket:          string
  preferredRevenueModel: string
  buildComplexityPref:   string
  generationAggression:  string
  refreshCadenceHours:   number
  enabledNiches:         string[]
  lastGeneratedAt:       string | null
  generationCount:       number
  createdAt:             string
  updatedAt:             string
}

interface WorkspaceCtx {
  workspaces:             Workspace[]
  active:                 Workspace | null
  activeProfile:          WorkspaceIntelligenceProfile | null
  isLoading:              boolean
  isProfileLoading:       boolean
  setActive:              (w: Workspace | null) => void
  refresh:                () => Promise<void>
  refreshProfile:         () => Promise<void>
  createWorkspace:        (data: Partial<Workspace>) => Promise<Workspace>
  updateWorkspace:        (id: string, data: Partial<Workspace>) => Promise<void>
  deleteWorkspace:        (id: string) => Promise<void>
  updateProfile:          (data: Partial<WorkspaceIntelligenceProfile>) => Promise<void>
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

const STORAGE_KEY = 'nexus-active-workspace'

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces]       = useState<Workspace[]>([])
  const [active, setActiveState]          = useState<Workspace | null>(null)
  const [activeProfile, setActiveProfile] = useState<WorkspaceIntelligenceProfile | null>(null)
  const [isLoading, setIsLoading]         = useState(true)
  const [isProfileLoading, setProfileLoading] = useState(false)

  // ── Workspace list refresh ─────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const res  = await fetch('/api/workspaces')
      const text = await res.text()
      if (!text) return
      let data: { ok: boolean; data?: { workspaces: Workspace[] } }
      try { data = JSON.parse(text) } catch { return }
      if (!data.ok || !data.data) return
      const list: Workspace[] = data.data.workspaces
      setWorkspaces(list)

      // Restore previously active workspace from localStorage
      const savedId = localStorage.getItem(STORAGE_KEY)
      if (savedId) {
        const found = list.find(w => w.id === savedId)
        setActiveState(found ?? (list[0] ?? null))
      } else {
        setActiveState(list[0] ?? null)
      }
    } catch {
      // silently ignore — workspace is optional
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── Intelligence profile refresh for active workspace ─────────────────────
  const refreshProfile = useCallback(async () => {
    if (!active?.id) { setActiveProfile(null); return }
    setProfileLoading(true)
    try {
      const res  = await fetch(`/api/workspaces/${active.id}/intelligence-profile`)
      const text = await res.text()
      if (!text) return
      let data: { ok: boolean; data?: { profile: WorkspaceIntelligenceProfile } }
      try { data = JSON.parse(text) } catch { return }
      if (data.ok && data.data?.profile) setActiveProfile(data.data.profile)
    } catch {
      // non-fatal — profile is optional enhancement
    } finally {
      setProfileLoading(false)
    }
  }, [active?.id])

  useEffect(() => { refresh() }, [refresh])

  // When active workspace changes, load its intelligence profile
  useEffect(() => {
    if (active?.id) {
      refreshProfile()
    } else {
      setActiveProfile(null)
    }
  }, [active?.id, refreshProfile])

  // ── Active workspace setter ────────────────────────────────────────────────
  const setActive = useCallback((w: Workspace | null) => {
    setActiveState(w)
    if (w) localStorage.setItem(STORAGE_KEY, w.id)
    else    localStorage.removeItem(STORAGE_KEY)
  }, [])

  // ── Safe JSON helper ──────────────────────────────────────────────────────
  const safeJson = async (res: Response) => {
    const text = await res.text()
    if (!text) throw new Error('Empty response')
    return JSON.parse(text)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const createWorkspace = useCallback(async (data: Partial<Workspace>) => {
    const res  = await fetch('/api/workspaces', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    const json = await safeJson(res)
    if (!json.ok) throw new Error(json.error ?? 'Failed to create')
    await refresh()
    return json.data.workspace as Workspace
  }, [refresh])

  const updateWorkspace = useCallback(async (id: string, data: Partial<Workspace>) => {
    const res  = await fetch(`/api/workspaces/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    const json = await safeJson(res)
    if (!json.ok) throw new Error(json.error ?? 'Failed to update')
    await refresh()
  }, [refresh])

  const deleteWorkspace = useCallback(async (id: string) => {
    const res  = await fetch(`/api/workspaces/${id}`, { method: 'DELETE' })
    const json = await safeJson(res)
    if (!json.ok) throw new Error(json.error ?? 'Failed to delete')
    if (active?.id === id) setActive(null)
    await refresh()
  }, [active, refresh, setActive])

  // ── Intelligence profile update ───────────────────────────────────────────
  const updateProfile = useCallback(async (data: Partial<WorkspaceIntelligenceProfile>) => {
    if (!active?.id) throw new Error('No active workspace')
    const res  = await fetch(`/api/workspaces/${active.id}/intelligence-profile`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    const json = await safeJson(res)
    if (!json.ok) throw new Error(json.error ?? 'Failed to update intelligence profile')
    setActiveProfile(json.data.profile as WorkspaceIntelligenceProfile)
    // Sync industryCategory on the local workspace object too
    if (data.primaryIndustry) {
      setWorkspaces(prev => prev.map(w =>
        w.id === active.id ? { ...w, industryCategory: data.primaryIndustry! } : w
      ))
      setActiveState(prev => prev?.id === active.id
        ? { ...prev, industryCategory: data.primaryIndustry! }
        : prev
      )
    }
  }, [active?.id])

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      active,
      activeProfile,
      isLoading,
      isProfileLoading,
      setActive,
      refresh,
      refreshProfile,
      createWorkspace,
      updateWorkspace,
      deleteWorkspace,
      updateProfile,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return ctx
}
