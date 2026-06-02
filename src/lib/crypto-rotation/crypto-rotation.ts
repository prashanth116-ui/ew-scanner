/**
 * Crypto Sector Rotation engine.
 * SERVER-ONLY: Used by /api/crypto-rotation route.
 *
 * 10 crypto sectors with proxy token mapping.
 * 4-factor composite: momentum(30), acceleration(20), Mansfield RS(25), CMF(25).
 * Benchmark: BTC-USD.
 */

import "server-only";

import { fetchYahooChart, calcSMA, fetchBatchQuotes } from "@/lib/prerun/data";
import { CRYPTO_UNIVERSE, CRYPTO_BENCHMARK, getAllCryptoSymbols } from "@/data/crypto-sector-universe";
import type { SectorRotationScore, RRGQuadrant } from "../sector-rotation/types";
import type { StockInput } from "../sector-rotation/stock-enrichment";
import type { CryptoRotationResult } from "./types";
import { enrichCryptoTokens } from "./token-enrichment";
import { classifyCryptoRegime } from "./crypto-regime";
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
} from "../sector-rotation/math";

// ── Chart data type ──

interface ChartData {
  closes: number[];
  volumes: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  timestamps: number[];
}

// ── Crypto composite: 4 factors (no breadth, no smart money) ──

const CRYPTO_WEIGHTS = {
  momentum: 30,
  acceleration: 20,
  mansfield: 25,
  cmf: 25,
};

function computeCryptoComposite(
  normalized: Record<string, number>
): { score: number; dataQuality: number; breakdown: { momentum: boolean; acceleration: boolean; mansfield: boolean; cmf: boolean; breadth: boolean; smartMoney: boolean } } {
  const totalWeight = Object.values(CRYPTO_WEIGHTS).reduce((a, b) => a + b, 0);
  let score = 0;
  for (const [key, weight] of Object.entries(CRYPTO_WEIGHTS)) {
    score += (normalized[key] ?? 50) * (weight / totalWeight);
  }

  return {
    score: Math.round(score),
    dataQuality: 100, // All 4 factors always available
    breakdown: {
      momentum: true,
      acceleration: true,
      mansfield: true,
      cmf: true,
      breadth: false,
      smartMoney: false,
    },
  };
}

// ── Cache ──

