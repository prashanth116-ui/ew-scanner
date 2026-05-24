import { describe, it, expect } from "vitest";
import {
  matchesTFFilter,
  matchesTrendFilter,
  matchesBoolFilter,
  matchesVolFilter,
  rowPassesTFFilters,
  INIT_TF_FILTERS,
  INIT_TREND_FILTERS,
  INIT_BOOL_FILTERS,
  INIT_VOL_FILTERS,
  TF_FILTER_OPTIONS,
  TREND_FILTER_OPTIONS,
  VOL_FILTER_OPTIONS,
  TF_FILTER_PRESETS,
  type TFFilterValue,
  type TrendFilterValue,
  type LeadingFilters,
} from "./tf-filters";
import type { MultiTFM2Result, M2TimeframeResult } from "./types";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeTFR(scoreM2: number, trendStrength: M2TimeframeResult["trendStrength"] = null, extra?: Partial<M2TimeframeResult>): M2TimeframeResult {
  return {
    scoreM2,
    trendStrength,
    bullishCross: null,
    priceAboveBoth: null,
    dataPoints: null,
    displacementNearCross: null,
    fvgNearCross: null,
    volumeRatio: null,
    converging: null,
    spreadDelta: null,
    squeezed: null,
    atrRatio: null,
    ...extra,
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

    it("passes: 15m=2 with 4h/1d already moved (only wk/mo constrained)", () => {
      const row = makeRow("META", {
        "15m": 2, "1h": 1, "4h": 2, "12h": 0, "1d": 2, "1wk": 0, "1mo": 0,
      });
      expect(rowPassesTFFilters(row, preset)).toBe(true);
    });

    it("fails: 15m=2 but 1wk=2 (weekly already caught up)", () => {
      const row = makeRow("GOOG", {
        "15m": 2, "1h": 0, "4h": 0, "12h": 0, "1d": 0, "1wk": 2, "1mo": 0,
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

    it("passes when 4h is missing (4h is 'any' in preset)", () => {
      // 4h/12h/1d are "any" in preset — only wk/mo constrained
      const row = makeRow("PLTR", {
        "15m": 2, "1h": 0, /* 4h missing */ "12h": 0, "1d": 0, "1wk": 0, "1mo": 0,
      });
      expect(rowPassesTFFilters(row, preset)).toBe(true);
    });

    it("fails when 1wk is missing (1wk is 'lte1' in preset)", () => {
      const row = makeRow("PLTR", {
        "15m": 2, "1h": 0, "4h": 0, "12h": 0, "1d": 0, /* 1wk missing */ "1mo": 0,
      });
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

  it("VOL_FILTER_OPTIONS has 4 options", () => {
    expect(VOL_FILTER_OPTIONS).toHaveLength(4);
    expect(VOL_FILTER_OPTIONS.map((o) => o.value)).toEqual(["any", "gt1.5", "gt2", "gt3"]);
  });

  it("INIT_BOOL_FILTERS has all 7 timeframes set to any", () => {
    const tfs = ["15m", "1h", "4h", "12h", "1d", "1wk", "1mo"];
    for (const tf of tfs) {
      expect(INIT_BOOL_FILTERS[tf as keyof typeof INIT_BOOL_FILTERS]).toBe("any");
    }
  });

  it("INIT_VOL_FILTERS has all 7 timeframes set to any", () => {
    const tfs = ["15m", "1h", "4h", "12h", "1d", "1wk", "1mo"];
    for (const tf of tfs) {
      expect(INIT_VOL_FILTERS[tf as keyof typeof INIT_VOL_FILTERS]).toBe("any");
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

  it("pre_cross preset exists with correct structure", () => {
    const preCross = TF_FILTER_PRESETS.find((p) => p.id === "pre_cross");
    expect(preCross).toBeDefined();
    expect(preCross!.filters["15m"]).toBe("lte1"); // excludes already-crossed stocks
    expect(preCross!.leadingFilters?.conv?.["15m"]).toBe("yes");
    expect(preCross!.leadingFilters?.vol?.["15m"]).toBe("gt1.5");
  });

  it("coiled preset exists with correct structure", () => {
    const coiled = TF_FILTER_PRESETS.find((p) => p.id === "coiled");
    expect(coiled).toBeDefined();
    expect(coiled!.leadingFilters?.squeeze?.["1h"]).toBe("yes");
    expect(coiled!.leadingFilters?.conv?.["1h"]).toBe("yes");
  });

  it("early_mover preset exists with correct structure", () => {
    const em = TF_FILTER_PRESETS.find((p) => p.id === "early_mover");
    expect(em).toBeDefined();
    expect(em!.filters["15m"]).toBe("2");
    expect(em!.filters["1h"]).toBe("any");
    expect(em!.filters["4h"]).toBe("any");
    expect(em!.filters["1d"]).toBe("any");
    expect(em!.filters["1wk"]).toBe("lte1");
    expect(em!.filters["1mo"]).toBe("lte1");
  });

  it("confirmed preset requires 1h≥1", () => {
    const p = TF_FILTER_PRESETS.find((p) => p.id === "confirmed")!;
    expect(p.filters["15m"]).toBe("2");
    expect(p.filters["1h"]).toBe("gte1");
    expect(p.filters["4h"]).toBe("any");
    expect(p.filters["1wk"]).toBe("lte1");

    // 1h=0 fails confirmed
    const row0 = makeRow("A", { "15m": 2, "1h": 0, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0 });
    expect(rowPassesTFFilters(row0, p.filters)).toBe(false);
    // 1h=1 passes
    const row1 = makeRow("B", { "15m": 2, "1h": 1, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0 });
    expect(rowPassesTFFilters(row1, p.filters)).toBe(true);
  });

  it("stealth preset requires wk/mo exactly 0", () => {
    const p = TF_FILTER_PRESETS.find((p) => p.id === "stealth")!;
    expect(p.filters["4h"]).toBe("any");
    expect(p.filters["1wk"]).toBe("0");
    expect(p.filters["1mo"]).toBe("0");

    // wk=0, mo=0 passes
    const row = makeRow("C", { "15m": 2, "1h": 0, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0 });
    expect(rowPassesTFFilters(row, p.filters)).toBe(true);
    // wk=1 fails (not zero)
    const row2 = makeRow("D", { "15m": 2, "1h": 0, "4h": 1, "12h": 0, "1d": 0, "1wk": 1, "1mo": 0 });
    expect(rowPassesTFFilters(row2, p.filters)).toBe(false);
    // 4h=1 is fine since 4h is "any"
    const row3 = makeRow("E", { "15m": 2, "1h": 0, "4h": 1, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0 });
    expect(rowPassesTFFilters(row3, p.filters)).toBe(true);
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

// ---------------------------------------------------------------------------
// matchesBoolFilter
// ---------------------------------------------------------------------------

describe("matchesBoolFilter", () => {
  it('"any" passes every value including null', () => {
    expect(matchesBoolFilter(true, "any")).toBe(true);
    expect(matchesBoolFilter(false, "any")).toBe(true);
    expect(matchesBoolFilter(null, "any")).toBe(true);
    expect(matchesBoolFilter(undefined, "any")).toBe(true);
  });

  it('"yes" matches only true', () => {
    expect(matchesBoolFilter(true, "yes")).toBe(true);
    expect(matchesBoolFilter(false, "yes")).toBe(false);
    expect(matchesBoolFilter(null, "yes")).toBe(false);
  });

  it('"no" matches only false', () => {
    expect(matchesBoolFilter(false, "no")).toBe(true);
    expect(matchesBoolFilter(true, "no")).toBe(false);
    expect(matchesBoolFilter(null, "no")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchesVolFilter
// ---------------------------------------------------------------------------

describe("matchesVolFilter", () => {
  it('"any" passes every value including null', () => {
    expect(matchesVolFilter(0.5, "any")).toBe(true);
    expect(matchesVolFilter(5, "any")).toBe(true);
    expect(matchesVolFilter(null, "any")).toBe(true);
    expect(matchesVolFilter(undefined, "any")).toBe(true);
  });

  it('"gt1.5" matches ratios above 1.5', () => {
    expect(matchesVolFilter(1.6, "gt1.5")).toBe(true);
    expect(matchesVolFilter(2.0, "gt1.5")).toBe(true);
    expect(matchesVolFilter(1.5, "gt1.5")).toBe(false);
    expect(matchesVolFilter(1.0, "gt1.5")).toBe(false);
    expect(matchesVolFilter(null, "gt1.5")).toBe(false);
  });

  it('"gt2" matches ratios above 2', () => {
    expect(matchesVolFilter(2.1, "gt2")).toBe(true);
    expect(matchesVolFilter(2.0, "gt2")).toBe(false);
    expect(matchesVolFilter(1.5, "gt2")).toBe(false);
  });

  it('"gt3" matches ratios above 3', () => {
    expect(matchesVolFilter(3.1, "gt3")).toBe(true);
    expect(matchesVolFilter(3.0, "gt3")).toBe(false);
    expect(matchesVolFilter(2.5, "gt3")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rowPassesTFFilters with leading filters
// ---------------------------------------------------------------------------

describe("rowPassesTFFilters with leading filters", () => {
  function makeLeadingRow(
    ticker: string,
    data: Record<string, { score: number; volRatio?: number; conv?: boolean; sqz?: boolean }>,
  ): MultiTFM2Result {
    const timeframes: MultiTFM2Result["timeframes"] = {};
    for (const [tf, d] of Object.entries(data)) {
      timeframes[tf as keyof typeof timeframes] = makeTFR(d.score, null, {
        volumeRatio: d.volRatio ?? null,
        converging: d.conv ?? null,
        squeezed: d.sqz ?? null,
      });
    }
    return { ticker, timeframes };
  }

  it("volume filter on 15m works", () => {
    const row = makeLeadingRow("X", {
      "15m": { score: 1, volRatio: 2.5 },
      "1h": { score: 0 }, "4h": { score: 0 }, "12h": { score: 0 },
      "1d": { score: 0 }, "1wk": { score: 0 }, "1mo": { score: 0 },
    });
    const leading: LeadingFilters = {
      vol: { ...INIT_VOL_FILTERS, "15m": "gt2" },
    };
    expect(rowPassesTFFilters(row, { ...INIT_TF_FILTERS }, undefined, leading)).toBe(true);

    const leading2: LeadingFilters = {
      vol: { ...INIT_VOL_FILTERS, "15m": "gt3" },
    };
    expect(rowPassesTFFilters(row, { ...INIT_TF_FILTERS }, undefined, leading2)).toBe(false);
  });

  it("converging filter works", () => {
    const row = makeLeadingRow("Y", {
      "15m": { score: 1, conv: true },
      "1h": { score: 0, conv: false },
      "4h": { score: 0 }, "12h": { score: 0 },
      "1d": { score: 0 }, "1wk": { score: 0 }, "1mo": { score: 0 },
    });
    const leading: LeadingFilters = {
      conv: { ...INIT_BOOL_FILTERS, "15m": "yes" },
    };
    expect(rowPassesTFFilters(row, { ...INIT_TF_FILTERS }, undefined, leading)).toBe(true);

    const leading2: LeadingFilters = {
      conv: { ...INIT_BOOL_FILTERS, "1h": "yes" },
    };
    expect(rowPassesTFFilters(row, { ...INIT_TF_FILTERS }, undefined, leading2)).toBe(false);
  });

  it("squeeze filter works", () => {
    const row = makeLeadingRow("Z", {
      "15m": { score: 0 },
      "1h": { score: 0, sqz: true },
      "4h": { score: 0 }, "12h": { score: 0 },
      "1d": { score: 0 }, "1wk": { score: 0 }, "1mo": { score: 0 },
    });
    const leading: LeadingFilters = {
      squeeze: { ...INIT_BOOL_FILTERS, "1h": "yes" },
    };
    expect(rowPassesTFFilters(row, { ...INIT_TF_FILTERS }, undefined, leading)).toBe(true);
  });

  it("combined score + leading filters work", () => {
    const row = makeLeadingRow("COMBO", {
      "15m": { score: 2, volRatio: 2.0, conv: true },
      "1h": { score: 0 }, "4h": { score: 0 }, "12h": { score: 0 },
      "1d": { score: 0 }, "1wk": { score: 0 }, "1mo": { score: 0 },
    });
    const scoreFilters = { ...INIT_TF_FILTERS, "15m": "2" as TFFilterValue };
    const leading: LeadingFilters = {
      vol: { ...INIT_VOL_FILTERS, "15m": "gt1.5" },
      conv: { ...INIT_BOOL_FILTERS, "15m": "yes" },
    };
    expect(rowPassesTFFilters(row, scoreFilters, undefined, leading)).toBe(true);

    // Score matches but vol doesn't
    const row2 = makeLeadingRow("COMBO2", {
      "15m": { score: 2, volRatio: 1.0, conv: true },
      "1h": { score: 0 }, "4h": { score: 0 }, "12h": { score: 0 },
      "1d": { score: 0 }, "1wk": { score: 0 }, "1mo": { score: 0 },
    });
    expect(rowPassesTFFilters(row2, scoreFilters, undefined, leading)).toBe(false);
  });

  it("null leading filters behaves like all-any", () => {
    const row = makeRow("X", { "15m": 2, "1h": 0, "4h": 0, "12h": 0, "1d": 0, "1wk": 0, "1mo": 0 });
    expect(rowPassesTFFilters(row, { ...INIT_TF_FILTERS }, undefined, undefined)).toBe(true);
  });
});
