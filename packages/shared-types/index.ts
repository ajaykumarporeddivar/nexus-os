/* ─── Lens types ─── */
export type LensType = 'gov' | 'lens'

export interface Lens {
  id: string
  name: string
  type: LensType
  description: string
  prompt: string
}

/* ─── Agent types ─── */
export type AgentStatus = 'idle' | 'run' | 'done' | 'err'

export interface Agent {
  id: string
  name: string
  role: string
  status: AgentStatus
  output?: string
  tokens?: number
}

/* ─── Runtime state ─── */
export type GovernorRisk  = 'conservative' | 'balanced' | 'aggressive'
export type GovernorDepth = 'surface' | 'standard' | 'exhaustive'

export interface Belief {
  id: string
  content: string
  confidence: number
  fragile: boolean
  iteration: number
}

export interface STREntry {
  iteration: number
  lensId: string
  lensName: string
  summary: string
  timestamp: string
}

export interface ReasoningContext {
  iteration: number
  lensId: string
  output: string
  tokens: number
}

export interface SimState {
  iteration: number
  beliefs: Belief[]
  strEntries: STREntry[]
  signalQuality: number
  exitConditions: boolean[]
  currentLensIdx: number
  isRunning: boolean
  reasoningContext: ReasoningContext[]
  governorRisk: GovernorRisk
  governorDepth: GovernorDepth
  governorMode: string
}

/* ─── FORGE types ─── */
export type PipeStatus = 'idle' | 'run' | 'done' | 'err'

export interface ForgeState {
  phases: string[]
  tokens: number
  calls: number
  files: Record<string, string>
  startTime?: number
}

/* ─── Build / Execution record ─── */
export type ExecutionStatus = 'APPROVED' | 'NEEDS_REVISION' | 'COMPLETE'

export interface Build {
  id: number
  date: string
  time: string
  input: string
  client: string
  phases: string[]
  tokens: number
  calls: number
  score: number | null
  passed: boolean | null
  status: ExecutionStatus
  files: number
}

/* ─── Vault types ─── */
export interface VaultScoreDimension {
  label: string
  score: number
  max: number
}

export interface VaultVariant {
  id: string
  label: string
  prompt: string
}

export interface VaultItem {
  id: string
  title: string
  description: string
  category: string
  prompt: string
  scoring: VaultScoreDimension[]
  gaps: string[]
  variants: VaultVariant[]
}

/* ─── nexusStore shape ─── */
export interface NexusStore {
  builds: Build[]
  totalTokens: number
  totalCalls: number
  listeners: Array<() => void>
  subscribe(fn: () => void): () => void
  publish(): void
  addBuild(entry: Build): void
  restore(): void
}

/* ─── Audit event ─── */
export type AuditAction =
  | 'forge_run_started'
  | 'forge_run_completed'
  | 'forge_download'
  | 'forge_whitelabel_download'
  | 'runtime_iteration'
  | 'vault_view'
  | 'vault_launch_forge'
  | 'vault_prompt_saved'
  | 'vault_version_activated'
  | 'demo_booking'
  | 'api_key_set'
  | 'api_key_cleared'
  | 'theme_change'
  | 'audit_view'
  | 'geo_refresh'
  | 'learning_cycle'
  | 'agent_prompt_saved'
  | 'agent_run'
  | 'payment_verified'
  | 'subscription_cancelled'
  | 'subscription_expired'
  | 'subscription_expiry_cron'
  | 'trending_fetch'
  | 'regime_classify'             // AAS v4: Phase 01 regime classification event
  | 'fatigue_gate'                // AAS v4: Phase 05 zone gate triggered
  | 'monitor_run'
  | 'workspace_scheduler_run'
  | 'workspace_generation'
  | 'client_agent_run'
  | 'client_agent_batch_run'
  | 'client_agent_delivery'
  | 'integration_connected'
  | 'integration_disconnected'
  | 'image_prompt_generated'
  | 'image_prompt_batch_run'
  | 'image_rendered'
  | 'video_prompt_generated'
  | 'video_prompt_batch_run'
  | 'video_prompt_free_render'
  | 'whatsapp_sent'

export interface AuditEvent {
  id: string
  action: AuditAction
  userId?: string
  sessionId: string
  meta: Record<string, unknown>
  createdAt: string
}

/* ─── API response wrappers ─── */
export interface ApiOk<T> { ok: true; data: T }
export interface ApiErr   { ok: false; error: string; code?: string }
export type ApiResult<T>  = ApiOk<T> | ApiErr

/* ─── SSE event shapes ─── */
export interface SSEChunk  { type: 'chunk'; content: string; tokens: number }
export interface SSEDone   { type: 'done';  tokens: number }
export interface SSEError  { type: 'error'; message: string }
export type SSEEvent = SSEChunk | SSEDone | SSEError
