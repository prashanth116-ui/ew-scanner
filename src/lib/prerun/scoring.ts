/**
 * Pre-Run scoring engine.
 * 3 hard gates + 7 weighted criteria (each 0-2, max 14).
 */

import type {
  PreRunStockData,
  PreRunGates,
  PreRunScores,
  PreRunVerdict,
  PreRunResult,
} from "./types";

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

/** Criterion A: Dead money base (0-2). */
export function scoreA(data: PreRunStockData): number {
  const pct = data.pctFromAth ?? 0;
  // Estimate weeks in base from chart data — approximate as 3mo = 13 weeks
  // If pctFromAth >= 40, likely been in base for a while
  if (pct >= 40) return 2; // 40-80% below ATH (assume 6+ months)
  if (pct >= 25) return 1; // 25-40% below highs
  return 0;
}

/** Criterion B: Short interest >= 15% float (0-2). */
export function scoreB(data: PreRunStockData): number {
  const si = data.shortFloat ?? 0;
  const mcap = data.marketCap ?? 0;
  const smallCap = mcap < 20_000_000_000; // < $20B

  if (si >= 15 && smallCap) return 2;
  if (si >= 8) return 1; // 8-15% OR large cap with 15%+
  return 0;
}

/** Criterion C: Narrative catalyst (manual — 0/1/2). */
export function scoreC(manualScore: number): number {
  return Math.max(0, Math.min(2, manualScore));
}

/** Criterion D: Earnings inflection (0-2). */
export function scoreD(data: PreRunStockData): number {
  const revGrowth = data.revenueGrowthYoY ?? 0;
  const daysToEarn = data.daysToEarnings;
  const hasNearEarnings = daysToEarn !== null && daysToEarn <= 60;

  if (revGrowth > 20 && hasNearEarnings) return 2;
  if (revGrowth > 0 || hasNearEarnings) return 1;
  return 0;
}

/** Criterion E: Institutional under-ownership (0-2). */
export function scoreE(data: PreRunStockData): number {
  const analysts = data.analystCount ?? 0;
  if (analysts === 0) return 1; // No data — neutral
  if (analysts < 10) return 2;
  if (analysts <= 20) return 1;
  return 0;
}

/** Criterion F: Volume accumulation (0-2). */
export function scoreF(data: PreRunStockData): number {
  const avgUp = data.avgVolumeUpDays ?? 0;
  const avgDown = data.avgVolumeDownDays ?? 1;

  if (avgDown === 0) return avgUp > 0 ? 2 : 0;
  const ratio = avgUp / avgDown;

  if (ratio >= 1.3) return 2;
  if (ratio >= 1.0) return 1;
  return 0;
}

/** Criterion G: Index inclusion potential (manual — 0/1/2). */
export function scoreG(manualScore: number): number {
  return Math.max(0, Math.min(2, manualScore));
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

  const totalScore = sA + sB + sC + sD + sE + sF + sG;
  const finalScore = gatesPass ? totalScore : 0;

  let verdict: PreRunVerdict = "DISCARD";
  if (gatesPass) {
    if (finalScore >= 9 && data.daysToEarnings !== null && data.daysToEarnings <= 14) {
      verdict = "PRIORITY";
    } else if (finalScore >= 10) {
      verdict = "KEEP";
    } else if (finalScore >= 7) {
      verdict = "WATCH";
    }
  }

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
      totalScore,
      finalScore,
    },
    verdict,
  };
}

/** Auto-score for nightly scan (uses default manual scores: C=1, G=auto). */
export function autoScorePreRun(data: PreRunStockData): PreRunResult {
  return scorePreRun(data, true, 1, suggestScoreG(data));
}
