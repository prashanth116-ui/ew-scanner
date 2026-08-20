/**
 * ICT Price Action Pre-Expansion Engine — Core State Machine.
 *
 * Pure function: OHLC arrays in, ICTSetup out.
 * Zero lagging indicators — operates exclusively on raw candle relationships.
 * Processes candles sequentially (causal — no look-ahead).
 *
 * Bullish only. See config.ts "DIRECTIONAL SCOPE".
 *
 * The engine reports the LIVE setup — the state as of the final bar. It never
 * returns a dead high-water mark: a setup that reached ARMED and then broke is
 * reported at whatever it has rebuilt to, with the break carried separately as
 * `priorInvalidation`. Anything else asserts a stop and a target that price has
 * already taken out.
 */

import { SSL, MSS, DISPLACEMENT, FVG, BSL, ARMED, RANGE, barBudget } from "./config";
import { detectBullishCISD } from "./cisd";
import { ICTState } from "./types";
import type {
  ICTSetup,
  FVGZone,
  SSLRaidDetail,
  StateTransition,
  BSLDetail,
  DealingRange,
} from "./types";

/** Create a fresh ICTSetup with no state. */
function emptySetup(): ICTSetup {
  return {
    currentState: ICTState.NONE,
    protectedLow: null,
    originalProtectedLow: null,
    protectedLowTrailed: false,
    mssLevel: null,
    fvgZone: null,
    bslLevel: null,
    bslClusterCount: 0,
    bslUnbroken: true,
    sslRaid: null,
    retracementDepth: null,
    dealingRange: null,
    higherLowBar: null,
    cisd: { triggered: false, bearishOpen: null, bearishBarIndex: null, runLength: 0 },
    distanceToBslPct: null,
    invalidated: false,
    invalidationReason: null,
    priorInvalidation: null,
    stateBarIndex: null,
    stateBarsAgo: null,
    stateTimestamp: null,
    transitions: [],
    bullishEvidence: [],
    cautionEvidence: [],
    barsProcessed: 0,
    sslBarIndex: null,
  };
}

/** Reset the live setup's structural fields, keeping accumulated evidence. */
function resetSetup(setup: ICTSetup): void {
  setup.currentState = ICTState.NONE;
  setup.protectedLow = null;
  setup.originalProtectedLow = null;
  setup.protectedLowTrailed = false;
  setup.mssLevel = null;
  setup.fvgZone = null;
  setup.bslLevel = null;
  setup.bslClusterCount = 0;
  setup.bslUnbroken = true;
  setup.sslRaid = null;
  setup.retracementDepth = null;
  setup.dealingRange = null;
  setup.higherLowBar = null;
  setup.cisd = { triggered: false, bearishOpen: null, bearishBarIndex: null, runLength: 0 };
  setup.distanceToBslPct = null;
  setup.stateBarIndex = null;
  setup.stateTimestamp = null;
  setup.sslBarIndex = null;
}

/** Record a state transition and stamp when the new state was reached. */
function recordTransition(
  setup: ICTSetup,
  from: ICTState,
  to: ICTState,
  barIndex: number,
  timestamp: number,
  price: number,
  evidence: string,
): void {
  setup.transitions.push({ fromState: from, toState: to, barIndex, timestamp, price, evidence });
  setup.stateBarIndex = barIndex;
  setup.stateTimestamp = timestamp;
}

// ── State Detection Functions ──

/**
 * State 1 — SSL_RAID: sweep below a pool of sell-side liquidity and reclaim.
 *
 * The swept level must be a POOL — at least MIN_CLUSTER_COUNT lows resting
 * within CLUSTER_TOLERANCE of each other. A rolling 10-bar minimum with a
 * single low under it is a range break, not a liquidity raid, and it was the
 * weakest-evidence step in the whole ladder while BSL (the same construct
 * inverted) demanded a genuine cluster.
 */
