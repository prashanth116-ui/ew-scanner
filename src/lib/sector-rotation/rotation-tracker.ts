/**
 * Sector Rotation Tracker — detection engine.
 * SERVER-ONLY: Used by /api/rotation-tracker route.
 *
 * Detects rotation inflection points using a multi-signal composite:
 *   1. RS Golden Cross (10d vs 30d SMA of ETF/SPY ratio)
 *   2. Volume Surge (daily volume > 1.5x 20d average)
 *   3. Price Breakout (close > 50d SMA)
 *
 * Rotation Start = first day where 2+ signals fire AND fewer than 2
 *   were true on each of the prior 5 days.
 * Rotation End = 3+ consecutive days where fewer than 2 signals are true.
 */

import "server-only";

import type {
  RotationSignalState,
  RotationEvent,
  RotationHealthSignals,
  RRGQuadrant,
  RotationStockPerformance,
  ActiveRotationDetail,
  RotationPatternStats,
  RotationTrackerResult,
  RegimeData,
  PairSignalData,
} from "./rotation-types";
import { fetchYahooChart, calcSMA, fetchBatchQuotes } from "@/lib/prerun/data";
import { SECTOR_UNIVERSE } from "@/data/sector-universe";
import { fetchMacroRegime } from "./regime";
import { computePairZScore } from "./pairs";

// ── Module-level cache (15 minutes) ──

let cachedResult: RotationTrackerResult | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

// ── SMA series computation ──

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

// ── Health signal computation (Acceleration, CMF, RRG Quadrant) ──

/** Change in 20d ROC over 6 bars — positive = momentum accelerating. */
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
  return rocSeries[rocSeries.length - 1] - rocSeries[rocSeries.length - 6];
}

/** Chaikin Money Flow over `period` bars — positive = buying pressure. */
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

/** RRG quadrant using JdK-standard Z-score + EMA methodology. */
function calcRRGQuadrant(
  sectorCloses: number[],
  spyCloses: number[]
): { quadrant: RRGQuadrant; rsRatio: number; rsMomentum: number } {
  const len = Math.min(sectorCloses.length, spyCloses.length);
  if (len < 31) return { quadrant: "LAGGING", rsRatio: 100, rsMomentum: 100 };

  const sc = sectorCloses.slice(-len);
  const sp = spyCloses.slice(-len);

  // Step 1: Raw RS
  const drs: number[] = [];
  for (let i = 0; i < len; i++) {
    drs.push(sp[i] !== 0 ? sc[i] / sp[i] : 0);
  }

  // Step 2: EMA smooth (period=10)
  const k = 2 / (10 + 1);
  const rsSmooth: number[] = [drs[0]];
  for (let i = 1; i < drs.length; i++) {
    rsSmooth.push(drs[i] * k + rsSmooth[i - 1] * (1 - k));
  }

  // Step 3: RS-Ratio = 100 + Z-score(rsSmooth, lookback)
  // Cap at 200 (not 250) to ensure valid Z-scores with ~252 trading days of data
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

  // Build RS-Ratio series (need last 11 values for ROC-10)
  const rsRatioSeries: number[] = [];
  const startIdx = Math.max(0, rsSmooth.length - 11);
  for (let i = startIdx; i < rsSmooth.length; i++) {
    rsRatioSeries.push(100 + zScoreAt(rsSmooth, i, lookback));
  }

  const rsRatio = rsRatioSeries[rsRatioSeries.length - 1];

  // Step 4: ROC of RS-Ratio (10-period)
  let roc = 0;
  if (rsRatioSeries.length >= 11) {
    const past = rsRatioSeries[rsRatioSeries.length - 11];
    roc = past !== 0 ? ((rsRatio - past) / past) * 100 : 0;
  }

  // Step 5: RS-Momentum — for the tracker we only need the final quadrant,
  // so we compute a full ROC series Z-score over available data
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

  // Step 6: Quadrant at (100, 100)
  let quadrant: RRGQuadrant;
  if (rsRatio >= 100 && rsMomentum >= 100) quadrant = "LEADING";
  else if (rsRatio >= 100 && rsMomentum < 100) quadrant = "WEAKENING";
  else if (rsRatio < 100 && rsMomentum < 100) quadrant = "LAGGING";
  else quadrant = "IMPROVING";

  return { quadrant, rsRatio, rsMomentum };
}

