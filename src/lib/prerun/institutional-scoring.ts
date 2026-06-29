/**
 * Institutional Acceleration scoring engine.
 * Large-cap institutional runner scanner: RS acceleration, volume accumulation,
 * structure analysis with soft scoring instead of hard filters.
 * SERVER-ONLY: Used by /api/prerun/* routes.
 */

import "server-only";

import type {
  PreRunStockData,
  InstitutionalGates,
  InstitutionalScores,
  InstitutionalClassification,
  InstitutionalEntryQuality,
  InstitutionalEntryTrigger,
  InstitutionalCommentary,
  InstitutionalResult,
} from "./types";
import { computeTier } from "./tier";

// ── Utility ──

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ── Gates ──

export function evaluateInstitutionalGates(data: PreRunStockData): InstitutionalGates {
  const price = data.currentPrice ?? 0;
  const priceAbove20 = price >= 20;
  const mktCapAbove20b = (data.marketCap ?? 0) >= 20_000_000_000;
  const avgDollarVolAbove100m = (data.vcpAvgDollarVolume ?? 0) >= 100_000_000;
  const avgShareVolAbove1_5m = (data.vcpAvgVolume50d ?? 0) >= 1_500_000;
  const allPass = priceAbove20 && mktCapAbove20b && avgDollarVolAbove100m && avgShareVolAbove1_5m;

  return { priceAbove20, mktCapAbove20b, avgDollarVolAbove100m, avgShareVolAbove1_5m, allPass };
}

// ── Institutional Score (0-100) ──

function scoreInstitutional(data: PreRunStockData): number {
  let score = 0;

  // RS Accel vs SPY (0-15)
  const rsAccelSPY = data.instRsAccelVsSPY ?? 0;
  if (rsAccelSPY >= 8) score += 15;
  else if (rsAccelSPY >= 5) score += 12;
  else if (rsAccelSPY >= 3) score += 9;
  else if (rsAccelSPY >= 1) score += 5;
  else if (rsAccelSPY >= 0) score += 2;

  // RS Accel vs QQQ (0-10)
  const rsAccelQQQ = data.instRsAccelVsQQQ ?? 0;
  if (rsAccelQQQ >= 6) score += 10;
  else if (rsAccelQQQ >= 3) score += 7;
  else if (rsAccelQQQ >= 1) score += 4;
  else if (rsAccelQQQ >= 0) score += 1;

  // Sector/Peer RS (0-10)
  const rs20d = data.relativeStrength20d ?? 0;
  if (rs20d >= 10) score += 10;
  else if (rs20d >= 5) score += 7;
  else if (rs20d >= 2) score += 4;
  else if (rs20d >= 0) score += 1;

  // Volume Accumulation (0-12) — up/down volume ratio
  const avgUp = data.avgVolumeUpDays ?? 0;
  const avgDown = data.avgVolumeDownDays ?? 1;
  const volRatio = avgDown > 0 ? avgUp / avgDown : 1;
  if (volRatio >= 1.8) score += 12;
  else if (volRatio >= 1.4) score += 9;
  else if (volRatio >= 1.1) score += 5;
  else if (volRatio >= 1.0) score += 2;

  // OBV/Accumulation Trend (0-10)
  let accumScore = 0;
  if (data.obvDivergent === true) accumScore += 4;
  if (data.vpDivergenceBullish === true) accumScore += 3;
  const distDays = data.distributionDays20d ?? 5;
  if (distDays <= 1) accumScore += 3;
  else if (distDays <= 3) accumScore += 2;
  else if (distDays <= 5) accumScore += 1;
  score += Math.min(accumScore, 10);

  // Structure: ATR contraction + closes near top (0-10)
  let structScore = 0;
  if (data.atrContracting === true) structScore += 5;
  if (data.closesNearRangeTop === true) structScore += 5;
  score += structScore;

  // Higher Lows (0-10)
  const hl = data.higherLowsCount ?? 0;
  if (hl >= 3) score += 10;
  else if (hl >= 2) score += 7;
  else if (hl >= 1) score += 3;

  // Base Position (0-8)
  const pctFromBase = data.pctFromBaseHigh ?? 100;
  if (pctFromBase <= 3) score += 8;
  else if (pctFromBase <= 7) score += 6;
  else if (pctFromBase <= 12) score += 4;
  else if (pctFromBase <= 20) score += 2;

  // Distance to Pivot (0-7)
  const pivotHigh = data.vcpPivotHigh ?? 0;
  const price = data.currentPrice ?? 0;
  if (pivotHigh > 0 && price > 0) {
    const distToPivot = ((pivotHigh - price) / price) * 100;
    if (distToPivot >= 0 && distToPivot <= 2) score += 7;
    else if (distToPivot <= 5) score += 5;
    else if (distToPivot <= 10) score += 3;
    else if (distToPivot <= 15) score += 1;
  }

  // Liquidity/Quality (0-5)
  const dq = data.dataQuality ?? 0;
  const dollarVol = data.vcpAvgDollarVolume ?? 0;
  if (dq >= 80 && dollarVol >= 500_000_000) score += 5;
  else if (dq >= 60 && dollarVol >= 200_000_000) score += 3;
  else if (dq >= 40 && dollarVol >= 100_000_000) score += 1;

  // Catalyst/Options (0-3) — only fresh data (options flow)
  let catScore = 0;
  const pcr = data.putCallRatio ?? 1;
  if (pcr < 0.6) catScore += 2;
  else if (pcr < 0.8) catScore += 1;
  const callVol = data.callVolume ?? 0;
  if (callVol > 10000) catScore += 1;
  score += Math.min(catScore, 3);

  // Oversold Accumulation Bonus (0-8) — only for stocks below EMA20
  const distEma = data.instDistFromEma20Atr ?? 0;
  if (distEma < -0.5) {
    let oversoldAccum = 0;
    if (volRatio >= 1.2) oversoldAccum += 3;          // up-vol > down-vol while oversold
    if (data.atrContracting === true) oversoldAccum += 2; // volatility compressing = bottoming
    if (pcr < 0.6) oversoldAccum += 2;                // bullish options flow
    if ((data.institutionalPct ?? 0) >= 70) oversoldAccum += 1; // institutional quality floor
    score += Math.min(oversoldAccum, 8);
  }

  return clamp(score, 0, 100);
}

