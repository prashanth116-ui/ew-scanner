/**
 * ICT Quality Score (0-100) from price-action components only.
 * No lagging indicators — purely derived from engine output and raw OHLC.
 */

import { SCORING, CHASE, DISPLACEMENT } from "./config";
import { ICTState } from "./types";
import type { ICTSetup, ICTScore, ICTScoreComponents } from "./types";

/**
 * Compute the quality score for an ICT setup.
 * All components are price-action only — no moving averages or oscillators.
 */
export function scoreICTSetup(
  setup: ICTSetup,
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
): ICTScore {
  const components = computeComponents(setup, opens, highs, lows, closes);

  const total = Math.min(100, Math.round(
    components.stateScore +
    components.displacementQuality +
    components.fvgQuality +
    components.retracementDepth +
    components.bslQuality +
    components.compressionQuality +
    components.structureCoherence +
    components.invalidationDistance
  ));

  const isChasing = detectChasing(setup, opens, highs, lows, closes);
  const isLateEntry = detectLateEntry(setup, closes);

  return { total, components, isChasing, isLateEntry };
}

function computeComponents(
  setup: ICTSetup,
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
): ICTScoreComponents {
  return {
    stateScore: scoreState(setup),
    displacementQuality: scoreDisplacement(setup, opens, highs, lows, closes),
    fvgQuality: scoreFVG(setup, closes),
    retracementDepth: scoreRetracement(setup),
    bslQuality: scoreBSL(setup),
    compressionQuality: scoreCompression(setup, highs, lows),
    structureCoherence: scoreCoherence(setup),
    invalidationDistance: scoreInvalidationDistance(setup, closes),
  };
}

// ── Component Scoring Functions ──

/** State Score (0-30): Linear from state order. */
function scoreState(setup: ICTSetup): number {
  if (setup.currentState === ICTState.NONE) return 0;
  // ICTState values range 1-11, normalize to 0-30
  return Math.round((setup.currentState / 11) * SCORING.STATE_MAX);
}

/**
 * Displacement Quality (0-15): How much the displacement body exceeds prior bodies.
 * Finds the displacement transition and compares body size ratios.
 */
function scoreDisplacement(
  setup: ICTSetup,
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
): number {
  if (setup.currentState < ICTState.BULLISH_DISPLACEMENT) return 0;

  // Find the displacement bar from transitions
  const dispTransition = setup.transitions.find(
    (t) => t.toState === ICTState.BULLISH_DISPLACEMENT
  );
  if (!dispTransition) return 0;

  const i = dispTransition.barIndex;
  if (i < DISPLACEMENT.COMPARISON_BARS || i >= closes.length) return 0;

  const body = Math.abs(closes[i] - opens[i]);
  const range = highs[i] - lows[i];
  if (range <= 0) return 0;

  // Average ratio of body to previous bodies
  let totalRatio = 0;
  for (let j = 1; j <= DISPLACEMENT.COMPARISON_BARS; j++) {
    const prevBody = Math.abs(closes[i - j] - opens[i - j]);
    if (prevBody > 0) {
      totalRatio += body / prevBody;
    } else {
      totalRatio += 3; // If prev body is 0, treat as strong displacement
    }
  }
  const avgRatio = totalRatio / DISPLACEMENT.COMPARISON_BARS;

  // Scale: ratio of 1.5 = half score, ratio of 3+ = full score
  const normalized = Math.min(1, (avgRatio - 1) / 2);
  return Math.round(normalized * SCORING.DISPLACEMENT_QUALITY_MAX);
}

/**
 * FVG Size Quality (0-10): FVG gap as % of price.
 * Larger gaps represent stronger liquidity voids.
 */
function scoreFVG(setup: ICTSetup, closes: number[]): number {
  if (!setup.fvgZone || setup.currentState < ICTState.FVG_CONFIRMED) return 0;

  const gapSize = setup.fvgZone.upper - setup.fvgZone.lower;
  const price = closes[Math.min(setup.fvgZone.barIndex, closes.length - 1)];
  if (price <= 0) return 0;

  const gapPct = (gapSize / price) * 100;

  // Scale: 0.5% gap = half score, 1.5%+ gap = full score
  const normalized = Math.min(1, gapPct / 1.5);
  return Math.round(normalized * SCORING.FVG_SIZE_QUALITY_MAX);
}

/**
 * Retracement Depth (0-10): How deep into FVG zone.
 * 50-75% is optimal (Goldilocks zone). Shallower or overshoot penalized.
 */
function scoreRetracement(setup: ICTSetup): number {
  if (setup.retracementDepth === null || setup.currentState < ICTState.FVG_RETRACEMENT) return 0;

  const depth = setup.retracementDepth;
  const optMin = SCORING.RETRACEMENT_OPTIMAL_MIN;
  const optMax = SCORING.RETRACEMENT_OPTIMAL_MAX;

  let normalized: number;
  if (depth >= optMin && depth <= optMax) {
    normalized = 1; // Goldilocks zone
  } else if (depth < optMin) {
    normalized = depth / optMin; // Shallow — linear penalty
  } else {
    // Overshoot — penalize beyond optimal max
    normalized = Math.max(0, 1 - (depth - optMax) / (1 - optMax));
  }

  return Math.round(normalized * SCORING.RETRACEMENT_DEPTH_MAX);
}

/**
 * BSL Cluster Quality (0-10): Count of clustered highs * tightness.
 * More clustered highs at similar levels = stronger BSL.
 */