/** Compute health signals for a sector from its aligned bar data. */
function computeHealthSignals(aligned: AlignedBar[]): RotationHealthSignals {
  const closes = aligned.map((b) => b.etfClose);
  const highs = aligned.map((b) => b.etfHigh);
  const lows = aligned.map((b) => b.etfLow);
  const volumes = aligned.map((b) => b.etfVolume);
  const spyCloses = aligned.map((b) => b.spyClose);

  const acceleration = Math.round(calcAcceleration(closes) * 100) / 100;
  const cmf20 = Math.round(calcCMF(highs, lows, closes, volumes, 20) * 1000) / 1000;
  const { quadrant } = calcRRGQuadrant(closes, spyCloses);

  return { acceleration, cmf20, quadrant };
}

// ── RS series computation ──

interface AlignedBar {
  date: string; // YYYY-MM-DD
  timestamp: number;
  etfClose: number;
  etfHigh: number;
  etfLow: number;
  etfVolume: number;
  spyClose: number;
}

function alignSeries(
  etfCloses: number[],
  etfHighs: number[],
  etfLows: number[],
  etfVolumes: number[],
  etfTimestamps: number[],
  spyCloses: number[],
  spyTimestamps: number[]
): AlignedBar[] {
  const spyMap = new Map<number, number>();
  for (let i = 0; i < spyTimestamps.length; i++) {
    spyMap.set(spyTimestamps[i], spyCloses[i]);
  }

  const aligned: AlignedBar[] = [];
  for (let i = 0; i < etfTimestamps.length; i++) {
    const spyClose = spyMap.get(etfTimestamps[i]);
    if (spyClose !== undefined && spyClose !== 0 && etfCloses[i] !== 0) {
      const d = new Date(etfTimestamps[i] * 1000);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      aligned.push({
        date,
        timestamp: etfTimestamps[i],
        etfClose: etfCloses[i],
        etfHigh: etfHighs[i],
        etfLow: etfLows[i],
        etfVolume: etfVolumes[i],
        spyClose: spyClose,
      });
    }
  }
  return aligned;
}

// ── Daily signal computation ──

interface DailySignal {
  date: string;
  close: number;
  signals: RotationSignalState;
}