function checkSSLRaid(
  lows: number[],
  closes: number[],
  timestamps: number[],
  i: number,
  lookback: number,
): SSLRaidDetail | null {
  if (i < lookback) return null;

  const start = i - lookback;
  let priorSSL = lows[start];
  for (let j = start + 1; j < i; j++) {
    if (lows[j] < priorSSL) priorSSL = lows[j];
  }
  if (!(priorSSL > 0)) return null;

  // Sweep below + reclaim above
  if (!(lows[i] < priorSSL && closes[i] > priorSSL)) return null;

  // The swept level must hold a pool of lows, not one isolated low.
  let poolCount = 0;
  for (let j = start; j < i; j++) {
    if (Math.abs(lows[j] - priorSSL) / priorSSL <= SSL.CLUSTER_TOLERANCE) poolCount++;
  }
  if (poolCount < SSL.MIN_CLUSTER_COUNT) return null;

  return {
    sweptPrice: priorSSL,
    raidBarIndex: i,
    raidBarLow: lows[i],
    raidBarTimestamp: timestamps[i],
    poolCount,
  };
}

/**
 * State 2 — STRUCTURE_HIGH: Frozen at SSL moment.
 * mssLevel = max(highs[raidIndex-lookback .. raidIndex-1])
 */
function computeStructureHigh(
  highs: number[],
  raidIndex: number,
  lookback: number,
): number | null {
  const start = Math.max(0, raidIndex - lookback);
  if (start >= raidIndex) return null;

  let maxHigh = highs[start];
  for (let j = start + 1; j < raidIndex; j++) {
    if (highs[j] > maxHigh) maxHigh = highs[j];
  }
  return maxHigh;
}

/**
 * State 3 — BULLISH_DISPLACEMENT: Large bullish candle exceeding prior candles.
 * body > each of prev 3 bodies, range > each of prev 3 ranges,
 * body/range >= 0.60, close > high[i-1]
 */
function checkDisplacement(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  i: number,
  compBars: number,
  minBodyRatio: number,
): boolean {
  if (i < compBars) return false;

  // Must be bullish
  if (closes[i] <= opens[i]) return false;

  const body = closes[i] - opens[i];
  const range = highs[i] - lows[i];
  if (range <= 0) return false;

  // Body ratio check
  if (body / range < minBodyRatio) return false;

  // Must close above previous high
  if (closes[i] <= highs[i - 1]) return false;

  // Body and range must exceed each of the previous compBars candles
  for (let j = 1; j <= compBars; j++) {
    const prevBody = Math.abs(closes[i - j] - opens[i - j]);
    const prevRange = highs[i - j] - lows[i - j];
    if (body <= prevBody) return false;
    if (range <= prevRange) return false;
  }

  return true;
}

/**
 * State 4 — BULLISH_MSS: Close above frozen structure high.
 * Wick does NOT qualify — must be a close.
 */
function checkMSS(closes: number[], i: number, mssLevel: number): boolean {
  return closes[i] > mssLevel;
}

/**
 * State 5 — FVG_CONFIRMED: 3-candle bullish fair value gap (BISI).
 *
 * Gap between candle C's low and candle A's high, where candle B — the middle
 * one — must itself be an energetic bullish leg. An FVG is a PD array because
 * displacement left it unfilled; a gap straddling a doji is a data artefact.
 */
function checkFVG(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  i: number,
): FVGZone | null {
  if (i < 2) return null;
  if (!(lows[i] > highs[i - 2])) return null;

  // Candle B must be the displacement leg that opened the gap.
  const b = i - 1;
  if (closes[b] <= opens[b]) return null;
  const bodyB = closes[b] - opens[b];
  const rangeB = highs[b] - lows[b];
  if (rangeB <= 0) return null;
  if (bodyB / rangeB < FVG.MIN_LEG_BODY_RATIO) return null;

  return {
    lower: highs[i - 2],
    upper: lows[i],
    barIndex: i,
  };
}

/**
 * Find the most recent valid FVG whose closing candle falls in [from, to].
 *
 * The gap that matters is the one the displacement leg left behind, and its
 * third candle usually prints one or two bars BEFORE structure formally
 * shifts. Searching only the MSS bar missed it whenever MSS lagged
 * displacement, which is the common case.
 */
function findRecentFVG(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  from: number,
  to: number,
): FVGZone | null {
  for (let k = to; k >= Math.max(2, from); k--) {
    const fvg = checkFVG(opens, highs, lows, closes, k);
    if (fvg) return fvg;
  }
  return null;
}

