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
 * series (last 8 bars), find the previous structural correction (>=15% drawdown).
 *
 * Threshold rationale (15%): Weekly bars have wider wicks than daily, so a stock
 * at ATH on daily data may show 10-12% decline on weekly. With only 1-2 post-ATH
 * bars, the wave counter gets 0 swings regardless. Verified across 20 stocks:
 * every stock in the 10-15% zone had <=2 bars and 0 swings — no real wave
 * pattern to overwrite. The 8-bar proximity check already filters out stocks
 * where real corrections have had time to develop structure.
 *
 * Algorithm:
 * 1. Find global minimum low before ATH (the trough that started the rally)
 * 2. Find the highest high before that trough (the peak before the correction)
 * 3. Verify drawdown >= 15%
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
  lowIdx: number,
  athValue: number,
  lowValue: number,
): StructuralReferences | null {
  const barCount = highs.length;
  if (barCount === 0) return null;

  // Only activate when decline is trivial AND ATH is near the end
  const decline = athValue > 0 ? ((athValue - lowValue) / athValue) * 100 : 0;
  if (decline >= 15) return null;
  if (athIdx < barCount - 8) return null;

  // Find global minimum low BEFORE the ATH (the trough that started the rally to ATH)
  let troughIdx = -1;
  let troughPrice = Infinity;
  for (let i = 0; i < athIdx; i++) {
    if (lows[i] < troughPrice) {
      troughPrice = lows[i];
      troughIdx = i;
    }
  }
  if (troughIdx < 0) return null;

  // Find the highest high BEFORE that trough (the peak before the correction)
  let peakIdx = -1;
  let peakPrice = -Infinity;
  for (let i = 0; i < troughIdx; i++) {
    if (highs[i] > peakPrice) {
      peakPrice = highs[i];
      peakIdx = i;
    }
  }
  if (peakIdx < 0) return null;

  // Verify the drawdown from peak to trough is meaningful (>= 15%)
  const drawdown = peakPrice > 0 ? ((peakPrice - troughPrice) / peakPrice) * 100 : 0;
  if (drawdown < 15) return null;

  return { peakIdx, peakPrice, troughIdx, troughPrice };
}
