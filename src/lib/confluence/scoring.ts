/** Confluence scoring — pure functions, no server deps. */

import type {
  ConfluenceScores,
  ConfluenceSignal,
  ConfluenceWeights,
  ConfluenceThresholds,
} from "./types";

/**
 * Compute weighted confluence score from normalized scanner outputs.
 * Null scores (failed fetch) are treated as 0 for the blend and excluded from passCount.
 */
export function computeConfluenceScore(
  ewNorm: number | null,
  squeezeNorm: number | null,
  prerunNorm: number | null,
  sectorNorm: number | null,
  weights: ConfluenceWeights,
  thresholds: ConfluenceThresholds,
  trending?: boolean,
): ConfluenceScores {
  const ew = ewNorm ?? 0;
  const squeeze = squeezeNorm ?? 0;
  const prerun = prerunNorm ?? 0;
  const sector = sectorNorm ?? 0;

  const totalWeight = weights.ew + weights.squeeze + weights.prerun + weights.sector;
  let confluenceScore = totalWeight > 0
    ? (ew * weights.ew + squeeze * weights.squeeze + prerun * weights.prerun + sector * weights.sector) / totalWeight
    : 0;

  // Trending bonus: 5% boost (capped at 1.0) for stocks improving vs previous scan
  if (trending) {
    confluenceScore = Math.min(1.0, confluenceScore * 1.05);
  }

  let passCount = 0;
  if (ewNorm !== null && ew >= thresholds.ew) passCount++;
  if (squeezeNorm !== null && squeeze >= thresholds.squeeze) passCount++;
  if (prerunNorm !== null && prerun >= thresholds.prerun) passCount++;
  if (sectorNorm !== null && sector >= thresholds.sector) passCount++;

  return {
    ewNormalized: ew,
    squeezeNormalized: squeeze,
    prerunNormalized: prerun,
    sectorNormalized: sector,
    confluenceScore: Math.round(confluenceScore * 1000) / 1000,
    passCount,
  };
}

/**
 * Classify signal strength based on pass count and confluence score.
 */
export function classifySignal(scores: ConfluenceScores): ConfluenceSignal {
  if (scores.passCount >= 4 && scores.confluenceScore >= 0.60) return "strong";
  if (scores.passCount >= 3 && scores.confluenceScore >= 0.45) return "moderate";
  if (scores.passCount >= 2) return "weak";
  return "none";
}

/**
 * Temporal alignment bonus.
 * If 3+ sub-scanner signals are all fresh (< 7 days old), boost score by 10%.
 * @param signalAges - Array of ages in days for each non-null scanner signal
 */
export function computeTemporalBonus(signalAges: number[]): number {
  if (signalAges.length < 3) return 0;
  const freshCount = signalAges.filter((age) => age <= 7).length;
  if (freshCount >= 3) return 0.10; // +10% bonus for fresh alignment
  return 0;
}