/**
 * State 6 — FVG_RETRACEMENT: Price returns into the FVG zone.
 * Must happen on a LATER bar than the one that formed the gap — the forming
 * bar trivially satisfies the touch test against its own low.
 */
function checkFVGRetracement(
  highs: number[],
  lows: number[],
  i: number,
  fvg: FVGZone,
): boolean {
  if (i <= fvg.barIndex) return false;
  return lows[i] <= fvg.upper && highs[i] >= fvg.lower;
}

/**
 * Compute retracement depth as fraction of FVG zone penetrated.
 * 0 = just touched upper, 1 = fully filled to lower.
 */
function computeRetracementDepth(low: number, fvg: FVGZone): number {
  const zoneHeight = fvg.upper - fvg.lower;
  if (zoneHeight <= 0) return 0;
  const penetration = fvg.upper - low;
  return Math.max(0, Math.min(1, penetration / zoneHeight));
}

/**
 * State 7 — HIGHER_LOW / Reaccumulation.
 *
 * The pullback low must be a confirmed pivot — the lowest of its immediate
 * neighbourhood — rather than merely lower than the single bar before it.
 * The old `low[i-1] < low[i-2]` test demanded one specific two-bar shape and
 * stalled every setup that reaccumulated in any other pattern.
 */
function checkHigherLow(
  highs: number[],
  lows: number[],
  closes: number[],
  i: number,
  protectedLow: number,
): boolean {
  if (i < 3) return false;

  const pivot = lows[i - 1];
  if (!(pivot > protectedLow)) return false;

  // Pivot low: lowest of the three bars ending at i-1, and reclaimed at i.
  if (!(pivot <= lows[i - 2] && pivot <= lows[i - 3])) return false;
  if (!(lows[i] > pivot)) return false;
  if (!(closes[i] > highs[i - 1])) return false;

  return true;
}

/**
 * State 8 — BSL_BUILT: the buy-side draw on liquidity.
 *
 * Scans a 40-bar window for confirmed pivot highs carrying a cluster of equal
 * highs, then takes the NEAREST such level ABOVE the current close — the
 * objective price still has to travel to. If every pivot has been cleared, the
 * highest is returned with `unbroken: false`.
 *
 * The previous "highest high of the last 8 bars" was roughly a day and a half
 * of 4h price, which made the target trivially close, the 3% armed threshold
 * near-automatic, and the backtest's BSL-hit rate tautological.
 */