// ── Execution Score (0-100) ──

function scoreExecution(data: PreRunStockData): number {
  let score = 0;

  // ATR Extension from 20 EMA (0-25) — ideal: 0-1.5 ATR
  const distEma = data.instDistFromEma20Atr ?? 5;
  if (distEma >= 0 && distEma <= 0.5) score += 25;
  else if (distEma <= 1.0) score += 22;
  else if (distEma <= 1.5) score += 18;
  else if (distEma <= 2.5) score += 12;
  else if (distEma <= 3.5) score += 6;
  else if (distEma < 0 && distEma >= -1.5) score += 14; // mild oversold, accumulation zone
  else if (distEma < -1.5 && distEma >= -3.0) score += 10; // deep oversold
  else if (distEma < -3.0) score += 6; // extreme oversold, catching knife risk

  // Gap Size (0-15) — small = good
  const gap = Math.abs(data.instGapPct ?? 0);
  if (gap <= 0.3) score += 15;
  else if (gap <= 0.8) score += 12;
  else if (gap <= 1.5) score += 8;
  else if (gap <= 3) score += 4;

  // Distance from 50 SMA (0-15)
  const dist50 = data.vcpDistFromSma50Pct ?? 0;
  if (dist50 >= 0 && dist50 <= 3) score += 15;
  else if (dist50 <= 7) score += 12;
  else if (dist50 <= 12) score += 8;
  else if (dist50 <= 20) score += 4;

  // Pullback Quality (0-15)
  let pbScore = 0;
  if (data.aboveEma21 === true) pbScore += 4;
  if (data.aboveEma50 === true) pbScore += 4;
  const hl = data.higherLowsCount ?? 0;
  if (hl >= 3) pbScore += 7;
  else if (hl >= 2) pbScore += 5;
  else if (hl >= 1) pbScore += 2;
  score += Math.min(pbScore, 15);

  // Entry Suitability (0-15)
  let entryScore = 0;
  const pctFromBase = data.pctFromBaseHigh ?? 100;
  if (pctFromBase <= 5) entryScore += 6;
  else if (pctFromBase <= 10) entryScore += 4;
  else if (pctFromBase <= 15) entryScore += 2;
  if (data.atrContracting === true) entryScore += 5;
  if (data.vcpTightCloses === true) entryScore += 4;
  score += Math.min(entryScore, 15);

  // EMA Alignment (0-15)
  let emaScore = 0;
  if (data.aboveEma21 === true) emaScore += 4;
  if (data.aboveEma50 === true) emaScore += 4;
  if (data.emaCrossoverWithin20d === true) emaScore += 7;
  else if (data.aboveEma21 === true && data.aboveEma50 === true) emaScore += 3;
  score += Math.min(emaScore, 15);

  return clamp(score, 0, 100);
}

