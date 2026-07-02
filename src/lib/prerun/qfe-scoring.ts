/**
 * QFE Decision Engine — Quality, Leadership, Entry, Market Environment.
 * Universal normalization and ranking layer across all scanners.
 * Produces a unified 0-100 score, actionable recommendation, and commentary.
 */

import "server-only";

import type { PreRunStockData } from "./types";
import { fetchYahooChart, calcNdReturn } from "./data";

// ── Types ──

export type QFERating = "A+" | "A" | "B+" | "B" | "C" | "D";
export type QFEAction = "Buy Now" | "Buy Pullback" | "Watchlist" | "Wait" | "Avoid";
export type QFERiskLevel = "Low" | "Moderate" | "High";
export type QFEExtensionLevel = "Low" | "Moderate" | "Extended";

export type MarketRegime = "Bullish" | "Constructive" | "Neutral" | "Cautious" | "Defensive";

export interface MarketEnvironment {
  spyTrendScore: number;
  qqqTrendScore: number;
  sectorBreadthScore: number;
  distributionDayScore: number;
  spyDistFromHighScore: number;
  totalScore: number;
  // Raw values for commentary
  spyAboveSma50: boolean;
  spyAboveSma200: boolean;
  spyDistributionDays: number;
  leadingSectors: number;
  improvingSectors: number;
  regime: MarketRegime;
}

export interface QFEResult {
  scores: {
    quality: number;
    leadership: number;
    entry: number;
    marketEnv: number;
    composite: number;
  };
  rating: QFERating;
  action: QFEAction;
  riskLevel: QFERiskLevel;
  extensionLevel: QFEExtensionLevel;
  commentary: string;
  sourcePresets: string[];
}

// ── Helpers ──

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function tierScore(value: number | null, tiers: [number, number][]): number {
  if (value === null || value === undefined) return 0;
  for (const [threshold, points] of tiers) {
    if (value >= threshold) return points;
  }
  return 0;
}

// ── Market Environment (called ONCE per cron run) ──

/**
 * Compute market environment from SPY 1y chart + sector quadrants.
 * Single extra API call (SPY 1y) per cron run.
 */
