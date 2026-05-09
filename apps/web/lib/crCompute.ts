/**
 * AAS v4 — 5-Dimensional Compound Rate (CR) computation
 *
 * CR = SQI×0.25 + PAcc×0.30 + KPrec×0.20 + EVel×0.15 + LSM×0.10
 *
 * All dimensions are normalised to [0, 1].
 * CR ≥ 1.05/quarter = compounding. CR < 0.95 for 2 loops → Phase 09 audit.
 */

export interface CRDimensions {
  sqi:  number  // Signal Quality Index     25%
  pAcc: number  // Prediction Accuracy      30%
  kPrec: number // Kill Precision           20%
  evel: number  // Execution Velocity       15%
  lsm:  number  // Learning Speed Metric    10%
}

export interface CRResult extends CRDimensions {
  cr:          number
  mCR:         number   // delta vs prior CR snapshot (0 if first)
  loopVersion: number
  regimeClass: string
}

export interface ExecutionSample {
  score:    number | null
  passed:   boolean | null
  phases:   string[]
  createdAt: Date
}

export interface LearningCycleSample {
  avgScoreBefore: number
  avgScoreAfter:  number
}

// SQI: combines output quality (avg score) with pipeline completeness (full runs ratio).
// A system producing high scores on full pipelines scores close to 1.0.
export function computeSQI(executions: ExecutionSample[]): number {
  if (executions.length === 0) return 0

  const scored = executions.filter(e => e.score !== null)
  const avgScore = scored.length
    ? scored.reduce((s, e) => s + (e.score ?? 0), 0) / scored.length
    : 0

  const fullPipelineCount = executions.filter(e => e.phases.length >= 7).length
  const fullPipelineRate  = fullPipelineCount / executions.length

  // Normalise avgScore from [0,10] to [0,1], weight equally with pipeline rate
  return Math.min(1, ((avgScore / 10) * 0.6) + (fullPipelineRate * 0.4))
}

// PAcc: Brier-score-based prediction accuracy.
// For each execution: predicted P(pass) = score/10, actual = passed ? 1 : 0.
// Brier score = mean((predicted – actual)^2). Lower = better.
// Invert so higher PAcc = better system calibration.
export function computePAcc(executions: ExecutionSample[]): number {
  const calibrated = executions.filter(e => e.score !== null && e.passed !== null)
  if (calibrated.length === 0) return 0.5 // no data = neutral

  const brierScore = calibrated.reduce((sum, e) => {
    const predicted = (e.score ?? 0) / 10
    const actual    = e.passed ? 1 : 0
    return sum + Math.pow(predicted - actual, 2)
  }, 0) / calibrated.length

  // Brier score 0 = perfect. 1 = worst. Invert and clamp.
  return Math.max(0, Math.min(1, 1 - brierScore))
}

// KPrec: Kill Precision — ratio of runs that completed the full pipeline.
// Signals that die early (incomplete phases) represent poor-quality intake.
// High KPrec means the system is only running signals worth executing.
export function computeKPrec(executions: ExecutionSample[]): number {
  if (executions.length === 0) return 0
  const fullRuns = executions.filter(e => e.phases.length >= 7).length
  return fullRuns / executions.length
}

// EVel: Execution Velocity — throughput normalised to a [0,1] scale.
// Uses the ratio of current window runs/day vs 30-day baseline runs/day.
// Capped at 1.0 (improvement beyond baseline doesn't score above 1).
export function computeEVel(
  currentRuns:    number,
  currentDays:    number,
  baselineRuns:   number,
  baselineDays:   number,
): number {
  if (baselineDays === 0 || baselineRuns === 0) return 0.5 // no baseline = neutral
  const currentRate  = currentRuns  / Math.max(currentDays,  1)
  const baselineRate = baselineRuns / Math.max(baselineDays, 1)
  return Math.min(1, currentRate / baselineRate)
}

