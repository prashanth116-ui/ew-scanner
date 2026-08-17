/**
 * Market Structure Utilities — swing detection, ChoCH, BOS.
 *
 * Pure functions operating on number arrays. Timeframe-agnostic.
 * Used by the Transition scanner to detect structural shifts.
 *
 * SERVER-ONLY: Used by /api/transition/* routes.
 */

import "server-only";

// ── Types ──

export interface SwingPivot {
  index: number;
  value: number;
}

export interface ChoCHResult {
  detected: boolean;
  /** Index of the bar that broke above the most recent swing high after a downtrend */
  breakIndex: number | null;
  /** The swing high price that was broken */
  brokenLevel: number | null;
  /** How many bars ago the break occurred (from end of array) */
  barsAgo: number | null;
  /** True when the latest close is still above the broken level — the break is live, not failed. */
  holding: boolean;
}

export interface BOSResult {
  detected: boolean;
  /** Index of the bar that broke above the prior higher-low's swing high */
  breakIndex: number | null;
  /** The swing high price that was broken */
  brokenLevel: number | null;
  /** How many bars ago the break occurred */
  barsAgo: number | null;
  /** True when the latest close is still above the broken level — the break is live, not failed. */
  holding: boolean;
}

/** Quality of the bar that produced a structural break. */
export interface BreakConfirmation {
  /** True when the break bar showed expansion volume or closed strong in its range. */
  confirmed: boolean;
  /** Break-bar volume / average volume, when both are available. */
  volumeRatio: number | null;
  /** (close - low) / (high - low) on the break bar: 1 = closed on the high. */
  closeLocation: number | null;
}

export interface MarketStructure {
  swingHighs: SwingPivot[];
  swingLows: SwingPivot[];
  choch: ChoCHResult;
  bos: BOSResult;
  higherHighCount: number;
  higherLowCount: number;
  lowerHighCount: number;
  lowerLowCount: number;
  /** Trend bias from swing structure: "bullish" | "bearish" | "neutral" */
  structureBias: "bullish" | "bearish" | "neutral";
}

// ── Swing Detection ──

/**
 * Detect swing highs using N-bar pivot method.
 * A swing high at index i requires highs[i] > all N bars on each side.
 * Uses strict inequality (>) to avoid flat-top ambiguity.
 */
export function findSwingHighs(highs: number[], n = 3): SwingPivot[] {
  const swings: SwingPivot[] = [];
  for (let i = n; i < highs.length - n; i++) {
    let isHigh = true;
    for (let j = 1; j <= n; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) swings.push({ index: i, value: highs[i] });
  }
  return swings;
}

/**
 * Detect swing lows using N-bar pivot method.
 * A swing low at index i requires lows[i] < all N bars on each side.
 */
export function findSwingLows(lows: number[], n = 3): SwingPivot[] {
  const swings: SwingPivot[] = [];
  for (let i = n; i < lows.length - n; i++) {
    let isLow = true;
    for (let j = 1; j <= n; j++) {
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) {
        isLow = false;
        break;
      }
    }
    if (isLow) swings.push({ index: i, value: lows[i] });
  }
  return swings;
}

// ── Higher Highs / Higher Lows counting ──

/**
 * Count consecutive higher highs from recent swing highs (most recent pairs).
 * Returns count of pairs where SH[i] > SH[i-1].
 */
export function countHigherHighs(swingHighs: SwingPivot[]): number {
  if (swingHighs.length < 2) return 0;
  const recent = swingHighs.slice(-4); // last 4 for up to 3 comparisons
  let count = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].value > recent[i - 1].value) count++;
  }
  return count;
}

/**
 * Count consecutive higher lows from recent swing lows (most recent pairs).
 */
export function countHigherLows(swingLows: SwingPivot[]): number {
  if (swingLows.length < 2) return 0;
  const recent = swingLows.slice(-4);
  let count = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].value > recent[i - 1].value) count++;
  }
  return count;
}

/**
 * Count consecutive lower highs from recent swing highs.
 */
export function countLowerHighs(swingHighs: SwingPivot[]): number {
  if (swingHighs.length < 2) return 0;
  const recent = swingHighs.slice(-4);
  let count = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].value < recent[i - 1].value) count++;
  }
  return count;
}

/**
 * Count consecutive lower lows from recent swing lows.
 */
export function countLowerLows(swingLows: SwingPivot[]): number {
  if (swingLows.length < 2) return 0;
  const recent = swingLows.slice(-4);
  let count = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].value < recent[i - 1].value) count++;
  }
  return count;
}