export async function computeMarketEnvironment(
  sectorQuadrants: Record<string, string>,
): Promise<MarketEnvironment> {
  // Fetch SPY 1y chart for SMA200 (3mo cache only has ~63 bars, not enough)
  const spy1y = await fetchYahooChart("SPY", "1y", "1d");

  let spyAboveSma50 = false;
  let spyAboveSma200 = false;
  let spyDistributionDays = 0;
  let spyDistFromHigh = 100; // pessimistic default

  if (spy1y && spy1y.closes.length >= 200) {
    const closes = spy1y.closes;
    const volumes = spy1y.volumes;
    const lastClose = closes[closes.length - 1];

    // SMA50 and SMA200
    const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const sma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
    spyAboveSma50 = lastClose > sma50;
    spyAboveSma200 = lastClose > sma200;

    // Distribution days: sessions in last 25 declining >0.2% on above-avg volume
    const n = Math.min(25, closes.length - 1);
    const avgVol = volumes.slice(-50).reduce((a, b) => a + b, 0) / 50;
    for (let i = closes.length - n; i < closes.length; i++) {
      const changePct = ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100;
      if (changePct < -0.2 && volumes[i] > avgVol) spyDistributionDays++;
    }

    // % from 3mo high
    const high3mo = Math.max(...closes.slice(-63));
    spyDistFromHigh = high3mo > 0 ? ((high3mo - lastClose) / high3mo) * 100 : 0;
  }

  // SPY Trend (0-25)
  let spyTrendScore = 5;
  if (spyAboveSma50 && spyAboveSma200) spyTrendScore = 25;
  else if (spyAboveSma200) spyTrendScore = 15;

  // QQQ Trend (0-15) — use QQQ from 3mo sector cache (SMA50 is sufficient)
  let qqqTrendScore = 5;
  // We don't have QQQ SMA200 from sector cache (3mo), but we have QQQ 50d of data
  // Use a simplified approach: QQQ 20d return direction
  const qqq3mo = await fetchYahooChart("QQQ", "3mo", "1d");
  if (qqq3mo && qqq3mo.closes.length >= 50) {
    const lastClose = qqq3mo.closes[qqq3mo.closes.length - 1];
    const sma50 = qqq3mo.closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const ret20d = calcNdReturn(qqq3mo.closes, 20);
    if (lastClose > sma50 && ret20d !== null && ret20d > 0) qqqTrendScore = 15;
    else if (lastClose > sma50) qqqTrendScore = 10;
  }

  // Sector Breadth (0-25)
  let leadingSectors = 0;
  let improvingSectors = 0;
  for (const q of Object.values(sectorQuadrants)) {
    if (q === "LEADING") leadingSectors++;
    if (q === "IMPROVING") improvingSectors++;
  }
  const strongSectors = leadingSectors + improvingSectors;
  let sectorBreadthScore = 5;
  if (strongSectors >= 8) sectorBreadthScore = 25;
  else if (strongSectors >= 6) sectorBreadthScore = 20;
  else if (strongSectors >= 4) sectorBreadthScore = 15;
  else if (strongSectors >= 2) sectorBreadthScore = 10;

  // Distribution Days (0-20)
  let distributionDayScore = 20;
  if (spyDistributionDays >= 6) distributionDayScore = 0;
  else if (spyDistributionDays >= 4) distributionDayScore = 8;
  else if (spyDistributionDays >= 2) distributionDayScore = 15;

  // SPY % from 3mo High (0-15)
  let spyDistFromHighScore = 0;
  if (spyDistFromHigh <= 3) spyDistFromHighScore = 15;
  else if (spyDistFromHigh <= 5) spyDistFromHighScore = 12;
  else if (spyDistFromHigh <= 10) spyDistFromHighScore = 8;
  else if (spyDistFromHigh <= 15) spyDistFromHighScore = 4;

  const totalScore = spyTrendScore + qqqTrendScore + sectorBreadthScore + distributionDayScore + spyDistFromHighScore;

  let regime: MarketRegime = "Defensive";
  if (totalScore >= 80) regime = "Bullish";
  else if (totalScore >= 60) regime = "Constructive";
  else if (totalScore >= 40) regime = "Neutral";
  else if (totalScore >= 25) regime = "Cautious";

  return {
    spyTrendScore,
    qqqTrendScore,
    sectorBreadthScore,
    distributionDayScore,
    spyDistFromHighScore: spyDistFromHighScore,
    totalScore,
    spyAboveSma50,
    spyAboveSma200,
    spyDistributionDays,
    leadingSectors,
    improvingSectors,
    regime,
  };
}

// ── Quality Engine (0-100) ──

export function scoreQuality(data: PreRunStockData): number {
  let total = 0;

  // Liquidity (0-15)
  const dollarVol = data.vcpAvgDollarVolume ?? 0;
  total += tierScore(dollarVol, [
    [500_000_000, 15], [200_000_000, 12], [100_000_000, 10],
    [50_000_000, 7], [20_000_000, 4],
  ]);

  // Volume Accumulation (0-20)
  const upDown = (data.avgVolumeUpDays ?? 0) / Math.max(data.avgVolumeDownDays ?? 1, 1);
  total += tierScore(upDown, [[2.0, 8], [1.5, 6], [1.2, 4], [1.0, 2]]);
  if (data.obvDivergent === true) total += 4;
  if (data.vpDivergenceBullish === true) total += 4;
  const mfp = data.moneyFlowPersistence ?? 0;
  total += tierScore(mfp, [[15, 4], [12, 3], [8, 2], [5, 1]]);

  // Trend Health (0-20)
  if (data.aboveEma21 === true) total += 4;
  if (data.aboveEma50 === true) total += 4;
  const hlCount = data.higherLowsCount ?? 0;
  if (hlCount >= 2) total += 4;
  else if (hlCount >= 1) total += 2;
  if (data.emaCrossoverWithin20d === true) total += 4;
  if (data.atrContracting === true) total += 4;

  // Institutional Footprint (0-15)
  const instPct = data.institutionalPct ?? 0;
  total += tierScore(instPct, [[80, 5], [60, 4], [40, 3], [20, 2]]);
  const insiders = data.insiderBuys45d ?? 0;
  total += tierScore(insiders, [[3, 4], [2, 3], [1, 2]]);
  // Options flow: bullish if PC ratio < 0.7
  const pcr = data.putCallRatio;
  if (pcr !== null && pcr < 0.5) total += 3;
  else if (pcr !== null && pcr < 0.7) total += 2;
  // Float rotation
  const floatTurnover = data.floatTurnover20d ?? 0;
  total += tierScore(floatTurnover, [[2.0, 3], [1.0, 2], [0.5, 1]]);

  // Earnings Quality (0-15)
  const revGrowth = data.revenueGrowthYoY ?? 0;
  total += tierScore(revGrowth, [[30, 5], [15, 4], [5, 3], [0, 1]]);
  const beatStreak = data.earningsBeatStreak ?? 0;
  total += tierScore(beatStreak, [[4, 4], [3, 3], [2, 2], [1, 1]]);
  const analystRev = data.analystRevisionTrend ?? 0;
  if (analystRev > 0) total += 3;
  else if (analystRev === 0) total += 1;
  // Squeeze composite from atrRatio5v20
  const atrRatio = data.atrRatio5v20 ?? 1;
  if (atrRatio < 0.7) total += 3;
  else if (atrRatio < 0.9) total += 1;

  // Data Quality (0-5)
  const dq = data.dataQuality ?? 0;
  total += tierScore(dq, [[90, 5], [75, 3], [60, 2]]);

  // Base Position (0-10)
  const pctFromAth = data.pctFromAth ?? 0;
  if (pctFromAth >= 40 && hlCount >= 2) total += 10; // Deep base with structure
  else if (pctFromAth >= 25 && hlCount >= 1) total += 7;
  else if (pctFromAth <= 10) total += 8; // Near highs (leaders)
  else if (pctFromAth <= 20) total += 5;

  return clamp(total, 0, 100);
}

