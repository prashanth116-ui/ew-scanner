import type { ScannerMode, EnhancedScoredCandidate, WaveCount, WavePosition } from "./ew-types";

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
 * D5: Check if a wave counter matches the given scanner mode using structured position
 * when available, falling back to string matching.
 */
export function isWavePositionMatch(
  position: string | undefined,
  mode: ScannerMode,
  structuredPosition?: WavePosition | null
): boolean {
  // D5: Prefer structured position matching
  if (structuredPosition && structuredPosition.waveNumber != null) {
    switch (mode) {
      case "wave2":
        return structuredPosition.waveNumber === 2 ||
          (structuredPosition.phase === "correction" && structuredPosition.label === "C") ||
          (structuredPosition.phase === "complete" && structuredPosition.waveNumber === 2);
      case "wave4":
        return structuredPosition.waveNumber === 4 && structuredPosition.phase === "correction";
      case "wave5":
        return structuredPosition.waveNumber === 5 &&
          (structuredPosition.phase === "impulse" || structuredPosition.phase === "complete");
      case "breakout":
        return structuredPosition.waveNumber === 3 ||
          (structuredPosition.waveNumber === 5 && structuredPosition.phase === "complete");
    }
  }

  // Fallback: string-based matching
  if (!position) return false;
  const lower = position.toLowerCase();
  return MODE_WAVE_POSITIONS[mode].some((kw) => lower.includes(kw));
}

/**
 * B1: Check if wave counter found evidence of impulse wave structure.
 * Required for Wave 2 mode — without impulse structure, the bounce is just
 * a mean-reversion bounce, not a valid Wave 2.
 *
 * What qualifies:
 * - A completed 5-wave impulse (has waves 1-5) — either bearish decline or bullish recovery
 * - A developing impulse with W1+W2+W3 (3+ impulse waves) on recovery with decent score
 *   This proves the stock has bounced (W1), pulled back (W2), and advanced past W1 (W3).
 *
 * What does NOT qualify:
 * - A developing count with only W1+W2 — too trivially easy to find. ANY recovering stock
 *   has a bounce (W1) and a pullback (W2). This doesn't distinguish real impulse structure
 *   from a dead cat bounce.
 * - A completed A-B-C correction — corrective patterns aren't impulse structure.
 *   Every mean-reversion bounce gets labeled "A-B-C correction may be complete".
 *
 * Also checks the alternate count — if the primary is A-B-C but the alternate shows
 * impulse structure, that's still useful signal.
 */
function hasCompletedWave1Impulse(wc: WaveCount | undefined): boolean {
  if (!wc) return false;

  if (checkImpulseEvidence(wc)) return true;

  // Also check alternate count — the primary might be corrective but the alternate
  // could show impulse structure
  if (wc.alternateCount && checkImpulseEvidence(wc.alternateCount)) return true;

  return false;
}

/** Check a single WaveCount for impulse evidence. */
function checkImpulseEvidence(wc: WaveCount): boolean {
  // A completed 5-wave impulse (strongest evidence)
  if (wc.waves.some(w => w.label === "5")) return true;

  // A developing impulse with at least W1+W2+W3 on recovery
  // W3 is critical — it proves the stock advanced past W1 peak, not just bounced once
  const hasW1 = wc.waves.some(w => w.label === "1");
  const hasW2 = wc.waves.some(w => w.label === "2");
  const hasW3 = wc.waves.some(w => w.label === "3");
  if (hasW1 && hasW2 && hasW3 && wc.direction === "up" && wc.isValid && wc.score >= 50) {
    return true;
  }

  return false;
}

/**
 * B2: Extract Wave 1 high from wave count for Wave 4 non-overlap validation.
 * Returns the Wave 1 end price, or null if not available.
 */
function getWave1EndPrice(wc: WaveCount | undefined): number | null {
  if (!wc) return null;
  const w1 = wc.waves.find(w => w.label === "1");
  return w1?.price ?? null;
}

