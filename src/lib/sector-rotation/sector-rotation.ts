/**
 * Sector Rotation Tracker engine.
 * SERVER-ONLY: Used by /api/sector-rotation route + nightly cron.
 *
 * 13 GICS-based sectors with 1:1 ETF proxy mapping.
 * Composite scoring: momentum, acceleration, Mansfield RS, CMF, breadth, smart money.
 * Dynamic weight redistribution when pre-run data is missing.
 */

import "server-only";

import { fetchYahooChart, calcSMA, calc20dReturn, fetchBatchQuotes } from "@/lib/prerun/data";
import type { BatchQuote } from "@/lib/prerun/data";
import { SECTOR_UNIVERSE, getSectorForSymbol, getAllSectorSymbols } from "@/data/sector-universe";
import type {
  SectorRotationScore,
  SectorRotationResult,
  RRGQuadrant,
} from "./types";
import type { PreRunResult } from "@/lib/prerun/types";

// ── Pure math functions ──

function calcROC(closes: number[], period: number): number {
  if (closes.length < period + 1) return 0;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  if (!past || past === 0) return 0;
  return ((current - past) / past) * 100;
}

function calcMomentumComposite(closes: number[]): number {
  const roc63 = calcROC(closes, 63);
  const roc126 = calcROC(closes, 126);
  const roc189 = calcROC(closes, 189);
  const roc252 = calcROC(closes, 252);
  return 0.4 * roc63 + 0.2 * roc126 + 0.2 * roc189 + 0.2 * roc252;
}

function calcAcceleration(closes: number[]): number {
  if (closes.length < 26) return 0;
  const rocSeries: number[] = [];
  for (let i = 20; i < closes.length; i++) {
    const past = closes[i - 20];
    if (!past || past === 0) {
      rocSeries.push(0);
    } else {
      rocSeries.push(((closes[i] - past) / past) * 100);
    }
  }
  if (rocSeries.length < 6) return 0;
  const current = rocSeries[rocSeries.length - 1];
  const past = rocSeries[rocSeries.length - 6];
  if (past === 0) return current > 0 ? 1 : current < 0 ? -1 : 0;
  return ((current - past) / Math.abs(past)) * 100;
}

function calcMansfieldRS(sectorCloses: number[], spyCloses: number[]): number {
  const len = Math.min(sectorCloses.length, spyCloses.length);
  if (len < 201) return 0;
  const sc = sectorCloses.slice(-len);
  const sp = spyCloses.slice(-len);

  const drs: number[] = [];
  for (let i = 0; i < len; i++) {
    drs.push(sp[i] !== 0 ? sc[i] / sp[i] : 0);
  }

  const sma200 = drs.slice(-200).reduce((a, b) => a + b, 0) / 200;
  if (sma200 === 0) return 0;
  return 100 * (drs[drs.length - 1] / sma200 - 1);
}

function calcCMF(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  period = 20
): number {
  const len = Math.min(highs.length, lows.length, closes.length, volumes.length);
  if (len < period) return 0;

  let mfvSum = 0;
  let volSum = 0;
  for (let i = len - period; i < len; i++) {
    const hl = highs[i] - lows[i];
    const mfm = hl !== 0 ? ((closes[i] - lows[i]) - (highs[i] - closes[i])) / hl : 0;
    mfvSum += mfm * volumes[i];
    volSum += volumes[i];
  }
  return volSum !== 0 ? mfvSum / volSum : 0;
}

/**
 * Count how many of the last `lookback` rolling CMF values are positive.
 * Each value is a 20-bar CMF ending at that bar.
 */
function calcRollingCMFPositiveCount(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  period: number,
  lookback: number
): number {
  const len = Math.min(highs.length, lows.length, closes.length, volumes.length);
  if (len < period + lookback) return 0;

  let positiveCount = 0;
  for (let offset = 0; offset < lookback; offset++) {
    const end = len - offset;
    if (end < period) break;
    let mfvSum = 0;
    let volSum = 0;
    for (let i = end - period; i < end; i++) {
      const hl = highs[i] - lows[i];
      const mfm = hl !== 0 ? ((closes[i] - lows[i]) - (highs[i] - closes[i])) / hl : 0;
      mfvSum += mfm * volumes[i];
      volSum += volumes[i];
    }
    if (volSum !== 0 && mfvSum / volSum > 0) positiveCount++;
  }
  return positiveCount;
}

