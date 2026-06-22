/**
 * Catalyst scoring module tests.
 * Covers normalization ceiling, score distribution, verdict thresholds, NaN handling.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/data/catalyst-universe", () => ({
  getLayerPeers: () => [],
}));

import {
  scoreDaysToCatalyst,
  scoreMeanReversion,
  scoreMomentumBreakout,
  scoreShortInterest,
  scoreAnalystUpside,
  scoreVolumeRatio,
  scoreRSI,
  scoreSectorETF,
  scoreEarningsSurprise,
  scoreMAPosition,
  scoreOptionsSkew,
  scoreTrendAcceleration,
  scoreRelativeStrength,
  scoreInsiderBuying,
  scoreInstitutionalOwnership,
  scoreDarkPoolActivity,
  classifyVerdict,
  computeScores,
} from "./scoring";
import type { CatalystRawData, ETFPriceData } from "./types";
import { MAX_ACHIEVABLE_SCORE } from "./types";

// ── Helper ──

function makeRawData(overrides: Partial<CatalystRawData> = {}): CatalystRawData {
  return {
    symbol: "TEST",
    price: 100,
    ytdChange: -10,
    change5d: 2,
    change1d: 0.5,
    fiftyTwoWeekHigh: 150,
    fiftyTwoWeekLow: 80,
    shortPercentFloat: 5,
    analystTarget: 130,
    volume5dAvg: 1_000_000,
    volume20dAvg: 800_000,
    closes: Array.from({ length: 30 }, (_, i) => 95 + i * 0.2),
    volumes: Array.from({ length: 30 }, () => 1_000_000),
    sma50: 98,
    sma200: 95,
    earningsSurprises: [0.05, 0.03, 0.02, 0.01],
    putCallRatio: 0.8,
    callVolume: 5000,
    putVolume: 4000,
    insiderNetBuys: { purchases: 1, sales: 0 },
    institutionalPercent: 0.75,
    ...overrides,
  };
}

// ── Factor 1: Days to Catalyst ──

describe("scoreDaysToCatalyst", () => {
  it("returns 12 for imminent catalyst (≤2 days)", () => {
    expect(scoreDaysToCatalyst(0)).toBe(12);
    expect(scoreDaysToCatalyst(1)).toBe(12);
    expect(scoreDaysToCatalyst(2)).toBe(12);
  });

  it("returns 0 for no catalyst", () => {
    expect(scoreDaysToCatalyst(null)).toBe(0);
  });

  it("returns 0 for distant catalyst (>30 days)", () => {
    expect(scoreDaysToCatalyst(31)).toBe(0);
    expect(scoreDaysToCatalyst(90)).toBe(0);
  });

  it("returns tiered scores for intermediate distances", () => {
    expect(scoreDaysToCatalyst(5)).toBe(10);
    expect(scoreDaysToCatalyst(10)).toBe(8);
    expect(scoreDaysToCatalyst(14)).toBe(6);
    expect(scoreDaysToCatalyst(21)).toBe(4);
    expect(scoreDaysToCatalyst(30)).toBe(2);
  });
});

// ── Factor 2: Mean Reversion ──

describe("scoreMeanReversion", () => {
  it("returns 8 for deep drawdown (≤-40%)", () => {
    expect(scoreMeanReversion(-40)).toBe(8);
    expect(scoreMeanReversion(-50)).toBe(8);
  });

  it("returns 0 for positive YTD", () => {
    expect(scoreMeanReversion(10)).toBe(0);
    expect(scoreMeanReversion(0.1)).toBe(0);
  });

  it("returns 1 for flat-to-slightly-negative", () => {
    expect(scoreMeanReversion(0)).toBe(1);
    expect(scoreMeanReversion(-3)).toBe(1);
  });
});

// ── Factor 3: Momentum Breakout ──

describe("scoreMomentumBreakout", () => {
  it("returns 7 for near 52wk high with volume", () => {
    expect(scoreMomentumBreakout(148, 150, 2_000_000, 1_000_000)).toBe(7);
  });

  it("returns 0 for price far from high", () => {
    // 100 vs 150 = 33% from high → returns 0 (>25% threshold)
    expect(scoreMomentumBreakout(100, 150, 1_000_000, 1_000_000)).toBe(0);
  });

  it("returns 0 for zero high", () => {
    expect(scoreMomentumBreakout(100, 0, 1_000_000, 1_000_000)).toBe(0);
  });
});

// ── Factor 4: Short Interest ──

describe("scoreShortInterest", () => {
  it("returns 10 for 20%+ SI", () => {
    expect(scoreShortInterest(20)).toBe(10);
    expect(scoreShortInterest(30)).toBe(10);
  });

  it("returns 0 for no shorts", () => {
    expect(scoreShortInterest(0)).toBe(0);
    expect(scoreShortInterest(-1)).toBe(0);
  });

  it("returns linear interpolation for intermediate SI", () => {
    const score = scoreShortInterest(10);
    expect(score).toBe(5);
  });
});

// ── Factor 5: Analyst Upside ──

describe("scoreAnalystUpside", () => {
  it("returns 8 for 40%+ upside", () => {
    expect(scoreAnalystUpside(140, 100)).toBe(8);
  });

  it("returns 0 for zero/negative price", () => {
    expect(scoreAnalystUpside(140, 0)).toBe(0);
    expect(scoreAnalystUpside(0, 100)).toBe(0);
  });
});

// ── Factor 6: Volume Ratio ──

describe("scoreVolumeRatio", () => {
  it("returns 10 for 2x+ volume", () => {
    expect(scoreVolumeRatio(2_000_000, 1_000_000)).toBe(10);
  });

  it("returns 0 for normal volume", () => {
    expect(scoreVolumeRatio(800_000, 1_000_000)).toBe(0);
  });

  it("returns 0 for zero denominator", () => {
    expect(scoreVolumeRatio(100, 0)).toBe(0);
  });
});

// ── Factor 7: RSI ──

describe("scoreRSI", () => {
  it("returns 8 for sweet spot (35-50)", () => {
    expect(scoreRSI(40)).toBe(8);
    expect(scoreRSI(35)).toBe(8);
    expect(scoreRSI(50)).toBe(8);
  });

  it("returns 0 for overbought (>70)", () => {
    expect(scoreRSI(75)).toBe(0);
  });

  it("returns 3 for oversold (<30)", () => {
    expect(scoreRSI(25)).toBe(3);
  });
});

// ── Factor 9: Sector ETF ──

describe("scoreSectorETF", () => {
  it("returns 0 for null data", () => {
    expect(scoreSectorETF(null)).toBe(0);
  });

  it("returns 7 when at 20d high", () => {
    expect(scoreSectorETF({
      symbol: "XLK",
      closes: [100, 101],
      high20d: 101,
      currentPrice: 101,
    })).toBe(7);
  });
});

// ── Factor 10: Earnings Surprise ──

describe("scoreEarningsSurprise", () => {
  it("returns 8 for 4+ consecutive beats", () => {
    expect(scoreEarningsSurprise([0.1, 0.05, 0.03, 0.02])).toBe(8);
  });

  it("returns 0 for empty array", () => {
    expect(scoreEarningsSurprise([])).toBe(0);
  });

  it("returns 0 for most recent miss", () => {
    expect(scoreEarningsSurprise([-0.02, 0.05, 0.03])).toBe(0);
  });

  it("returns 2 for single beat", () => {
    expect(scoreEarningsSurprise([0.05, -0.02])).toBe(2);
  });
});

// ── Factor 11: MA Position ──

describe("scoreMAPosition", () => {
  it("returns 5 for price above both SMAs", () => {
    expect(scoreMAPosition(100, 90, 85)).toBe(5);
  });

  it("returns 0 for price below both SMAs", () => {
    expect(scoreMAPosition(80, 90, 95)).toBe(0);
  });
});

// ── Factor 12: Options Skew ──

describe("scoreOptionsSkew", () => {
  it("returns 0 for null", () => {
    expect(scoreOptionsSkew(null)).toBe(0);
  });

  it("returns 4 for heavy puts (1.5+)", () => {
    expect(scoreOptionsSkew(1.5)).toBe(4);
  });
});

// ── Factor 13: Trend Acceleration ──

describe("scoreTrendAcceleration", () => {
  it("returns 0 for insufficient data", () => {
    expect(scoreTrendAcceleration([100, 101])).toBe(0);
  });

  it("handles accelerating trend", () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i * 0.8);
    const score = scoreTrendAcceleration(closes);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(5);
  });
});

// ── Factor 15: Insider Buying ──

describe("scoreInsiderBuying", () => {
  it("returns 5 for 3+ purchases no sales", () => {
    expect(scoreInsiderBuying({ purchases: 3, sales: 0 })).toBe(5);
  });

  it("returns 0 for no activity", () => {
    expect(scoreInsiderBuying({ purchases: 0, sales: 0 })).toBe(0);
  });
});

// ── Factor 16: Institutional Ownership ──

describe("scoreInstitutionalOwnership", () => {
  it("returns 4 for 90%+", () => {
    expect(scoreInstitutionalOwnership(0.95)).toBe(4);
  });

  it("returns 0 for low ownership", () => {
    expect(scoreInstitutionalOwnership(0.10)).toBe(0);
  });
});

// ── Factor 17: Dark Pool Activity ──

describe("scoreDarkPoolActivity", () => {
  it("returns 0 for insufficient data", () => {
    expect(scoreDarkPoolActivity([100], [1000])).toBe(0);
  });
});

// ── Verdict Classification ──

describe("classifyVerdict", () => {
  it("returns PRE_SPIKE for 72+", () => {
    expect(classifyVerdict(72)).toBe("PRE_SPIKE");
    expect(classifyVerdict(100)).toBe("PRE_SPIKE");
  });

  it("returns WATCH for 55-71", () => {
    expect(classifyVerdict(55)).toBe("WATCH");
    expect(classifyVerdict(71)).toBe("WATCH");
  });

  it("returns MONITOR for 38-54", () => {
    expect(classifyVerdict(38)).toBe("MONITOR");
    expect(classifyVerdict(54)).toBe("MONITOR");
  });

  it("returns MISS for <38", () => {
    expect(classifyVerdict(37)).toBe("MISS");
    expect(classifyVerdict(0)).toBe("MISS");
  });
});

// ── Composite Score ──

describe("computeScores", () => {
  it("returns score between 0 and 100", () => {
    const data = makeRawData();
    const allData = new Map<string, CatalystRawData>();
    allData.set("TEST", data);

    const result = computeScores(data, 5, allData, null);
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it("normalizes based on MAX_ACHIEVABLE_SCORE", () => {
    expect(MAX_ACHIEVABLE_SCORE).toBe(100);
  });

  it("handles NaN in closes gracefully", () => {
    const data = makeRawData({ closes: [NaN, 100, 101, 102] });
    const allData = new Map<string, CatalystRawData>();
    allData.set("TEST", data);

    // Should not throw
    const result = computeScores(data, null, allData, null);
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
  });

  it("handles empty closes array", () => {
    const data = makeRawData({ closes: [], volumes: [] });
    const allData = new Map<string, CatalystRawData>();

    const result = computeScores(data, null, allData, null);
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
  });

  it("scores higher with imminent catalyst + high SI", () => {
    const bullish = makeRawData({
      shortPercentFloat: 25,
      ytdChange: -30,
      analystTarget: 160,
    });
    const neutral = makeRawData({
      shortPercentFloat: 1,
      ytdChange: 5,
      analystTarget: 100,
    });
    const allData = new Map<string, CatalystRawData>();

    const bullishResult = computeScores(bullish, 2, allData, null);
    const neutralResult = computeScores(neutral, null, allData, null);

    expect(bullishResult.totalScore).toBeGreaterThan(neutralResult.totalScore);
  });
});
