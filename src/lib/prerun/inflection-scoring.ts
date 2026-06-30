/**
 * Inflection Engine scoring module — V2.
 *
 * Redesigned to use "signal readiness" instead of weighted-average scoring.
 * Key changes from V1:
 *   Fix 1: Signal-readiness framework — required signals + confirmation count + quality multiplier
 *   Fix 2: SE scores quality pullbacks (% from 3mo high), not just near-52w-low beatdowns
 *   Fix 3: RS uses trajectory (acceleration/trend) as primary, absolute level as secondary
 *   Fix 4: Null = neutral — null fields are excluded from denominators, not scored as 0
 *   Fix 5: Thresholds calibrated to actual achievable score distributions
 *
 * SERVER-ONLY: Used by /api/prerun/* routes.
 */

import "server-only";

import type {
  PreRunStockData,
  InflectionGates,
  InflectionScores,
  InflectionStage,
  InflectionTradeRead,
  InflectionResult,
} from "./types";

// ── Utility ──

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Null-neutral score aggregator.
 * Each component adds { earned, possible } only if data is available.
 * Final score = (totalEarned / totalPossible) * 100.
 * If no data at all, returns 0.
 */
interface ScoreSlot {
  earned: number;
  possible: number;
  hasData: boolean;
}

function nullNeutralScore(slots: ScoreSlot[]): number {
  const withData = slots.filter((s) => s.hasData);
  if (withData.length === 0) return 0;
  const totalEarned = withData.reduce((sum, s) => sum + s.earned, 0);
  const totalPossible = withData.reduce((sum, s) => sum + s.possible, 0);
  if (totalPossible === 0) return 0;
  return Math.round((totalEarned / totalPossible) * 100);
}

// ── Gates (lighter than institutional — targets inflection points, not leaders) ──

function evaluateGates(data: PreRunStockData): InflectionGates {
  const price = data.currentPrice ?? 0;
  const priceAbove5 = price >= 5;
  const avgDollarVolAbove10m = (data.vcpAvgDollarVolume ?? 0) >= 10_000_000;
  const mktCapAbove500m = (data.marketCap ?? 0) >= 500_000_000;
  const allPass = priceAbove5 && avgDollarVolAbove10m && mktCapAbove500m;
  return { priceAbove5, avgDollarVolAbove10m, mktCapAbove500m, allPass };
}

// ── 1. Seller Exhaustion (0-100, null-neutral) ──
// Fix 2: Includes both "near 52w low" AND "pullback from recent high" paths.
// Quality stocks pulling back 10-25% from 3mo high score well here.

