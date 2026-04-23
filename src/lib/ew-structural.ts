/**
 * Structural reference detection for stocks at or near all-time highs.
 *
 * When the ATH is the most recent bar (or very close), the "decline" from ATH
 * is just intraday/intraweek noise. The wave counter gets 0 swings and returns
 * null, causing the LLM to fabricate analysis.
 *
 * This module finds the previous meaningful correction and returns those
 * reference points so downstream analysis (wave counter, Fibonacci, scoring)
 * gets real structure to work with.
 */

export interface StructuralReferences {
  peakIdx: number;
  peakPrice: number;
  troughIdx: number;
  troughPrice: number;
}

/**
 * When post-ATH decline is trivial (<15%) and ATH is near the end of the
 * series (last 8 bars), find the most recent structural correction (>=15%
 * drawdown) that has enough recovery bars for meaningful wave analysis.
 *
 * Threshold rationale (15%): Weekly bars have wider wicks than daily, so a stock
 * at ATH on daily data may show 10-12% decline on weekly. With only 1-2 post-ATH
 * bars, the wave counter gets 0 swings regardless. Verified across 20 stocks:
 * every stock in the 10-15% zone had <=2 bars and 0 swings — no real wave
 * pattern to overwrite. The 8-bar proximity check already filters out stocks
 * where real corrections have had time to develop structure.
 *
 * Algorithm:
 * 1. Walk forward through bars before ATH, tracking the running peak
 * 2. When drawdown from peak >= 15%, enter "correction" state and track trough
 * 3. When price exceeds the peak that started the correction, save it and reset
 * 4. Pick the most recent correction with >= MIN_RECOVERY_BARS of recovery
 *    (for wave counting quality). Fall back to most recent if none qualifies.
 *
 * Why "most recent" instead of "global minimum": The global minimum picks the
 * oldest/deepest correction (e.g., AMD's 2022 bottom at $54) even when a more
 * recent correction (2025 bottom at $76) defines the current wave cycle. The
 * wave counter needs the current rally's structure, not a 3-year-old bottom.
 *
 * @param highs - array of high prices (clean, no nulls)
 * @param lows - array of low prices (clean, no nulls)
 * @param athIdx - index of the all-time high in the clean array
 * @param lowIdx - index of the post-ATH low in the clean array
 * @param athValue - the ATH price
 * @param lowValue - the post-ATH low price
 */
export function findStructuralReferences(
  highs: number[],
  lows: number[],
  athIdx: number,
  _lowIdx: number,
  athValue: number,
  lowValue: number,
): StructuralReferences | null {
  const barCount = highs.length;
  if (barCount === 0) return null;

  // Only activate when decline is trivial AND ATH is near the end
  const decline = athValue > 0 ? ((athValue - lowValue) / athValue) * 100 : 0;
  if (decline >= 15) return null;
  if (athIdx < barCount - 8) return null;

  // Minimum recovery bars needed for wave counting (15 weekly bars ~ 4 months).
  // The swing detector needs at least 4-5 swings; 15 bars reliably produces that.
  const MIN_RECOVERY_BARS = 15;

  // Track all significant corrections (peak→trough >= 15% drawdown) before ATH
  const corrections: StructuralReferences[] = [];

  let currentPeakIdx = 0;
  let currentPeakPrice = highs[0];
  let inCorrection = false;
  let corrPeakIdx = -1;
  let corrPeakPrice = -Infinity;
  let corrTroughIdx = -1;
  let corrTroughPrice = Infinity;

  for (let i = 1; i < athIdx; i++) {
    if (!inCorrection) {
      // Rallying: track the running peak
      if (highs[i] > currentPeakPrice) {
        currentPeakPrice = highs[i];
        currentPeakIdx = i;
      }
      const dd = currentPeakPrice > 0
        ? ((currentPeakPrice - lows[i]) / currentPeakPrice) * 100
        : 0;
      if (dd >= 15) {
        // Drawdown exceeded threshold — enter correction state
        inCorrection = true;
        corrPeakIdx = currentPeakIdx;
        corrPeakPrice = currentPeakPrice;
        corrTroughIdx = i;
        corrTroughPrice = lows[i];
      }
    } else {
      // In correction: track the deepest trough
      if (lows[i] < corrTroughPrice) {
        corrTroughPrice = lows[i];
        corrTroughIdx = i;
      }
      // Correction ends when price exceeds the peak that started it
      if (highs[i] > corrPeakPrice) {
        corrections.push({
          peakIdx: corrPeakIdx,
          peakPrice: corrPeakPrice,
          troughIdx: corrTroughIdx,
          troughPrice: corrTroughPrice,
        });
        inCorrection = false;
        currentPeakIdx = i;
        currentPeakPrice = highs[i];
      }
    }
  }
  // If still in a correction at scan end (correction ongoing into ATH rally), save it
  if (inCorrection) {
    corrections.push({
      peakIdx: corrPeakIdx,
      peakPrice: corrPeakPrice,
      troughIdx: corrTroughIdx,
      troughPrice: corrTroughPrice,
    });
  }

  if (corrections.length === 0) return null;

  // Pick the most recent correction with enough recovery bars for wave counting.
  // Search backwards (most recent first).
  for (let i = corrections.length - 1; i >= 0; i--) {
    const recoveryBars = athIdx - corrections[i].troughIdx;
    if (recoveryBars >= MIN_RECOVERY_BARS) {
      return corrections[i];
    }
  }

  // Fallback: most recent correction regardless of recovery bars
  return corrections[corrections.length - 1];
}
