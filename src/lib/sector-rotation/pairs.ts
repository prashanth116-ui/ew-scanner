/**
 * Pair divergence z-scores for sector rotation.
 * Computes rolling z-scores for XLY/XLP and XLK/XLU ratios.
 * SERVER-ONLY: Uses fetched chart data.
 */

import "server-only";

export interface PairZScore {
  pair: string;
  currentRatio: number;
  mean126d: number;
  stdDev126d: number;
  zScore: number;
  isExtreme: boolean; // |z| > 2.0
  signal: "extreme_risk_on" | "extreme_risk_off" | "normal";
}

/**
 * Compute 126-day rolling z-score for a price ratio pair.
 * @param numCloses - Numerator ETF daily closes (e.g., XLY)
 * @param denCloses - Denominator ETF daily closes (e.g., XLP)
 * @param pairName - Label for the pair (e.g., "XLY/XLP")
 */
export function computePairZScore(
  numCloses: number[],
  denCloses: number[],
  pairName: string
): PairZScore | null {
  const len = Math.min(numCloses.length, denCloses.length);
  if (len < 127) return null;

  // Compute ratio series
  const ratios: number[] = [];
  for (let i = 0; i < len; i++) {
    if (denCloses[i] > 0) {
      ratios.push(numCloses[i] / denCloses[i]);
    }
  }

  if (ratios.length < 127) return null;

  // 126-day rolling stats
  const window = ratios.slice(-126);
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const variance =
    window.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / window.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return null;

  const currentRatio = ratios[ratios.length - 1];
  const zScore = (currentRatio - mean) / stdDev;

  let signal: PairZScore["signal"] = "normal";
  if (zScore > 2.0) signal = "extreme_risk_on";
  else if (zScore < -2.0) signal = "extreme_risk_off";

  return {
    pair: pairName,
    currentRatio: Math.round(currentRatio * 1000) / 1000,
    mean126d: Math.round(mean * 1000) / 1000,
    stdDev126d: Math.round(stdDev * 10000) / 10000,
    zScore: Math.round(zScore * 100) / 100,
    isExtreme: Math.abs(zScore) > 2.0,
    signal,
  };
}
