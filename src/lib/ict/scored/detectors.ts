/**
 * ICT price-action detectors.
 *
 * Every detector is INDEPENDENT. Each searches a window of candles backward,
 * reports the most recent qualifying occurrence, and grades it 0..1.
 *
 * Independence is the entire point of this rewrite. The state-machine engine
 * in src/lib/ict/engine.ts chained these into a mandatory ladder, so a missing
 * ingredient zeroed every ingredient above it — a stock could have a textbook
 * sweep, displacement, MSS and FVG and still report nothing because no equal
 * highs had formed yet. Here a missing ingredient costs only its own weight.
 *
 * Pure functions. No moving averages, no oscillators, no volume, no I/O.
 */

import { SSL, DISPLACEMENT, MSS, FVG, BSL, COMPRESSION, REACCUMULATION } from "./config";
import type {
  CandleSeries,
  SSLRaidHit,
  DisplacementHit,
  MSSHit,
  FVGHit,
  ReaccumulationHit,
  BSLHit,
  CompressionHit,
} from "./types";

// ── Shared Helpers ──

/** Map a value onto 0..1 between a floor and a ceiling. */
export function ramp(value: number, floor: number, ceiling: number): number {
  if (ceiling <= floor) return 0;
  return Math.max(0, Math.min(1, (value - floor) / (ceiling - floor)));
}

function rangeOf(s: CandleSeries, i: number): number {
  return s.highs[i] - s.lows[i];
}

function bodyOf(s: CandleSeries, i: number): number {
  return Math.abs(s.closes[i] - s.opens[i]);
}

/** Where the bar closed within its own range, 0 (low) .. 1 (high). */
function closeLocation(s: CandleSeries, i: number): number {
  const r = rangeOf(s, i);
  if (r <= 0) return 0;
  return (s.closes[i] - s.lows[i]) / r;
}

function lowestLow(s: CandleSeries, from: number, toExclusive: number): number {
  let min = Infinity;
  for (let j = Math.max(0, from); j < toExclusive; j++) {
    if (s.lows[j] < min) min = s.lows[j];
  }
  return min;
}

function highestHigh(s: CandleSeries, from: number, toExclusive: number): number {
  let max = -Infinity;
  for (let j = Math.max(0, from); j < toExclusive; j++) {
    if (s.highs[j] > max) max = s.highs[j];
  }
  return max;
}

// ── 1. Sell-Side Liquidity Raid ──

/**
 * Sweep below the prior low pool, ideally reclaiming it by the close.
 *
 * An unreclaimed sweep still registers — it is simply graded down. The old
 * engine required the reclaim outright and discarded the setup otherwise.
 */
export function detectSSLRaid(
  s: CandleSeries,
  endIdx: number,
  window: number,
  searchFrom?: number,
): SSLRaidHit | null {
  const earliest = Math.max(SSL.LOOKBACK, endIdx - window + 1);
  const from = Math.min(searchFrom ?? endIdx, endIdx);

  for (let i = from; i >= earliest; i--) {
    const sweptLevel = lowestLow(s, i - SSL.LOOKBACK, i);
    if (!isFinite(sweptLevel) || sweptLevel <= 0) continue;
    if (s.lows[i] >= sweptLevel) continue;

    const reclaimed = s.closes[i] > sweptLevel;
    const loc = closeLocation(s, i);
    const marginPct = ((s.closes[i] - sweptLevel) / sweptLevel) * 100;

    // A reclaim floors quality at 0.5; close location and reclaim margin
    // supply the rest. An unreclaimed sweep is capped well below that.
    const quality = reclaimed
      ? 0.5 + 0.3 * loc + 0.2 * ramp(marginPct, 0, SSL.CLEAN_RECLAIM_PCT)
      : 0.25 * loc;

    return {
      barIndex: i,
      barsAgo: endIdx - i,
      sweptLevel,
      raidLow: s.lows[i],
      reclaimed,
      closeLocation: loc,
      quality: Math.min(1, quality),
    };
  }
  return null;
}

// ── 2. Bullish Displacement ──

/**
 * One decisive bullish candle: dominant body, expanding body AND range against
 * the prior N bars, closing above the prior high.
 *
 * Returns the STRONGEST qualifying candle in the window, not the most recent.
 * A window often holds several — the impulse that opened the leg plus smaller
 * reclaim candles inside the base. Taking the most recent picks the weakest and
 * puts every later event out of chronological order; taking the strongest picks
 * the one that actually moved price. Ties go to the more recent bar.
 */