// ── Risk Score (0-100, inverted: 100 = low risk) ──

function scoreRisk(data: PreRunStockData): number {
  let score = 0;

  // ATR Volatility (0-20) — lower = safer
  const atrPct = data.vcpAtrPct ?? 5;
  if (atrPct <= 1.0) score += 20;
  else if (atrPct <= 1.5) score += 16;
  else if (atrPct <= 2.0) score += 12;
  else if (atrPct <= 3.0) score += 8;
  else if (atrPct <= 4.0) score += 4;

  // Liquidity Quality (0-15)
  const dollarVol = data.vcpAvgDollarVolume ?? 0;
  if (dollarVol >= 1_000_000_000) score += 15;
  else if (dollarVol >= 500_000_000) score += 12;
  else if (dollarVol >= 200_000_000) score += 8;
  else if (dollarVol >= 100_000_000) score += 4;

  // Gap Risk (0-15)
  const beta = data.instBeta ?? 1;
  const gapPct = Math.abs(data.instGapPct ?? 0);
  let gapRiskScore = 0;
  if (beta <= 0.8) gapRiskScore += 5;
  else if (beta <= 1.0) gapRiskScore += 4;
  else if (beta <= 1.2) gapRiskScore += 3;
  else if (beta <= 1.5) gapRiskScore += 1;
  if (gapPct <= 0.5) gapRiskScore += 10;
  else if (gapPct <= 1.0) gapRiskScore += 7;
  else if (gapPct <= 2.0) gapRiskScore += 4;
  else if (gapPct <= 3.0) gapRiskScore += 2;
  score += Math.min(gapRiskScore, 15);

  // Earnings Risk (0-15) — far = safer
  const dte = data.daysToEarnings ?? 999;
  if (dte >= 45) score += 15;
  else if (dte >= 21) score += 10;
  else if (dte >= 7) score += 5;
  else if (dte >= 3) score += 2;

  // Overextension (0-15)
  const distEma = data.instDistFromEma20Atr ?? 0;
  if (distEma >= 0 && distEma <= 1.0) score += 15;
  else if (distEma <= 2.0) score += 10;
  else if (distEma <= 3.0) score += 6;
  else if (distEma <= 4.0) score += 3;
  else if (distEma < 0 && distEma >= -1.0) score += 12;
  else if (distEma >= -2.0) score += 8;   // mild oversold
  else if (distEma >= -3.0) score += 5;   // deep oversold
  // distEma < -3.0 → 0 (catching knife)

  // Structure Quality (0-10)
  let structScore = 0;
  const hl = data.higherLowsCount ?? 0;
  if (hl >= 3) structScore += 5;
  else if (hl >= 2) structScore += 3;
  else if (hl >= 1) structScore += 1;
  const distDays = data.distributionDays20d ?? 5;
  if (distDays <= 2) structScore += 5;
  else if (distDays <= 4) structScore += 3;
  else if (distDays <= 6) structScore += 1;
  score += Math.min(structScore, 10);

  // Sector Health (0-10)
  const sectorRet = data.sectorReturn20d ?? 0;
  if (sectorRet >= 5) score += 10;
  else if (sectorRet >= 2) score += 7;
  else if (sectorRet >= 0) score += 4;
  else if (sectorRet >= -2) score += 2;

  return clamp(score, 0, 100);
}

// ── Discipline Score (0-100) ──

