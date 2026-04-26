/**
 * Sector Rotation Tracker engine.
 * SERVER-ONLY: Used by /api/prerun/sector-rotation route + nightly cron.
 */

import "server-only";

import { fetchYahooChart, calcSMA, calc20dReturn } from "./data";
import { SECTOR_ETF_MAP, SCAN_UNIVERSE, getSectorForTicker } from "@/data/prerun-universe";
import type {
  SectorRotationScore,
  SectorRotationResult,
  RRGQuadrant,
} from "./sector-rotation-types";
import type { PreRunResult } from "./types";

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
  // ROC of ROC: first compute ROC(20) series, then ROC(5) of that
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
  // Align from the end
  const sc = sectorCloses.slice(-len);
  const sp = spyCloses.slice(-len);

  // Dorsey Relative Strength = sector/SPY
  const drs: number[] = [];
  for (let i = 0; i < len; i++) {
    drs.push(sp[i] !== 0 ? sc[i] / sp[i] : 0);
  }

  // SMA(200) of DRS
  const sma200 = drs.slice(-200).reduce((a, b) => a + b, 0) / 200;
  if (sma200 === 0) return 0;

  const currentDRS = drs[drs.length - 1];
  return 100 * (currentDRS / sma200 - 1);
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

function calcOBVSlope(closes: number[], volumes: number[], lookback = 20): -1 | 0 | 1 {
  const len = Math.min(closes.length, volumes.length);
  if (len < lookback + 1) return 0;

  // Build OBV series for the lookback window
  const obv: number[] = [0];
  const start = len - lookback;
  for (let i = start + 1; i < len; i++) {
    const prev = obv[obv.length - 1];
    if (closes[i] > closes[i - 1]) obv.push(prev + volumes[i]);
    else if (closes[i] < closes[i - 1]) obv.push(prev - volumes[i]);
    else obv.push(prev);
  }

  // Simple linear regression slope
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

  // Normalize slope relative to avg OBV magnitude
  const avgObv = Math.abs(sumY / n) || 1;
  const normalizedSlope = slope / avgObv;

  if (normalizedSlope > 0.01) return 1;
  if (normalizedSlope < -0.01) return -1;
  return 0;
}

function calcRRG(
  sectorCloses: number[],
  spyCloses: number[]
): { rsRatio: number; rsMomentum: number; quadrant: RRGQuadrant } {
  const len = Math.min(sectorCloses.length, spyCloses.length);
  if (len < 31) return { rsRatio: 100, rsMomentum: 0, quadrant: "LAGGING" };

  const sc = sectorCloses.slice(-len);
  const sp = spyCloses.slice(-len);

  // DRS series
  const drs: number[] = [];
  for (let i = 0; i < len; i++) {
    drs.push(sp[i] !== 0 ? sc[i] / sp[i] : 0);
  }

  // SMA(10) and SMA(30) of DRS
  const sma10 = drs.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const sma30 = drs.slice(-30).reduce((a, b) => a + b, 0) / 30;

  const rsRatio = sma30 !== 0 ? (sma10 / sma30) * 100 : 100;

  // RS-Momentum: need yesterday's rsRatio too
  let prevRsRatio = 100;
  if (len >= 32) {
    const prevDrs = drs.slice(-11, -1);
    const prevDrs30 = drs.slice(-31, -1);
    const prevSma10 = prevDrs.reduce((a, b) => a + b, 0) / 10;
    const prevSma30 = prevDrs30.reduce((a, b) => a + b, 0) / 30;
    prevRsRatio = prevSma30 !== 0 ? (prevSma10 / prevSma30) * 100 : 100;
  }
  const rsMomentum = rsRatio - prevRsRatio;

  // Quadrant classification
  let quadrant: RRGQuadrant;
  if (rsRatio >= 100 && rsMomentum >= 0) quadrant = "LEADING";
  else if (rsRatio >= 100 && rsMomentum < 0) quadrant = "WEAKENING";
  else if (rsRatio < 100 && rsMomentum < 0) quadrant = "LAGGING";
  else quadrant = "IMPROVING";

  return { rsRatio, rsMomentum, quadrant };
}

