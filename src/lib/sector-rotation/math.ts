/**
 * Pure math functions for sector rotation scoring.
 * Asset-agnostic: operates on number[] arrays.
 * Used by both equity (sector-rotation.ts) and crypto rotation engines.
 */

import "server-only";

import { calcSMA } from "@/lib/prerun/data";
import { SCORING_SIGNALS } from "./config";

import type { RRGQuadrant } from "./types";

// ── Rate of Change ──

export function calcROC(closes: number[], period: number): number {
  if (closes.length < period + 1) return 0;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  if (!past || past === 0) return 0;
  return ((current - past) / past) * 100;
}

export function calcMomentumComposite(closes: number[]): number {
  const roc63 = calcROC(closes, 63);
  const roc126 = calcROC(closes, 126);
  const roc189 = calcROC(closes, 189);
  const roc252 = calcROC(closes, 252);
  const w = SCORING_SIGNALS.MOMENTUM_WEIGHTS;
  return w.roc63 * roc63 + w.roc126 * roc126 + w.roc189 * roc189 + w.roc252 * roc252;
}

// ── Acceleration ──

export function calcAcceleration(closes: number[]): number {
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
  // Simple difference (change in ROC) — avoids near-zero denominator amplification
  return current - past;
}

// ── Mansfield Relative Strength ──

export function calcMansfieldRS(sectorCloses: number[], benchmarkCloses: number[]): number {
  const len = Math.min(sectorCloses.length, benchmarkCloses.length);
  if (len < 201) return 0;
  const sc = sectorCloses.slice(-len);
  const sp = benchmarkCloses.slice(-len);

  const drs: number[] = [];
  for (let i = 0; i < len; i++) {
    drs.push(sp[i] !== 0 ? sc[i] / sp[i] : 0);
  }

  const sma200 = calcSMA(drs, 200) ?? 0;
  if (sma200 === 0) return 0;
  const result = 100 * (drs[drs.length - 1] / sma200 - 1);
  return isFinite(result) ? result : 0;
}

// ── Chaikin Money Flow ──

export function calcCMF(
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
 * Optimized: precomputes MFV and volume arrays once, then uses sliding window sums.
 */
export function calcRollingCMFPositiveCount(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  period: number,
  lookback: number
): number {
  const len = Math.min(highs.length, lows.length, closes.length, volumes.length);
  if (len < period + lookback) return 0;

  // Precompute MFV (money flow volume) for each bar once
  const mfv = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const hl = highs[i] - lows[i];
    const mfm = hl !== 0 ? ((closes[i] - lows[i]) - (highs[i] - closes[i])) / hl : 0;
    mfv[i] = mfm * volumes[i];
  }

  // Compute initial window sums for the most recent position
  const startEnd = len;
  let mfvSum = 0;
  let volSum = 0;
  for (let i = startEnd - period; i < startEnd; i++) {
    mfvSum += mfv[i];
    volSum += volumes[i];
  }

  let positiveCount = 0;
  if (volSum !== 0 && mfvSum / volSum > 0) positiveCount++;

  // Slide the window backwards for remaining lookback positions
  for (let offset = 1; offset < lookback; offset++) {
    const end = len - offset;
    if (end < period) break;
    // Remove bar that just left the window (was at `end`), add bar entering at `end - period`
    mfvSum = mfvSum - mfv[end] + mfv[end - period];
    volSum = volSum - volumes[end] + volumes[end - period];
    if (volSum !== 0 && mfvSum / volSum > 0) positiveCount++;
  }
  return positiveCount;
}

// ── On-Balance Volume ──

export function calcOBVSlope(closes: number[], volumes: number[], lookback = 20): -1 | 0 | 1 {
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

  if (normalizedSlope > SCORING_SIGNALS.OBV_SLOPE_THRESHOLD) return 1;
  if (normalizedSlope < -SCORING_SIGNALS.OBV_SLOPE_THRESHOLD) return -1;
  return 0;
}

// ── EMA & Z-Score ──

/** EMA of a number array. Returns array of same length. */
export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

