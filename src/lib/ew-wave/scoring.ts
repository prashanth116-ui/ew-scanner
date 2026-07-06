import type {
  PriceSeries,
  EnhancedScoredCandidate,
  FibAnalysis,
  VolumeAnalysis,
  MomentumAnalysis,
  StructureAnalysis,
  ConfidenceTier,
  ScannerMode,
  WaveCount,
  MTFConfirmation,
} from "./types";
import { countWaves, countWavesMultiCycle, confirmMultiTimeframe } from "./wave-counter";
import { analyzeFibonacciEnhanced } from "./fibonacci";
import { analyzeVolume, analyzeWaveVolume } from "./volume";
import { analyzeMomentum, detectWave5Divergence } from "./momentum";
import { classifyStructure } from "./swing";

// ── Original types and functions (unchanged) ──

export interface QuoteData {
  ticker: string;
  name: string;
  ath: number;
  low: number;
  current: number;
  athYear: number;
  lowYear: number;
}

export interface ScoredCandidate {
  ticker: string;
  name: string;
  score: number;
  normalizedScore: number;
  ath: number;
  low: number;
  current: number;
  athYear: number;
  lowYear: number;
  declinePct: number;
  monthsDecline: number;
  recoveryPct: number;
  passed: boolean;
}

interface ScoringParams {
  minDecline: number;
  minDuration: number;
  minRecovery: number;
  passThreshold?: number;
}

const MAX_SCORE = 7;

export function scoreCandidate(
  q: QuoteData & { athIdx?: number; lowIdx?: number; series?: PriceSeries },
  params: ScoringParams
): ScoredCandidate {
  const { minDecline, minDuration, minRecovery, passThreshold = 0.4 } = params;

  const declinePct = q.ath > 0 ? ((q.ath - q.low) / q.ath) * 100 : 0;
  // C3: Use actual bar count when series data is available, fall back to year-based
  let monthsDecline: number;
  if (q.athIdx != null && q.lowIdx != null && q.series?.timestamps) {
    const athTs = q.series.timestamps[q.athIdx];
    const lowTs = q.series.timestamps[q.lowIdx];
    if (athTs && lowTs && lowTs > athTs) {
      monthsDecline = (lowTs - athTs) / (30 * 24 * 3600);
    } else {
      monthsDecline = Math.max(0, (q.lowYear - q.athYear) * 12);
    }
  } else {
    monthsDecline = Math.max(0, (q.lowYear - q.athYear) * 12);
  }
  const recoveryPct = q.low > 0 ? Math.max(0, ((q.current - q.low) / q.low) * 100) : 0;

  let score = 0;

  // Decline >= threshold: 2pts
  if (declinePct >= minDecline) score += 2;

  // ATH before or same year as low (correct direction): 1pt
  if (q.athYear <= q.lowYear) score += 1;

  // Duration >= threshold: 2pts
  if (monthsDecline >= minDuration) score += 2;

  // Recovery from low >= threshold: 2pts
  if (recoveryPct >= minRecovery) score += 2;

  const normalizedScore = score / MAX_SCORE;

  return {
    ticker: q.ticker,
    name: q.name,
    score,
    normalizedScore,
    ath: q.ath,
    low: q.low,
    current: q.current,
    athYear: q.athYear,
    lowYear: q.lowYear,
    declinePct,
    monthsDecline,
    recoveryPct,
    passed: normalizedScore >= passThreshold,
  };
}

export function scoreBatch(
  quotes: QuoteData[],
  params: ScoringParams
): ScoredCandidate[] {
  return quotes
    .map((q) => scoreCandidate(q, params))
    .sort((a, b) => b.normalizedScore - a.normalizedScore || b.declinePct - a.declinePct);
}

// ── Enhanced scoring (new, additive) ──

export interface EnrichedQuoteInput {
  ticker: string;
  name: string;
  sector?: string;
  ath: number;
  low: number;
  current: number;
  athYear: number;
  lowYear: number;
  series?: PriceSeries;
  athIdx?: number;
  lowIdx?: number;
  trueAth?: number;
  trueAthYear?: number;
  trueLow?: number;
  trueLowYear?: number;
  preAthLow?: number;
  preAthLowYear?: number;
  dailySeries?: PriceSeries;
  recentCycleAthIdx?: number;
  recentCycleLowIdx?: number;
}

