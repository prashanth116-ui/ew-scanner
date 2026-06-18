/**
 * VCP (Volatility Contraction Pattern) Breakout scoring engine.
 * 5-category 0-100 scale with institutional quality gates.
 * SERVER-ONLY: Used by /api/prerun/* routes.
 */

import "server-only";

import type {
  PreRunStockData,
  VCPGates,
  VCPScores,
  VCPPhase,
  VCPRiskCalc,
  VCPResult,
} from "./types";

// ── Gates ──

export function evaluateVCPGates(data: PreRunStockData): VCPGates {
  const price = data.currentPrice ?? 0;
  const priceAbove10 = price >= 10;
  const avgVolAbove500k = (data.vcpAvgVolume50d ?? 0) >= 500_000;
  const dollarVolAbove20m = (data.vcpAvgDollarVolume ?? 0) >= 20_000_000;
  const mktCapAbove1b = (data.marketCap ?? 0) >= 1_000_000_000;
  const aboveSma200 = price > 0 && (data.vcpSma200 ?? 0) > 0 && price > data.vcpSma200!;
  const aboveSma50 = price > 0 && (data.vcpSma50 ?? 0) > 0 && price > data.vcpSma50!;
  const allPass = priceAbove10 && avgVolAbove500k && dollarVolAbove20m && mktCapAbove1b && aboveSma200 && aboveSma50;

  return { priceAbove10, avgVolAbove500k, dollarVolAbove20m, mktCapAbove1b, aboveSma200, aboveSma50, allPass };
}

// ── Trend Score (0-25) ──

export function scoreTrend(data: PreRunStockData): number {
  let score = 0;
  const price = data.currentPrice ?? 0;
  const sma50 = data.vcpSma50 ?? 0;
  const sma200 = data.vcpSma200 ?? 0;

  // Above SMA50
  if (price > 0 && sma50 > 0 && price > sma50) score += 5;
  // Above SMA200
  if (price > 0 && sma200 > 0 && price > sma200) score += 5;
  // SMA50 > SMA200 (golden cross order)
  if (sma50 > 0 && sma200 > 0 && sma50 > sma200) score += 5;

  // Within 25% of 52w high
  const high52w = data.high52w ?? 0;
  if (price > 0 && high52w > 0) {
    const pctFrom52w = ((high52w - price) / high52w) * 100;
    if (pctFrom52w <= 15) score += 8;       // within 15%: +5 base +3 bonus
    else if (pctFrom52w <= 25) score += 5;  // within 25%: +5 base
  }

  // Extended penalty: >10% above SMA50
  const distFromSma50 = data.vcpDistFromSma50Pct ?? 0;
  if (distFromSma50 > 10) score -= 3;

  return Math.max(0, Math.min(25, score));
}

// ── Volume Score (0-20) ──

export function scoreVolume(data: PreRunStockData): number {
  let score = 0;

  // Dry volume days (0-8)
  const dryDays = data.vcpDryVolumeDays ?? 0;
  if (dryDays >= 5) score += 8;
  else if (dryDays >= 3) score += 5;
  else if (dryDays >= 1) score += 2;

  // Up/down volume ratio (0-6)
  const avgUp = data.avgVolumeUpDays ?? 0;
  const avgDown = data.avgVolumeDownDays ?? 1;
  if (avgDown > 0) {
    const ratio = avgUp / avgDown;
    if (ratio >= 1.5) score += 6;
    else if (ratio >= 1.2) score += 4;
    else if (ratio >= 1.0) score += 2;
  } else if (avgUp > 0) {
    score += 6;
  }

  // Volume contraction: 10d avg / 50d avg ratio (0-6)
  const vol10d = data.vcpAvgVolume10d ?? 0;
  const vol50d = data.vcpAvgVolume50d ?? 1;
  if (vol50d > 0 && vol10d > 0) {
    const volRatio = vol10d / vol50d;
    if (volRatio <= 0.5) score += 6;      // Strong contraction
    else if (volRatio <= 0.7) score += 4;
    else if (volRatio <= 0.85) score += 2;
  }

  return Math.max(0, Math.min(20, score));
}

// ── Compression Score (0-25) ──

export function scoreCompression(data: PreRunStockData): number {
  let score = 0;

  // ATR contracting (reuse existing field)
  if (data.atrContracting === true) score += 5;

  // Range nesting: 5d < 10d < 20d
  const r5 = data.vcpRange5d;
  const r10 = data.vcpRange10d;
  const r20 = data.vcpRange20d;
  if (r5 !== null && r10 !== null && r20 !== null) {
    if (r5 < r10 && r10 < r20) score += 5;        // Full nesting
    else if (r5 < r10 || r10 < r20) score += 3;   // Partial nesting
  }

  // Tight closes
  if (data.vcpTightCloses === true) score += 5;

  // Inside bar count
  const insideBars = data.vcpInsideBarCount ?? 0;
  if (insideBars >= 2) score += 5;
  else if (insideBars >= 1) score += 3;

  // ATR% tightness
  const atrPct = data.vcpAtrPct ?? 100;
  if (atrPct < 2) score += 5;
  else if (atrPct < 3) score += 3;
  else if (atrPct < 4) score += 1;

  return Math.max(0, Math.min(25, score));
}

