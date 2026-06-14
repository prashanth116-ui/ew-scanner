/**
 * Phase 2 Elliott Wave Detector — TypeScript port
 *
 * Ported 1:1 from Python:
 *   strategies/ict/signals/elliott_wave.py (Phase 1 + Phase 2)
 *   strategies/ict/signals/sweep.py (swing detection)
 *
 * Works directly with PriceSeries arrays (timestamps, open, high, low, close, volume).
 * Timeframe-agnostic — works on weekly/daily bars unchanged.
 */

import type { PriceSeries } from "./ew-types";

// =============================================================================
// Data Types
// =============================================================================

export interface P2ZigzagPoint {
  price: number;
  barIndex: number;
  timestamp: number;
  direction: 1 | -1; // +1 = high, -1 = low
  rsi: number | null;
  volume: number | null;
}

export interface P2WavePoints {
  w0: P2ZigzagPoint;
  w1: P2ZigzagPoint;
  w2: P2ZigzagPoint;
  w3: P2ZigzagPoint;
  w4: P2ZigzagPoint;
  w5: P2ZigzagPoint;
}

export interface P2ImpulsePattern {
  direction: 1 | -1; // 1 = bull, -1 = bear
  waves: P2WavePoints;
  scale: number;
  detectedAtBar: number;

  // Enrichment
  confidence: number;
  extendedWave: number; // 1, 3, or 5
  hasAlternation: boolean;
  hasRsiDivergence: boolean;
  hasVolumeConfirmation: boolean;
  w2RetraceRatio: number;
  w4RetraceRatio: number;

  // Validity
  isValid: boolean;
  invalidatedAtBar: number | null;

  // Phase 2: correction
  correction: P2CorrectivePattern | null;
}

export interface P2CorrectionPoints {
  a: P2ZigzagPoint;
  b: P2ZigzagPoint;
  c: P2ZigzagPoint;
}

export interface P2CorrectivePattern {
  points: P2CorrectionPoints;
  correctionType: "zigzag" | "flat";
  direction: 1 | -1; // opposite of impulse direction
  completedAtBar: number;
  bRetraceRatio: number;
  cRetraceRatio: number;
  confidenceBoost: number;
  isValid: boolean;
}

export interface P2FibTarget {
  ratio: number;
  price: number;
  label: string;
}

export interface P2FibTargets {
  levels: P2FibTarget[];
  impulseRange: number;
}

export interface P2ElliottWaveResult {
  patterns: P2ImpulsePattern[];
  zigzags: Map<number, P2ZigzagPoint[]>;
  barsAnalyzed: number;
  scales: number[];
  fibTargets: Map<number, P2FibTargets>;
}

// Convenience getters
export function getValidPatterns(result: P2ElliottWaveResult): P2ImpulsePattern[] {
  return result.patterns.filter((p) => p.isValid);
}

export function getLatestPattern(result: P2ElliottWaveResult): P2ImpulsePattern | null {
  const valid = getValidPatterns(result);
  if (valid.length === 0) return null;
  return valid.reduce((best, p) => (p.detectedAtBar > best.detectedAtBar ? p : best));
}

export function getCorrections(result: P2ElliottWaveResult): P2CorrectivePattern[] {
  return result.patterns
    .filter((p) => p.correction !== null)
    .map((p) => p.correction!);
}

export function waveLength(waves: P2WavePoints, n: 1 | 3 | 5): number {
  switch (n) {
    case 1: return Math.abs(waves.w1.price - waves.w0.price);
    case 3: return Math.abs(waves.w3.price - waves.w2.price);
    case 5: return Math.abs(waves.w5.price - waves.w4.price);
  }
}

// =============================================================================
// Swing Detection (ported from sweep.py)
// =============================================================================

interface SwingPoint {
  price: number;
  barIndex: number;
  timestamp: number;
}

/**
 * Find swing highs: bar whose high is greater than or equal to the highs of
 * `leftBars` bars to its left AND `rightBars` bars to its right.
 * Uses > comparison for neighbors (i.e. neighbor may be equal).
 */