interface EnhancedScoringParams extends ScoringParams {
  mode?: ScannerMode;
}

interface ModeWeights {
  base: number;
  fibonacci: number;
  volume: number;
  structure: number;
  relativeStrength: number;
  waveCount: number;
}

// C2: Wave count weight increased from 1.0 to 1.5 for wave modes (25→28 max)
const MODE_WEIGHTS: Record<ScannerMode, ModeWeights> = {
  wave2: {
    base: 1.0,
    fibonacci: 1.0,
    volume: 1.0,
    structure: 1.0,
    relativeStrength: 1.0,
    waveCount: 1.5,  // C2: increased from 1.0
  },
  wave4: {
    base: 0.5,
    fibonacci: 2.5,
    volume: 1.0,
    structure: 0.5,
    relativeStrength: 1.5,
    waveCount: 1.5,  // C2: increased from 1.0
  },
  wave5: {
    base: 0.5,
    fibonacci: 1.0,
    volume: 1.5,
    structure: 1.0,
    relativeStrength: 2.0,
    waveCount: 1.5,  // C2: increased from 1.0
  },
  breakout: {
    base: 0.5,
    fibonacci: 0.5,
    volume: 2.0,
    structure: 1.0,
    relativeStrength: 2.0,
    waveCount: 0.75, // C2: increased from 0.5
  },
};

// C2: Increased from 25 to 28 to accommodate higher wave count max (0-8)
const ENHANCED_MAX = 28;