// LSM: Learning Speed Metric — average score improvement per completed learning cycle.
// Cycles with no improvement score 0. Cycles with ≥1 point improvement score 1.
// Normalised so LSM=1 means consistent +1 point improvement per cycle.
export function computeLSM(cycles: LearningCycleSample[]): number {
  if (cycles.length === 0) return 0.3 // no cycles yet = below neutral (system hasn't learned)
  const avgDelta = cycles.reduce((s, c) => s + (c.avgScoreAfter - c.avgScoreBefore), 0) / cycles.length
  // Clamp: 0 improvement → 0, ≥ 1 point improvement → 1.0
  return Math.max(0, Math.min(1, avgDelta))
}

// Weighted sum CR formula
export function computeCR(dims: CRDimensions): number {
  return (
    dims.sqi   * 0.25 +
    dims.pAcc  * 0.30 +
    dims.kPrec * 0.20 +
    dims.evel  * 0.15 +
    dims.lsm   * 0.10
  )
}

// Classify regime from available indicators.
// All inputs normalised [0,1] where applicable.
export function classifyRegime(indicators: {
  signalDensity:  number  // runs/day, normalised to [0,1] using 30d max
  trendSlope:     number  // positive = rising, negative = falling, range [-1,1]
  anomalyRate:    number  // fraction of failed/incomplete runs, [0,1]
  crDelta:        number  // latest CR minus prior CR, range [-1,1]
}): { regimeClass: string; confidence: number } {
  const { signalDensity, trendSlope, anomalyRate, crDelta } = indicators

  // Contraction/hostile: consistently negative signals
  if (anomalyRate > 0.5 || (trendSlope < -0.3 && crDelta < -0.05)) {
    const conf = Math.min(0.9, 0.5 + anomalyRate * 0.4 + Math.abs(trendSlope) * 0.2)
    return { regimeClass: 'contraction', confidence: conf }
  }

  // Transition: conflicting indicators
  if (anomalyRate > 0.25 || Math.abs(trendSlope) < 0.1) {
    const conf = Math.min(0.75, 0.4 + anomalyRate * 0.3 + signalDensity * 0.1)
    return { regimeClass: 'transition', confidence: conf }
  }

  // Unknown: insufficient data
  if (signalDensity < 0.05) {
    return { regimeClass: 'unknown', confidence: 0.3 }
  }

  // Expansion: positive momentum, low anomalies, rising trend
  if (trendSlope > 0.1 && anomalyRate < 0.2 && (crDelta >= 0 || signalDensity > 0.4)) {
    const conf = Math.min(0.92, 0.55 + trendSlope * 0.3 + signalDensity * 0.1)
    return { regimeClass: 'expansion', confidence: conf }
  }

  // Default safe: transition
  return { regimeClass: 'transition', confidence: 0.45 }
}

// Kill threshold per regime and track — returns the minimum EV/C score to proceed.
// E-track (explore) uses the novelty-slot relaxed threshold.
export function killThreshold(regimeClass: string, track: 'E' | 'X'): number {
  if (track === 'E') return 0.15  // novelty slot — always relaxed

  switch (regimeClass) {
    case 'expansion':   return 0.2
    case 'transition':  return 0.35
    case 'contraction': return 0.6
    default:            return 0.35  // unknown defaults to transition rules
  }
}

// Pipeline capacity cap per regime
export function pipelineCap(regimeClass: string): number {
  switch (regimeClass) {
    case 'expansion':   return 7
    case 'transition':  return 3
    case 'contraction': return 1
    default:            return 3
  }
}

// Explore/exploit ratio per regime and loop stage
export function exploreRatio(regimeClass: string, loopVersion: number): number {
  // Regime overrides take precedence
  if (regimeClass === 'transition')  return 0.20
  if (regimeClass === 'expansion')   return 0.60
  if (regimeClass === 'contraction') return 0.10

  // Stage-based fallback for unknown / stable
  if (loopVersion <= 5)  return 0.70
  if (loopVersion <= 15) return 0.50
  return 0.30
}
