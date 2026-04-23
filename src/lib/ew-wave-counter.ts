import type { SwingPoint, WavePoint, WaveCount, WaveDegree, WaveLabel, MTFConfirmation } from "./ew-types";
import { detectSwings } from "./ew-swing";
import type { PriceSeries } from "./ew-types";

// Fibonacci ratios for scoring wave proportions
const IMPULSE_W2_RATIOS = [0.382, 0.5, 0.618]; // Ideal Wave 2 retracement of Wave 1
const DEVELOPING_W2_RATIOS = [0.382, 0.5, 0.618, 0.786]; // Broader for developing counts (deep retraces valid)
const IMPULSE_W3_EXTENSIONS = [1.618, 2.0, 2.618]; // Wave 3 extension of Wave 1
const IMPULSE_W4_RATIOS = [0.236, 0.382, 0.5]; // Wave 4 retracement of Wave 3
const CORRECTION_B_RATIOS = [0.382, 0.5, 0.618, 0.786]; // Wave B retracement of Wave A

/**
 * Main entry: count waves from price series data.
 * Detects swings, then tries impulse (5-wave) and corrective (A-B-C) patterns.
 */
export function countWaves(
  series: PriceSeries,
  athIdx: number,
  lowIdx: number,
  degree: WaveDegree = "primary"
): WaveCount | null {
  const swings = detectSwings(series, 3);
  if (swings.length < 4) return null;

  // Try impulse count on the decline (ATH to Low) — bearish impulse
  const declineSwings = swings.filter((s) => s.index >= athIdx && s.index <= lowIdx);

  // Try impulse count on recovery (Low to current) — bullish impulse
  const recoverySwings = swings.filter((s) => s.index >= lowIdx);

  // Try both and pick the better one, or combine
  const declineImpulse = countImpulseWaves(declineSwings, series.close, "down", degree);
  const recoveryImpulse = countImpulseWaves(recoverySwings, series.close, "up", degree);
  const correction = countCorrectiveWaves(recoverySwings, series.close, "up", degree);
  // Also try corrective pattern on the decline (A-B-C correction of prior uptrend)
  const declineCorrection = countCorrectiveWaves(declineSwings, series.close, "up", degree);
  // Try developing wave counts (3-5 alternating points, not enough for full impulse)
  const developingRecovery = countDevelopingWaves(recoverySwings, series.close, "up", degree);
  const developingDecline = countDevelopingWaves(declineSwings, series.close, "down", degree);

  // Partition candidates into recovery-based (forward-looking) and decline-based (historical)
  const recoveryCandidates = [recoveryImpulse, correction, developingRecovery].filter(
    (c): c is WaveCount => c !== null
  );
  const declineCandidates = [declineImpulse, declineCorrection, developingDecline].filter(
    (c): c is WaveCount => c !== null
  );

  const allCandidates = [...recoveryCandidates, ...declineCandidates];
  if (allCandidates.length === 0) return null;

  const sortByQuality = (a: WaveCount, b: WaveCount) => {
    if (a.isValid !== b.isValid) return a.isValid ? -1 : 1;
    return b.score - a.score;
  };

  // When stock is in active recovery (>10% above low), prefer recovery-based counts.
  // Recovery counts describe where we're going; decline counts describe where we've been.
  const lastPrice = series.close[series.close.length - 1];
  const lowPrice = series.low[lowIdx];
  const isRecovering = lastPrice > lowPrice * 1.1 && lowIdx > athIdx;

  let best: WaveCount;
  if (isRecovering && recoveryCandidates.length > 0) {
    recoveryCandidates.sort(sortByQuality);
    best = recoveryCandidates[0];
    const alternates = [...recoveryCandidates.slice(1), ...declineCandidates];
    alternates.sort(sortByQuality);
    if (alternates.length > 0) best.alternateCount = alternates[0];
  } else if (isRecovering) {
    // Recovering but no recovery candidates — exclude developingDecline
    // (bearish developing with downside targets is misleading for a bouncing stock)
    const completedDecline = [declineImpulse, declineCorrection].filter(
      (c): c is WaveCount => c !== null
    );
    if (completedDecline.length > 0) {
      completedDecline.sort(sortByQuality);
      best = completedDecline[0];
      if (completedDecline.length > 1) best.alternateCount = completedDecline[1];
    } else {
      // Nothing useful — return null rather than a misleading bearish developing count
      return null;
    }
  } else {
    allCandidates.sort(sortByQuality);
    best = allCandidates[0];
    if (allCandidates.length > 1) best.alternateCount = allCandidates[1];
  }

  return best;
}

