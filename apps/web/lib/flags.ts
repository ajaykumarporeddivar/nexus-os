/**
 * Feature flags — controls progressive rollout of workspace intelligence features.
 *
 * Each flag is a percentage (0–100). At 0%, the feature is off for all users.
 * At 100%, it is on for all users. Intermediate values enable percentage-based rollout.
 *
 * Rollout order (strict dependency chain):
 *   1. buildThisButton           — additive UI, no schema dep (ship early)
 *   2. ideaBookmarking           — additive, no schema change
 *   3. workspaceIntelligenceProfile — requires DB migration (complete)
 *   4. workspaceScopedTrending   — depends on intelligenceProfile
 *   5. perWorkspaceScheduler     — depends on idea store + profile
 *   6. onboardingWizard          — depends on all above
 */

export const FLAGS = {
  /** "Build This" button on trending idea cards — converts to pipeline brief */
  buildThisButton: 100,

  /** Idea bookmarking — save trending items to workspace idea store */
  ideaBookmarking: 100,

  /** Workspace intelligence profile — structured industry config per workspace */
  workspaceIntelligenceProfile: 100,

  /** Workspace-scoped trending feed — per-workspace WorkspaceIdea generation */
  workspaceScopedTrending: 100,

  /** Per-workspace scheduler — workspace-aware cron generation */
  perWorkspaceScheduler: 100,

  /** Onboarding wizard — guided workspace setup flow */
  onboardingWizard: 100,
} as const

export type FlagKey = keyof typeof FLAGS

/**
 * Check if a flag is enabled for a given user.
 * Uses deterministic hash of userId to ensure consistent bucketing.
 * If userId is null (unauthenticated), uses pure percentage check against a fixed seed.
 */
export function isFlagEnabled(flag: FlagKey, userId?: string | null): boolean {
  const pct = FLAGS[flag] as number
  if (pct === 0) return false
  if (pct === 100) return true

  // Deterministic bucketing: hash userId into 0–99 bucket
  const seed = userId ?? 'anonymous'
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return (hash % 100) < pct
}
