import { describe, it, expect } from "vitest";
import { evaluateEntryScreen, entryScreenReason, liveGateDrift } from "./entry-screen";
import { ENTRY_SCREEN } from "./config";
import type { ActiveRotationDetail, RotationStockPerformance } from "./rotation-types";

function stock(
  symbol: string,
  o: {
    ret20?: number | null;
    atr?: number | null;
    breakout?: boolean | null;
    aboveAtStart?: boolean | null;
    aboveNow?: boolean;
  } = {},
): RotationStockPerformance {
  return {
    symbol, name: symbol,
    priceAtRotationStart: 100, priceNow: 100, performancePct: 0,
    aboveSma50: o.aboveNow === undefined ? true : o.aboveNow,
    volumeVsAvg: 1, rsAcceleration: 0, trendAccel: 0,
    dailyChangePct: 0, isTurnaroundCandidate: false, daysToEarnings: null,
    nextEarningsDate: null, rs20d: null, rsAccelPrior: 0, rsImproving: false,
    rsDelta: 0, volumeConsistency: 0, verdict: null, finalScore: null,
    atrPctAtStart: o.atr === undefined ? 5 : o.atr,
    ret20AtStart: o.ret20 === undefined ? 10 : o.ret20,
    breakout20AtStart: o.breakout === undefined ? true : o.breakout,
    aboveSma50AtStart: o.aboveAtStart === undefined ? true : o.aboveAtStart,
    rsVsSector20: null,
  };
}

function detail(
  stocks: RotationStockPerformance[],
  gate: { cmfAtStart?: number | null; accelAtStart?: number | null; cmfNow?: number | null; accelNow?: number | null } = {},
): ActiveRotationDetail {
  return {
    event: {
      sectorId: "s", sectorName: "S", etf: "XYZ", startDate: "2026-01-01", endDate: null,
      daysActive: 5, etfPriceAtStart: 100, etfPriceNow: 105, etfPerformancePct: 5,
      signals: { rsGoldenCross: true, volumeSurge: false, priceAbove50MA: true, signalCount: 2 },
      health: { acceleration: 1, cmf20: 0.1, quadrant: "LEADING" },
      cmfAtStart: gate.cmfAtStart === undefined ? 0.05 : gate.cmfAtStart,
      accelAtStart: gate.accelAtStart === undefined ? 2 : gate.accelAtStart,
      cmfNow: gate.cmfNow === undefined ? 0.05 : gate.cmfNow,
      accelNow: gate.accelNow === undefined ? 2 : gate.accelNow,
    },
    stocks,
  };
}

const six = (over: Parameters<typeof stock>[1] = {}) =>
  ["A", "B", "C", "D", "E", "F"].map((x) => stock(x, over));

