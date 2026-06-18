import { describe, it, expect, vi } from "vitest";

// Mock server-only so we can import pure functions from data.ts in tests
vi.mock("server-only", () => ({}));

import { scoreA, scoreB, scoreD, scoreE, scoreF, scoreH, scoreI, scoreJ, scoreK, scoreM2, calcSectorModifier, scorePreRun, autoScorePreRun } from "./scoring";
import { calcDisplacementAndFVG } from "./data";
import type { PreRunStockData } from "./types";

/** Helper: create a minimal PreRunStockData with overrides. */
function makeData(overrides: Partial<PreRunStockData> = {}): PreRunStockData {
  return {
    ticker: "TEST",
    companyName: "Test Corp",
    currentPrice: 10,
    high52w: 50,
    low52w: 8,
    pctFromAth: 80,
    marketCap: 5_000_000_000,
    shortFloat: 18,
    nextEarningsDate: null,
    daysToEarnings: null,
    revenueGrowthYoY: 0,
    analystCount: 5,
    sma20: 10.5,
    avgVolumeUpDays: 1_500_000,
    avgVolumeDownDays: 1_000_000,
    allTimeHigh: 50,
    weeksInBase: 26,
    institutionalPct: null,
    insiderBuys90d: null,
    putCallRatio: null,
    callVolume: null,
    putVolume: null,
    relativeStrength20d: null,
    sectorReturn20d: null,
    pctFromBaseHigh: null,
    floatShares: null,
    floatTurnover20d: null,
    obvDivergent: null,
    obvPctFromHigh: null,
    pricePctFromHigh20d: null,
    vpDivergenceBullish: null,
    quarterlyRevenue: null,
    earningsBeatStreak: null,
    higherLowsCount: null,
    aboveEma21: null,
    aboveEma50: null,
    emaCrossoverWithin20d: null,
    emaM2Ema10: null,
    emaM2Ema20: null,
    emaM2BullishCross: null,
    emaM2CrossedWithin5Bars: null,
    emaM2PriceAboveBoth: null,
    emaM2SpreadPct: null,
    emaM2TrendStrength: null,
    emaM2BarsSinceCross: null,
    emaM2DataPoints: null,
    emaM2DisplacementNearCross: null,
    emaM2FvgNearCross: null,
    emaM2Timeframe: null,
    closesNearRangeTop: null,
    atrContracting: null,
    failedBreakdownRecovery: null,
    analystRevisionTrend: null,
    // VCP fields
    vcpSma50: null,
    vcpSma200: null,
    vcpSma10: null,
    vcpAvgVolume50d: null,
    vcpAvgVolume10d: null,
    vcpAvgDollarVolume: null,
    vcpDistFromSma50Pct: null,
    vcpDistFromSma200Pct: null,
    vcpAtrPct: null,
    vcpRange5d: null,
    vcpRange10d: null,
    vcpRange20d: null,
    vcpTightCloses: null,
    vcpInsideBarCount: null,
    vcpDryVolumeDays: null,
    vcpPivotHigh: null,
    vcpRelStrengthVsSPY: null,
    vcpAtrMultipleAbove50: null,
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

// ── Score A: Dead money base ──

describe("scoreA", () => {
  it("returns 2 for deep discount + long base (40%+ / 13+ weeks)", () => {
    expect(scoreA(makeData({ pctFromAth: 60, weeksInBase: 20 }))).toBe(2);
    expect(scoreA(makeData({ pctFromAth: 40, weeksInBase: 13 }))).toBe(2);
  });

  it("returns 1 for moderate discount + moderate base (25%+ / 8+ weeks)", () => {
    expect(scoreA(makeData({ pctFromAth: 30, weeksInBase: 10 }))).toBe(1);
    expect(scoreA(makeData({ pctFromAth: 25, weeksInBase: 8 }))).toBe(1);
  });

  it("returns 1 for deep discount + no basing time (floor rule)", () => {
    expect(scoreA(makeData({ pctFromAth: 60, weeksInBase: 0 }))).toBe(1);
    expect(scoreA(makeData({ pctFromAth: 40, weeksInBase: 2 }))).toBe(1);
  });

  it("returns 0 for shallow discount regardless of time", () => {
    expect(scoreA(makeData({ pctFromAth: 20, weeksInBase: 52 }))).toBe(0);
    expect(scoreA(makeData({ pctFromAth: 10, weeksInBase: 100 }))).toBe(0);
  });

  it("handles null values (defaults to 0)", () => {
    expect(scoreA(makeData({ pctFromAth: null, weeksInBase: null }))).toBe(0);
    expect(scoreA(makeData({ pctFromAth: 60, weeksInBase: null }))).toBe(1);
    expect(scoreA(makeData({ pctFromAth: null, weeksInBase: 26 }))).toBe(0);
  });

  it("applies time decay for bases > 104 weeks", () => {
    // raw=2, 2 * 0.5 = 1 (floored)
    expect(scoreA(makeData({ pctFromAth: 60, weeksInBase: 130 }))).toBe(1);
    // pct=40 + weeks=110 → raw=2 (first branch), then 2 * 0.5 = 1
    expect(scoreA(makeData({ pctFromAth: 40, weeksInBase: 110 }))).toBe(1);
    // pct=30 + weeks=110 → raw=1 (second branch), then 1 * 0.5 = 0
    expect(scoreA(makeData({ pctFromAth: 30, weeksInBase: 110 }))).toBe(0);
  });
});

// ── Score B: Short interest (expanded 0-3) ──

describe("scoreB", () => {
  it("returns 3 for extreme SI + small cap (≥20%)", () => {
    expect(scoreB(makeData({ shortFloat: 25, marketCap: 5_000_000_000 }))).toBe(3);
    expect(scoreB(makeData({ shortFloat: 20, marketCap: 19_000_000_000 }))).toBe(3);
  });

  it("returns 2 for high SI + small cap (15-20%)", () => {
    expect(scoreB(makeData({ shortFloat: 15, marketCap: 5_000_000_000 }))).toBe(2);
    expect(scoreB(makeData({ shortFloat: 18, marketCap: 19_000_000_000 }))).toBe(2);
  });

  it("returns 1 for moderate SI (5-14%)", () => {
    expect(scoreB(makeData({ shortFloat: 10, marketCap: 50_000_000_000 }))).toBe(1);
    expect(scoreB(makeData({ shortFloat: 5, marketCap: 1_000_000_000 }))).toBe(1);
  });

  it("returns 0 for low SI (<5%)", () => {
    expect(scoreB(makeData({ shortFloat: 4, marketCap: 5_000_000_000 }))).toBe(0);
    expect(scoreB(makeData({ shortFloat: 0 }))).toBe(0);
  });
});

// ── Score D: Earnings inflection ──

describe("scoreD", () => {
  it("returns 2 for strong revenue growth + near earnings (<=30d)", () => {
    expect(scoreD(makeData({ revenueGrowthYoY: 25, daysToEarnings: 30 }))).toBe(2);
    expect(scoreD(makeData({ revenueGrowthYoY: 50, daysToEarnings: 20 }))).toBe(2);
  });

  it("returns 3 for imminent earnings + strong fundamentals", () => {
    expect(scoreD(makeData({ revenueGrowthYoY: 25, daysToEarnings: 10, earningsBeatStreak: 2 }))).toBe(3);
    expect(scoreD(makeData({ daysToEarnings: 7, earningsBeatStreak: 3 }))).toBe(3);
  });

  it("returns 1 for strong revenue growth + earnings >30d (earningsSoon)", () => {
    expect(scoreD(makeData({ revenueGrowthYoY: 50, daysToEarnings: 60 }))).toBe(1);
  });

  it("returns 1 for positive revenue growth without near earnings", () => {
    expect(scoreD(makeData({ revenueGrowthYoY: 10, daysToEarnings: null }))).toBe(1);
    expect(scoreD(makeData({ revenueGrowthYoY: 5, daysToEarnings: 90 }))).toBe(1);
  });

  it("returns 1 for near earnings without revenue growth", () => {
    expect(scoreD(makeData({ revenueGrowthYoY: 0, daysToEarnings: 30 }))).toBe(1);
    expect(scoreD(makeData({ revenueGrowthYoY: -5, daysToEarnings: 14 }))).toBe(1);
  });

  it("returns 1 for beat streak ≥2 without other signals", () => {
    expect(scoreD(makeData({ revenueGrowthYoY: 0, daysToEarnings: null, earningsBeatStreak: 3 }))).toBe(1);
  });

  it("returns 0 for no growth and no near earnings", () => {
    expect(scoreD(makeData({ revenueGrowthYoY: 0, daysToEarnings: null }))).toBe(0);
    expect(scoreD(makeData({ revenueGrowthYoY: -10, daysToEarnings: 90 }))).toBe(0);
  });
});

// ── Score E: Institutional under-ownership ──

describe("scoreE", () => {
  it("returns 2 for low institutional ownership (< 40%)", () => {
    expect(scoreE(makeData({ institutionalPct: 15 }))).toBe(2);
    expect(scoreE(makeData({ institutionalPct: 39.9 }))).toBe(2);
  });

  it("returns 1 for moderate institutional ownership (40-70%)", () => {
    expect(scoreE(makeData({ institutionalPct: 40 }))).toBe(1);
    expect(scoreE(makeData({ institutionalPct: 55 }))).toBe(1);
    expect(scoreE(makeData({ institutionalPct: 70 }))).toBe(1);
  });

  it("returns 0 for high institutional ownership (> 70%)", () => {
    expect(scoreE(makeData({ institutionalPct: 71 }))).toBe(0);
    expect(scoreE(makeData({ institutionalPct: 95 }))).toBe(0);
  });

  it("falls back to analyst count when institutionalPct is null", () => {
    expect(scoreE(makeData({ institutionalPct: null, analystCount: 5 }))).toBe(2);
    expect(scoreE(makeData({ institutionalPct: null, analystCount: 15 }))).toBe(1);
    expect(scoreE(makeData({ institutionalPct: null, analystCount: 25 }))).toBe(0);
    expect(scoreE(makeData({ institutionalPct: null, analystCount: 0 }))).toBe(1);
  });
});

// ── Score F: Volume accumulation ──

describe("scoreF", () => {
  it("returns 2 for strong accumulation (ratio >= 1.3)", () => {
    expect(scoreF(makeData({ avgVolumeUpDays: 2_000_000, avgVolumeDownDays: 1_000_000 }))).toBe(2);
    expect(scoreF(makeData({ avgVolumeUpDays: 1_300_000, avgVolumeDownDays: 1_000_000 }))).toBe(2);
  });

  it("returns 2 for ratio 1.0-1.3 with high float turnover", () => {
    expect(scoreF(makeData({ avgVolumeUpDays: 1_100_000, avgVolumeDownDays: 1_000_000, floatTurnover20d: 1.5 }))).toBe(2);
  });

  it("returns 1 for neutral volume (ratio 1.0-1.3, no float turnover)", () => {
    expect(scoreF(makeData({ avgVolumeUpDays: 1_100_000, avgVolumeDownDays: 1_000_000 }))).toBe(1);
    expect(scoreF(makeData({ avgVolumeUpDays: 1_000_000, avgVolumeDownDays: 1_000_000 }))).toBe(1);
  });

  it("returns 0 for distribution (ratio < 1.0)", () => {
    expect(scoreF(makeData({ avgVolumeUpDays: 800_000, avgVolumeDownDays: 1_000_000 }))).toBe(0);
    expect(scoreF(makeData({ avgVolumeUpDays: 0, avgVolumeDownDays: 1_000_000 }))).toBe(0);
  });

  it("returns 2 when up volume exists but down volume is 0", () => {
    expect(scoreF(makeData({ avgVolumeUpDays: 1_000_000, avgVolumeDownDays: 0 }))).toBe(2);
  });

  it("returns 0 when both volumes are 0", () => {
    expect(scoreF(makeData({ avgVolumeUpDays: 0, avgVolumeDownDays: 0 }))).toBe(0);
  });
});

// ── Score F: Leading indicators (OBV + VP divergence) ──

describe("scoreF with leading indicators", () => {
  it("returns 3 when base=2 + both OBV divergent AND VP divergence", () => {
    expect(scoreF(makeData({
      avgVolumeUpDays: 2_000_000, avgVolumeDownDays: 1_000_000,
      obvDivergent: true, vpDivergenceBullish: true,
    }))).toBe(3);
  });

  it("returns 2 when base=2 + OBV divergent only (no VP)", () => {
    expect(scoreF(makeData({ avgVolumeUpDays: 2_000_000, avgVolumeDownDays: 1_000_000, obvDivergent: true, vpDivergenceBullish: false }))).toBe(2);
  });

  it("returns 2 when base=2 + VP divergence only (no OBV divergence)", () => {
    expect(scoreF(makeData({ avgVolumeUpDays: 2_000_000, avgVolumeDownDays: 1_000_000, obvDivergent: false, vpDivergenceBullish: true }))).toBe(2);
  });

  it("returns 2 when base=2 + no leading signal", () => {
    expect(scoreF(makeData({ avgVolumeUpDays: 2_000_000, avgVolumeDownDays: 1_000_000, obvDivergent: false }))).toBe(2);
    expect(scoreF(makeData({ avgVolumeUpDays: 2_000_000, avgVolumeDownDays: 1_000_000, obvDivergent: null }))).toBe(2);
  });

  it("returns 1 when base=0 + both leading signals (bonus lifts 0 to 1)", () => {
    expect(scoreF(makeData({
      avgVolumeUpDays: 800_000, avgVolumeDownDays: 1_000_000,
      obvDivergent: true, vpDivergenceBullish: true,
    }))).toBe(1);
  });

  it("returns 0 when base=0 + only one leading signal (no bonus)", () => {
    expect(scoreF(makeData({ avgVolumeUpDays: 800_000, avgVolumeDownDays: 1_000_000, obvDivergent: true }))).toBe(0);
    expect(scoreF(makeData({ avgVolumeUpDays: 800_000, avgVolumeDownDays: 1_000_000, vpDivergenceBullish: true }))).toBe(0);
  });
});

// ── Score H: Insider buying ──

describe("scoreH", () => {
  it("returns 2 for cluster buying (3+ buys)", () => {
    expect(scoreH(makeData({ insiderBuys90d: 5 }))).toBe(2);
    expect(scoreH(makeData({ insiderBuys90d: 3 }))).toBe(2);
  });

  it("returns 1 for some insider interest (1-2 buys)", () => {
    expect(scoreH(makeData({ insiderBuys90d: 1 }))).toBe(1);
    expect(scoreH(makeData({ insiderBuys90d: 2 }))).toBe(1);
  });

  it("returns 0 for no insider buys", () => {
    expect(scoreH(makeData({ insiderBuys90d: 0 }))).toBe(0);
    expect(scoreH(makeData({ insiderBuys90d: null }))).toBe(0);
  });
});

// ── Score I: Options flow ──

describe("scoreI", () => {
  it("returns 2 for bullish P/C < 0.5", () => {
    expect(scoreI(makeData({ putCallRatio: 0.3 }))).toBe(2);
    expect(scoreI(makeData({ putCallRatio: 0.0 }))).toBe(2);
  });

  it("returns 1 for neutral P/C 0.5-1.0", () => {
    expect(scoreI(makeData({ putCallRatio: 0.7 }))).toBe(1);
    expect(scoreI(makeData({ putCallRatio: 1.0 }))).toBe(1);
  });

  it("returns 0 for bearish P/C > 1.0", () => {
    expect(scoreI(makeData({ putCallRatio: 1.5 }))).toBe(0);
    expect(scoreI(makeData({ putCallRatio: 3.0 }))).toBe(0);
  });

  it("returns 0 when null", () => {
    expect(scoreI(makeData({ putCallRatio: null }))).toBe(0);
  });
});

// ── Score J: Relative strength ──

describe("scoreJ", () => {
  it("returns 2 for outperforming sector by >5%", () => {
    expect(scoreJ(makeData({ relativeStrength20d: 10 }))).toBe(2);
    expect(scoreJ(makeData({ relativeStrength20d: 5.1 }))).toBe(2);
  });

  it("returns 1 for within 5% of sector", () => {
    expect(scoreJ(makeData({ relativeStrength20d: 3 }))).toBe(1);
    expect(scoreJ(makeData({ relativeStrength20d: 0 }))).toBe(1);
    expect(scoreJ(makeData({ relativeStrength20d: -5 }))).toBe(1);
  });

  it("returns 0 for underperforming by >5%", () => {
    expect(scoreJ(makeData({ relativeStrength20d: -10 }))).toBe(0);
    expect(scoreJ(makeData({ relativeStrength20d: -5.1 }))).toBe(0);
  });

  it("returns 0 when null", () => {
    expect(scoreJ(makeData({ relativeStrength20d: null }))).toBe(0);
  });
});

// ── Score K: Breakout proximity ──

describe("scoreK", () => {
  it("returns 2 for within 5% of base high", () => {
    expect(scoreK(makeData({ pctFromBaseHigh: 2 }))).toBe(2);
    expect(scoreK(makeData({ pctFromBaseHigh: 5 }))).toBe(2);
  });

  it("returns 1 for 5-10% below base high", () => {
    expect(scoreK(makeData({ pctFromBaseHigh: 7 }))).toBe(1);
    expect(scoreK(makeData({ pctFromBaseHigh: 10 }))).toBe(1);
  });

  it("returns 0 for >10% below base high", () => {
    expect(scoreK(makeData({ pctFromBaseHigh: 15 }))).toBe(0);
    expect(scoreK(makeData({ pctFromBaseHigh: 30 }))).toBe(0);
  });

  it("returns 0 when null", () => {
    expect(scoreK(makeData({ pctFromBaseHigh: null }))).toBe(0);
  });
});

// ── Score M2: EMA timing ──

describe("scoreM2", () => {
  it("returns 2 for bullish cross + above both + recent crossover", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: true,
      emaM2PriceAboveBoth: true,
      emaM2CrossedWithin5Bars: true,
    }))).toBe(2);
  });

  it("returns 1 for bullish alignment only (EMA10 > EMA20)", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: true,
      emaM2PriceAboveBoth: false,
      emaM2CrossedWithin5Bars: false,
    }))).toBe(1);
  });

  it("returns 1 for price above both EMAs but bearish cross order", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: false,
      emaM2PriceAboveBoth: true,
      emaM2CrossedWithin5Bars: false,
    }))).toBe(1);
  });

  it("returns 1 for bullish cross + above both but crossover NOT within 5 bars", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: true,
      emaM2PriceAboveBoth: true,
      emaM2CrossedWithin5Bars: false,
    }))).toBe(1);
  });

  it("returns 0 for bearish alignment (EMA10 < EMA20, price below both)", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: false,
      emaM2PriceAboveBoth: false,
      emaM2CrossedWithin5Bars: false,
    }))).toBe(0);
  });

  it("returns 0 when data is null (no EMA data available)", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: null,
      emaM2PriceAboveBoth: null,
    }))).toBe(0);
  });

  it("returns 0 when only bullishCross is null", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: null,
      emaM2PriceAboveBoth: true,
    }))).toBe(0);
  });

  it("returns 0 when only priceAboveBoth is null", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: true,
      emaM2PriceAboveBoth: null,
    }))).toBe(0);
  });

  // ── Displacement + FVG alternative path ──

  it("returns 2 for bullish + aboveBoth + displacement+FVG (no recent cross)", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: true,
      emaM2PriceAboveBoth: true,
      emaM2CrossedWithin5Bars: false,
      emaM2DisplacementNearCross: true,
      emaM2FvgNearCross: true,
    }))).toBe(2);
  });

  it("returns 1 for displacement+FVG without bullish cross", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: false,
      emaM2PriceAboveBoth: true,
      emaM2CrossedWithin5Bars: false,
      emaM2DisplacementNearCross: true,
      emaM2FvgNearCross: true,
    }))).toBe(1);
  });

  it("returns 1 for displacement only (no FVG)", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: true,
      emaM2PriceAboveBoth: true,
      emaM2CrossedWithin5Bars: false,
      emaM2DisplacementNearCross: true,
      emaM2FvgNearCross: false,
    }))).toBe(1);
  });

  it("returns 1 for FVG only (no displacement)", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: true,
      emaM2PriceAboveBoth: true,
      emaM2CrossedWithin5Bars: false,
      emaM2DisplacementNearCross: false,
      emaM2FvgNearCross: true,
    }))).toBe(1);
  });

  it("returns 2 for recent cross + null displacement/FVG (backward compat)", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: true,
      emaM2PriceAboveBoth: true,
      emaM2CrossedWithin5Bars: true,
      emaM2DisplacementNearCross: null,
      emaM2FvgNearCross: null,
    }))).toBe(2);
  });

  it("returns 2 for recent cross + displacement+FVG (both paths satisfied)", () => {
    expect(scoreM2(makeData({
      emaM2BullishCross: true,
      emaM2PriceAboveBoth: true,
      emaM2CrossedWithin5Bars: true,
      emaM2DisplacementNearCross: true,
      emaM2FvgNearCross: true,
    }))).toBe(2);
  });
});