function scoreBSL(setup: ICTSetup): number {
  if (setup.bslLevel === null || setup.currentState < ICTState.BSL_BUILT) return 0;

  // Score based on cluster count (min 2 required to reach this state)
  // 2 = base, 3 = good, 4+ = excellent
  const countScore = Math.min(1, (setup.bslClusterCount - 1) / 3);
  return Math.round(countScore * SCORING.BSL_CLUSTER_QUALITY_MAX);
}

/**
 * Compression Quality (0-10): Consecutive higher lows + decreasing ranges.
 * No ATR — uses direct range comparisons.
 */
function scoreCompression(
  setup: ICTSetup,
  highs: number[],
  lows: number[],
): number {
  if (setup.currentState < ICTState.ARMED) return 0;

  const n = highs.length;
  let consecutiveHL = 0;
  let contractingRanges = 0;

  // Count consecutive higher lows from the end
  for (let i = n - 1; i >= 1; i--) {
    if (lows[i] > lows[i - 1]) {
      consecutiveHL++;
      if (highs[i] - lows[i] < highs[i - 1] - lows[i - 1]) {
        contractingRanges++;
      }
    } else {
      break;
    }
  }

  // Score: 2 HL = base, 4+ = excellent. Contracting ranges add bonus.
  const hlScore = Math.min(1, consecutiveHL / 4);
  const contractScore = consecutiveHL > 0 ? contractingRanges / consecutiveHL : 0;
  const combined = hlScore * 0.6 + contractScore * 0.4;

  return Math.round(combined * SCORING.COMPRESSION_QUALITY_MAX);
}

/**
 * Structure Coherence (0-10): Bars from SSL to current state.
 * Faster progression = more coherent setup.
 */
function scoreCoherence(setup: ICTSetup): number {
  if (setup.sslBarIndex === null || setup.currentState < ICTState.SSL_RAID) return 0;

  const barsElapsed = setup.barsProcessed - setup.sslBarIndex;
  if (barsElapsed <= 0) return 0;

  const ideal = SCORING.COHERENCE_IDEAL_BARS;
  const maxBars = SCORING.COHERENCE_MAX_BARS;

  if (barsElapsed <= ideal) {
    return SCORING.STRUCTURE_COHERENCE_MAX;
  }
  if (barsElapsed >= maxBars) {
    return 0;
  }

  // Linear decay between ideal and max
  const ratio = 1 - (barsElapsed - ideal) / (maxBars - ideal);
  return Math.round(ratio * SCORING.STRUCTURE_COHERENCE_MAX);
}

/**
 * Invalidation Distance (0-5): % distance from current price to protected low.
 * Too tight = high risk, too far = less relevant.
 */
function scoreInvalidationDistance(setup: ICTSetup, closes: number[]): number {
  if (setup.protectedLow === null || setup.currentState < ICTState.SSL_RAID) return 0;

  const price = closes[closes.length - 1];
  if (price <= 0) return 0;

  const distPct = ((price - setup.protectedLow) / price) * 100;

  if (distPct >= SCORING.INVALIDATION_SAFE_PCT) {
    return SCORING.INVALIDATION_DISTANCE_MAX;
  }
  if (distPct <= SCORING.INVALIDATION_DANGER_PCT) {
    return 0;
  }

  // Linear scale between danger and safe
  const ratio = (distPct - SCORING.INVALIDATION_DANGER_PCT) /
    (SCORING.INVALIDATION_SAFE_PCT - SCORING.INVALIDATION_DANGER_PCT);
  return Math.round(ratio * SCORING.INVALIDATION_DISTANCE_MAX);
}

// ── Chase Risk Detection ──

/**
 * Detect if the current setup is a chase (multiple consecutive expansion candles).
 * Uses direct range comparisons — no ATR.
 */
function detectChasing(
  setup: ICTSetup,
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
): boolean {
  if (setup.currentState < ICTState.TRIGGER) return false;

  const n = closes.length;
  let expansionCount = 0;

  // Count consecutive expansion candles from the end
  for (let i = n - 1; i >= 1; i--) {
    const range = highs[i] - lows[i];
    const prevRange = highs[i - 1] - lows[i - 1];
    const isBullish = closes[i] > opens[i];

    if (isBullish && range > prevRange) {
      expansionCount++;
    } else {
      break;
    }
  }

  return expansionCount >= CHASE.MAX_EXPANSION_CANDLES;
}

/**
 * Detect late entry based on distance from FVG and candles since trigger.
 */
function detectLateEntry(setup: ICTSetup, closes: number[]): boolean {
  if (setup.currentState < ICTState.TRIGGER) return false;

  // Check distance from FVG zone
  if (setup.fvgZone) {
    const price = closes[closes.length - 1];
    const fvgMid = (setup.fvgZone.upper + setup.fvgZone.lower) / 2;
    const distPct = ((price - fvgMid) / fvgMid) * 100;
    if (distPct > CHASE.LATE_ENTRY_FVG_DISTANCE_PCT) return true;
  }

  // Check candles since TRIGGER state
  const triggerTransition = setup.transitions.find(
    (t) => t.toState === ICTState.TRIGGER
  );
  if (triggerTransition) {
    const candlesSince = setup.barsProcessed - triggerTransition.barIndex;
    if (candlesSince > CHASE.LATE_ENTRY_CANDLES_SINCE_TRIGGER) return true;
  }

  return false;
}