export function findSwingHighs(
  highs: number[],
  timestamps: number[],
  leftBars: number,
  rightBars: number,
): SwingPoint[] {
  const results: SwingPoint[] = [];
  const n = highs.length;
  if (n < leftBars + 1 + rightBars) return results;

  for (let i = leftBars; i < n - rightBars; i++) {
    const candidate = highs[i];
    let isSwing = true;

    // Check left: all must be lower or equal
    for (let j = i - leftBars; j < i; j++) {
      if (highs[j] > candidate) {
        isSwing = false;
        break;
      }
    }
    if (!isSwing) continue;

    // Check right: all must be lower or equal
    for (let j = i + 1; j <= i + rightBars; j++) {
      if (highs[j] > candidate) {
        isSwing = false;
        break;
      }
    }

    if (isSwing) {
      results.push({ price: candidate, barIndex: i, timestamp: timestamps[i] });
    }
  }

  return results;
}

/**
 * Find swing lows: bar whose low is strictly less than the lows of
 * `leftBars` bars to its left AND `rightBars` bars to its right.
 */
export function findSwingLows(
  lows: number[],
  timestamps: number[],
  leftBars: number,
  rightBars: number,
): SwingPoint[] {
  const results: SwingPoint[] = [];
  const n = lows.length;
  if (n < leftBars + 1 + rightBars) return results;

  for (let i = leftBars; i < n - rightBars; i++) {
    const candidate = lows[i];
    let isSwing = true;

    // Check left: all must be higher or equal
    for (let j = i - leftBars; j < i; j++) {
      if (lows[j] < candidate) {
        isSwing = false;
        break;
      }
    }
    if (!isSwing) continue;

    // Check right: all must be higher or equal
    for (let j = i + 1; j <= i + rightBars; j++) {
      if (lows[j] < candidate) {
        isSwing = false;
        break;
      }
    }

    if (isSwing) {
      results.push({ price: candidate, barIndex: i, timestamp: timestamps[i] });
    }
  }

  return results;
}

// =============================================================================
// Indicator Helpers
// =============================================================================

/**
 * Wilder's RSI. Returns array aligned to input.
 * First `period` values are null (insufficient data).
 */
export function computeRsi(
  closes: number[],
  period: number = 14,
): (number | null)[] {
  const n = closes.length;
  const result: (number | null)[] = new Array(n).fill(null);

  if (n <= period) return result;

  // Seed averages from first `period` changes
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) {
    result[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - 100 / (1 + rs);
  }

  // Wilder smoothing
  for (let i = period + 1; i < n; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    }
  }

  return result;
}

/**
 * Simple moving average. First `period - 1` values are null.
 */
export function computeSma(
  values: number[],
  period: number = 20,
): (number | null)[] {
  const n = values.length;
  const result: (number | null)[] = new Array(n).fill(null);

  if (n < period) return result;

  let windowSum = 0;
  for (let i = 0; i < period; i++) windowSum += values[i];
  result[period - 1] = windowSum / period;

  for (let i = period; i < n; i++) {
    windowSum += values[i] - values[i - period];
    result[i] = windowSum / period;
  }

  return result;
}

// =============================================================================
// Zigzag Construction
// =============================================================================

/**
 * Build alternating zigzag at given scale.
 *
 * Uses findSwingHighs/Lows with leftBars=scale, rightBars=1,
 * merges chronologically, then enforces strict alternation
 * (matching Pine's f_zzUpdate high-first logic).
 */