function scoreDiscipline(data: PreRunStockData): number {
  let score = 0;
  const price = data.currentPrice ?? 0;

  // Clear Trigger (0-20) — proximity to pivot
  const pivotHigh = data.vcpPivotHigh ?? 0;
  if (pivotHigh > 0 && price > 0) {
    const distToPivot = ((pivotHigh - price) / price) * 100;
    if (distToPivot >= 0 && distToPivot <= 2) score += 20;
    else if (distToPivot <= 5) score += 15;
    else if (distToPivot <= 8) score += 10;
    else if (distToPivot <= 12) score += 5;
  }

  // Clear Invalidation (0-20) — distance to 50 SMA as natural stop
  const dist50raw = data.vcpDistFromSma50Pct ?? 100;
  if (dist50raw >= 2 && dist50raw <= 5) score += 20;     // above SMA50, close = tight stop
  else if (dist50raw >= 0 && dist50raw <= 8) score += 15; // above SMA50, moderate
  else if (dist50raw >= -3 && dist50raw < 0) score += 12; // slightly below = reversal stop
  else if (dist50raw >= -8 && dist50raw < -3) score += 8; // below SMA50 but not far
  else if (dist50raw > 8 && dist50raw <= 12) score += 10; // above but extended
  else if (dist50raw > 12 && dist50raw <= 15) score += 5; // far above
  // < -8 or > 15 → 0 (no clear invalidation level)

  // Acceptable Extension (0-15)
  const distEma = data.instDistFromEma20Atr ?? 5;
  if (distEma >= 0 && distEma <= 1.5) score += 15;
  else if (distEma <= 2.5) score += 10;
  else if (distEma <= 3.5) score += 5;
  else if (distEma < 0 && distEma >= -1.5) score += 10; // oversold = acceptable for reversal
  else if (distEma >= -3.0) score += 5;                  // deep oversold

  // Liquidity Confidence (0-15)
  const dollarVol = data.vcpAvgDollarVolume ?? 0;
  if (dollarVol >= 500_000_000) score += 15;
  else if (dollarVol >= 200_000_000) score += 10;
  else if (dollarVol >= 100_000_000) score += 5;

  // Not Chasing (0-15)
  const gap = Math.abs(data.instGapPct ?? 0);
  const ext = data.instDistFromEma20Atr ?? 5;
  let chaseScore = 0;
  if (gap <= 1) chaseScore += 8;
  else if (gap <= 2) chaseScore += 5;
  else if (gap <= 3) chaseScore += 2;
  if (ext <= 2) chaseScore += 7;
  else if (ext <= 3) chaseScore += 4;
  else if (ext <= 4) chaseScore += 2;
  score += Math.min(chaseScore, 15);

  // R:R Acceptable (0-15)
  const pctFromBase = data.pctFromBaseHigh ?? 100;
  const atrPct = data.vcpAtrPct ?? 5;
  let rrScore = 0;
  if (pctFromBase <= 5) rrScore += 8;
  else if (pctFromBase <= 10) rrScore += 5;
  else if (pctFromBase <= 15) rrScore += 3;
  if (atrPct <= 1.5) rrScore += 7;
  else if (atrPct <= 2.5) rrScore += 5;
  else if (atrPct <= 3.5) rrScore += 3;
  score += Math.min(rrScore, 15);

  return clamp(score, 0, 100);
}

// ── Classification ──

