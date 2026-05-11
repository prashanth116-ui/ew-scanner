import type { PriceSeries, MomentumAnalysis, WaveCount } from "./ew-types";

export interface MomentumOptions {
  /** When set, compute ROC over only the last N bars (first-half vs second-half). */
  recentBars?: number;
}

/**
 * Analyze momentum using rate of change during decline vs recovery.
 * Positive divergence (recovery ROC > decline ROC magnitude) = bullish.
 * Score from -1 (strong bearish) to 1 (strong bullish).
 *
 * When `options.recentBars` is set (e.g., for structural override stocks),
 * computes ROC over the recent window only, avoiding comparison of old
 * correction decline rate to current recovery rate.
 */
export function analyzeMomentum(
  series: PriceSeries,
  athIdx: number,
  lowIdx: number,
  options?: MomentumOptions
): MomentumAnalysis {
  const { close } = series;
  const len = close.length;

  if (len === 0) {
    return { declineRoc: 0, recoveryRoc: 0, divergence: false, score: 0 };
  }

  if (options?.recentBars && options.recentBars > 0) {
    // Recent-window mode: split last N bars into first-half vs second-half ROC
    const startIdx = Math.max(0, len - options.recentBars);
    const recentClose = close.slice(startIdx);
    if (recentClose.length < 4) {
      return { declineRoc: 0, recoveryRoc: 0, divergence: false, score: 0 };
    }
    const mid = Math.floor(recentClose.length / 2);
    const firstStart = recentClose[0];
    const firstEnd = recentClose[mid];
    const secondStart = recentClose[mid];
    const secondEnd = recentClose[recentClose.length - 1];

    const firstRoc = firstStart > 0 ? (firstEnd - firstStart) / firstStart : 0;
    const secondRoc = secondStart > 0 ? (secondEnd - secondStart) / secondStart : 0;

    const firstPerBar = mid > 0 ? firstRoc / mid : 0;
    const secondPerBar = (recentClose.length - mid) > 0 ? secondRoc / (recentClose.length - mid) : 0;

    const divergence = secondPerBar > 0 && Math.abs(firstPerBar) > 0
      ? secondPerBar > Math.abs(firstPerBar) * 0.5
      : false;

    let score = 0;
    if (Number.isFinite(firstPerBar) && Math.abs(firstPerBar) > 0) {
      score = secondPerBar / Math.abs(firstPerBar);
      score = Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : 0;
    } else if (secondPerBar > 0) {
      score = 1;
    }

    return {
      declineRoc: Number.isFinite(firstRoc) ? Math.round(firstRoc * 10000) / 100 : 0,
      recoveryRoc: Number.isFinite(secondRoc) ? Math.round(secondRoc * 10000) / 100 : 0,
      divergence,
      score: Math.round(score * 100) / 100,
    };
  }

  // Standard mode
  if (lowIdx <= athIdx) {
    return { declineRoc: 0, recoveryRoc: 0, divergence: false, score: 0 };
  }

  // Rate of change during decline (negative value expected)
  const declineBars = lowIdx - athIdx;
  const declineRoc =
    declineBars > 0 && close[athIdx] > 0
      ? (close[lowIdx] - close[athIdx]) / close[athIdx]
      : 0;

  // Rate of change during recovery
  const recoveryBars = len - 1 - lowIdx;
  const recoveryRoc =
    recoveryBars > 0 && close[lowIdx] > 0
      ? (close[len - 1] - close[lowIdx]) / close[lowIdx]
      : 0;

  // Normalize by number of bars (per-bar ROC)
  const declinePerBar = declineBars > 0 ? declineRoc / declineBars : 0;
  const recoveryPerBar = recoveryBars > 0 ? recoveryRoc / recoveryBars : 0;

  // Divergence: recovery pace exceeds decline pace
  const divergence =
    recoveryPerBar > 0 && Math.abs(declinePerBar) > 0
      ? recoveryPerBar > Math.abs(declinePerBar) * 0.5
      : false;

  // Score: ratio of recovery momentum to decline momentum, clamped to [-1, 1]
  let score = 0;
  if (Number.isFinite(declinePerBar) && Math.abs(declinePerBar) > 0) {
    score = recoveryPerBar / Math.abs(declinePerBar);
    score = Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : 0;
  } else if (recoveryPerBar > 0) {
    score = 1;
  }

  return {
    declineRoc: Number.isFinite(declineRoc) ? Math.round(declineRoc * 10000) / 100 : 0,
    recoveryRoc: Number.isFinite(recoveryRoc) ? Math.round(recoveryRoc * 10000) / 100 : 0,
    divergence,
    score: Math.round(score * 100) / 100,
  };
}

