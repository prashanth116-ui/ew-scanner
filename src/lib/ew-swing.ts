import type { PriceSeries, SwingPoint, StructureAnalysis } from "./ew-types";

/**
 * Detect swing highs and lows using N-bar pivot method.
 * A swing high at index i requires high[i] > high[i-n..i-1] and high[i] > high[i+1..i+n].
 * Same logic inverted for swing lows.
 */
export function detectSwings(
  series: PriceSeries,
  n: number = 3
): SwingPoint[] {
  const { high, low, timestamps } = series;
  const len = high.length;
  const swings: SwingPoint[] = [];

  for (let i = n; i < len - n; i++) {
    // Check swing high
    let isSwingHigh = true;
    for (let j = 1; j <= n; j++) {
      if (high[i] <= high[i - j] || high[i] <= high[i + j]) {
        isSwingHigh = false;
        break;
      }
    }
    if (isSwingHigh) {
      swings.push({
        index: i,
        price: high[i],
        type: "high",
        timestamp: timestamps[i],
      });
    }

    // Check swing low
    let isSwingLow = true;
    for (let j = 1; j <= n; j++) {
      if (low[i] >= low[i - j] || low[i] >= low[i + j]) {
        isSwingLow = false;
        break;
      }
    }
    if (isSwingLow) {
      swings.push({
        index: i,
        price: low[i],
        type: "low",
        timestamp: timestamps[i],
      });
    }
  }

  return swings.sort((a, b) => a.index - b.index);
}

/**
 * Count swing pivots between two indices (inclusive).
 */
export function countPivotsBetween(
  swings: SwingPoint[],
  startIdx: number,
  endIdx: number
): number {
  return swings.filter((s) => s.index >= startIdx && s.index <= endIdx).length;
}

/**
 * Classify decline structure based on swing pattern between ATH and Low.
 * 5+ alternating pivots = impulsive (5-wave decline)
 * 3 major pivots = corrective (A-B-C)
 * Otherwise unclear
 */
export function classifyStructure(
  series: PriceSeries,
  athIdx: number,
  lowIdx: number
): StructureAnalysis {
  const swings = detectSwings(series, 3);
  const declineSwings = swings.filter(
    (s) => s.index >= athIdx && s.index <= lowIdx
  );

  const swingCount = declineSwings.length;

  let classification: StructureAnalysis["classification"] = "unclear";
  if (swingCount >= 5) {
    // Check for alternating pattern (high-low-high-low...)
    let alternating = true;
    for (let i = 1; i < declineSwings.length; i++) {
      if (declineSwings[i].type === declineSwings[i - 1].type) {
        alternating = false;
        break;
      }
    }
    classification = alternating ? "impulsive" : "corrective";
  } else if (swingCount >= 3) {
    classification = "corrective";
  }

  return {
    swingCount,
    classification,
    swings: declineSwings,
  };
}
