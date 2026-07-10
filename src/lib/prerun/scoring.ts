/**
 * Pre-Run scoring engine.
 * 3 hard gates + 18 criteria (A-Q + M2) with weighted scoring.
 * B and C expanded to 0-3, D expanded to 0-3, F expanded to 0-3. Max raw = 40.
 * Modifiers (not in MAX_SCORE): sector momentum +1/0/-1, sector quadrant +2/0/-1/-2.
 */

import type {
  PreRunStockData,
  PreRunGates,
  PreRunScores,
  PreRunVerdict,
  PreRunResult,
} from "./types";
import { matchBestPattern, type PatternMatchResult } from "./patterns";

/** Universal quality gate: filters low-quality stocks before scoring.
 *  price >= $15, marketCap >= $8B, avgDollarVolume >= $100M/day. */
export function passesUniverseQualityGates(data: PreRunStockData): boolean {
  const price = data.currentPrice ?? 0;
  const mcap = data.marketCap ?? 0;
  const dollarVol = data.vcpAvgDollarVolume ?? 0;
  const dq = data.dataQuality ?? 100; // treat missing as full quality
  return price >= 15 && mcap >= 8_000_000_000 && dollarVol >= 100_000_000 && dq >= 40;
}

/** Gate 1: Has the run already happened? */
export function evaluateGate1(data: PreRunStockData, threshold = 20): boolean {
  if (data.pctFromAth === null) return false;
  return data.pctFromAth >= threshold;
}

/** Gate 2: Existential risk? (manual — passed from watchlist). */
export function evaluateGate2(gate2Pass: boolean): boolean {
  return gate2Pass;
}

/** Gate 3: Base forming, not freefall? */
export function evaluateGate3(data: PreRunStockData): boolean {
  if (data.currentPrice === null || data.sma20 === null) return false;
  // Price above 92% of SMA20 = likely forming a base
  return data.currentPrice > data.sma20 * 0.92;
}

/** Criterion A: Dead money base (0-2). Price decline + time basing.
 *  Time decay: bases > 104 weeks (2 years) get score halved (rounded down). */
export function scoreA(data: PreRunStockData): number {
  const pct = data.pctFromAth ?? 0;
  const weeks = data.weeksInBase ?? 0;

  let raw = 0;
  if (pct >= 40 && weeks >= 13) raw = 2;      // 40%+ down AND 3+ months basing
  else if (pct >= 25 && weeks >= 8) raw = 1;   // 25%+ down AND 2+ months
  else if (pct >= 40) raw = 1;                 // Deep discount floor — 40%+ off ATH always scores 1

  // Time decay: bases older than 2 years lose energy
  if (weeks > 104) {
    raw = Math.floor(raw * 0.5);
  }

  return raw;
}

/** Criterion B: Short interest (0-3, expanded scale). */
export function scoreB(data: PreRunStockData): number {
  const si = data.shortFloat ?? 0;
  const mcap = data.marketCap ?? 0;
  const smallCap = mcap < 20_000_000_000; // < $20B

  if (si >= 20 && smallCap) return 3;  // Extreme squeeze potential
  if (si >= 15 && smallCap) return 2;
  if (si >= 10) return 1;
  if (si >= 5) return 1;  // 5-10% moderate fuel
  return 0;
}

/** Criterion C: Narrative catalyst (manual — 0/1/2/3, expanded scale). */
export function scoreC(manualScore: number): number {
  return Math.max(0, Math.min(3, manualScore));
}

/** Criterion D: Earnings inflection (0-3, boosted proximity).
 *  Enhanced with revenue acceleration, earnings beat streak, and imminent earnings tier. */
export function scoreD(data: PreRunStockData): number {
  const revGrowth = data.revenueGrowthYoY ?? 0;
  const daysToEarn = data.daysToEarnings;
  const beatStreak = data.earningsBeatStreak ?? 0;

  // Revenue acceleration from quarterly data
  let revenueAccelerating = false;
  if (data.quarterlyRevenue && data.quarterlyRevenue.length >= 3) {
    const sorted = [...data.quarterlyRevenue].sort((a, b) => a.period.localeCompare(b.period));
    const recent = sorted.slice(-3);
    if (recent.length >= 3 && recent[0].value > 0 && recent[1].value > 0) {
      const growth1 = (recent[1].value - recent[0].value) / recent[0].value;
      const growth2 = (recent[2].value - recent[1].value) / recent[1].value;
      revenueAccelerating = growth2 > growth1;
    }
  }

  // Earnings proximity tiers
  const earningsImm = daysToEarn !== null && daysToEarn <= 14;  // imminent
  const earningsNear = daysToEarn !== null && daysToEarn <= 30;
  const earningsSoon = daysToEarn !== null && daysToEarn <= 60;

  // Score 3: imminent earnings + strong fundamentals
  if (earningsImm && (revenueAccelerating || revGrowth > 20) && beatStreak >= 2) return 3;
  if (earningsImm && beatStreak >= 3) return 3;

  // Score 2: near earnings with catalyst signals
  if ((revenueAccelerating || revGrowth > 20) && earningsNear && beatStreak >= 2) return 2;
  if (revGrowth > 20 && earningsNear) return 2;
  if (revenueAccelerating && earningsNear) return 2;
  if (earningsImm && (revGrowth > 0 || beatStreak >= 1)) return 2;

  // Score 1: positive signals
  if (revGrowth > 0 || earningsSoon || beatStreak >= 2) return 1;

  return 0;
}

