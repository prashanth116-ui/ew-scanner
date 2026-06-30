import { describe, it, expect } from "vitest";

import {
  PRERUN_PRESETS,
  DEFAULT_PRERUN_FILTERS,
  type PreRunResult,
  type PreRunStockData,
  type PreRunScores,
  type PreRunGates,
  type PreRunPreset,
  type PreRunFilters,
  type PreRunCriteriaFilter,
} from "./types";

// ── Helpers ──

/** Create a minimal PreRunStockData with overrides. */
function makeData(overrides: Partial<PreRunStockData> = {}): PreRunStockData {
  return {
    ticker: "TEST",
    companyName: "Test Corp",
    currentPrice: 10,
    high52w: 50,
    low52w: 8,
    pctFromAth: 30,
    marketCap: 5_000_000_000,
    shortFloat: 5,
    nextEarningsDate: null,
    daysToEarnings: null,
    revenueGrowthYoY: 0,
    analystCount: 5,
    sma20: 10.5,
    avgVolumeUpDays: 1_500_000,
    avgVolumeDownDays: 1_000_000,
    allTimeHigh: 50,
    weeksInBase: 10,
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
    distributionDays20d: null,
    insiderBuys45d: null,
    dataQuality: 90,
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
    instRsVsQQQ: null,
    instRsAccelVsSPY: null,
    instRsAccelVsQQQ: null,
    instRsAccelTrend: null,
    instBeta: null,
    instGapPct: null,
    instDistFromEma20Atr: null,
    instAtrDollar: null,
    rsi14: null,
    avgDownDayBody: null,
    avgDownDayBodyPrev: null,
    accumulationDayCount: null,
    atrRatio5v20: null,
    volumeRecent5d: null,
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

/** Create a PreRunResult with overrides for scores, gates, and data. */
function makeResult(overrides: {
  data?: Partial<PreRunStockData>;
  scores?: Partial<PreRunScores>;
  gates?: Partial<PreRunGates>;
  verdict?: "PRIORITY" | "KEEP" | "WATCH" | "DISCARD";
  gate1Bypassed?: boolean;
} = {}): PreRunResult {
  const scores: PreRunScores = {
    scoreA: 1, scoreB: 1, scoreC: 1, scoreD: 1, scoreE: 1,
    scoreF: 1, scoreG: 1, scoreH: 0, scoreI: 0, scoreJ: 1,
    scoreK: 1, scoreL: 1, scoreM: 1, scoreM2: 1, scoreN: 1,
    scoreO: 0, scoreP: 0, scoreQ: 0,
    sectorModifier: 0,
    sectorQuadrant: 0,
    totalScore: 16,
    finalScore: 16,
    ...overrides.scores,
  };
  const gates: PreRunGates = {
    gate1: true,
    gate2: true,
    gate3: true,
    ...overrides.gates,
  };
  return {
    data: makeData(overrides.data),
    scores,
    gates,
    verdict: overrides.verdict ?? "WATCH",
    patternMatch: null,
    gate1Bypassed: overrides.gate1Bypassed,
  };
}

/**
 * Apply preset filters to a list of results — mirrors the page.tsx filtered useMemo logic.
 * This is the function under test.
 */
function applyPresetFilter(
  results: PreRunResult[],
  preset: PreRunPreset,
  sectorQuadrants: Record<string, string> = {},
  getSectorForTicker: (t: string) => string | undefined = () => undefined,
): PreRunResult[] {
  const f: PreRunFilters = { ...DEFAULT_PRERUN_FILTERS, ...preset.filters };
  const criteriaFilters = preset.criteriaFilters ?? [];
  const skipGate1 = preset.skipGate1 ?? false;
  const skipGate3 = preset.skipGate3 ?? false;
  const quadrantFilter = preset.quadrantFilter ?? "All";
  const filterObvDivergence = preset.filterObvDivergence ?? false;
  const filterVpDivergence = preset.filterVpDivergence ?? false;

  return results.filter((r) => {
    // minPctFromAth
    if (f.minPctFromAth > 0 && (r.data.pctFromAth ?? 0) < f.minPctFromAth) return false;
    // maxPctFromAth
    if (f.maxPctFromAth > 0 && (r.data.pctFromAth ?? 0) > f.maxPctFromAth) return false;
    // minShortFloat
    if (f.minShortFloat > 0 && (r.data.shortFloat ?? 0) < f.minShortFloat) return false;
    // maxMarketCap
    if (f.maxMarketCap > 0 && (r.data.marketCap ?? Infinity) > f.maxMarketCap) return false;
    // Score check — gate-skip logic
    if (skipGate3 || skipGate1) {
      if (!skipGate1 && !r.gates.gate1 && !r.gate1Bypassed) return false;
      if (f.minScore > 0 && r.scores.totalScore < f.minScore) return false;
    } else {
      if (f.minScore > 0 && r.scores.finalScore < f.minScore) return false;
    }
    // earningsWithin
    if (f.earningsWithin > 0 && (r.data.daysToEarnings === null || r.data.daysToEarnings > f.earningsWithin)) return false;
    // verdict
    if (f.verdict !== "All" && r.verdict !== f.verdict) return false;
    // sectorBucket
    if (f.sectorBucket !== "All") {
      const sector = getSectorForTicker(r.data.ticker);
      if (sector !== f.sectorBucket) return false;
    }
    // Criteria-level filters
    for (const cf of criteriaFilters) {
      const key = `score${cf.criterion}` as keyof PreRunScores;
      const val = r.scores[key];
      if (typeof val === "number" && val < cf.min) return false;
    }
    // Quadrant filter
    if (quadrantFilter !== "All") {
      if (Object.keys(sectorQuadrants).length === 0) return false;
      const sector = getSectorForTicker(r.data.ticker);
      const allowedQuadrants = quadrantFilter.split(",");
      if (!sector || !allowedQuadrants.includes(sectorQuadrants[sector])) return false;
    }
    // Divergence filters (OR logic)
    if (filterObvDivergence || filterVpDivergence) {
      const obvPass = filterObvDivergence && r.data.obvDivergent === true;
      const vpPass = filterVpDivergence && r.data.vpDivergenceBullish === true;
      if (!obvPass && !vpPass) return false;
    }
    return true;
  });
}

// ── Preset definitions lookup ──

function getPreset(name: string): PreRunPreset {
  const p = PRERUN_PRESETS.find((p) => p.name === name);
  if (!p) throw new Error(`Preset "${name}" not found`);
  return p;
}

// ═══════════════════════════════════════════════════════════
// SNDK Pattern
// ═══════════════════════════════════════════════════════════

describe("SNDK Pattern", () => {
  const preset = getPreset("SNDK Pattern");

  it("passes: 40% ATH, 15% SI, score 18", () => {
    const r = makeResult({
      data: { pctFromAth: 45, shortFloat: 20 },
      scores: { finalScore: 20, totalScore: 20 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(1);
  });

  it("rejects: pctFromAth < 40", () => {
    const r = makeResult({
      data: { pctFromAth: 35, shortFloat: 20 },
      scores: { finalScore: 20, totalScore: 20 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: shortFloat < 15", () => {
    const r = makeResult({
      data: { pctFromAth: 50, shortFloat: 10 },
      scores: { finalScore: 20, totalScore: 20 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: finalScore < 18", () => {
    const r = makeResult({
      data: { pctFromAth: 50, shortFloat: 20 },
      scores: { finalScore: 16, totalScore: 16 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Early Mover
// ═══════════════════════════════════════════════════════════

describe("Early Mover", () => {
  const preset = getPreset("Early Mover");

  it("passes: 25% ATH, M2+L+F all ≥1, score ≥14", () => {
    const r = makeResult({
      data: { pctFromAth: 30 },
      scores: { scoreM2: 2, scoreL: 1, scoreF: 1, finalScore: 16, totalScore: 16 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(1);
  });

  it("rejects: pctFromAth < 25", () => {
    const r = makeResult({
      data: { pctFromAth: 20 },
      scores: { scoreM2: 2, scoreL: 1, scoreF: 1, finalScore: 16, totalScore: 16 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: scoreL = 0 (no higher lows)", () => {
    const r = makeResult({
      data: { pctFromAth: 30 },
      scores: { scoreM2: 2, scoreL: 0, scoreF: 1, finalScore: 16, totalScore: 16 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: scoreM2 = 0 (no EMA timing)", () => {
    const r = makeResult({
      data: { pctFromAth: 30 },
      scores: { scoreM2: 0, scoreL: 1, scoreF: 1, finalScore: 16, totalScore: 16 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: scoreF = 0 (no volume accumulation)", () => {
    const r = makeResult({
      data: { pctFromAth: 30 },
      scores: { scoreM2: 2, scoreL: 1, scoreF: 0, finalScore: 16, totalScore: 16 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: finalScore < 14", () => {
    const r = makeResult({
      data: { pctFromAth: 30 },
      scores: { scoreM2: 2, scoreL: 1, scoreF: 1, finalScore: 12, totalScore: 12 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Pullback Buy
// ═══════════════════════════════════════════════════════════

describe("Pullback Buy", () => {
  const preset = getPreset("Pullback Buy");

  it("passes: 30% ATH (within 20-40 range), M2+F+L ≥1, score ≥15", () => {
    const r = makeResult({
      data: { pctFromAth: 30 },
      scores: { scoreM2: 1, scoreF: 1, scoreL: 1, finalScore: 17, totalScore: 17 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(1);
  });

  it("passes at boundary: pctFromAth = 20 (minimum, from Gate 1 default)", () => {
    const r = makeResult({
      data: { pctFromAth: 20 },
      scores: { scoreM2: 1, scoreF: 1, scoreL: 1, finalScore: 16, totalScore: 16 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(1);
  });

  it("passes at boundary: pctFromAth = 40 (maximum)", () => {
    const r = makeResult({
      data: { pctFromAth: 40 },
      scores: { scoreM2: 1, scoreF: 1, scoreL: 1, finalScore: 16, totalScore: 16 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(1);
  });

  it("rejects: pctFromAth = 50 (exceeds maxPctFromAth: 40)", () => {
    const r = makeResult({
      data: { pctFromAth: 50 },
      scores: { scoreM2: 1, scoreF: 1, scoreL: 1, finalScore: 18, totalScore: 18 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: pctFromAth = 80 (deeply crashed stock)", () => {
    const r = makeResult({
      data: { pctFromAth: 80 },
      scores: { scoreM2: 2, scoreF: 2, scoreL: 2, finalScore: 22, totalScore: 22 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: scoreL = 0 (no higher lows — falling knife)", () => {
    const r = makeResult({
      data: { pctFromAth: 30 },
      scores: { scoreM2: 1, scoreF: 1, scoreL: 0, finalScore: 17, totalScore: 17 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: scoreM2 = 0 (no EMA confirmation)", () => {
    const r = makeResult({
      data: { pctFromAth: 30 },
      scores: { scoreM2: 0, scoreF: 1, scoreL: 1, finalScore: 17, totalScore: 17 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: finalScore < 15", () => {
    const r = makeResult({
      data: { pctFromAth: 30 },
      scores: { scoreM2: 1, scoreF: 1, scoreL: 1, finalScore: 13, totalScore: 13 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Leading Sector Scan
// ═══════════════════════════════════════════════════════════

describe("Leading Sector Scan", () => {
  const preset = getPreset("Leading Sector Scan");
  const sectorMap = { Technology: "LEADING", Healthcare: "IMPROVING", Energy: "LAGGING" };
  const getSector = (t: string) =>
    t === "AAPL" ? "Technology" : t === "JNJ" ? "Healthcare" : t === "XOM" ? "Energy" : undefined;

  it("passes: near-ATH stock in LEADING sector with M≥1 and totalScore≥12", () => {
    const r = makeResult({
      data: { ticker: "AAPL", pctFromAth: 5 },
      scores: { scoreM: 2, totalScore: 18, finalScore: 0 },
      gates: { gate1: false },  // Gate 1 fails (near ATH), but skipGate1 should bypass
    });
    expect(applyPresetFilter([r], preset, sectorMap, getSector)).toHaveLength(1);
  });

  it("passes: 50% from ATH stock in IMPROVING sector", () => {
    const r = makeResult({
      data: { ticker: "JNJ", pctFromAth: 50 },
      scores: { scoreM: 1, totalScore: 14, finalScore: 14 },
      gates: { gate1: true },
    });
    expect(applyPresetFilter([r], preset, sectorMap, getSector)).toHaveLength(1);
  });

  it("uses totalScore, not finalScore (skipGate1 + skipGate3)", () => {
    // finalScore = 0 (gate1 failed), but totalScore = 15 (good score)
    const r = makeResult({
      data: { ticker: "AAPL", pctFromAth: 8 },
      scores: { scoreM: 1, totalScore: 15, finalScore: 0 },
      gates: { gate1: false },
    });
    expect(applyPresetFilter([r], preset, sectorMap, getSector)).toHaveLength(1);
  });

  it("rejects: totalScore < 12", () => {
    const r = makeResult({
      data: { ticker: "AAPL", pctFromAth: 5 },
      scores: { scoreM: 1, totalScore: 10, finalScore: 0 },
      gates: { gate1: false },
    });
    expect(applyPresetFilter([r], preset, sectorMap, getSector)).toHaveLength(0);
  });

  it("rejects: scoreM = 0 (no EMA reclaim)", () => {
    const r = makeResult({
      data: { ticker: "AAPL", pctFromAth: 5 },
      scores: { scoreM: 0, totalScore: 15, finalScore: 0 },
      gates: { gate1: false },
    });
    expect(applyPresetFilter([r], preset, sectorMap, getSector)).toHaveLength(0);
  });

  it("rejects: stock in LAGGING sector", () => {
    const r = makeResult({
      data: { ticker: "XOM", pctFromAth: 30 },
      scores: { scoreM: 2, totalScore: 20, finalScore: 20 },
      gates: { gate1: true },
    });
    expect(applyPresetFilter([r], preset, sectorMap, getSector)).toHaveLength(0);
  });

  it("rejects: all results when sectorQuadrants is empty", () => {
    const r = makeResult({
      data: { ticker: "AAPL", pctFromAth: 5 },
      scores: { scoreM: 2, totalScore: 20, finalScore: 0 },
      gates: { gate1: false },
    });
    // Empty sectorQuadrants → all filtered out
    expect(applyPresetFilter([r], preset, {}, getSector)).toHaveLength(0);
  });

  it("rejects: unknown ticker (no sector mapping)", () => {
    const r = makeResult({
      data: { ticker: "UNKNOWN", pctFromAth: 5 },
      scores: { scoreM: 2, totalScore: 20, finalScore: 0 },
      gates: { gate1: false },
    });
    expect(applyPresetFilter([r], preset, sectorMap, getSector)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Stealth Accumulation
// ═══════════════════════════════════════════════════════════

describe("Stealth Accumulation", () => {
  const preset = getPreset("Stealth Accumulation");

  it("passes: OBV divergent + M2≥1 + score≥11", () => {
    const r = makeResult({
      data: { pctFromAth: 30, obvDivergent: true },
      scores: { scoreM2: 1, finalScore: 14, totalScore: 14 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(1);
  });

  it("passes: VP divergence (without OBV) + M2≥1", () => {
    const r = makeResult({
      data: { pctFromAth: 30, vpDivergenceBullish: true },
      scores: { scoreM2: 2, finalScore: 12, totalScore: 12 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(1);
  });

  it("passes: both OBV + VP divergence", () => {
    const r = makeResult({
      data: { pctFromAth: 30, obvDivergent: true, vpDivergenceBullish: true },
      scores: { scoreM2: 1, finalScore: 15, totalScore: 15 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(1);
  });

  it("rejects: no divergence at all", () => {
    const r = makeResult({
      data: { pctFromAth: 30, obvDivergent: false, vpDivergenceBullish: false },
      scores: { scoreM2: 2, finalScore: 18, totalScore: 18 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: null divergence fields", () => {
    const r = makeResult({
      data: { pctFromAth: 30 },  // obvDivergent and vpDivergenceBullish default to null
      scores: { scoreM2: 2, finalScore: 18, totalScore: 18 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: scoreM2 = 0 (no EMA timing)", () => {
    const r = makeResult({
      data: { pctFromAth: 30, obvDivergent: true },
      scores: { scoreM2: 0, finalScore: 14, totalScore: 14 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: finalScore < 11", () => {
    const r = makeResult({
      data: { pctFromAth: 30, obvDivergent: true },
      scores: { scoreM2: 1, finalScore: 8, totalScore: 8 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Aggressive Early
// ═══════════════════════════════════════════════════════════

describe("Aggressive Early", () => {
  const preset = getPreset("Aggressive Early");

  it("passes: M2≥1 + N≥1 + divergence + score≥10", () => {
    const r = makeResult({
      data: { pctFromAth: 30, vpDivergenceBullish: true },
      scores: { scoreM2: 2, scoreN: 1, finalScore: 12, totalScore: 12 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(1);
  });

  it("passes: OBV divergence (instead of VP)", () => {
    const r = makeResult({
      data: { pctFromAth: 25, obvDivergent: true },
      scores: { scoreM2: 1, scoreN: 2, finalScore: 11, totalScore: 11 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(1);
  });

  it("rejects: scoreN = 0 (no range coil)", () => {
    const r = makeResult({
      data: { pctFromAth: 30, obvDivergent: true },
      scores: { scoreM2: 2, scoreN: 0, finalScore: 14, totalScore: 14 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: scoreM2 = 0 (no EMA timing)", () => {
    const r = makeResult({
      data: { pctFromAth: 30, obvDivergent: true },
      scores: { scoreM2: 0, scoreN: 1, finalScore: 14, totalScore: 14 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: no divergence", () => {
    const r = makeResult({
      data: { pctFromAth: 30 },
      scores: { scoreM2: 2, scoreN: 2, finalScore: 14, totalScore: 14 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("rejects: finalScore < 10", () => {
    const r = makeResult({
      data: { pctFromAth: 30, obvDivergent: true },
      scores: { scoreM2: 1, scoreN: 1, finalScore: 8, totalScore: 8 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });

  it("accepts: score = 10 (exactly at threshold, 1 below default)", () => {
    const r = makeResult({
      data: { pctFromAth: 25, vpDivergenceBullish: true },
      scores: { scoreM2: 1, scoreN: 1, finalScore: 10, totalScore: 10 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════
// Cross-preset: maxPctFromAth behavior
// ═══════════════════════════════════════════════════════════

describe("maxPctFromAth filter", () => {
  it("is NOT applied when maxPctFromAth = 0 (default — no limit)", () => {
    const preset = getPreset("SNDK Pattern"); // maxPctFromAth not set → defaults to 0
    const r = makeResult({
      data: { pctFromAth: 95, shortFloat: 20 },
      scores: { finalScore: 20, totalScore: 20 },
    });
    expect(applyPresetFilter([r], preset)).toHaveLength(1);
  });

  it("IS applied when maxPctFromAth > 0 (Pullback Buy)", () => {
    const preset = getPreset("Pullback Buy");
    const deep = makeResult({
      data: { pctFromAth: 60 },
      scores: { scoreM2: 2, scoreF: 2, scoreL: 2, finalScore: 20, totalScore: 20 },
    });
    const shallow = makeResult({
      data: { pctFromAth: 25 },
      scores: { scoreM2: 1, scoreF: 1, scoreL: 1, finalScore: 16, totalScore: 16 },
    });
    const results = applyPresetFilter([deep, shallow], preset);
    expect(results).toHaveLength(1);
    expect(results[0].data.pctFromAth).toBe(25);
  });
});

// ═══════════════════════════════════════════════════════════
// Cross-preset: skipGate1 behavior
// ═══════════════════════════════════════════════════════════

describe("skipGate1 behavior", () => {
  it("Leading Sector uses totalScore when gate1 fails (skipGate1=true)", () => {
    const preset = getPreset("Leading Sector Scan");
    const sectorMap = { Technology: "LEADING" };
    const getSector = () => "Technology";

    const r = makeResult({
      data: { ticker: "AAPL", pctFromAth: 5 },
      scores: { scoreM: 1, totalScore: 14, finalScore: 0 },
      gates: { gate1: false },
    });
    // With skipGate1, totalScore (14) >= minScore (12) → passes
    expect(applyPresetFilter([r], preset, sectorMap, getSector)).toHaveLength(1);
  });

  it("SNDK uses finalScore (skipGate1=false, default)", () => {
    const preset = getPreset("SNDK Pattern");
    const r = makeResult({
      data: { pctFromAth: 50, shortFloat: 20 },
      scores: { totalScore: 20, finalScore: 0 },
      gates: { gate1: false },
    });
    // Without skipGate1, finalScore (0) < minScore (18) → rejected
    expect(applyPresetFilter([r], preset)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Preset definition sanity checks
// ═══════════════════════════════════════════════════════════

describe("Preset definitions", () => {
  it("all 9 presets exist", () => {
    expect(PRERUN_PRESETS).toHaveLength(9);
  });

  it("Pullback Buy has maxPctFromAth set", () => {
    const p = getPreset("Pullback Buy");
    expect(p.filters.maxPctFromAth).toBe(40);
  });

  it("Pullback Buy requires L≥1 (higher lows)", () => {
    const p = getPreset("Pullback Buy");
    expect(p.criteriaFilters).toContainEqual({ criterion: "L", min: 1 });
  });

  it("Leading Sector has skipGate1 and skipGate3", () => {
    const p = getPreset("Leading Sector Scan");
    expect(p.skipGate1).toBe(true);
    expect(p.skipGate3).toBe(true);
  });

  it("Leading Sector has minPctFromAth: 0 (allows near-ATH)", () => {
    const p = getPreset("Leading Sector Scan");
    expect(p.filters.minPctFromAth).toBe(0);
  });

  it("Stealth Accumulation requires M2≥1", () => {
    const p = getPreset("Stealth Accumulation");
    expect(p.criteriaFilters).toContainEqual({ criterion: "M2", min: 1 });
  });

  it("Early Mover has no redundant verdict/sectorBucket defaults", () => {
    const p = getPreset("Early Mover");
    expect(p.filters.verdict).toBeUndefined();
    expect(p.filters.sectorBucket).toBeUndefined();
  });

  it("Aggressive Early has no redundant minPctFromAth (uses Gate 1 default)", () => {
    const p = getPreset("Aggressive Early");
    expect(p.filters.minPctFromAth).toBeUndefined();
  });

  it("DEFAULT_PRERUN_FILTERS has maxPctFromAth: 0", () => {
    expect(DEFAULT_PRERUN_FILTERS.maxPctFromAth).toBe(0);
  });
});