// ── Relative Strength Score (0-15) ──

export function scoreRelativeStrength(data: PreRunStockData): number {
  let score = 0;

  // RS vs SPY (0-8)
  const rsVsSpy = data.vcpRelStrengthVsSPY ?? null;
  if (rsVsSpy !== null) {
    if (rsVsSpy > 10) score += 8;
    else if (rsVsSpy > 5) score += 6;
    else if (rsVsSpy > 0) score += 3;
  }

  // RS vs sector ETF (0-7)
  const rsVsSector = data.relativeStrength20d ?? null;
  if (rsVsSector !== null) {
    if (rsVsSector > 5) score += 7;
    else if (rsVsSector > 0) score += 4;
  }

  return Math.max(0, Math.min(15, score));
}

// ── Risk Quality Score (0-15) ──

export function scoreRiskQuality(data: PreRunStockData): number {
  let score = 0;

  // Tight stop: ATR% (0-5)
  const atrPct = data.vcpAtrPct ?? 100;
  if (atrPct < 2) score += 5;
  else if (atrPct < 3) score += 3;
  else if (atrPct < 5) score += 1;

  // Not extended above SMA50 (0-5)
  const dist = data.vcpDistFromSma50Pct ?? 100;
  if (dist >= 0 && dist <= 5) score += 5;
  else if (dist > 5 && dist <= 10) score += 3;
  else if (dist > 10 && dist <= 15) score += 1;

  // Liquidity — dollar volume (0-5)
  const dolVol = data.vcpAvgDollarVolume ?? 0;
  if (dolVol >= 100_000_000) score += 5;
  else if (dolVol >= 50_000_000) score += 3;
  else if (dolVol >= 20_000_000) score += 1;

  return Math.max(0, Math.min(15, score));
}

// ── Risk Calculator ──

export function calcVCPRisk(
  data: PreRunStockData,
  accountSize = 100_000,
  riskPct = 0.002,
): VCPRiskCalc {
  const pivotHigh = data.vcpPivotHigh;
  const atrPct = data.vcpAtrPct;
  const price = data.currentPrice;
  const sma10 = data.vcpSma10;

  if (pivotHigh === null || atrPct === null || price === null || price <= 0) {
    return {
      accountSize, riskPct,
      entry: null, stop: null, riskPerShare: null, shares: null,
      target2R: null, target3R: null, target6R: null, target10R: null,
      sma10Exit: sma10,
    };
  }

  const entry = pivotHigh + 0.10;
  const atrDollar = (atrPct / 100) * price;
  const stop = entry - 1.5 * atrDollar;
  const riskPerShare = entry - stop;

  if (riskPerShare <= 0) {
    return {
      accountSize, riskPct,
      entry, stop, riskPerShare: 0, shares: 0,
      target2R: null, target3R: null, target6R: null, target10R: null,
      sma10Exit: sma10,
    };
  }

  const maxSharesByRisk = Math.floor((accountSize * riskPct) / riskPerShare);
  const maxSharesByPosition = Math.floor((accountSize * 0.25) / entry);
  const shares = Math.min(maxSharesByRisk, maxSharesByPosition);

  return {
    accountSize,
    riskPct,
    entry: Math.round(entry * 100) / 100,
    stop: Math.round(stop * 100) / 100,
    riskPerShare: Math.round(riskPerShare * 100) / 100,
    shares,
    target2R: Math.round((entry + 2 * riskPerShare) * 100) / 100,
    target3R: Math.round((entry + 3 * riskPerShare) * 100) / 100,
    target6R: Math.round((entry + 6 * riskPerShare) * 100) / 100,
    target10R: Math.round((entry + 10 * riskPerShare) * 100) / 100,
    sma10Exit: sma10,
  };
}

// ── Phase Classification ──

export function classifyVCPPhase(score: number): VCPPhase {
  if (score >= 85) return "FOCUS_LIST";
  if (score >= 75) return "WATCHLIST_CANDIDATE";
  if (score >= 65) return "EARLY_SETUP";
  return "IGNORE";
}

// ── Full VCP Scoring Pipeline ──

export function scoreVCP(
  data: PreRunStockData,
  accountSize = 100_000,
  riskPct = 0.002,
): VCPResult {
  const gates = evaluateVCPGates(data);

  const trendScore = gates.allPass ? scoreTrend(data) : 0;
  const volumeScore = gates.allPass ? scoreVolume(data) : 0;
  const compressionScore = gates.allPass ? scoreCompression(data) : 0;
  const relStrengthScore = gates.allPass ? scoreRelativeStrength(data) : 0;
  const riskQualityScore = gates.allPass ? scoreRiskQuality(data) : 0;
  const totalScore = trendScore + volumeScore + compressionScore + relStrengthScore + riskQualityScore;

  const scores: VCPScores = {
    trendScore,
    volumeScore,
    compressionScore,
    relStrengthScore,
    riskQualityScore,
    totalScore,
  };

  const phase = classifyVCPPhase(totalScore);
  const riskCalc = calcVCPRisk(data, accountSize, riskPct);

  return { data, gates, scores, phase, riskCalc };
}