// ── Leadership Engine (0-100) ──

export function scoreLeadership(data: PreRunStockData): number {
  let total = 0;

  // Multi-TF RS vs SPY (0-25)
  total += tierScore(data.rs5dVsSPY, [[5, 7], [2, 5], [0, 3]]);
  total += tierScore(data.rs10dVsSPY, [[5, 6], [2, 4], [0, 2]]);
  total += tierScore(data.relativeStrength20d, [[5, 6], [2, 4], [0, 2]]);
  total += tierScore(data.rs50dVsSPY, [[5, 6], [2, 4], [0, 2]]);

  // Multi-TF RS vs QQQ (0-15)
  total += tierScore(data.rs5dVsQQQ, [[5, 4], [2, 3], [0, 1]]);
  total += tierScore(data.rs10dVsQQQ, [[5, 4], [2, 3], [0, 1]]);
  total += tierScore(data.rs50dVsQQQ, [[5, 4], [2, 3], [0, 1]]);
  // Cap QQQ portion at 15
  // (individual tiers max at 4 each = 12, leaves room for acceleration)
  // We add the remaining 3 via rs20d vs QQQ
  const rsVsQQQ = data.instRsVsQQQ ?? 0;
  if (rsVsQQQ > 5) total += 3;

  // RS vs Sector (0-15)
  total += tierScore(data.rs5dVsSector, [[3, 4], [1, 3], [0, 1]]);
  total += tierScore(data.rs10dVsSector, [[3, 4], [1, 3], [0, 1]]);
  total += tierScore(data.rs50dVsSector, [[3, 4], [1, 3], [0, 1]]);
  // Sector RS 20d already captured in relativeStrength20d (vs sector ETF)
  // Adding 3 more for strong 50d sector RS
  if ((data.rs50dVsSector ?? 0) > 5) total += 3;

  // RS Acceleration (0-20)
  total += tierScore(data.instRsAccelVsSPY, [[3, 10], [1, 7], [0.5, 4], [0, 2]]);
  total += tierScore(data.instRsAccelTrend, [[0.5, 5], [0.1, 3], [0, 1]]);
  const rvolTraj = data.rvolTrajectory ?? 0;
  total += tierScore(rvolTraj, [[0.3, 5], [0.1, 3], [0, 1]]);

  // Sector Leadership (0-15) — not passed directly, use sector-related data
  // We don't have quadrant in data, but we have sectorReturn20d
  const sectorRet = data.sectorReturn20d ?? 0;
  if (sectorRet > 5) total += 5;
  else if (sectorRet > 2) total += 3;
  else if (sectorRet > 0) total += 1;
  // Remaining 10 points come from quadrant, applied in computeQFE

  // Resilience (0-10)
  const hlCount = data.higherLowsCount ?? 0;
  const pctFromBase = data.pctFromBaseHigh ?? 100;
  if (hlCount >= 3 && pctFromBase <= 5) total += 10;
  else if (hlCount >= 2 && pctFromBase <= 10) total += 7;
  else if (hlCount >= 2) total += 5;
  else if (hlCount >= 1) total += 3;

  return clamp(total, 0, 100);
}