function classify(
  data: PreRunStockData,
  execScore: number,
  riskScore: number,
): InstitutionalClassification {
  const distDays = data.distributionDays20d ?? 0;
  const hl = data.higherLowsCount ?? 0;
  const rsAccelSPY = data.instRsAccelVsSPY ?? 0;
  const distEma = data.instDistFromEma20Atr ?? 0;
  const dist50 = data.vcpDistFromSma50Pct ?? 0;
  const dq = data.dataQuality ?? 0;
  const dollarVol = data.vcpAvgDollarVolume ?? 0;
  const pctFromBase = data.pctFromBaseHigh ?? 100;
  const pctFromAth = data.pctFromAth ?? 0;
  const sectorRet = data.sectorReturn20d ?? 0;
  const rs20d = data.relativeStrength20d ?? 0;

  // Direct signals (replaces instScore gates)
  const avgUp = data.avgVolumeUpDays ?? 0;
  const avgDown = data.avgVolumeDownDays ?? 1;
  const volRatio = avgDown > 0 ? avgUp / avgDown : 1;
  const aboveEma21 = data.aboveEma21 === true;
  const aboveEma50 = data.aboveEma50 === true;
  const atrContracting = data.atrContracting === true;
  const tightCloses = data.vcpTightCloses === true;

  // AVOID classes (priority order)
  if (distDays >= 6 || riskScore < 25) return "AVOID_DISTRIBUTION";
  if (hl === 0 && (data.atrContracting === false)) return "AVOID_CHOPPY";
  if (dq < 50 || dollarVol < 100_000_000) return "AVOID_LOW_QUALITY";
  if (distEma > 4 || dist50 > 15) return "TOO_EXTENDED";

  // Positive classes — direct signal checks replace instScore gates
  if (rsAccelSPY > 3 && pctFromBase <= 10 && execScore >= 55 && (volRatio >= 1.1 || hl >= 2)) return "CONTINUATION_LEADER";
  if (rsAccelSPY > 2 && pctFromAth > 15 && (hl >= 1 || volRatio >= 1.2 || aboveEma21)) return "RECOVERY_LEADER";
  if (sectorRet > 3 && rs20d > 5) return "FRESH_ROTATION";
  if ((data.obvDivergent === true || data.vpDivergenceBullish === true) &&
      (hl >= 1 || volRatio >= 1.1 || aboveEma50 || distDays <= 3)) return "INSTITUTIONAL_ACCUMULATION";
  if (atrContracting && tightCloses && pctFromBase <= 5) return "TIGHT_BASE";

  // CONSTRUCTIVE_SETUP — require 3 of 5 constructive signals
  {
    let constructiveCount = 0;
    if (hl >= 2) constructiveCount++;
    if (aboveEma21) constructiveCount++;
    if (aboveEma50) constructiveCount++;
    if (volRatio >= 1.1) constructiveCount++;
    if (atrContracting) constructiveCount++;
    if (constructiveCount >= 3 && distEma >= -1.5 && distEma <= 2.5) {
      return "CONSTRUCTIVE_SETUP";
    }
  }

  // Oversold Reversal — deeply below EMAs with accumulation signals
  if (distEma < -1.0 && dollarVol >= 500_000_000) {
    let confirmations = 0;
    if (volRatio >= 1.2) confirmations++;
    if (atrContracting) confirmations++;
    if ((data.putCallRatio ?? 1) < 0.6) confirmations++;
    if ((data.institutionalPct ?? 0) >= 70) confirmations++;
    if (confirmations >= 2) return "OVERSOLD_REVERSAL";
  }

  return "NEUTRAL_HOLD";
}

// ── Entry Quality ──

function determineEntryQuality(execScore: number, riskScore: number): InstitutionalEntryQuality {
  const avg = (execScore + riskScore) / 2;
  if (avg >= 70) return "HIGH";
  if (avg >= 45) return "MODERATE";
  return "LOW";
}

// ── Best Trigger ──

function determineBestTrigger(data: PreRunStockData): InstitutionalEntryTrigger {
  const price = data.currentPrice ?? 0;
  const pivotHigh = data.vcpPivotHigh ?? 0;
  const distEma = data.instDistFromEma20Atr ?? 5;
  const hl = data.higherLowsCount ?? 0;
  const gap = Math.abs(data.instGapPct ?? 0);

  // Priority order
  // For deeply oversold, prioritize EMA reclaim
  if (distEma < -1.0 && data.emaCrossoverWithin20d !== true) {
    return "ema_reclaim";
  }
  if (pivotHigh > 0 && price > 0 && ((pivotHigh - price) / price) * 100 <= 3) {
    return "breakout_above_pivot";
  }
  if (distEma >= -0.5 && distEma <= 1.0 && data.aboveEma21 !== true) {
    return "pullback_to_ema20";
  }
  if (data.emaCrossoverWithin20d === true && data.aboveEma21 === true) {
    return "ema_reclaim";
  }
  if (hl >= 2 && data.aboveEma50 === true) {
    return "higher_low_hold";
  }
  if (gap >= 1.5 && distEma > 1.5) {
    return "gap_and_go";
  }
  if (data.atrContracting === true && data.vcpTightCloses === true) {
    return "range_breakout";
  }
  return "none";
}

