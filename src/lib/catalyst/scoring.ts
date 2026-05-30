/**
 * Catalyst Scanner v2 scoring engine.
 * 13 factors (max 100), 3 stubbed for Phase 2.
 * Max achievable score in phase 1: 85.
 */

import type {
  CatalystScores,
  CatalystVerdict,
  MissCategory,
  CatalystRawData,
  CatalystResult,
  ETFPriceData,
} from "./types";
import type { CatalystTicker, CatalystLayer } from "@/data/catalyst-universe";
import { getLayerPeers } from "@/data/catalyst-universe";

// ── Verdict thresholds (adjusted for 85 max achievable) ──

const PRESPIKE_THRESHOLD = 68;
const WATCH_THRESHOLD = 58;
const MONITOR_THRESHOLD = 48;

// ── Individual Scoring Functions ──

/** Factor 1: Days to catalyst (max 12). */
export function scoreDaysToCatalyst(days: number | null): number {
  if (days === null) return 0;
  if (days <= 2) return 12;
  if (days <= 5) return 10;
  if (days <= 10) return 8;
  if (days <= 14) return 6;
  if (days <= 21) return 4;
  if (days <= 30) return 2;
  return 0;
}

/** Factor 2: Mean reversion — YTD drawdown (max 8). */
export function scoreMeanReversion(ytdPct: number): number {
  if (ytdPct <= -40) return 8;
  if (ytdPct <= -30) return 6;
  if (ytdPct <= -20) return 5;
  if (ytdPct <= -10) return 3;
  return 0;
}

/** Factor 3: Momentum breakout — near 52wk high + volume (max 7). */
export function scoreMomentumBreakout(
  price: number,
  high52: number,
  vol5d: number,
  vol20d: number
): number {
  if (high52 <= 0) return 0;
  const pctFromHigh = ((high52 - price) / high52) * 100;
  const volRatio = vol20d > 0 ? vol5d / vol20d : 1;

  if (pctFromHigh <= 5 && volRatio > 1.5) return 7;
  if (pctFromHigh <= 5) return 4;
  if (pctFromHigh <= 10 && volRatio > 1.5) return 5;
  if (pctFromHigh <= 10) return 3;
  return 0;
}

/** Factor 4: Short interest as % of float (max 10). */
export function scoreShortInterest(siPct: number): number {
  if (siPct <= 0) return 0;
  if (siPct >= 30) return 10;
  // Linear interpolation: 0% → 0, 30% → 10
  return Math.round((siPct / 30) * 10 * 10) / 10;
}

/** Factor 5: Analyst upside to target (max 8). */
export function scoreAnalystUpside(target: number, price: number): number {
  if (price <= 0 || target <= 0) return 0;
  const upside = ((target - price) / price) * 100;
  if (upside >= 50) return 8;
  if (upside >= 35) return 6;
  if (upside >= 20) return 4;
  if (upside >= 10) return 2;
  return 0;
}

/** Factor 6: Volume ratio 5d/20d (max 10). */
export function scoreVolumeRatio(vol5d: number, vol20d: number): number {
  if (vol20d <= 0) return 0;
  const ratio = vol5d / vol20d;
  if (ratio >= 3) return 10;
  if (ratio <= 1) return 0;
  // Linear interpolation: 1x → 0, 3x → 10
  return Math.round(((ratio - 1) / 2) * 10 * 10) / 10;
}

/** Factor 7: RSI sweet spot 30-60 (max 8). */
export function scoreRSI(rsi: number): number {
  if (rsi >= 35 && rsi <= 50) return 8;
  if ((rsi >= 30 && rsi < 35) || (rsi > 50 && rsi <= 60)) return 5;
  if (rsi < 30) return 3; // oversold — some value
  if (rsi > 70) return 0; // overbought — no value
  return 1; // 60-70 range
}

/** Factor 8: Peer spiked — sympathy play potential (max 8). */
export function scorePeerSpiked(
  symbol: string,
  allData: Map<string, CatalystRawData>
): { score: number; spikedPeers: string[] } {
  const peers = getLayerPeers(symbol);
  const spikedPeers: string[] = [];

  for (const peer of peers) {
    const peerData = allData.get(peer.symbol);
    if (peerData && peerData.change5d >= 10) {
      spikedPeers.push(peer.symbol);
    }
  }

  if (spikedPeers.length >= 2) return { score: 8, spikedPeers };
  if (spikedPeers.length === 1) return { score: 5, spikedPeers };
  return { score: 0, spikedPeers };
}

