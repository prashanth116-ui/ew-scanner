import type { EnhancedScoredCandidate } from "./types";
import { getWaveStatusInfo } from "./wave-counter";

export interface ReliabilityBreakdown {
  macroQuality: number;
  microQuality: number;
  waveValidity: number;
  crossFramework: number;
  targetAvailability: number;
  structuralPenalty: number;
}

export interface ReliabilityResult {
  score: number; // 0-100
  label: "High" | "Medium" | "Low";
  breakdown: ReliabilityBreakdown;
}

/**
 * Compute an objective reliability score (0-100) from algorithmic factors.
 * Pure computation — no API calls. Separate from LLM confidence.
 */
export function computeReliabilityScore(
  candidate: EnhancedScoredCandidate,
): ReliabilityResult {
  const breakdown: ReliabilityBreakdown = {
    macroQuality: 0,
    microQuality: 0,
    waveValidity: 0,
    crossFramework: 0,
    targetAvailability: 0,
    structuralPenalty: 0,
  };

  const macroWc = candidate.waveCount;
  const microWc = candidate.dailyWaveCount;

  // 1. Macro wave quality (0-25): linear scale from waveCount.score (0-100)
  if (macroWc) {
    breakdown.macroQuality = Math.round((macroWc.score / 100) * 25 * 10) / 10;
  }

  // 2. Micro wave quality (0-15): linear scale from dailyWaveCount.score (0-100)
  if (microWc) {
    breakdown.microQuality = Math.round((microWc.score / 100) * 15 * 10) / 10;
  }

  // 3. Wave validity (0-15): 7.5 each for macro + micro isValid
  if (macroWc?.isValid) breakdown.waveValidity += 7.5;
  if (microWc?.isValid) breakdown.waveValidity += 7.5;

  // 4. Cross-framework agreement (0-20)
  if (macroWc && microWc) {
    const macroStatus = getWaveStatusInfo(macroWc, candidate.current);
    const microStatus = getWaveStatusInfo(microWc, candidate.current);

    // 10 pts for direction match
    if (macroStatus.direction === microStatus.direction) {
      breakdown.crossFramework += 10;
    }

    // 10 pts for target convergence (both have targets pointing same way)
    const macroTargets = macroStatus.targets;
    const microTargets = microStatus.targets;
    if (macroTargets.length > 0 && microTargets.length > 0) {
      const macroAbove = macroTargets.some((t) => t.price > candidate.current);
      const microAbove = microTargets.some((t) => t.price > candidate.current);
      const macroBelow = macroTargets.some((t) => t.price < candidate.current);
      const microBelow = microTargets.some((t) => t.price < candidate.current);

      if ((macroAbove && microAbove) || (macroBelow && microBelow)) {
        breakdown.crossFramework += 10;
      }
    }
  }

  // 5. Target availability (0-15): 5 per framework with targets
  if (macroWc) {
    const macroStatus = getWaveStatusInfo(macroWc, candidate.current);
    if (macroStatus.targets.length > 0) breakdown.targetAvailability += 5;

    // Alternate count targets
    if (macroWc.alternateCount) {
      const altStatus = getWaveStatusInfo(macroWc.alternateCount, candidate.current);
      if (altStatus.targets.length > 0) breakdown.targetAvailability += 5;
    }
  }
  if (microWc) {
    const microStatus = getWaveStatusInfo(microWc, candidate.current);
    if (microStatus.targets.length > 0) breakdown.targetAvailability += 5;
  }

  // 6. Structural override penalty (-20) + stale targets penalty (-10)
  if (candidate.trueAth != null) {
    breakdown.structuralPenalty = -20;

    // Additional penalty when all wave targets are below current price (stale targets)
    if (macroWc) {
      const macroStatus = getWaveStatusInfo(macroWc, candidate.current);
      if (macroStatus.targets.length > 0 && macroStatus.targets.every(t => t.price < candidate.current)) {
        breakdown.structuralPenalty -= 10;
      }
    }
  }

  const raw =
    breakdown.macroQuality +
    breakdown.microQuality +
    breakdown.waveValidity +
    breakdown.crossFramework +
    breakdown.targetAvailability +
    breakdown.structuralPenalty;

  const score = Math.max(0, Math.min(100, Math.round(raw)));

  // Cap structural override stocks at "Medium" — never "High"
  let label: ReliabilityResult["label"] =
    score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";
  if (candidate.trueAth != null && label === "High") {
    label = "Medium";
  }

  return { score, label, breakdown };
}