function computeDailySignals(aligned: AlignedBar[]): DailySignal[] {
  if (aligned.length < 50) return [];

  // Compute RS ratio series (ETF close / SPY close)
  const rsRatios = aligned.map((b) => b.etfClose / b.spyClose);
  const volumes = aligned.map((b) => b.etfVolume);
  const closes = aligned.map((b) => b.etfClose);

  // Compute SMAs
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

    // All SMAs must be available
    if (rs10 === null || rs30 === null || volAvg === null || sma50 === null) {
      continue;
    }

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

// ── Rotation event detection ──

function detectRotationEvents(
  sectorId: string,
  sectorName: string,
  etf: string,
  dailySignals: DailySignal[],
  health: RotationHealthSignals
): RotationEvent[] {
  if (dailySignals.length < 6) return [];

  const events: RotationEvent[] = [];
  let currentStart: number | null = null; // index into dailySignals
  let belowThresholdStreak = 0;

  for (let i = 5; i < dailySignals.length; i++) {
    const today = dailySignals[i];
    const isStrong = today.signals.signalCount >= 2;

    if (currentStart === null) {
      // Check if this is an inflection point: 2+ signals today,
      // but fewer than 2 on each of the prior 5 days
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
      // We're in a rotation — check for end condition
      if (!isStrong) {
        belowThresholdStreak++;
        if (belowThresholdStreak >= 3) {
          // Rotation ended 3 days ago
          const endIdx = i - 2;
          events.push(
            buildEvent(sectorId, sectorName, etf, dailySignals, currentStart, endIdx, health)
          );
          currentStart = null;
          belowThresholdStreak = 0;
        }
      } else {
        belowThresholdStreak = 0;
      }
    }
  }

  // If still in a rotation at the end of data, it's active
  if (currentStart !== null) {
    events.push(
      buildEvent(
        sectorId,
        sectorName,
        etf,
        dailySignals,
        currentStart,
        null, // active — no end
        health
      )
    );
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
  const perfPct =
    startDay.close !== 0
      ? ((endDay.close - startDay.close) / startDay.close) * 100
      : 0;

  // Build signal history for the rotation period
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

// ── RS Acceleration (stock vs sector ETF) ──

/**
 * Compute RS acceleration: how much a stock is gaining/losing ground
 * vs its sector ETF over recent days compared to the medium term.
 *
 * Formula: (stock_5d_return - etf_5d_return) - (stock_20d_return - etf_20d_return)
 * Positive = stock is catching up faster recently than over the medium term.
 * Returns 0 if fewer than 21 aligned data points.
 */
function computeRSAcceleration(stockCloses: number[], etfCloses: number[]): number {
  const len = Math.min(stockCloses.length, etfCloses.length);
  if (len < 21) return 0;

  const sNow = stockCloses[len - 1];
  const eNow = etfCloses[len - 1];
  const s5 = stockCloses[len - 6];
  const e5 = etfCloses[len - 6];
  const s20 = stockCloses[len - 21];
  const e20 = etfCloses[len - 21];

  if (s5 === 0 || e5 === 0 || s20 === 0 || e20 === 0) return 0;

  const stockReturn5d = ((sNow - s5) / s5) * 100;
  const etfReturn5d = ((eNow - e5) / e5) * 100;
  const stockReturn20d = ((sNow - s20) / s20) * 100;
  const etfReturn20d = ((eNow - e20) / e20) * 100;

  return (stockReturn5d - etfReturn5d) - (stockReturn20d - etfReturn20d);
}

/**
 * Compute RS acceleration shifted back 5 days — same formula as
 * computeRSAcceleration but using indices len-6..len-26 instead of len-1..len-21.
 * Requires len >= 26.
 */
function computeRSAccelerationPrior(stockCloses: number[], etfCloses: number[]): number {
  const len = Math.min(stockCloses.length, etfCloses.length);
  if (len < 26) return 0;

  const sNow = stockCloses[len - 6];
  const eNow = etfCloses[len - 6];
  const s5 = stockCloses[len - 11];
  const e5 = etfCloses[len - 11];
  const s20 = stockCloses[len - 26];
  const e20 = etfCloses[len - 26];

  if (sNow === 0 || eNow === 0 || s5 === 0 || e5 === 0 || s20 === 0 || e20 === 0) return 0;

  const stockReturn5d = ((sNow - s5) / s5) * 100;
  const etfReturn5d = ((eNow - e5) / e5) * 100;
  const stockReturn20d = ((sNow - s20) / s20) * 100;
  const etfReturn20d = ((eNow - e20) / e20) * 100;

  return (stockReturn5d - etfReturn5d) - (stockReturn20d - etfReturn20d);
}

/**
 * Count how many of the last 5 daily volumes exceed the 10-day average.
 * Returns 0-5.
 */
function computeVolumeConsistency(volumes: number[], avgVolume10d: number): number {
  if (volumes.length < 5 || avgVolume10d <= 0) return 0;
  let count = 0;
  for (let i = volumes.length - 5; i < volumes.length; i++) {
    if (volumes[i] > avgVolume10d) count++;
  }
  return count;
}

/** Check if a stock qualifies as a turnaround candidate. */
function checkTurnaroundCandidate(
  perfPct: number,
  sectorAvgPct: number,
  rsAccel: number,
  volumeVsAvg: number
): boolean {
  return (
    perfPct < sectorAvgPct && // currently lagging the sector
    rsAccel > 0.5 &&          // meaningful positive RS acceleration
    volumeVsAvg >= 0.8        // at least near-average volume
  );
}

// ── Stock performance for active rotations ──

async function fetchStockPerformance(
  sectorId: string,
  rotationStartDate: string,
  symbols: string[],
  names: Map<string, string>,
  batchQuotes: Map<string, { price: number; sma50: number | null; sma200: number | null; volume: number; avgVolume10d: number; dailyChangePct: number }>,
  etfCloses: number[],
  etfTimestamps: number[]
): Promise<RotationStockPerformance[]> {
  const results: RotationStockPerformance[] = [];
  const startTs = new Date(rotationStartDate).getTime() / 1000;

  // Build ETF timestamp→index map for RS acceleration alignment
  const etfTsMap = new Map<number, number>();
  for (let i = 0; i < etfTimestamps.length; i++) {
    etfTsMap.set(etfTimestamps[i], i);
  }

  // Pre-filter: only fetch charts for stocks that have valid batch quotes
  const quotedSymbols = symbols.filter((sym) => {
    const q = batchQuotes.get(sym);
    return q && q.price > 0;
  });

  // Fetch 6mo daily bars for each stock to find price at rotation start
  // Batch in groups of 15 with 200ms delays
  const batches: string[][] = [];
  for (let i = 0; i < quotedSymbols.length; i += 15) {
    batches.push(quotedSymbols.slice(i, i + 15));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const chartPromises = batch.map((sym) =>
      fetchYahooChart(sym, "6mo", "1d").catch(() => null)
    );
    const charts = await Promise.all(chartPromises);

    for (let j = 0; j < batch.length; j++) {
      const sym = batch[j];
      const chart = charts[j];
      const quote = batchQuotes.get(sym)!;

      if (!chart) continue;

      // Find closest trading day at or before rotation start date
      let priceAtStart: number | null = null;
      for (let k = chart.timestamps.length - 1; k >= 0; k--) {
        if (chart.timestamps[k] <= startTs + 86400) {
          // +1 day tolerance for timezone
          priceAtStart = chart.closes[k];
          break;
        }
      }

      if (priceAtStart === null || priceAtStart <= 0) continue;

      const perfPct = ((quote.price - priceAtStart) / priceAtStart) * 100;
      const aboveSma50 = quote.sma50 !== null ? quote.price > quote.sma50 : false;
      const volumeVsAvg =
        quote.avgVolume10d > 0
          ? Math.round((quote.volume / quote.avgVolume10d) * 100) / 100
          : 1;

      // Trend Accel: pctFromSma50 - pctFromSma200 (stock's own trend acceleration)
      const pctFromSma50 = quote.sma50 != null && quote.sma50 > 0
        ? ((quote.price - quote.sma50) / quote.sma50) * 100
        : null;
      const pctFromSma200 = quote.sma200 != null && quote.sma200 > 0
        ? ((quote.price - quote.sma200) / quote.sma200) * 100
        : null;
      const trendAccel = pctFromSma50 != null && pctFromSma200 != null
        ? Math.round((pctFromSma50 - pctFromSma200) * 100) / 100
        : null;

      // Align stock closes with ETF closes by matching timestamps for RS acceleration
      const alignedStockCloses: number[] = [];
      const alignedEtfCloses: number[] = [];
      for (let k = 0; k < chart.timestamps.length; k++) {
        const etfIdx = etfTsMap.get(chart.timestamps[k]);
        if (etfIdx !== undefined && chart.closes[k] > 0 && etfCloses[etfIdx] > 0) {
          alignedStockCloses.push(chart.closes[k]);
          alignedEtfCloses.push(etfCloses[etfIdx]);
        }
      }

      const rsAccel = computeRSAcceleration(alignedStockCloses, alignedEtfCloses);
      const rsAccelPrior = computeRSAccelerationPrior(alignedStockCloses, alignedEtfCloses);
      const rsDelta = rsAccel - rsAccelPrior;
      const volConsistency = computeVolumeConsistency(chart.volumes, quote.avgVolume10d);

      results.push({
        symbol: sym,
        name: names.get(sym) ?? sym,
        priceAtRotationStart: Math.round(priceAtStart * 100) / 100,
        priceNow: Math.round(quote.price * 100) / 100,
        performancePct: Math.round(perfPct * 100) / 100,
        aboveSma50,
        volumeVsAvg,
        rsAcceleration: Math.round(rsAccel * 100) / 100,
        trendAccel,
        dailyChangePct: Math.round(quote.dailyChangePct * 100) / 100,
        isTurnaroundCandidate: false, // set in second pass below
        daysToEarnings: null, // enriched client-side from prerun scan
        nextEarningsDate: null, // enriched client-side from prerun scan
        rs20d: null, // enriched client-side from prerun scan
        rsAccelPrior: Math.round(rsAccelPrior * 100) / 100,
        rsImproving: rsDelta > 0,
        rsDelta: Math.round(rsDelta * 100) / 100,
        volumeConsistency: volConsistency,
      });
    }

    // Delay between batches
    if (batchIdx < batches.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Sort by performance descending
  results.sort((a, b) => b.performancePct - a.performancePct);

  // Second pass: compute sector average and flag turnaround candidates
  if (results.length > 0) {
    const sectorAvgPct =
      results.reduce((sum, s) => sum + s.performancePct, 0) / results.length;
    for (const stock of results) {
      stock.isTurnaroundCandidate = checkTurnaroundCandidate(
        stock.performancePct,
        sectorAvgPct,
        stock.rsAcceleration,
        stock.volumeVsAvg
      );
    }
  }

  return results;
}

// ── Pattern statistics ──

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
    avgDurationDays:
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
    avgPerformancePct:
      perfs.length > 0
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

// ── Main entry point ──

export async function calculateRotationTracker(): Promise<RotationTrackerResult> {
  // Check cache
  if (cachedResult && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResult;
  }

  // 1. Fetch SPY chart, regime, and XLK chart in parallel
  const [spyChart, regimeData, xlkChart] = await Promise.all([
    fetchYahooChart("SPY", "1y", "1d"),
    fetchMacroRegime().catch(() => null),
    fetchYahooChart("XLK", "1y", "1d").catch(() => null),
  ]);
  if (!spyChart || spyChart.closes.length < 50) {
    throw new Error("Failed to fetch SPY benchmark data");
  }

  // 2. Fetch all 14 ETF charts in parallel
  const etfChartPromises = SECTOR_UNIVERSE.map((sector) =>
    fetchYahooChart(sector.etf, "1y", "1d")
      .then((chart) => ({ sectorId: sector.id, chart }))
      .catch(() => ({ sectorId: sector.id, chart: null }))
  );
  const etfCharts = await Promise.all(etfChartPromises);

  // 3. For each sector, compute signals and detect events
  const allEvents: RotationEvent[] = [];
  const patternStats: RotationPatternStats[] = [];

  for (const sector of SECTOR_UNIVERSE) {
    const chartEntry = etfCharts.find((c) => c.sectorId === sector.id);
    if (!chartEntry?.chart) continue;

    const chart = chartEntry.chart;

    // Align ETF and SPY timestamps
    const aligned = alignSeries(
      chart.closes,
      chart.highs,
      chart.lows,
      chart.volumes,
      chart.timestamps,
      spyChart.closes,
      spyChart.timestamps
    );

    if (aligned.length < 50) continue;

    // Compute daily signals
    const dailySignals = computeDailySignals(aligned);
    if (dailySignals.length < 6) continue;

    // Compute health signals (acceleration, CMF, RRG quadrant)
    const health = computeHealthSignals(aligned);

    // Detect rotation events
    const events = detectRotationEvents(
      sector.id,
      sector.displayName,
      sector.etf,
      dailySignals,
      health
    );

    allEvents.push(...events);
    patternStats.push(
      computePatternStats(sector.id, sector.displayName, sector.etf, events)
    );
  }

  // 4. Identify active rotations (still ongoing) — pick top 4 by signal strength
  const activeEvents = allEvents
    .filter((e) => e.endDate === null)
    .sort((a, b) => b.signals.signalCount - a.signals.signalCount || b.etfPerformancePct - a.etfPerformancePct)
    .slice(0, 4);

  // 5. Fetch stock-level performance for active rotations
  // First, collect all stock symbols we need quotes for
  const allStockSymbols: string[] = [];
  const allStockNames = new Map<string, string>();
  for (const event of activeEvents) {
    const sector = SECTOR_UNIVERSE.find((s) => s.id === event.sectorId);
    if (!sector) continue;
    for (const stock of sector.stocks) {
      if (!allStockSymbols.includes(stock.symbol)) {
        allStockSymbols.push(stock.symbol);
        allStockNames.set(stock.symbol, stock.name);
      }
    }
  }

  // Batch fetch current quotes
  const batchQuotes =
    allStockSymbols.length > 0
      ? await fetchBatchQuotes(allStockSymbols)
      : new Map();

  // Build active rotation details with stock performance
  const activeRotations: ActiveRotationDetail[] = [];
  for (const event of activeEvents) {
    const sector = SECTOR_UNIVERSE.find((s) => s.id === event.sectorId);
    if (!sector) continue;

    const sectorSymbols = sector.stocks.map((s) => s.symbol);
    const etfChartEntry = etfCharts.find((c) => c.sectorId === event.sectorId);
    const sectorEtfCloses = etfChartEntry?.chart?.closes ?? [];
    const sectorEtfTimestamps = etfChartEntry?.chart?.timestamps ?? [];
    const stocks = await fetchStockPerformance(
      event.sectorId,
      event.startDate,
      sectorSymbols,
      allStockNames,
      batchQuotes as Map<string, { price: number; sma50: number | null; sma200: number | null; volume: number; avgVolume10d: number; dailyChangePct: number }>,
      sectorEtfCloses,
      sectorEtfTimestamps
    );

    activeRotations.push({ event, stocks });
  }

  // 6. Recently ended rotations (ended within last 10 trading days)
  const lastSignalDate = allEvents.length > 0
    ? allEvents
        .filter((e) => e.endDate !== null)
        .map((e) => e.endDate!)
        .sort()
        .pop()
    : null;

  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 14); // ~10 trading days
  const cutoff = tenDaysAgo.toISOString().slice(0, 10);

  const recentlyEndedRotations = allEvents.filter(
    (e) => e.endDate !== null && e.endDate >= cutoff
  );

  // 7. Compute pair z-scores from already-fetched ETF data
  const xlyChartEntry = etfCharts.find((c) => c.sectorId === "consumer-discretionary");
  const xlpChartEntry = etfCharts.find((c) => c.sectorId === "consumer-staples");
  const xluChartEntry = etfCharts.find((c) => c.sectorId === "utilities");

  let pairSignals: RotationTrackerResult["pairSignals"] = null;
  const xlyXlpRaw =
    xlyChartEntry?.chart && xlpChartEntry?.chart
      ? computePairZScore(xlyChartEntry.chart.closes, xlpChartEntry.chart.closes, "XLY/XLP")
      : null;
  const xlkXluRaw =
    xlkChart && xluChartEntry?.chart
      ? computePairZScore(xlkChart.closes, xluChartEntry.chart.closes, "XLK/XLU")
      : null;

  if (xlyXlpRaw || xlkXluRaw) {
    const mapPair = (p: typeof xlyXlpRaw): PairSignalData | null =>
      p ? { pair: p.pair, zScore: p.zScore, isExtreme: p.isExtreme, signal: p.signal } : null;
    pairSignals = { xlyXlp: mapPair(xlyXlpRaw), xlkXlu: mapPair(xlkXluRaw) };
  }

  // 8. Map regime to client-safe shape
  const regime: RegimeData | null = regimeData
    ? {
        regime: regimeData.regime,
        vix: regimeData.vix,
        vixSlope: regimeData.vixSlope,
        yield10y: regimeData.yield10y,
        dxy: regimeData.dxy,
        dxyTrend: regimeData.dxyTrend,
        favoredSectors: regimeData.favoredSectors,
        avoidSectors: regimeData.avoidSectors,
      }
    : null;

  const result: RotationTrackerResult = {
    calculatedAt: new Date().toISOString(),
    activeRotations,
    recentlyEndedRotations,
    patternStats: patternStats.sort((a, b) => b.totalRotations - a.totalRotations),
    allEvents,
    regime,
    pairSignals,
  };

  // Cache the result
  cachedResult = result;
  cacheTimestamp = Date.now();

  return result;
}