function calcOBVSlope(closes: number[], volumes: number[], lookback = 20): -1 | 0 | 1 {
  const len = Math.min(closes.length, volumes.length);
  if (len < lookback + 1) return 0;

  const obv: number[] = [0];
  const start = len - lookback;
  for (let i = start + 1; i < len; i++) {
    const prev = obv[obv.length - 1];
    if (closes[i] > closes[i - 1]) obv.push(prev + volumes[i]);
    else if (closes[i] < closes[i - 1]) obv.push(prev - volumes[i]);
    else obv.push(prev);
  }

  const n = obv.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += obv[i];
    sumXY += i * obv[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  const slope = (n * sumXY - sumX * sumY) / denom;

  const avgObv = Math.abs(sumY / n) || 1;
  const normalizedSlope = slope / avgObv;

  if (normalizedSlope > 0.01) return 1;
  if (normalizedSlope < -0.01) return -1;
  return 0;
}

/** Compute RS-Ratio and RS-Momentum at a given offset from the end of the DRS array. */
function calcRRGPoint(
  drs: number[],
  offset: number
): { rsRatio: number; rsMomentum: number } | null {
  const end = drs.length - offset;
  if (end < 31) return null;

  const sma10 = drs.slice(end - 10, end).reduce((a, b) => a + b, 0) / 10;
  const sma30 = drs.slice(end - 30, end).reduce((a, b) => a + b, 0) / 30;
  const rsRatio = sma30 !== 0 ? (sma10 / sma30) * 100 : 100;

  let prevRsRatio = 100;
  if (end >= 32) {
    const prevSma10 = drs.slice(end - 11, end - 1).reduce((a, b) => a + b, 0) / 10;
    const prevSma30 = drs.slice(end - 31, end - 1).reduce((a, b) => a + b, 0) / 30;
    prevRsRatio = prevSma30 !== 0 ? (prevSma10 / prevSma30) * 100 : 100;
  }
  const rsMomentum = rsRatio - prevRsRatio;

  return { rsRatio, rsMomentum };
}

function calcRRG(
  sectorCloses: number[],
  spyCloses: number[]
): { rsRatio: number; rsMomentum: number; quadrant: RRGQuadrant; trail: { rsRatio: number; rsMomentum: number }[] } {
  const len = Math.min(sectorCloses.length, spyCloses.length);
  if (len < 31) return { rsRatio: 100, rsMomentum: 0, quadrant: "LAGGING", trail: [] };

  const sc = sectorCloses.slice(-len);
  const sp = spyCloses.slice(-len);

  const drs: number[] = [];
  for (let i = 0; i < len; i++) {
    drs.push(sp[i] !== 0 ? sc[i] / sp[i] : 0);
  }

  // Current position
  const current = calcRRGPoint(drs, 0)!;
  const { rsRatio, rsMomentum } = current;

  let quadrant: RRGQuadrant;
  if (rsRatio >= 100 && rsMomentum >= 0) quadrant = "LEADING";
  else if (rsRatio >= 100 && rsMomentum < 0) quadrant = "WEAKENING";
  else if (rsRatio < 100 && rsMomentum < 0) quadrant = "LAGGING";
  else quadrant = "IMPROVING";

  // Trailing tail: 4 weekly snapshots + current (oldest first)
  const trail: { rsRatio: number; rsMomentum: number }[] = [];
  for (const offset of [20, 15, 10, 5, 0]) {
    const pt = calcRRGPoint(drs, offset);
    if (pt) trail.push(pt);
  }

  return { rsRatio, rsMomentum, quadrant, trail };
}

// ── Normalization helpers ──

function percentileRank(values: number[], target: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < target).length;
  return (below / sorted.length) * 100;
}

