/**
 * Sector Rotation Tracker engine.
 * SERVER-ONLY: Used by /api/sector-rotation route + nightly cron.
 *
 * 27 ETFs: 14 GICS sectors + 8 sub-sectors + 5 cross-asset.
 * Composite scoring: momentum, acceleration, Mansfield RS, CMF, breadth, smart money.
 * Dynamic weight redistribution when pre-run data is missing.
 */

import "server-only";

import { fetchYahooChart, calcSMA, calc20dReturn, fetchBatchQuotes } from "@/lib/prerun/data";
import type { BatchQuote } from "@/lib/prerun/data";
import {
  SECTOR_UNIVERSE,
  getSectorForSymbol,
  getAllSectorSymbols,
  getEquitySectors,
  getSubSectors,
  getCrossAssetETFs,
  getSectorsWithStocks,
} from "@/data/sector-universe";
import type { SectorCategory } from "@/data/sector-universe";
import type {
  SectorRotationScore,
  SectorRotationResult,
  RRGQuadrant,
} from "./types";
import { enrichStocks } from "./stock-enrichment";
import type { StockInput } from "./stock-enrichment";
import type { PreRunResult } from "@/lib/prerun/types";
import { loadInstitutionalCache } from "@/lib/supabase/persistence";
import {
  calcROC,
  calcMomentumComposite,
  calcAcceleration,
  calcMansfieldRS,
  calcCMF,
  calcRollingCMFPositiveCount,
  calcOBVSlope,
  calcRRG,
  calcRotationVelocity,
  percentileRank,
  clampNormalize,
  stddev,
} from "./math";
import { COMPOSITE, ROTATION } from "./config";

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

const BASE_WEIGHTS = COMPOSITE.BASE_WEIGHTS;

function computeComposite(
  normalized: Record<string, number>,
  hasBreadth: boolean,
  hasSmartMoney: boolean
): { score: number; dataQuality: number; breakdown: { momentum: boolean; acceleration: boolean; mansfield: boolean; cmf: boolean; breadth: boolean; smartMoney: boolean } } {
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
  const breakdown = {
    momentum: true,
    acceleration: true,
    mansfield: true,
    cmf: true,
    breadth: hasBreadth,
    smartMoney: hasSmartMoney,
  };
  return { score: Math.round(score), dataQuality, breakdown };
}

// ── Cache ──

