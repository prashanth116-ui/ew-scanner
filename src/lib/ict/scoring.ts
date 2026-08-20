/**
 * ICT Quality Score (0-100) from price-action components only.
 * No lagging indicators — purely derived from engine output and raw OHLC.
 *
 * Ten components, budgeted so that progression along the state ladder is a
 * minority of the score. Every component below State is already gated on
 * reaching a state, so a 30-point state ladder was charging twice for the same
 * evidence and made `score` a near-restatement of `state_order` — the two
 * columns the page presents as independent readings.
 */

import { SCORING, CHASE, DISPLACEMENT, RANGE, barBudget, DEFAULT_BAR_BUDGET } from "./config";
import type { Timeframe } from "./config";
import { ICTState } from "./types";
import type { ICTSetup, ICTScore, ICTScoreComponents } from "./types";

/**
 * Compute the quality score for an ICT setup.
 * All components are price-action only — no moving averages or oscillators.
 *
 * `timeframe` selects the bar budgets for coherence and recency: 20 bars is
 * three days of 4h and five months of weekly, so a single constant cannot mean
 * the same thing across the set.
 */
export function scoreICTSetup(
  setup: ICTSetup,
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  timeframe: Timeframe | string = "4h",
): ICTScore {
  const budget = barBudget(timeframe);
  const components = computeComponents(setup, opens, highs, lows, closes, budget);

  const total = Math.min(100, Math.round(
    components.stateScore +
    components.displacementQuality +
    components.fvgQuality +
    components.retracementDepth +
    components.entryQuality +
    components.bslQuality +
    components.compressionQuality +
    components.structureCoherence +
    components.invalidationDistance +
    components.recency
  ));

  const isChasing = detectChasing(setup, opens, highs, lows, closes);
  const isLateEntry = detectLateEntry(setup, closes);

  return { total, components, isChasing, isLateEntry };
}

type BarBudget = typeof DEFAULT_BAR_BUDGET;

function computeComponents(
  setup: ICTSetup,
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  budget: BarBudget,
): ICTScoreComponents {
  return {
    stateScore: scoreState(setup),
    displacementQuality: scoreDisplacement(setup, opens, highs, lows, closes),
    fvgQuality: scoreFVG(setup, closes),
    retracementDepth: scoreRetracement(setup),
    entryQuality: scoreEntryQuality(setup),
    bslQuality: scoreBSL(setup),
    compressionQuality: scoreCompression(setup, highs, lows),
    structureCoherence: scoreCoherence(setup, budget),
    invalidationDistance: scoreInvalidationDistance(setup, closes),
    recency: scoreRecency(setup, budget),
  };
}

// ── Component Scoring Functions ──

/** State Score: linear from state order. */
function scoreState(setup: ICTSetup): number {
  if (setup.currentState === ICTState.NONE) return 0;
  return Math.round((setup.currentState / ICTState.IGNITION) * SCORING.STATE_MAX);
}

/**
 * Displacement Quality: how much the displacement body exceeds prior bodies.
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

  const dispTransition = setup.transitions.find(
    (t) => t.toState === ICTState.BULLISH_DISPLACEMENT
  );
  if (!dispTransition) return 0;

  const i = dispTransition.barIndex;
  if (i < DISPLACEMENT.COMPARISON_BARS || i >= closes.length) return 0;

  const body = Math.abs(closes[i] - opens[i]);
  const range = highs[i] - lows[i];
  if (range <= 0) return 0;

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
  return Math.round(Math.max(0, normalized) * SCORING.DISPLACEMENT_QUALITY_MAX);
}

/**
 * FVG Size Quality: FVG gap as % of price.
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
 * Retracement Depth: how deep into the FVG zone price traded.
 * 50-75% is the goldilocks fill. Shallower or overshoot penalized.
 *
 * This grades the gap only. Where the setup sits in the LEG is scored
 * separately by entry quality — the two are different scales and a setup can
 * be mid-gap while the leg as a whole is in premium.
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
    normalized = Math.max(0, 1 - (depth - optMax) / (1 - optMax));
  }

  return Math.round(normalized * SCORING.RETRACEMENT_DEPTH_MAX);
}

/**
 * Entry Quality: premium/discount position within the dealing range.
 *
 * Full marks inside the OTE band (0.62-0.79 retracement of the raid-low to
 * range-high leg), most of the marks anywhere in discount, and close to
 * nothing in premium. Without this the engine happily armed setups trading at
 * the top of their own leg, which is the entry the framework exists to avoid.
 */