/** Criterion E: Institutional under-ownership (0-2). */
export function scoreE(data: PreRunStockData): number {
  const instPct = data.institutionalPct;
  if (instPct !== null) {
    if (instPct < 40) return 2;  // Genuinely under-owned
    if (instPct <= 70) return 1; // Moderate
    return 0;                    // Fully owned, no room for new buyers
  }
  // Fallback to analyst count if no institutional data
  const analysts = data.analystCount ?? 0;
  if (analysts === 0) return 1;
  if (analysts < 10) return 2;
  if (analysts <= 20) return 1;
  return 0;
}

/** Criterion F: Volume accumulation (0-3). Enhanced with float turnover + OBV/VP leading indicators. */
export function scoreF(data: PreRunStockData): number {
  const avgUp = data.avgVolumeUpDays ?? 0;
  const avgDown = data.avgVolumeDownDays ?? 0;
  const floatTurnover = data.floatTurnover20d ?? 0;

  let base = 0;
  if (avgDown === 0) {
    base = avgUp > 0 ? 2 : 0;
  } else {
    const ratio = avgUp / avgDown;
    if (ratio >= 1.3 || (ratio >= 1.0 && floatTurnover >= 1.0)) base = 2;
    else if (ratio >= 1.0) base = 1;
  }

  // Leading volume bonus: +1 only if BOTH OBV divergent AND bullish VP divergence
  const obvDivergent = data.obvDivergent === true;
  const vpBullish = data.vpDivergenceBullish === true;
  const bonus = (obvDivergent && vpBullish) ? 1 : 0;

  return Math.min(3, base + bonus);
}

/** Criterion G: Index inclusion potential (manual — 0/1/2). */
export function scoreG(manualScore: number): number {
  return Math.max(0, Math.min(2, manualScore));
}

/** Criterion H: Insider buying (0-2). Uses 45d cluster detection for early signals. */
export function scoreH(data: PreRunStockData): number {
  const buys90 = data.insiderBuys90d ?? 0;
  const buys45 = data.insiderBuys45d ?? 0;
  // 45d cluster is more actionable (recent buying)
  if (buys45 >= 2) return 2;   // Recent cluster buying — strong early signal
  if (buys90 >= 3) return 2;   // Spread cluster over 90d — still strong conviction
  if (buys45 >= 1) return 1;   // Recent insider interest
  if (buys90 >= 1) return 1;   // Some insider interest
  return 0;
}

/** Criterion I: Options flow / put-call skew (0-2). */
export function scoreI(data: PreRunStockData): number {
  const pcr = data.putCallRatio;
  if (pcr === null) return 0;
  if (pcr < 0.5) return 2;    // Bullish accumulation — heavy call buying
  if (pcr <= 1.0) return 1;   // Neutral
  return 0;                    // Bearish — puts dominate
}

/** Criterion J: Relative strength vs sector (0-2). */
export function scoreJ(data: PreRunStockData): number {
  const rs = data.relativeStrength20d;
  if (rs === null) return 0;
  if (rs > 5) return 2;      // Outperforming sector by >5%
  if (rs >= -5) return 1;    // Within 5% of sector
  return 0;                   // Underperforming sector by >5%
}

/** Criterion K: Breakout proximity (0-2). */
export function scoreK(data: PreRunStockData): number {
  const pct = data.pctFromBaseHigh;
  if (pct === null) return 0;
  if (pct <= 5) return 2;     // Within 5% of base high (coiling near breakout)
  if (pct <= 10) return 1;    // 5-10% below resistance
  return 0;                    // >10% below resistance
}

/** Criterion L: Higher Lows (0-2). Swing low structure within base. */
export function scoreL(data: PreRunStockData): number {
  const count = data.higherLowsCount;
  if (count === null) return 0;
  if (count >= 3) return 2;  // All 3 swing lows are higher — clear upward structure
  if (count >= 2) return 1;  // 2 of 3 swing lows higher — partial structure
  return 0;
}