/**
 * Find best 5-wave impulse pattern from swing points.
 * Direction "up" = bullish impulse (1 up, 2 down, 3 up, 4 down, 5 up).
 * Direction "down" = bearish impulse (1 down, 2 up, 3 down, 4 up, 5 down).
 */
export function countImpulseWaves(
  swings: SwingPoint[],
  closes: number[],
  direction: "up" | "down",
  degree: WaveDegree
): WaveCount | null {
  if (swings.length < 5) return null;

  // We need alternating high/low pivots for impulse waves.
  // For bullish: start low(1-start), high(1-end/W1), low(W2), high(W3), low(W4), high(W5)
  // For bearish: start high(1-start), low(1-end/W1), high(W2), low(W3), high(W4), low(W5)

  const startType = direction === "up" ? "low" : "high";
  const endType = direction === "up" ? "high" : "low";

  // Get alternating sequence starting with startType
  const alternating = buildAlternatingSequence(swings, startType);
  if (alternating.length < 6) return null; // Need at least 6 points for 5 waves

  let bestCount: WaveCount | null = null;
  let bestScore = -1;
  let bestIsValid = false;

  // Try all valid 6-point subsequences (W0=start, W1-end, W2-end, W3-end, W4-end, W5-end)
  const limit = Math.min(alternating.length, 20); // Cap to avoid combinatorial explosion
  for (let i = 0; i <= limit - 6; i++) {
    for (let j = i + 5; j < limit; j++) {
      // Pick 6 evenly-spaced or consecutive points
      const pts = pickSixPoints(alternating, i, j);
      if (!pts) continue;

      const [p0, p1, p2, p3, p4, p5] = pts;

      // Enforce correct swing types — bullish impulse needs L,H,L,H,L,H
      if (p0.type !== startType) continue;

      const { isValid, violations } = validateImpulse(p0, p1, p2, p3, p4, p5, direction);
      const score = scoreImpulse(p0, p1, p2, p3, p4, p5, direction);

      // Prefer valid counts: valid always beats invalid, then highest score
      const dominated = bestIsValid && !isValid;
      const dominates = isValid && !bestIsValid;
      if (dominates || (!dominated && score > bestScore)) {
        bestScore = score;
        bestIsValid = isValid;
        const labels: WaveLabel[] = ["1", "2", "3", "4", "5"];
        const waves: WavePoint[] = [p1, p2, p3, p4, p5].map((p, idx) => ({
          ...p,
          label: labels[idx],
          degree,
          confidence: isValid ? Math.min(score / 100, 1) : Math.min(score / 100, 0.5),
        }));

        bestCount = {
          waves,
          waveStart: p0,
          degree,
          isValid,
          violations,
          score,
          position: getImpulsePosition(p0, p1, p2, p3, p4, p5, closes, direction),
        };
      }
    }
  }

  return bestCount;
}

/**
 * Find A-B-C corrective pattern from swing points.
 */