export function detectDisplacement(
  s: CandleSeries,
  endIdx: number,
  window: number,
): DisplacementHit | null {
  const n = DISPLACEMENT.COMPARISON_BARS;
  const earliest = Math.max(n, endIdx - window + 1);
  let best: DisplacementHit | null = null;

  for (let i = endIdx; i >= earliest; i--) {
    if (s.closes[i] <= s.opens[i]) continue;

    const range = rangeOf(s, i);
    if (range <= 0) continue;

    const body = s.closes[i] - s.opens[i];
    const bodyRatio = body / range;
    if (bodyRatio < DISPLACEMENT.MIN_BODY_RATIO) continue;
    if (s.closes[i] <= s.highs[i - 1]) continue;

    // Body and range must both exceed every one of the prior N bars.
    let maxPriorBody = 0;
    let maxPriorRange = 0;
    for (let j = 1; j <= n; j++) {
      maxPriorBody = Math.max(maxPriorBody, bodyOf(s, i - j));
      maxPriorRange = Math.max(maxPriorRange, rangeOf(s, i - j));
    }
    if (body <= maxPriorBody || range <= maxPriorRange) continue;

    const expansionRatio = maxPriorBody > 0 ? body / maxPriorBody : 3;
    const loc = closeLocation(s, i);

    const quality =
      0.35 * ramp(bodyRatio, DISPLACEMENT.MIN_BODY_RATIO, 1.0) +
      0.4 * ramp(expansionRatio, DISPLACEMENT.EXPANSION_FLOOR, DISPLACEMENT.EXPANSION_CEILING) +
      0.25 * ramp(loc, DISPLACEMENT.CLOSE_LOCATION_FLOOR, DISPLACEMENT.CLOSE_LOCATION_CEILING);

    if (best === null || quality > best.quality) {
      best = {
        barIndex: i,
        barsAgo: endIdx - i,
        bodyRatio,
        expansionRatio,
        closeLocation: loc,
        candleLow: s.lows[i],
        candleHigh: s.highs[i],
        quality: Math.min(1, quality),
      };
    }
  }
  return best;
}

// ── 3. Market Structure Shift ──

/**
 * A close above the prior structure high.
 *
 * When an SSL anchor is supplied the structure high is frozen at that bar —
 * the level the market had to reclaim to prove the sweep mattered — and the
 * FIRST close above it is the shift. Without an anchor it falls back to a
 * rolling structure high, which is weaker and is graded as unanchored.
 */
export function detectMSS(
  s: CandleSeries,
  endIdx: number,
  window: number,
  anchorIdx: number | null,
): MSSHit | null {
  if (anchorIdx !== null && anchorIdx >= MSS.LOOKBACK) {
    const structureHigh = highestHigh(s, anchorIdx - MSS.LOOKBACK, anchorIdx);
    if (!isFinite(structureHigh) || structureHigh <= 0) return null;

    for (let i = anchorIdx + 1; i <= endIdx; i++) {
      if (s.closes[i] > structureHigh) {
        const marginPct = ((s.closes[i] - structureHigh) / structureHigh) * 100;
        return {
          barIndex: i,
          barsAgo: endIdx - i,
          structureHigh,
          marginPct,
          anchored: true,
          quality: 0.6 + 0.4 * ramp(marginPct, 0, MSS.FULL_CREDIT_MARGIN_PCT),
        };
      }
    }
    return null;
  }

  const earliest = Math.max(MSS.LOOKBACK, endIdx - window + 1);
  for (let i = endIdx; i >= earliest; i--) {
    const structureHigh = highestHigh(s, i - MSS.LOOKBACK, i);
    if (!isFinite(structureHigh) || structureHigh <= 0) continue;
    if (s.closes[i] <= structureHigh) continue;

    const marginPct = ((s.closes[i] - structureHigh) / structureHigh) * 100;
    return {
      barIndex: i,
      barsAgo: endIdx - i,
      structureHigh,
      marginPct,
      anchored: false,
      // Unanchored shifts cap lower — no sweep gave this level meaning.
      quality: 0.4 + 0.3 * ramp(marginPct, 0, MSS.FULL_CREDIT_MARGIN_PCT),
    };
  }
  return null;
}

// ── 4. Fair Value Gap ──

/**
 * How a retracement into the zone grades, 0..1.
 *
 * Untested gaps are real but unproven; a gap price has worked into and held is
 * the one worth trading; a filled gap is spent.
 */
