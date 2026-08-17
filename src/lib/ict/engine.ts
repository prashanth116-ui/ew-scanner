/**
 * ICT Price Action Pre-Expansion Engine — Core State Machine.
 *
 * Pure function: OHLC arrays in, ICTSetup out.
 * Zero lagging indicators — operates exclusively on raw candle relationships.
 * Processes candles sequentially (causal — no look-ahead).
 */

import { SSL, MSS, DISPLACEMENT, BSL, ARMED } from "./config";
import { detectBullishCISD } from "./cisd";
import { ICTState } from "./types";
import type { ICTSetup, FVGZone, SSLRaidDetail, StateTransition, BSLDetail } from "./types";

/** Create a fresh ICTSetup with no state. */
function emptySetup(): ICTSetup {
  return {
    currentState: ICTState.NONE,
    protectedLow: null,
    mssLevel: null,
    fvgZone: null,
    bslLevel: null,
    bslClusterCount: 0,
    sslRaid: null,
    retracementDepth: null,
    higherLowBar: null,
    cisd: { triggered: false, bearishOpen: null, bearishBarIndex: null },
    distanceToBslPct: null,
    invalidated: false,
    invalidationReason: null,
    transitions: [],
    bullishEvidence: [],
    cautionEvidence: [],
    barsProcessed: 0,
    sslBarIndex: null,
  };
}

/** Record a state transition. */
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
}

// ── State Detection Functions ──

/**
 * State 1 — SSL_RAID: Sweep below prior swing low pool and reclaim.
 * priorSSL = min(lows[i-lookback .. i-1])
 * sslRaid = lows[i] < priorSSL AND closes[i] > priorSSL
 */