export function buildZigzag(
  series: PriceSeries,
  scale: number,
  rsiValues?: (number | null)[],
): P2ZigzagPoint[] {
  const n = series.close.length;
  if (n < scale + 2) return [];

  const swingHighs = findSwingHighs(series.high, series.timestamps, scale, 1);
  const swingLows = findSwingLows(series.low, series.timestamps, scale, 1);

  // Merge into candidate list
  const candidates: P2ZigzagPoint[] = [];

  for (const sp of swingHighs) {
    candidates.push({
      price: sp.price,
      barIndex: sp.barIndex,
      timestamp: sp.timestamp,
      direction: 1,
      rsi: rsiValues && sp.barIndex < rsiValues.length ? rsiValues[sp.barIndex] : null,
      volume: sp.barIndex < n ? series.volume[sp.barIndex] : null,
    });
  }
  for (const sp of swingLows) {
    candidates.push({
      price: sp.price,
      barIndex: sp.barIndex,
      timestamp: sp.timestamp,
      direction: -1,
      rsi: rsiValues && sp.barIndex < rsiValues.length ? rsiValues[sp.barIndex] : null,
      volume: sp.barIndex < n ? series.volume[sp.barIndex] : null,
    });
  }

  // Sort: by barIndex ascending, then highs (+1) before lows (-1) at same bar
  candidates.sort((a, b) => {
    if (a.barIndex !== b.barIndex) return a.barIndex - b.barIndex;
    return b.direction - a.direction; // +1 before -1
  });

  // Enforce alternation (matches Pine's f_zzUpdate logic)
  const zigzag: P2ZigzagPoint[] = [];
  for (const c of candidates) {
    if (zigzag.length === 0) {
      zigzag.push(c);
      continue;
    }

    const last = zigzag[zigzag.length - 1];
    if (c.direction !== last.direction) {
      // Alternating — accept
      zigzag.push(c);
    } else if (c.direction === 1 && c.price > last.price) {
      // Same direction (high), more extreme — replace
      zigzag[zigzag.length - 1] = c;
    } else if (c.direction === -1 && c.price < last.price) {
      // Same direction (low), more extreme — replace
      zigzag[zigzag.length - 1] = c;
    }
    // else: skip (same direction, not more extreme)
  }

  return zigzag;
}

// =============================================================================
// Impulse Rule Checking
// =============================================================================

/**
 * Check Elliott impulse rules on 6 zigzag points (newest-first: p0..p5).
 *
 * Bullish (p0.direction == +1): W0=p5, W1=p4, W2=p3, W3=p2, W4=p1, W5=p0
 * Bearish (p0.direction == -1): same mapping, mirrored comparisons.
 *
 * Rules:
 *   Rule 1: W2 doesn't retrace beyond W0
 *   Rule 2: W3 is not the shortest of W1/W3/W5
 *   Rule 3: W4 doesn't enter W1 territory
 *   Rule 5: W5 makes a new extreme beyond W3
 *
 * Returns [found, direction].
 */
export function checkImpulseRules(
  p0: P2ZigzagPoint,
  p1: P2ZigzagPoint,
  p2: P2ZigzagPoint,
  p3: P2ZigzagPoint,
  p4: P2ZigzagPoint,
  p5: P2ZigzagPoint,
): [boolean, 1 | -1 | 0] {
  const w0y = p5.price;
  const w1y = p4.price;
  const w2y = p3.price;
  const w3y = p2.price;
  const w4y = p1.price;
  const w5y = p0.price;

  const l1 = Math.abs(w1y - w0y);
  const l3 = Math.abs(w3y - w2y);
  const l5 = Math.abs(w5y - w4y);

  // Rule 2: W3 not shortest (same for bull and bear)
  const r2 = !(l3 < l1 && l3 < l5);

  if (p0.direction === 1) {
    // Bullish
    const r1 = w2y > w0y;
    const r3 = w4y > w1y;
    const r5 = w5y > w3y;
    if (r1 && r2 && r3 && r5) return [true, 1];
  }

  if (p0.direction === -1) {
    // Bearish
    const r1 = w2y < w0y;
    const r3 = w4y < w1y;
    const r5 = w5y < w3y;
    if (r1 && r2 && r3 && r5) return [true, -1];
  }

  return [false, 0];
}

// =============================================================================
// Detailed Impulse Rule Checking (for near-miss detection)
// =============================================================================

export interface P2RuleResults {
  r1: boolean; // W2 doesn't retrace beyond W0
  r2: boolean; // W3 not shortest
  r3: boolean; // W4 doesn't enter W1 territory
  r5: boolean; // W5 makes new extreme beyond W3
  direction: 1 | -1 | 0;
  passCount: number;
}