export function scoreEnhanced(
  q: EnrichedQuoteInput,
  params: EnhancedScoringParams
): EnhancedScoredCandidate {
  const base = scoreCandidate(q, params);
  const weights = MODE_WEIGHTS[params.mode ?? "wave2"];

  // If no series data, return base scoring with defaults
  if (!q.series || q.athIdx == null || q.lowIdx == null) {
    const baseWeighted = (base.score / MAX_SCORE) * 7 * weights.base;
    return {
      ...base,
      sector: q.sector,
      enhancedScore: Math.round(baseWeighted * 10) / 10,
      enhancedMax: ENHANCED_MAX,
      enhancedNormalized: baseWeighted / ENHANCED_MAX,
      confidenceTier: assignConfidenceTier(baseWeighted / ENHANCED_MAX),
      series: q.series,
      athIdx: q.athIdx,
      lowIdx: q.lowIdx,
      trueAth: q.trueAth,
      trueAthYear: q.trueAthYear,
      trueLow: q.trueLow,
      trueLowYear: q.trueLowYear,
      preAthLow: q.preAthLow,
      preAthLowYear: q.preAthLowYear,
    };
  }

  // Run analyses — structural override stocks use recent-window mode
  const recentOpts = q.trueAth != null ? { recentBars: 26 } : undefined;
  const volumeAnalysis = analyzeVolume(q.series, q.athIdx, q.lowIdx, recentOpts);
  const momentumAnalysis = analyzeMomentum(q.series, q.athIdx, q.lowIdx, recentOpts);

  // V3: Run wave counter — use multi-cycle when recent cycle pivot is available
  let waveCount: WaveCount | null = null;
  let recentCycleWaveCount: WaveCount | undefined;
  try {
    const multiCycle = countWavesMultiCycle(
      q.series, q.athIdx, q.lowIdx,
      q.recentCycleAthIdx, q.recentCycleLowIdx,
    );
    waveCount = multiCycle.best;
    recentCycleWaveCount = multiCycle.recentCycle ?? undefined;
  } catch {
    // Wave counting is non-critical
  }

  // B7: Structure classification uses wave counter when available
  const structureAnalysis = classifyStructure(q.series, q.athIdx, q.lowIdx, waveCount);

  // V3: Enhanced Fibonacci with extensions from wave count + B6 wave-endpoint mode
  const fibAnalysis = analyzeFibonacciEnhanced(q.ath, q.low, q.current, waveCount, params.mode);

  // A2: Per-wave volume analysis (bonus scoring)
  const waveVolumeResult = analyzeWaveVolume(q.series, waveCount);

  // B3: Wave 5 momentum divergence detection
  const w5Divergence = detectWave5Divergence(q.series, waveCount);

  // Base score (0-7, weighted)
  const baseWeighted = (base.score / MAX_SCORE) * 7 * weights.base;

  // C4: Mode-aware Fibonacci scoring (0-4, weighted)
  const mode = params.mode ?? "wave2";
  let fibScore = 0;
  if (mode === "wave2") {
    // Wave 2: reward 50-61.8% retracement (deep correction typical)
    const depth = fibAnalysis.retracementDepth;
    if (depth >= 0.5 && depth <= 0.618) fibScore += 3;
    else if (depth >= 0.382 && depth <= 0.786) fibScore += 2;
    else if (depth >= 0.236 && depth <= 0.886) fibScore += 1;
    if (fibAnalysis.nearestLevel) fibScore += 1;
  } else if (mode === "wave4") {
    // Wave 4: reward 23.6-38.2% retracement (shallow correction typical)
    const depth = fibAnalysis.retracementDepth;
    if (depth >= 0.236 && depth <= 0.382) fibScore += 3;
    else if (depth >= 0.18 && depth <= 0.5) fibScore += 2;
    else if (depth >= 0.1 && depth <= 0.618) fibScore += 1;
    if (fibAnalysis.nearestLevel) fibScore += 1;
  } else if (mode === "wave5") {
    // Wave 5: score based on extension ratios (approaching 100% or 161.8% of W1)
    if (fibAnalysis.retracementDepth >= 0.786) fibScore += 2;
    if (fibAnalysis.extensions && fibAnalysis.extensions.length > 0) fibScore += 1;
    if (fibAnalysis.nearestLevel) fibScore += 1;
  } else {
    // Breakout: keep original ATH-proximity scoring
    if (fibAnalysis.withinGoldenZone) fibScore += 3;
    else if (fibAnalysis.retracementDepth >= 0.236 && fibAnalysis.retracementDepth <= 0.786) fibScore += 1;
    if (fibAnalysis.nearestLevel) fibScore += 1;
  }
  fibScore = Math.min(fibScore, 4);
  const fibWeighted = fibScore * weights.fibonacci;

  // Volume score (0-3, weighted)
  let volScore = 0;
  if (volumeAnalysis.confirmation) volScore += 2;
  else if (volumeAnalysis.volumeTrend === "neutral") volScore += 1;
  if (volumeAnalysis.recoveryAvgVol > 0) volScore += 1;
  // A2: Per-wave volume bonus — if volume follows EW pattern, add 1 point
  if (waveVolumeResult && waveVolumeResult.adherenceScore >= 75) volScore += 1;
  volScore = Math.min(volScore, 4); // Allow up to 4 with wave volume bonus
  const volWeighted = volScore * weights.volume;

  // Structure score (0-3, weighted)
  let structScore = 0;
  if (structureAnalysis.classification === "impulsive") structScore += 3;
  else if (structureAnalysis.classification === "corrective") structScore += 2;
  else if (structureAnalysis.swingCount >= 2) structScore += 1;
  const structWeighted = structScore * weights.structure;

  // C2: Wave count quality score (0-8, weighted) — increased from 0-5
  let waveCountScore = 0;
  if (waveCount) {
    if (waveCount.isValid && waveCount.score >= 80) waveCountScore = 8;
    else if (waveCount.isValid && waveCount.score >= 65) waveCountScore = 6;
    else if (waveCount.isValid && waveCount.score >= 50) waveCountScore = 5;
    else if (waveCount.isValid) waveCountScore = 3;
    else if (waveCount.score >= 50) waveCountScore = 2;
    else if (waveCount.score > 0) waveCountScore = 1;
  }
  // B3: Wave 5 momentum divergence bonus (for Wave 5 mode)
  if (w5Divergence && w5Divergence.bonusPoints > 0 && mode === "wave5") {
    waveCountScore = Math.min(8, waveCountScore + w5Divergence.bonusPoints);
  }
  const waveCountWeighted = waveCountScore * weights.waveCount;

  // Relative strength placeholder (set in batch processing: 0-3)
  const rsWeighted = 0;

  const totalRaw = baseWeighted + fibWeighted + volWeighted + structWeighted + waveCountWeighted + rsWeighted;
  const safeTotalRaw = Number.isFinite(totalRaw) ? totalRaw : 0;
  let enhancedNormalized = Math.min(safeTotalRaw / ENHANCED_MAX, 1);

  // C1: Wave count gates confidence level
  // If wave count is absent or very weak, cap confidence at "speculative"
  // regardless of total score — wave structure is a necessary condition for high confidence
  const waveCountWeak = !waveCount || (!waveCount.isValid && waveCount.score < 30);
  let confidenceTier = assignConfidenceTier(enhancedNormalized);
  if (waveCountWeak && waveCountScore < 2) {
    // No valid wave structure — downgrade one tier
    if (confidenceTier === "high") confidenceTier = "probable";
    else if (confidenceTier === "probable") confidenceTier = "speculative";
  }

  // Quant enrichment
  const correctionVolumeDryUp = detectCorrectionVolumeDryUp(q.series!, waveCount);
  const wave3Target = projectWave3Target(waveCount);

  // Multi-timeframe confirmation (when daily data is available)
  let mtfConfirmation: MTFConfirmation | undefined;
  let dailyWaveCount: WaveCount | undefined;
  if (q.dailySeries && q.dailySeries.close.length > 50 && waveCount) {
    try {
      // Find ATH and low on daily series for wave counting
      let dAthIdx = 0;
      let dAthVal = -Infinity;
      for (let i = 0; i < q.dailySeries.high.length; i++) {
        if (q.dailySeries.high[i] > dAthVal) { dAthVal = q.dailySeries.high[i]; dAthIdx = i; }
      }
      let dLowIdx = dAthIdx;
      let dLowVal = Infinity;
      for (let i = dAthIdx; i < q.dailySeries.low.length; i++) {
        if (q.dailySeries.low[i] < dLowVal) { dLowVal = q.dailySeries.low[i]; dLowIdx = i; }
      }
      mtfConfirmation = confirmMultiTimeframe(waveCount, q.dailySeries, dAthIdx, dLowIdx);
      dailyWaveCount = countWaves(q.dailySeries, dAthIdx, dLowIdx, "intermediate") ?? undefined;
    } catch {
      // MTF is non-critical
    }
  }

  return {
    ...base,
    sector: q.sector,
    enhancedScore: Math.round(safeTotalRaw * 10) / 10,
    enhancedMax: ENHANCED_MAX,
    enhancedNormalized,
    confidenceTier,
    fibAnalysis,
    volumeAnalysis,
    momentumAnalysis,
    structureAnalysis,
    waveCount: waveCount ?? undefined,
    recentCycleWaveCount,
    mtfConfirmation,
    dailyWaveCount,
    dailySeries: q.dailySeries,
    correctionVolumeDryUp,
    wave3Target,
    series: q.series,
    athIdx: q.athIdx,
    lowIdx: q.lowIdx,
    trueAth: q.trueAth,
    trueAthYear: q.trueAthYear,
    trueLow: q.trueLow,
    trueLowYear: q.trueLowYear,
    preAthLow: q.preAthLow,
    preAthLowYear: q.preAthLowYear,
  };
}