// ── Avoid Reason ──

function getAvoidReason(classification: InstitutionalClassification, data: PreRunStockData): string | null {
  switch (classification) {
    case "AVOID_DISTRIBUTION":
      return `${data.distributionDays20d ?? 0} distribution days in 20 sessions — institutional selling likely`;
    case "AVOID_CHOPPY":
      return "No higher lows + widening ranges — no directional edge";
    case "AVOID_LOW_QUALITY":
      return `Data quality ${data.dataQuality ?? 0}% or insufficient dollar volume ($${((data.vcpAvgDollarVolume ?? 0) / 1e6).toFixed(0)}M)`;
    case "TOO_EXTENDED": {
      const distEma = data.instDistFromEma20Atr ?? 0;
      return `${distEma.toFixed(1)} ATR from EMA20 — chasing risk, wait for pullback`;
    }
    default:
      return null;
  }
}

// ── Commentary Generation ──

function generateCommentary(
  data: PreRunStockData,
  classification: InstitutionalClassification,
  scores: InstitutionalScores,
  trigger: InstitutionalEntryTrigger,
): InstitutionalCommentary {
  const rsAccelSPY = data.instRsAccelVsSPY ?? 0;
  const rsAccelQQQ = data.instRsAccelVsQQQ ?? 0;
  const rs20d = data.relativeStrength20d ?? 0;
  const distEma = data.instDistFromEma20Atr ?? 0;
  const atrPct = data.vcpAtrPct ?? 0;
  const hl = data.higherLowsCount ?? 0;
  const dollarVol = data.vcpAvgDollarVolume ?? 0;

  const summary = buildSummary(data, classification, scores);
  const classificationReason = buildClassificationReason(classification, data);

  const institutionalDetail = [
    `RS acceleration vs SPY: ${rsAccelSPY >= 0 ? "+" : ""}${rsAccelSPY.toFixed(1)}pp (5-session).`,
    `RS acceleration vs QQQ: ${rsAccelQQQ >= 0 ? "+" : ""}${rsAccelQQQ.toFixed(1)}pp.`,
    rs20d > 0 ? `Outperforming sector by ${rs20d.toFixed(1)}pp (20d).` : `Underperforming sector by ${Math.abs(rs20d).toFixed(1)}pp (20d).`,
    (data.obvDivergent === true) ? "OBV near 20-bar high while price is not — stealth accumulation." : "",
    (data.vpDivergenceBullish === true) ? "Volume-price divergence: seller exhaustion detected." : "",
  ].filter(Boolean).join(" ");

  const executionDetail = [
    `${distEma.toFixed(1)} ATR from 20 EMA (${distEma <= 1.5 ? "ideal zone" : distEma <= 3 ? "acceptable" : "extended"}).`,
    data.vcpDistFromSma50Pct !== null ? `${data.vcpDistFromSma50Pct.toFixed(1)}% from 50 SMA.` : "",
    data.aboveEma21 === true && data.aboveEma50 === true ? "Above both 21 and 50 EMA — trend intact." : "",
    data.emaCrossoverWithin20d === true ? "Recent EMA crossover — momentum starting." : "",
  ].filter(Boolean).join(" ");

  const riskDetail = [
    `ATR: ${atrPct.toFixed(2)}% (${atrPct <= 1.5 ? "low vol" : atrPct <= 2.5 ? "moderate" : "high vol"}).`,
    `Beta: ${(data.instBeta ?? 1).toFixed(2)}.`,
    data.daysToEarnings !== null ? `Earnings in ${data.daysToEarnings} days.` : "No upcoming earnings date.",
    `${data.distributionDays20d ?? 0} distribution days in 20 sessions.`,
    `Dollar volume: $${(dollarVol / 1e6).toFixed(0)}M/day.`,
  ].filter(Boolean).join(" ");

  const triggerLabels: Record<InstitutionalEntryTrigger, string> = {
    breakout_above_pivot: `Breakout above pivot at $${(data.vcpPivotHigh ?? 0).toFixed(2)}`,
    pullback_to_ema20: "Pullback to 20 EMA — buy on hold",
    ema_reclaim: "EMA reclaim — momentum resumption",
    higher_low_hold: "Higher low hold with trend confirmation",
    gap_and_go: "Gap-and-go setup — early strength",
    range_breakout: "Range breakout from tight consolidation",
    none: "No clear trigger — monitor for setup",
  };

  const primaryTrigger = triggerLabels[trigger];
  const secondaryTrigger = trigger !== "none"
    ? (trigger === "breakout_above_pivot" ? "Or pullback to 20 EMA if pivot fails" : "Or breakout above recent pivot high")
    : "";

  const invalidation = data.vcpSma50 !== null && data.currentPrice !== null
    ? `Close below 50 SMA ($${data.vcpSma50.toFixed(2)}) invalidates thesis — ${((data.currentPrice - data.vcpSma50) / data.currentPrice * 100).toFixed(1)}% risk.`
    : "Close below 50 SMA invalidates setup.";

  const whatImprovesTomorrow = buildImprovements(data, scores, classification);

  return {
    summary,
    classificationReason,
    institutionalDetail,
    executionDetail,
    riskDetail,
    primaryTrigger,
    secondaryTrigger,
    invalidation,
    whatImprovesTomorrow,
  };
}