function checkBSL(
  highs: number[],
  closes: number[],
  i: number,
  lookback: number,
  tolerance: number,
  minCluster: number,
  pivotBars: number,
): BSLDetail | null {
  const start = Math.max(0, i - lookback);
  if (i - start < pivotBars * 2 + 1) return null;

  const price = closes[i];
  const candidates: BSLDetail[] = [];

  for (let k = start + pivotBars; k <= i - pivotBars; k++) {
    const level = highs[k];
    if (!(level > 0)) continue;

    // Confirmed pivot high
    let isPivot = true;
    for (let d = 1; d <= pivotBars; d++) {
      if (highs[k - d] > level || highs[k + d] > level) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;

    // Equal highs resting at that level
    let count = 0;
    for (let j = start; j <= i; j++) {
      if (Math.abs(highs[j] - level) / level <= tolerance) count++;
    }
    if (count < minCluster) continue;

    candidates.push({ level, clusterCount: count, barIndex: k, unbroken: level > price });
  }

  if (candidates.length === 0) return null;

  // Nearest unbroken level above price, else the highest cleared one.
  const above = candidates.filter((c) => c.unbroken);
  if (above.length > 0) {
    return above.reduce((best, c) => (c.level < best.level ? c : best));
  }
  return candidates.reduce((best, c) => (c.level > best.level ? c : best));
}

/**
 * State 9 — ARMED: Compression into BSL.
 * Consecutive higher lows, hasn't broken BSL, within distance threshold.
 */
function checkArmed(
  highs: number[],
  lows: number[],
  closes: number[],
  i: number,
  bslLevel: number,
  maxDistPct: number,
): boolean {
  if (i < 2) return false;

  // Consecutive higher lows
  const higherLow1 = lows[i] > lows[i - 1];
  const higherLow2 = lows[i - 1] >= lows[i - 2];

  // Has NOT broken BSL
  const belowBSL = highs[i] < bslLevel;

  // Within distance threshold
  const distPct = ((bslLevel - closes[i]) / bslLevel) * 100;
  const withinDistance = distPct <= maxDistPct && distPct >= 0;

  return higherLow1 && higherLow2 && belowBSL && withinDistance;
}

/**
 * State 11 — IGNITION: Close breaks BSL with displacement.
 * close[i] > bslLevel AND displacement conditions met.
 */
function checkIgnition(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  i: number,
  bslLevel: number,
  compBars: number,
  minBodyRatio: number,
): boolean {
  if (closes[i] <= bslLevel) return false;
  return checkDisplacement(opens, highs, lows, closes, i, compBars, minBodyRatio);
}

/**
 * Dealing range: raid low to the highest high made since the raid.
 *
 * This is what premium/discount and OTE are measured against. Depth into the
 * FVG is a different, much smaller-scale construct — a setup can sit in the
 * middle of its gap while the leg as a whole is in premium, which is exactly
 * the entry ICT tells you not to take.
 */
function computeDealingRange(low: number, high: number, close: number): DealingRange | null {
  if (!(high > low)) return null;
  const span = high - low;
  const retracement = Math.max(0, Math.min(1, (high - close) / span));
  return {
    low,
    high,
    equilibrium: low + span * RANGE.EQUILIBRIUM,
    retracement,
    inDiscount: retracement >= RANGE.EQUILIBRIUM,
    inOTE: retracement >= RANGE.OTE_MIN && retracement <= RANGE.OTE_MAX,
  };
}

// ── Main Engine ──

/**
 * Run the ICT state machine on OHLC data.
 * Processes candles sequentially from index 0 to N-1.
 * At each bar: check invalidation, refresh live measurements, then advance as
 * far up the ladder as that bar's evidence supports.
 */
export function runICTEngine(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  timestamps: number[],
  timeframe = "4h",
): ICTSetup {
  const n = closes.length;
  if (n < SSL.LOOKBACK + 1) return emptySetup();

  const { staleExpiry } = barBudget(timeframe);

  const setup = emptySetup();
  let rangeHigh = -Infinity;

  // The most recent break, tracked by bar index and converted to bars-ago once
  // the series length is known.
  let brokenAtBar: number | null = null;
  let brokenState = ICTState.NONE;
  let brokenReason = "";

  for (let i = 0; i < n; i++) {
    // ── 1. INVALIDATION CHECKS ──
    let invalidationReason: string | null = null;

    if (
      setup.protectedLow !== null &&
      setup.currentState >= ICTState.SSL_RAID &&
      closes[i] <= setup.protectedLow
    ) {
      invalidationReason =
        `close ${closes[i].toFixed(2)} <= protected low ${setup.protectedLow.toFixed(2)}`;
    } else if (
      setup.fvgZone !== null &&
      setup.currentState >= ICTState.FVG_CONFIRMED &&
      closes[i] < setup.fvgZone.lower
    ) {
      // A bullish FVG closed through is inverted — it is resistance now, and
      // the premise the setup was built on is gone. Waiting for the protected
      // low (often far below) to break kept scoring a dead idea.
      invalidationReason =
        `FVG inverted — close ${closes[i].toFixed(2)} below gap floor ${setup.fvgZone.lower.toFixed(2)}`;
    }

    // ── 1b. EXPIRY ──
    // Several states are absorbing: FVG_CONFIRMED waits for a retracement that
    // may never come, BSL_BUILT waits for a compression that may never form,
    // and IGNITION cannot advance at all. None of them invalidate when price
    // simply walks away, so without this a setup parks in one for the length of
    // the chart and the board fills with fossils carrying targets far behind
    // spot. A setup that has not progressed in staleExpiry bars is abandoned
    // and the engine goes back to hunting a fresh raid.
    if (
      !invalidationReason &&
      setup.currentState >= ICTState.SSL_RAID &&
      setup.stateBarIndex !== null &&
      i - setup.stateBarIndex > staleExpiry
    ) {
      setup.cautionEvidence.push(
        `Expired at bar ${i}: ${ICTState[setup.currentState]} unchanged for ${i - setup.stateBarIndex} bars`,
      );
      // Not recorded as a prior invalidation — nothing broke, the idea simply
      // went stale, and flagging it as a break would misreport the risk.
      resetSetup(setup);
      rangeHigh = -Infinity;
      continue;
    }

    if (invalidationReason) {
      brokenAtBar = i;
      brokenState = setup.currentState;
      brokenReason = invalidationReason;
      setup.cautionEvidence.push(`Invalidated at bar ${i}: ${invalidationReason}`);
      resetSetup(setup);
      rangeHigh = -Infinity;
      continue;
    }

    // ── 2. LIVE MEASUREMENTS ──
    if (setup.currentState >= ICTState.SSL_RAID && setup.sslRaid) {
      if (highs[i] > rangeHigh) rangeHigh = highs[i];
      setup.dealingRange = computeDealingRange(setup.sslRaid.raidBarLow, rangeHigh, closes[i]);
    }

    // Distance to the draw is refreshed on every bar once a BSL exists, not
    // only while ARMED. It used to freeze the moment a setup advanced to
    // TRIGGER, so the rows a trader looks at first carried a stale number.
    if (setup.bslLevel !== null) {
      setup.distanceToBslPct = ((setup.bslLevel - closes[i]) / setup.bslLevel) * 100;
    }

    // Deepest penetration of the FVG, not merely the first touch.
    if (setup.fvgZone && setup.currentState >= ICTState.FVG_RETRACEMENT) {
      const depth = computeRetracementDepth(lows[i], setup.fvgZone);
      if (setup.retracementDepth === null || depth > setup.retracementDepth) {
        setup.retracementDepth = depth;
      }
    }

    // ── 3. STATE ADVANCEMENT ──
    // Loop rather than one step per bar: a single candle can legitimately be
    // the displacement, the MSS and the third leg of the FVG at once, and
    // charging a bar apiece for each stalled the cleanest setups.
    let guard = ICTState.IGNITION + 1;
    let advanced = true;
    while (advanced && guard-- > 0) {
      const before = setup.currentState;
      advanceOnce(setup, opens, highs, lows, closes, timestamps, i);
      advanced = setup.currentState !== before;

      if (advanced && setup.currentState >= ICTState.SSL_RAID && setup.sslRaid) {
        if (highs[i] > rangeHigh) rangeHigh = highs[i];
        setup.dealingRange = computeDealingRange(setup.sslRaid.raidBarLow, rangeHigh, closes[i]);
      }
    }

    // ── 4. CAUTION EVIDENCE ──
    if (setup.currentState >= ICTState.BSL_BUILT && setup.bslLevel !== null) {
      if (highs[i] > setup.bslLevel && closes[i] <= setup.bslLevel) {
        setup.cautionEvidence.push(`Wick above BSL at bar ${i} without displacement`);
      }
    }
  }

  setup.barsProcessed = n;
  setup.stateBarsAgo =
    setup.stateBarIndex !== null ? n - 1 - setup.stateBarIndex : null;

  if (brokenAtBar !== null) {
    setup.priorInvalidation = {
      state: brokenState,
      barsAgo: n - 1 - brokenAtBar,
      reason: brokenReason,
    };
  }

  return setup;
}

/** Attempt exactly one state advancement at bar `i`. */
function advanceOnce(
  setup: ICTSetup,
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  timestamps: number[],
  i: number,
): void {
  switch (setup.currentState) {
    case ICTState.NONE: {
      const raid = checkSSLRaid(lows, closes, timestamps, i, SSL.LOOKBACK);
      if (raid) {
        setup.sslRaid = raid;
        setup.protectedLow = raid.raidBarLow;
        setup.originalProtectedLow = raid.raidBarLow;
        setup.protectedLowTrailed = false;
        setup.sslBarIndex = i;
        setup.currentState = ICTState.SSL_RAID;
        setup.bullishEvidence.push(
          `SSL raid swept ${raid.sweptPrice.toFixed(2)} (${raid.poolCount} equal lows), reclaimed at ${closes[i].toFixed(2)}`,
        );
        recordTransition(setup, ICTState.NONE, ICTState.SSL_RAID, i, timestamps[i], closes[i],
          `SSL raid swept ${raid.sweptPrice.toFixed(2)}`);
      }
      break;
    }

    case ICTState.SSL_RAID: {
      const mss = computeStructureHigh(highs, setup.sslRaid!.raidBarIndex, MSS.LOOKBACK);
      if (mss !== null) {
        setup.mssLevel = mss;
        setup.currentState = ICTState.STRUCTURE_HIGH;
        setup.bullishEvidence.push(`Structure high frozen at ${mss.toFixed(2)}`);
        recordTransition(setup, ICTState.SSL_RAID, ICTState.STRUCTURE_HIGH, i, timestamps[i], closes[i],
          `Structure high ${mss.toFixed(2)}`);
      }
      break;
    }

    case ICTState.STRUCTURE_HIGH: {
      if (checkDisplacement(opens, highs, lows, closes, i, DISPLACEMENT.COMPARISON_BARS, DISPLACEMENT.MIN_BODY_RATIO)) {
        setup.currentState = ICTState.BULLISH_DISPLACEMENT;
        const body = closes[i] - opens[i];
        const range = highs[i] - lows[i];
        setup.bullishEvidence.push(`Displacement candle: body ${body.toFixed(2)}, ratio ${(body / range * 100).toFixed(0)}%`);
        recordTransition(setup, ICTState.STRUCTURE_HIGH, ICTState.BULLISH_DISPLACEMENT, i, timestamps[i], closes[i],
          `Displacement body/range ${(body / range * 100).toFixed(0)}%`);
      }
      break;
    }

    case ICTState.BULLISH_DISPLACEMENT: {
      if (setup.mssLevel !== null && checkMSS(closes, i, setup.mssLevel)) {
        setup.currentState = ICTState.BULLISH_MSS;
        setup.bullishEvidence.push(`MSS confirmed: close ${closes[i].toFixed(2)} > structure ${setup.mssLevel.toFixed(2)}`);
        recordTransition(setup, ICTState.BULLISH_DISPLACEMENT, ICTState.BULLISH_MSS, i, timestamps[i], closes[i],
          `MSS break ${setup.mssLevel.toFixed(2)}`);
      }
      break;
    }

    case ICTState.BULLISH_MSS: {
      // Search back to the displacement bar rather than testing only the
      // current one. The displacement gap's third candle typically prints
      // before structure formally shifts, so a search that started on the bar
      // after MSS stepped straight over it.
      const dispBar = setup.transitions.find(
        (t) => t.toState === ICTState.BULLISH_DISPLACEMENT,
      )?.barIndex ?? i;
      const fvg = findRecentFVG(opens, highs, lows, closes, dispBar, i);
      if (fvg) {
        setup.currentState = ICTState.FVG_CONFIRMED;
        setup.fvgZone = fvg;
        setup.bullishEvidence.push(`FVG formed: ${fvg.lower.toFixed(2)} - ${fvg.upper.toFixed(2)}`);
        recordTransition(setup, ICTState.BULLISH_MSS, ICTState.FVG_CONFIRMED, i, timestamps[i], closes[i],
          `FVG ${fvg.lower.toFixed(2)}-${fvg.upper.toFixed(2)}`);
      }
      break;
    }

    case ICTState.FVG_CONFIRMED: {
      if (setup.fvgZone && checkFVGRetracement(highs, lows, i, setup.fvgZone)) {
        const depth = computeRetracementDepth(lows[i], setup.fvgZone);
        setup.currentState = ICTState.FVG_RETRACEMENT;
        setup.retracementDepth = depth;
        setup.bullishEvidence.push(`FVG retrace: ${(depth * 100).toFixed(0)}% depth`);
        recordTransition(setup, ICTState.FVG_CONFIRMED, ICTState.FVG_RETRACEMENT, i, timestamps[i], closes[i],
          `FVG retrace ${(depth * 100).toFixed(0)}%`);
      }
      break;
    }

    case ICTState.FVG_RETRACEMENT: {
      if (setup.protectedLow !== null && checkHigherLow(highs, lows, closes, i, setup.protectedLow)) {
        setup.currentState = ICTState.HIGHER_LOW;
        setup.higherLowBar = i;

        // Risk moves to the reaccumulation low. Leaving it pinned at the raid
        // low overstated the stop a trader would actually be carrying and paid
        // the setup for the distance.
        const trailed = lows[i - 1];
        setup.protectedLow = trailed;
        setup.protectedLowTrailed = true;

        setup.bullishEvidence.push(
          `Higher low confirmed at ${trailed.toFixed(2)}, reclaim ${closes[i].toFixed(2)} — risk trailed`,
        );
        recordTransition(setup, ICTState.FVG_RETRACEMENT, ICTState.HIGHER_LOW, i, timestamps[i], closes[i],
          `HL ${trailed.toFixed(2)}`);
      }
      break;
    }

    case ICTState.HIGHER_LOW: {
      const bsl = checkBSL(
        highs, closes, i,
        BSL.LOOKBACK, BSL.CLUSTER_TOLERANCE, BSL.MIN_CLUSTER_COUNT, BSL.PIVOT_BARS,
      );
      if (bsl) {
        setup.currentState = ICTState.BSL_BUILT;
        setup.bslLevel = bsl.level;
        setup.bslClusterCount = bsl.clusterCount;
        setup.bslUnbroken = bsl.unbroken;
        setup.distanceToBslPct = ((bsl.level - closes[i]) / bsl.level) * 100;
        setup.bullishEvidence.push(
          `BSL draw: ${bsl.level.toFixed(2)} (${bsl.clusterCount} equal highs${bsl.unbroken ? "" : ", already cleared"})`,
        );
        recordTransition(setup, ICTState.HIGHER_LOW, ICTState.BSL_BUILT, i, timestamps[i], closes[i],
          `BSL ${bsl.level.toFixed(2)} x${bsl.clusterCount}`);
      }
      break;
    }

    case ICTState.BSL_BUILT: {
      if (setup.bslLevel !== null && checkArmed(highs, lows, closes, i, setup.bslLevel, ARMED.MAX_DISTANCE_PCT)) {
        setup.currentState = ICTState.ARMED;
        const dist = ((setup.bslLevel - closes[i]) / setup.bslLevel) * 100;
        setup.distanceToBslPct = dist;
        setup.bullishEvidence.push(`ARMED: compressing within ${dist.toFixed(1)}% of BSL`);
        recordTransition(setup, ICTState.BSL_BUILT, ICTState.ARMED, i, timestamps[i], closes[i],
          `Armed ${dist.toFixed(1)}% from BSL`);
      }
      break;
    }

    case ICTState.ARMED: {
      const cisd = detectBullishCISD(opens, closes, i);
      if (cisd.triggered) {
        setup.currentState = ICTState.TRIGGER;
        setup.cisd = cisd;
        setup.bullishEvidence.push(
          `CISD triggered: close ${closes[i].toFixed(2)} > delivery-leg open ${cisd.bearishOpen!.toFixed(2)} (${cisd.runLength}-bar leg)`,
        );
        recordTransition(setup, ICTState.ARMED, ICTState.TRIGGER, i, timestamps[i], closes[i],
          `CISD > ${cisd.bearishOpen!.toFixed(2)}`);
      }
      break;
    }

    case ICTState.TRIGGER: {
      if (
        setup.bslLevel !== null &&
        checkIgnition(opens, highs, lows, closes, i, setup.bslLevel, DISPLACEMENT.COMPARISON_BARS, DISPLACEMENT.MIN_BODY_RATIO)
      ) {
        setup.currentState = ICTState.IGNITION;
        setup.bullishEvidence.push(`IGNITION: close ${closes[i].toFixed(2)} broke BSL ${setup.bslLevel.toFixed(2)} with displacement`);
        recordTransition(setup, ICTState.TRIGGER, ICTState.IGNITION, i, timestamps[i], closes[i],
          `Ignition through BSL ${setup.bslLevel.toFixed(2)}`);
      }
      break;
    }

    case ICTState.IGNITION:
      // Terminal state — no further advancement
      break;
  }
}
