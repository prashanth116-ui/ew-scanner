/**
 * Squeeze scoring module tests.
 * Covers SI trend slope, float tiering, FTD edge cases, volume ratio.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  computeSITrend,
  normalizeSiPercent,
  computeSqueezeScore,
  isSqueezeAlignedWavePosition,
  scoreVolumeAcceleration,
} from "./squeeze-scoring";
import type { SqueezeData } from "./ew-types";

// ── Helper ──

function makeSqueezeData(overrides: Partial<SqueezeData> = {}): SqueezeData {
  return {
    ticker: "TEST",
    name: "Test Corp",
    shortPercentOfFloat: 0.15,
    shortRatio: 5,
    sharesShort: 1_000_000,
    floatShares: 10_000_000,
    sharesOutstanding: 50_000_000,
    dateShortInterest: 1700000000,
    currentVolume: 2_000_000,
    avgVolume3Month: 1_000_000,
    currentPrice: 50,
    marketCap: 2_500_000_000,
    fiftyTwoWeekLow: 40,
    fiftyTwoWeekHigh: 80,
    heldPercentInsiders: 0.05,
    heldPercentInstitutions: 0.65,
    sma50: 48,
    ...overrides,
  };
}

// ── SI Trend (Linear Regression) ──

describe("computeSITrend", () => {
  it("returns flat for single value", () => {
    const result = computeSITrend([10]);
    expect(result.direction).toBe("flat");
    expect(result.adjustment).toBe(0);
  });

  it("returns flat for two identical values", () => {
    const result = computeSITrend([10, 10]);
    expect(result.direction).toBe("flat");
    expect(result.adjustment).toBe(0);
  });

  it("returns up for clearly increasing values", () => {
    const result = computeSITrend([10, 12, 15]);
    expect(result.direction).toBe("up");
    expect(result.adjustment).toBe(5);
  });

  it("returns down for clearly decreasing values", () => {
    const result = computeSITrend([15, 12, 10]);
    expect(result.direction).toBe("down");
    expect(result.adjustment).toBe(-5);
  });

  it("handles outlier smoothing with 3 points (linear regression)", () => {
    // [10, 50, 12] — single outlier at index 1
    // Endpoint diff: 12 - 10 = 2 (flat)
    // Linear regression slope: should be closer to flat because of the outlier
    const result = computeSITrend([10, 50, 12]);
    // Slope via least squares: n=3, sumX=3, sumY=72, sumXY=74, sumX2=5
    // slope = (3*74 - 3*72) / (3*5 - 9) = (222-216)/(15-9) = 6/6 = 1
    // 1 is not > 1, so should be flat
    expect(result.direction).toBe("flat");
  });

  it("detects trend despite noise with 3 points", () => {
    // [5, 8, 12] — clear uptrend even with regression
    const result = computeSITrend([5, 8, 12]);
    expect(result.direction).toBe("up");
  });

  it("falls back to endpoint difference for 2 points", () => {
    const result = computeSITrend([10, 15]);
    expect(result.direction).toBe("up");
    expect(result.adjustment).toBe(5);
  });

  it("returns flat for small changes (<= 1 slope)", () => {
    const result = computeSITrend([10, 10.5, 11]);
    expect(result.direction).toBe("flat");
  });

  it("handles empty array", () => {
    const result = computeSITrend([]);
    expect(result.direction).toBe("flat");
    expect(result.adjustment).toBe(0);
  });
});

// ── SI% Normalization ──

describe("normalizeSiPercent", () => {
  it("returns 0 for null or zero", () => {
    expect(normalizeSiPercent(null)).toBe(0);
    expect(normalizeSiPercent(0)).toBe(0);
    expect(normalizeSiPercent(undefined)).toBe(0);
  });

  it("converts decimal to percentage (0.15 → 15)", () => {
    expect(normalizeSiPercent(0.15)).toBe(15);
  });

  it("keeps already-percentage values (15 → 15)", () => {
    expect(normalizeSiPercent(15)).toBe(15);
  });

  it("handles negative values", () => {
    expect(normalizeSiPercent(-5)).toBe(0);
  });
});

// ── Float Size Tiering ──

describe("computeSqueezeScore - float tiering", () => {
  it("scores higher for micro-float (<10M shares)", () => {
    const microFloat = makeSqueezeData({ floatShares: 5_000_000 });
    const largeFloat = makeSqueezeData({ floatShares: 200_000_000 });

    const micro = computeSqueezeScore(microFloat);
    const large = computeSqueezeScore(largeFloat);

    expect(micro.components.floatSize).toBe(15);
    expect(large.components.floatSize).toBe(0);
  });

  it("handles null float shares", () => {
    const data = makeSqueezeData({ floatShares: null });
    const result = computeSqueezeScore(data);
    expect(result.components.floatSize).toBe(0);
  });

  it("handles zero float shares", () => {
    const data = makeSqueezeData({ floatShares: 0 });
    const result = computeSqueezeScore(data);
    expect(result.components.floatSize).toBe(0);
  });
});

// ── FTD Edge Cases ──

describe("computeSqueezeScore - FTD pressure", () => {
  it("scores 15 for extreme FTD (>= 1% of float)", () => {
    const data = makeSqueezeData({
      ftdShares: 150_000,  // 1.5% of 10M float
      floatShares: 10_000_000,
    });
    const result = computeSqueezeScore(data);
    expect(result.components.ftdPressure).toBe(15);
  });

  it("scores 0 for no FTD data", () => {
    const data = makeSqueezeData({ ftdShares: undefined });
    const result = computeSqueezeScore(data);
    expect(result.components.ftdPressure).toBe(0);
  });

  it("scores 0 when float is null (division protection)", () => {
    const data = makeSqueezeData({ ftdShares: 10000, floatShares: null });
    const result = computeSqueezeScore(data);
    expect(result.components.ftdPressure).toBe(0);
  });

  it("scores 0 when float is zero (division protection)", () => {
    const data = makeSqueezeData({ ftdShares: 10000, floatShares: 0 });
    const result = computeSqueezeScore(data);
    expect(result.components.ftdPressure).toBe(0);
  });
});

// ── Volume Ratio ──

describe("computeSqueezeScore - volume surge", () => {
  it("scores higher for volume surge", () => {
    const highVol = makeSqueezeData({
      currentVolume: 5_000_000,
      avgVolume3Month: 1_000_000,
    });
    const lowVol = makeSqueezeData({
      currentVolume: 500_000,
      avgVolume3Month: 1_000_000,
    });

    const high = computeSqueezeScore(highVol);
    const low = computeSqueezeScore(lowVol);

    expect(high.components.volumeSurge).toBeGreaterThan(low.components.volumeSurge);
  });

  it("handles zero avg volume", () => {
    const data = makeSqueezeData({ currentVolume: 1000, avgVolume3Month: 0 });
    const result = computeSqueezeScore(data);
    expect(result.components.volumeSurge).toBe(0);
  });

  it("handles null volumes", () => {
    const data = makeSqueezeData({ currentVolume: null, avgVolume3Month: null });
    const result = computeSqueezeScore(data);
    expect(result.components.volumeSurge).toBe(0);
  });
});

// ── Near 52wk Low ──

describe("computeSqueezeScore - near 52wk low", () => {
  it("scores 15 for at 52wk low when above SMA50", () => {
    const data = makeSqueezeData({
      currentPrice: 41,
      fiftyTwoWeekLow: 40,
      sma50: 38,  // price above SMA50, no penalty
    });
    const result = computeSqueezeScore(data);
    expect(result.components.near52wLow).toBe(15);
  });

  it("applies base-forming penalty when near low but below SMA50", () => {
    const data = makeSqueezeData({
      currentPrice: 41,
      fiftyTwoWeekLow: 40,
      sma50: 50,  // price well below SMA50
    });
    // Price 41 is 2.5% above low → 15 score, but 41 < 50 SMA → penalty → 10
    const result = computeSqueezeScore(data);
    expect(result.components.near52wLow).toBe(10);
  });
});

// ── Tier Classification ──

describe("computeSqueezeScore - tier", () => {
  it("classifies high tier for score >= 65", () => {
    const data = makeSqueezeData({
      shortPercentOfFloat: 0.40,  // 40% SI → max SI score
      shortRatio: 15,             // high days to cover
      floatShares: 5_000_000,     // micro float
      currentVolume: 5_000_000,   // high volume
      avgVolume3Month: 1_000_000,
      currentPrice: 41,
      fiftyTwoWeekLow: 40,
      sma50: 38,
      siTrend: "up",
    });
    const result = computeSqueezeScore(data);
    expect(result.tier).toBe("high");
  });

  it("classifies low tier for minimal data", () => {
    const data = makeSqueezeData({
      shortPercentOfFloat: 0.01,
      shortRatio: 0.5,
      floatShares: 500_000_000,
      currentVolume: 100_000,
      avgVolume3Month: 1_000_000,
      currentPrice: 200,
      fiftyTwoWeekLow: 100,
    });
    const result = computeSqueezeScore(data);
    expect(result.tier).toBe("low");
  });
});

// ── SI Trend Adjustment Integration ──

describe("computeSqueezeScore - SI trend adjustment", () => {
  it("adds 5 for upward SI trend", () => {
    const base = makeSqueezeData({ siTrend: undefined });
    const up = makeSqueezeData({ siTrend: "up" });

    const baseScore = computeSqueezeScore(base);
    const upScore = computeSqueezeScore(up);

    expect(upScore.squeezeScore).toBe(baseScore.squeezeScore + 5);
  });

  it("subtracts 5 for downward SI trend", () => {
    const base = makeSqueezeData({ siTrend: undefined });
    const down = makeSqueezeData({ siTrend: "down" });

    const baseScore = computeSqueezeScore(base);
    const downScore = computeSqueezeScore(down);

    expect(downScore.squeezeScore).toBe(Math.max(0, baseScore.squeezeScore - 5));
  });
});

// ── Wave Position Alignment ──

describe("isSqueezeAlignedWavePosition", () => {
  it("returns true for wave 2", () => {
    expect(isSqueezeAlignedWavePosition("wave 2")).toBe(true);
  });

  it("returns true for wave c", () => {
    expect(isSqueezeAlignedWavePosition("Wave C correction")).toBe(true);
  });

  it("returns false for wave 3 (impulse)", () => {
    expect(isSqueezeAlignedWavePosition("wave 3")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isSqueezeAlignedWavePosition(undefined)).toBe(false);
  });
});

// ── Volume Acceleration ──

describe("scoreVolumeAcceleration", () => {
  it("returns 0 for insufficient data", () => {
    const result = scoreVolumeAcceleration([100, 200, 300]);
    expect(result.score).toBe(0);
    expect(result.result).toBeNull();
  });

  it("returns 0 for undefined input", () => {
    const result = scoreVolumeAcceleration(undefined);
    expect(result.score).toBe(0);
  });
});
