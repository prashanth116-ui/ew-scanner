/**
 * Pre-Run scoring engine.
 * 3 hard gates + 11 criteria (A-K) with weighted scoring.
 * B and C expanded to 0-3. All others 0-2. Max raw = 24.
 * Sector momentum modifier: +1/0/-1. Final max ~25.
 */

import type {
  PreRunStockData,
  PreRunGates,
  PreRunScores,
  PreRunVerdict,
  PreRunResult,
} from "./types";
import { matchBestPattern, type PatternMatchResult } from "./patterns";

/** Gate 1: Has the run already happened? */
export function evaluateGate1(data: PreRunStockData): boolean {
  if (data.pctFromAth === null) return false;
  return data.pctFromAth >= 40;
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

/** Criterion D: Earnings inflection (0-2).
 *  Enhanced with revenue acceleration and earnings beat streak. */
export function scoreD(data: PreRunStockData): number {
  const revGrowth = data.revenueGrowthYoY ?? 0;
  const daysToEarn = data.daysToEarnings;
  const hasNearEarnings = daysToEarn !== null && daysToEarn <= 60;
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

  // Score 2: accelerating revenue + near earnings catalyst, OR strong rev growth + beat streak + near earnings
  if ((revenueAccelerating || revGrowth > 20) && hasNearEarnings && beatStreak >= 2) return 2;
  if (revGrowth > 20 && hasNearEarnings) return 2;
  if (revenueAccelerating && hasNearEarnings) return 2;

  // Score 1: positive growth or near earnings or beat streak
  if (revGrowth > 0 || hasNearEarnings || beatStreak >= 2) return 1;

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

/** Criterion F: Volume accumulation (0-2). Enhanced with float turnover. */
export function scoreF(data: PreRunStockData): number {
  const avgUp = data.avgVolumeUpDays ?? 0;
  const avgDown = data.avgVolumeDownDays ?? 1;
  const floatTurnover = data.floatTurnover20d ?? 0;

  if (avgDown === 0) {
    return avgUp > 0 ? 2 : 0;
  }
  const ratio = avgUp / avgDown;

  // Float turnover bonus: if >1x float traded in 20 days, bump up
  if (ratio >= 1.3 || (ratio >= 1.0 && floatTurnover >= 1.0)) return 2;
  if (ratio >= 1.0) return 1;
  return 0;
}

/** Criterion G: Index inclusion potential (manual — 0/1/2). */
export function scoreG(manualScore: number): number {
  return Math.max(0, Math.min(2, manualScore));
}

/** Criterion H: Insider buying (0-2). */
export function scoreH(data: PreRunStockData): number {
  const buys = data.insiderBuys90d ?? 0;
  if (buys >= 3) return 2;  // Cluster buying — strong conviction
  if (buys >= 1) return 1;  // Some insider interest
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
  manualScoreG: number
): PreRunResult {
  const gates: PreRunGates = {
    gate1: evaluateGate1(data),
    gate2: evaluateGate2(gate2Pass),
    gate3: evaluateGate3(data),
  };

  const gatesPass = gates.gate1 && gates.gate2 && gates.gate3;

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
  const sMod = calcSectorModifier(data);

  const totalScore = sA + sB + sC + sD + sE + sF + sG + sH + sI + sJ + sK + sMod;
  const finalScore = gatesPass ? totalScore : 0;

  let verdict: PreRunVerdict = "DISCARD";
  if (gatesPass) {
    if (finalScore >= 15 && data.daysToEarnings !== null && data.daysToEarnings <= 14) {
      verdict = "PRIORITY";
    } else if (finalScore >= 15) {
      verdict = "KEEP";
    } else if (finalScore >= 11) {
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
      sectorModifier: sMod,
      totalScore,
      finalScore,
    },
    verdict,
    patternMatch,
  };
}

/** Auto-score for nightly scan (uses default manual scores: C=1, G=auto). */
export function autoScorePreRun(data: PreRunStockData): PreRunResult {
  return scorePreRun(data, true, 1, suggestScoreG(data));
}
