import type { PriceSeries, MomentumAnalysis } from "./ew-types";

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