function scoreEntryQuality(setup: ICTSetup): number {
  const range = setup.dealingRange;
  if (!range || setup.currentState < ICTState.SSL_RAID) return 0;

  const r = range.retracement;
  const max = SCORING.ENTRY_QUALITY_MAX;

  if (range.inOTE) return max;

  if (r > RANGE.OTE_MAX) {
    // Below OTE — deep discount. Safe, but the leg may be failing, so it does
    // not earn the premium band's full marks.
    const overshoot = (r - RANGE.OTE_MAX) / (1 - RANGE.OTE_MAX);
    return Math.round(max * (0.85 - 0.35 * Math.min(1, overshoot)));
  }

  if (r >= RANGE.EQUILIBRIUM) {
    // Discount but above OTE: ramp from 0.55 at equilibrium to 1.0 at OTE_MIN.
    const t = (r - RANGE.EQUILIBRIUM) / (RANGE.OTE_MIN - RANGE.EQUILIBRIUM);
    return Math.round(max * (0.55 + 0.45 * Math.min(1, Math.max(0, t))));
  }

  // Premium: decays to zero at the range high.
  const t = r / RANGE.EQUILIBRIUM;
  return Math.round(max * 0.5 * Math.min(1, Math.max(0, t)));
}

/**
 * BSL Cluster Quality: count of clustered highs, discounted if already cleared.
 */
function scoreBSL(setup: ICTSetup): number {
  if (setup.bslLevel === null || setup.currentState < ICTState.BSL_BUILT) return 0;

  const countScore = Math.min(1, (setup.bslClusterCount - 1) / 3);
  const clearedPenalty = setup.bslUnbroken ? 1 : 0.4;
  return Math.round(countScore * clearedPenalty * SCORING.BSL_CLUSTER_QUALITY_MAX);
}

/**
 * Compression Quality: consecutive higher lows + decreasing ranges, measured
 * at the bar the setup reached its current state.
 *
 * Measuring from the end of the series scored a setup that armed twenty bars
 * ago against today's unrelated tail.
 */
function scoreCompression(
  setup: ICTSetup,
  highs: number[],
  lows: number[],
): number {
  if (setup.currentState < ICTState.ARMED) return 0;

  const anchor = setup.stateBarIndex ?? highs.length - 1;
  const end = Math.min(anchor, highs.length - 1);
  let consecutiveHL = 0;
  let contractingRanges = 0;

  for (let i = end; i >= 1; i--) {
    if (lows[i] > lows[i - 1]) {
      consecutiveHL++;
      if (highs[i] - lows[i] < highs[i - 1] - lows[i - 1]) {
        contractingRanges++;
      }
    } else {
      break;
    }
  }

  const hlScore = Math.min(1, consecutiveHL / 4);
  const contractScore = consecutiveHL > 0 ? contractingRanges / consecutiveHL : 0;
  const combined = hlScore * 0.6 + contractScore * 0.4;

  return Math.round(combined * SCORING.COMPRESSION_QUALITY_MAX);
}

/**
 * Structure Coherence: bars from SSL to the current state.
 * Faster progression = more coherent setup. Budgets are per-timeframe.
 */
function scoreCoherence(setup: ICTSetup, budget: BarBudget): number {
  if (setup.sslBarIndex === null || setup.currentState < ICTState.SSL_RAID) return 0;

  const anchor = setup.stateBarIndex ?? setup.barsProcessed - 1;
  const barsElapsed = anchor - setup.sslBarIndex;
  if (barsElapsed < 0) return 0;

  if (barsElapsed <= budget.coherenceIdeal) return SCORING.STRUCTURE_COHERENCE_MAX;
  if (barsElapsed >= budget.coherenceMax) return 0;

  const ratio = 1 - (barsElapsed - budget.coherenceIdeal) / (budget.coherenceMax - budget.coherenceIdeal);
  return Math.round(ratio * SCORING.STRUCTURE_COHERENCE_MAX);
}

