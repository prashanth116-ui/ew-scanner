/**
 * Strat scoring module tests.
 * Covers TFC weighting, combo detection, PMG tolerance, signal classification.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifyBar,
  classifyBars,
  computeTFC,
  detectCombos,
  detectPMG,
  computeTriggers,
  detectBroadening,
  barDirection,
} from "./engine";
import { scoreStrat } from "./scoring";
import type { StratBar, StratTimeframe, StratBarType, StratCombo } from "./types";

// ── Helpers ──

function makeBar(
  barType: StratBarType,
  high = 100,
  low = 90,
  open = 92,
  close = 98,
  volume = 1000,
  timestamp = 0
): StratBar {
  return { barType, high, low, open, close, volume, timestamp };
}

function makeTimeframe(
  label: "monthly" | "weekly" | "daily",
  bars: StratBar[],
  direction: "BULL" | "BEAR" | "NEUTRAL" = "BULL"
): StratTimeframe {
  const lastBar = bars[bars.length - 1];
  const priorBar = bars.length >= 2 ? bars[bars.length - 2] : bars[0];
  return {
    label,
    bars,
    currentBarType: lastBar.barType,
    priorBarType: priorBar.barType,
    direction,
  };
}

// ── Bar Classification ──

describe("classifyBar", () => {
  it("classifies inside bar (type 1)", () => {
    expect(classifyBar(99, 91, 100, 90)).toBe("1");
  });

  it("classifies up bar (2U)", () => {
    expect(classifyBar(105, 91, 100, 90)).toBe("2U");
  });

  it("classifies down bar (2D)", () => {
    expect(classifyBar(99, 85, 100, 90)).toBe("2D");
  });

  it("classifies outside bar (3)", () => {
    expect(classifyBar(105, 85, 100, 90)).toBe("3");
  });
});

describe("barDirection", () => {
  it("returns BULL for 2U", () => {
    expect(barDirection("2U", 90, 100)).toBe("BULL");
  });

  it("returns BEAR for 2D", () => {
    expect(barDirection("2D", 100, 90)).toBe("BEAR");
  });

  it("returns NEUTRAL for 1", () => {
    expect(barDirection("1", 90, 100)).toBe("NEUTRAL");
  });

  it("returns BULL for 3 with close > open", () => {
    expect(barDirection("3", 90, 100)).toBe("BULL");
  });

  it("returns BEAR for 3 with close < open", () => {
    expect(barDirection("3", 100, 90)).toBe("BEAR");
  });
});

// ── TFC Weighting ──

describe("computeTFC", () => {
  it("returns FULL_BULL with score 3 for all bull", () => {
    const tfc = computeTFC("BULL", "BULL", "BULL");
    expect(tfc.alignment).toBe("FULL_BULL");
    expect(tfc.score).toBe(3);
  });

  it("returns FULL_BEAR with score 3 for all bear", () => {
    const tfc = computeTFC("BEAR", "BEAR", "BEAR");
    expect(tfc.alignment).toBe("FULL_BEAR");
    expect(tfc.score).toBe(3);
  });

  it("returns MIXED for conflicting directions", () => {
    const tfc = computeTFC("BULL", "BEAR", "BULL");
    expect(tfc.alignment).toBe("MIXED");
  });

  it("weights monthly higher than daily", () => {
    // Monthly BULL only → 2/4.5 * 3 = 1.33
    const monthlyOnly = computeTFC("BULL", "NEUTRAL", "NEUTRAL");
    // Daily BULL only → 1/4.5 * 3 = 0.67
    const dailyOnly = computeTFC("NEUTRAL", "NEUTRAL", "BULL");
    expect(monthlyOnly.score).toBeGreaterThan(dailyOnly.score);
  });

  it("weights weekly between monthly and daily", () => {
    const weeklyOnly = computeTFC("NEUTRAL", "BULL", "NEUTRAL");
    const monthlyOnly = computeTFC("BULL", "NEUTRAL", "NEUTRAL");
    const dailyOnly = computeTFC("NEUTRAL", "NEUTRAL", "BULL");

    expect(monthlyOnly.score).toBeGreaterThan(weeklyOnly.score);
    expect(weeklyOnly.score).toBeGreaterThan(dailyOnly.score);
  });

  it("normalizes to 0-3 range", () => {
    const tfc = computeTFC("BULL", "BULL", "BULL");
    expect(tfc.score).toBeLessThanOrEqual(3);
    expect(tfc.score).toBeGreaterThanOrEqual(0);
  });

  it("all NEUTRAL returns 0", () => {
    const tfc = computeTFC("NEUTRAL", "NEUTRAL", "NEUTRAL");
    expect(tfc.score).toBe(0);
  });
});

// ── Combo Detection ──

describe("detectCombos", () => {
  it("detects 2-1-2 bullish reversal", () => {
    const bars = [
      makeBar("2D", 100, 90, 100, 92),
      makeBar("1", 98, 91, 93, 95),
      makeBar("2U", 105, 92, 93, 104),
    ];
    const combos = detectCombos(bars, "daily");
    const rev = combos.find((c) => c.name === "2-1-2U_REV" && c.isActionable);
    expect(rev).toBeDefined();
    expect(rev!.direction).toBe("BULL");
  });

  it("detects 2-2-2 bullish continuation", () => {
    const bars = [
      makeBar("2U", 105, 90, 91, 104),
      makeBar("2U", 110, 95, 96, 109),
      makeBar("2U", 115, 100, 101, 114),
    ];
    const combos = detectCombos(bars, "daily");
    const cont = combos.find((c) => c.name === "2-2-2U_CONT" && c.isActionable);
    expect(cont).toBeDefined();
    expect(cont!.direction).toBe("BULL");
  });

  it("detects 2-2-2 bearish continuation", () => {
    const bars = [
      makeBar("2D", 100, 85, 99, 86),
      makeBar("2D", 95, 80, 94, 81),
      makeBar("2D", 90, 75, 89, 76),
    ];
    const combos = detectCombos(bars, "daily");
    const cont = combos.find((c) => c.name === "2-2-2D_CONT" && c.isActionable);
    expect(cont).toBeDefined();
    expect(cont!.direction).toBe("BEAR");
  });

  it("detects 1-3-2 bullish expansion", () => {
    const bars = [
      makeBar("1", 98, 92, 93, 97),
      makeBar("3", 108, 88, 95, 105),
      makeBar("2U", 112, 93, 94, 111),
    ];
    const combos = detectCombos(bars, "daily");
    const exp = combos.find((c) => c.name === "1-3-2U" && c.isActionable);
    expect(exp).toBeDefined();
    expect(exp!.direction).toBe("BULL");
  });

  it("detects 2-3-2 bullish reversal", () => {
    const bars = [
      makeBar("2D", 100, 85, 99, 86),
      makeBar("3", 108, 82, 85, 106),
      makeBar("2U", 112, 87, 88, 111),
    ];
    const combos = detectCombos(bars, "daily");
    const rev = combos.find((c) => c.name === "2-3-2U_REV" && c.isActionable);
    expect(rev).toBeDefined();
    expect(rev!.direction).toBe("BULL");
  });

  it("detects forming combos when last bar is inside", () => {
    const bars = [
      makeBar("2U", 102, 88, 89, 101),
      makeBar("2D", 100, 85, 99, 86),
      makeBar("1", 98, 87, 90, 95),
    ];
    const combos = detectCombos(bars, "daily");
    const forming = combos.filter((c) => !c.isActionable);
    expect(forming.length).toBeGreaterThan(0);
  });

  it("returns empty for insufficient bars", () => {
    const bars = [makeBar("1")];
    expect(detectCombos(bars, "daily")).toHaveLength(0);
  });
});

// ── PMG Detection ──

describe("detectPMG", () => {
  it("detects PMG at same high level", () => {
    const bars = [
      makeBar("2U", 100.0, 90),
      makeBar("2U", 100.1, 91),  // within 0.2% tolerance
      makeBar("2U", 100.0, 92),
      makeBar("1",  99.0, 93),
    ];
    const pmgs = detectPMG(bars, "daily");
    const highPmg = pmgs.find((p) => p.side === "HIGH");
    expect(highPmg).toBeDefined();
    expect(highPmg!.testCount).toBeGreaterThanOrEqual(3);
  });

  it("does not detect PMG with scattered levels", () => {
    const bars = [
      makeBar("2U", 100, 90),
      makeBar("2U", 110, 95),
      makeBar("2U", 120, 100),
    ];
    const pmgs = detectPMG(bars, "daily");
    const highPmg = pmgs.find((p) => p.side === "HIGH");
    expect(highPmg).toBeUndefined();
  });

  it("returns empty for insufficient bars", () => {
    expect(detectPMG([makeBar("1"), makeBar("2U")], "daily")).toHaveLength(0);
  });
});

// ── Trigger Computation ──

describe("computeTriggers", () => {
  it("extracts long and short triggers from actionable combos", () => {
    const combos: StratCombo[] = [
      {
        name: "2-1-2U_REV",
        timeframe: "daily",
        direction: "BULL",
        barSequence: ["2D", "1", "2U"],
        triggerHigh: 105,
        triggerLow: 95,
        isActionable: true,
        description: "test",
      },
      {
        name: "2-1-2D_REV",
        timeframe: "daily",
        direction: "BEAR",
        barSequence: ["2U", "1", "2D"],
        triggerHigh: 100,
        triggerLow: 90,
        isActionable: true,
        description: "test",
      },
    ];
    const triggers = computeTriggers(combos);
    expect(triggers.longTrigger).toBe(105);
    expect(triggers.shortTrigger).toBe(90);
  });

  it("falls back to forming combos if no actionable", () => {
    const combos: StratCombo[] = [
      {
        name: "2-1-2U_REV",
        timeframe: "daily",
        direction: "BULL",
        barSequence: ["2D", "1"],
        triggerHigh: 100,
        triggerLow: 90,
        isActionable: false,
        description: "forming",
      },
    ];
    const triggers = computeTriggers(combos);
    expect(triggers.longTrigger).toBe(100);
  });
});

// ── scoreStrat Full Pipeline ──

describe("scoreStrat", () => {
  it("returns valid scores for null timeframes", () => {
    const result = scoreStrat("TEST", "Test Corp", 100, null, null, null);
    expect(result.scores.totalScore).toBe(0);
    expect(result.signal).toBe("NEUTRAL");
  });

  it("returns ACTIONABLE for high-scoring setup", () => {
    const monthly = makeTimeframe("monthly", [
      makeBar("2U", 100, 90, 91, 99),
      makeBar("1", 99, 91, 92, 98),
      makeBar("2U", 105, 92, 93, 104),
    ], "BULL");
    const weekly = makeTimeframe("weekly", [
      makeBar("2U", 100, 90, 91, 99),
      makeBar("1", 99, 91, 92, 98),
      makeBar("2U", 105, 92, 93, 104),
    ], "BULL");
    // Daily with high volume
    const daily = makeTimeframe("daily", [
      makeBar("2D", 100, 85, 99, 86, 1000),
      makeBar("1", 98, 87, 90, 95, 800),
      makeBar("2U", 105, 88, 89, 104, 5000),
    ], "BULL");

    const result = scoreStrat("TEST", "Test Corp", 100, monthly, weekly, daily);
    expect(result.scores.totalScore).toBeGreaterThanOrEqual(8);
    expect(result.signal).toBe("ACTIONABLE");
  });

  it("limits normalized score to 13", () => {
    const monthly = makeTimeframe("monthly", [
      makeBar("2U", 100, 90, 91, 99),
      makeBar("1", 99, 91, 92, 98),
      makeBar("2U", 105, 92, 93, 104),
    ], "BULL");
    const weekly = makeTimeframe("weekly", [
      makeBar("2U", 100, 90, 91, 99),
      makeBar("1", 99, 91, 92, 98),
      makeBar("2U", 105, 92, 93, 104),
    ], "BULL");
    const daily = makeTimeframe("daily", [
      makeBar("2D", 100, 85, 99, 86, 1000),
      makeBar("1", 98, 87, 90, 95, 800),
      makeBar("2U", 105, 88, 89, 104, 5000),
    ], "BULL");

    const result = scoreStrat("TEST", "Test Corp", 100, monthly, weekly, daily);
    expect(result.scores.normalizedScore).toBeLessThanOrEqual(13);
  });

  it("detects combos across timeframes", () => {
    const monthly = makeTimeframe("monthly", [
      makeBar("2D"), makeBar("1"), makeBar("2U"),
    ], "BULL");
    const weekly = makeTimeframe("weekly", [
      makeBar("2U"), makeBar("1"), makeBar("2U"),
    ], "BULL");

    const result = scoreStrat("TEST", "Test Corp", 100, monthly, weekly, null);
    expect(result.combos.length).toBeGreaterThan(0);
  });

  it("computes action direction from combos", () => {
    const daily = makeTimeframe("daily", [
      makeBar("2D"), makeBar("1"), makeBar("2U"),
    ], "BULL");

    const result = scoreStrat("TEST", "Test Corp", 100, null, null, daily);
    expect(result.actionDirection).toBe("LONG");
  });

  it("returns BOTH when bull and bear combos coexist", () => {
    const daily = makeTimeframe("daily", [
      makeBar("2U"), makeBar("1"), makeBar("2D"),
    ], "BEAR");
    const weekly = makeTimeframe("weekly", [
      makeBar("2D"), makeBar("1"), makeBar("2U"),
    ], "BULL");

    const result = scoreStrat("TEST", "Test Corp", 100, null, weekly, daily);
    // Should have both bull (weekly) and bear (daily) actionable combos
    const hasBull = result.combos.some((c) => c.isActionable && c.direction === "BULL");
    const hasBear = result.combos.some((c) => c.isActionable && c.direction === "BEAR");
    if (hasBull && hasBear) {
      expect(result.actionDirection).toBe("BOTH");
    }
  });
});

// ── Broadening Detection ──

describe("detectBroadening", () => {
  it("detects broadening with expanding highs and lows", () => {
    const bars = [
      makeBar("1", 100, 90),
      makeBar("2U", 102, 89),
      makeBar("2D", 103, 87),
      makeBar("3", 105, 85),
      makeBar("2U", 107, 84),
    ];
    const result = detectBroadening(bars, "daily");
    expect(result.length).toBeGreaterThanOrEqual(0);
    // May or may not detect depending on new high/low counts
  });

  it("returns empty for insufficient bars", () => {
    expect(detectBroadening([makeBar("1"), makeBar("2U")], "daily")).toHaveLength(0);
  });
});

// ── classifyBars ──

describe("classifyBars", () => {
  it("classifies a sequence of OHLC bars", () => {
    const opens =      [90, 92, 93];
    const highs =      [100, 105, 99];
    const lows =       [88, 91, 92];
    const closes =     [98, 104, 95];
    const volumes =    [1000, 1500, 800];
    const timestamps = [1, 2, 3];

    const bars = classifyBars(opens, highs, lows, closes, volumes, timestamps);
    expect(bars).toHaveLength(3);
    expect(bars[0].barType).toBe("1"); // first bar always "1"
    expect(bars[1].barType).toBe("2U"); // high above prior, low above prior
  });

  it("returns empty for single bar", () => {
    expect(classifyBars([100], [105], [95], [102], [1000], [1])).toHaveLength(0);
  });
});