// ── B3: Wave 5 Momentum Divergence Detection ──

export interface Wave5DivergenceResult {
  /** True if Wave 5 price > Wave 3 price but momentum < Wave 3 momentum. */
  hasDivergence: boolean;
  /** ROC measured around Wave 3 peak region. */
  wave3Roc: number;
  /** ROC measured around Wave 5 / current region. */
  wave5Roc: number;
  /** Bonus score points (0-2) to add to scoring for confirmed divergence. */
  bonusPoints: number;
}

/**
 * Detect momentum divergence between Wave 3 and Wave 5.
 * Classic EW signal: Wave 5 makes new price high but momentum is weaker than Wave 3.
 * Indicates exhaustion and potential trend reversal.
 */
export function detectWave5Divergence(
  series: PriceSeries,
  waveCount: WaveCount | null | undefined
): Wave5DivergenceResult | null {
  if (!waveCount || !waveCount.waves.length) return null;

  const waves = waveCount.waves;
  const close = series.close;
  const w3 = waves.find(w => w.label === "3");
  const w5 = waves.find(w => w.label === "5");
  const w2 = waves.find(w => w.label === "2");
  const w4 = waves.find(w => w.label === "4");

  // Need at least Wave 3 and current price to compare
  if (!w3) return null;

  const dir = waveCount.direction ?? "up";
  const sign = dir === "up" ? 1 : -1;

  // Determine Wave 5 price: use labeled W5 point or current price if in Wave 5
  const w5Price = w5 ? w5.price : close[close.length - 1];
  const w5Idx = w5 ? w5.index : close.length - 1;

  // Wave 5 should exceed Wave 3 price for bearish divergence to be meaningful
  if ((w5Price - w3.price) * sign <= 0) return null;

  // Calculate ROC around Wave 3 peak: use region from W2 end to W3 end
  const w3StartIdx = w2 ? w2.index : Math.max(0, w3.index - 10);
  const w3Bars = w3.index - w3StartIdx;
  const w3StartPrice = close[w3StartIdx];
  const wave3Roc = w3Bars > 0 && w3StartPrice > 0
    ? ((close[w3.index] - w3StartPrice) / w3StartPrice) / w3Bars
    : 0;

  // Calculate ROC around Wave 5 region: from W4 end to W5/current
  const w5StartIdx = w4 ? w4.index : Math.max(0, w5Idx - 10);
  const w5Bars = w5Idx - w5StartIdx;
  const w5StartPrice = close[w5StartIdx];
  const wave5Roc = w5Bars > 0 && w5StartPrice > 0
    ? ((close[w5Idx] - w5StartPrice) / w5StartPrice) / w5Bars
    : 0;

  // Divergence: price higher but momentum (per-bar ROC) lower
  const hasDivergence = Math.abs(wave3Roc) > 0 && Math.abs(wave5Roc) < Math.abs(wave3Roc) * 0.8;

  // Bonus scoring: 0-2 points for divergence strength
  let bonusPoints = 0;
  if (hasDivergence) {
    bonusPoints = 1;
    // Strong divergence: W5 momentum < 50% of W3 momentum
    if (Math.abs(wave5Roc) < Math.abs(wave3Roc) * 0.5) bonusPoints = 2;
  }

  return {
    hasDivergence,
    wave3Roc: Math.round(wave3Roc * 10000) / 100,
    wave5Roc: Math.round(wave5Roc * 10000) / 100,
    bonusPoints,
  };
}