/**
 * Apply mode-specific filters to scored candidates.
 * Returns only candidates that pass the mode's criteria,
 * annotated with wavePositionMatch for two-tier sorting.
 *
 * Fixes applied:
 * - B1: Wave 2 mode requires completed Wave 1 impulse
 * - B2: Wave 4 validates Wave 1 non-overlap
 * - B4: Breakout checks volume expansion
 * - B5: wavePositionMatch used as soft filter gate
 * - D1: Dead cat bounce warning (via B1)
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
      // B1: Hard filter — require completed Wave 1 impulse or strong wave score
      filtered = candidates.filter((c) => {
        if (c.trueAth != null) return false;
        if (c.declinePct < 15) return false;
        if (c.recoveryPct < 5) return false;

        // B1: Wave 2 requires evidence of impulse wave structure
        const hasW1 = hasCompletedWave1Impulse(c.waveCount);
        if (hasW1) return true;

        // No impulse structure found — reject.
        // A high wave score from an A-B-C correction doesn't count:
        // corrective patterns (A-B-C) describe the decline, not an impulse cycle.
        // Every mean-reversion bounce gets "A-B-C correction may be complete" —
        // that's not evidence of a new impulse wave starting.
        return false;
      });
      break;

    case "wave4":
      // Shallow pullback: decline 10-40%, strong recovery (above 23.6% retracement)
      // For structural stocks, check decline from trueAth (5-25% = valid Wave 4 of new impulse)
      // B2: Hard reject if price enters Wave 1 territory (EW cardinal rule)
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

        // B2: Wave 4 cannot enter Wave 1 price territory
        const w1Price = getWave1EndPrice(c.waveCount);
        if (w1Price != null) {
          const dir = c.waveCount?.direction;
          if (dir === "up" && c.current < w1Price) return false;
          if (dir === "down" && c.current > w1Price) return false;
        }
        // If no wave count available, allow through (graceful degradation)
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
        // Reject if wave count shows W5 was exceeded — this stock isn't at
        // Wave 5 exhaustion if the labeled W5 wasn't the actual peak
        if (c.waveCount?.violations?.some(v => v.includes("Wave 5 exceeded"))) return false;
        return true;
      });
      // B3: Wave 5 momentum divergence is handled in scoring (bonus points)
      // No additional filter needed here — divergence is a guideline, not a rule
      break;

    case "breakout":
      // Breaking out: high recovery with volume confirmation
      // Accept structural override stocks — they're breaking to new highs
      filtered = candidates.filter((c) => {
        if (c.trueAth != null) return true;
        if (c.recoveryPct < 25) return false;
        return true;
      }).map((c) => {
        // B4: Check volume expansion for breakout confirmation
        const va = c.volumeAnalysis;
        if (va) {
          const recentVol = va.recoveryAvgVol;
          const priorVol = va.declineAvgVol;
          // 30% above average = confirmed breakout
          if (priorVol > 0 && recentVol > 0) {
            const volRatio = recentVol / priorVol;
            if (volRatio < 1.3) {
              // Volume below threshold — reduce confidence but don't reject
              const newTier = c.confidenceTier === "high" ? "probable" as const : c.confidenceTier;
              return { ...c, confidenceTier: newTier };
            }
          }
        }
        return c;
      });
      break;

    default:
      filtered = candidates;
  }

  // Annotate with wave position match using both structured and string-based matching
  return filtered.map((c) => {
    const wpm = isWavePositionMatch(
      c.waveCount?.position,
      mode,
      c.waveCount?.structuredPosition
    );

    // B5: Use wavePositionMatch as soft filter gate
    let updatedCandidate = { ...c, wavePositionMatch: wpm };
    if (!wpm) {
      const waveScore = c.waveCount?.score ?? 0;
      if (waveScore >= 40) {
        // Wave structure developing but doesn't match mode yet — allow with note
        updatedCandidate = updatedCandidate;
      } else if (!c.waveCount || (!c.waveCount.isValid && waveScore < 40)) {
        // No valid wave count AND no match — cap confidence at speculative
        if (updatedCandidate.confidenceTier === "high") {
          updatedCandidate = { ...updatedCandidate, confidenceTier: "probable" as const };
        }
      }
    }

    return updatedCandidate;
  });
}