let cachedResult: { data: CryptoRotationResult; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;

// ── Main calculation ──

export async function calculateCryptoRotation(): Promise<CryptoRotationResult> {
  if (cachedResult && Date.now() - cachedResult.ts < CACHE_TTL) {
    return cachedResult.data;
  }

  // Build sector groups from crypto universe
  const sectorGroups = CRYPTO_UNIVERSE.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    etf: s.etf,
  }));

  // Fetch BTC + all proxy charts + batch quotes in parallel
  const proxySymbols = sectorGroups.map((s) => s.etf);
  const allChartSymbols = [...new Set([CRYPTO_BENCHMARK, ...proxySymbols])];
  const allTokenSymbols = getAllCryptoSymbols();

  const [chartResults, batchQuotes] = await Promise.all([
    Promise.allSettled(allChartSymbols.map((sym) => fetchYahooChart(sym, "1y", "1d"))),
    fetchBatchQuotes(allTokenSymbols),
  ]);

  const quotesAsOf = new Date().toISOString();

  const charts = new Map<string, ChartData>();
  for (let i = 0; i < allChartSymbols.length; i++) {
    const r = chartResults[i];
    if (r.status === "fulfilled" && r.value) {
      charts.set(allChartSymbols[i], r.value);
    }
  }

  const btcChart = charts.get(CRYPTO_BENCHMARK);
  if (!btcChart) {
    throw new Error("Failed to fetch BTC-USD data");
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
    roc20d: number;
    flowPriceDivergence: boolean;
    accelerationInflection: boolean;
  }

  const rawScores: RawScore[] = [];

  for (const group of sectorGroups) {
    const chart = charts.get(group.etf);
    if (!chart) continue;

    const mc = calcMomentumComposite(chart.closes);
    const accel = calcAcceleration(chart.closes);
    const mrs = calcMansfieldRS(chart.closes, btcChart.closes);
    const cmf = calcCMF(chart.highs, chart.lows, chart.closes, chart.volumes, 20);
    const obv = calcOBVSlope(chart.closes, chart.volumes, 20);
    const rrg = calcRRG(chart.closes, btcChart.closes);
    const roc20d = calcROC(chart.closes, 20);

    // Flow/price divergence
    let flowPriceDivergence = false;
    if (cmf > 0 && roc20d < 0) {
      const positiveCount = calcRollingCMFPositiveCount(
        chart.highs, chart.lows, chart.closes, chart.volumes, 20, 20
      );
      flowPriceDivergence = positiveCount >= 15;
    }

    // Acceleration inflection
    const accelerationInflection = accel > 0 && roc20d < 2;

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
      roc20d,
      flowPriceDivergence,
      accelerationInflection,
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
    };

    const { score: compositeScore, dataQuality, breakdown } = computeCryptoComposite(normalized);

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
      breadthDivergence: false, // No breadth data for crypto
      accelerationInflection: raw.accelerationInflection,
      breadthPct: null,
      aggregateInsiderBuys: 0,
      aggregatePCR: null,
      unusualVolume: false,
      earningsBeatPct: 0,
      smartMoneyScore: 0,
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
      rotationVelocity: 0,
    };
  });

  // Compute rotation velocity
  for (const s of scoredSectors) {
    s.rotationVelocity = calcRotationVelocity(s.rrgTrail);
  }

  scoredSectors.sort((a, b) => b.compositeScore - a.compositeScore);

  // Multi-signal rotation detection
  const all20dReturns = rawScores.map((r) => r.roc20d);
  const dispersionIndex = Math.round(stddev(all20dReturns) * 100) / 100;
  const sectorSpread = all20dReturns.length > 0
    ? Math.round((Math.max(...all20dReturns) - Math.min(...all20dReturns)) * 100) / 100
    : 0;

  const rotationActive = dispersionIndex > 4 || (dispersionIndex > 2 && sectorSpread > 8);

  let rotationSummary = "No clear rotation detected";
  if (rotationActive && scoredSectors.length >= 2) {
    const improving = scoredSectors.filter((s) => s.quadrant === "IMPROVING" || s.stealthAccumulation);
    const activelyWeakening = scoredSectors.filter((s) => s.quadrant === "WEAKENING");
    const lagging = scoredSectors.filter((s) => s.quadrant === "LAGGING");
    const fromPool = activelyWeakening.length > 0 ? activelyWeakening : lagging;
    if (improving.length > 0 && fromPool.length > 0) {
      const fromSector = [...fromPool].sort((a, b) => a.acceleration - b.acceleration)[0];
      const toSector = [...improving].sort((a, b) => b.acceleration - a.acceleration)[0];
      rotationSummary = `Money flowing FROM ${fromSector.sector} TO ${toSector.sector}`;
    } else if (improving.length > 0) {
      const toSector = [...improving].sort((a, b) => b.acceleration - a.acceleration)[0];
      rotationSummary = `Rotation INTO ${toSector.sector}`;
    } else {
      rotationSummary = "Sectors diverging \u2014 watch for rotation signal";
    }
  }

  // Build stock quotes map
  const stockQuotes: CryptoRotationResult["stockQuotes"] = {};
  for (const [symbol, q] of batchQuotes) {
    const pctFromSma50 = q.sma50 != null && q.sma50 > 0
      ? Math.round(((q.price - q.sma50) / q.sma50) * 1000) / 10
      : null;
    const pctFromSma200 = q.sma200 != null && q.sma200 > 0
      ? ((q.price - q.sma200) / q.sma200) * 100
      : null;
    const rsAccel = pctFromSma50 != null && pctFromSma200 != null
      ? Math.round((pctFromSma50 - pctFromSma200) * 100) / 100
      : null;
    stockQuotes[symbol] = { price: q.price, sma50: q.sma50, sma200: q.sma200, pctFromSma50, rsAccel, volume: q.volume, avgVolume10d: q.avgVolume10d };
  }

  // Token enrichment
  const sectorLookup = new Map(scoredSectors.map((s) => [s.sector, s]));
  const rawAccelLookup = new Map(rawScores.map((r) => [r.displayName, r.acceleration]));
  const rawRoc20dLookup = new Map(rawScores.map((r) => [r.displayName, r.roc20d]));

  const stockInputs: StockInput[] = [];
  for (const sectorDef of CRYPTO_UNIVERSE) {
    const scored = sectorLookup.get(sectorDef.displayName);
    if (!scored) continue;
    const etfRoc20d = rawRoc20dLookup.get(sectorDef.displayName) ?? 0;
    const sectorAccel = rawAccelLookup.get(sectorDef.displayName) ?? 0;

    for (const token of sectorDef.stocks) {
      const q = batchQuotes.get(token.symbol);
      if (!q || q.price <= 0) continue;

      stockInputs.push({
        symbol: token.symbol,
        shortName: token.name,
        sector: sectorDef.displayName,
        sectorEtf: sectorDef.etf,
        price: q.price,
        sma50: q.sma50,
        sma200: q.sma200,
        volume: q.volume,
        avgVolume10d: q.avgVolume10d,
        marketCap: q.marketCap,
        institutionalPct: null,
        ret20d: null,
        etfRet20d: etfRoc20d,
        sectorQuadrant: scored.quadrant,
        sectorComposite: scored.compositeScore,
        sectorAcceleration: sectorAccel,
        sectorStealth: scored.stealthAccumulation,
      });
    }
  }

  const enrichedStocks = enrichCryptoTokens(stockInputs);
  console.log(`[cryptoRotation] Enriched ${enrichedStocks.passed.length} tokens (${enrichedStocks.rejected.length} rejected)`);

  // ETF returns for sparklines
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

  // Correlation matrix between proxy tokens
  const correlationMatrix: Record<string, number> = {};
  const etfReturnArrays = sectorGroups
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

  // Crypto regime
  const proxyReturns = rawScores.map((r) => r.roc20d);
  const regime = classifyCryptoRegime(btcChart.closes, proxyReturns);

  const result: CryptoRotationResult = {
    assetClass: "crypto",
    calculatedAt: new Date().toISOString(),
    sectors: scoredSectors,
    rotationActive,
    rotationSummary,
    dispersionIndex,
    sectorSpread,
    topStocksToWatch: [],
    quotesAsOf,
    stockQuotes,
    correlationBreak: false, // N/A for crypto
    correlationMatrix,
    etfReturns20d,
    enrichedStocks,
    regime: {
      regime: regime.regime,
      vix: regime.btcVolatility, // Repurpose VIX field for BTC vol
      vixSlope: regime.marketTrend === "rising" ? "falling" : regime.marketTrend === "falling" ? "rising" : "flat",
      yield10y: 0,
      dxy: 0,
      dxyTrend: "flat",
      favoredSectors: regime.favoredSectors,
      avoidSectors: regime.avoidSectors,
    },
    btcDominance: {
      current: 0, // Would need separate data source
      trend: "flat",
      altSeasonSignal: regime.altSeasonSignal,
    },
  };

  cachedResult = { data: result, ts: Date.now() };
  return result;
}
