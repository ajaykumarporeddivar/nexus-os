/**
 * L2.5 — Spec Simulation Engine  (AOI v6 Gap 3)
 *
 * Pre-flight validation that predicts output quality BEFORE the BUILD phase runs.
 * "The only AI system that simulates before it acts" — AOI v6 competitive wedge.
 *
 * Runs 6 simulation checks on the FORGE spec contract:
 *   1. Entity consistency    — do type names match across sections?
 *   2. Slug consistency      — do URL slugs match nav items and route references?
 *   3. Import path validity  — do import paths reference declared types?
 *   4. KPI realism          — are stat values domain-appropriate?
 *   5. Field completeness    — do TypeScript interfaces have ≥3 domain fields?
 *   6. Score prediction      — predict final QA score from spec quality signals
 *
 * Returns: SimulationResult with predicted score + specific warnings
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SimulationCheck {
  name:    string
  passed:  boolean
  score:   number    // 0–10 contribution to predicted QA
  detail?: string
}

export interface SimulationResult {
  predictedQaScore: number       // weighted average of all checks
  confidence:       'high' | 'medium' | 'low'
  checks:           SimulationCheck[]
  warnings:         string[]
  recommendation:   'proceed' | 'repair' | 'rerun_forge'
}

// ─── Check helpers ─────────────────────────────────────────────────────────────

function extractSection(spec: string, sectionName: string): string {
  const match = spec.match(new RegExp(`##\\s*${sectionName}[\\s\\S]{0,800}`, 'i'))
  return match?.[0] ?? ''
}

function extractTypeNames(spec: string): string[] {
  return [...spec.matchAll(/export interface (\w+)/g)].map(m => m[1])
}

function extractSlugs(spec: string): string[] {
  return [...spec.matchAll(/URL Slug[^`\n]*`?([a-z0-9-]+)`?/gi)].map(m => m[1])
}

function extractNavSlugs(spec: string): string[] {
  return [...spec.matchAll(/href: ['"`]\/dashboard\/([a-z0-9-]+)['"`]/gi)].map(m => m[1])
}

// ─── Simulation Checks ─────────────────────────────────────────────────────────

function checkEntityConsistency(spec: string): SimulationCheck {
  const typeNames    = extractTypeNames(spec)
  const entityTable  = extractSection(spec, 'ENTITY REFERENCE TABLE')
  const importPaths  = extractSection(spec, 'CRITICAL IMPORT PATHS')

  let consistent = 0
  for (const name of typeNames) {
    const inTable   = entityTable.includes(name)
    const inImports = importPaths.includes(name)
    if (inTable && inImports) consistent++
  }

  const score  = typeNames.length ? Math.min(10, (consistent / typeNames.length) * 10) : 5
  const passed = score >= 7

  return {
    name:   'entity_consistency',
    passed,
    score,
    detail: `${consistent}/${typeNames.length} entity types referenced consistently across spec sections`,
  }
}

function checkSlugConsistency(spec: string): SimulationCheck {
  const specSlugs = extractSlugs(spec)
  const navSlugs  = extractNavSlugs(spec)
  const routeRef  = extractSection(spec, 'FEATURE ROUTE REFERENCE')

  if (!specSlugs.length || !navSlugs.length) {
    return { name: 'slug_consistency', passed: false, score: 3, detail: 'No slugs found in spec — likely generic output' }
  }

  const overlap = specSlugs.filter(s => navSlugs.includes(s) || routeRef.includes(s))
  const score   = Math.min(10, (overlap.length / specSlugs.length) * 10)
  const passed  = score >= 6

  return {
    name:   'slug_consistency',
    passed,
    score,
    detail: `${overlap.length}/${specSlugs.length} slugs consistent across spec, nav, and route table`,
  }
}

function checkFieldCompleteness(spec: string): SimulationCheck {
  const interfaces = [...spec.matchAll(/export interface \w+ \{([^}]+)\}/g)]
    .map(m => m[1])

  if (!interfaces.length) {
    return { name: 'field_completeness', passed: false, score: 2, detail: 'No TypeScript interfaces found' }
  }

  // Count fields per interface (look for lines like "  fieldName: type")
  const fieldCounts = interfaces.map(body => (body.match(/\n\s+\w+[?]?:/g) ?? []).length)
  const avgFields   = fieldCounts.reduce((a,b)=>a+b,0) / fieldCounts.length
  const score       = Math.min(10, avgFields * 1.5)
  const passed      = avgFields >= 3

  return {
    name:   'field_completeness',
    passed,
    score,
    detail: `Average ${avgFields.toFixed(1)} fields per entity interface (need ≥3 domain-specific fields)`,
  }
}

function checkKpiRealism(spec: string, briefText: string): SimulationCheck {
  const statsSection = extractSection(spec, 'KPI STATS REFERENCE')
  const genericKpis  = ['activeWorkflows', 'approvalRate', 'revenueProtected', 'cycleTime']
  const genericCount = genericKpis.filter(k => statsSection.includes(k)).length

  // If all 4 generic KPIs are present and brief is domain-specific, it's likely generic output
  const briefWords  = briefText.toLowerCase().split(/\s+/)
  const hasDomain   = briefWords.some(w => w.length > 4 &&
    !['build','create','make','that','this','with','from','have','will'].includes(w))

  const isGeneric = genericCount >= 3 && hasDomain
  const score     = isGeneric ? 3 : 8

  return {
    name:   'kpi_realism',
    passed: !isGeneric,
    score,
    detail: isGeneric
      ? `Generic KPIs detected (${genericCount}/4 hardcoded defaults still present) despite domain-specific brief`
      : `KPI stats appear domain-appropriate`,
  }
}

function checkImportPaths(spec: string): SimulationCheck {
  const importSection = extractSection(spec, 'CRITICAL IMPORT PATHS')
  const typeNames     = extractTypeNames(spec)
  const slugs         = extractSlugs(spec)

  // Check that the import declaration references at least the declared types
  const typesInImports = typeNames.filter(t => importSection.includes(t))
  const slugsInImports = slugs.filter(s => importSection.includes(s))

  const score = (typeNames.length && slugs.length)
    ? Math.min(10, ((typesInImports.length + slugsInImports.length) / (typeNames.length + slugs.length)) * 10)
    : 5

  return {
    name:   'import_path_validity',
    passed: score >= 6,
    score,
    detail: `${typesInImports.length}/${typeNames.length} types and ${slugsInImports.length}/${slugs.length} slugs in import declarations`,
  }
}

function checkGenericFallbackSignals(spec: string): SimulationCheck {
  // Detect hardcoded fallback signatures that indicate the deterministic fallback fired
  const fallbackSignals = [
    { pattern: /intake.*review.*reporting/i,        label: 'intake/review/reporting slugs' },
    { pattern: /IntakeRecord|ReviewRecord/,          label: 'generic IntakeRecord/ReviewRecord types' },
    { pattern: /activeWorkflows.*approvalRate/i,    label: 'all-generic KPI stats' },
    { pattern: /MOCK_INTAKE|MOCK_REVIEW/,             label: 'generic mock array names' },
  ]

  const triggered = fallbackSignals.filter(s => s.pattern.test(spec))
  const score     = Math.max(0, 10 - triggered.length * 3)

  return {
    name:   'generic_fallback_signals',
    passed: triggered.length === 0,
    score,
    detail: triggered.length
      ? `Fallback signals detected: ${triggered.map(s=>s.label).join(', ')}`
      : 'No generic fallback signals detected',
  }
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function simulateSpecContract(spec: string, briefText: string): SimulationResult {
  if (!spec || spec.length < 200) {
    return {
      predictedQaScore: 2,
      confidence:       'low',
      checks:           [],
      warnings:         ['Spec contract is empty or too short'],
      recommendation:   'rerun_forge',
    }
  }

  const checks: SimulationCheck[] = [
    checkEntityConsistency(spec),
    checkSlugConsistency(spec),
    checkFieldCompleteness(spec),
    checkKpiRealism(spec, briefText),
    checkImportPaths(spec),
    checkGenericFallbackSignals(spec),
  ]

  // Weighted average (entity consistency + slug consistency are most important)
  const weights = [2.0, 2.0, 1.5, 1.5, 1.0, 2.0]
  const weighted = checks.reduce((sum, c, i) => sum + c.score * weights[i], 0)
  const totalW   = weights.reduce((a,b) => a+b, 0)
  const predicted = Math.round((weighted / totalW) * 10) / 10

  const failing   = checks.filter(c => !c.passed)
  const warnings  = failing.map(c => c.detail).filter(Boolean) as string[]

  const confidence: SimulationResult['confidence'] =
    checks.every(c => c.passed) ? 'high' :
    failing.length <= 2         ? 'medium' : 'low'

  const recommendation: SimulationResult['recommendation'] =
    predicted >= 7.5 ? 'proceed' :
    predicted >= 5.0 ? 'repair'  : 'rerun_forge'

  return { predictedQaScore: predicted, confidence, checks, warnings, recommendation }
}