function clampNormalize(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ── Chart data type ──

interface ChartData {
  closes: number[];
  volumes: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  timestamps: number[];
}

// ── Dynamic composite weighting ──

const BASE_WEIGHTS = {
  momentum: 25,
  acceleration: 15,
  mansfield: 20,
  cmf: 15,
  breadth: 15,
  smartMoney: 10,
};

function computeComposite(
  normalized: Record<string, number>,
  hasBreadth: boolean,
  hasSmartMoney: boolean
): { score: number; dataQuality: number } {
  const available: Record<string, number> = {
    momentum: BASE_WEIGHTS.momentum,
    acceleration: BASE_WEIGHTS.acceleration,
    mansfield: BASE_WEIGHTS.mansfield,
    cmf: BASE_WEIGHTS.cmf,
  };
  if (hasBreadth) available.breadth = BASE_WEIGHTS.breadth;
  if (hasSmartMoney) available.smartMoney = BASE_WEIGHTS.smartMoney;

  const totalAvailable = Object.values(available).reduce((a, b) => a + b, 0);
  const totalBase = Object.values(BASE_WEIGHTS).reduce((a, b) => a + b, 0);

  let score = 0;
  for (const [key, weight] of Object.entries(available)) {
    const normalizedWeight = weight / totalAvailable;
    score += (normalized[key] ?? 50) * normalizedWeight;
  }

  const dataQuality = Math.round((totalAvailable / totalBase) * 100);
  return { score: Math.round(score), dataQuality };
}

// ── Cache ──

let cachedResult: { data: SectorRotationResult; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;

// ── Main calculation ──

export async function calculateSectorRotation(
  preRunResults?: PreRunResult[]
): Promise<SectorRotationResult> {
  if (cachedResult && Date.now() - cachedResult.ts < CACHE_TTL) {
    return cachedResult.data;
  }

  // Build sector groups from centralized sector-universe (1:1 sector→ETF)
  const sectorGroups = SECTOR_UNIVERSE.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    etf: s.etf,
  }));

  // Fetch all ETFs + SPY + cross-sector pairs + batch stock quotes (in parallel)
  const crossETFs = ["XLY", "XLP", "XLK", "XLU"];
  const sectorETFs = sectorGroups.map((s) => s.etf);
  const allETFs = [...new Set(["SPY", ...sectorETFs, ...crossETFs])];
  const allStockSymbols = getAllSectorSymbols();

  // Fetch ETF charts and batch stock quotes in parallel
  const [chartResults, batchQuotes] = await Promise.all([
    Promise.allSettled(allETFs.map((etf) => fetchYahooChart(etf, "1y", "1d"))),
    fetchBatchQuotes(allStockSymbols),
  ]);

  const charts = new Map<string, ChartData>();
  for (let i = 0; i < allETFs.length; i++) {
    const r = chartResults[i];
    if (r.status === "fulfilled" && r.value) {
      charts.set(allETFs[i], r.value);
    }
  }

  const spyChart = charts.get("SPY");
  if (!spyChart) {
    throw new Error("Failed to fetch SPY data");
  }

  // Build pre-run lookup by sector display name
  const preRunBySector = new Map<string, PreRunResult[]>();
  if (preRunResults) {
    for (const r of preRunResults) {
      const sectorName = getSectorForSymbol(r.data.ticker);
      if (sectorName === "Other") continue;
      const existing = preRunBySector.get(sectorName) ?? [];
      existing.push(r);
      preRunBySector.set(sectorName, existing);
    }
  }

  // Compute per-sector scores
  interface RawScore {
    displayName: string;
    etf: string;
    sectorId: string;
    momentumComposite: number;
    acceleration: number;
    mansfieldRS: number;
    cmf20: number;
    obvTrend: -1 | 0 | 1;
    rsRatio: number;
    rsMomentum: number;
    quadrant: RRGQuadrant;
    rrgTrail: { rsRatio: number; rsMomentum: number }[];
    breadthPct: number | null;
    roc20d: number;
    flowPriceDivergence: boolean;
    breadthDivergence: boolean;
    accelerationInflection: boolean;
    aggregateInsiderBuys: number;
    aggregatePCR: number | null;
    unusualVolume: boolean;
    earningsBeatPct: number;
    smartMoneyScore: number;
    hasSmartMoneyData: boolean;
  }

  const rawScores: RawScore[] = [];

  for (const group of sectorGroups) {
    const chart = charts.get(group.etf);
    if (!chart) continue;

    // Gather pre-run stocks for this sector
    const allStocks = preRunBySector.get(group.displayName) ?? [];

    const mc = calcMomentumComposite(chart.closes);
    const accel = calcAcceleration(chart.closes);
    const mrs = calcMansfieldRS(chart.closes, spyChart.closes);
    const cmf = calcCMF(chart.highs, chart.lows, chart.closes, chart.volumes, 20);
    const obv = calcOBVSlope(chart.closes, chart.volumes, 20);
    const rrg = calcRRG(chart.closes, spyChart.closes);
    const roc20d = calcROC(chart.closes, 20);

    // Breadth: 3-tier cascade — batch quotes (best), pre-run (good), ETF proxy (fallback)
    let breadthPct: number | null = null;

    // Tier 1: Batch quote data (price vs 50d SMA for all sector stocks)
    const sectorDef = SECTOR_UNIVERSE.find((s) => s.id === group.id);
    const sectorSymbols = sectorDef?.stocks.map((s) => s.symbol) ?? [];
    const quotesInSector = sectorSymbols
      .map((sym) => batchQuotes.get(sym))
      .filter((q): q is BatchQuote => q != null && q.price > 0 && q.sma50 != null && q.sma50 > 0);

    if (quotesInSector.length >= 5) {
      const aboveSma = quotesInSector.filter((q) => q.price > q.sma50!).length;
      breadthPct = Math.round((aboveSma / quotesInSector.length) * 100);
    } else {
      // Tier 2: Pre-run stock-level data
      const stocksWithPrice = allStocks.filter(
        (r) => r.data.currentPrice !== null && r.data.sma20 !== null
      );
      if (stocksWithPrice.length >= 5) {
        const aboveSma = stocksWithPrice.filter(
          (r) => r.data.currentPrice! > r.data.sma20!
        ).length;
        breadthPct = Math.round((aboveSma / stocksWithPrice.length) * 100);
      } else if (chart.closes.length >= 20) {
        // Tier 3: ETF-level breadth proxy
        const sma20 = calcSMA(chart.closes, 20);
        const lastClose = chart.closes[chart.closes.length - 1];
        if (sma20 !== null && sma20 > 0) {
          const pctFromSma = ((lastClose - sma20) / sma20) * 100;
          breadthPct = Math.round(Math.max(0, Math.min(100, 50 + pctFromSma * 7)));
        }
      }
    }

    // Flow/price divergence — check that CMF was positive for 15+ of last 20 bars
    let flowPriceDivergence = false;
    if (cmf > 0 && roc20d < 0) {
      const positiveCount = calcRollingCMFPositiveCount(
        chart.highs, chart.lows, chart.closes, chart.volumes, 20, 20
      );
      flowPriceDivergence = positiveCount >= 15;
    }

    // Breadth divergence: > 50% stocks healthy but sector ETF declining
    const breadthDivergence = breadthPct !== null && breadthPct > 50 && roc20d < 0;

    // Acceleration inflection: 2nd derivative positive but price still negative
    const accelerationInflection = accel > 0 && roc20d < 0;

    // Smart money — only score if we have pre-run data for this sector
    const hasSmartMoneyData = allStocks.length > 0;
    let aggregateInsiderBuys = 0;
    let totalPCR = 0;
    let pcrCount = 0;
    let beatStreakCount = 0;
    for (const r of allStocks) {
      aggregateInsiderBuys += r.data.insiderBuys90d ?? 0;
      if (r.data.putCallRatio !== null) {
        totalPCR += r.data.putCallRatio;
        pcrCount++;
      }
      if ((r.data.earningsBeatStreak ?? 0) >= 2) beatStreakCount++;
    }
    const aggregatePCR = pcrCount > 0 ? totalPCR / pcrCount : null;
    const earningsBeatPct = allStocks.length > 0
      ? Math.round((beatStreakCount / allStocks.length) * 100)
      : 0;

    // Unusual volume (from ETF chart — always available)
    let unusualVolume = false;
    if (chart.volumes.length >= 21) {
      const avgVol20 = chart.volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      const todayVol = chart.volumes[chart.volumes.length - 1];
      unusualVolume = avgVol20 > 0 && todayVol > 1.5 * avgVol20;
    }

    // Smart money composite — only meaningful with pre-run data
    let smartMoneyScore = 0;
    if (hasSmartMoneyData) {
      if (aggregateInsiderBuys > 0) smartMoneyScore += 25;
      if (aggregateInsiderBuys >= 3) smartMoneyScore += 10;
      if (aggregatePCR !== null && aggregatePCR < 0.7) smartMoneyScore += 25;
      if (unusualVolume) smartMoneyScore += 20;
      if (earningsBeatPct >= 50) smartMoneyScore += 20;
    }

    rawScores.push({
      displayName: group.displayName,
      etf: group.etf,
      sectorId: group.id,
      momentumComposite: mc,
      acceleration: accel,
      mansfieldRS: mrs,
      cmf20: cmf,
      obvTrend: obv,
      rsRatio: rrg.rsRatio,
      rsMomentum: rrg.rsMomentum,
      quadrant: rrg.quadrant,
      rrgTrail: rrg.trail,
      breadthPct,
      roc20d,
      flowPriceDivergence,
      breadthDivergence,
      accelerationInflection,
      aggregateInsiderBuys,
      aggregatePCR,
      unusualVolume,
      earningsBeatPct,
      smartMoneyScore,
      hasSmartMoneyData,
    });
  }

  // Percentile-rank and min-max normalization
  const allMomentums = rawScores.map((s) => s.momentumComposite);
  const accels = rawScores.map((s) => s.acceleration);
  const accelMin = Math.min(...accels);
  const accelMax = Math.max(...accels);

  // Build final scored sectors
  const scoredSectors: SectorRotationScore[] = rawScores.map((raw) => {
    const momentumPercentile = percentileRank(allMomentums, raw.momentumComposite);

    const normalized: Record<string, number> = {
      momentum: momentumPercentile,
      acceleration: accelMax !== accelMin
        ? ((raw.acceleration - accelMin) / (accelMax - accelMin)) * 100
        : 50,
      mansfield: clampNormalize(raw.mansfieldRS, -20, 20),
      cmf: clampNormalize(raw.cmf20, -1, 1),
      breadth: raw.breadthPct ?? 50,
      smartMoney: raw.smartMoneyScore,
    };

    // Dynamic composite with data quality tracking
    const hasBreadth = raw.breadthPct !== null;
    const { score: compositeScore, dataQuality } = computeComposite(
      normalized,
      hasBreadth,
      raw.hasSmartMoneyData
    );

    // Trend from 20d ROC
    let trend: "UP" | "DOWN" | "FLAT";
    let trendArrow: string;
    if (raw.roc20d > 3) { trend = "UP"; trendArrow = "\u2191"; }
    else if (raw.roc20d > 1) { trend = "UP"; trendArrow = "\u2197"; }
    else if (raw.roc20d > -1) { trend = "FLAT"; trendArrow = "\u2192"; }
    else if (raw.roc20d > -3) { trend = "DOWN"; trendArrow = "\u2198"; }
    else { trend = "DOWN"; trendArrow = "\u2193"; }

    const leadingCount = [
      raw.flowPriceDivergence,
      raw.breadthDivergence,
      raw.accelerationInflection,
    ].filter(Boolean).length;
    const stealthAccumulation = leadingCount >= 2;

    return {
      sector: raw.displayName,
      etf: raw.etf,
      subsectors: [raw.sectorId],
      momentumComposite: Math.round(raw.momentumComposite * 100) / 100,
      momentumPercentile: Math.round(momentumPercentile),
      acceleration: Math.round(raw.acceleration * 100) / 100,
      mansfieldRS: Math.round(raw.mansfieldRS * 100) / 100,
      cmf20: Math.round(raw.cmf20 * 1000) / 1000,
      obvTrend: raw.obvTrend,
      flowPriceDivergence: raw.flowPriceDivergence,
      breadthDivergence: raw.breadthDivergence,
      accelerationInflection: raw.accelerationInflection,
      breadthPct: raw.breadthPct,
      aggregateInsiderBuys: raw.aggregateInsiderBuys,
      aggregatePCR: raw.aggregatePCR !== null ? Math.round(raw.aggregatePCR * 100) / 100 : null,
      unusualVolume: raw.unusualVolume,
      earningsBeatPct: raw.earningsBeatPct,
      smartMoneyScore: Math.round(raw.smartMoneyScore),
      rsRatio: Math.round(raw.rsRatio * 100) / 100,
      rsMomentum: Math.round(raw.rsMomentum * 10000) / 10000,
      quadrant: raw.quadrant,
      compositeScore,
      dataQuality,
      trend,
      trendArrow,
      stealthAccumulation,
      rrgTrail: raw.rrgTrail.map((pt) => ({
        rsRatio: Math.round(pt.rsRatio * 100) / 100,
        rsMomentum: Math.round(pt.rsMomentum * 10000) / 10000,
      })),
    };
  });

  scoredSectors.sort((a, b) => b.compositeScore - a.compositeScore);

  // Multi-signal rotation detection
  const all20dReturns = rawScores.map((r) => r.roc20d);
  const dispersionIndex = Math.round(stddev(all20dReturns) * 100) / 100;
  const sectorSpread = Math.round(
    (Math.max(...all20dReturns) - Math.min(...all20dReturns)) * 100
  ) / 100;

  // Rotation active when:
  // - High dispersion (> 4): sectors clearly diverging, OR
  // - Moderate dispersion (> 2) AND wide spread (> 8%): some sectors moving strongly apart
  const rotationActive = dispersionIndex > 4 || (dispersionIndex > 2 && sectorSpread > 8);

  // Rotation summary — prefer WEAKENING (active outflow) over LAGGING (already rotated)
  // Sort by acceleration to pick the most actively deteriorating/improving sectors
  let rotationSummary = "No clear rotation detected";
  if (rotationActive && scoredSectors.length >= 2) {
    const improving = scoredSectors.filter((s) => s.quadrant === "IMPROVING" || s.stealthAccumulation);
    const activelyWeakening = scoredSectors.filter((s) => s.quadrant === "WEAKENING");
    const lagging = scoredSectors.filter((s) => s.quadrant === "LAGGING");
    // FROM: prefer WEAKENING (money actively leaving) over LAGGING (already left)
    const fromPool = activelyWeakening.length > 0 ? activelyWeakening : lagging;
    if (improving.length > 0 && fromPool.length > 0) {
      // Pick most actively deteriorating FROM (lowest acceleration)
      const fromSector = [...fromPool].sort((a, b) => a.acceleration - b.acceleration)[0];
      // Pick most actively improving TO (highest acceleration)
      const toSector = [...improving].sort((a, b) => b.acceleration - a.acceleration)[0];
      rotationSummary = `Money flowing FROM ${fromSector.sector} TO ${toSector.sector}`;
    } else if (improving.length > 0) {
      const toSector = [...improving].sort((a, b) => b.acceleration - a.acceleration)[0];
      rotationSummary = `Rotation INTO ${toSector.sector}`;
    } else {
      rotationSummary = "Sectors diverging \u2014 watch for rotation signal";
    }
  }

  // Cross-sector pairs
  function pairAnalysis(
    numChart: ChartData | undefined,
    denChart: ChartData | undefined
  ): { ratio: number; trend: string } {
    if (!numChart || !denChart || numChart.closes.length < 21 || denChart.closes.length < 21) {
      return { ratio: 0, trend: "N/A" };
    }
    const denNow = denChart.closes[denChart.closes.length - 1];
    const denPast = denChart.closes[denChart.closes.length - 21];
    const currentRatio = denNow !== 0 ? numChart.closes[numChart.closes.length - 1] / denNow : 0;
    const pastRatio = denPast !== 0 ? numChart.closes[numChart.closes.length - 21] / denPast : 0;
    const change = pastRatio !== 0 ? ((currentRatio - pastRatio) / pastRatio) * 100 : 0;
    let trend: string;
    if (change > 1) trend = "Rising (Risk-On)";
    else if (change < -1) trend = "Falling (Risk-Off)";
    else trend = "Flat";
    return { ratio: Math.round(currentRatio * 1000) / 1000, trend };
  }

  const crossSectorPairs = {
    xlyXlp: pairAnalysis(charts.get("XLY"), charts.get("XLP")),
    xlkXlu: pairAnalysis(charts.get("XLK"), charts.get("XLU")),
  };

  // Top stocks to watch
  const topStocksToWatch: SectorRotationResult["topStocksToWatch"] = [];
  const watchSectors = scoredSectors.filter(
    (s) => s.stealthAccumulation || s.quadrant === "IMPROVING"
  );

  for (const sector of watchSectors.slice(0, 3)) {
    // Gather pre-run stocks for this sector
    const sectorStocks = preRunBySector.get(sector.sector) ?? [];
    if (sectorStocks.length === 0) continue;

    const ranked = sectorStocks
      .map((r) => {
        const score =
          r.scores.finalScore * 0.4 +
          r.scores.scoreJ * 0.2 * 12 +
          r.scores.scoreK * 0.2 * 12 +
          ((r.data.insiderBuys90d ?? 0) > 0 ? 10 : 0) * 0.1 +
          ((r.data.putCallRatio ?? 1) < 0.7 ? 10 : 0) * 0.1;

        const reasons: string[] = [];
        if (r.scores.finalScore >= 15) reasons.push("High score");
        if ((r.data.insiderBuys90d ?? 0) > 0) reasons.push("Insider buying");
        if ((r.data.putCallRatio ?? 1) < 0.7) reasons.push("Bullish options flow");
        if ((r.data.relativeStrength20d ?? 0) > 0) reasons.push("RS leader");
        if ((r.data.pctFromBaseHigh ?? 100) < 10) reasons.push("Near breakout");

        return { ticker: r.data.ticker, score: Math.round(score * 10) / 10, reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (ranked.length > 0) {
      topStocksToWatch.push({ sector: sector.sector, stocks: ranked });
    }
  }

  // Build compact stock quotes map for client-side RS display
  const stockQuotes: Record<string, { price: number; sma50: number | null; pctFromSma50: number | null }> = {};
  for (const [symbol, q] of batchQuotes) {
    const pctFromSma50 = q.sma50 != null && q.sma50 > 0
      ? Math.round(((q.price - q.sma50) / q.sma50) * 1000) / 10  // 1 decimal
      : null;
    stockQuotes[symbol] = { price: q.price, sma50: q.sma50, pctFromSma50 };
  }

  const result: SectorRotationResult = {
    calculatedAt: new Date().toISOString(),
    sectors: scoredSectors,
    rotationActive,
    rotationSummary,
    dispersionIndex,
    sectorSpread,
    crossSectorPairs,
    topStocksToWatch,
    stockQuotes,
  };

  cachedResult = { data: result, ts: Date.now() };
  return result;
}

// ── Telegram formatter ──

export function formatSectorRotationTelegram(result: SectorRotationResult): string {
  const lines: string[] = [];
  lines.push("<b>Sector Rotation</b>");
  lines.push(result.rotationSummary);
  lines.push(`Dispersion: ${result.dispersionIndex} | Spread: ${result.sectorSpread}%`);
  lines.push("");

  lines.push("<b>Top 3 Sectors:</b>");
  for (const s of result.sectors.slice(0, 3)) {
    const dq = s.dataQuality < 100 ? ` (${s.dataQuality}% data)` : "";
    lines.push(`${s.trendArrow} ${s.sector} (${s.etf}): ${s.compositeScore}/100 [${s.quadrant}]${dq}`);
  }

  const stealth = result.sectors.filter((s) => s.stealthAccumulation);
  if (stealth.length > 0) {
    lines.push("");
    lines.push("<b>Stealth Accumulation:</b>");
    for (const s of stealth) {
      const signals: string[] = [];
      if (s.flowPriceDivergence) signals.push("CMF persistent + price flat");
      if (s.breadthDivergence) signals.push("breadth divergence");
      if (s.accelerationInflection) signals.push("momentum inflecting");
      lines.push(`${s.sector} \u2014 ${signals.join(", ")}`);
    }
  }

  if (result.topStocksToWatch.length > 0) {
    lines.push("");
    lines.push("<b>Stocks to Watch:</b>");
    for (const sw of result.topStocksToWatch) {
      const tickers = sw.stocks.map((s) => s.ticker).join(", ");
      lines.push(`${sw.sector}: ${tickers}`);
    }
  }

  return lines.join("\n");
}