function calcBreadthPct(stockCloses: number[][]): number | null {
  if (stockCloses.length === 0) return null;

  let above50sma = 0;
  for (const closes of stockCloses) {
    const sma50 = calcSMA(closes, 50);
    if (sma50 !== null && closes.length > 0 && closes[closes.length - 1] > sma50) {
      above50sma++;
    }
  }
  return (above50sma / stockCloses.length) * 100;
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

// ── Chart data type ──

interface ChartData {
  closes: number[];
  volumes: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  timestamps: number[];
}

// ── Cache ──

let cachedResult: { data: SectorRotationResult; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ── Main calculation ──

export async function calculateSectorRotation(
  preRunResults?: PreRunResult[]
): Promise<SectorRotationResult> {
  // Check cache
  if (cachedResult && Date.now() - cachedResult.ts < CACHE_TTL) {
    return cachedResult.data;
  }

  // Get unique sector ETFs
  const uniqueETFs = [...new Set(Object.values(SECTOR_ETF_MAP))];
  const crossETFs = ["XLY", "XLP", "XLK", "XLU"];
  const allETFs = [...new Set(["SPY", ...uniqueETFs, ...crossETFs])];

  // Fetch 1y daily OHLCV for all ETFs in parallel
  const chartResults = await Promise.allSettled(
    allETFs.map((etf) => fetchYahooChart(etf, "1y", "1d"))
  );

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

  // Build pre-run lookup by sector
  const preRunBySector = new Map<string, PreRunResult[]>();
  if (preRunResults) {
    for (const r of preRunResults) {
      const sector = getSectorForTicker(r.data.ticker);
      const existing = preRunBySector.get(sector) ?? [];
      existing.push(r);
      preRunBySector.set(sector, existing);
    }
  }

  // Compute per-sector scores
  const sectors = Object.keys(SCAN_UNIVERSE);
  const rawScores: {
    sector: string;
    etf: string;
    momentumComposite: number;
    acceleration: number;
    mansfieldRS: number;
    cmf20: number;
    obvTrend: -1 | 0 | 1;
    rsRatio: number;
    rsMomentum: number;
    quadrant: RRGQuadrant;
    breadthPct: number | null;
    roc20d: number;
    chart: ChartData | undefined;
    // Leading indicators
    flowPriceDivergence: boolean;
    breadthDivergence: boolean;
    accelerationInflection: boolean;
    // Smart money
    aggregateInsiderBuys: number;
    aggregatePCR: number | null;
    unusualVolume: boolean;
    earningsBeatPct: number;
    smartMoneyScore: number;
  }[] = [];

  for (const sector of sectors) {
    const etf = SECTOR_ETF_MAP[sector] ?? "SPY";
    const chart = charts.get(etf);
    if (!chart) continue;

    const mc = calcMomentumComposite(chart.closes);
    const accel = calcAcceleration(chart.closes);
    const mrs = calcMansfieldRS(chart.closes, spyChart.closes);
    const cmf = calcCMF(chart.highs, chart.lows, chart.closes, chart.volumes, 20);
    const obv = calcOBVSlope(chart.closes, chart.volumes, 20);
    const rrg = calcRRG(chart.closes, spyChart.closes);
    const roc20d = calcROC(chart.closes, 20);

    // Breadth: use stock closes from pre-run data if available
    // We don't have individual stock chart data here, so breadth from pre-run results
    const sectorStocks = preRunBySector.get(sector) ?? [];
    let breadthPct: number | null = null;
    if (sectorStocks.length > 0) {
      const aboveSma = sectorStocks.filter(
        (r) => r.data.currentPrice !== null && r.data.sma20 !== null && r.data.currentPrice > r.data.sma20
      ).length;
      breadthPct = (aboveSma / sectorStocks.length) * 100;
    }

    // Leading indicators
    // flowPriceDivergence: CMF > 0 for 15+ bars AND 20d ROC < 0
    let flowPriceDivergence = false;
    if (cmf > 0 && roc20d < 0) {
      // Check if CMF has been positive for ~15 bars by checking at midpoint
      if (chart.closes.length >= 35) {
        const midCmf = calcCMF(
          chart.highs.slice(0, -10),
          chart.lows.slice(0, -10),
          chart.closes.slice(0, -10),
          chart.volumes.slice(0, -10),
          20
        );
        flowPriceDivergence = midCmf > 0;
      }
    }

    // breadthDivergence: breadth improving + sector price declining
    let breadthDivergence = false;
    if (breadthPct !== null && breadthPct > 50 && roc20d < 0) {
      breadthDivergence = true;
    }

    // accelerationInflection: acceleration > 0 AND 20d ROC < 0
    const accelerationInflection = accel > 0 && roc20d < 0;

    // Smart money aggregation from pre-run results
    let aggregateInsiderBuys = 0;
    let totalPCR = 0;
    let pcrCount = 0;
    let beatStreakCount = 0;
    for (const r of sectorStocks) {
      aggregateInsiderBuys += r.data.insiderBuys90d ?? 0;
      if (r.data.putCallRatio !== null) {
        totalPCR += r.data.putCallRatio;
        pcrCount++;
      }
      if ((r.data.earningsBeatStreak ?? 0) >= 2) beatStreakCount++;
    }
    const aggregatePCR = pcrCount > 0 ? totalPCR / pcrCount : null;
    const earningsBeatPct = sectorStocks.length > 0
      ? (beatStreakCount / sectorStocks.length) * 100
      : 0;

    // Unusual volume: ETF volume > 1.5x 20d avg
    let unusualVolume = false;
    if (chart.volumes.length >= 21) {
      const avgVol20 = chart.volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      const todayVol = chart.volumes[chart.volumes.length - 1];
      unusualVolume = avgVol20 > 0 && todayVol > 1.5 * avgVol20;
    }

    // Smart money composite (0-100)
    let smartMoneyScore = 0;
    if (aggregateInsiderBuys > 0) smartMoneyScore += 25;
    if (aggregateInsiderBuys >= 3) smartMoneyScore += 10;
    if (aggregatePCR !== null && aggregatePCR < 0.7) smartMoneyScore += 25;
    if (unusualVolume) smartMoneyScore += 20;
    if (earningsBeatPct >= 50) smartMoneyScore += 20;

    rawScores.push({
      sector,
      etf,
      momentumComposite: mc,
      acceleration: accel,
      mansfieldRS: mrs,
      cmf20: cmf,
      obvTrend: obv,
      rsRatio: rrg.rsRatio,
      rsMomentum: rrg.rsMomentum,
      quadrant: rrg.quadrant,
      breadthPct,
      roc20d,
      chart,
      flowPriceDivergence,
      breadthDivergence,
      accelerationInflection,
      aggregateInsiderBuys,
      aggregatePCR,
      unusualVolume,
      earningsBeatPct,
      smartMoneyScore,
    });
  }

  // Percentile-rank momentum composite
  const allMomentums = rawScores.map((s) => s.momentumComposite);

  // Min-max for acceleration
  const accels = rawScores.map((s) => s.acceleration);
  const accelMin = Math.min(...accels);
  const accelMax = Math.max(...accels);

  // Build final scored sectors
  const scoredSectors: SectorRotationScore[] = rawScores.map((raw) => {
    const momentumPercentile = percentileRank(allMomentums, raw.momentumComposite);

    // Normalize each factor to 0-100
    const normMomentum = momentumPercentile;
    const normAccel = accelMax !== accelMin
      ? ((raw.acceleration - accelMin) / (accelMax - accelMin)) * 100
      : 50;
    const normMansfield = clampNormalize(raw.mansfieldRS, -20, 20);
    const normCMF = clampNormalize(raw.cmf20, -1, 1);
    const normBreadth = raw.breadthPct ?? 50; // Fallback to neutral
    const normSmartMoney = raw.smartMoneyScore;

    // Composite weighted blend
    const hasBreadth = raw.breadthPct !== null;
    let compositeScore: number;
    if (hasBreadth) {
      compositeScore =
        normMomentum * 0.25 +
        normAccel * 0.15 +
        normMansfield * 0.20 +
        normCMF * 0.15 +
        normBreadth * 0.15 +
        normSmartMoney * 0.10;
    } else {
      // Redistribute breadth weight
      compositeScore =
        normMomentum * 0.30 +
        normAccel * 0.17 +
        normMansfield * 0.23 +
        normCMF * 0.18 +
        normSmartMoney * 0.12;
    }

    // Trend from 20d ROC
    let trend: "UP" | "DOWN" | "FLAT";
    let trendArrow: string;
    if (raw.roc20d > 3) { trend = "UP"; trendArrow = "\u2191"; }
    else if (raw.roc20d > 1) { trend = "UP"; trendArrow = "\u2197"; }
    else if (raw.roc20d > -1) { trend = "FLAT"; trendArrow = "\u2192"; }
    else if (raw.roc20d > -3) { trend = "DOWN"; trendArrow = "\u2198"; }
    else { trend = "DOWN"; trendArrow = "\u2193"; }

    // Stealth accumulation: 2+ leading indicators
    const leadingCount = [
      raw.flowPriceDivergence,
      raw.breadthDivergence,
      raw.accelerationInflection,
    ].filter(Boolean).length;
    const stealthAccumulation = leadingCount >= 2;

    return {
      sector: raw.sector,
      etf: raw.etf,
      momentumComposite: Math.round(raw.momentumComposite * 100) / 100,
      momentumPercentile: Math.round(momentumPercentile),
      acceleration: Math.round(raw.acceleration * 100) / 100,
      mansfieldRS: Math.round(raw.mansfieldRS * 100) / 100,
      cmf20: Math.round(raw.cmf20 * 1000) / 1000,
      obvTrend: raw.obvTrend,
      flowPriceDivergence: raw.flowPriceDivergence,
      breadthDivergence: raw.breadthDivergence,
      accelerationInflection: raw.accelerationInflection,
      breadthPct: raw.breadthPct !== null ? Math.round(raw.breadthPct) : null,
      aggregateInsiderBuys: raw.aggregateInsiderBuys,
      aggregatePCR: raw.aggregatePCR !== null ? Math.round(raw.aggregatePCR * 100) / 100 : null,
      unusualVolume: raw.unusualVolume,
      earningsBeatPct: Math.round(raw.earningsBeatPct),
      smartMoneyScore: Math.round(raw.smartMoneyScore),
      rsRatio: Math.round(raw.rsRatio * 100) / 100,
      rsMomentum: Math.round(raw.rsMomentum * 10000) / 10000,
      quadrant: raw.quadrant,
      compositeScore: Math.round(compositeScore),
      trend,
      trendArrow,
      stealthAccumulation,
    };
  });

  // Sort by composite score desc
  scoredSectors.sort((a, b) => b.compositeScore - a.compositeScore);

  // Rotation detection
  const all20dReturns = rawScores.map((r) => r.roc20d);
  const mean20d = all20dReturns.reduce((a, b) => a + b, 0) / all20dReturns.length;
  const variance = all20dReturns.reduce((a, b) => a + (b - mean20d) ** 2, 0) / all20dReturns.length;
  const dispersionIndex = Math.round(Math.sqrt(variance) * 100) / 100;
  const rotationActive = dispersionIndex > 2.0;

  // Rotation summary
  let rotationSummary = "No clear rotation detected";
  if (rotationActive && scoredSectors.length >= 2) {
    const improving = scoredSectors.filter((s) => s.quadrant === "IMPROVING" || s.stealthAccumulation);
    const weakening = scoredSectors.filter((s) => s.quadrant === "WEAKENING" || s.quadrant === "LAGGING");
    if (improving.length > 0 && weakening.length > 0) {
      const toSector = improving[0].sector;
      const fromSector = weakening[weakening.length - 1].sector;
      rotationSummary = `Money flowing FROM ${fromSector} TO ${toSector}`;
    } else if (improving.length > 0) {
      rotationSummary = `Rotation INTO ${improving[0].sector}`;
    } else {
      rotationSummary = "Sectors diverging — watch for rotation signal";
    }
  }

  // Cross-sector pairs
  const xlyChart = charts.get("XLY");
  const xlpChart = charts.get("XLP");
  const xlkChart = charts.get("XLK");
  const xluChart = charts.get("XLU");

  function pairAnalysis(
    numChart: ChartData | undefined,
    denChart: ChartData | undefined
  ): { ratio: number; trend: string } {
    if (!numChart || !denChart || numChart.closes.length < 21 || denChart.closes.length < 21) {
      return { ratio: 0, trend: "N/A" };
    }
    const currentRatio = denChart.closes[denChart.closes.length - 1] !== 0
      ? numChart.closes[numChart.closes.length - 1] / denChart.closes[denChart.closes.length - 1]
      : 0;
    const pastRatio = denChart.closes[denChart.closes.length - 21] !== 0
      ? numChart.closes[numChart.closes.length - 21] / denChart.closes[denChart.closes.length - 21]
      : 0;
    const change = pastRatio !== 0 ? ((currentRatio - pastRatio) / pastRatio) * 100 : 0;
    let trend: string;
    if (change > 1) trend = "Rising (Risk-On)";
    else if (change < -1) trend = "Falling (Risk-Off)";
    else trend = "Flat";
    return { ratio: Math.round(currentRatio * 1000) / 1000, trend };
  }

  const crossSectorPairs = {
    xlyXlp: pairAnalysis(xlyChart, xlpChart),
    xlkXlu: pairAnalysis(xlkChart, xluChart),
  };

  // Top stocks to watch (for sectors with stealth accumulation or Improving quadrant)
  const topStocksToWatch: SectorRotationResult["topStocksToWatch"] = [];
  const watchSectors = scoredSectors.filter(
    (s) => s.stealthAccumulation || s.quadrant === "IMPROVING"
  );

  for (const sector of watchSectors.slice(0, 3)) {
    const sectorStocks = preRunBySector.get(sector.sector) ?? [];
    if (sectorStocks.length === 0) continue;

    const ranked = sectorStocks
      .map((r) => {
        const score =
          r.scores.finalScore * 0.4 +
          r.scores.scoreJ * 0.2 * 12 + // Normalize J (0-2) to comparable scale
          r.scores.scoreK * 0.2 * 12 + // Normalize K (0-2) to comparable scale
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

  const result: SectorRotationResult = {
    calculatedAt: new Date().toISOString(),
    sectors: scoredSectors,
    rotationActive,
    rotationSummary,
    dispersionIndex,
    crossSectorPairs,
    topStocksToWatch,
  };

  cachedResult = { data: result, ts: Date.now() };
  return result;
}

// ── Telegram formatter ──

export function formatSectorRotationTelegram(result: SectorRotationResult): string {
  const lines: string[] = [];
  lines.push("<b>Sector Rotation</b>");
  lines.push(result.rotationSummary);
  lines.push(`Dispersion: ${result.dispersionIndex}`);
  lines.push("");

  lines.push("<b>Top 3 Sectors:</b>");
  for (const s of result.sectors.slice(0, 3)) {
    lines.push(`${s.trendArrow} ${s.sector} (${s.etf}): ${s.compositeScore}/100 [${s.quadrant}]`);
  }

  const stealth = result.sectors.filter((s) => s.stealthAccumulation);
  if (stealth.length > 0) {
    lines.push("");
    lines.push("<b>Stealth Accumulation:</b>");
    for (const s of stealth) {
      const signals: string[] = [];
      if (s.flowPriceDivergence) signals.push("CMF positive + price flat");
      if (s.breadthDivergence) signals.push("breadth improving");
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