export function scoreBatchEnhanced(
  quotes: EnrichedQuoteInput[],
  params: EnhancedScoringParams
): EnhancedScoredCandidate[] {
  const scored = quotes.map((q) => scoreEnhanced(q, params));

  // Compute relative strength across batch
  if (scored.length > 1) {
    const maxRecovery = Math.max(...scored.map((s) => s.recoveryPct), 1);
    const minDecline = Math.min(...scored.map((s) => s.declinePct), 0);
    const maxDecline = Math.max(...scored.map((s) => s.declinePct), 1);
    const weights = MODE_WEIGHTS[params.mode ?? "wave2"];

    for (const s of scored) {
      // RS = blend of recovery strength + decline resilience (smaller decline = better)
      const recoveryRank = s.recoveryPct / maxRecovery;
      const declineRange = maxDecline - minDecline || 1;
      const declineRank = 1 - (s.declinePct - minDecline) / declineRange;
      const rs = (recoveryRank * 0.6 + declineRank * 0.4) * 3;
      const rsWeighted = rs * weights.relativeStrength;

      s.relativeStrength = Math.round(rs * 100) / 100;
      s.enhancedScore = Math.min(
        Math.round((s.enhancedScore + rsWeighted) * 10) / 10,
        ENHANCED_MAX
      );
      s.enhancedNormalized = s.enhancedScore / ENHANCED_MAX;
      s.confidenceTier = assignConfidenceTier(s.enhancedNormalized);
    }
  }

  return scored.sort(
    (a, b) =>
      b.enhancedNormalized - a.enhancedNormalized ||
      b.declinePct - a.declinePct
  );
}