/** Factor 9: Sector ETF momentum (max 7). */
export function scoreSectorETF(etfData: ETFPriceData | null): number {
  if (!etfData || etfData.closes.length < 2) return 0;
  const { currentPrice, high20d } = etfData;
  if (high20d <= 0) return 0;

  const pctFromHigh = ((high20d - currentPrice) / high20d) * 100;
  if (pctFromHigh <= 0.1) return 7; // At 20d high
  if (pctFromHigh <= 2) return 5;
  if (pctFromHigh <= 5) return 3;
  return 0;
}

/** Factor 10: Revenue acceleration — STUB (Phase 2). */
export function scoreRevenueAcceleration(): number {
  return 0;
}

/** Factor 11: MA position — trend alignment (max 5). */
export function scoreMAPosition(
  price: number,
  sma50: number,
  sma200: number
): number {
  let score = 0;
  if (price > sma50 && price > sma200) score = 5;
  else if (price > sma50) score = 3;
  else if (price > sma200) score = 2;

  // Golden cross bonus
  if (sma50 > sma200 && price > sma50) {
    score = Math.min(5, score + 2);
  }

  return score;
}

/** Factor 12: IV Rank — STUB (Phase 2). */
export function scoreIVRank(): number {
  return 0;
}

/** Factor 13: News cluster — STUB (Phase 2). */
export function scoreNewsCluster(): number {
  return 0;
}

// ── Composite Scoring ──

/** Compute all 13 factor scores for a ticker. */
export function computeScores(
  data: CatalystRawData,
  daysToCatalyst: number | null,
  allData: Map<string, CatalystRawData>,
  etfData: ETFPriceData | null
): { scores: CatalystScores; totalScore: number; peersThatSpiked: string[] } {
  const peerResult = scorePeerSpiked(data.symbol, allData);

  const scores: CatalystScores = {
    daysToCatalyst: scoreDaysToCatalyst(daysToCatalyst),
    meanReversion: scoreMeanReversion(data.ytdChange),
    momentumBreakout: scoreMomentumBreakout(
      data.price,
      data.fiftyTwoWeekHigh,
      data.volume5dAvg,
      data.volume20dAvg
    ),
    shortInterest: scoreShortInterest(data.shortPercentFloat),
    analystUpside: scoreAnalystUpside(data.analystTarget, data.price),
    volumeRatio: scoreVolumeRatio(data.volume5dAvg, data.volume20dAvg),
    rsiPosition: scoreRSI(data.closes.length >= 15 ? computeRSIFromCloses(data.closes) : 50),
    peerSpiked: peerResult.score,
    sectorEtfMomentum: scoreSectorETF(etfData),
    revenueAcceleration: scoreRevenueAcceleration(),
    maPosition: scoreMAPosition(data.price, data.sma50, data.sma200),
    ivRank: scoreIVRank(),
    newsCluster: scoreNewsCluster(),
  };

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  return {
    scores,
    totalScore: Math.round(totalScore * 10) / 10,
    peersThatSpiked: peerResult.spikedPeers,
  };
}

/** Compute RSI from raw closes (convenience helper). */
function computeRSIFromCloses(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }

  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ── Verdict Classification ──

/** Determine verdict based on total score. */
export function classifyVerdict(totalScore: number): CatalystVerdict {
  if (totalScore >= PRESPIKE_THRESHOLD) return "PRE_SPIKE";
  if (totalScore >= WATCH_THRESHOLD) return "WATCH";
  if (totalScore >= MONITOR_THRESHOLD) return "MONITOR";
  return "MISS";
}

// ── Miss Classification ──