function buildSummary(
  data: PreRunStockData,
  classification: InstitutionalClassification,
  scores: InstitutionalScores,
): string {
  const classLabels: Record<InstitutionalClassification, string> = {
    CONTINUATION_LEADER: "Confirmed institutional leader accelerating from base",
    RECOVERY_LEADER: "Recovery play gaining institutional momentum",
    FRESH_ROTATION: "Sector rotation bringing fresh institutional interest",
    INSTITUTIONAL_ACCUMULATION: "Stealth accumulation — volume signals before price",
    TIGHT_BASE: "Tight base formation near breakout pivot",
    CONSTRUCTIVE_SETUP: "Multiple constructive signals — building toward actionable setup",
    OVERSOLD_REVERSAL: "Oversold reversal candidate — accumulation while deeply below EMAs",
    NEUTRAL_HOLD: "Passed quality filters but no strong pattern detected",
    TOO_EXTENDED: "Extended — wait for pullback before entry",
    AVOID_DISTRIBUTION: "Distribution detected — institutional selling likely",
    AVOID_CHOPPY: "Choppy price action — no directional edge",
    AVOID_LOW_QUALITY: "Insufficient data or liquidity for institutional analysis",
  };

  return `${data.ticker}: ${classLabels[classification]}. Composite ${scores.compositeScore}/100.`;
}

function buildClassificationReason(classification: InstitutionalClassification, data: PreRunStockData): string {
  switch (classification) {
    case "CONTINUATION_LEADER":
      return `Strong RS acceleration (+${(data.instRsAccelVsSPY ?? 0).toFixed(1)}pp vs SPY), near base high (${(data.pctFromBaseHigh ?? 0).toFixed(1)}% away), high institutional score — classic leader setup.`;
    case "RECOVERY_LEADER":
      return `RS accelerating from recovery position (${(data.pctFromAth ?? 0).toFixed(1)}% from ATH). Institutions building positions before full recovery.`;
    case "FRESH_ROTATION":
      return `Sector outperforming (+${(data.sectorReturn20d ?? 0).toFixed(1)}% 20d) with stock leading peers by ${(data.relativeStrength20d ?? 0).toFixed(1)}pp. Fresh capital rotating in.`;
    case "INSTITUTIONAL_ACCUMULATION":
      return `Volume indicators (${[data.obvDivergent && "OBV divergence", data.vpDivergenceBullish && "VP divergence"].filter(Boolean).join(", ")}) suggest quiet institutional buying while price consolidates.`;
    case "TIGHT_BASE":
      return `Volatility contracting with tight closes near pivot ($${(data.vcpPivotHigh ?? 0).toFixed(2)}) — classic pre-breakout pattern.`;
    case "CONSTRUCTIVE_SETUP": {
      const signals: string[] = [];
      if ((data.higherLowsCount ?? 0) >= 2) signals.push("higher lows");
      if (data.aboveEma21 === true) signals.push("above 21 EMA");
      if (data.aboveEma50 === true) signals.push("above 50 EMA");
      const vr = (data.avgVolumeDownDays ?? 1) > 0 ? (data.avgVolumeUpDays ?? 0) / (data.avgVolumeDownDays ?? 1) : 1;
      if (vr >= 1.1) signals.push("positive volume ratio");
      if (data.atrContracting === true) signals.push("ATR contracting");
      return `${signals.length} constructive signals (${signals.join(", ")}) — building toward actionable setup near EMA zone.`;
    }
    case "NEUTRAL_HOLD":
      return "Passed all avoid filters but no strong pattern detected. Monitor for RS acceleration, volume accumulation, or EMA reclaim.";
    case "OVERSOLD_REVERSAL":
      return `Deeply oversold (${(data.instDistFromEma20Atr ?? 0).toFixed(1)} ATR below EMA20) but showing accumulation signals: ${[
        (data.avgVolumeUpDays ?? 0) / Math.max(data.avgVolumeDownDays ?? 1, 1) >= 1.2 && "up-volume > down-volume",
        data.atrContracting && "ATR contracting",
        (data.putCallRatio ?? 1) < 0.6 && "bullish P/C ratio",
        (data.institutionalPct ?? 0) >= 70 && "high institutional ownership",
      ].filter(Boolean).join(", ")}. Coiled spring setup.`;
    case "TOO_EXTENDED":
      return `${(data.instDistFromEma20Atr ?? 0).toFixed(1)} ATR from 20 EMA and/or ${(data.vcpDistFromSma50Pct ?? 0).toFixed(1)}% from 50 SMA. Chasing at these levels carries elevated mean-reversion risk.`;
    default:
      return "Does not meet minimum criteria for institutional runner classification.";
  }
}