function retraceScore(retracedFraction: number, filled: boolean): number {
  if (filled) return 0;
  if (retracedFraction < FVG.OPTIMAL_RETRACE_MIN) {
    return 0.5 * (retracedFraction / FVG.OPTIMAL_RETRACE_MIN);
  }
  if (retracedFraction <= FVG.OPTIMAL_RETRACE_MAX) return 1;
  return 1 - ramp(retracedFraction, FVG.OPTIMAL_RETRACE_MAX, 1);
}

/**
 * Three-candle bullish gap: low[i] above high[i-2].
 *
 * Returns the most SIGNIFICANT gap in the window — size and retracement
 * behaviour together — not the most recent and not merely the largest.
 *
 * Both simpler rules were tried and both pick wrong. Most-recent selects the
 * fractional gaps a tight base throws off. Largest selects the gap under the
 * impulse, which is wide but typically never revisited, hiding the smaller zone
 * price is actually testing right now. Grading candidates on the same basis the
 * score uses picks the one doing the work.
 */
export function detectFVG(
  s: CandleSeries,
  endIdx: number,
  window: number,
  notBefore: number,
): FVGHit | null {
  const earliest = Math.max(2, Math.max(notBefore, endIdx - window + 1));

  let best: FVGHit | null = null;

  for (let i = endIdx; i >= earliest; i--) {
    if (s.lows[i] <= s.highs[i - 2]) continue;

    const lower = s.highs[i - 2];
    const upper = s.lows[i];
    const height = upper - lower;
    const price = s.closes[i];
    if (height <= 0 || price <= 0) continue;

    // Deepest push back into the zone between formation and the assessed bar.
    let deepest = upper;
    for (let j = i; j <= endIdx; j++) {
      if (s.lows[j] < deepest) deepest = s.lows[j];
    }

    const retracedFraction = Math.max(0, Math.min(1, (upper - deepest) / height));
    const filled = deepest <= lower;
    const gapPct = (height / price) * 100;

    const quality =
      FVG.SIZE_WEIGHT * ramp(gapPct, 0, FVG.FULL_CREDIT_GAP_PCT) +
      FVG.RETRACE_WEIGHT * retraceScore(retracedFraction, filled);

    if (best === null || quality > best.quality) {
      best = {
        barIndex: i,
        barsAgo: endIdx - i,
        lower,
        upper,
        gapPct,
        retracedFraction,
        filled,
        quality,
      };
    }
  }

  return best;
}

// ── 5. Reaccumulation / Higher Low ──

/**
 * A local low set above the protected low, then reclaimed by a close above
 * the prior bar's high. Buyers defended higher than the sweep.
 */
export function detectReaccumulation(
  s: CandleSeries,
  endIdx: number,
  window: number,
  protectedLow: number | null,
  notBefore: number,
): ReaccumulationHit | null {
  const earliest = Math.max(2, Math.max(notBefore, endIdx - window + 1));

  for (let i = endIdx; i >= earliest; i--) {
    const pivotLow = s.lows[i - 1];
    if (pivotLow >= s.lows[i - 2]) continue;
    if (s.lows[i] <= pivotLow) continue;
    if (s.closes[i] <= s.highs[i - 1]) continue;
    if (protectedLow !== null && pivotLow <= protectedLow) continue;

    const marginPct =
      protectedLow !== null && protectedLow > 0
        ? ((pivotLow - protectedLow) / protectedLow) * 100
        : 0;

    return {
      barIndex: i,
      barsAgo: endIdx - i,
      higherLow: pivotLow,
      marginPct,
      quality:
        protectedLow !== null
          ? 0.5 + 0.5 * ramp(marginPct, 0, REACCUMULATION.FULL_CREDIT_MARGIN_PCT)
          : 0.5,
    };
  }
  return null;
}

// ── 6. Buy-Side Liquidity Pool ──

/**
 * The prior-high pool overhead, graded by how many highs cluster at it.
 *
 * A lone spike high still registers — it is simply weak liquidity. The old
 * engine required two clustered highs and stalled the entire ladder without
 * them, which is what stranded trending names that never paused.
 */
