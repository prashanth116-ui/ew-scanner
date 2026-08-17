/**
 * Change in State of Delivery (CISD) detection.
 *
 * Tracks the most recent bearish candle's open as the delivery threshold.
 * A bullish CISD occurs when a bullish candle closes above that threshold.
 *
 * Module structured for swappability — alternative CISD definitions
 * can be plugged in by exporting a function with the same signature.
 */

import type { CISDResult } from "./types";

/**
 * Detect bullish CISD at bar index `i`.
 *
 * Scans backward from `i-1` to find the most recent bearish candle
 * (close < open), then checks if bar `i` is bullish and closes above
 * that bearish candle's open.
 */
export function detectBullishCISD(
  opens: number[],
  closes: number[],
  i: number,
): CISDResult {
  // Find most recent bearish candle before current bar
  let bearishOpen: number | null = null;
  let bearishBarIndex: number | null = null;

  for (let j = i - 1; j >= 0; j--) {
    if (closes[j] < opens[j]) {
      bearishOpen = opens[j];
      bearishBarIndex = j;
      break;
    }
  }

  if (bearishOpen === null) {
    return { triggered: false, bearishOpen: null, bearishBarIndex: null };
  }

  // Bullish CISD: current bar is bullish AND closes above bearish delivery threshold
  const isBullish = closes[i] > opens[i];
  const closesAboveThreshold = closes[i] > bearishOpen;

  return {
    triggered: isBullish && closesAboveThreshold,
    bearishOpen,
    bearishBarIndex,
  };
}
