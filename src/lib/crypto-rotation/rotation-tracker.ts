/**
 * Crypto Rotation Tracker — detection engine.
 * SERVER-ONLY: Used by /api/crypto-rotation-tracker route.
 *
 * Same 3-signal system as equity:
 *   1. RS Golden Cross (10d vs 30d SMA of proxy/BTC ratio)
 *   2. Volume Surge (daily volume > 1.5x 20d average)
 *   3. Price Breakout (close > 50d SMA)
 *
 * Benchmark: BTC-USD instead of SPY.
 */

import "server-only";

import type {
  RotationSignalState,
  RotationEvent,
  RotationHealthSignals,
  RRGQuadrant,
  RotationPatternStats,
  RotationTrackerResult,
} from "../sector-rotation/rotation-types";
import { fetchYahooChart, calcSMA } from "@/lib/prerun/data";
import { CRYPTO_UNIVERSE, CRYPTO_BENCHMARK } from "@/data/crypto-sector-universe";
import { calcAcceleration, calcCMF } from "../sector-rotation/math";
import { classifyCryptoRegime } from "./crypto-regime";
import type { CryptoRegimeData } from "./crypto-regime";

// ── Cache ──

let cachedResult: RotationTrackerResult | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

// ── SMA series ──

function computeSMASeries(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

// ── RRG Quadrant (simplified for tracker) ──

function calcRRGQuadrant(
  sectorCloses: number[],
  btcCloses: number[]
): { quadrant: RRGQuadrant; rsRatio: number; rsMomentum: number } {
  const len = Math.min(sectorCloses.length, btcCloses.length);
  if (len < 31) return { quadrant: "LAGGING", rsRatio: 100, rsMomentum: 100 };

  const sc = sectorCloses.slice(-len);
  const sp = btcCloses.slice(-len);

  const drs: number[] = [];
  for (let i = 0; i < len; i++) {
    drs.push(sp[i] !== 0 ? sc[i] / sp[i] : 0);
  }

  const k = 2 / (10 + 1);
  const rsSmooth: number[] = [drs[0]];
  for (let i = 1; i < drs.length; i++) {
    rsSmooth.push(drs[i] * k + rsSmooth[i - 1] * (1 - k));
  }

  const lookback = Math.min(200, drs.length - 30);
  if (lookback < 20) return { quadrant: "LAGGING", rsRatio: 100, rsMomentum: 100 };

  function zScoreAt(values: number[], idx: number, lb: number): number {
    if (idx < lb - 1) return 0;
    const window = values.slice(idx - lb + 1, idx + 1);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
    const std = Math.sqrt(variance);
    return std > 0 ? (values[idx] - mean) / std : 0;
  }

  const rsRatioSeries: number[] = [];
  const startIdx = Math.max(0, rsSmooth.length - 11);
  for (let i = startIdx; i < rsSmooth.length; i++) {
    rsRatioSeries.push(100 + zScoreAt(rsSmooth, i, lookback));
  }
  const rsRatio = rsRatioSeries[rsRatioSeries.length - 1];

  const rocFull: number[] = new Array(rsSmooth.length).fill(0);
  for (let i = lookback - 1; i < rsSmooth.length; i++) {
    const rsR = 100 + zScoreAt(rsSmooth, i, lookback);
    if (i >= lookback - 1 + 10) {
      const pastRsR = 100 + zScoreAt(rsSmooth, i - 10, lookback);
      rocFull[i] = pastRsR !== 0 ? ((rsR - pastRsR) / pastRsR) * 100 : 0;
    }
  }
  const lastIdx = rsSmooth.length - 1;
  const rsMomentum = 100 + zScoreAt(rocFull, lastIdx, lookback);

  let quadrant: RRGQuadrant;
  if (rsRatio >= 100 && rsMomentum >= 100) quadrant = "LEADING";
  else if (rsRatio >= 100 && rsMomentum < 100) quadrant = "WEAKENING";
  else if (rsRatio < 100 && rsMomentum < 100) quadrant = "LAGGING";
  else quadrant = "IMPROVING";

  return { quadrant, rsRatio, rsMomentum };
}

// ── Aligned bar type ──

interface AlignedBar {
  date: string;
  timestamp: number;
  etfClose: number;
  etfHigh: number;
  etfLow: number;
  etfVolume: number;
  btcClose: number;
}

function alignSeries(
  etfCloses: number[],
  etfHighs: number[],
  etfLows: number[],
  etfVolumes: number[],
  etfTimestamps: number[],
  btcCloses: number[],
  btcTimestamps: number[]
): AlignedBar[] {
  const btcMap = new Map<number, number>();
  for (let i = 0; i < btcTimestamps.length; i++) {
    btcMap.set(btcTimestamps[i], btcCloses[i]);
  }

  const aligned: AlignedBar[] = [];
  for (let i = 0; i < etfTimestamps.length; i++) {
    const btcClose = btcMap.get(etfTimestamps[i]);
    if (btcClose !== undefined && btcClose !== 0 && etfCloses[i] !== 0) {
      const d = new Date(etfTimestamps[i] * 1000);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      aligned.push({
        date,
        timestamp: etfTimestamps[i],
        etfClose: etfCloses[i],
        etfHigh: etfHighs[i],
        etfLow: etfLows[i],
        etfVolume: etfVolumes[i],
        btcClose,
      });
    }
  }
  return aligned;
}

// ── Health signals ──

function computeHealthSignals(aligned: AlignedBar[]): RotationHealthSignals {
  const closes = aligned.map((b) => b.etfClose);
  const highs = aligned.map((b) => b.etfHigh);
  const lows = aligned.map((b) => b.etfLow);
  const volumes = aligned.map((b) => b.etfVolume);
  const btcCloses = aligned.map((b) => b.btcClose);

  const acceleration = Math.round(calcAcceleration(closes) * 100) / 100;
  const cmf20 = Math.round(calcCMF(highs, lows, closes, volumes, 20) * 1000) / 1000;
  const { quadrant } = calcRRGQuadrant(closes, btcCloses);

  return { acceleration, cmf20, quadrant };
}

// ── Daily signals ──

interface DailySignal {
  date: string;
  close: number;
  signals: RotationSignalState;
}

function computeDailySignals(aligned: AlignedBar[]): DailySignal[] {
  if (aligned.length < 50) return [];

  const rsRatios = aligned.map((b) => b.etfClose / b.btcClose);
  const volumes = aligned.map((b) => b.etfVolume);
  const closes = aligned.map((b) => b.etfClose);

  const rsSma10 = computeSMASeries(rsRatios, 10);
  const rsSma30 = computeSMASeries(rsRatios, 30);
  const volumeSma20 = computeSMASeries(volumes, 20);
  const closeSma50 = computeSMASeries(closes, 50);

  const results: DailySignal[] = [];
  for (let i = 0; i < aligned.length; i++) {
    const rs10 = rsSma10[i];
    const rs30 = rsSma30[i];
    const volAvg = volumeSma20[i];
    const sma50 = closeSma50[i];

    if (rs10 === null || rs30 === null || volAvg === null || sma50 === null) continue;

    const rsGoldenCross = rs10 > rs30;
    const volumeSurge = volAvg > 0 && volumes[i] > 1.5 * volAvg;
    const priceAbove50MA = closes[i] > sma50;

    const signalCount =
      (rsGoldenCross ? 1 : 0) +
      (volumeSurge ? 1 : 0) +
      (priceAbove50MA ? 1 : 0);

    results.push({
      date: aligned[i].date,
      close: closes[i],
      signals: { rsGoldenCross, volumeSurge, priceAbove50MA, signalCount },
    });
  }

  return results;
}

// ── Rotation events ──

function detectRotationEvents(
  sectorId: string,
  sectorName: string,
  etf: string,
  dailySignals: DailySignal[],
  health: RotationHealthSignals
): RotationEvent[] {
  if (dailySignals.length < 6) return [];

  const events: RotationEvent[] = [];
  let currentStart: number | null = null;
  let belowThresholdStreak = 0;

  for (let i = 5; i < dailySignals.length; i++) {
    const today = dailySignals[i];
    const isStrong = today.signals.signalCount >= 2;

    if (currentStart === null) {
      if (isStrong) {
        const priorAllWeak = dailySignals
          .slice(i - 5, i)
          .every((d) => d.signals.signalCount < 2);
        if (priorAllWeak) {
          currentStart = i;
          belowThresholdStreak = 0;
        }
      }
    } else {
      if (!isStrong) {
        belowThresholdStreak++;
        if (belowThresholdStreak >= 3) {
          const endIdx = i - 2;
          events.push(buildEvent(sectorId, sectorName, etf, dailySignals, currentStart, endIdx, health));
          currentStart = null;
          belowThresholdStreak = 0;
        }
      } else {
        belowThresholdStreak = 0;
      }
    }
  }

  if (currentStart !== null) {
    events.push(buildEvent(sectorId, sectorName, etf, dailySignals, currentStart, null, health));
  }

  return events;
}

function buildEvent(
  sectorId: string,
  sectorName: string,
  etf: string,
  dailySignals: DailySignal[],
  startIdx: number,
  endIdx: number | null,
  health: RotationHealthSignals
): RotationEvent {
  const startDay = dailySignals[startIdx];
  const lastIdx = endIdx ?? dailySignals.length - 1;
  const endDay = dailySignals[lastIdx];
  const daysActive = lastIdx - startIdx + 1;
  const perfPct = startDay.close !== 0
    ? ((endDay.close - startDay.close) / startDay.close) * 100
    : 0;

  const history = dailySignals.slice(startIdx, lastIdx + 1).map((d) => ({
    date: d.date,
    signalCount: d.signals.signalCount,
    close: d.close,
  }));

  return {
    sectorId,
    sectorName,
    etf,
    startDate: startDay.date,
    endDate: endIdx !== null ? endDay.date : null,
    daysActive,
    etfPriceAtStart: startDay.close,
    etfPriceNow: endDay.close,
    etfPerformancePct: Math.round(perfPct * 100) / 100,
    signals: endDay.signals,
    health,
    signalHistory: history,
  };
}

// ── Pattern stats ──

function computePatternStats(
  sectorId: string,
  sectorName: string,
  etf: string,
  events: RotationEvent[]
): RotationPatternStats {
  const completed = events.filter((e) => e.endDate !== null);
  const durations = completed.map((e) => e.daysActive);
  const perfs = completed.map((e) => e.etfPerformancePct);

  return {
    sectorId,
    sectorName,
    etf,
    totalRotations: events.length,
    avgDurationDays: durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0,
    avgPerformancePct: perfs.length > 0
      ? Math.round((perfs.reduce((a, b) => a + b, 0) / perfs.length) * 100) / 100
      : 0,
    bestPerformancePct: perfs.length > 0 ? Math.max(...perfs) : 0,
    worstPerformancePct: perfs.length > 0 ? Math.min(...perfs) : 0,
    history: completed.map((e) => ({
      startDate: e.startDate,
      endDate: e.endDate!,
      durationDays: e.daysActive,
      performancePct: e.etfPerformancePct,
    })),
  };
}

// ── Main ──

export async function calculateCryptoRotationTracker(): Promise<RotationTrackerResult> {
  if (cachedResult && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResult;
  }

  // Fetch BTC + all proxy charts in parallel
  const etfChartPromises = CRYPTO_UNIVERSE.map((sector) =>
    fetchYahooChart(sector.etf, "1y", "1d")
      .then((chart) => ({ sectorId: sector.id, chart }))
      .catch(() => ({ sectorId: sector.id, chart: null }))
  );
  const [btcChart, ...etfCharts] = await Promise.all([
    fetchYahooChart(CRYPTO_BENCHMARK, "1y", "1d"),
    ...etfChartPromises,
  ]);
  if (!btcChart || btcChart.closes.length < 50) {
    throw new Error("Failed to fetch BTC-USD benchmark data");
  }

  // Detect events per sector
  const allEvents: RotationEvent[] = [];
  const patternStats: RotationPatternStats[] = [];
  const proxyReturns: number[] = [];

  for (const sector of CRYPTO_UNIVERSE) {
    const chartEntry = etfCharts.find((c) => c.sectorId === sector.id);
    if (!chartEntry?.chart) continue;
    const chart = chartEntry.chart;

    const aligned = alignSeries(
      chart.closes, chart.highs, chart.lows, chart.volumes, chart.timestamps,
      btcChart.closes, btcChart.timestamps
    );
    if (aligned.length < 50) continue;

    // Collect 20d return for regime
    if (chart.closes.length >= 21) {
      const c = chart.closes;
      const ret20 = c[c.length - 21] > 0 ? ((c[c.length - 1] - c[c.length - 21]) / c[c.length - 21]) * 100 : 0;
      proxyReturns.push(ret20);
    }

    const dailySignals = computeDailySignals(aligned);
    if (dailySignals.length < 6) continue;

    const health = computeHealthSignals(aligned);
    const events = detectRotationEvents(sector.id, sector.displayName, sector.etf, dailySignals, health);

    allEvents.push(...events);
    patternStats.push(computePatternStats(sector.id, sector.displayName, sector.etf, events));
  }

  // Active rotations (no stock performance for crypto tracker — keeps it lightweight)
  const activeEvents = allEvents
    .filter((e) => e.endDate === null)
    .sort((a, b) => b.signals.signalCount - a.signals.signalCount || b.etfPerformancePct - a.etfPerformancePct)
    .slice(0, 4);

  const activeRotations = activeEvents.map((event) => ({
    event,
    stocks: [], // No per-token chart fetching in tracker — use main rotation page for that
  }));

  // Recently ended (14 calendar days ≈ 10 trading days; crypto trades 24/7)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14);
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  const recentlyEndedRotations = allEvents.filter(
    (e) => e.endDate !== null && e.endDate >= cutoff
  );

  // Regime
  const cryptoRegime = classifyCryptoRegime(btcChart.closes, proxyReturns);
  const regime = {
    regime: cryptoRegime.regime as "RISK_ON" | "RISK_OFF" | "INFLATIONARY" | "MIXED",
    vix: cryptoRegime.btcVolatility,
    vixSlope: cryptoRegime.marketTrend === "rising" ? "falling" as const : cryptoRegime.marketTrend === "falling" ? "rising" as const : "flat" as const,
    yield10y: 0,
    dxy: 0,
    dxyTrend: "flat" as const,
    favoredSectors: cryptoRegime.favoredSectors,
    avoidSectors: cryptoRegime.avoidSectors,
  };

  const result: RotationTrackerResult = {
    calculatedAt: new Date().toISOString(),
    activeRotations,
    recentlyEndedRotations,
    patternStats: patternStats.sort((a, b) => b.totalRotations - a.totalRotations),
    allEvents,
    regime,
    pairSignals: null, // No pair signals for crypto
  };

  cachedResult = result;
  cacheTimestamp = Date.now();

  return result;
}