// ── Sector modifier ──

describe("calcSectorModifier", () => {
  it("returns +1 for sector > +5%", () => {
    expect(calcSectorModifier(makeData({ sectorReturn20d: 8 }))).toBe(1);
  });

  it("returns -1 for sector < -5%", () => {
    expect(calcSectorModifier(makeData({ sectorReturn20d: -10 }))).toBe(-1);
  });

  it("returns 0 for neutral sector", () => {
    expect(calcSectorModifier(makeData({ sectorReturn20d: 3 }))).toBe(0);
    expect(calcSectorModifier(makeData({ sectorReturn20d: -3 }))).toBe(0);
  });

  it("returns 0 when null", () => {
    expect(calcSectorModifier(makeData({ sectorReturn20d: null }))).toBe(0);
  });
});

// ── Full scoring pipeline ──

describe("scorePreRun", () => {
  it("returns DISCARD when gate1 fails (pctFromAth < 20)", () => {
    const data = makeData({ pctFromAth: 15, sma20: 10, currentPrice: 10 });
    const result = scorePreRun(data, true, 1, 1);
    expect(result.gates.gate1).toBe(false);
    expect(result.scores.finalScore).toBe(0);
    expect(result.verdict).toBe("DISCARD");
  });

  it("returns DISCARD when gate3 fails (freefall)", () => {
    const data = makeData({ pctFromAth: 80, sma20: 20, currentPrice: 10 });
    const result = scorePreRun(data, true, 1, 1);
    expect(result.gates.gate3).toBe(false);
    expect(result.scores.finalScore).toBe(0);
    expect(result.verdict).toBe("DISCARD");
  });

  it("returns KEEP when score >= 15 and gates pass", () => {
    const data = makeData({
      pctFromAth: 60,
      weeksInBase: 26,
      shortFloat: 22,           // B: 3
      marketCap: 5_000_000_000,
      institutionalPct: 30,     // E: 2
      avgVolumeUpDays: 2_000_000,
      avgVolumeDownDays: 1_000_000, // F: 2
      revenueGrowthYoY: 25,
      daysToEarnings: 30,       // D: 2
      sma20: 10,
      currentPrice: 10,
      insiderBuys90d: 4,        // H: 2
      putCallRatio: 0.3,        // I: 2
      relativeStrength20d: 8,   // J: 2
      pctFromBaseHigh: 3,       // K: 2
    });
    const result = scorePreRun(data, true, 2, 1);
    expect(result.gates.gate1).toBe(true);
    expect(result.gates.gate3).toBe(true);
    expect(result.scores.finalScore).toBeGreaterThanOrEqual(15);
    expect(result.verdict).toBe("KEEP");
  });

  it("returns PRIORITY when score >= 15 and earnings within 14d", () => {
    const data = makeData({
      pctFromAth: 60,
      weeksInBase: 26,
      shortFloat: 22,
      marketCap: 5_000_000_000,
      institutionalPct: 30,
      avgVolumeUpDays: 2_000_000,
      avgVolumeDownDays: 1_000_000,
      revenueGrowthYoY: 25,
      daysToEarnings: 7,
      sma20: 10,
      currentPrice: 10,
      insiderBuys90d: 4,
      putCallRatio: 0.3,
      relativeStrength20d: 8,
      pctFromBaseHigh: 3,
    });
    const result = scorePreRun(data, true, 2, 1);
    expect(result.scores.finalScore).toBeGreaterThanOrEqual(15);
    expect(result.verdict).toBe("PRIORITY");
  });

  it("returns WATCH for score 11-14", () => {
    const data = makeData({
      pctFromAth: 60,
      weeksInBase: 26,
      shortFloat: 10,           // B: 1
      marketCap: 5_000_000_000,
      institutionalPct: 30,     // E: 2
      avgVolumeUpDays: 1_500_000,
      avgVolumeDownDays: 1_000_000, // F: 2
      revenueGrowthYoY: 5,
      daysToEarnings: null,     // D: 1
      sma20: 10,
      currentPrice: 10,
      insiderBuys90d: 1,        // H: 1
      putCallRatio: 0.7,        // I: 1
      relativeStrength20d: 3,   // J: 1
      pctFromBaseHigh: 7,       // K: 1
    });
    const result = scorePreRun(data, true, 1, 1);
    // A:2 + B:1 + C:1 + D:1 + E:2 + F:2 + G:1 + H:1 + I:1 + J:1 + K:1 = 14
    expect(result.scores.finalScore).toBeGreaterThanOrEqual(11);
    expect(result.scores.finalScore).toBeLessThan(15);
    expect(result.verdict).toBe("WATCH");
  });

  it("preserves manual scoreC and scoreG values", () => {
    const data = makeData({ sma20: 10, currentPrice: 10 });
    const r0 = scorePreRun(data, true, 0, 0);
    const r3 = scorePreRun(data, true, 3, 2);
    expect(r3.scores.scoreC).toBe(3);
    expect(r3.scores.scoreG).toBe(2);
    expect(r3.scores.totalScore - r0.scores.totalScore).toBe(5);
  });

  it("includes patternMatch when similarity >= 50%", () => {
    const data = makeData({
      pctFromAth: 90,
      weeksInBase: 30,
      shortFloat: 30,
      marketCap: 2_000_000_000,
      avgVolumeUpDays: 2_000_000,
      avgVolumeDownDays: 800_000,
      sma20: 10,
      currentPrice: 10,
    });
    const result = scorePreRun(data, true, 1, 1);
    // High SI + deep discount should match CVNA or GME pattern
    expect(result.patternMatch).not.toBeNull();
  });

  it("includes new score fields H-K and sectorModifier", () => {
    const data = makeData({ sma20: 10, currentPrice: 10 });
    const result = scorePreRun(data, true, 1, 1);
    expect(result.scores).toHaveProperty("scoreH");
    expect(result.scores).toHaveProperty("scoreI");
    expect(result.scores).toHaveProperty("scoreJ");
    expect(result.scores).toHaveProperty("scoreK");
    expect(result.scores).toHaveProperty("sectorModifier");
  });
});