// ── Entry Engine (0-100) ──

export function scoreEntry(data: PreRunStockData): number {
  let total = 0;

  // EMA Proximity (0-20)
  const distEma10 = Math.abs(data.distFromEma10Atr ?? 5);
  if (distEma10 <= 0.3) total += 10;
  else if (distEma10 <= 0.5) total += 8;
  else if (distEma10 <= 1.0) total += 5;
  else if (distEma10 <= 1.5) total += 3;

  const distEma20 = Math.abs(data.instDistFromEma20Atr ?? 5);
  if (distEma20 <= 0.3) total += 10;
  else if (distEma20 <= 0.5) total += 8;
  else if (distEma20 <= 1.0) total += 5;
  else if (distEma20 <= 1.5) total += 3;

  // Breakout Proximity (0-15)
  const pctFromBase = data.pctFromBaseHigh ?? 100;
  if (pctFromBase <= 2) total += 15;
  else if (pctFromBase <= 5) total += 12;
  else if (pctFromBase <= 10) total += 8;
  else if (pctFromBase <= 15) total += 4;

  // Compression Quality (0-15)
  if (data.atrContracting === true) total += 5;
  if (data.closesNearRangeTop === true) total += 5;
  const coilN = (data.closesNearRangeTop === true ? 1 : 0) + (data.atrContracting === true ? 1 : 0);
  if (coilN >= 2) total += 5;

  // Pullback Quality (0-15)
  const hlCount = data.higherLowsCount ?? 0;
  if (hlCount >= 2) total += 5;
  else if (hlCount >= 1) total += 3;
  if (data.vpDivergenceBullish === true) total += 5;
  if (data.aboveEma50 === true) total += 5;

  // Extension Penalty (0 to -15)
  const rawDistEma20 = data.instDistFromEma20Atr ?? 0;
  if (rawDistEma20 > 4) total -= 15;
  else if (rawDistEma20 > 3) total -= 10;
  else if (rawDistEma20 > 2) total -= 5;

  // Earnings Risk (-10 to 0)
  const dte = data.daysToEarnings;
  if (dte !== null && dte <= 3) total -= 10;
  else if (dte !== null && dte <= 7) total -= 5;
  else if (dte !== null && dte <= 14) total -= 2;

  // Weekly Confirmation (0-10)
  if (data.weeklyReversalSignal === true) total += 5;
  // Weekly close near high approximation: use closesNearRangeTop as proxy
  if (data.closesNearRangeTop === true && data.aboveEma21 === true) total += 5;

  // Gap Risk (0-10)
  const gapPct = Math.abs(data.instGapPct ?? 0);
  if (gapPct <= 0.5) total += 10;
  else if (gapPct <= 1.0) total += 7;
  else if (gapPct <= 2.0) total += 4;

  return clamp(total, 0, 100);
}

// ── Composite + Classification ──