// ── Change of Character (ChoCH) ──

/**
 * Detect bullish Change of Character (ChoCH).
 *
 * ChoCH = price closes above the most recent swing high after a series of
 * lower highs (downtrend). This is the first structural sign that sellers
 * are losing control.
 *
 * Requirements:
 * 1. At least 2 swing highs exist (need prior structure)
 * 2. The prior swing highs showed at least 1 lower high (downtrend)
 * 3. Price (close) breaks above the most recent swing high
 *
 * Non-repainting: only uses confirmed swing pivots (N bars must pass after pivot).
 */
export function detectChoCH(
  highs: number[],
  lows: number[],
  closes: number[],
  n = 3,
): ChoCHResult {
  const noDetection: ChoCHResult = { detected: false, breakIndex: null, brokenLevel: null, barsAgo: null, holding: false };

  const swingHighs = findSwingHighs(highs, n);
  if (swingHighs.length < 2) return noDetection;

  // Check if prior structure shows lower highs (downtrend context)
  // Look at last 3-4 swing highs for downtrend evidence
  const recentSH = swingHighs.slice(-4);
  let hasLowerHigh = false;
  for (let i = 1; i < recentSH.length; i++) {
    if (recentSH[i].value < recentSH[i - 1].value) {
      hasLowerHigh = true;
      break;
    }
  }
  if (!hasLowerHigh) return noDetection;

  // The most recent confirmed swing high is the level to break
  const lastSH = swingHighs[swingHighs.length - 1];

  // Scan bars AFTER the swing high confirmation (index + n) for a close above
  const searchStart = lastSH.index + n + 1;
  for (let i = searchStart; i < closes.length; i++) {
    if (closes[i] > lastSH.value) {
      return {
        detected: true,
        breakIndex: i,
        brokenLevel: lastSH.value,
        barsAgo: closes.length - 1 - i,
        holding: closes[closes.length - 1] > lastSH.value,
      };
    }
  }

  return noDetection;
}

// ── Break of Structure (BOS) ──

/**
 * Detect bullish Break of Structure (BOS).
 *
 * BOS = after a ChoCH has occurred AND a higher low has formed, price
 * breaks above the swing high that preceded that higher low. This confirms
 * the new bullish trend structure.
 *
 * Requirements:
 * 1. At least 2 swing highs and 2 swing lows
 * 2. Most recent swing low is higher than the prior swing low (higher low)
 * 3. Price closes above the swing high that preceded the higher low
 *
 * Non-repainting: only uses confirmed pivots.
 */
export function detectBOS(
  highs: number[],
  lows: number[],
  closes: number[],
  n = 3,
): BOSResult {
  const noDetection: BOSResult = { detected: false, breakIndex: null, brokenLevel: null, barsAgo: null, holding: false };

  const swingHighs = findSwingHighs(highs, n);
  const swingLows = findSwingLows(lows, n);

  if (swingHighs.length < 2 || swingLows.length < 2) return noDetection;

  // Check for higher low (most recent SL > prior SL)
  const lastSL = swingLows[swingLows.length - 1];
  const prevSL = swingLows[swingLows.length - 2];
  if (lastSL.value <= prevSL.value) return noDetection;

  // Find the swing high that preceded the higher low (last SH before lastSL.index)
  let precedingSH: SwingPivot | null = null;
  for (let i = swingHighs.length - 1; i >= 0; i--) {
    if (swingHighs[i].index < lastSL.index) {
      precedingSH = swingHighs[i];
      break;
    }
  }
  if (!precedingSH) return noDetection;

  // Scan bars after the higher low confirmation for a close above the preceding SH
  const searchStart = lastSL.index + n + 1;
  for (let i = searchStart; i < closes.length; i++) {
    if (closes[i] > precedingSH.value) {
      return {
        detected: true,
        breakIndex: i,
        brokenLevel: precedingSH.value,
        barsAgo: closes.length - 1 - i,
        holding: closes[closes.length - 1] > precedingSH.value,
      };
    }
  }

  return noDetection;
}

// ── Composite Market Structure Analysis ──

/**
 * Compute full market structure analysis from OHLC data.
 * Returns swing points, ChoCH/BOS detection, and structural bias.
 */