// ── Auto-score ──

describe("autoScorePreRun", () => {
  it("uses gate2Pass=true and scoreC=1 by default", () => {
    const data = makeData({ sma20: 10, currentPrice: 10 });
    const result = autoScorePreRun(data);
    expect(result.gates.gate2).toBe(true);
    expect(result.scores.scoreC).toBe(1);
  });
});

// ── calcDisplacementAndFVG ──

describe("calcDisplacementAndFVG", () => {
  // Helper: build OHLC arrays of length n with uniform candles
  function uniformBars(n: number, base = 100, bodySize = 1) {
    const opens = Array.from({ length: n }, (_, i) => base + i);
    const closes = opens.map(o => o + bodySize);
    const highs = closes.map(c => c + 0.5);
    const lows = opens.map(o => o - 0.5);
    return { opens, highs, lows, closes };
  }

  it("detects displacement candle near cross", () => {
    const n = 30;
    const { opens, highs, lows, closes } = uniformBars(n);
    // barsSinceCross = 5 → cross at index 24
    // Insert a big bullish candle at index 26 (within +30 window)
    // Avg body = 1.0, so need body >= 1.5
    closes[26] = opens[26] + 3; // body = 3, which is 3x avg
    highs[26] = closes[26] + 0.5;

    const result = calcDisplacementAndFVG(opens, highs, lows, closes, 5);
    expect(result.displacementNearCross).toBe(true);
  });

  it("detects bullish FVG near cross", () => {
    const n = 30;
    const { opens, highs, lows, closes } = uniformBars(n);
    // barsSinceCross = 5 → cross at index 24
    // Bullish FVG at index 27: highs[25] < lows[27]
    lows[27] = highs[25] + 1; // gap up
    opens[27] = lows[27] + 0.1;
    closes[27] = opens[27] + 1;
    highs[27] = closes[27] + 0.5;

    const result = calcDisplacementAndFVG(opens, highs, lows, closes, 5);
    expect(result.fvgNearCross).toBe(true);
  });

  it("returns false for both when barsSinceCross is null", () => {
    const { opens, highs, lows, closes } = uniformBars(30);
    const result = calcDisplacementAndFVG(opens, highs, lows, closes, null);
    expect(result.displacementNearCross).toBe(false);
    expect(result.fvgNearCross).toBe(false);
  });

  it("returns false when no displacement or FVG present", () => {
    const { opens, highs, lows, closes } = uniformBars(30);
    const result = calcDisplacementAndFVG(opens, highs, lows, closes, 5);
    expect(result.displacementNearCross).toBe(false);
    expect(result.fvgNearCross).toBe(false);
  });

  it("returns false when array too short", () => {
    const { opens, highs, lows, closes } = uniformBars(10);
    const result = calcDisplacementAndFVG(opens, highs, lows, closes, 2);
    expect(result.displacementNearCross).toBe(false);
    expect(result.fvgNearCross).toBe(false);
  });

  it("handles cross at edge of array (barsSinceCross = 0)", () => {
    const n = 30;
    const { opens, highs, lows, closes } = uniformBars(n);
    // Cross at last bar — displacement window is 5 bars before last bar
    closes[27] = opens[27] + 3; // displacement candle 3 bars before last
    highs[27] = closes[27] + 0.5;

    const result = calcDisplacementAndFVG(opens, highs, lows, closes, 0);
    expect(result.displacementNearCross).toBe(true);
  });
});