/** Criterion M: EMA Reclaim (0-2). Price reclaiming key moving averages. */
export function scoreM(data: PreRunStockData): number {
  const above21 = data.aboveEma21;
  const above50 = data.aboveEma50;
  const crossedRecently = data.emaCrossoverWithin20d;

  if (above21 === null || above50 === null) return 0;

  // Score 2: Above both EMAs AND crossed above within last 20 days
  if (above21 && above50 && crossedRecently === true) return 2;
  // Score 1: Above one EMA, or above both but crossover was >20 days ago (or crossover data missing)
  if (above21 || above50) return 1;
  // Score 0: Below both
  return 0;
}

/** Criterion M2: EMA 10/20 Timing Signal (0-2).
 *  Multi-timeframe momentum confirmation for daily-level base breakouts.
 *  Score 2 via recent cross OR displacement+FVG near cross (additive path). */
export function scoreM2(data: PreRunStockData): number {
  const bullish = data.emaM2BullishCross;
  const recentCross = data.emaM2CrossedWithin5Bars;
  const aboveBoth = data.emaM2PriceAboveBoth;
  const displacement = data.emaM2DisplacementNearCross;
  const fvg = data.emaM2FvgNearCross;

  if (bullish === null || aboveBoth === null) return 0;

  // Score 2: Bullish cross + price above both EMAs + (recent crossover OR displacement+FVG)
  const hasDisplacementFVG = displacement === true && fvg === true;
  if (bullish && aboveBoth && (recentCross === true || hasDisplacementFVG)) return 2;
  // Score 1: Bullish alignment (EMA10 > EMA20) or price above both
  if (bullish || aboveBoth) return 1;
  // Score 0: Bearish alignment
  return 0;
}

/** Criterion N: Range Coil / Tight Closes Near Top (0-2). */
export function scoreN(data: PreRunStockData): number {
  const nearTop = data.closesNearRangeTop;
  const contracting = data.atrContracting;

  if (nearTop === null && contracting === null) return 0;

  // Score 2: Both conditions met — coiling near resistance with declining volatility
  if (nearTop === true && contracting === true) return 2;
  // Score 1: One condition confirmed true (null doesn't count)
  if (nearTop === true || contracting === true) return 1;
  return 0;
}

/** Criterion O: Failed Breakdown Recovery (0-2). */
export function scoreO(data: PreRunStockData): number {
  const score = data.failedBreakdownRecovery;
  if (score === null) return 0;
  return Math.max(0, Math.min(2, score));
}

/** Criterion P: Earnings revision momentum (0-2).
 *  Analysts upgrading = bullish consensus shift not yet priced in. */
export function scoreP(data: PreRunStockData): number {
  const trend = data.analystRevisionTrend;
  if (trend === null) return 0;
  if (trend > 0) return 2;   // Improving — analysts upgrading
  if (trend === 0) return 1; // Stable
  return 0;                   // Declining
}

/** Criterion Q: Short squeeze probability (0-2).
 *  Composite signal: SI% + float turnover + insider buys + bullish options. */
export function scoreQ(data: PreRunStockData): number {
  let signals = 0;
  const si = data.shortFloat ?? 0;
  if (si >= 15) signals++;
  if ((data.floatTurnover20d ?? 0) >= 0.8) signals++;
  if ((data.insiderBuys90d ?? 0) >= 1) signals++;
  if (data.putCallRatio !== null && data.putCallRatio < 0.7) signals++;

  if (signals >= 3) return 2;
  if (signals >= 2) return 1;
  return 0;
}

/** Sector momentum modifier: +1 if sector ETF 20d return > +5%, -1 if < -5%. */
export function calcSectorModifier(data: PreRunStockData): number {
  const sectorRet = data.sectorReturn20d;
  if (sectorRet === null) return 0;
  if (sectorRet > 5) return 1;   // Sector tailwind
  if (sectorRet < -5) return -1; // Sector headwind
  return 0;
}

/** Auto-suggest for Criterion G based on market cap + profitability. */
export function suggestScoreG(data: PreRunStockData): number {
  const mcap = data.marketCap ?? 0;
  const revGrowth = data.revenueGrowthYoY ?? 0;
  if (mcap > 5_000_000_000 && revGrowth > 0) return 2; // Large + profitable + growing
  if (mcap > 5_000_000_000) return 1;
  return 0;
}

