import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  evaluateVCPGates,
  scoreTrend,
  scoreVolume,
  scoreCompression,
  scoreRelativeStrength,
  scoreRiskQuality,
  calcVCPRisk,
  classifyVCPPhase,
  scoreVCP,
} from "./vcp-scoring";
import type { PreRunStockData } from "./types";

/** Helper: create minimal PreRunStockData for VCP tests. */
function makeVCPData(overrides: Partial<PreRunStockData> = {}): PreRunStockData {
  return {
    ticker: "AAPL",
    companyName: "Apple Inc",
    currentPrice: 180,
    high52w: 200,
    low52w: 120,
    pctFromAth: 10,
    marketCap: 3_000_000_000_000,
    shortFloat: 1,
    nextEarningsDate: null,
    daysToEarnings: null,
    revenueGrowthYoY: 5,
    analystCount: 30,
    sma20: 175,
    avgVolumeUpDays: 50_000_000,
    avgVolumeDownDays: 40_000_000,
    allTimeHigh: 200,
    weeksInBase: 4,
    institutionalPct: 60,
    insiderBuys90d: null,
    putCallRatio: null,
    callVolume: null,
    putVolume: null,
    relativeStrength20d: 3,
    sectorReturn20d: 2,
    pctFromBaseHigh: 5,
    floatShares: null,
    floatTurnover20d: null,
    obvDivergent: null,
    obvPctFromHigh: null,
    pricePctFromHigh20d: null,
    vpDivergenceBullish: null,
    distributionDays20d: null,
    insiderBuys45d: null,
    dataQuality: null,
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
    atrContracting: true,
    failedBreakdownRecovery: null,
    analystRevisionTrend: null,
    // VCP fields
    vcpSma50: 170,
    vcpSma200: 150,
    vcpSma10: 178,
    vcpAvgVolume50d: 60_000_000,
    vcpAvgVolume10d: 30_000_000,
    vcpAvgDollarVolume: 10_800_000_000,
    vcpDistFromSma50Pct: 5.88,
    vcpDistFromSma200Pct: 20,
    vcpAtrPct: 1.8,
    vcpRange5d: 2.5,
    vcpRange10d: 4.0,
    vcpRange20d: 6.0,
    vcpTightCloses: true,
    vcpInsideBarCount: 2,
    vcpDryVolumeDays: 4,
    vcpPivotHigh: 185,
    vcpRelStrengthVsSPY: 8,
    vcpAtrMultipleAbove50: 3.2,
    instRsVsQQQ: null,
    instRsAccelVsSPY: null,
    instRsAccelVsQQQ: null,
    instRsAccelTrend: null,
    instBeta: null,
    instGapPct: null,
    instDistFromEma20Atr: null,
    instAtrDollar: null,
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

// ── Gates ──

describe("evaluateVCPGates", () => {
  it("all gates pass for institutional stock", () => {
    const gates = evaluateVCPGates(makeVCPData());
    expect(gates.allPass).toBe(true);
    expect(gates.priceAbove10).toBe(true);
    expect(gates.avgVolAbove500k).toBe(true);
    expect(gates.dollarVolAbove20m).toBe(true);
    expect(gates.mktCapAbove1b).toBe(true);
    expect(gates.aboveSma200).toBe(true);
    expect(gates.aboveSma50).toBe(true);
  });

  it("fails price gate for penny stock", () => {
    const gates = evaluateVCPGates(makeVCPData({ currentPrice: 5 }));
    expect(gates.priceAbove10).toBe(false);
    expect(gates.allPass).toBe(false);
  });

  it("fails volume gate for low volume stock", () => {
    const gates = evaluateVCPGates(makeVCPData({ vcpAvgVolume50d: 100_000 }));
    expect(gates.avgVolAbove500k).toBe(false);
    expect(gates.allPass).toBe(false);
  });

  it("fails SMA200 gate when price below", () => {
    const gates = evaluateVCPGates(makeVCPData({ currentPrice: 140, vcpSma200: 150 }));
    expect(gates.aboveSma200).toBe(false);
    expect(gates.allPass).toBe(false);
  });

  it("fails market cap gate for small cap", () => {
    const gates = evaluateVCPGates(makeVCPData({ marketCap: 500_000_000 }));
    expect(gates.mktCapAbove1b).toBe(false);
    expect(gates.allPass).toBe(false);
  });

  it("handles null SMA values gracefully", () => {
    const gates = evaluateVCPGates(makeVCPData({ vcpSma50: null, vcpSma200: null }));
    expect(gates.aboveSma50).toBe(false);
    expect(gates.aboveSma200).toBe(false);
  });
});

// ── Trend Score ──

describe("scoreTrend", () => {
  it("scores max for strong uptrend near 52w high", () => {
    const score = scoreTrend(makeVCPData());
    expect(score).toBeGreaterThanOrEqual(15);
    expect(score).toBeLessThanOrEqual(25);
  });

  it("penalizes extension >10% above SMA50", () => {
    const normal = scoreTrend(makeVCPData({ vcpDistFromSma50Pct: 5 }));
    const extended = scoreTrend(makeVCPData({ vcpDistFromSma50Pct: 15 }));
    expect(extended).toBeLessThan(normal);
  });

  it("returns 0 when price below both SMAs", () => {
    const score = scoreTrend(makeVCPData({
      currentPrice: 100,
      vcpSma50: 150,
      vcpSma200: 160,
      high52w: 200,
      vcpDistFromSma50Pct: -33,
    }));
    expect(score).toBeLessThanOrEqual(5); // Only 52w-high distance might score
  });
});

// ── Volume Score ──

describe("scoreVolume", () => {
  it("scores high for strong dry volume + accumulation + contraction", () => {
    const score = scoreVolume(makeVCPData());
    expect(score).toBeGreaterThanOrEqual(10);
  });

  it("scores 0 for no volume signals", () => {
    const score = scoreVolume(makeVCPData({
      vcpDryVolumeDays: 0,
      avgVolumeUpDays: 100,
      avgVolumeDownDays: 200,
      vcpAvgVolume10d: 100_000,
      vcpAvgVolume50d: 100_000,
    }));
    expect(score).toBe(0);
  });
});

// ── Compression Score ──

describe("scoreCompression", () => {
  it("scores high for full compression pattern", () => {
    const score = scoreCompression(makeVCPData());
    expect(score).toBeGreaterThanOrEqual(20);
  });

  it("scores partial for some compression signals", () => {
    const score = scoreCompression(makeVCPData({
      atrContracting: false,
      vcpTightCloses: false,
      vcpInsideBarCount: 0,
    }));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(20);
  });
});

// ── Relative Strength Score ──

describe("scoreRelativeStrength", () => {
  it("scores high for strong outperformance", () => {
    const score = scoreRelativeStrength(makeVCPData({
      vcpRelStrengthVsSPY: 15,
      relativeStrength20d: 10,
    }));
    expect(score).toBe(15);
  });

  it("returns 0 when null", () => {
    const score = scoreRelativeStrength(makeVCPData({
      vcpRelStrengthVsSPY: null,
      relativeStrength20d: null,
    }));
    expect(score).toBe(0);
  });

  it("scores partial for moderate strength", () => {
    const score = scoreRelativeStrength(makeVCPData({
      vcpRelStrengthVsSPY: 3,
      relativeStrength20d: 2,
    }));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(15);
  });
});

// ── Risk Quality Score ──

describe("scoreRiskQuality", () => {
  it("scores max for tight, liquid, non-extended setup", () => {
    const score = scoreRiskQuality(makeVCPData({
      vcpAtrPct: 1.5,
      vcpDistFromSma50Pct: 3,
      vcpAvgDollarVolume: 200_000_000,
    }));
    expect(score).toBe(15);
  });

  it("scores 0 for wide, illiquid, extended stock", () => {
    const score = scoreRiskQuality(makeVCPData({
      vcpAtrPct: 8,
      vcpDistFromSma50Pct: 25,
      vcpAvgDollarVolume: 5_000_000,
    }));
    expect(score).toBe(0);
  });
});

// ── Risk Calculator ──

describe("calcVCPRisk", () => {
  it("calculates entry, stop, and targets correctly", () => {
    const risk = calcVCPRisk(makeVCPData(), 100_000, 0.002);
    expect(risk.entry).toBe(185.10);
    expect(risk.stop).not.toBeNull();
    expect(risk.stop!).toBeLessThan(risk.entry!);
    expect(risk.riskPerShare).toBeGreaterThan(0);
    expect(risk.shares).toBeGreaterThan(0);
    expect(risk.target2R).toBeGreaterThan(risk.entry!);
    expect(risk.target3R).toBeGreaterThan(risk.target2R!);
    expect(risk.target6R).toBeGreaterThan(risk.target3R!);
    expect(risk.target10R).toBeGreaterThan(risk.target6R!);
    expect(risk.sma10Exit).toBe(178);
  });

  it("returns nulls when pivot is null", () => {
    const risk = calcVCPRisk(makeVCPData({ vcpPivotHigh: null }));
    expect(risk.entry).toBeNull();
    expect(risk.stop).toBeNull();
    expect(risk.shares).toBeNull();
  });

  it("caps shares by position size limit", () => {
    // With very low risk/share, the position cap should kick in
    const risk = calcVCPRisk(
      makeVCPData({ vcpAtrPct: 0.1, vcpPivotHigh: 180 }),
      100_000,
      0.01,
    );
    expect(risk.shares).toBeLessThanOrEqual(Math.floor(100_000 * 0.25 / risk.entry!));
  });

  it("handles zero ATR gracefully", () => {
    const risk = calcVCPRisk(makeVCPData({ vcpAtrPct: 0 }));
    // ATR is 0, so riskPerShare = entry - stop = entry - entry = 0
    expect(risk.riskPerShare).toBe(0);
    expect(risk.shares).toBe(0);
  });
});

// ── Phase Classification ──

describe("classifyVCPPhase", () => {
  it("classifies FOCUS_LIST for 85+", () => {
    expect(classifyVCPPhase(85)).toBe("FOCUS_LIST");
    expect(classifyVCPPhase(100)).toBe("FOCUS_LIST");
  });

  it("classifies WATCHLIST_CANDIDATE for 75-84", () => {
    expect(classifyVCPPhase(75)).toBe("WATCHLIST_CANDIDATE");
    expect(classifyVCPPhase(84)).toBe("WATCHLIST_CANDIDATE");
  });

  it("classifies EARLY_SETUP for 65-74", () => {
    expect(classifyVCPPhase(65)).toBe("EARLY_SETUP");
    expect(classifyVCPPhase(74)).toBe("EARLY_SETUP");
  });

  it("classifies IGNORE for <65", () => {
    expect(classifyVCPPhase(64)).toBe("IGNORE");
    expect(classifyVCPPhase(0)).toBe("IGNORE");
  });

  it("handles boundary values exactly", () => {
    expect(classifyVCPPhase(64)).toBe("IGNORE");
    expect(classifyVCPPhase(65)).toBe("EARLY_SETUP");
    expect(classifyVCPPhase(74)).toBe("EARLY_SETUP");
    expect(classifyVCPPhase(75)).toBe("WATCHLIST_CANDIDATE");
    expect(classifyVCPPhase(84)).toBe("WATCHLIST_CANDIDATE");
    expect(classifyVCPPhase(85)).toBe("FOCUS_LIST");
  });
});

// ── Full Pipeline ──

describe("scoreVCP", () => {
  it("returns full result with all fields", () => {
    const result = scoreVCP(makeVCPData());
    expect(result.gates.allPass).toBe(true);
    expect(result.scores.totalScore).toBeGreaterThan(0);
    expect(result.scores.totalScore).toBeLessThanOrEqual(100);
    expect(result.phase).toBeDefined();
    expect(result.riskCalc.entry).not.toBeNull();
    expect(result.data.ticker).toBe("AAPL");
  });

  it("returns 0 total score when gates fail", () => {
    const result = scoreVCP(makeVCPData({ currentPrice: 5 }));
    expect(result.gates.allPass).toBe(false);
    expect(result.scores.totalScore).toBe(0);
    expect(result.phase).toBe("IGNORE");
  });

  it("sub-scores sum to total", () => {
    const result = scoreVCP(makeVCPData());
    const { trendScore, volumeScore, compressionScore, relStrengthScore, riskQualityScore, totalScore } = result.scores;
    expect(totalScore).toBe(trendScore + volumeScore + compressionScore + relStrengthScore + riskQualityScore);
  });

  it("passes custom account size and risk pct through", () => {
    const result = scoreVCP(makeVCPData(), 200_000, 0.005);
    expect(result.riskCalc.accountSize).toBe(200_000);
    expect(result.riskCalc.riskPct).toBe(0.005);
  });
});
