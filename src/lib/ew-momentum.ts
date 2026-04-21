import type { PriceSeries, MomentumAnalysis } from "./ew-types";

/**
 * Analyze momentum using rate of change during decline vs recovery.
 * Positive divergence (recovery ROC > decline ROC magnitude) = bullish.
 * Score from -1 (strong bearish) to 1 (strong bullish).
 */
export function analyzeMomentum(
  series: PriceSeries,
  athIdx: number,
  lowIdx: number
): MomentumAnalysis {
  const { close } = series;
  const len = close.length;

  if (lowIdx <= athIdx || len === 0) {
    return { declineRoc: 0, recoveryRoc: 0, divergence: false, score: 0 };
  }

  // Rate of change during decline (negative value expected)
  const declineBars = lowIdx - athIdx;
  const declineRoc =
    declineBars > 0 ? (close[lowIdx] - close[athIdx]) / close[athIdx] : 0;

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
  if (Math.abs(declinePerBar) > 0) {
    score = recoveryPerBar / Math.abs(declinePerBar);
    score = Math.max(-1, Math.min(1, score));
  } else if (recoveryPerBar > 0) {
    score = 1;
  }

  return {
    declineRoc: Math.round(declineRoc * 10000) / 100, // as percentage
    recoveryRoc: Math.round(recoveryRoc * 10000) / 100,
    divergence,
    score: Math.round(score * 100) / 100,
  };
}
