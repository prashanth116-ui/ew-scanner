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
 * Keywords for matching wave counter position strings to scanner modes.
 * Matched case-insensitively via includes() against WaveCount.position.
 */
const MODE_WAVE_POSITIONS: Record<ScannerMode, string[]> = {
  wave2: ["wave 2", "wave c", "a-b-c correction may be complete"],
  wave4: ["wave 4"],
  wave5: ["wave 5", "beyond wave 5"],
  breakout: ["wave 3", "post-wave 5"],
};

/**
 * Check if a wave counter position string matches the given scanner mode.
 */
export function isWavePositionMatch(
  position: string | undefined,
  mode: ScannerMode
): boolean {
  if (!position) return false;
  const lower = position.toLowerCase();
  return MODE_WAVE_POSITIONS[mode].some((kw) => lower.includes(kw));
}

/**
 * Apply mode-specific filters to scored candidates.
 * Returns only candidates that pass the mode's criteria,
 * annotated with wavePositionMatch for two-tier sorting.
 */
export function applyModeFilters(
  candidates: EnhancedScoredCandidate[],
  mode: ScannerMode
): EnhancedScoredCandidate[] {
  let filtered: EnhancedScoredCandidate[];

  switch (mode) {
    case "wave2":
      // Classic: significant decline, some recovery, Fib golden zone preferred
      // Reject structural override stocks — stocks at ATH are not Wave 2 bottoms
      filtered = candidates.filter((c) => {
        if (c.trueAth != null) return false;
        if (c.declinePct < 15) return false;
        if (c.recoveryPct < 5) return false;
        return true;
      });
      break;

    case "wave4":
      // Shallow pullback: decline 10-40%, strong recovery (above 23.6% retracement)
      // For structural stocks, check decline from trueAth (5-25% = valid Wave 4 of new impulse)
      filtered = candidates.filter((c) => {
        if (c.trueAth != null) {
          const declineFromAth = c.trueAth > 0
            ? ((c.trueAth - c.current) / c.trueAth) * 100
            : 0;
          return declineFromAth >= 5 && declineFromAth <= 25;
        }
        if (c.declinePct < 10) return false;
        if (c.declinePct > 40) return false;
        const retrace = c.fibAnalysis?.retracementDepth ?? 0;
        if (retrace < 0.236) return false;
        return true;
      });
      break;

    case "wave5":
      // Near ATH: high recovery, looking for divergence
      // Accept structural override stocks — they're near ATH, which fits Wave 5 / exhaustion
      filtered = candidates.filter((c) => {
        if (c.trueAth != null) return true;
        if (c.recoveryPct < 40) return false;
        const retrace = c.fibAnalysis?.retracementDepth ?? 0;
        if (retrace < 0.786) return false;
        return true;
      });
      break;

    case "breakout":
      // Breaking out: high recovery with volume confirmation
      // Accept structural override stocks — they're breaking to new highs
      filtered = candidates.filter((c) => {
        if (c.trueAth != null) return true;
        if (c.recoveryPct < 25) return false;
        return true;
      });
      break;

    default:
      filtered = candidates;
  }

  return filtered.map((c) => ({
    ...c,
    wavePositionMatch: isWavePositionMatch(c.waveCount?.position, mode),
  }));
}