let cachedResult: { data: SectorRotationResult; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

// ── Sigmoid breadth proxy (Tier 3 fallback) ──

function sigmoidBreadth(pctFromSma: number): number {
  return Math.round(100 / (1 + Math.exp(-0.4 * pctFromSma)));
}

// ── Main calculation ──

export async function calculateSectorRotation(
  preRunResults?: PreRunResult[]
): Promise<SectorRotationResult> {
  if (cachedResult && Date.now() - cachedResult.ts < CACHE_TTL) {
    return cachedResult.data;
  }

  // Build sector groups from centralized sector-universe (all categories)
  const allSectorDefs = SECTOR_UNIVERSE;
  const sectorGroups = allSectorDefs.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    etf: s.etf,
    category: s.category,
  }));

  // Fetch all ETFs + SPY + cross-sector pairs + batch stock quotes (in parallel)
  const crossETFs = ["XLY", "XLP", "XLK", "XLU"];
  const sectorETFs = sectorGroups.map((s) => s.etf);
  const allETFs = [...new Set(["SPY", ...sectorETFs, ...crossETFs])];
  const allStockSymbols = getAllSectorSymbols();

  // Batch chart fetches to avoid Yahoo Finance rate limiting (max 15 concurrent)
  const CHART_BATCH_SIZE = 15;
  const CHART_BATCH_DELAY = 300; // ms between batches
  async function fetchChartsBatched(etfs: string[]): Promise<PromiseSettledResult<ChartData | null>[]> {
    const results: PromiseSettledResult<ChartData | null>[] = [];
    for (let i = 0; i < etfs.length; i += CHART_BATCH_SIZE) {
      const batch = etfs.slice(i, i + CHART_BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((etf) => fetchYahooChart(etf, "1y", "1d"))
      );
      results.push(...batchResults);
      if (i + CHART_BATCH_SIZE < etfs.length) {
        await new Promise((r) => setTimeout(r, CHART_BATCH_DELAY));
      }
    }
    return results;
  }

  // Fetch ETF charts (batched), batch stock quotes, and institutional cache in parallel
  const [chartResults, batchQuotes, institutionalCache] = await Promise.all([
    fetchChartsBatched(allETFs),
    fetchBatchQuotes(allStockSymbols),
    loadInstitutionalCache(allStockSymbols).catch(() => new Map<string, number | null>()),
  ]);

  const quotesAsOf = new Date().toISOString();

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
    category: SectorCategory;
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
    breadthEstimated: boolean;
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

    // Breadth: 3-tier cascade — batch quotes (best), pre-run (good), ETF sigmoid (fallback)
    let breadthPct: number | null = null;
    let breadthEstimated = false;

    // Tier 1: Batch quote data (price vs 50d SMA for all sector stocks)
    const sectorDef = SECTOR_UNIVERSE.find((s) => s.id === group.id);
    const sectorSymbols = sectorDef?.stocks.map((s) => s.symbol) ?? [];
    const quotesInSector = sectorSymbols
      .map((sym) => batchQuotes.get(sym))
      .filter((q): q is BatchQuote => q != null && q.price > 0 && q.sma50 != null && q.sma50 > 0);

    if (quotesInSector.length >= 5) {
      const aboveSma = quotesInSector.filter((q) => q.price > q.sma50!).length;
      breadthPct = Math.round((aboveSma / quotesInSector.length) * 100);
    } else if (sectorSymbols.length === 0) {
      // Cross-asset ETFs have no stocks — use sigmoid directly
      if (chart.closes.length >= 20) {
        const sma20 = calcSMA(chart.closes, 20);
        const lastClose = chart.closes[chart.closes.length - 1];
        if (sma20 !== null && sma20 > 0) {
          const pctFromSma = ((lastClose - sma20) / sma20) * 100;
          breadthPct = sigmoidBreadth(pctFromSma);
          breadthEstimated = true;
        }
      }
    } else {
      // Tier 2: Pre-run stock-level data — prefer SMA-50 for consistency with Tier 1,
      // fall back to SMA-20 if SMA-50 not available in pre-run data
      const stocksWithSma50 = allStocks.filter(
        (r) => r.data.currentPrice !== null && r.data.vcpSma50 !== null
      );
      const stocksWithSma20 = allStocks.filter(
        (r) => r.data.currentPrice !== null && r.data.sma20 !== null
      );
      const stocksWithPrice = stocksWithSma50.length >= 5 ? stocksWithSma50 : stocksWithSma20;
      const usingSma50 = stocksWithSma50.length >= 5;

      if (stocksWithPrice.length >= 5) {
        const aboveSma = stocksWithPrice.filter(
          (r) => usingSma50 ? r.data.currentPrice! > r.data.vcpSma50! : r.data.currentPrice! > r.data.sma20!
        ).length;
        breadthPct = Math.round((aboveSma / stocksWithPrice.length) * 100);
        breadthEstimated = !usingSma50; // SMA-20 is less accurate than SMA-50
      } else if (chart.closes.length >= 20) {
        // Tier 3: ETF-level breadth proxy (sigmoid)
        const sma20 = calcSMA(chart.closes, 20);
        const lastClose = chart.closes[chart.closes.length - 1];
        if (sma20 !== null && sma20 > 0) {
          const pctFromSma = ((lastClose - sma20) / sma20) * 100;
          breadthPct = sigmoidBreadth(pctFromSma);
          breadthEstimated = true;
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

    // Acceleration inflection: 2nd derivative positive but price flat-to-negative
    const accelerationInflection = accel > 0 && roc20d < 2;

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
      const prevVols = chart.volumes.slice(-21, -1);
      const avgVol20 = calcSMA(prevVols, 20) ?? 0;
      const todayVol = chart.volumes[chart.volumes.length - 1];
      unusualVolume = avgVol20 > 0 && todayVol > ROTATION.VOLUME_SURGE * avgVol20;
    }

    // Smart money composite — only meaningful with pre-run data (cap at 100)
    let smartMoneyScore = 0;
    if (hasSmartMoneyData) {
      if (aggregateInsiderBuys > 0) smartMoneyScore += 25;
      if (aggregateInsiderBuys >= 3) smartMoneyScore += 10;
      if (aggregatePCR !== null && aggregatePCR < 0.7) smartMoneyScore += 25;
      if (unusualVolume) smartMoneyScore += 20;
      if (earningsBeatPct >= 50) smartMoneyScore += 20;
      smartMoneyScore = Math.min(smartMoneyScore, 100);
    }

    rawScores.push({
      displayName: group.displayName,
      etf: group.etf,
      sectorId: group.id,
      category: group.category,
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
      breadthEstimated,
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
  const accelMin = accels.length > 0 ? Math.min(...accels) : 0;
  const accelMax = accels.length > 0 ? Math.max(...accels) : 0;

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
    const { score: compositeScore, dataQuality, breakdown } = computeComposite(
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
      category: raw.category,
      breadthEstimated: raw.breadthEstimated || undefined,
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
      rsMomentum: Math.round(raw.rsMomentum * 100) / 100,
      quadrant: raw.quadrant,
      compositeScore,
      dataQuality,
      dataQualityBreakdown: breakdown,
      trend,
      trendArrow,
      stealthAccumulation,
      rrgTrail: raw.rrgTrail.map((pt) => ({
        rsRatio: Math.round(pt.rsRatio * 100) / 100,
        rsMomentum: Math.round(pt.rsMomentum * 100) / 100,
      })),
      rotationVelocity: 0, // Will be computed after mapping
    };
  });

  // Compute rotation velocity for each sector (Euclidean distance across RRG trail)
  for (const s of scoredSectors) {
    s.rotationVelocity = calcRotationVelocity(s.rrgTrail);
  }

  scoredSectors.sort((a, b) => b.compositeScore - a.compositeScore);

  // Separate by category
  const gicsSectors = scoredSectors.filter((s) => s.category === "gics_sector");
  const subSectorScores = scoredSectors.filter((s) => s.category === "sub_sector");
  const crossAssetScores = scoredSectors.filter((s) => s.category === "cross_asset");
  const leadershipBasketScores = scoredSectors.filter((s) => s.category === "leadership_basket");

  // Multi-signal rotation detection (GICS sectors only for rotation logic)
  const all20dReturns = rawScores.filter((r) => r.category === "gics_sector").map((r) => r.roc20d);
  const dispersionIndex = Math.round(stddev(all20dReturns) * 100) / 100;
  const sectorSpread = all20dReturns.length > 0
    ? Math.round((Math.max(...all20dReturns) - Math.min(...all20dReturns)) * 100) / 100
    : 0;

  // Rotation active when:
  // - High dispersion (> 4): sectors clearly diverging, OR
  // - Moderate dispersion (> 2) AND wide spread (> 8%): some sectors moving strongly apart
  const rotationActive = dispersionIndex > ROTATION.DISPERSION_ACTIVE || (dispersionIndex > ROTATION.DISPERSION_MODERATE && sectorSpread > ROTATION.SECTOR_SPREAD_THRESHOLD);

  // Rotation summary — prefer WEAKENING (active outflow) over LAGGING (already rotated)
  // Sort by acceleration to pick the most actively deteriorating/improving sectors
  let rotationSummary = "No clear rotation detected";
  if (rotationActive && gicsSectors.length >= 2) {
    const improving = gicsSectors.filter((s) => s.quadrant === "IMPROVING" || s.stealthAccumulation);
    const activelyWeakening = gicsSectors.filter((s) => s.quadrant === "WEAKENING");
    const lagging = gicsSectors.filter((s) => s.quadrant === "LAGGING");
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

  // Cross-sector pairs — align by timestamp to avoid comparing different dates
  function pairAnalysis(
    numChart: ChartData | undefined,
    denChart: ChartData | undefined
  ): { ratio: number; trend: string } {
    if (!numChart || !denChart || numChart.closes.length < 21 || denChart.closes.length < 21) {
      return { ratio: 0, trend: "N/A" };
    }
    // Build timestamp-aligned close maps
    const denMap = new Map<number, number>();
    for (let i = 0; i < denChart.timestamps.length; i++) {
      denMap.set(denChart.timestamps[i], denChart.closes[i]);
    }
    // Find aligned pairs (numerator timestamps that exist in denominator)
    const aligned: { numClose: number; denClose: number }[] = [];
    for (let i = 0; i < numChart.timestamps.length; i++) {
      const denClose = denMap.get(numChart.timestamps[i]);
      if (denClose !== undefined && denClose !== 0) {
        aligned.push({ numClose: numChart.closes[i], denClose });
      }
    }
    if (aligned.length < 21) return { ratio: 0, trend: "N/A" };
    const now = aligned[aligned.length - 1];
    const past = aligned[aligned.length - 21];
    const currentRatio = now.numClose / now.denClose;
    const pastRatio = past.numClose / past.denClose;
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

  // Inter-market correlation break: XLY/XLP and XLK/XLU signal opposite risk regimes
  const xlyXlpRiskOn = crossSectorPairs.xlyXlp.trend.includes("Risk-On");
  const xlyXlpRiskOff = crossSectorPairs.xlyXlp.trend.includes("Risk-Off");
  const xlkXluRiskOn = crossSectorPairs.xlkXlu.trend.includes("Risk-On");
  const xlkXluRiskOff = crossSectorPairs.xlkXlu.trend.includes("Risk-Off");
  const correlationBreak =
    (xlyXlpRiskOn && xlkXluRiskOff) || (xlyXlpRiskOff && xlkXluRiskOn);

  // Top stocks to watch (GICS sectors only)
  const topStocksToWatch: SectorRotationResult["topStocksToWatch"] = [];
  const watchSectors = gicsSectors.filter(
    (s) => s.stealthAccumulation || s.quadrant === "IMPROVING"
  );

  for (const sector of watchSectors.slice(0, 3)) {
    // Gather pre-run stocks for this sector
    const sectorStocks = preRunBySector.get(sector.sector) ?? [];
    if (sectorStocks.length === 0) continue;

    // Compute RS percentile ranking within sector peers
    const sectorRSValues = sectorStocks
      .filter((r) => r.data.relativeStrength20d !== null)
      .map((r) => r.data.relativeStrength20d!);

    const ranked = sectorStocks
      .map((r) => {
        const rsPercentile = sectorRSValues.length >= 3
          ? percentileRank(sectorRSValues, r.data.relativeStrength20d ?? 0)
          : null;

        const score =
          r.scores.finalScore * 0.4 +
          r.scores.scoreJ * 0.2 * 12 +
          r.scores.scoreK * 0.2 * 12 +
          ((r.data.insiderBuys90d ?? 0) > 0 ? 10 : 0) * 0.1 +
          ((r.data.putCallRatio ?? 1) < 0.7 ? 10 : 0) * 0.1 +
          (rsPercentile !== null && rsPercentile >= 80 ? 3 : 0); // Bonus for top 20% RS

        const reasons: string[] = [];
        if (r.scores.finalScore >= 19) reasons.push("High score");
        if ((r.data.insiderBuys90d ?? 0) > 0) reasons.push("Insider buying");
        if ((r.data.putCallRatio ?? 1) < 0.7) reasons.push("Bullish options flow");
        if (rsPercentile !== null && rsPercentile >= 80) reasons.push(`Top ${Math.round(100 - rsPercentile)}% RS`);
        else if ((r.data.relativeStrength20d ?? 0) > 0) reasons.push("RS leader");
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
  const stockQuotes: Record<string, { price: number; sma50: number | null; sma200: number | null; pctFromSma50: number | null; rsAccel: number | null; volume: number; avgVolume10d: number }> = {};
  for (const [symbol, q] of batchQuotes) {
    const pctFromSma50 = q.sma50 != null && q.sma50 > 0
      ? Math.round(((q.price - q.sma50) / q.sma50) * 1000) / 10  // 1 decimal
      : null;
    // RS Acceleration: difference between distance from 50d SMA vs 200d SMA
    // Positive = short-term momentum exceeding long-term trend (accelerating)
    // Negative = short-term momentum lagging long-term trend (decelerating)
    const pctFromSma200 = q.sma200 != null && q.sma200 > 0
      ? ((q.price - q.sma200) / q.sma200) * 100
      : null;
    const rsAccel = pctFromSma50 != null && pctFromSma200 != null
      ? Math.round((pctFromSma50 - pctFromSma200) * 100) / 100
      : null;
    stockQuotes[symbol] = { price: q.price, sma50: q.sma50, sma200: q.sma200, pctFromSma50, rsAccel, volume: q.volume, avgVolume10d: q.avgVolume10d };
  }

  // Build stock-level enrichment inputs from batch quotes + sector metadata
  const stockInputs: StockInput[] = [];
  // Build lookup: sector display name → scored sector (all categories)
  const sectorLookup = new Map(scoredSectors.map((s) => [s.sector, s]));
  // Build lookup: sector display name → raw acceleration
  const rawAccelLookup = new Map(rawScores.map((r) => [r.displayName, r.acceleration]));
  // Build lookup: sector display name → ETF roc20d
  const rawRoc20dLookup = new Map(rawScores.map((r) => [r.displayName, r.roc20d]));

  // Stocks in multiple sectors (e.g. NVDA in Semiconductors + Technology) are intentionally
  // enriched under EACH sector so they appear in per-sector stock tables filtered by sectorEtf.
  // Each instance is scored against its respective sector's metrics (quadrant, composite, etc.).
  // Only iterate sectors with stocks (skip cross-asset ETFs).

  for (const sectorDef of getSectorsWithStocks()) {
    const scored = sectorLookup.get(sectorDef.displayName);
    if (!scored) continue;
    const etfRoc20d = rawRoc20dLookup.get(sectorDef.displayName) ?? 0;
    const sectorAccel = rawAccelLookup.get(sectorDef.displayName) ?? 0;

    // Look up pre-run data for institutional ownership
    const preRunStocks = preRunBySector.get(sectorDef.displayName) ?? [];
    const preRunByTicker = new Map(preRunStocks.map((r) => [r.data.ticker, r]));

    for (const stock of sectorDef.stocks) {
      const q = batchQuotes.get(stock.symbol);
      if (!q || q.price <= 0) continue;

      const preRun = preRunByTicker.get(stock.symbol);
      // Institutional ownership: pre-run → Supabase cache → null (structural filter only)
      const institutionalPct = preRun?.data.institutionalPct
        ?? institutionalCache.get(stock.symbol)
        ?? null;

      // ret20d: prefer fiftyDayAvgChangePercent (actual Yahoo data), fallback to
      // distance from 50-SMA as proxy. Without this, LEADER classification is unreachable.
      const ret20d = q.fiftyDayAvgChangePct != null
        ? q.fiftyDayAvgChangePct
        : q.sma50 != null && q.sma50 > 0
          ? ((q.price - q.sma50) / q.sma50) * 100
          : null;

      stockInputs.push({
        symbol: stock.symbol,
        shortName: stock.name,
        sector: sectorDef.displayName,
        sectorEtf: sectorDef.etf,
        price: q.price,
        sma50: q.sma50,
        sma200: q.sma200,
        volume: q.volume,
        avgVolume10d: q.avgVolume10d,
        marketCap: q.marketCap,
        institutionalPct,
        ret20d,
        etfRet20d: etfRoc20d,
        sectorQuadrant: scored.quadrant,
        sectorComposite: scored.compositeScore,
        sectorAcceleration: sectorAccel,
        sectorStealth: scored.stealthAccumulation,
      });
    }
  }

  const enrichedStocks = enrichStocks(stockInputs);
  // Stock enrichment stats logged at debug level — not an error condition

  // Compute 20d daily returns per ETF for sparklines (all categories)
  const etfReturns20d: Record<string, number[]> = {};
  for (const group of sectorGroups) {
    const chart = charts.get(group.etf);
    if (!chart || chart.closes.length < 22) continue;
    const returns: number[] = [];
    const slice = chart.closes.slice(-21);
    for (let i = 1; i < slice.length; i++) {
      returns.push(slice[i - 1] !== 0 ? ((slice[i] - slice[i - 1]) / slice[i - 1]) * 100 : 0);
    }
    etfReturns20d[group.etf] = returns;
  }

  // Compute 20d return correlation matrix between GICS sector + leadership basket ETFs
  const correlationMatrix: Record<string, number> = {};
  const correlationGroups = sectorGroups.filter((g) => g.category === "gics_sector" || g.category === "leadership_basket");
  const etfReturnArrays = correlationGroups
    .map((g) => ({ etf: g.etf, returns: etfReturns20d[g.etf] }))
    .filter((e) => e.returns && e.returns.length >= 10);

  for (let i = 0; i < etfReturnArrays.length; i++) {
    for (let j = i + 1; j < etfReturnArrays.length; j++) {
      const a = etfReturnArrays[i];
      const b = etfReturnArrays[j];
      const len = Math.min(a.returns!.length, b.returns!.length);
      const ra = a.returns!.slice(-len);
      const rb = b.returns!.slice(-len);
      const meanA = ra.reduce((s, v) => s + v, 0) / len;
      const meanB = rb.reduce((s, v) => s + v, 0) / len;
      let cov = 0, varA = 0, varB = 0;
      for (let k = 0; k < len; k++) {
        const da = ra[k] - meanA;
        const db = rb[k] - meanB;
        cov += da * db;
        varA += da * da;
        varB += db * db;
      }
      const product = varA * varB;
      const denom = product > 0 ? Math.sqrt(product) : 0;
      const corr = denom > 0 ? cov / denom : 0;
      correlationMatrix[`${a.etf}:${b.etf}`] = Math.round(corr * 100) / 100;
    }
  }

  const result: SectorRotationResult = {
    calculatedAt: new Date().toISOString(),
    sectors: gicsSectors,
    subSectorScores,
    crossAssetScores,
    leadershipBasketScores,
    rotationActive,
    rotationSummary,
    dispersionIndex,
    sectorSpread,
    crossSectorPairs,
    topStocksToWatch,
    quotesAsOf,
    stockQuotes,
    correlationBreak,
    correlationMatrix,
    etfReturns20d,
    enrichedStocks,
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