/** Rolling Z-score: (value - rolling_mean) / rolling_stddev. Returns 0 for insufficient data. */
export function rollingZScore(values: number[], lookback: number): number[] {
  const result: number[] = new Array(values.length).fill(0);
  for (let i = lookback - 1; i < values.length; i++) {
    const window = values.slice(i - lookback + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
    const std = Math.sqrt(variance);
    result[i] = std > 0 ? (values[i] - mean) / std : 0;
  }
  return result;
}

// ── Relative Rotation Graph ──

export function calcRRG(
  sectorCloses: number[],
  benchmarkCloses: number[]
): { rsRatio: number; rsMomentum: number; quadrant: RRGQuadrant; trail: { rsRatio: number; rsMomentum: number }[] } {
  const len = Math.min(sectorCloses.length, benchmarkCloses.length);
  if (len < 31) return { rsRatio: 100, rsMomentum: 100, quadrant: "LAGGING", trail: [] };

  const sc = sectorCloses.slice(-len);
  const sp = benchmarkCloses.slice(-len);

  // Step 1: Raw RS ratio (sector / benchmark)
  const drs: number[] = [];
  for (let i = 0; i < len; i++) {
    drs.push(sp[i] !== 0 ? sc[i] / sp[i] : 0);
  }

  // Step 2: EMA smooth (period=10)
  const rsSmooth = ema(drs, 10);

  // Step 3: RS-Ratio = 100 + Z-score(rsSmooth, lookback)
  // Cap at 200. Subtract 20 (not 30): trail max offset is 20 (line 268), so 20 is the minimum safe margin.
  const lookback = Math.min(200, drs.length - 20);
  if (lookback < 20) return { rsRatio: 100, rsMomentum: 100, quadrant: "LAGGING", trail: [] };
  const rsRatioSeries = rollingZScore(rsSmooth, lookback).map((z) => 100 + z);

  // Step 4: ROC of RS-Ratio (10-period)
  const rocSeries: number[] = new Array(rsRatioSeries.length).fill(0);
  for (let i = 10; i < rsRatioSeries.length; i++) {
    const past = rsRatioSeries[i - 10];
    rocSeries[i] = past !== 0 ? ((rsRatioSeries[i] - past) / past) * 100 : 0;
  }

  // Step 5: RS-Momentum = 100 + Z-score(ROC, lookback)
  const rsMomentumSeries = rollingZScore(rocSeries, lookback).map((z) => 100 + z);

  // Current position
  const rsRatio = rsRatioSeries[rsRatioSeries.length - 1];
  const rsMomentum = rsMomentumSeries[rsMomentumSeries.length - 1];

  // Step 6: Quadrant classification at (100, 100) with dead zone.
  // Sectors near the center oscillate between quadrants on daily noise.
  // When both axes are within ±0.5 of 100, use momentum as the tiebreaker
  // since momentum leads ratio in the RRG cycle.
  let quadrant: RRGQuadrant;
  const dz = SCORING_SIGNALS.RRG_DEAD_ZONE;
  const rInBand = Math.abs(rsRatio - 100) < dz;
  const mInBand = Math.abs(rsMomentum - 100) < dz;

  if (rInBand && mInBand) {
    // Both axes in dead zone — bias toward momentum-positive quadrants
    quadrant = rsMomentum >= 100 ? "IMPROVING" : "LAGGING";
  } else if (rsRatio >= 100 && rsMomentum >= 100) {
    quadrant = "LEADING";
  } else if (rsRatio >= 100 && rsMomentum < 100) {
    quadrant = "WEAKENING";
  } else if (rsRatio < 100 && rsMomentum < 100) {
    quadrant = "LAGGING";
  } else {
    quadrant = "IMPROVING";
  }

  // Step 7: Trail — 5 snapshots at offsets [20, 15, 10, 5, 0] from end
  const trail: { rsRatio: number; rsMomentum: number }[] = [];
  for (const offset of [20, 15, 10, 5, 0]) {
    const idx = rsRatioSeries.length - 1 - offset;
    if (idx >= 0) {
      trail.push({
        rsRatio: rsRatioSeries[idx],
        rsMomentum: rsMomentumSeries[idx],
      });
    }
  }

  return { rsRatio, rsMomentum, quadrant, trail };
}

/**
 * Rotation velocity: total Euclidean distance between consecutive RRG trail points.
 * Higher = faster sector rotation movement. Trail has 5 points (oldest first).
 */
export function calcRotationVelocity(trail: { rsRatio: number; rsMomentum: number }[]): number {
  if (trail.length < 2) return 0;
  let totalDist = 0;
  for (let i = 1; i < trail.length; i++) {
    const dx = trail[i].rsRatio - trail[i - 1].rsRatio;
    const dy = trail[i].rsMomentum - trail[i - 1].rsMomentum;
    totalDist += Math.sqrt(dx * dx + dy * dy);
  }
  return Math.round(totalDist * 100) / 100;
}

// ── Normalization helpers ──

export function percentileRank(values: number[], target: number): number {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < target).length;
  const equal = sorted.filter((v) => v === target).length;
  // Standard statistical rank: count below + half of ties.
  // Without this, identical scores all rank at 0th percentile.
  return ((below + equal / 2) / sorted.length) * 100;
}

export function clampNormalize(value: number, min: number, max: number): number {
  if (max === min) return 50;
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