export function analyzeMarketStructure(
  highs: number[],
  lows: number[],
  closes: number[],
  n = 3,
): MarketStructure {
  const swingHighs = findSwingHighs(highs, n);
  const swingLows = findSwingLows(lows, n);
  const choch = detectChoCH(highs, lows, closes, n);
  const bos = detectBOS(highs, lows, closes, n);
  const higherHighCount = countHigherHighs(swingHighs);
  const higherLowCount = countHigherLows(swingLows);
  const lowerHighCount = countLowerHighs(swingHighs);
  const lowerLowCount = countLowerLows(swingLows);

  // Determine structural bias
  let structureBias: "bullish" | "bearish" | "neutral" = "neutral";
  if (higherHighCount >= 2 && higherLowCount >= 2) {
    structureBias = "bullish";
  } else if (lowerHighCount >= 2 && lowerLowCount >= 2) {
    structureBias = "bearish";
  } else if (bos.detected) {
    structureBias = "bullish"; // BOS confirmed = bullish until proven otherwise
  } else if (choch.detected) {
    structureBias = "bullish"; // ChoCH = early bullish shift
  } else if (higherLowCount >= 1 && higherHighCount >= 1) {
    structureBias = "bullish";
  } else if (lowerHighCount >= 1 && lowerLowCount >= 1) {
    structureBias = "bearish";
  }

  return {
    swingHighs,
    swingLows,
    choch,
    bos,
    higherHighCount,
    higherLowCount,
    lowerHighCount,
    lowerLowCount,
    structureBias,
  };
}

// ── Trigger / Invalidation Levels ──

/**
 * Compute trigger level: the price above which a bullish transition is confirmed.
 *
 * The trigger must be a level price still has to clear, otherwise every detected
 * ChoCH reports as already-triggered — ChoCH is *defined* as a close above the most
 * recent swing high, so using that pivot makes the trigger self-satisfying.
 *
 * Resolution order:
 *   1. Nearest unbroken swing high above current price (the next overhead level).
 *   2. If price has cleared every recent pivot, the highest of those cleared pivots
 *      — the level whose break defines the move, used to confirm rather than to arm.
 *   3. Most recent swing high, when price is unavailable.
 *
 * `barCount` is the length of the source series; pivots older than `lookback` bars
 * are ignored so stale structure does not set the level.
 */
export function computeTriggerLevel(
  swingHighs: SwingPivot[],
  currentPrice: number | null = null,
  barCount = 0,
  lookback = 40,
): number | null {
  if (swingHighs.length === 0) return null;

  const fallback = swingHighs[swingHighs.length - 1].value;
  if (currentPrice === null || currentPrice <= 0) return fallback;

  const minIndex = barCount > 0 ? Math.max(0, barCount - lookback) : 0;
  const recent = swingHighs.filter((s) => s.index >= minIndex);
  if (recent.length === 0) return fallback;

  const overhead = recent.filter((s) => s.value > currentPrice);
  if (overhead.length > 0) {
    return Math.min(...overhead.map((s) => s.value));
  }

  return Math.max(...recent.map((s) => s.value));
}

/**
 * Evaluate the quality of the bar that produced a structural break.
 *
 * A break on expansion volume or with a close in the upper part of the bar's range
 * is a participation signal; a break on quiet volume that closes mid-bar is not.
 * Used to separate TRIGGERED from READY.
 */
export function evaluateBreakConfirmation(
  breakIndex: number | null,
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  avgVolume: number | null,
  volumeMultiple = 1.3,
  closeLocationMin = 0.6,
): BreakConfirmation {
  const none: BreakConfirmation = { confirmed: false, volumeRatio: null, closeLocation: null };
  if (breakIndex === null || breakIndex < 0 || breakIndex >= closes.length) return none;

  let volumeRatio: number | null = null;
  if (avgVolume !== null && avgVolume > 0 && breakIndex < volumes.length) {
    const vol = volumes[breakIndex];
    if (typeof vol === "number" && vol > 0) volumeRatio = vol / avgVolume;
  }

  let closeLocation: number | null = null;
  if (breakIndex < highs.length && breakIndex < lows.length) {
    const hi = highs[breakIndex];
    const lo = lows[breakIndex];
    if (typeof hi === "number" && typeof lo === "number" && hi > lo) {
      closeLocation = (closes[breakIndex] - lo) / (hi - lo);
    }
  }

  const confirmed =
    (volumeRatio !== null && volumeRatio >= volumeMultiple) ||
    (closeLocation !== null && closeLocation >= closeLocationMin);

  return { confirmed, volumeRatio, closeLocation };
}

/**
 * Compute invalidation level: the price below which the bullish thesis fails.
 * Uses the most recent swing low as invalidation.
 */
export function computeInvalidationLevel(swingLows: SwingPivot[]): number | null {
  if (swingLows.length === 0) return null;
  return swingLows[swingLows.length - 1].value;
}