export function countCorrectiveWaves(
  swings: SwingPoint[],
  closes: number[],
  direction: "up" | "down",
  degree: WaveDegree
): WaveCount | null {
  if (swings.length < 3) return null;

  // For correction after bullish move: A down, B up, C down
  // For correction after bearish move: A up, B down, C up
  const startType = direction === "up" ? "high" : "low";
  const alternating = buildAlternatingSequence(swings, startType);
  if (alternating.length < 4) return null; // Need start + A + B + C

  let bestCount: WaveCount | null = null;
  let bestScore = -1;

  const limit = Math.min(alternating.length, 15);

  // Helper to build a WaveCount from A-B-C points
  const buildResult = (p0: SwingPoint, pA: SwingPoint, pB: SwingPoint, pC: SwingPoint, score: number): void => {
    // Structural preference: patterns starting from the first swing (ATH or major pivot)
    // are more analytically meaningful than small sub-corrections from intermediate swings
    if (p0 === alternating[0]) score = Math.min(100, score + 5);
    if (score <= bestScore) return;
    bestScore = score;
    const { isValid, violations } = validateCorrection(p0, pA, pB, pC, direction);
    const labels: WaveLabel[] = ["A", "B", "C"];
    const waves: WavePoint[] = [pA, pB, pC].map((p, idx) => ({
      ...p,
      label: labels[idx],
      degree,
      confidence: isValid ? Math.min(score / 100, 1) : Math.min(score / 100, 0.5),
    }));

    const lastPrice = closes[closes.length - 1];
    let position = "Corrective structure";
    if (direction === "up") {
      if (lastPrice < pC.price) position = "Beyond Wave C — correction may be extending";
      else if (lastPrice < pB.price) position = "In Wave C decline";
      else position = "A-B-C correction may be complete";
    } else {
      if (lastPrice > pC.price) position = "Beyond Wave C — correction may be extending";
      else if (lastPrice > pB.price) position = "In Wave C rally";
      else position = "A-B-C correction may be complete";
    }

    bestCount = { waves, waveStart: p0, degree, isValid, violations, score, position };
  };

  // Pass 1: Consecutive 4-point windows (fast, finds local patterns)
  for (let i = 0; i <= limit - 4; i++) {
    const p0 = alternating[i];
    if (p0.type !== startType) continue;
    const pA = alternating[i + 1];
    const pB = alternating[i + 2];
    const pC = alternating[i + 3];
    const score = scoreCorrection(p0, pA, pB, pC, direction);
    buildResult(p0, pA, pB, pC, score);
  }

  // Pass 2: Wide search — find structural A-B-C using extreme points.
  // For each starting point and each Wave A candidate, find the most extreme
  // B (highest bounce for uptrend correction) and most extreme C after B.
  // This catches wider patterns the consecutive search misses (e.g., META:
  // ATH→$581→$744→$520 spans non-consecutive alternating points).
  for (let i = 0; i < limit; i++) {
    const p0 = alternating[i];
    if (p0.type !== startType) continue;

    for (let a = i + 1; a < limit; a++) {
      const pA = alternating[a];
      if (pA.type === startType) continue; // A must be opposite type

      // Find most extreme B after A
      let bestBPoint: SwingPoint | null = null;
      let bestBIdx = -1;
      for (let b = a + 1; b < limit; b++) {
        if (alternating[b].type !== startType) continue;
        if (
          !bestBPoint ||
          (direction === "up" && alternating[b].price > bestBPoint.price) ||
          (direction === "down" && alternating[b].price < bestBPoint.price)
        ) {
          bestBPoint = alternating[b];
          bestBIdx = b;
        }
      }
      if (!bestBPoint || bestBIdx < 0) continue;

      // Find most extreme C after B
      let bestCPoint: SwingPoint | null = null;
      for (let c = bestBIdx + 1; c < limit; c++) {
        if (alternating[c].type === startType) continue;
        if (
          !bestCPoint ||
          (direction === "up" && alternating[c].price < bestCPoint.price) ||
          (direction === "down" && alternating[c].price > bestCPoint.price)
        ) {
          bestCPoint = alternating[c];
        }
      }
      if (!bestCPoint) continue;

      const score = scoreCorrection(p0, pA, bestBPoint, bestCPoint, direction);
      buildResult(p0, pA, bestBPoint, bestCPoint, score);
    }
  }

  return bestCount;
}

/**
 * Count developing impulse waves from incomplete patterns (3-5 alternating points).
 * Handles early-stage patterns where W3/W4/W5 haven't completed yet.
 * For example: ENPH recovery has W1 ($25→$53) and W2 ($31) but W3 is still forming.
 * Returns null if 6+ alternating points exist (full impulse handles those).
 */