/** Full scoring pipeline for a single stock. */
export function scorePreRun(
  data: PreRunStockData,
  gate2Pass: boolean,
  manualScoreC: number,
  manualScoreG: number,
  sectorQuadrant?: string | null,
  gate1Threshold?: number,
): PreRunResult {
  const gates: PreRunGates = {
    gate1: evaluateGate1(data, gate1Threshold),
    gate2: evaluateGate2(gate2Pass),
    gate3: evaluateGate3(data),
  };

  // Narrow Gate 1 bypass: skip for LEADING sector + near earnings + positive RS
  let gate1Bypassed = false;
  if (!gates.gate1 && sectorQuadrant) {
    const isLeadingSector = sectorQuadrant === "LEADING";
    const hasNearEarnings = data.daysToEarnings !== null && data.daysToEarnings <= 30;
    const hasPositiveRS = (data.relativeStrength20d ?? -999) > 0;
    if (isLeadingSector && hasNearEarnings && hasPositiveRS) {
      gate1Bypassed = true;
    }
  }
  const gatesPass = (gates.gate1 || gate1Bypassed) && gates.gate2 && gates.gate3;

  const sA = scoreA(data);
  const sB = scoreB(data);
  const sC = scoreC(manualScoreC);
  const sD = scoreD(data);
  const sE = scoreE(data);
  const sF = scoreF(data);
  const sG = scoreG(manualScoreG);
  const sH = scoreH(data);
  const sI = scoreI(data);
  const sJ = scoreJ(data);
  const sK = scoreK(data);
  const sL = scoreL(data);
  const sM = scoreM(data);
  const sM2 = scoreM2(data);
  const sN = scoreN(data);
  const sO = scoreO(data);
  const sP = scoreP(data);
  const sQ = scoreQ(data);
  const sMod = calcSectorModifier(data);
  const sQuad = sectorQuadrantGate(sectorQuadrant ?? null);

  const totalScore = sA + sB + sC + sD + sE + sF + sG + sH + sI + sJ + sK + sL + sM + sM2 + sN + sO + sP + sQ + sMod + sQuad;
  const finalScore = gatesPass ? totalScore : 0;

  let verdict: PreRunVerdict = "DISCARD";
  if (gatesPass) {
    if (finalScore >= 19 && data.daysToEarnings !== null && data.daysToEarnings <= 14) {
      verdict = "PRIORITY";
    } else if (finalScore >= 19) {
      verdict = "KEEP";
    } else if (finalScore >= 14) {
      verdict = "WATCH";
    }
  }

  // Pattern matching
  const patternMatch = matchBestPattern(data);

  return {
    data,
    gates,
    scores: {
      scoreA: sA,
      scoreB: sB,
      scoreC: sC,
      scoreD: sD,
      scoreE: sE,
      scoreF: sF,
      scoreG: sG,
      scoreH: sH,
      scoreI: sI,
      scoreJ: sJ,
      scoreK: sK,
      scoreL: sL,
      scoreM: sM,
      scoreM2: sM2,
      scoreN: sN,
      scoreO: sO,
      scoreP: sP,
      scoreQ: sQ,
      sectorModifier: sMod,
      sectorQuadrant: sQuad,
      totalScore,
      finalScore,
    },
    verdict,
    patternMatch,
    gate1Bypassed: gate1Bypassed || undefined,
  };
}

/** Auto-score for nightly scan (uses default manual scores: C=1, G=auto). */
export function autoScorePreRun(data: PreRunStockData, sectorQuadrant?: string | null, gate1Threshold?: number): PreRunResult {
  return scorePreRun(data, true, 1, suggestScoreG(data), sectorQuadrant, gate1Threshold);
}

/**
 * Sector quadrant momentum gate.
 * Augments existing sector modifier with rotation quadrant data.
 * @param quadrant - Sector's current RRG quadrant (LEADING/IMPROVING/WEAKENING/LAGGING)
 * @returns Score adjustment: +2 (LEADING/IMPROVING), -1 (WEAKENING), -2 (LAGGING)
 */
export function sectorQuadrantGate(
  quadrant: string | null | undefined
): number {
  if (!quadrant) return 0;
  switch (quadrant) {
    case "LEADING":
    case "IMPROVING":
      return 2;
    case "WEAKENING":
      return -1;
    case "LAGGING":
      return -2;
    default:
      return 0;
  }
}

/**
 * Dynamic Gate 1 calibration.
 * Adjusts the pctFromAth threshold based on the universe's median drawdown.
 * In bear markets (high median drawdown), raise threshold so only deeply discounted stocks pass.
 * @param medianPctFromAth - Median pctFromAth of the scanned universe
 * @returns Adjusted gate1 threshold (default 40)
 */
export function dynamicGate1Threshold(medianPctFromAth: number | null): number {
  const BASE_THRESHOLD = 20;
  if (medianPctFromAth == null) return BASE_THRESHOLD;
  // If median drawdown is high (bear market), raise threshold
  return Math.max(30, medianPctFromAth + 15);
}
