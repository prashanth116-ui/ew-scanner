import type { ScannerMode, EnhancedScoredCandidate } from "./ew-types";

export interface ModeConfig {
  key: ScannerMode;
  label: string;
  shortLabel: string;
  description: string;
  defaults: {
    minDecline: number;
    minMonths: number;
    minRecovery: number;
  };
}

export const SCANNER_MODES: ModeConfig[] = [
  {
    key: "wave2",
    label: "Wave 2 Bottom",
    shortLabel: "W2 Bottom",
    description: "Stocks recovering from a major decline — classic Wave 2 bottom setup.",
    defaults: { minDecline: 20, minMonths: 3, minRecovery: 10 },
  },
  {
    key: "wave4",
    label: "Wave 4 Pullback",
    shortLabel: "W4 Pullback",
    description: "Shallow dips in strong uptrends — Wave 4 correction before final push.",
    defaults: { minDecline: 10, minMonths: 1, minRecovery: 5 },
  },
  {
    key: "wave5",
    label: "Wave 5 Exhaustion",
    shortLabel: "W5 Exhaust",
    description: "Near all-time highs with momentum divergence — Wave 5 topping pattern.",
    defaults: { minDecline: 5, minMonths: 1, minRecovery: 50 },
  },
  {
    key: "breakout",
    label: "Breakout",
    shortLabel: "Breakout",
    description: "Breaking above prior highs with volume expansion — new impulse wave.",
    defaults: { minDecline: 10, minMonths: 1, minRecovery: 30 },
  },
];

export function getModeConfig(mode: ScannerMode): ModeConfig {
  return SCANNER_MODES.find((m) => m.key === mode) ?? SCANNER_MODES[0];
}

/**
 * Apply mode-specific filters to scored candidates.
 * Returns only candidates that pass the mode's criteria.
 */
export function applyModeFilters(
  candidates: EnhancedScoredCandidate[],
  mode: ScannerMode
): EnhancedScoredCandidate[] {
  switch (mode) {
    case "wave2":
      // Classic: significant decline, some recovery, Fib golden zone preferred
      return candidates.filter((c) => {
        if (c.declinePct < 15) return false;
        if (c.recoveryPct < 5) return false;
        return true;
      });

    case "wave4":
      // Shallow pullback: decline 10-40%, strong recovery (above 23.6% retracement)
      return candidates.filter((c) => {
        if (c.declinePct < 10) return false;
        if (c.declinePct > 40) return false;
        const retrace = c.fibAnalysis?.retracementDepth ?? 0;
        if (retrace < 0.236) return false;
        return true;
      });

    case "wave5":
      // Near ATH: high recovery, looking for divergence
      return candidates.filter((c) => {
        if (c.recoveryPct < 40) return false;
        const retrace = c.fibAnalysis?.retracementDepth ?? 0;
        if (retrace < 0.786) return false;
        return true;
      });

    case "breakout":
      // Breaking out: high recovery with volume confirmation
      return candidates.filter((c) => {
        if (c.recoveryPct < 25) return false;
        return true;
      });

    default:
      return candidates;
  }
}
