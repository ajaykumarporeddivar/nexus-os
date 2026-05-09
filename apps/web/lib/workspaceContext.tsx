'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export interface Workspace {
  id: string
  name: string
  type: string
  description: string | null
  context: string | null
  emoji: string
  color: string
  ownerId: string | null
  createdAt: string
  updatedAt: string
}

interface WorkspaceCtx {
  workspaces:    Workspace[]
  active:        Workspace | null
  isLoading:     boolean
  setActive:     (w: Workspace | null) => void
  refresh:       () => Promise<void>
  createWorkspace: (data: Partial<Workspace>) => Promise<Workspace>
  updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

const STORAGE_KEY = 'nexus-active-workspace'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [active, setActiveState]    = useState<Workspace | null>(null)
  const [isLoading, setIsLoading]   = useState(true)

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

      // Restore previously active workspace
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

  useEffect(() => { refresh() }, [refresh])

  const setActive = useCallback((w: Workspace | null) => {
    setActiveState(w)
    if (w) localStorage.setItem(STORAGE_KEY, w.id)
    else    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const safeJson = async (res: Response) => {
    const text = await res.text()
    if (!text) throw new Error('Empty response')
    return JSON.parse(text)
  }

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

  return (
    <WorkspaceContext.Provider value={{ workspaces, active, isLoading, setActive, refresh, createWorkspace, updateWorkspace, deleteWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return ctx
}