export function countDevelopingWaves(
  swings: SwingPoint[],
  closes: number[],
  direction: "up" | "down",
  degree: WaveDegree
): WaveCount | null {
  const startType = direction === "up" ? "low" : "high";
  const alternating = buildAlternatingSequence(swings, startType);

  // Need 3-5 points. Fewer = insufficient, 6+ = full impulse handles it
  if (alternating.length < 3 || alternating.length >= 6) return null;

  const lastPrice = closes[closes.length - 1];
  const sign = direction === "up" ? 1 : -1;

  const p0 = alternating[0];
  const p1 = alternating[1];
  const p2 = alternating[2];
  const p3 = alternating.length >= 4 ? alternating[3] : null;
  const p4 = alternating.length >= 5 ? alternating[4] : null;

  // ── Validation ──
  const violations: string[] = [];

  if (direction === "up") {
    if (p1.price <= p0.price) violations.push("Wave 1 doesn't move up");
    if (p2.price >= p1.price) violations.push("Wave 2 doesn't retrace down");
    if (p2.price <= p0.price) violations.push("Wave 2 retraces beyond Wave 1 start");
  } else {
    if (p1.price >= p0.price) violations.push("Wave 1 doesn't move down");
    if (p2.price <= p1.price) violations.push("Wave 2 doesn't retrace up");
    if (p2.price >= p0.price) violations.push("Wave 2 retraces beyond Wave 1 start");
  }

  if (p3) {
    if (direction === "up") {
      if (p3.price <= p2.price) violations.push("Wave 3 doesn't advance");
      if (p3.price <= p1.price) violations.push("Wave 3 doesn't exceed Wave 1");
    } else {
      if (p3.price >= p2.price) violations.push("Wave 3 doesn't advance");
      if (p3.price >= p1.price) violations.push("Wave 3 doesn't exceed Wave 1");
    }
  }

  if (p3 && p4) {
    if (direction === "up") {
      if (p4.price >= p3.price) violations.push("Wave 4 doesn't retrace down");
      if (p4.price <= p1.price) violations.push("Wave 4 overlaps Wave 1 territory");
    } else {
      if (p4.price <= p3.price) violations.push("Wave 4 doesn't retrace up");
      if (p4.price >= p1.price) violations.push("Wave 4 overlaps Wave 1 territory");
    }
  }

  const isValid = violations.length === 0;

  // ── Scoring ──
  let score = 0;
  const w1Len = (p1.price - p0.price) * sign;

  // W1 direction correct (10 pts)
  if (w1Len > 0) score += 10;

  // W2 Fibonacci retracement quality (20 pts) — uses broader ratios including 78.6%
  if (w1Len > 0) {
    const w2Retrace = Math.abs(p2.price - p1.price) / w1Len;
    score += fibProximityScore(w2Retrace, DEVELOPING_W2_RATIOS) * 20;
  }

  // W3 progress if available (15 pts)
  if (p3 && w1Len > 0) {
    const w3Len = (p3.price - p2.price) * sign;
    if (w3Len > 0) {
      score += 5;
      score += fibProximityScore(w3Len / w1Len, IMPULSE_W3_EXTENSIONS) * 10;
    }
  }

  // W4 retracement if available (10 pts)
  if (p3 && p4) {
    const w3Len = (p3.price - p2.price) * sign;
    if (w3Len > 0) {
      const w4Retrace = Math.abs(p4.price - p3.price) / w3Len;
      score += fibProximityScore(w4Retrace, IMPULSE_W4_RATIOS) * 10;
    }
  }

  // Rule adherence (15 pts)
  score += Math.max(0, 15 - violations.length * 5);

  // Active development bonus — price progressing past Wave 2 (up to 25 pts)
  // This makes developing counts competitive with completed patterns when
  // the stock is actively in a new wave cycle
  const pastW2 = direction === "up" ? lastPrice > p2.price : lastPrice < p2.price;
  if (pastW2) {
    score += 10;
    const w1Range = Math.abs(p1.price - p0.price);
    if (w1Range > 0) {
      const progressBeyondW2 = direction === "up"
        ? (lastPrice - p2.price) / w1Range
        : (p2.price - lastPrice) / w1Range;
      if (progressBeyondW2 > 0.25) score += 7;
      if (progressBeyondW2 > 0.75) score += 8;
    }
  }

  score = Math.max(0, Math.min(90, Math.round(score)));

  // ── Position label ──
  let position: string;

  if (alternating.length === 3) {
    if (pastW2) {
      const pastW1Peak = direction === "up" ? lastPrice > p1.price : lastPrice < p1.price;
      if (pastW1Peak) position = "Developing Wave 3 — price beyond Wave 1 peak";
      else position = "Developing Wave 3 — advancing from Wave 2";
    } else {
      position = "Wave 2 may still be forming";
    }
  } else if (alternating.length === 4) {
    const w3Past = direction === "up" ? lastPrice < p3!.price : lastPrice > p3!.price;
    if (w3Past) position = "Developing Wave 4 correction";
    else position = "In developing Wave 3 — may still be extending";
  } else {
    const w4Past = direction === "up" ? lastPrice > p4!.price : lastPrice < p4!.price;
    if (w4Past) position = "Developing Wave 5 — final impulse forming";
    else position = "Wave 4 correction may still be forming";
  }

  // ── Build wave points ──
  const waves: WavePoint[] = [];
  const conf = isValid ? Math.min(score / 100, 0.8) : Math.min(score / 100, 0.4);

  waves.push({ ...p1, label: "1", degree, confidence: conf });
  waves.push({ ...p2, label: "2", degree, confidence: conf });
  if (p3) waves.push({ ...p3, label: "3", degree, confidence: conf * 0.8 });
  if (p4) waves.push({ ...p4, label: "4", degree, confidence: conf * 0.6 });

  return {
    waves,
    waveStart: p0,
    degree,
    isValid,
    violations,
    score,
    position,
  };
}

