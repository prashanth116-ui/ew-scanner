/**
 * Catalyst Scanner v3 scoring engine.
 * 17 factors (raw max 118), normalized to 0-100 scale.
 */

import type {
  CatalystScores,
  CatalystVerdict,
  MissCategory,
  CatalystRawData,
  CatalystResult,
  ETFPriceData,
} from "./types";
import { MAX_ACHIEVABLE_SCORE } from "./types";
import type { CatalystTicker, CatalystLayer } from "@/data/catalyst-universe";
import { getLayerPeers } from "@/data/catalyst-universe";

// ── Verdict thresholds (applied to normalized 0-100 scores) ──

const PRESPIKE_THRESHOLD = 72;
const WATCH_THRESHOLD = 55;
const MONITOR_THRESHOLD = 38;

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
  if (ytdPct <= -5) return 2;
  if (ytdPct <= 0) return 1;
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
  if (pctFromHigh <= 15) return 2;
  if (pctFromHigh <= 25) return 1;
  return 0;
}

/** Factor 4: Short interest as % of float (max 10). */
export function scoreShortInterest(siPct: number): number {
  if (siPct <= 0) return 0;
  if (siPct >= 20) return 10;
  // Linear interpolation: 0% → 0, 20% → 10
  return Math.round((siPct / 20) * 10 * 10) / 10;
}

/** Factor 5: Analyst upside to target (max 8). */
export function scoreAnalystUpside(target: number, price: number): number {
  if (price <= 0 || target <= 0) return 0;
  const upside = ((target - price) / price) * 100;
  if (upside >= 40) return 8;
  if (upside >= 25) return 6;
  if (upside >= 15) return 4;
  if (upside >= 5) return 2;
  return 0;
}