/**
 * Recency: how long ago the reported state was actually reached.
 *
 * A state persists until it advances or invalidates, so "Armed" alone says
 * nothing about whether the compression is live or six weeks stale. Without
 * this the two are indistinguishable on a scanner whose entire premise is
 * pre-expansion timing.
 */
function scoreRecency(setup: ICTSetup, budget: BarBudget): number {
  if (setup.currentState === ICTState.NONE || setup.stateBarIndex === null) return 0;

  const barsAgo = Math.max(0, setup.barsProcessed - 1 - setup.stateBarIndex);
  if (barsAgo <= budget.recencyFresh) return SCORING.RECENCY_MAX;
  if (barsAgo >= budget.recencyStale) return 0;

  const ratio = 1 - (barsAgo - budget.recencyFresh) / (budget.recencyStale - budget.recencyFresh);
  return Math.round(ratio * SCORING.RECENCY_MAX);
}

/**
 * Invalidation Distance: % from current price to the protected low.
 *
 * A BAND, not a ramp. The previous version scored monotonically upward — the
 * further the stop, the higher the score — which inverts the framework:
 * precision is the edge, and a 12% stop is more risk for the same objective,
 * not more safety. Below MIN the stop sits inside noise.
 */
function scoreInvalidationDistance(setup: ICTSetup, closes: number[]): number {
  if (setup.protectedLow === null || setup.currentState < ICTState.SSL_RAID) return 0;

  const price = closes[closes.length - 1];
  if (price <= 0) return 0;

  const distPct = ((price - setup.protectedLow) / price) * 100;
  const max = SCORING.INVALIDATION_DISTANCE_MAX;

  if (distPct <= SCORING.INVALIDATION_MIN_PCT) return 0;
  if (distPct >= SCORING.INVALIDATION_MAX_PCT) return 0;

  if (distPct < SCORING.INVALIDATION_IDEAL_MIN) {
    const ratio = (distPct - SCORING.INVALIDATION_MIN_PCT) /
      (SCORING.INVALIDATION_IDEAL_MIN - SCORING.INVALIDATION_MIN_PCT);
    return Math.round(ratio * max);
  }

  if (distPct <= SCORING.INVALIDATION_IDEAL_MAX) return max;

  const ratio = 1 - (distPct - SCORING.INVALIDATION_IDEAL_MAX) /
    (SCORING.INVALIDATION_MAX_PCT - SCORING.INVALIDATION_IDEAL_MAX);
  return Math.round(ratio * max);
}

// ── Chase Risk Detection ──

/**
 * Detect if the current setup is a chase (multiple consecutive expansion
 * candles). Measured at the series end — chasing is a statement about now.
 *
 * Armed from ARMED rather than TRIGGER: a name that has already run five bars
 * into its draw is a chase whether or not CISD has printed, and ARMED is where
 * the decision is actually being made.
 */
function detectChasing(
  setup: ICTSetup,
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
): boolean {
  if (setup.currentState < CHASE.MIN_STATE_FOR_FLAGS) return false;

  const n = closes.length;
  let expansionCount = 0;

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
 * Detect late entry based on distance from FVG, position in the dealing range,
 * and candles since TRIGGER.
 */
function detectLateEntry(setup: ICTSetup, closes: number[]): boolean {
  if (setup.currentState < CHASE.MIN_STATE_FOR_FLAGS) return false;

  // Trading in premium, above the OTE band, is late by construction.
  if (setup.dealingRange && setup.dealingRange.retracement < RANGE.EQUILIBRIUM * 0.5) return true;

  if (setup.fvgZone) {
    const price = closes[closes.length - 1];
    const fvgMid = (setup.fvgZone.upper + setup.fvgZone.lower) / 2;
    const distPct = ((price - fvgMid) / fvgMid) * 100;
    if (distPct > CHASE.LATE_ENTRY_FVG_DISTANCE_PCT) return true;
  }

  const triggerTransition = setup.transitions.find(
    (t) => t.toState === ICTState.TRIGGER
  );
  if (triggerTransition) {
    const candlesSince = setup.barsProcessed - triggerTransition.barIndex;
    if (candlesSince > CHASE.LATE_ENTRY_CANDLES_SINCE_TRIGGER) return true;
  }

  return false;
}
