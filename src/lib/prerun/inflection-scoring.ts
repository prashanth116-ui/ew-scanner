/**
 * Inflection Engine scoring module.
 * Detects state transitions — seller exhaustion, compression, buyer emergence.
 * Identifies stocks at inflection points before directional moves.
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

// ── Gates (lighter than institutional — targets inflection points, not leaders) ──

function evaluateGates(data: PreRunStockData): InflectionGates {
  const price = data.currentPrice ?? 0;
  const priceAbove5 = price >= 5;
  const avgDollarVolAbove10m = (data.vcpAvgDollarVolume ?? 0) >= 10_000_000;
  const mktCapAbove500m = (data.marketCap ?? 0) >= 500_000_000;
  const allPass = priceAbove5 && avgDollarVolAbove10m && mktCapAbove500m;
  return { priceAbove5, avgDollarVolAbove10m, mktCapAbove500m, allPass };
}

// ── 1. Seller Exhaustion (0-100) ──

function scoreSellerExhaustion(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  let score = 0;
  const evidence: string[] = [];
  const caution: string[] = [];

  // Down-vol declining (0-20)
  const avgUp = data.avgVolumeUpDays ?? 0;
  const avgDown = data.avgVolumeDownDays ?? 1;
  const volRatio = avgDown > 0 ? avgUp / avgDown : 1;
  if (volRatio >= 1.5) { score += 20; evidence.push("Down-volume declining sharply"); }
  else if (volRatio >= 1.2) { score += 14; evidence.push("Down-volume declining"); }
  else if (volRatio >= 1.0) { score += 8; }
  else { caution.push("Selling volume still dominant"); }

  // RSI recovering 30-45 range (0-20)
  const rsi = data.rsi14 ?? 50;
  if (rsi >= 30 && rsi <= 45) { score += 20; evidence.push(`RSI recovering from oversold (${rsi.toFixed(0)})`); }
  else if (rsi >= 25 && rsi < 30) { score += 12; evidence.push("RSI deeply oversold — potential reversal"); }
  else if (rsi > 45 && rsi <= 55) { score += 10; }
  else if (rsi > 55) { score += 4; }
  else { caution.push(`RSI extremely oversold (${rsi.toFixed(0)})`); }

  // Near 52w low (0-15) — closer to low = more exhaustion potential
  const price = data.currentPrice ?? 0;
  const low52w = data.low52w ?? 0;
  const high52w = data.high52w ?? price;
  if (price > 0 && low52w > 0 && high52w > low52w) {
    const pctAboveLow = ((price - low52w) / (high52w - low52w)) * 100;
    if (pctAboveLow <= 15) { score += 15; evidence.push("Near 52-week low — maximum exhaustion zone"); }
    else if (pctAboveLow <= 30) { score += 10; evidence.push("Lower range of 52-week band"); }
    else if (pctAboveLow <= 50) { score += 5; }
  }

  // VP divergence (0/15)
  if (data.vpDivergenceBullish === true) {
    score += 15;
    evidence.push("Volume-price divergence: selling drying up");
  }

  // Failed breakdown recovery (0-15)
  const fbd = data.failedBreakdownRecovery ?? 0;
  if (fbd >= 2) { score += 15; evidence.push("Failed breakdown + recovery — bears trapped"); }
  else if (fbd >= 1) { score += 8; evidence.push("Wick test of support — holding"); }

  // Down-day bodies shrinking (0-15)
  const bodyRecent = data.avgDownDayBody ?? 0;
  const bodyPrev = data.avgDownDayBodyPrev ?? 0;
  if (bodyPrev > 0 && bodyRecent > 0) {
    const ratio = bodyRecent / bodyPrev;
    if (ratio <= 0.5) { score += 15; evidence.push("Down-day bodies shrinking significantly"); }
    else if (ratio <= 0.7) { score += 10; evidence.push("Down-day candles getting smaller"); }
    else if (ratio <= 0.9) { score += 5; }
    else { caution.push("Down-day bodies not shrinking"); }
  }

  return { score: clamp(score, 0, 100), evidence, caution };
}

// ── 2. Volatility Compression (0-100) ──

function scoreVolatilityCompression(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  let score = 0;
  const evidence: string[] = [];
  const caution: string[] = [];

  // ATR ratio 5/20 (0-20) — lower = more compressed
  const atrRatio = data.atrRatio5v20 ?? 1.0;
  if (atrRatio <= 0.5) { score += 20; evidence.push("Extreme volatility compression (ATR ratio)"); }
  else if (atrRatio <= 0.7) { score += 16; evidence.push("Strong volatility squeeze"); }
  else if (atrRatio <= 0.85) { score += 10; evidence.push("Volatility contracting"); }
  else if (atrRatio <= 1.0) { score += 5; }
  else { caution.push("Volatility expanding — no compression"); }

  // Range nesting: 5d < 10d < 20d (0-20)
  const r5 = data.vcpRange5d ?? 100;
  const r10 = data.vcpRange10d ?? 100;
  const r20 = data.vcpRange20d ?? 100;
  if (r5 < r10 && r10 < r20 && r5 < 3) { score += 20; evidence.push("Tight nested ranges — classic compression"); }
  else if (r5 < r10 && r10 < r20) { score += 14; evidence.push("Ranges nesting (5d < 10d < 20d)"); }
  else if (r5 < r10) { score += 8; }

  // Tight closes (0/15)
  if (data.vcpTightCloses === true) { score += 15; evidence.push("Tight cluster of closes — coiling"); }

  // Inside bars (0-15)
  const insideBars = data.vcpInsideBarCount ?? 0;
  if (insideBars >= 3) { score += 15; evidence.push(`${insideBars} inside bars — extreme compression`); }
  else if (insideBars >= 2) { score += 10; evidence.push(`${insideBars} inside bars`); }
  else if (insideBars >= 1) { score += 5; }

  // ATR % of price (0-15) — lower = tighter
  const atrPct = data.vcpAtrPct ?? 5;
  if (atrPct <= 1.0) { score += 15; evidence.push("Very low ATR% — compressed range"); }
  else if (atrPct <= 1.5) { score += 12; }
  else if (atrPct <= 2.5) { score += 7; }
  else if (atrPct <= 3.5) { score += 3; }
  else { caution.push("High ATR% — no compression"); }

  // Dry volume days (0-15)
  const dryDays = data.vcpDryVolumeDays ?? 0;
  if (dryDays >= 5) { score += 15; evidence.push("Multiple dry volume days — volume drying up"); }
  else if (dryDays >= 3) { score += 10; evidence.push("Volume declining into base"); }
  else if (dryDays >= 2) { score += 5; }

  return { score: clamp(score, 0, 100), evidence, caution };
}

// ── 3. Buyer Emergence (0-100) ──

function scoreBuyerEmergence(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  let score = 0;
  const evidence: string[] = [];
  const caution: string[] = [];

  // Up/down volume ratio (0-20)
  const avgUp = data.avgVolumeUpDays ?? 0;
  const avgDown = data.avgVolumeDownDays ?? 1;
  const volRatio = avgDown > 0 ? avgUp / avgDown : 1;
  if (volRatio >= 1.8) { score += 20; evidence.push("Strong up-volume dominance"); }
  else if (volRatio >= 1.4) { score += 15; evidence.push("Up-volume exceeding down-volume"); }
  else if (volRatio >= 1.1) { score += 8; }
  else { caution.push("No clear volume-side dominance for buyers"); }

  // OBV divergence (0/15)
  if (data.obvDivergent === true) { score += 15; evidence.push("OBV divergence — stealth buying"); }

  // Higher lows (0-20)
  const hl = data.higherLowsCount ?? 0;
  if (hl >= 3) { score += 20; evidence.push("3 higher lows — clear accumulation structure"); }
  else if (hl >= 2) { score += 14; evidence.push("Higher lows forming"); }
  else if (hl >= 1) { score += 7; }
  else { caution.push("No higher lows — no structural improvement"); }

  // EMA reclaim (0-15)
  if (data.aboveEma21 === true && data.aboveEma50 === true) {
    score += 15; evidence.push("Price above 21 and 50 EMA — trend reclaimed");
  } else if (data.aboveEma21 === true) {
    score += 10; evidence.push("Price above 21 EMA");
  } else if (data.aboveEma50 === true) {
    score += 7;
  }

  // Accumulation days (0-15)
  const accumDays = data.accumulationDayCount ?? 0;
  if (accumDays >= 8) { score += 15; evidence.push(`${accumDays} accumulation days in 20 sessions`); }
  else if (accumDays >= 5) { score += 10; evidence.push(`${accumDays} accumulation days`); }
  else if (accumDays >= 3) { score += 5; }

  // Breakout proximity (0-15)
  const pctFromBase = data.pctFromBaseHigh ?? 100;
  if (pctFromBase <= 3) { score += 15; evidence.push("Near breakout level"); }
  else if (pctFromBase <= 7) { score += 10; evidence.push("Approaching base high"); }
  else if (pctFromBase <= 12) { score += 5; }

  return { score: clamp(score, 0, 100), evidence, caution };
}

// ── 4. Relative Strength (0-100) ──

function scoreRelativeStrength(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  let score = 0;
  const evidence: string[] = [];
  const caution: string[] = [];

  // RS vs SPY (0-30)
  const rsSpy = data.vcpRelStrengthVsSPY ?? 0;
  if (rsSpy >= 10) { score += 30; evidence.push(`Outperforming SPY by ${rsSpy.toFixed(1)}pp — strong RS`); }
  else if (rsSpy >= 5) { score += 22; evidence.push(`Outperforming SPY by ${rsSpy.toFixed(1)}pp`); }
  else if (rsSpy >= 2) { score += 14; }
  else if (rsSpy >= 0) { score += 6; }
  else { caution.push(`Underperforming SPY by ${Math.abs(rsSpy).toFixed(1)}pp`); }

  // RS vs sector (0-25)
  const rsSector = data.relativeStrength20d ?? 0;
  if (rsSector >= 8) { score += 25; evidence.push(`Leading sector by ${rsSector.toFixed(1)}pp`); }
  else if (rsSector >= 4) { score += 18; evidence.push(`Outperforming sector by ${rsSector.toFixed(1)}pp`); }
  else if (rsSector >= 1) { score += 10; }
  else if (rsSector >= 0) { score += 4; }
  else { caution.push("Lagging sector peers"); }

  // RS acceleration (0-25)
  const rsAccel = data.instRsAccelVsSPY ?? 0;
  if (rsAccel >= 5) { score += 25; evidence.push("RS accelerating sharply"); }
  else if (rsAccel >= 3) { score += 18; evidence.push("RS acceleration positive"); }
  else if (rsAccel >= 1) { score += 10; }
  else if (rsAccel >= 0) { score += 4; }

  // Holds in market weakness (0-20) — outperforming sector when sector is weak
  const sectorRet = data.sectorReturn20d ?? 0;
  if (sectorRet < 0 && rsSector > 3) {
    score += 20;
    evidence.push("Holding strong while sector weakens — relative leader");
  } else if (sectorRet < 0 && rsSector > 0) {
    score += 12;
  } else if (sectorRet >= 3 && rsSector > 3) {
    score += 8;
  }

  return { score: clamp(score, 0, 100), evidence, caution };
}

// ── 5. Liquidity / Auction (0-100) ──

function scoreLiquidityAuction(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  let score = 0;
  const evidence: string[] = [];
  const caution: string[] = [];

  // Dollar volume (0-25)
  const dollarVol = data.vcpAvgDollarVolume ?? 0;
  if (dollarVol >= 500_000_000) { score += 25; evidence.push("Excellent liquidity"); }
  else if (dollarVol >= 100_000_000) { score += 20; }
  else if (dollarVol >= 50_000_000) { score += 14; }
  else if (dollarVol >= 10_000_000) { score += 8; }
  else { caution.push("Low dollar volume — potential slippage"); }

  // Avg volume (0-20)
  const avgVol50d = data.vcpAvgVolume50d ?? 0;
  if (avgVol50d >= 5_000_000) { score += 20; }
  else if (avgVol50d >= 2_000_000) { score += 15; }
  else if (avgVol50d >= 500_000) { score += 10; }
  else if (avgVol50d >= 200_000) { score += 5; }

  // Volume consistency 10d/50d (0-20) — stable volume = reliable auction
  const avgVol10d = data.vcpAvgVolume10d ?? 0;
  if (avgVol50d > 0 && avgVol10d > 0) {
    const volConsistency = avgVol10d / avgVol50d;
    if (volConsistency >= 0.8 && volConsistency <= 1.3) {
      score += 20; evidence.push("Consistent volume profile");
    } else if (volConsistency >= 0.6 && volConsistency <= 1.8) {
      score += 12;
    } else if (volConsistency > 1.8) {
      score += 8; evidence.push("Recent volume surge");
    }
  }

  // Float turnover (0-20)
  const ft = data.floatTurnover20d ?? 0;
  if (ft >= 2.0) { score += 20; evidence.push("High float turnover — active trading"); }
  else if (ft >= 1.0) { score += 14; }
  else if (ft >= 0.5) { score += 8; }
  else if (ft >= 0.2) { score += 4; }

  // Tight range proxy — ATR% as confirmation (0-15)
  const atrPct = data.vcpAtrPct ?? 5;
  if (atrPct <= 1.5) { score += 15; }
  else if (atrPct <= 2.5) { score += 10; }
  else if (atrPct <= 3.5) { score += 5; }

  return { score: clamp(score, 0, 100), evidence, caution };
}

// ── 6. Institutional Participation (0-100) ──

function scoreInstitutionalParticipation(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  let score = 0;
  const evidence: string[] = [];
  const caution: string[] = [];

  // OBV divergence (0/20) — stealth accumulation
  if (data.obvDivergent === true) {
    score += 20;
    evidence.push("OBV near highs while price consolidates — institutional buying");
  }

  // Distribution days (0-20) — fewer = better
  const distDays = data.distributionDays20d ?? 5;
  if (distDays <= 1) { score += 20; evidence.push("Zero/minimal distribution — clean accumulation"); }
  else if (distDays <= 3) { score += 14; }
  else if (distDays <= 5) { score += 7; }
  else { caution.push(`${distDays} distribution days — institutional selling possible`); }

  // Institutional ownership (0-15)
  const instPct = data.institutionalPct ?? 0;
  if (instPct >= 70) { score += 15; evidence.push(`${instPct.toFixed(0)}% institutional ownership`); }
  else if (instPct >= 50) { score += 10; }
  else if (instPct >= 30) { score += 5; }
  else if (instPct > 0) { caution.push("Low institutional ownership"); }

  // Insider buying (0-15)
  const insiderBuys = data.insiderBuys90d ?? 0;
  const insiderBuys45d = data.insiderBuys45d ?? 0;
  if (insiderBuys45d >= 3) { score += 15; evidence.push(`${insiderBuys45d} insider buys in 45 days — cluster`); }
  else if (insiderBuys >= 3) { score += 12; evidence.push(`${insiderBuys} insider buys in 90 days`); }
  else if (insiderBuys >= 1) { score += 6; }

  // Float turnover (0-15)
  const ft = data.floatTurnover20d ?? 0;
  if (ft >= 2.0) { score += 15; }
  else if (ft >= 1.0) { score += 10; }
  else if (ft >= 0.5) { score += 5; }

  // Block trade proxy: high volume days relative to average (0-15)
  const avgVol50d = data.vcpAvgVolume50d ?? 0;
  const avgVol10d = data.vcpAvgVolume10d ?? 0;
  if (avgVol50d > 0 && avgVol10d > avgVol50d * 1.5) {
    score += 15; evidence.push("Recent volume surge — possible block trades");
  } else if (avgVol50d > 0 && avgVol10d > avgVol50d * 1.2) {
    score += 8;
  }

  return { score: clamp(score, 0, 100), evidence, caution };
}

// ── Stage Classification ──

function classifyStage(
  se: number, vc: number, be: number, rs: number,
  data: PreRunStockData,
): InflectionStage {
  const pctFromAth = data.pctFromAth ?? 100;

  // EXPANSION: near ATH with strong RS
  if (pctFromAth < 10 && rs >= 60) return "EXPANSION";

  // EARLY_ACCUMULATION: buyers clearly emerging with strength
  if (be >= 60 && rs >= 50 && se >= 40) return "EARLY_ACCUMULATION";

  // INFLECTION: sellers exhausted + compressed + buyers starting
  if (se >= 50 && vc >= 50 && be >= 35) return "INFLECTION";

  // SELLER_EXHAUSTION: selling pressure declining but no buyers yet
  if (se >= 45 && vc >= 30) return "SELLER_EXHAUSTION";

  // DISTRIBUTION: default
  return "DISTRIBUTION";
}

// ── Trade Read ──

function determineTradeRead(
  stage: InflectionStage,
  overall: number,
  be: number,
  extensionRisk: boolean,
): InflectionTradeRead {
  if (stage === "DISTRIBUTION" || extensionRisk) return "AVOID";
  if (stage === "SELLER_EXHAUSTION") return "WATCH";
  if (stage === "EARLY_ACCUMULATION" && be >= 75) return "ADD_ON_CONFIRMATION";
  if (stage === "INFLECTION" && overall >= 70) return "STARTER_POSITION_CANDIDATE";
  if (stage === "EARLY_ACCUMULATION" && overall >= 65) return "STARTER_POSITION_CANDIDATE";
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

  const overallScore = Math.round(
    seResult.score * 0.20 +
    vcResult.score * 0.15 +
    beResult.score * 0.25 +
    rsResult.score * 0.15 +
    laResult.score * 0.10 +
    ipResult.score * 0.15
  );

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

  // Signal classification
  const isPrimarySignal =
    overallScore >= 70 &&
    (stage === "INFLECTION" || stage === "EARLY_ACCUMULATION") &&
    tradeRead === "STARTER_POSITION_CANDIDATE" &&
    !extensionRisk;

  const isStrongerSignal =
    overallScore >= 80 &&
    beResult.score >= 75 &&
    seResult.score >= 70 &&
    rsResult.score >= 70 &&
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