/** Factor 6: Volume ratio 5d/20d (max 10). */
export function scoreVolumeRatio(vol5d: number, vol20d: number): number {
  if (vol20d <= 0) return 0;
  const ratio = vol5d / vol20d;
  if (ratio >= 2) return 10;
  if (ratio <= 1) return 0;
  // Linear interpolation: 1x → 0, 2x → 10
  return Math.round((ratio - 1) * 10 * 10) / 10;
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
    if (peerData && peerData.change5d >= 5) {
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

/** Factor 10: Earnings surprise — consecutive EPS beats (max 8). */
export function scoreEarningsSurprise(surprises: number[]): number {
  if (surprises.length === 0) return 0;
  // Count consecutive beats from most recent
  let consecutive = 0;
  for (const s of surprises) {
    if (s > 0) consecutive++;
    else break;
  }
  if (consecutive >= 4) return 8;
  if (consecutive >= 3) return 6;
  if (consecutive >= 2) return 4;
  if (consecutive >= 1) return 2;
  return 0; // most recent miss
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

/** Factor 12: Options skew — put/call OI ratio (max 4). */
export function scoreOptionsSkew(putCallRatio: number | null): number {
  if (putCallRatio === null) return 0;
  if (putCallRatio >= 1.5) return 4;  // heavy puts = squeeze fuel
  if (putCallRatio >= 1.0) return 3;
  if (putCallRatio <= 0.4) return 2;  // very bullish flow
  return 1; // 0.4-1.0 neutral
}

/** Factor 13: Trend acceleration — 10d ROC vs half of 20d ROC (max 5). */
export function scoreTrendAcceleration(closes: number[]): number {
  if (closes.length < 21) return 0;
  const len = closes.length;
  const price10dAgo = closes[len - 11];
  const price20dAgo = closes[len - 21];
  const current = closes[len - 1];

  if (price10dAgo <= 0 || price20dAgo <= 0) return 0;

  const roc10d = ((current - price10dAgo) / price10dAgo) * 100;
  const roc20d = ((current - price20dAgo) / price20dAgo) * 100;
  const acceleration = roc10d - roc20d / 2;

  if (acceleration >= 5) return 5;
  if (acceleration >= 3) return 4;
  if (acceleration >= 1.5) return 3;
  if (acceleration >= 0.5) return 2;
  if (acceleration > 0) return 1;
  return 0;
}

/** Factor 14: Relative strength vs sector ETF (max 5). */
export function scoreRelativeStrength(
  closes: number[],
  etfCloses: number[] | null
): number {
  if (!etfCloses || closes.length < 21 || etfCloses.length < 21) return 0;

  const stockLen = closes.length;
  const etfLen = etfCloses.length;
  const stockReturn = ((closes[stockLen - 1] - closes[stockLen - 21]) / closes[stockLen - 21]) * 100;
  const etfReturn = ((etfCloses[etfLen - 1] - etfCloses[etfLen - 21]) / etfCloses[etfLen - 21]) * 100;
  const outperformance = stockReturn - etfReturn;

  if (outperformance >= 10) return 5;
  if (outperformance >= 5) return 4;
  if (outperformance >= 2) return 3;
  if (outperformance >= 0) return 1;
  return 0; // underperforming
}

/** Factor 15: Insider buying — net purchases in last 90 days (max 5). */
export function scoreInsiderBuying(
  buys: { purchases: number; sales: number }
): number {
  const { purchases, sales } = buys;
  if (purchases >= 3 && sales === 0) return 5;
  if (purchases >= 2 && purchases > sales) return 4;
  if (purchases >= 1 && sales === 0) return 3;
  if (purchases > 0 && sales > 0) return 1;
  return 0; // only sales or none
}

/** Factor 16: Institutional ownership — % held by institutions (max 4). */
export function scoreInstitutionalOwnership(pct: number): number {
  // pct is 0-1 fraction
  if (pct >= 0.90) return 4;
  if (pct >= 0.75) return 3;
  if (pct >= 0.50) return 2;
  if (pct >= 0.25) return 1;
  return 0;
}

/** Factor 17: Dark pool proxy — high-volume low-move days (max 4). */
export function scoreDarkPoolActivity(
  closes: number[],
  volumes: number[]
): number {
  if (closes.length < 21 || volumes.length < 21) return 0;

  const len = Math.min(closes.length, volumes.length);
  // 20d average volume
  const vol20d = volumes.slice(len - 20, len).reduce((a, b) => a + b, 0) / 20;
  if (vol20d <= 0) return 0;

  // Count days in last 10 with volume > 2x 20d avg AND abs(daily change) < 1%
  let count = 0;
  for (let i = len - 10; i < len; i++) {
    if (i < 1) continue;
    const dailyChange = Math.abs((closes[i] - closes[i - 1]) / closes[i - 1]) * 100;
    const volRatio = volumes[i] / vol20d;
    if (volRatio > 2 && dailyChange < 1) count++;
  }

  if (count >= 3) return 4;
  if (count >= 2) return 3;
  if (count >= 1) return 2;
  return 0;
}

// ── Composite Scoring ──

/** Compute all 17 factor scores for a ticker. */
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
    earningsSurprise: scoreEarningsSurprise(data.earningsSurprises),
    maPosition: scoreMAPosition(data.price, data.sma50, data.sma200),
    optionsSkew: scoreOptionsSkew(data.putCallRatio),
    trendAcceleration: scoreTrendAcceleration(data.closes),
    relativeStrength: scoreRelativeStrength(data.closes, etfData?.closes ?? null),
    insiderBuying: scoreInsiderBuying(data.insiderNetBuys),
    institutionalOwnership: scoreInstitutionalOwnership(data.institutionalPercent),
    darkPoolActivity: scoreDarkPoolActivity(data.closes, data.volumes),
  };

  const rawTotal = Object.values(scores).reduce((a, b) => a + b, 0);
  // Normalize to 0-100 scale based on practical achievable max
  const totalScore = Math.round((rawTotal / MAX_ACHIEVABLE_SCORE) * 100 * 10) / 10;

  return {
    scores,
    totalScore: Math.min(100, totalScore),
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

  // Too early: score within 5 pts of MONITOR AND no imminent catalyst (>30 days)
  if (
    totalScore >= MONITOR_THRESHOLD - 5 &&
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
  // If fire drill, boost peer-spiked score and re-normalize
  let adjustedScores = scores;
  let adjustedTotal = totalScore;
  if (fireDrill && scores.peerSpiked < 8) {
    adjustedScores = { ...scores, peerSpiked: 8 };
    const rawDelta = 8 - scores.peerSpiked;
    adjustedTotal = Math.min(100, totalScore + (rawDelta / MAX_ACHIEVABLE_SCORE) * 100);
    adjustedTotal = Math.round(adjustedTotal * 10) / 10;
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