// ── Validation ──

function validateImpulse(
  p0: SwingPoint,
  p1: SwingPoint,
  p2: SwingPoint,
  p3: SwingPoint,
  p4: SwingPoint,
  p5: SwingPoint,
  direction: "up" | "down"
): { isValid: boolean; violations: string[] } {
  const violations: string[] = [];

  if (direction === "up") {
    // Rule 1: Wave 2 cannot retrace beyond start of Wave 1
    if (p2.price <= p0.price) violations.push("Wave 2 retraces beyond Wave 1 start");
    // Rule 2: Wave 3 cannot be the shortest
    const w1Len = Math.abs(p1.price - p0.price);
    const w3Len = Math.abs(p3.price - p2.price);
    const w5Len = Math.abs(p5.price - p4.price);
    if (w3Len < w1Len && w3Len < w5Len) violations.push("Wave 3 is the shortest impulse wave");
    // Rule 3: Wave 4 cannot overlap Wave 1 territory
    if (p4.price <= p1.price) violations.push("Wave 4 overlaps Wave 1 territory");
    // Direction check: waves should progress upward
    if (p1.price <= p0.price) violations.push("Wave 1 doesn't move up");
    if (p3.price <= p1.price) violations.push("Wave 3 doesn't exceed Wave 1");
    if (p5.price <= p3.price) violations.push("Wave 5 doesn't exceed Wave 3");
    // Retrace direction: corrections must move against impulse
    if (p2.price >= p1.price) violations.push("Wave 2 doesn't retrace down");
    if (p4.price >= p3.price) violations.push("Wave 4 doesn't retrace down");
  } else {
    // Bearish impulse — inverted rules
    if (p2.price >= p0.price) violations.push("Wave 2 retraces beyond Wave 1 start");
    const w1Len = Math.abs(p0.price - p1.price);
    const w3Len = Math.abs(p2.price - p3.price);
    const w5Len = Math.abs(p4.price - p5.price);
    if (w3Len < w1Len && w3Len < w5Len) violations.push("Wave 3 is the shortest impulse wave");
    if (p4.price >= p1.price) violations.push("Wave 4 overlaps Wave 1 territory");
    if (p1.price >= p0.price) violations.push("Wave 1 doesn't move down");
    if (p3.price >= p1.price) violations.push("Wave 3 doesn't exceed Wave 1");
    if (p5.price >= p3.price) violations.push("Wave 5 doesn't exceed Wave 3");
    // Retrace direction: corrections must move against impulse
    if (p2.price <= p1.price) violations.push("Wave 2 doesn't retrace up");
    if (p4.price <= p3.price) violations.push("Wave 4 doesn't retrace up");
  }

  return { isValid: violations.length === 0, violations };
}

function validateCorrection(
  p0: SwingPoint,
  pA: SwingPoint,
  pB: SwingPoint,
  pC: SwingPoint,
  direction: "up" | "down"
): { isValid: boolean; violations: string[] } {
  const violations: string[] = [];
  const impulseRange = Math.abs(p0.price - pA.price);

  if (direction === "up") {
    // Correction of uptrend: A down, B up, C down
    if (pA.price >= p0.price) violations.push("Wave A doesn't decline");
    if (pB.price <= pA.price) violations.push("Wave B doesn't bounce");
    if (pB.price >= p0.price) violations.push("Wave B exceeds start (not a correction)");
    if (pC.price >= pB.price) violations.push("Wave C doesn't decline");
  } else {
    // Correction of downtrend: A up, B down, C up
    if (pA.price <= p0.price) violations.push("Wave A doesn't rally");
    if (pB.price >= pA.price) violations.push("Wave B doesn't pull back");
    if (pB.price <= p0.price) violations.push("Wave B exceeds start");
    if (pC.price <= pB.price) violations.push("Wave C doesn't rally");
  }

  // Check retracement depth of correction (38.2-78.6% is ideal)
  if (impulseRange > 0) {
    const correctionDepth = Math.abs(pC.price - p0.price) / impulseRange;
    if (correctionDepth > 1.618) violations.push("Correction exceeds 161.8% of prior move");
  }

  return { isValid: violations.length === 0, violations };
}

