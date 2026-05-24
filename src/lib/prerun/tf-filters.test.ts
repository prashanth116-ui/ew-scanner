import { describe, it, expect } from "vitest";
import {
  matchesTFFilter,
  matchesTrendFilter,
  rowPassesTFFilters,
  INIT_TF_FILTERS,
  INIT_TREND_FILTERS,
  TF_FILTER_OPTIONS,
  TREND_FILTER_OPTIONS,
  TF_FILTER_PRESETS,
  type TFFilterValue,
  type TrendFilterValue,
} from "./tf-filters";
import type { MultiTFM2Result, M2TimeframeResult } from "./types";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeTFR(scoreM2: number, trendStrength: M2TimeframeResult["trendStrength"] = null): M2TimeframeResult {
  return {
    scoreM2,
    trendStrength,
    bullishCross: null,
    priceAboveBoth: null,
    dataPoints: null,
    displacementNearCross: null,
    fvgNearCross: null,
  };
}

function makeRow(
  ticker: string,
  scores: Record<string, number>,
): MultiTFM2Result {
  const timeframes: MultiTFM2Result["timeframes"] = {};
  for (const [tf, score] of Object.entries(scores)) {
    timeframes[tf as keyof typeof timeframes] = makeTFR(score);
  }
  return { ticker, timeframes };
}

function makeRowWithTrend(
  ticker: string,
  data: Record<string, { score: number; trend: M2TimeframeResult["trendStrength"] }>,
): MultiTFM2Result {
  const timeframes: MultiTFM2Result["timeframes"] = {};
  for (const [tf, d] of Object.entries(data)) {
    timeframes[tf as keyof typeof timeframes] = makeTFR(d.score, d.trend);
  }
  return { ticker, timeframes };
}

// ---------------------------------------------------------------------------
// matchesTFFilter — exhaustive per-value tests
// ---------------------------------------------------------------------------