/** Classify why a stock missed the scanner. */
export function classifyMiss(
  data: CatalystRawData,
  totalScore: number,
  ticker: CatalystTicker,
  peersThatSpiked: string[],
  etfData: ETFPriceData | null,
  daysToCatalyst: number | null
): { category: MissCategory; reason: string } {
  // Already moved: YTD > +50% OR 5d change > +15%
  if (data.ytdChange > 50 || data.change5d > 15) {
    return {
      category: "already_moved",
      reason: data.ytdChange > 50
        ? `YTD +${data.ytdChange.toFixed(0)}%, already moved. Stock may have been a PRE_SPIKE months ago.`
        : `5d change +${data.change5d.toFixed(1)}%, spiked too fast to catch.`,
    };
  }

  // Post-spike: 5d change > +10% (just spiked, move is done)
  if (data.change5d > 10) {
    return {
      category: "post_spike",
      reason: `5d change +${data.change5d.toFixed(1)}%, spike already happened. Wait for pullback.`,
    };
  }

  // Wrong sector: commodities or ai-power AND no peer spiked AND sector ETF not moving
  if (
    (ticker.layer === "commodities" || ticker.layer === "ai-power") &&
    peersThatSpiked.length === 0 &&
    (!etfData || (etfData.high20d - etfData.currentPrice) / etfData.high20d > 0.05)
  ) {
    return {
      category: "wrong_sector",
      reason: `${ticker.layerLabel} sector not participating in AI trade. No peer activity.`,
    };
  }

  // Wrong pattern: defense-ai or robotics AND score < 48 (grinders, not spikers)
  if (
    (ticker.layer === "defense-ai" || ticker.layer === "robotics") &&
    totalScore < MONITOR_THRESHOLD
  ) {
    return {
      category: "wrong_pattern",
      reason: `${ticker.layerLabel} stocks tend to grind, not spike. Score ${totalScore.toFixed(0)} too low.`,
    };
  }

  // Too early: score 40-47 AND no imminent catalyst (>30 days)
  if (
    totalScore >= 40 &&
    totalScore < MONITOR_THRESHOLD &&
    (daysToCatalyst === null || daysToCatalyst > 30)
  ) {
    return {
      category: "too_early",
      reason: `Score ${totalScore.toFixed(0)} is promising but no catalyst within 30 days. Revisit closer to earnings.`,
    };
  }

  // Default: too early
  return {
    category: "too_early",
    reason: `Score ${totalScore.toFixed(0)} below threshold. Needs more alignment across factors.`,
  };
}

// ── Fire Drill Detection ──

/** Check if any stock in the universe has 1d change > 10% (fire drill). */
export function detectFireDrills(
  allData: Map<string, CatalystRawData>
): Map<CatalystLayer, string[]> {
  const drills = new Map<CatalystLayer, string[]>();

  for (const [, data] of allData) {
    if (data.change1d >= 10) {
      // Find this stock's layer
      const peers = getLayerPeers(data.symbol);
      if (peers.length > 0) {
        const layer = peers[0].layer;
        const existing = drills.get(layer) ?? [];
        existing.push(data.symbol);
        drills.set(layer, existing);
      }
    }
  }

  return drills;
}

// ── Full Result Builder ──

/** Build a CatalystResult from raw data and scoring. */
export function buildResult(
  data: CatalystRawData,
  ticker: CatalystTicker,
  scores: CatalystScores,
  totalScore: number,
  peersThatSpiked: string[],
  daysToCatalyst: number | null,
  catalystLabel: string | null,
  fireDrill: boolean,
  etfData: ETFPriceData | null
): CatalystResult {
  // If fire drill, boost peer-spiked score
  let adjustedScores = scores;
  let adjustedTotal = totalScore;
  if (fireDrill && scores.peerSpiked < 8) {
    adjustedScores = { ...scores, peerSpiked: 8 };
    adjustedTotal = totalScore - scores.peerSpiked + 8;
  }

  const verdict = classifyVerdict(adjustedTotal);

  const result: CatalystResult = {
    symbol: data.symbol,
    name: ticker.name,
    layer: ticker.layer,
    layerLabel: ticker.layerLabel,
    tier: ticker.tier,
    price: Math.round(data.price * 100) / 100,
    ytdChange: Math.round(data.ytdChange * 100) / 100,
    change5d: Math.round(data.change5d * 100) / 100,
    change1d: Math.round(data.change1d * 100) / 100,
    fiftyTwoWeekHigh: data.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: data.fiftyTwoWeekLow,
    shortPercentFloat: Math.round(data.shortPercentFloat * 100) / 100,
    analystTarget: data.analystTarget,
    volumeRatio5d20d: data.volume20dAvg > 0
      ? Math.round((data.volume5dAvg / data.volume20dAvg) * 100) / 100
      : 1,
    rsi14: Math.round(computeRSIFromCloses(data.closes) * 10) / 10,
    sma50: Math.round(data.sma50 * 100) / 100,
    sma200: Math.round(data.sma200 * 100) / 100,
    scores: adjustedScores,
    totalScore: Math.round(adjustedTotal * 10) / 10,
    verdict,
    peersThatSpiked: peersThatSpiked.length > 0 ? peersThatSpiked : undefined,
    nextCatalyst: catalystLabel ?? undefined,
    nextCatalystDays: daysToCatalyst ?? undefined,
    fireDrill: fireDrill || undefined,
  };

  // Add miss classification if MISS
  if (verdict === "MISS") {
    const miss = classifyMiss(data, adjustedTotal, ticker, peersThatSpiked, etfData, daysToCatalyst);
    result.missCategory = miss.category;
    result.missReason = miss.reason;
  }

  return result;
}