// ── Scoring ──

function scoreImpulse(
  p0: SwingPoint,
  p1: SwingPoint,
  p2: SwingPoint,
  p3: SwingPoint,
  p4: SwingPoint,
  p5: SwingPoint,
  direction: "up" | "down"
): number {
  let score = 0;
  const sign = direction === "up" ? 1 : -1;

  const w1Len = (p1.price - p0.price) * sign;
  const w3Len = (p3.price - p2.price) * sign;
  const w5Len = (p5.price - p4.price) * sign;

  // Basic validity: waves move in right direction (30 pts)
  if (w1Len > 0) score += 10;
  if (w3Len > 0) score += 10;
  if (w5Len > 0) score += 10;

  // Wave 2 Fibonacci retracement of Wave 1 (15 pts)
  if (w1Len > 0) {
    const w2Retrace = Math.abs(p2.price - p1.price) / w1Len;
    score += fibProximityScore(w2Retrace, IMPULSE_W2_RATIOS) * 15;
  }

  // Wave 3 extension of Wave 1 (15 pts)
  if (w1Len > 0) {
    const w3Ratio = w3Len / w1Len;
    score += fibProximityScore(w3Ratio, IMPULSE_W3_EXTENSIONS) * 15;
  }

  // Wave 4 retracement of Wave 3 (15 pts)
  if (w3Len > 0) {
    const w4Retrace = Math.abs(p4.price - p3.price) / w3Len;
    score += fibProximityScore(w4Retrace, IMPULSE_W4_RATIOS) * 15;
  }

  // Wave 3 is longest (10 pts) — strong guideline
  if (w3Len > w1Len && w3Len > w5Len) score += 10;

  // Rule adherence (15 pts)
  const { violations } = validateImpulse(p0, p1, p2, p3, p4, p5, direction);
  score += Math.max(0, 15 - violations.length * 5);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreCorrection(
  p0: SwingPoint,
  pA: SwingPoint,
  pB: SwingPoint,
  pC: SwingPoint,
  direction: "up" | "down"
): number {
  let score = 0;
  const priorRange = Math.abs(p0.price - pA.price);

  // Direction correctness (30 pts)
  if (direction === "up") {
    if (pA.price < p0.price) score += 10;
    if (pB.price > pA.price) score += 10;
    if (pC.price < pB.price) score += 10;
  } else {
    if (pA.price > p0.price) score += 10;
    if (pB.price < pA.price) score += 10;
    if (pC.price > pB.price) score += 10;
  }

  // Wave B retracement of Wave A (20 pts)
  const wALen = Math.abs(pA.price - p0.price);
  if (wALen > 0) {
    const bRetrace = Math.abs(pB.price - pA.price) / wALen;
    score += fibProximityScore(bRetrace, CORRECTION_B_RATIOS) * 20;
  }

  // Overall correction depth: 38.2-78.6% is ideal (20 pts)
  if (priorRange > 0) {
    const totalRetrace = Math.abs(pC.price - p0.price) / priorRange;
    if (totalRetrace >= 0.382 && totalRetrace <= 0.786) score += 20;
    else if (totalRetrace >= 0.236 && totalRetrace <= 0.886) score += 10;
    else if (totalRetrace > 0.886 && totalRetrace <= 1.618) score += 5;
  }

  // C/A wave ratio: zigzag C ≈ A (1.0), flat C < A, expanded C ≈ 1.618×A (10 pts)
  const wCLen = Math.abs(pC.price - pB.price);
  if (wALen > 0) {
    const caRatio = wCLen / wALen;
    score += fibProximityScore(caRatio, [0.618, 1.0, 1.618]) * 10;
  }

  // Rule adherence (30 pts)
  const { violations } = validateCorrection(p0, pA, pB, pC, direction);
  score += Math.max(0, 30 - violations.length * 10);

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Score how close a ratio is to any of the target Fibonacci ratios (0-1). */
function fibProximityScore(actual: number, targets: number[]): number {
  let minDist = Infinity;
  for (const t of targets) {
    const d = Math.abs(actual - t);
    if (d < minDist) minDist = d;
  }
  // Perfect match = 1.0, distance of 0.2 = 0, linear interpolation
  return Math.max(0, 1 - minDist / 0.2);
}

// ── Helpers ──

/** Build alternating high-low sequence starting with given type.
 *  Ensures strictly increasing bar indices (handles dual pivots at same bar).
 */
function buildAlternatingSequence(swings: SwingPoint[], startType: "high" | "low"): SwingPoint[] {
  const result: SwingPoint[] = [];
  let expectType = startType;

  for (const s of swings) {
    if (s.type === expectType) {
      // If we already have a point of this type, keep the more extreme one
      if (result.length > 0 && result[result.length - 1].type === expectType) {
        const prev = result[result.length - 1];
        if (expectType === "high" && s.price > prev.price) {
          result[result.length - 1] = s;
        } else if (expectType === "low" && s.price < prev.price) {
          result[result.length - 1] = s;
        }
        continue;
      }
      // Skip if same bar index as previous point (dual pivot — one bar can't be
      // both a wave high and wave low in separate wave positions)
      if (result.length > 0 && s.index === result[result.length - 1].index) {
        continue;
      }
      result.push(s);
      expectType = expectType === "high" ? "low" : "high";
    } else if (result.length > 0 && s.type === result[result.length - 1].type) {
      // Same type as last accepted point, but we're now expecting the opposite type.
      // Replace if this swing is more extreme (higher high or lower low).
      // This handles cases like UNH where two swing highs occur without an
      // intervening swing low — we want the actual peak, not the first one found.
      const prev = result[result.length - 1];
      if (s.type === "high" && s.price > prev.price) {
        result[result.length - 1] = s;
      } else if (s.type === "low" && s.price < prev.price) {
        result[result.length - 1] = s;
      }
    }
  }

  return result;
}

/** Pick 6 points from alternating sequence for impulse wave fitting.
 *  Maintains alternation parity: even offsets from start keep startType,
 *  odd offsets keep endType. The old evenly-spaced approach broke this
 *  when step was even (e.g., 11 points → step=2 → all even indices → all same type).
 */
function pickSixPoints(
  seq: SwingPoint[],
  start: number,
  end: number
): [SwingPoint, SwingPoint, SwingPoint, SwingPoint, SwingPoint, SwingPoint] | null {
  if (end - start < 5) return null;

  // If exactly 6 points, take them all (always properly alternating)
  if (end - start === 5) {
    return [seq[start], seq[start + 1], seq[start + 2], seq[start + 3], seq[start + 4], seq[start + 5]];
  }

  // For wider spans, pick 6 evenly-spaced points preserving alternation.
  // Position k must have the same parity offset as k (even positions = startType).
  const idealStep = (end - start) / 5;
  const indices: number[] = [];

  for (let k = 0; k < 6; k++) {
    let idx = start + Math.round(k * idealStep);

    // Snap to correct parity: offset from start must match k%2
    if ((idx - start) % 2 !== k % 2) {
      if (idx + 1 <= end) idx += 1;
      else if (idx - 1 >= start) idx -= 1;
      else return null;
    }

    // Ensure strictly after previous index (step by 2 to maintain parity)
    while (indices.length > 0 && idx <= indices[indices.length - 1]) {
      idx += 2;
    }

    if (idx > end) return null;
    indices.push(idx);
  }

  return [seq[indices[0]], seq[indices[1]], seq[indices[2]], seq[indices[3]], seq[indices[4]], seq[indices[5]]];
}

/** Determine current wave position based on price relative to wave points. */
function getImpulsePosition(
  p0: SwingPoint,
  p1: SwingPoint,
  p2: SwingPoint,
  p3: SwingPoint,
  p4: SwingPoint,
  p5: SwingPoint,
  closes: number[],
  direction: "up" | "down"
): string {
  const lastPrice = closes[closes.length - 1];
  const lastIdx = closes.length - 1;

  // Check where current price/time sits
  if (lastIdx <= p1.index) return "In Wave 1";
  if (lastIdx <= p2.index) return "In Wave 2 correction";
  if (lastIdx <= p3.index) return "In Wave 3 (strongest wave)";
  if (lastIdx <= p4.index) return "In Wave 4 correction";
  if (lastIdx <= p5.index) return "In Wave 5 (final impulse)";

  // After Wave 5 — looking for correction
  if (direction === "up") {
    if (lastPrice < p5.price) return "Post-Wave 5 — correction underway";
    return "Beyond Wave 5 — possible extension";
  } else {
    if (lastPrice > p5.price) return "Post-Wave 5 — recovery underway";
    return "Beyond Wave 5 — possible extension";
  }
}

// ── Multi-Timeframe Confirmation ──

/**
 * Compare higher-timeframe (weekly) wave count with lower-timeframe (daily) wave count.
 * Checks if LTF subdivisions are consistent with HTF labels.
 */
export function confirmMultiTimeframe(
  weeklyCount: WaveCount | null,
  dailySeries: PriceSeries,
  dailyAthIdx: number,
  dailyLowIdx: number
): MTFConfirmation {
  if (!weeklyCount) {
    return {
      alignment: "unclear",
      alignmentScore: 0,
      htfPosition: "No weekly wave count",
      ltfPosition: "N/A",
      details: "Cannot confirm — no valid weekly wave count.",
    };
  }

  // Count waves on daily timeframe
  const dailyCount = countWaves(dailySeries, dailyAthIdx, dailyLowIdx, "intermediate");

  if (!dailyCount) {
    return {
      alignment: "unclear",
      alignmentScore: 0.3,
      htfPosition: weeklyCount.position,
      ltfPosition: "No daily wave count found",
      details: "Daily timeframe shows no clear wave structure.",
    };
  }

  const htfPos = weeklyCount.position.toLowerCase();
  const ltfPos = dailyCount.position.toLowerCase();

  // Check alignment based on HTF position
  let alignment: MTFConfirmation["alignment"] = "unclear";
  let alignmentScore = 0.5;
  let details = "";

  // If weekly says "Wave 2 correction", daily should show completed impulsive decline
  if (htfPos.includes("wave 2")) {
    const dailyHasImpulseDown = dailyCount.waves.some((w) => w.label === "5");
    if (dailyHasImpulseDown) {
      alignment = "confirmed";
      alignmentScore = 0.9;
      details = "Daily shows completed 5-wave decline confirming Wave 2 bottom.";
    } else if (dailyCount.waves.some((w) => w.label === "C")) {
      alignment = "confirmed";
      alignmentScore = 0.7;
      details = "Daily shows A-B-C correction — consistent with Wave 2 correction.";
    } else {
      alignment = "unclear";
      alignmentScore = 0.4;
      details = "Daily structure unclear — Wave 2 not yet confirmed by LTF.";
    }
  }
  // If weekly says "Wave 3" or "Wave 5", daily should show impulse up
  else if (htfPos.includes("wave 3") || htfPos.includes("wave 5")) {
    if (dailyCount.isValid && dailyCount.score >= 50) {
      alignment = "confirmed";
      alignmentScore = 0.85;
      details = `Daily shows valid impulse structure (${dailyCount.score}/100) — confirms ${htfPos.includes("wave 3") ? "Wave 3" : "Wave 5"} advance.`;
    } else {
      alignment = "unclear";
      alignmentScore = 0.5;
      details = "Daily structure doesn't clearly confirm impulse advance.";
    }
  }
  // If weekly says "Wave 4 correction", daily should show corrective structure
  else if (htfPos.includes("wave 4")) {
    if (dailyCount.waves.some((w) => w.label === "C")) {
      alignment = "confirmed";
      alignmentScore = 0.8;
      details = "Daily shows A-B-C correction — consistent with Wave 4 pullback.";
    } else {
      alignment = "unclear";
      alignmentScore = 0.4;
      details = "Daily structure unclear for Wave 4 correction.";
    }
  }
  // Post-Wave 5
  else if (htfPos.includes("post-wave 5") || htfPos.includes("recovery")) {
    if (dailyCount.waves.some((w) => w.label === "1" || w.label === "A")) {
      alignment = "confirmed";
      alignmentScore = 0.7;
      details = "Daily shows early impulse or corrective structure — new cycle may be starting.";
    } else {
      alignment = "unclear";
      alignmentScore = 0.3;
      details = "Daily structure unclear for post-Wave 5 recovery.";
    }
  }
  // Generic fallback: check if both agree on direction
  else {
    const htfBullish = htfPos.includes("up") || htfPos.includes("recovery") || htfPos.includes("impulse");
    const ltfBullish = ltfPos.includes("up") || ltfPos.includes("recovery") || ltfPos.includes("impulse");
    if (htfBullish === ltfBullish) {
      alignment = "confirmed";
      alignmentScore = 0.6;
      details = "HTF and LTF direction agree.";
    } else {
      alignment = "conflicting";
      alignmentScore = 0.2;
      details = "HTF and LTF directions conflict — proceed with caution.";
    }
  }

  return {
    alignment,
    alignmentScore,
    htfPosition: weeklyCount.position,
    ltfPosition: dailyCount.position,
    details,
  };
}