function checkSSLRaid(
  lows: number[],
  closes: number[],
  timestamps: number[],
  i: number,
  lookback: number,
): SSLRaidDetail | null {
  if (i < lookback) return null;

  let priorSSL = lows[i - lookback];
  for (let j = i - lookback + 1; j < i; j++) {
    if (lows[j] < priorSSL) priorSSL = lows[j];
  }

  // Sweep below + reclaim above
  if (lows[i] < priorSSL && closes[i] > priorSSL) {
    return {
      sweptPrice: priorSSL,
      raidBarIndex: i,
      raidBarLow: lows[i],
      raidBarTimestamp: timestamps[i],
    };
  }

  return null;
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
 * State 5 — FVG_CONFIRMED: 3-candle bullish fair value gap.
 * Gap between candle C's low and candle A's high.
 * low[i] > high[i-2]
 */
function checkFVG(
  highs: number[],
  lows: number[],
  i: number,
): FVGZone | null {
  if (i < 2) return null;

  if (lows[i] > highs[i - 2]) {
    return {
      lower: highs[i - 2],
      upper: lows[i],
      barIndex: i,
    };
  }
  return null;
}

/**
 * State 6 — FVG_RETRACEMENT: Price touches FVG zone.
 * low[i] <= fvgZone.upper AND high[i] >= fvgZone.lower
 * Protected low must remain intact.
 */
function checkFVGRetracement(
  highs: number[],
  lows: number[],
  i: number,
  fvg: FVGZone,
): boolean {
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
 * low[i-1] > protectedLow, low[i-1] < low[i-2], low[i] > low[i-1],
 * close[i] > high[i-1]
 */
function checkHigherLow(
  highs: number[],
  lows: number[],
  closes: number[],
  i: number,
  protectedLow: number,
): boolean {
  if (i < 2) return false;

  return (
    lows[i - 1] > protectedLow &&
    lows[i - 1] < lows[i - 2] &&
    lows[i] > lows[i - 1] &&
    closes[i] > highs[i - 1]
  );
}

/**
 * State 8 — BSL_BUILT: Buy-side liquidity cluster.
 * bslLevel = max(highs[i-lookback .. i-1])
 * count >= minCluster highs within tolerance of bslLevel
 */
function checkBSL(
  highs: number[],
  i: number,
  lookback: number,
  tolerance: number,
  minCluster: number,
): BSLDetail | null {
  if (i < lookback) return null;

  const start = i - lookback;
  let bslLevel = highs[start];
  let bslBar = start;
  for (let j = start + 1; j < i; j++) {
    if (highs[j] > bslLevel) {
      bslLevel = highs[j];
      bslBar = j;
    }
  }

  // Count highs clustered near bslLevel
  let count = 0;
  for (let j = start; j < i; j++) {
    if (Math.abs(highs[j] - bslLevel) / bslLevel <= tolerance) {
      count++;
    }
  }

  if (count >= minCluster) {
    return { level: bslLevel, clusterCount: count, barIndex: bslBar };
  }
  return null;
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

// ── Main Engine ──

/**
 * Run the ICT state machine on OHLC data.
 * Processes candles sequentially from index 0 to N-1.
 * At each bar, checks for invalidation first, then attempts state advancement.
 */
export function runICTEngine(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  timestamps: number[],
): ICTSetup {
  const n = closes.length;
  if (n < SSL.LOOKBACK + 1) return emptySetup();

  const setup = emptySetup();

  // Track the best completed setup across potential resets
  let bestSetup = emptySetup();

  for (let i = 0; i < n; i++) {
    // ── 1. INVALIDATION CHECK ──
    if (
      setup.protectedLow !== null &&
      setup.currentState >= ICTState.SSL_RAID &&
      closes[i] <= setup.protectedLow
    ) {
      // Record invalidation
      const prevState = setup.currentState;
      if (prevState > bestSetup.currentState) {
        // Save the furthest state reached before invalidation
        bestSetup = { ...setup, invalidated: true, invalidationReason: `Close ${closes[i].toFixed(2)} <= protected low ${setup.protectedLow.toFixed(2)} at bar ${i}` };
        bestSetup.transitions = [...setup.transitions];
        bestSetup.bullishEvidence = [...setup.bullishEvidence];
        bestSetup.cautionEvidence = [...setup.cautionEvidence];
      }

      setup.cautionEvidence.push(`Invalidated at bar ${i}: close ${closes[i].toFixed(2)} <= protected low ${setup.protectedLow!.toFixed(2)}`);

      // Reset state
      setup.currentState = ICTState.NONE;
      setup.protectedLow = null;
      setup.mssLevel = null;
      setup.fvgZone = null;
      setup.bslLevel = null;
      setup.bslClusterCount = 0;
      setup.sslRaid = null;
      setup.retracementDepth = null;
      setup.higherLowBar = null;
      setup.cisd = { triggered: false, bearishOpen: null, bearishBarIndex: null };
      setup.distanceToBslPct = null;
      setup.sslBarIndex = null;
      continue;
    }

    // ── 2. STATE ADVANCEMENT ──
    const prevState = setup.currentState;

    // Try to advance to next state
    switch (setup.currentState) {
      case ICTState.NONE: {
        const raid = checkSSLRaid(lows, closes, timestamps, i, SSL.LOOKBACK);
        if (raid) {
          setup.currentState = ICTState.SSL_RAID;
          setup.sslRaid = raid;
          setup.protectedLow = raid.raidBarLow;
          setup.sslBarIndex = i;

          // Immediately compute structure high (State 2 — frozen at SSL moment)
          const mss = computeStructureHigh(highs, raid.raidBarIndex, MSS.LOOKBACK);
          if (mss !== null) {
            setup.mssLevel = mss;
            setup.currentState = ICTState.STRUCTURE_HIGH;
            setup.bullishEvidence.push(`SSL raid swept ${raid.sweptPrice.toFixed(2)}, reclaimed at ${closes[i].toFixed(2)}`);
            setup.bullishEvidence.push(`Structure high frozen at ${mss.toFixed(2)}`);
            recordTransition(setup, ICTState.NONE, ICTState.STRUCTURE_HIGH, i, timestamps[i], closes[i],
              `SSL raid swept ${raid.sweptPrice.toFixed(2)}, struct high ${mss.toFixed(2)}`);
          } else {
            setup.bullishEvidence.push(`SSL raid swept ${raid.sweptPrice.toFixed(2)}, reclaimed at ${closes[i].toFixed(2)}`);
            recordTransition(setup, ICTState.NONE, ICTState.SSL_RAID, i, timestamps[i], closes[i],
              `SSL raid swept ${raid.sweptPrice.toFixed(2)}`);
          }
        }
        break;
      }

      case ICTState.SSL_RAID: {
        // Should not normally stay here — structure high is computed at SSL_RAID.
        // But handle edge case where structure high couldn't be computed.
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

          // Check if displacement candle also triggers MSS
          if (setup.mssLevel !== null && checkMSS(closes, i, setup.mssLevel)) {
            setup.currentState = ICTState.BULLISH_MSS;
            setup.bullishEvidence.push(`MSS confirmed: close ${closes[i].toFixed(2)} > structure ${setup.mssLevel.toFixed(2)}`);
            recordTransition(setup, ICTState.BULLISH_DISPLACEMENT, ICTState.BULLISH_MSS, i, timestamps[i], closes[i],
              `MSS break ${setup.mssLevel.toFixed(2)}`);
          }
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
        const fvg = checkFVG(highs, lows, i);
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
          setup.bullishEvidence.push(`Higher low confirmed at ${lows[i - 1].toFixed(2)}, reclaim ${closes[i].toFixed(2)}`);
          recordTransition(setup, ICTState.FVG_RETRACEMENT, ICTState.HIGHER_LOW, i, timestamps[i], closes[i],
            `HL ${lows[i - 1].toFixed(2)}`);
        }
        break;
      }

      case ICTState.HIGHER_LOW: {
        const bsl = checkBSL(highs, i, BSL.LOOKBACK, BSL.CLUSTER_TOLERANCE, BSL.MIN_CLUSTER_COUNT);
        if (bsl) {
          setup.currentState = ICTState.BSL_BUILT;
          setup.bslLevel = bsl.level;
          setup.bslClusterCount = bsl.clusterCount;
          setup.bullishEvidence.push(`BSL built: ${bsl.level.toFixed(2)} (${bsl.clusterCount} clustered highs)`);
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
        // Update distance to BSL
        if (setup.bslLevel !== null) {
          setup.distanceToBslPct = ((setup.bslLevel - closes[i]) / setup.bslLevel) * 100;
        }

        // Check for CISD (TRIGGER)
        const cisd = detectBullishCISD(opens, closes, i);
        if (cisd.triggered) {
          setup.currentState = ICTState.TRIGGER;
          setup.cisd = cisd;
          setup.bullishEvidence.push(`CISD triggered: close ${closes[i].toFixed(2)} > bearish open ${cisd.bearishOpen!.toFixed(2)}`);
          recordTransition(setup, ICTState.ARMED, ICTState.TRIGGER, i, timestamps[i], closes[i],
            `CISD > ${cisd.bearishOpen!.toFixed(2)}`);
        }
        break;
      }

      case ICTState.TRIGGER: {
        // Check for IGNITION
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

      case ICTState.IGNITION: {
        // Terminal state — no further advancement
        break;
      }
    }

    // ── 3. CAUTION EVIDENCE ──
    if (setup.currentState >= ICTState.BSL_BUILT && setup.bslLevel !== null) {
      // Check if already broke BSL but no displacement (wick break)
      if (highs[i] > setup.bslLevel && closes[i] <= setup.bslLevel) {
        setup.cautionEvidence.push(`Wick above BSL at bar ${i} without displacement`);
      }
    }
  }

  setup.barsProcessed = n;

  // Return the further-advanced setup
  if (bestSetup.currentState > setup.currentState) {
    bestSetup.barsProcessed = n;
    return bestSetup;
  }
  return setup;
}