// C2: Thresholds adjusted proportionally for 28-point max (was 25)
// High: 22/28 = 0.786 → ~0.78, Moderate: 16/28 = 0.571 → ~0.57, Low: 10/28 = 0.357
export function assignConfidenceTier(normalized: number): ConfidenceTier {
  if (normalized >= 0.78) return "high";
  if (normalized >= 0.57) return "probable";
  return "speculative";
}

/**
 * Detect correction volume dry-up at wave 2/4 zones.
 * Compares avg volume at correction zones vs prior impulse wave.
 * If correction volume < 50% of impulse volume -> true (high-probability reversal).
 */
export function detectCorrectionVolumeDryUp(
  series: PriceSeries,
  waveCount: WaveCount | null | undefined
): boolean {
  if (!waveCount || !waveCount.isValid || !series.volume) return false;

  const vols = series.volume;
  const len = vols.length;
  if (len < 20) return false;

  // Use wave position to identify correction zones
  const pos = waveCount.position?.toLowerCase() ?? "";
  const isCorrection = pos.includes("2") || pos.includes("4") || pos.includes("correction");
  if (!isCorrection) return false;

  // Compare recent 5 bars (correction zone) vs prior 10 bars (impulse)
  const correctionEnd = len;
  const correctionStart = Math.max(0, correctionEnd - 5);
  const impulseEnd = correctionStart;
  const impulseStart = Math.max(0, impulseEnd - 10);

  if (impulseEnd - impulseStart < 5) return false;

  let corrVol = 0;
  for (let i = correctionStart; i < correctionEnd; i++) corrVol += vols[i];
  corrVol /= (correctionEnd - correctionStart);

  let impVol = 0;
  for (let i = impulseStart; i < impulseEnd; i++) impVol += vols[i];
  impVol /= (impulseEnd - impulseStart);

  return impVol > 0 && corrVol < impVol * 0.5;
}

/**
 * Project wave 3 target using wave 1 length x 1.618 from wave 2 low.
 * Returns price target or null if wave structure is insufficient.
 */
export function projectWave3Target(
  waveCount: WaveCount | null | undefined
): number | null {
  if (!waveCount || !waveCount.isValid) return null;

  const waves = waveCount.waves;
  if (!waves || waves.length < 2) return null;

  // Need wave 1 start (waveStart), wave 1 end, and wave 2 end
  const wave1End = waves.find((w) => w.label === "1");
  const wave2End = waves.find((w) => w.label === "2");

  if (!wave1End || !wave2End) return null;

  // Wave 1 start is the waveStart (p0) of the count
  const wave1Start = waveCount.waveStart;
  if (!wave1Start) return null;

  const wave1Length = Math.abs(wave1End.price - wave1Start.price);
  if (wave1Length <= 0) return null;

  // Wave 3 target = wave 2 price + (wave 1 length * 1.618)
  const isUptrend = wave1End.price > wave1Start.price;
  const target = isUptrend
    ? wave2End.price + wave1Length * 1.618
    : wave2End.price - wave1Length * 1.618;

  return Math.round(target * 100) / 100;
}