export function computeQFE(
  data: PreRunStockData,
  marketEnv: MarketEnvironment,
  sourcePresets: string[],
  quadrant: string | null,
): QFEResult {
  const quality = scoreQuality(data);
  let leadership = scoreLeadership(data);
  const entry = scoreEntry(data);
  const marketEnvScore = marketEnv.totalScore;

  // Add quadrant bonus to leadership (deferred from scoreLeadership)
  if (quadrant === "LEADING") leadership = clamp(leadership + 10, 0, 100);
  else if (quadrant === "IMPROVING") leadership = clamp(leadership + 7, 0, 100);
  else if (quadrant === "WEAKENING") leadership = clamp(leadership - 3, 0, 100);
  else if (quadrant === "LAGGING") leadership = clamp(leadership - 5, 0, 100);

  const composite = Math.round(
    quality * 0.30 + leadership * 0.30 + entry * 0.25 + marketEnvScore * 0.15
  );

  // Rating
  let rating: QFERating = "D";
  if (composite >= 90) rating = "A+";
  else if (composite >= 80) rating = "A";
  else if (composite >= 70) rating = "B+";
  else if (composite >= 60) rating = "B";
  else if (composite >= 45) rating = "C";

  // Risk Level
  const beta = data.instBeta ?? 1;
  const gapPct = Math.abs(data.instGapPct ?? 0);
  const atrPct = data.vcpAtrPct ?? 0;
  const dte = data.daysToEarnings;
  let riskLevel: QFERiskLevel = "Moderate";
  if (beta > 1.5 || gapPct > 2.0 || atrPct > 3.5 || (dte !== null && dte <= 5)) {
    riskLevel = "High";
  } else if (beta <= 1.0 && gapPct <= 1.0 && atrPct <= 2.0 && (dte === null || dte > 14)) {
    riskLevel = "Low";
  }

  // Extension Level
  const distEma20 = data.instDistFromEma20Atr ?? 0;
  let extensionLevel: QFEExtensionLevel = "Low";
  if (distEma20 > 2.0) extensionLevel = "Extended";
  else if (distEma20 > 1.0) extensionLevel = "Moderate";

  // Action
  let action: QFEAction = "Avoid";
  if (entry >= 70 && quality >= 60 && leadership >= 60 && riskLevel !== "High") {
    action = "Buy Now";
  } else if (quality >= 60 && leadership >= 60 && entry < 70) {
    action = "Buy Pullback";
  } else if (quality >= 50 && leadership >= 50 && entry < 50) {
    action = "Watchlist";
  } else if (quality >= 40 || leadership >= 40) {
    action = "Wait";
  }

  const commentary = buildCommentary(data, { quality, leadership, entry, marketEnv: marketEnvScore, composite }, riskLevel, extensionLevel);

  return {
    scores: { quality, leadership, entry, marketEnv: marketEnvScore, composite },
    rating,
    action,
    riskLevel,
    extensionLevel,
    commentary,
    sourcePresets,
  };
}

// ── Commentary Builder ──

function buildCommentary(
  data: PreRunStockData,
  scores: { quality: number; leadership: number; entry: number; marketEnv: number; composite: number },
  riskLevel: QFERiskLevel,
  extensionLevel: QFEExtensionLevel,
): string {
  const parts: string[] = [];

  // Leadership
  const rs20d = data.relativeStrength20d ?? 0;
  if (rs20d > 5) {
    parts.push(`Leading SPY by ${rs20d.toFixed(1)}% over 20D${(data.instRsAccelVsSPY ?? 0) > 1 ? ", RS accelerating" : ""}.`);
  } else if (rs20d > 0) {
    parts.push(`Outperforming SPY by ${rs20d.toFixed(1)}% over 20D.`);
  }

  // Accumulation
  const mfp = data.moneyFlowPersistence ?? 0;
  if (mfp >= 12) {
    parts.push(`Quiet accumulation on ${mfp} of last 20 sessions.`);
  } else if (data.obvDivergent === true) {
    parts.push("OBV divergence signals stealth accumulation.");
  }

  // Entry
  const distEma10 = data.distFromEma10Atr ?? 0;
  parts.push(`${Math.abs(distEma10).toFixed(1)} ATR from EMA10, ${extensionLevel.toLowerCase()} extension.`);

  // Weekly reversal
  if (data.weeklyReversalSignal === true && data.weeklyReversalType) {
    const typeLabel = data.weeklyReversalType === "outside_bar" ? "outside bar" : data.weeklyReversalType;
    parts.push(`Weekly ${typeLabel} signal detected.`);
  }

  // Earnings
  const dte = data.daysToEarnings;
  if (dte !== null && dte <= 14) {
    parts.push(`Earnings in ${dte} days.`);
  }

  // Risk
  if (riskLevel === "High") {
    const reasons: string[] = [];
    if ((data.instBeta ?? 1) > 1.5) reasons.push(`beta ${(data.instBeta ?? 0).toFixed(1)}`);
    if (Math.abs(data.instGapPct ?? 0) > 2.0) reasons.push(`gap ${Math.abs(data.instGapPct ?? 0).toFixed(1)}%`);
    if (reasons.length > 0) parts.push(`Elevated risk: ${reasons.join(", ")}.`);
  }

  // Volume trajectory
  const rvol = data.rvolTrajectory ?? 0;
  if (rvol > 0.3) {
    parts.push("Volume trajectory building.");
  }

  return parts.slice(0, 5).join(" ");
}
