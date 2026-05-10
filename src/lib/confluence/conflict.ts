/**
 * Negative confluence (conflict) detection.
 * Identifies directional conflicts between sub-scanner signals
 * and applies scoring penalties.
 */

import type { ConfluenceResult } from "./types";

export interface ConflictWarning {
  type: string;
  description: string;
  penalty: number; // Percentage penalty (e.g., 0.10 = -10%)
}

/**
 * Detect directional conflicts in a confluence result.
 * Returns array of conflict warnings with penalties.
 */
export function detectConflicts(result: ConfluenceResult): ConflictWarning[] {
  const conflicts: ConflictWarning[] = [];

  const ewScore = result.ewResult;
  const squeezeScore = result.squeezeResult;
  const prerunResult = result.prerunResult;
  const sectorResult = result.sectorResult;

  // Conflict 1: EW Wave 5/Topping + High squeeze score
  // Wave 5 exhaustion suggests a top, squeeze suggests upside potential
  if (
    ewScore &&
    typeof ewScore === "object" &&
    "wavePosition" in ewScore &&
    typeof ewScore.wavePosition === "string" &&
    (ewScore.wavePosition.toLowerCase().includes("wave 5") ||
      ewScore.wavePosition.toLowerCase().includes("exhaustion") ||
      ewScore.wavePosition.toLowerCase().includes("topping")) &&
    result.scores.squeezeNormalized >= 0.6
  ) {
    conflicts.push({
      type: "exhaustion_vs_squeeze",
      description: "EW exhaustion signal conflicts with squeeze catalyst — potential late-cycle trap",
      penalty: 0.10,
    });
  }

  // Conflict 2: Pre-Run DISCARD + High EW score
  // Fundamental weakness vs technical strength
  if (
    prerunResult &&
    typeof prerunResult === "object" &&
    "verdict" in prerunResult &&
    prerunResult.verdict === "DISCARD" &&
    result.scores.ewNormalized >= 0.6
  ) {
    conflicts.push({
      type: "fundamental_vs_technical",
      description: "Fundamental weakness (Pre-Run DISCARD) conflicts with technical strength",
      penalty: 0.10,
    });
  }

  // Conflict 3: Sector LAGGING/WEAKENING + High EW breakout signal
  if (
    sectorResult &&
    typeof sectorResult === "object" &&
    "quadrant" in sectorResult &&
    (sectorResult.quadrant === "LAGGING" || sectorResult.quadrant === "WEAKENING") &&
    result.scores.ewNormalized >= 0.5
  ) {
    conflicts.push({
      type: "sector_headwind",
      description: "Sector headwind (LAGGING/WEAKENING) conflicts with stock momentum",
      penalty: 0.10,
    });
  }

  return conflicts;
}

/**
 * Apply conflict penalties to confluence score.
 * Each conflict reduces score by its penalty percentage.
 * Score floor at 0.
 */
export function applyConflictPenalty(
  baseScore: number,
  conflicts: ConflictWarning[]
): number {
  if (conflicts.length === 0) return baseScore;

  const totalPenalty = conflicts.reduce((sum, c) => sum + c.penalty, 0);
  return Math.max(0, baseScore * (1 - totalPenalty));
}