function buildImprovements(data: PreRunStockData, scores: InstitutionalScores, classification?: InstitutionalClassification): string {
  const items: string[] = [];
  if (classification === "OVERSOLD_REVERSAL") {
    items.push("EMA reclaim would confirm reversal");
    items.push("Higher low formation would strengthen conviction");
  }
  if (classification === "CONSTRUCTIVE_SETUP") {
    items.push("RS acceleration would upgrade to leader classification");
  }
  if (classification === "NEUTRAL_HOLD") {
    items.push("Needs RS acceleration or volume divergence for actionable classification");
  }
  if (scores.executionScore < 60 && (data.instDistFromEma20Atr ?? 5) > 2) {
    items.push("Pullback toward 20 EMA would improve execution score");
  }
  if ((data.higherLowsCount ?? 0) < 2) {
    items.push("Another higher low would strengthen structure");
  }
  if (scores.riskScore < 50 && (data.distributionDays20d ?? 0) > 3) {
    items.push("Fewer distribution days would reduce risk flag");
  }
  if (!data.atrContracting) {
    items.push("ATR contraction would signal tighter consolidation");
  }
  if (scores.disciplineScore < 50) {
    items.push("Closer proximity to pivot would provide clearer trigger");
  }
  return items.length > 0 ? items.join(". ") + "." : "Setup is well-formed — monitor for trigger.";
}

// ── Main Scoring Function ──

export function scoreInstitutionalAcceleration(data: PreRunStockData): InstitutionalResult {
  const gates = evaluateInstitutionalGates(data);

  const institutionalScore = scoreInstitutional(data);
  const executionScore = scoreExecution(data);
  const riskScore = scoreRisk(data);
  const disciplineScore = scoreDiscipline(data);

  // Composite: weighted average
  const compositeScore = Math.round(
    institutionalScore * 0.35 +
    executionScore * 0.25 +
    riskScore * 0.25 +
    disciplineScore * 0.15
  );

  const scores: InstitutionalScores = {
    institutionalScore,
    executionScore,
    riskScore,
    disciplineScore,
    compositeScore,
  };

  const classification = classify(data, executionScore, riskScore);
  const entryQuality = determineEntryQuality(executionScore, riskScore);
  const bestTrigger = determineBestTrigger(data);
  const avoidReason = getAvoidReason(classification, data);
  const commentary = generateCommentary(data, classification, scores, bestTrigger);
  const tier = computeTier(classification, compositeScore);

  return {
    data,
    gates,
    scores,
    classification,
    entryQuality,
    bestTrigger,
    avoidReason,
    commentary,
    tier,
  };
}
