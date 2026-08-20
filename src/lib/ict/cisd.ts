/**
 * Change in State of Delivery (CISD) detection.
 *
 * The delivery threshold is the open of the FIRST candle of the most recent
 * contiguous bearish run — the candle that started the down leg. A bullish
 * CISD occurs when a bullish candle closes above that open, i.e. the entire
 * leg of bearish delivery has been undone in one move.
 *
 * The earlier implementation used the open of the most recent SINGLE bearish
 * candle. In any choppy advance that threshold sits one bar behind price, so
 * essentially the next green candle after ARMED cleared it and TRIGGER fired
 * almost unconditionally. TRIGGER gates the chase/late flags and the default
 * backtest cohort, so a permissive definition contaminated all three.
 *
 * Module structured for swappability — alternative CISD definitions can be
 * plugged in by exporting a function with the same signature.
 */

import type { CISDResult } from "./types";

const NO_CISD: CISDResult = {
  triggered: false,
  bearishOpen: null,
  bearishBarIndex: null,
  runLength: 0,
};

/**
 * Detect bullish CISD at bar index `i`.
 *
 * Walks back from `i-1` to the most recent bearish candle (close < open), then
 * extends backwards through every contiguous bearish candle to find the start
 * of the delivery leg. Bar `i` triggers when it is bullish and closes above
 * that leg-opening candle's open.
 */
export function detectBullishCISD(
  opens: number[],
  closes: number[],
  i: number,
): CISDResult {
  if (i <= 0) return NO_CISD;

  const isBearish = (j: number) => closes[j] < opens[j];

  // Most recent bearish candle before the current bar.
  let last = -1;
  for (let j = i - 1; j >= 0; j--) {
    if (isBearish(j)) {
      last = j;
      break;
    }
  }
  if (last < 0) return NO_CISD;

  // Extend backwards to the first candle of that contiguous bearish run.
  let first = last;
  while (first - 1 >= 0 && isBearish(first - 1)) first--;

  const bearishOpen = opens[first];
  const runLength = last - first + 1;

  const isBullish = closes[i] > opens[i];
  const closesAboveThreshold = closes[i] > bearishOpen;

  return {
    triggered: isBullish && closesAboveThreshold,
    bearishOpen,
    bearishBarIndex: first,
    runLength,
  };
}