export function detectBSL(s: CandleSeries, endIdx: number): BSLHit | null {
  if (endIdx < BSL.LOOKBACK) return null;

  const start = endIdx - BSL.LOOKBACK;
  let level = -Infinity;
  let levelBar = start;
  for (let j = start; j < endIdx; j++) {
    if (s.highs[j] > level) {
      level = s.highs[j];
      levelBar = j;
    }
  }
  if (!isFinite(level) || level <= 0) return null;

  let clusterCount = 0;
  for (let j = start; j < endIdx; j++) {
    if (Math.abs(s.highs[j] - level) / level <= BSL.CLUSTER_TOLERANCE) clusterCount++;
  }

  const distancePct = ((level - s.closes[endIdx]) / level) * 100;

  return {
    barIndex: levelBar,
    barsAgo: endIdx - levelBar,
    level,
    clusterCount,
    distancePct,
    quality: ramp(clusterCount, BSL.COUNT_FLOOR, BSL.COUNT_CEILING),
  };
}

// ── 7. Compression ──

/**
 * Range contraction against an EQUAL-LENGTH prior block, plus higher lows and
 * proximity to the pool overhead.
 *
 * The equal-length comparison matters: TOS v1.3 compared a 4-bar max against a
 * 6-bar max, so it reported contraction whenever the windows differed in size,
 * independent of any real tightening.
 */
export function detectCompression(
  s: CandleSeries,
  endIdx: number,
  bslLevel: number | null,
): CompressionHit | null {
  const b = COMPRESSION.BLOCK_BARS;
  if (endIdx < b * 2) return null;

  let currentMax = 0;
  for (let j = endIdx - b + 1; j <= endIdx; j++) {
    currentMax = Math.max(currentMax, rangeOf(s, j));
  }

  let priorMax = 0;
  for (let j = endIdx - b * 2 + 1; j <= endIdx - b; j++) {
    priorMax = Math.max(priorMax, rangeOf(s, j));
  }
  if (priorMax <= 0) return null;

  const contractionRatio = currentMax / priorMax;

  let consecutiveHigherLows = 0;
  for (let j = endIdx; j >= 1 && j > endIdx - b; j--) {
    if (s.lows[j] > s.lows[j - 1]) consecutiveHigherLows++;
    else break;
  }

  const distanceToBslPct =
    bslLevel !== null && bslLevel > 0
      ? ((bslLevel - s.closes[endIdx]) / bslLevel) * 100
      : null;

  // Contraction: ratio 1.0 scores nothing, 0.4 or tighter scores full.
  const contractionScore = ramp(1 - contractionRatio, 0, 0.6);
  const higherLowScore = ramp(consecutiveHigherLows, 0, b);

  let proximityScore = 0;
  if (distanceToBslPct !== null && distanceToBslPct >= 0) {
    proximityScore =
      distanceToBslPct <= COMPRESSION.IDEAL_DISTANCE_PCT
        ? 1
        : 1 - ramp(distanceToBslPct, COMPRESSION.IDEAL_DISTANCE_PCT, COMPRESSION.MAX_DISTANCE_PCT);
  }

  // A block whose range is expanding is not coiling, whatever its lows are
  // doing. Without this, a base that blew out 5x still collected the higher-low
  // and proximity credit and reported as compression.
  const expansionDamper =
    contractionRatio <= 1 ? 1 : Math.max(0, 1 - (contractionRatio - 1));

  const quality =
    (COMPRESSION.CONTRACTION_WEIGHT * contractionScore +
      COMPRESSION.HIGHER_LOW_WEIGHT * higherLowScore +
      COMPRESSION.PROXIMITY_WEIGHT * proximityScore) *
    expansionDamper;

  return {
    barIndex: endIdx,
    barsAgo: 0,
    contractionRatio,
    consecutiveHigherLows,
    distanceToBslPct,
    quality: Math.min(1, quality),
  };
}

// ── Risk Helpers ──

/**
 * Did any close after `fromIdx` break the protected low?
 * Returns the offending bar index, or null.
 */
export function findInvalidation(
  s: CandleSeries,
  fromIdx: number,
  endIdx: number,
  protectedLow: number,
): number | null {
  for (let i = fromIdx + 1; i <= endIdx; i++) {
    if (s.closes[i] <= protectedLow) return i;
  }
  return null;
}

/** Consecutive bullish expanding-range candles ending at the assessed bar. */
export function countConsecutiveExpansion(s: CandleSeries, endIdx: number): number {
  let count = 0;
  for (let i = endIdx; i >= 1; i--) {
    const bullish = s.closes[i] > s.opens[i];
    if (bullish && rangeOf(s, i) > rangeOf(s, i - 1)) count++;
    else break;
  }
  return count;
}