/**
 * Check Elliott impulse rules individually, returning per-rule pass/fail.
 * Same logic as checkImpulseRules but returns detailed results.
 */
export function checkImpulseRulesDetailed(
  p0: P2ZigzagPoint,
  p1: P2ZigzagPoint,
  p2: P2ZigzagPoint,
  p3: P2ZigzagPoint,
  p4: P2ZigzagPoint,
  p5: P2ZigzagPoint,
): P2RuleResults {
  const w0y = p5.price;
  const w1y = p4.price;
  const w2y = p3.price;
  const w3y = p2.price;
  const w4y = p1.price;
  const w5y = p0.price;

  const l1 = Math.abs(w1y - w0y);
  const l3 = Math.abs(w3y - w2y);
  const l5 = Math.abs(w5y - w4y);

  const r2 = !(l3 < l1 && l3 < l5);

  // Try bullish first
  if (p0.direction === 1) {
    const r1 = w2y > w0y;
    const r3 = w4y > w1y;
    const r5 = w5y > w3y;
    const passCount = [r1, r2, r3, r5].filter(Boolean).length;
    return { r1, r2, r3, r5, direction: 1, passCount };
  }

  if (p0.direction === -1) {
    const r1 = w2y < w0y;
    const r3 = w4y < w1y;
    const r5 = w5y < w3y;
    const passCount = [r1, r2, r3, r5].filter(Boolean).length;
    return { r1, r2, r3, r5, direction: -1, passCount };
  }

  return { r1: false, r2, r3: false, r5: false, direction: 0, passCount: 0 };
}

export interface P2NearMissPattern {
  direction: 1 | -1;
  waves: P2WavePoints;
  scale: number;
  ruleResults: P2RuleResults;
  failingRule: string; // human-readable name of the single failing rule
}

const RULE_NAMES: Record<string, string> = {
  r1: "W2 retraces beyond W0",
  r2: "W3 is shortest wave",
  r3: "W4 overlaps W1",
  r5: "W5 doesn't exceed W3",
};

/**
 * Detect near-miss patterns: zigzag windows where exactly 3 of 4 impulse rules pass.
 */