function scoreSellerExhaustion(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 1a. Down-vol declining (0-20) — always available via avgVolumeUpDays/DownDays
  const avgUp = data.avgVolumeUpDays;
  const avgDown = data.avgVolumeDownDays;
  if (avgUp !== null && avgDown !== null) {
    const volRatio = avgDown > 0 ? avgUp / avgDown : 1;
    let earned = 0;
    if (volRatio >= 1.5) { earned = 20; evidence.push("Down-volume declining sharply"); }
    else if (volRatio >= 1.2) { earned = 14; evidence.push("Down-volume declining"); }
    else if (volRatio >= 1.0) { earned = 8; }
    else { caution.push("Selling volume still dominant"); }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 1b. RSI positioning (0-20)
  // Widened sweet spot: 30-55 all score well (not just 30-45)
  // Quality pullbacks land at RSI 40-55, beatdowns at RSI 25-40
  const rsi = data.rsi14;
  if (rsi !== null) {
    let earned = 0;
    if (rsi >= 30 && rsi <= 40) { earned = 20; evidence.push(`RSI recovering from oversold (${rsi.toFixed(0)})`); }
    else if (rsi > 40 && rsi <= 50) { earned = 18; evidence.push(`RSI in pullback zone (${rsi.toFixed(0)})`); }
    else if (rsi > 50 && rsi <= 55) { earned = 14; evidence.push(`RSI stabilizing (${rsi.toFixed(0)})`); }
    else if (rsi >= 25 && rsi < 30) { earned = 14; evidence.push("RSI deeply oversold — potential reversal"); }
    else if (rsi > 55 && rsi <= 65) { earned = 8; }
    else if (rsi > 65) { earned = 3; caution.push(`RSI elevated (${rsi.toFixed(0)}) — less room for entry`); }
    else { earned = 5; caution.push(`RSI extremely oversold (${rsi.toFixed(0)})`); }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 1c. Pullback depth — DUAL PATH (0-20)
  // Path A: % from 3-month high (pctFromBaseHigh) — catches quality pullbacks
  // Path B: Position in 52w range — catches turnarounds
  // Take the HIGHER of the two scores
  const price = data.currentPrice ?? 0;
  const low52w = data.low52w ?? 0;
  const high52w = data.high52w ?? price;
  const pctFromBase = data.pctFromBaseHigh;

  let pullbackScore = 0;
  // Path A: Quality pullback from recent high
  if (pctFromBase !== null) {
    if (pctFromBase >= 8 && pctFromBase <= 25) {
      pullbackScore = 20;
      evidence.push(`${pctFromBase.toFixed(0)}% pullback from base high — quality entry zone`);
    } else if (pctFromBase >= 5 && pctFromBase < 8) {
      pullbackScore = 15;
      evidence.push(`${pctFromBase.toFixed(0)}% pullback — shallow dip`);
    } else if (pctFromBase > 25 && pctFromBase <= 40) {
      pullbackScore = 12;
      evidence.push(`${pctFromBase.toFixed(0)}% pullback — deeper correction`);
    } else if (pctFromBase > 40) {
      pullbackScore = 6;
    } else {
      pullbackScore = 3; // Near highs, minimal pullback
    }
  }
  // Path B: Near 52w low (turnaround plays)
  if (price > 0 && low52w > 0 && high52w > low52w) {
    const pctAboveLow = ((price - low52w) / (high52w - low52w)) * 100;
    let lowScore = 0;
    if (pctAboveLow <= 15) { lowScore = 20; }
    else if (pctAboveLow <= 30) { lowScore = 14; }
    else if (pctAboveLow <= 50) { lowScore = 8; }

    if (lowScore > pullbackScore) {
      pullbackScore = lowScore;
      if (pctAboveLow <= 15) evidence.push("Near 52-week low — maximum exhaustion zone");
      else if (pctAboveLow <= 30) evidence.push("Lower range of 52-week band");
    }
  }
  if (pctFromBase !== null || (price > 0 && low52w > 0)) {
    slots.push({ earned: pullbackScore, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 1d. VP divergence (0/15)
  if (data.vpDivergenceBullish !== null) {
    slots.push({
      earned: data.vpDivergenceBullish ? 15 : 0,
      possible: 15,
      hasData: true,
    });
    if (data.vpDivergenceBullish) evidence.push("Volume-price divergence: selling drying up");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 1e. Failed breakdown recovery (0-15)
  if (data.failedBreakdownRecovery !== null) {
    const fbd = data.failedBreakdownRecovery;
    let earned = 0;
    if (fbd >= 2) { earned = 15; evidence.push("Failed breakdown + recovery — bears trapped"); }
    else if (fbd >= 1) { earned = 8; evidence.push("Wick test of support — holding"); }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 1f. Down-day bodies shrinking (0-15)
  if (data.avgDownDayBody !== null && data.avgDownDayBodyPrev !== null && data.avgDownDayBodyPrev > 0) {
    const ratio = data.avgDownDayBody / data.avgDownDayBodyPrev;
    let earned = 0;
    if (ratio <= 0.5) { earned = 15; evidence.push("Down-day bodies shrinking significantly"); }
    else if (ratio <= 0.7) { earned = 10; evidence.push("Down-day candles getting smaller"); }
    else if (ratio <= 0.9) { earned = 5; }
    else { caution.push("Down-day bodies not shrinking"); }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 2. Volatility Compression (0-100, null-neutral) ──

function scoreVolatilityCompression(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 2a. ATR ratio 5/20 (0-25)
  if (data.atrRatio5v20 !== null) {
    const atrRatio = data.atrRatio5v20;
    let earned = 0;
    if (atrRatio <= 0.5) { earned = 25; evidence.push("Extreme volatility compression (ATR ratio " + atrRatio.toFixed(2) + ")"); }
    else if (atrRatio <= 0.65) { earned = 20; evidence.push("Strong volatility squeeze (ATR ratio " + atrRatio.toFixed(2) + ")"); }
    else if (atrRatio <= 0.8) { earned = 14; evidence.push("Volatility contracting"); }
    else if (atrRatio <= 0.95) { earned = 8; evidence.push("Mild compression"); }
    else if (atrRatio <= 1.05) { earned = 3; }
    else { caution.push("Volatility expanding — no compression"); }
    slots.push({ earned, possible: 25, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 2b. Range contraction (0-25)
  const r5 = data.vcpRange5d;
  const r10 = data.vcpRange10d;
  const r20 = data.vcpRange20d;
  if (r5 !== null && r10 !== null && r20 !== null && r20 > 0) {
    const rangeRatio5v20 = r5 / r20;
    let earned = 0;
    if (r5 < r10 && r10 < r20 && rangeRatio5v20 <= 0.35) {
      earned = 25; evidence.push("Tight nested ranges contracting sharply (5d/20d: " + (rangeRatio5v20 * 100).toFixed(0) + "%)");
    } else if (r5 < r10 && r10 < r20 && rangeRatio5v20 <= 0.55) {
      earned = 20; evidence.push("Nested ranges contracting (5d/20d: " + (rangeRatio5v20 * 100).toFixed(0) + "%)");
    } else if (r5 < r10 && r10 < r20) {
      earned = 14; evidence.push("Ranges nesting (5d < 10d < 20d)");
    } else if (rangeRatio5v20 <= 0.55) {
      earned = 10; evidence.push("5d range contracted vs 20d");
    } else if (r5 < r10) {
      earned = 5;
    }
    slots.push({ earned, possible: 25, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 2c. Tight closes (0/15)
  if (data.vcpTightCloses !== null) {
    slots.push({
      earned: data.vcpTightCloses ? 15 : 0,
      possible: 15,
      hasData: true,
    });
    if (data.vcpTightCloses) evidence.push("Tight cluster of closes — coiling");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 2d. Inside bars (0-15)
  if (data.vcpInsideBarCount !== null) {
    const insideBars = data.vcpInsideBarCount;
    let earned = 0;
    if (insideBars >= 3) { earned = 15; evidence.push(`${insideBars} inside bars — extreme compression`); }
    else if (insideBars >= 2) { earned = 10; evidence.push(`${insideBars} inside bars`); }
    else if (insideBars >= 1) { earned = 5; }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 2e. Dry volume days (0-20)
  if (data.vcpDryVolumeDays !== null) {
    const dryDays = data.vcpDryVolumeDays;
    let earned = 0;
    if (dryDays >= 5) { earned = 20; evidence.push("Multiple dry volume days — volume drying up"); }
    else if (dryDays >= 3) { earned = 14; evidence.push("Volume declining into base"); }
    else if (dryDays >= 2) { earned = 8; }
    else if (dryDays >= 1) { earned = 3; }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 3. Buyer Emergence (0-100, null-neutral) ──

function scoreBuyerEmergence(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 3a. Up/down volume ratio (0-20)
  if (data.avgVolumeUpDays !== null && data.avgVolumeDownDays !== null) {
    const volRatio = data.avgVolumeDownDays > 0 ? data.avgVolumeUpDays / data.avgVolumeDownDays : 1;
    let earned = 0;
    if (volRatio >= 1.8) { earned = 20; evidence.push("Strong up-volume dominance"); }
    else if (volRatio >= 1.4) { earned = 15; evidence.push("Up-volume exceeding down-volume"); }
    else if (volRatio >= 1.1) { earned = 8; }
    else { caution.push("No clear volume-side dominance for buyers"); }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 3b. OBV divergence (0/15)
  if (data.obvDivergent !== null) {
    slots.push({
      earned: data.obvDivergent ? 15 : 0,
      possible: 15,
      hasData: true,
    });
    if (data.obvDivergent) evidence.push("OBV divergence — stealth buying");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 3c. Higher lows (0-20)
  if (data.higherLowsCount !== null) {
    const hl = data.higherLowsCount;
    let earned = 0;
    if (hl >= 3) { earned = 20; evidence.push("3 higher lows — clear accumulation structure"); }
    else if (hl >= 2) { earned = 14; evidence.push("Higher lows forming"); }
    else if (hl >= 1) { earned = 7; }
    else { caution.push("No higher lows — no structural improvement"); }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 3d. EMA reclaim (0-15)
  if (data.aboveEma21 !== null || data.aboveEma50 !== null) {
    let earned = 0;
    if (data.aboveEma21 === true && data.aboveEma50 === true) {
      earned = 15; evidence.push("Price above 21 and 50 EMA — trend reclaimed");
    } else if (data.aboveEma21 === true) {
      earned = 10; evidence.push("Price above 21 EMA");
    } else if (data.aboveEma50 === true) {
      earned = 7;
    }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 3e. Accumulation days (0-15)
  if (data.accumulationDayCount !== null) {
    const accumDays = data.accumulationDayCount;
    let earned = 0;
    if (accumDays >= 8) { earned = 15; evidence.push(`${accumDays} accumulation days in 20 sessions`); }
    else if (accumDays >= 5) { earned = 10; evidence.push(`${accumDays} accumulation days`); }
    else if (accumDays >= 3) { earned = 5; }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 3f. Breakout proximity (0-15)
  if (data.pctFromBaseHigh !== null) {
    const pctFromBase = data.pctFromBaseHigh;
    let earned = 0;
    if (pctFromBase <= 3) { earned = 15; evidence.push("Near breakout level"); }
    else if (pctFromBase <= 7) { earned = 10; evidence.push("Approaching base high"); }
    else if (pctFromBase <= 12) { earned = 5; }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 4. Relative Strength (0-100, null-neutral) ──
// Fix 3: Trajectory is PRIMARY (50% of possible points), absolute level is SECONDARY.
// At inflection points, RS is inherently negative. The signal is RS *improving*.

function scoreRelativeStrength(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 4a. RS acceleration / trajectory (0-35) — PRIMARY SIGNAL
  // A stock going from -15% to -8% RS is a strong inflection signal.
  if (data.instRsAccelVsSPY !== null || data.instRsAccelTrend !== null) {
    const rsAccel = data.instRsAccelVsSPY ?? 0;
    const rsAccelTrend = data.instRsAccelTrend ?? 0;
    let earned = 0;

    if (rsAccel >= 5) {
      earned = 35; evidence.push("RS accelerating sharply vs SPY");
    } else if (rsAccel >= 3) {
      earned = 28; evidence.push("RS acceleration positive");
    } else if (rsAccel >= 1) {
      earned = 22; evidence.push("RS improving vs SPY");
    } else if (rsAccel >= 0) {
      earned = 15;
    } else if (rsAccel >= -2 && rsAccelTrend > 0) {
      // RS still slightly negative but trajectory turning — classic early inflection
      earned = 18; evidence.push("RS trajectory improving (early inflection signal)");
    } else if (rsAccelTrend > 0) {
      earned = 10; evidence.push("RS trajectory turning positive");
    } else if (rsAccel >= -3) {
      earned = 5;
    }

    // Trend confirmation bonus (included in 35 max)
    if (rsAccelTrend >= 2) { earned = Math.min(35, earned + 5); evidence.push("RS acceleration trending higher day over day"); }
    else if (rsAccelTrend >= 0.5) { earned = Math.min(35, earned + 3); }

    slots.push({ earned, possible: 35, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 4b. RS vs SPY — absolute level (0-15) — SECONDARY (reduced from 25)
  if (data.vcpRelStrengthVsSPY !== null) {
    const rsSpy = data.vcpRelStrengthVsSPY;
    let earned = 0;
    if (rsSpy >= 10) { earned = 15; evidence.push(`Outperforming SPY by ${rsSpy.toFixed(1)}pp — strong RS`); }
    else if (rsSpy >= 5) { earned = 12; evidence.push(`Outperforming SPY by ${rsSpy.toFixed(1)}pp`); }
    else if (rsSpy >= 2) { earned = 9; }
    else if (rsSpy >= 0) { earned = 6; }
    else if (rsSpy >= -5) { earned = 3; }
    else if (rsSpy >= -10) { earned = 1; }
    else { caution.push(`Underperforming SPY by ${Math.abs(rsSpy).toFixed(1)}pp`); }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 4c. RS vs sector — absolute level (0-15) — SECONDARY
  if (data.relativeStrength20d !== null) {
    const rsSector = data.relativeStrength20d;
    let earned = 0;
    if (rsSector >= 8) { earned = 15; evidence.push(`Leading sector by ${rsSector.toFixed(1)}pp`); }
    else if (rsSector >= 4) { earned = 12; evidence.push(`Outperforming sector by ${rsSector.toFixed(1)}pp`); }
    else if (rsSector >= 1) { earned = 8; }
    else if (rsSector >= 0) { earned = 5; }
    else if (rsSector >= -3) { earned = 2; }
    else { caution.push("Lagging sector peers"); }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 4d. Holds in market weakness (0-15)
  if (data.sectorReturn20d !== null && data.relativeStrength20d !== null) {
    const sectorRet = data.sectorReturn20d;
    const rsSector = data.relativeStrength20d;
    let earned = 0;
    if (sectorRet < -3 && rsSector > 3) {
      earned = 15; evidence.push("Holding strong while sector weakens — relative leader");
    } else if (sectorRet < 0 && rsSector > 0) {
      earned = 10;
    } else if (sectorRet >= 3 && rsSector > 3) {
      earned = 7;
    } else {
      earned = 3;
    }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 5. Liquidity / Auction (0-100) ──
// Mostly null-safe already (fields come from Yahoo), but apply null-neutral for consistency.

function scoreLiquidityAuction(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 5a. Dollar volume (0-25)
  if (data.vcpAvgDollarVolume !== null) {
    const dollarVol = data.vcpAvgDollarVolume;
    let earned = 0;
    if (dollarVol >= 500_000_000) { earned = 25; evidence.push("Excellent liquidity"); }
    else if (dollarVol >= 100_000_000) { earned = 20; }
    else if (dollarVol >= 50_000_000) { earned = 14; }
    else if (dollarVol >= 10_000_000) { earned = 8; }
    else { caution.push("Low dollar volume — potential slippage"); }
    slots.push({ earned, possible: 25, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 5b. Avg volume (0-20)
  if (data.vcpAvgVolume50d !== null) {
    const avgVol50d = data.vcpAvgVolume50d;
    let earned = 0;
    if (avgVol50d >= 5_000_000) { earned = 20; }
    else if (avgVol50d >= 2_000_000) { earned = 15; }
    else if (avgVol50d >= 500_000) { earned = 10; }
    else if (avgVol50d >= 200_000) { earned = 5; }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 5c. Volume consistency 10d/50d (0-20)
  if (data.vcpAvgVolume50d !== null && data.vcpAvgVolume10d !== null && data.vcpAvgVolume50d > 0) {
    const volConsistency = data.vcpAvgVolume10d / data.vcpAvgVolume50d;
    let earned = 0;
    if (volConsistency >= 0.8 && volConsistency <= 1.3) {
      earned = 20; evidence.push("Consistent volume profile");
    } else if (volConsistency >= 0.6 && volConsistency <= 1.8) {
      earned = 12;
    } else if (volConsistency > 1.8) {
      earned = 8; evidence.push("Recent volume surge");
    }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 5d. Float turnover (0-20)
  if (data.floatTurnover20d !== null) {
    const ft = data.floatTurnover20d;
    let earned = 0;
    if (ft >= 2.0) { earned = 20; evidence.push("High float turnover — active trading"); }
    else if (ft >= 1.0) { earned = 14; }
    else if (ft >= 0.5) { earned = 8; }
    else if (ft >= 0.2) { earned = 4; }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 5e. Auction quality proxy — ATR ratio (0-15)
  if (data.atrRatio5v20 !== null) {
    const atrRatio = data.atrRatio5v20;
    let earned = 0;
    if (atrRatio <= 0.65) { earned = 15; evidence.push("Orderly auction — volatility contracting"); }
    else if (atrRatio <= 0.85) { earned = 10; }
    else if (atrRatio <= 1.0) { earned = 5; }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 6. Institutional Participation (0-100, null-neutral) ──

function scoreInstitutionalParticipation(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 6a. OBV divergence (0/20) — stealth accumulation
  if (data.obvDivergent !== null) {
    slots.push({
      earned: data.obvDivergent ? 20 : 0,
      possible: 20,
      hasData: true,
    });
    if (data.obvDivergent) evidence.push("OBV near highs while price consolidates — institutional buying");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 6b. Distribution days (0-20)
  if (data.distributionDays20d !== null) {
    const distDays = data.distributionDays20d;
    let earned = 0;
    if (distDays <= 1) { earned = 20; evidence.push("Zero/minimal distribution — clean accumulation"); }
    else if (distDays <= 3) { earned = 14; }
    else if (distDays <= 5) { earned = 7; }
    else { caution.push(`${distDays} distribution days — institutional selling possible`); }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 6c. Institutional ownership (0-15)
  if (data.institutionalPct !== null && data.institutionalPct > 0) {
    const instPct = data.institutionalPct;
    let earned = 0;
    if (instPct >= 70) { earned = 15; evidence.push(`${instPct.toFixed(0)}% institutional ownership`); }
    else if (instPct >= 50) { earned = 10; }
    else if (instPct >= 30) { earned = 5; }
    else { caution.push("Low institutional ownership"); }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 6d. Insider buying (0-15)
  if (data.insiderBuys90d !== null || data.insiderBuys45d !== null) {
    const insiderBuys = data.insiderBuys90d ?? 0;
    const insiderBuys45d = data.insiderBuys45d ?? 0;
    let earned = 0;
    if (insiderBuys45d >= 3) { earned = 15; evidence.push(`${insiderBuys45d} insider buys in 45 days — cluster`); }
    else if (insiderBuys >= 3) { earned = 12; evidence.push(`${insiderBuys} insider buys in 90 days`); }
    else if (insiderBuys >= 1) { earned = 6; }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 6e. Float turnover (0-15)
  if (data.floatTurnover20d !== null) {
    const ft = data.floatTurnover20d;
    let earned = 0;
    if (ft >= 2.0) { earned = 15; }
    else if (ft >= 1.0) { earned = 10; }
    else if (ft >= 0.5) { earned = 5; }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 6f. Block trade proxy (0-15)
  if (data.vcpAvgVolume50d !== null && data.vcpAvgVolume10d !== null && data.vcpAvgVolume50d > 0) {
    let earned = 0;
    if (data.vcpAvgVolume10d > data.vcpAvgVolume50d * 1.5) {
      earned = 15; evidence.push("Recent volume surge — possible block trades");
    } else if (data.vcpAvgVolume10d > data.vcpAvgVolume50d * 1.2) {
      earned = 8;
    }
    slots.push({ earned, possible: 15, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── Stage Classification ──
// Fix 5: Thresholds lowered to match achievable score ranges.
// With null-neutral scoring, typical quality inflection stocks score 50-70.

function classifyStage(
  se: number, vc: number, be: number, rs: number,
  data: PreRunStockData,
): InflectionStage {
  const pctFromAth = data.pctFromAth ?? 100;

  // EXPANSION: near ATH with decent RS
  if (pctFromAth < 10 && rs >= 40) return "EXPANSION";

  // EARLY_ACCUMULATION: buyers clearly emerging
  if (be >= 50 && rs >= 35 && se >= 30) return "EARLY_ACCUMULATION";
  // Alt path: very strong buyer emergence compensates for weaker RS
  if (be >= 55 && se >= 35 && vc >= 25) return "EARLY_ACCUMULATION";

  // INFLECTION: sellers exhausted + compressed + buyers starting
  if (se >= 40 && vc >= 30 && be >= 25) return "INFLECTION";
  // Alt path: strong exhaustion + emerging buyers even without full compression
  if (se >= 50 && be >= 30 && vc >= 15) return "INFLECTION";
  // Alt path: very strong compression + decent exhaustion
  if (vc >= 50 && se >= 35 && be >= 20) return "INFLECTION";

  // SELLER_EXHAUSTION: selling pressure declining
  if (se >= 35 && vc >= 15) return "SELLER_EXHAUSTION";
  if (se >= 45) return "SELLER_EXHAUSTION";

  // DISTRIBUTION: default
  return "DISTRIBUTION";
}

// ── Trade Read ──
// Fix 5: STARTER threshold lowered from 70 to 55, reflecting actual achievable ranges.

function determineTradeRead(
  stage: InflectionStage,
  overall: number,
  be: number,
  extensionRisk: boolean,
): InflectionTradeRead {
  if (stage === "DISTRIBUTION" || extensionRisk) return "AVOID";
  if (stage === "SELLER_EXHAUSTION") return "WATCH";
  if (stage === "EARLY_ACCUMULATION" && be >= 60) return "ADD_ON_CONFIRMATION";
  if (stage === "INFLECTION" && overall >= 55) return "STARTER_POSITION_CANDIDATE";
  if (stage === "EARLY_ACCUMULATION" && overall >= 50) return "STARTER_POSITION_CANDIDATE";
  if (stage === "EXPANSION") return "ADD_ON_CONFIRMATION";
  return "WATCH";
}

// ── Extension Risk ──

function checkExtensionRisk(data: PreRunStockData): boolean {
  const pctFromAth = data.pctFromAth ?? 100;
  const distEma = data.instDistFromEma20Atr ?? 0;
  return pctFromAth < 5 || distEma > 3;
}

// ── Invalidation Level ──

function calcInvalidationLevel(data: PreRunStockData): number | null {
  const price = data.currentPrice ?? 0;
  const sma50 = data.vcpSma50 ?? 0;
  const low52w = data.low52w ?? 0;

  if (sma50 > 0 && sma50 < price) return sma50;
  if (low52w > 0) return low52w;
  return null;
}

// ── Main Scoring Function ──

export function scoreInflection(data: PreRunStockData): InflectionResult {
  const gates = evaluateGates(data);

  const seResult = scoreSellerExhaustion(data);
  const vcResult = scoreVolatilityCompression(data);
  const beResult = scoreBuyerEmergence(data);
  const rsResult = scoreRelativeStrength(data);
  const laResult = scoreLiquidityAuction(data);
  const ipResult = scoreInstitutionalParticipation(data);

  // Fix 1: Signal-readiness overall score.
  // Instead of flat weighted average, use:
  //   Base score = weighted average of category scores (same weights)
  //   Quality multiplier = LA score acts as a scaling factor (0.6 - 1.0)
  //   This ensures illiquid stocks get dampened while liquid stocks get full credit.

  const rawWeighted =
    seResult.score * 0.25 +     // SE gets more weight (was 0.20)
    vcResult.score * 0.15 +     // VC stays same
    beResult.score * 0.25 +     // BE stays same
    rsResult.score * 0.10 +     // RS reduced (was 0.15) — trajectory matters, not level
    ipResult.score * 0.10;      // IP reduced (was 0.15)

  // LA acts as quality multiplier (0.6 - 1.0 range)
  // Liquid stocks (LA >= 60) get full credit; illiquid stocks get dampened
  const qualityMultiplier = 0.6 + (Math.min(laResult.score, 100) / 100) * 0.4;

  const overallScore = Math.round(rawWeighted * qualityMultiplier);

  const scores: InflectionScores = {
    sellerExhaustion: seResult.score,
    volatilityCompression: vcResult.score,
    buyerEmergence: beResult.score,
    relativeStrength: rsResult.score,
    liquidityAuction: laResult.score,
    institutionalParticipation: ipResult.score,
    overallScore,
  };

  const stage = classifyStage(seResult.score, vcResult.score, beResult.score, rsResult.score, data);
  const extensionRisk = checkExtensionRisk(data);
  const tradeRead = determineTradeRead(stage, overallScore, beResult.score, extensionRisk);

  // Merge all evidence
  const bullishEvidence = [
    ...seResult.evidence,
    ...vcResult.evidence,
    ...beResult.evidence,
    ...rsResult.evidence,
    ...laResult.evidence,
    ...ipResult.evidence,
  ];
  const cautionEvidence = [
    ...seResult.caution,
    ...vcResult.caution,
    ...beResult.caution,
    ...rsResult.caution,
    ...laResult.caution,
    ...ipResult.caution,
  ];

  const invalidationLevel = calcInvalidationLevel(data);

  // Fix 5: Signal classification with achievable thresholds
  const isPrimarySignal =
    overallScore >= 55 &&
    (stage === "INFLECTION" || stage === "EARLY_ACCUMULATION") &&
    tradeRead === "STARTER_POSITION_CANDIDATE" &&
    !extensionRisk;

  const isStrongerSignal =
    overallScore >= 65 &&
    beResult.score >= 55 &&
    seResult.score >= 50 &&
    !extensionRisk;

  return {
    data,
    gates,
    scores,
    stage,
    tradeRead,
    extensionRisk,
    bullishEvidence,
    cautionEvidence,
    invalidationLevel,
    isPrimarySignal,
    isStrongerSignal,
  };
}