describe("matchesTFFilter", () => {
  it('"any" passes every score including null', () => {
    expect(matchesTFFilter(0, "any")).toBe(true);
    expect(matchesTFFilter(1, "any")).toBe(true);
    expect(matchesTFFilter(2, "any")).toBe(true);
    expect(matchesTFFilter(null, "any")).toBe(true);
    expect(matchesTFFilter(undefined, "any")).toBe(true);
  });

  it('"0" matches only score 0', () => {
    expect(matchesTFFilter(0, "0")).toBe(true);
    expect(matchesTFFilter(1, "0")).toBe(false);
    expect(matchesTFFilter(2, "0")).toBe(false);
  });

  it('"1" matches only score 1', () => {
    expect(matchesTFFilter(0, "1")).toBe(false);
    expect(matchesTFFilter(1, "1")).toBe(true);
    expect(matchesTFFilter(2, "1")).toBe(false);
  });

  it('"2" matches only score 2', () => {
    expect(matchesTFFilter(0, "2")).toBe(false);
    expect(matchesTFFilter(1, "2")).toBe(false);
    expect(matchesTFFilter(2, "2")).toBe(true);
  });

  it('"lte1" matches 0 and 1 but not 2', () => {
    expect(matchesTFFilter(0, "lte1")).toBe(true);
    expect(matchesTFFilter(1, "lte1")).toBe(true);
    expect(matchesTFFilter(2, "lte1")).toBe(false);
  });

  it('"gte1" matches 1 and 2 but not 0', () => {
    expect(matchesTFFilter(0, "gte1")).toBe(false);
    expect(matchesTFFilter(1, "gte1")).toBe(true);
    expect(matchesTFFilter(2, "gte1")).toBe(true);
  });

  it("null / undefined score fails any non-any filter", () => {
    const filters: TFFilterValue[] = ["0", "1", "2", "lte1", "gte1"];
    for (const f of filters) {
      expect(matchesTFFilter(null, f)).toBe(false);
      expect(matchesTFFilter(undefined, f)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// rowPassesTFFilters — composite filter tests
// ---------------------------------------------------------------------------

describe("rowPassesTFFilters", () => {
  it("all-any filters pass every row", () => {
    const row = makeRow("AAPL", { "15m": 0, "1h": 1, "4h": 2 });
    expect(rowPassesTFFilters(row, { ...INIT_TF_FILTERS })).toBe(true);
  });

  it("single exact filter works", () => {
    const row = makeRow("AAPL", {
      "15m": 2, "1h": 1, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0,
    });
    const filters = { ...INIT_TF_FILTERS, "15m": "2" as TFFilterValue };
    expect(rowPassesTFFilters(row, filters)).toBe(true);

    const filtersFail = { ...INIT_TF_FILTERS, "15m": "0" as TFFilterValue };
    expect(rowPassesTFFilters(row, filtersFail)).toBe(false);
  });

  // The key preset: Early Mover (15m=2, higher TFs ≤1)
  describe("preset: Early Mover", () => {
    const earlyMover = TF_FILTER_PRESETS.find((p) => p.id === "early_mover")!;
    const preset = earlyMover.filters;

    it("passes: 15m=2, all higher TFs 0", () => {
      const row = makeRow("TSLA", {
        "15m": 2, "1h": 0, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0,
      });
      expect(rowPassesTFFilters(row, preset)).toBe(true);
    });

    it("passes: 15m=2, higher TFs mix of 0 and 1", () => {
      const row = makeRow("NVDA", {
        "15m": 2, "1h": 1, "4h": 1, "12h": 0, "1d": 0, "1wk": 1, "1mo": 0,
      });
      expect(rowPassesTFFilters(row, preset)).toBe(true);
    });

    it("fails: 15m=1 (not strong enough)", () => {
      const row = makeRow("AMD", {
        "15m": 1, "1h": 0, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0,
      });
      expect(rowPassesTFFilters(row, preset)).toBe(false);
    });

    it("fails: 15m=2 but 4h=2 (higher TF already moved)", () => {
      const row = makeRow("META", {
        "15m": 2, "1h": 1, "4h": 2, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0,
      });
      expect(rowPassesTFFilters(row, preset)).toBe(false);
    });

    it("fails: 15m=2 but 1d=2 (daily already strong)", () => {
      const row = makeRow("GOOG", {
        "15m": 2, "1h": 0, "4h": 0, "12h": 0, "1d": 2, "1wk": 0, "1mo": 0,
      });
      expect(rowPassesTFFilters(row, preset)).toBe(false);
    });

    it("fails: missing 15m data treated as not passing", () => {
      const row = makeRow("COIN", {
        "1h": 0, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0,
      });
      expect(rowPassesTFFilters(row, preset)).toBe(false);
    });
  });

  it("missing timeframe data fails non-any filter", () => {
    // Row only has 15m data, filter on 4h=0 should fail (no 4h data)
    const row = makeRow("X", { "15m": 2 });
    const filters = { ...INIT_TF_FILTERS, "4h": "0" as TFFilterValue };
    expect(rowPassesTFFilters(row, filters)).toBe(false);
  });

  it("missing timeframe data passes any filter", () => {
    const row = makeRow("X", { "15m": 2 });
    // All filters "any" — missing TFs pass
    expect(rowPassesTFFilters(row, { ...INIT_TF_FILTERS })).toBe(true);
  });

  it("null timeframe result fails non-any filter", () => {
    const row: MultiTFM2Result = {
      ticker: "Y",
      timeframes: { "15m": null, "1h": makeTFR(1) },
    };
    const filters = { ...INIT_TF_FILTERS, "15m": "0" as TFFilterValue };
    expect(rowPassesTFFilters(row, filters)).toBe(false);
  });

  // Partial data scenarios — when API fails for some timeframes
  describe("partial data (API failures)", () => {
    const earlyMover = TF_FILTER_PRESETS.find((p) => p.id === "early_mover")!;
    const preset = earlyMover.filters;

    it("fails when 4h is missing even though stock would qualify", () => {
      // Stock has 15m=2 and all present higher TFs are 0, but 4h failed to fetch
      const row = makeRow("PLTR", {
        "15m": 2, "1h": 0, /* 4h missing */ "12h": 0, "1d": 0, "1wk": 0, "1mo": 0,
      });
      // lte1 filter on missing 4h → fails (defensive: missing ≠ 0)
      expect(rowPassesTFFilters(row, preset)).toBe(false);
    });

    it("passes when only unfiltered timeframes are missing", () => {
      // 1h is "any" in the preset, so missing 1h doesn't matter
      const row = makeRow("SOFI", {
        "15m": 2, /* 1h missing */ "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0,
      });
      expect(rowPassesTFFilters(row, preset)).toBe(true);
    });

    it("Phase 1 only data (only 1d present) fails preset", () => {
      // Phase 2 completely failed — only 1d from Phase 1
      const row = makeRow("RIVN", { "1d": 0 });
      expect(rowPassesTFFilters(row, preset)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// matchesTrendFilter
// ---------------------------------------------------------------------------

describe("matchesTrendFilter", () => {
  it('"any" passes every trend including null', () => {
    expect(matchesTrendFilter("strong", "any")).toBe(true);
    expect(matchesTrendFilter("bearish", "any")).toBe(true);
    expect(matchesTrendFilter(null, "any")).toBe(true);
  });

  it("exact match filters work", () => {
    expect(matchesTrendFilter("strong", "strong")).toBe(true);
    expect(matchesTrendFilter("moderate", "strong")).toBe(false);
    expect(matchesTrendFilter("bearish", "bearish")).toBe(true);
    expect(matchesTrendFilter("strong", "bearish")).toBe(false);
  });

  it('"gte_moderate" matches strong and moderate only', () => {
    expect(matchesTrendFilter("strong", "gte_moderate")).toBe(true);
    expect(matchesTrendFilter("moderate", "gte_moderate")).toBe(true);
    expect(matchesTrendFilter("weak", "gte_moderate")).toBe(false);
    expect(matchesTrendFilter("bearish", "gte_moderate")).toBe(false);
  });

  it('"gte_weak" matches strong, moderate, and weak', () => {
    expect(matchesTrendFilter("strong", "gte_weak")).toBe(true);
    expect(matchesTrendFilter("moderate", "gte_weak")).toBe(true);
    expect(matchesTrendFilter("weak", "gte_weak")).toBe(true);
    expect(matchesTrendFilter("bearish", "gte_weak")).toBe(false);
  });

  it("null trend fails any non-any filter", () => {
    const filters: TrendFilterValue[] = ["strong", "moderate", "weak", "bearish", "gte_moderate", "gte_weak"];
    for (const f of filters) {
      expect(matchesTrendFilter(null, f)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// rowPassesTFFilters with trend filters
// ---------------------------------------------------------------------------

describe("rowPassesTFFilters with trend", () => {
  it("trend filter works alongside score filter", () => {
    const row = makeRowWithTrend("AAPL", {
      "15m": { score: 2, trend: "strong" },
      "1h": { score: 1, trend: "moderate" },
      "4h": { score: 0, trend: "bearish" },
      "12h": { score: 0, trend: "bearish" },
      "1d": { score: 0, trend: "bearish" },
      "1wk": { score: 0, trend: "bearish" },
      "1mo": { score: 0, trend: "bearish" },
    });
    const scoreFilters = { ...INIT_TF_FILTERS, "15m": "2" as TFFilterValue };
    const trendF = { ...INIT_TREND_FILTERS, "15m": "strong" as TrendFilterValue };
    expect(rowPassesTFFilters(row, scoreFilters, trendF)).toBe(true);

    // Trend doesn't match → fails
    const trendF2 = { ...INIT_TREND_FILTERS, "15m": "weak" as TrendFilterValue };
    expect(rowPassesTFFilters(row, scoreFilters, trendF2)).toBe(false);
  });

  it("trend filter on higher TFs: filter bearish only", () => {
    const row = makeRowWithTrend("TSLA", {
      "15m": { score: 2, trend: "strong" },
      "1h": { score: 1, trend: "moderate" },
      "4h": { score: 0, trend: "bearish" },
      "12h": { score: 0, trend: "bearish" },
      "1d": { score: 0, trend: "bearish" },
      "1wk": { score: 0, trend: "bearish" },
      "1mo": { score: 0, trend: "bearish" },
    });
    const trendF = { ...INIT_TREND_FILTERS, "4h": "bearish" as TrendFilterValue };
    expect(rowPassesTFFilters(row, { ...INIT_TF_FILTERS }, trendF)).toBe(true);

    // 4h is moderate, filter wants bearish → fails
    const row2 = makeRowWithTrend("NVDA", {
      "15m": { score: 2, trend: "strong" },
      "1h": { score: 1, trend: "moderate" },
      "4h": { score: 1, trend: "moderate" },
      "12h": { score: 0, trend: "bearish" },
      "1d": { score: 0, trend: "bearish" },
      "1wk": { score: 0, trend: "bearish" },
      "1mo": { score: 0, trend: "bearish" },
    });
    expect(rowPassesTFFilters(row2, { ...INIT_TF_FILTERS }, trendF)).toBe(false);
  });

  it("no trend filters passed behaves like all-any", () => {
    const row = makeRow("X", { "15m": 2, "1h": 0, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0 });
    const scoreFilters = { ...INIT_TF_FILTERS, "15m": "2" as TFFilterValue };
    // undefined trendFilters
    expect(rowPassesTFFilters(row, scoreFilters)).toBe(true);
    expect(rowPassesTFFilters(row, scoreFilters, undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// constants sanity
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("INIT_TF_FILTERS has all 7 timeframes set to any", () => {
    const tfs = ["15m", "1h", "4h", "12h", "1d", "1wk", "1mo"];
    for (const tf of tfs) {
      expect(INIT_TF_FILTERS[tf as keyof typeof INIT_TF_FILTERS]).toBe("any");
    }
    expect(Object.keys(INIT_TF_FILTERS)).toHaveLength(7);
  });

  it("TF_FILTER_OPTIONS has 6 options", () => {
    expect(TF_FILTER_OPTIONS).toHaveLength(6);
    const values = TF_FILTER_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["any", "0", "1", "2", "lte1", "gte1"]);
  });

  it("TREND_FILTER_OPTIONS has 7 options", () => {
    expect(TREND_FILTER_OPTIONS).toHaveLength(7);
    const values = TREND_FILTER_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["any", "strong", "moderate", "weak", "bearish", "gte_moderate", "gte_weak"]);
  });

  it("INIT_TREND_FILTERS has all 7 timeframes set to any", () => {
    const tfs = ["15m", "1h", "4h", "12h", "1d", "1wk", "1mo"];
    for (const tf of tfs) {
      expect(INIT_TREND_FILTERS[tf as keyof typeof INIT_TREND_FILTERS]).toBe("any");
    }
  });

  it("every preset has all 7 timeframes with valid filter values", () => {
    const validValues = new Set(TF_FILTER_OPTIONS.map((o) => o.value));
    const tfs = ["15m", "1h", "4h", "12h", "1d", "1wk", "1mo"];
    for (const preset of TF_FILTER_PRESETS) {
      for (const tf of tfs) {
        const val = preset.filters[tf as keyof typeof preset.filters];
        expect(val, `${preset.id}.${tf}`).toBeDefined();
        expect(validValues.has(val), `${preset.id}.${tf}=${val} is not a valid filter value`).toBe(true);
      }
    }
  });

  it("early_mover preset exists with correct structure", () => {
    const em = TF_FILTER_PRESETS.find((p) => p.id === "early_mover");
    expect(em).toBeDefined();
    expect(em!.filters["15m"]).toBe("2");
    expect(em!.filters["1h"]).toBe("any");
    expect(em!.filters["4h"]).toBe("lte1");
    expect(em!.filters["1wk"]).toBe("lte1");
  });

  it("confirmed preset requires 1h≥1", () => {
    const p = TF_FILTER_PRESETS.find((p) => p.id === "confirmed")!;
    expect(p.filters["15m"]).toBe("2");
    expect(p.filters["1h"]).toBe("gte1");
    expect(p.filters["4h"]).toBe("lte1");

    // 1h=0 fails confirmed
    const row0 = makeRow("A", { "15m": 2, "1h": 0, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0 });
    expect(rowPassesTFFilters(row0, p.filters)).toBe(false);
    // 1h=1 passes
    const row1 = makeRow("B", { "15m": 2, "1h": 1, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0 });
    expect(rowPassesTFFilters(row1, p.filters)).toBe(true);
  });

  it("stealth preset requires higher TFs exactly 0", () => {
    const p = TF_FILTER_PRESETS.find((p) => p.id === "stealth")!;
    expect(p.filters["4h"]).toBe("0");
    expect(p.filters["1mo"]).toBe("0");

    // All higher TFs at 0 passes
    const row = makeRow("C", { "15m": 2, "1h": 0, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0 });
    expect(rowPassesTFFilters(row, p.filters)).toBe(true);
    // 4h=1 fails (not zero)
    const row2 = makeRow("D", { "15m": 2, "1h": 0, "4h": 1, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0 });
    expect(rowPassesTFFilters(row2, p.filters)).toBe(false);
  });

  it("cascade preset requires both 15m=2 and 1h=2", () => {
    const p = TF_FILTER_PRESETS.find((p) => p.id === "cascade")!;
    expect(p.filters["15m"]).toBe("2");
    expect(p.filters["1h"]).toBe("2");

    // Both 15m=2 and 1h=2 passes
    const row = makeRow("E", { "15m": 2, "1h": 2, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0 });
    expect(rowPassesTFFilters(row, p.filters)).toBe(true);
    // 1h=1 fails cascade
    const row2 = makeRow("F", { "15m": 2, "1h": 1, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0 });
    expect(rowPassesTFFilters(row2, p.filters)).toBe(false);
  });
});