describe("rotation entry screen", () => {
  it("passes the gate and trades when enough names qualify", () => {
    const r = evaluateEntryScreen(detail(six()));
    expect(r.gate.pass).toBe(true);
    expect(r.verdict).toBe("TRADE");
    expect(r.qualifying).toBeGreaterThanOrEqual(ENTRY_SCREEN.MIN_QUALIFYING);
  });

  it("vetoes a rotation where too few names qualify, and still reports them", () => {
    const stocks = [
      stock("A"), stock("B"),
      stock("C", { breakout: false }), stock("D", { breakout: false }),
      stock("E", { breakout: false }), stock("F", { breakout: false }),
    ];
    const r = evaluateEntryScreen(detail(stocks));
    expect(r.verdict).toBe("SKIP_THIN");
    expect(r.qualifying).toBe(2);
    expect(r.picks.map((p) => p.symbol).sort()).toEqual(["A", "B"]);
    expect(entryScreenReason(r)).toMatch(/narrow rotation/);
  });

  it("fails the gate on weak start-bar breadth", () => {
    // Two of six above their 50d SMA at the start = 33%.
    const stocks = [
      stock("A"), stock("B"),
      ...["C", "D", "E", "F"].map((x) => stock(x, { aboveAtStart: false })),
    ];
    const r = evaluateEntryScreen(detail(stocks));
    expect(r.gate.breadth).toBeCloseTo(33.3, 0);
    expect(r.verdict).toBe("SKIP_GATE");
    expect(r.picks).toHaveLength(0);
  });

  it.each([
    ["money flow", { cmfAtStart: -0.01 }],
    ["acceleration", { accelAtStart: -1 }],
  ])("fails the gate on start-bar %s", (_label, override) => {
    const r = evaluateEntryScreen(detail(six(), override));
    expect(r.verdict).toBe("SKIP_GATE");
    expect(r.qualifying).toBe(0);
  });

  it("gates on the START bar, never on the live reading", () => {
    // Clean at entry, decayed since. The verdict must still be TRADE.
    const r = evaluateEntryScreen(detail(six(), { cmfNow: -0.2, accelNow: -5 }));
    expect(r.gate.pass).toBe(true);
    expect(r.live.pass).toBe(false);
    expect(r.verdict).toBe("TRADE");
    expect(liveGateDrift(r)).toBe("faded");
  });

  it("does not let a healthy live gate rescue a rotation that failed at entry", () => {
    const r = evaluateEntryScreen(detail(six(), { accelAtStart: -3, accelNow: 5 }));
    expect(r.verdict).toBe("SKIP_GATE");
    expect(r.live.pass).toBe(true);
    expect(liveGateDrift(r)).toBe("recovered");
  });

  it("treats a missing gate input as a failure, never as a pass", () => {
    const r = evaluateEntryScreen(detail(six(), { cmfAtStart: null }));
    expect(r.verdict).toBe("NO_DATA");
    expect(r.gate.complete).toBe(false);
    expect(r.gate.pass).toBe(false);
    expect(r.picks).toHaveLength(0);
  });

  it("reports null breadth rather than a noisy percentage on a tiny basket", () => {
    const r = evaluateEntryScreen(detail([stock("A"), stock("B"), stock("C")]));
    expect(r.gate.breadth).toBeNull();
    expect(r.verdict).toBe("NO_DATA");
  });

  it("applies the ATR floor as an absolute, not a basket rank", () => {
    const stocks = ["A", "B", "C", "D", "E", "F"].map((x, i) => stock(x, { atr: 1.5, ret20: 20 - i }));
    const r = evaluateEntryScreen(detail(stocks));
    expect(r.qualifying).toBe(0);
    expect(r.verdict).toBe("SKIP_THIN");
  });

  it("ranks the return cut within the basket, so a hot sector does not admit everyone", () => {
    const stocks = [40, 35, 30, 25, 20, 15].map((v, i) => stock(`S${i}`, { ret20: v }));
    const r = evaluateEntryScreen(detail(stocks));
    // The cut lands on index floor(6 * 0.5) = 3 and the comparison is inclusive,
    // so four of six qualify. This is the boundary the calibration run used —
    // asserted here so a later "off-by-one fix" cannot silently recalibrate.
    expect(r.ret20Cut).toBe(25);
    expect(r.qualifying).toBe(4);
    expect(r.picks.map((p) => p.symbol)).toEqual(["S0", "S1", "S2", "S3"]);
    expect(r.picks.map((p) => p.symbol)).not.toContain("S5");
  });

  it("skips names whose screen inputs could not be measured", () => {
    const stocks = [
      stock("A"), stock("B"), stock("C"), stock("D"),
      stock("E", { ret20: null }), stock("F", { atr: null }),
    ];
    const r = evaluateEntryScreen(detail(stocks));
    expect(r.picks.map((p) => p.symbol)).not.toContain("E");
    expect(r.picks.map((p) => p.symbol)).not.toContain("F");
  });

  it("computes the two breadth readings off different as-of dates", () => {
    // Broad at entry, narrow now.
    const stocks = ["A", "B", "C", "D", "E", "F"].map((x, i) =>
      stock(x, { aboveAtStart: true, aboveNow: i < 2 }));
    const r = evaluateEntryScreen(detail(stocks));
    expect(r.gate.breadth).toBe(100);
    expect(r.live.breadth).toBeCloseTo(33.3, 0);
    expect(r.verdict).toBe("TRADE");
    expect(liveGateDrift(r)).toBe("faded");
  });

  it("returns picks sorted by basket strength", () => {
    const stocks = [10, 30, 20, 40, 25, 15].map((v, i) => stock(`S${i}`, { ret20: v }));
    const r = evaluateEntryScreen(detail(stocks));
    const rets = r.picks.map((p) => p.ret20AtStart as number);
    expect(rets).toEqual([...rets].sort((a, b) => b - a));
  });
});