export function detectNearMisses(
  series: PriceSeries,
  scales?: number[],
): P2NearMissPattern[] {
  const effectiveScales = scales ?? [4, 8, 16];
  const results: P2NearMissPattern[] = [];

  if (series.close.length < 10) return results;

  const rsiValues = computeRsi(series.close, 14);
  const seen = new Set<string>();

  for (const scale of effectiveScales) {
    const zigzag = buildZigzag(series, scale, rsiValues);
    if (zigzag.length < 6) continue;

    for (let i = zigzag.length - 1; i >= 5; i--) {
      const p0 = zigzag[i];
      const p1 = zigzag[i - 1];
      const p2 = zigzag[i - 2];
      const p3 = zigzag[i - 3];
      const p4 = zigzag[i - 4];
      const p5 = zigzag[i - 5];

      const rules = checkImpulseRulesDetailed(p0, p1, p2, p3, p4, p5);
      if (rules.passCount !== 3 || rules.direction === 0) continue;

      const w0 = p5, w1 = p4, w2 = p3, w3 = p2, w4 = p1, w5 = p0;

      const key = `${scale}:${rules.direction}:${w0.barIndex}:${w5.barIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Identify which single rule fails
      const failingKey = !rules.r1 ? "r1" : !rules.r2 ? "r2" : !rules.r3 ? "r3" : "r5";

      results.push({
        direction: rules.direction as 1 | -1,
        waves: { w0, w1, w2, w3, w4, w5 },
        scale,
        ruleResults: rules,
        failingRule: RULE_NAMES[failingKey],
      });
    }
  }

  return results;
}

// =============================================================================
// Enrichment
// =============================================================================

/**
 * Add confidence scoring to an impulse pattern (mutates in-place).
 *
 * Scoring:
 *   Base:                         40
 *   Extended wave is W3:         +15
 *   Alternation (>10% diff):    +10
 *   RSI divergence at W5 vs W3: +10
 *   Volume at W3 > SMA:         +10
 *   W2 retrace 23.6-78.6%:      +5
 *   W4 retrace 23.6-61.8%:      +5
 *   Max:                         95
 */
export function enrichPattern(
  pattern: P2ImpulsePattern,
  volSmaAtW3: number | null,
): void {
  const w = pattern.waves;

  // Extended wave
  const l1 = waveLength(w, 1);
  const l3 = waveLength(w, 3);
  const l5 = waveLength(w, 5);

  if (l3 >= l1 && l3 >= l5) {
    pattern.extendedWave = 3;
  } else if (l5 >= l1) {
    pattern.extendedWave = 5;
  } else {
    pattern.extendedWave = 1;
  }

  // W2 retrace ratio
  const w1Len = l1;
  const w2Retrace = Math.abs(w.w2.price - w.w1.price);
  pattern.w2RetraceRatio = w1Len > 0 ? w2Retrace / w1Len : 0;

  // W4 retrace ratio
  const w3Len = l3;
  const w4Retrace = Math.abs(w.w4.price - w.w3.price);
  pattern.w4RetraceRatio = w3Len > 0 ? w4Retrace / w3Len : 0;

  // Alternation
  pattern.hasAlternation = Math.abs(pattern.w2RetraceRatio - pattern.w4RetraceRatio) > 0.1;

  // RSI divergence at W5 vs W3
  const rsi3 = w.w3.rsi;
  const rsi5 = w.w5.rsi;
  if (rsi3 !== null && rsi5 !== null) {
    if (pattern.direction === 1 && w.w5.price > w.w3.price && rsi5 < rsi3) {
      pattern.hasRsiDivergence = true;
    } else if (pattern.direction === -1 && w.w5.price < w.w3.price && rsi5 > rsi3) {
      pattern.hasRsiDivergence = true;
    }
  }

  // Volume confirmation at W3
  const vol3 = w.w3.volume;
  if (vol3 !== null && volSmaAtW3 !== null && vol3 > volSmaAtW3) {
    pattern.hasVolumeConfirmation = true;
  }

  // Confidence scoring
  let conf = 40;
  if (pattern.extendedWave === 3) conf += 15;
  if (pattern.hasAlternation) conf += 10;
  if (pattern.hasRsiDivergence) conf += 10;
  if (pattern.hasVolumeConfirmation) conf += 10;
  if (pattern.w2RetraceRatio >= 0.236 && pattern.w2RetraceRatio <= 0.786) conf += 5;
  if (pattern.w4RetraceRatio >= 0.236 && pattern.w4RetraceRatio <= 0.618) conf += 5;

  pattern.confidence = Math.min(conf, 95);
}

// =============================================================================
// Invalidation
// =============================================================================

/**
 * Scan bars within the pattern range for Rule 3 violation (W4 enters W1 territory).
 *
 * For bullish: invalidated if any bar's low < W1 price (within W0-W5 range).
 * For bearish: invalidated if any bar's high > W1 price (within W0-W5 range).
 */
export function checkInvalidation(
  pattern: P2ImpulsePattern,
  series: PriceSeries,
): void {
  const w1Price = pattern.waves.w1.price;
  // Only check the W4 region (W3→W5) where Rule 3 violations can occur
  const start = pattern.waves.w3.barIndex;
  const end = pattern.waves.w5.barIndex;

  for (let i = start; i <= end; i++) {
    if (pattern.direction === 1 && series.low[i] < w1Price) {
      pattern.isValid = false;
      pattern.invalidatedAtBar = i;
      return;
    } else if (pattern.direction === -1 && series.high[i] > w1Price) {
      pattern.isValid = false;
      pattern.invalidatedAtBar = i;
      return;
    }
  }
}

// =============================================================================
// ABC Correction Tracking (Phase 2)
// =============================================================================

/**
 * State machine: find A, B, C correction after impulse W5.
 *
 * For a bullish impulse (W5 is a high):
 *   - Wave A: first low pivot after W5
 *   - Wave B: next high pivot after A (retrace back up)
 *   - Wave C: next low pivot after B (continue down)
 *
 * Classification:
 *   - B retrace > 80% of A move -> "flat"
 *   - Otherwise -> "zigzag"
 *
 * Validation:
 *   - |C - W5| / |W5 - W0| < 1.0 (max retrace rule — allows up to 100%)
 */
export function trackAbc(
  impulse: P2ImpulsePattern,
  zigzag: P2ZigzagPoint[],
): P2CorrectivePattern | null {
  const w5 = impulse.waves.w5;
  const w0 = impulse.waves.w0;

  // Correction direction is opposite to impulse
  const corrDir: 1 | -1 = impulse.direction === 1 ? -1 : 1;

  // Direction of Wave A pivot: opposite to W5
  const aDir: 1 | -1 = w5.direction === 1 ? -1 : 1;

  // Scan zigzag points chronologically after W5
  const afterW5 = zigzag.filter((p) => p.barIndex > w5.barIndex);
  if (afterW5.length === 0) return null;

  // Find Wave A: first pivot in aDir
  let waveA: P2ZigzagPoint | null = null;
  for (const p of afterW5) {
    if (p.direction === aDir) {
      waveA = p;
      break;
    }
  }
  if (!waveA) return null;

  // Find Wave B: next pivot opposite to A (same as W5 direction)
  let waveB: P2ZigzagPoint | null = null;
  for (const p of afterW5) {
    if (p.barIndex > waveA.barIndex && p.direction === -aDir) {
      waveB = p;
      break;
    }
  }
  if (!waveB) return null;

  // Find Wave C: next pivot same direction as A
  let waveC: P2ZigzagPoint | null = null;
  for (const p of afterW5) {
    if (p.barIndex > waveB.barIndex && p.direction === aDir) {
      waveC = p;
      break;
    }
  }
  if (!waveC) return null;

  // B retrace ratio: |B - A| / |A - W5|
  const aMove = Math.abs(waveA.price - w5.price);
  const bRetrace = Math.abs(waveB.price - waveA.price);
  const bRetraceRatio = aMove > 0 ? bRetrace / aMove : 0;

  // Classify: flat if B retraces > 80% of A move
  const correctionType: "flat" | "zigzag" = bRetraceRatio > 0.80 ? "flat" : "zigzag";

  // C retrace ratio: |C - W5| / |W5 - W0|
  const impulseRange = Math.abs(w5.price - w0.price);
  const cRetrace = Math.abs(waveC.price - w5.price);
  const cRetraceRatio = impulseRange > 0 ? cRetrace / impulseRange : 0;

  // Validate: max retrace rule (allow up to 100% of impulse)
  if (cRetraceRatio >= 1.0) return null;

  return {
    points: { a: waveA, b: waveB, c: waveC },
    correctionType,
    direction: corrDir,
    completedAtBar: waveC.barIndex,
    bRetraceRatio,
    cRetraceRatio,
    confidenceBoost: 15,
    isValid: true,
  };
}

// =============================================================================
// Fibonacci Targets (Phase 2)
// =============================================================================

const FIB_RATIOS: [number, string][] = [
  [0.236, "23.6%"],
  [0.382, "38.2%"],
  [0.5, "50.0%"],
  [0.618, "61.8%"],
  [0.786, "78.6%"],
  [1.0, "100%"],
  [1.272, "127.2%"],
  [1.618, "161.8%"],
];

/**
 * Compute Fibonacci retracement levels after an impulse.
 *
 * Bullish impulse: targets below W5 (retracement = W5 - range * ratio)
 * Bearish impulse: targets above W5 (retracement = W5 + range * ratio)
 */
export function computeFibTargets(impulse: P2ImpulsePattern): P2FibTargets {
  const w5Price = impulse.waves.w5.price;
  const w0Price = impulse.waves.w0.price;
  const impRange = Math.abs(w5Price - w0Price);

  if (impRange === 0) return { levels: [], impulseRange: 0 };

  const levels: P2FibTarget[] = FIB_RATIOS.map(([ratio, label]) => {
    const price = impulse.direction === 1
      ? w5Price - impRange * ratio
      : w5Price + impRange * ratio;
    return { ratio, price, label };
  });

  return { levels, impulseRange: impRange };
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Detect Elliott Wave impulse patterns at multiple scales.
 *
 * 1. Pre-compute RSI and volume SMA for all bars
 * 2. For each scale: build zigzag, check impulse rules at each 6-point
 *    window, enrich matches, check invalidation
 * 3. Deduplicate by (scale, direction, w0.barIndex, w5.barIndex)
 * 4. Phase 2: track ABC corrections and compute Fibonacci targets
 * 5. Return P2ElliottWaveResult
 */
export function detectElliottWaves(
  series: PriceSeries,
  scales?: number[],
  rsiPeriod: number = 14,
  volSmaPeriod: number = 20,
): P2ElliottWaveResult {
  const effectiveScales = scales ?? [4, 8, 16];

  const result: P2ElliottWaveResult = {
    patterns: [],
    zigzags: new Map(),
    barsAnalyzed: series.close.length,
    scales: [...effectiveScales],
    fibTargets: new Map(),
  };

  if (series.close.length < 10) return result;

  // Pre-compute indicators
  const rsiValues = computeRsi(series.close, rsiPeriod);
  const volSmaValues = computeSma(series.volume, volSmaPeriod);

  const seen = new Set<string>();

  for (const scale of effectiveScales) {
    const zigzag = buildZigzag(series, scale, rsiValues);
    result.zigzags.set(scale, zigzag);

    if (zigzag.length < 6) continue;

    // Walk through zigzag checking 6-point windows (newest-first)
    for (let i = zigzag.length - 1; i >= 5; i--) {
      const p0 = zigzag[i];
      const p1 = zigzag[i - 1];
      const p2 = zigzag[i - 2];
      const p3 = zigzag[i - 3];
      const p4 = zigzag[i - 4];
      const p5 = zigzag[i - 5];

      const [found, direction] = checkImpulseRules(p0, p1, p2, p3, p4, p5);
      if (!found || direction === 0) continue;

      // Map to wave points (p0 newest, p5 oldest)
      const w0 = p5, w1 = p4, w2 = p3, w3 = p2, w4 = p1, w5 = p0;

      // Deduplicate
      const key = `${scale}:${direction}:${w0.barIndex}:${w5.barIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const waves: P2WavePoints = { w0, w1, w2, w3, w4, w5 };
      const pattern: P2ImpulsePattern = {
        direction: direction as 1 | -1,
        waves,
        scale,
        detectedAtBar: w5.barIndex,
        confidence: 0,
        extendedWave: 0,
        hasAlternation: false,
        hasRsiDivergence: false,
        hasVolumeConfirmation: false,
        w2RetraceRatio: 0,
        w4RetraceRatio: 0,
        isValid: true,
        invalidatedAtBar: null,
        correction: null,
      };

      // Enrich
      const volSmaAtW3 = w3.barIndex < volSmaValues.length
        ? volSmaValues[w3.barIndex]
        : null;
      enrichPattern(pattern, volSmaAtW3);

      // Check invalidation
      checkInvalidation(pattern, series);

      result.patterns.push(pattern);
    }
  }

  // Phase 2: track ABC corrections and compute Fibonacci targets
  for (let idx = 0; idx < result.patterns.length; idx++) {
    const pattern = result.patterns[idx];
    if (!pattern.isValid) continue;

    const zigzag = result.zigzags.get(pattern.scale);
    if (!zigzag) continue;

    // Track ABC correction
    const correction = trackAbc(pattern, zigzag);
    if (correction !== null) {
      pattern.correction = correction;
      pattern.confidence = Math.min(pattern.confidence + correction.confidenceBoost, 100);
    }

    // Compute Fibonacci targets
    result.fibTargets.set(idx, computeFibTargets(pattern));
  }

  return result;
}
