import { describe, it, expect } from "vitest";
import { evaluateEntryScreen, entryScreenReason } from "./entry-screen";
import { ENTRY_SCREEN } from "./config";
import type { ActiveRotationDetail, RotationStockPerformance } from "./rotation-types";
import type { SectorRotationScore } from "./types";

function stock(
  symbol: string,
  o: { ret20?: number | null; atr?: number | null; breakout?: boolean | null } = {},
): RotationStockPerformance {
  return {
    symbol, name: symbol,
    priceAtRotationStart: 100, priceNow: 100, performancePct: 0,
    aboveSma50: true, volumeVsAvg: 1, rsAcceleration: 0, trendAccel: 0,
    dailyChangePct: 0, isTurnaroundCandidate: false, daysToEarnings: null,
    nextEarningsDate: null, rs20d: null, rsAccelPrior: 0, rsImproving: false,
    rsDelta: 0, volumeConsistency: 0, verdict: null, finalScore: null,
    atrPctAtStart: o.atr === undefined ? 5 : o.atr,
    ret20AtStart: o.ret20 === undefined ? 10 : o.ret20,
    breakout20AtStart: o.breakout === undefined ? true : o.breakout,
    rsVsSector20: null,
  };
}

const detail = (stocks: RotationStockPerformance[]): ActiveRotationDetail => ({
  event: {
    sectorId: "s", sectorName: "S", etf: "XYZ", startDate: "2026-01-01", endDate: null,
    daysActive: 5, etfPriceAtStart: 100, etfPriceNow: 105, etfPerformancePct: 5,
    signals: { rsGoldenCross: true, volumeSurge: false, priceAbove50MA: true, signalCount: 2 },
    health: { acceleration: 1, cmf20: 0.1, quadrant: "LEADING" },
  },
  stocks,
});

const score = (o: Partial<SectorRotationScore> = {}) =>
  ({ etf: "XYZ", breadthPct: 70, cmf20: 0.05, acceleration: 2, ...o }) as SectorRotationScore;

describe("rotation entry screen", () => {
  it("passes the gate and trades when enough names qualify", () => {
    const r = evaluateEntryScreen(detail(["A", "B", "C", "D"].map((x) => stock(x))), score());
    expect(r.gate.pass).toBe(true);
    expect(r.verdict).toBe("TRADE");
    expect(r.qualifying).toBeGreaterThanOrEqual(ENTRY_SCREEN.MIN_QUALIFYING);
  });

  it("vetoes a rotation where too few names qualify, and still reports them", () => {
    // Only two clear the breakout; the rest fail it.
    const stocks = [
      stock("A"), stock("B"),
      stock("C", { breakout: false }), stock("D", { breakout: false }),
      stock("E", { breakout: false }), stock("F", { breakout: false }),
    ];
    const r = evaluateEntryScreen(detail(stocks), score());
    expect(r.verdict).toBe("SKIP_THIN");
    expect(r.qualifying).toBe(2);
    // The names are still surfaced so the UI can show what was passed over.
    expect(r.picks.map((p) => p.symbol).sort()).toEqual(["A", "B"]);
    expect(entryScreenReason(r)).toMatch(/narrow rotation/);
  });

  it.each([
    ["breadth", { breadthPct: 50 }],
    ["money flow", { cmf20: -0.01 }],
    ["acceleration", { acceleration: -1 }],
  ])("fails the gate on %s and returns no picks", (_label, override) => {
    const r = evaluateEntryScreen(detail(["A", "B", "C", "D"].map((x) => stock(x))), score(override));
    expect(r.verdict).toBe("SKIP_GATE");
    expect(r.picks).toHaveLength(0);
    expect(r.qualifying).toBe(0);
  });

  it("treats a missing gate input as a failure, never as a pass", () => {
    // Sub-sector and cross-asset baskets legitimately report null breadth.
    const r = evaluateEntryScreen(detail(["A", "B", "C"].map((x) => stock(x))), score({ breadthPct: null }));
    expect(r.verdict).toBe("NO_DATA");
    expect(r.gate.pass).toBe(false);
    expect(r.picks).toHaveLength(0);
  });

  it("applies the ATR floor as an absolute, not a basket rank", () => {
    // A low-volatility basket: every name is under the floor, so nothing qualifies
    // even though half of them are in the top half by return.
    const stocks = ["A", "B", "C", "D", "E", "F"].map((x, i) => stock(x, { atr: 1.5, ret20: 20 - i }));
    const r = evaluateEntryScreen(detail(stocks), score());
    expect(r.qualifying).toBe(0);
    expect(r.verdict).toBe("SKIP_THIN");
  });

  it("ranks the return cut within the basket, so a hot sector does not admit everyone", () => {
    const stocks = [40, 35, 30, 25, 20, 15].map((v, i) => stock(`S${i}`, { ret20: v }));
    const r = evaluateEntryScreen(detail(stocks), score());
    // The cut lands on index floor(6 * 0.5) = 3 and the comparison is inclusive,
    // so four of six qualify. This is the boundary the calibration run used —
    // asserting it here so a later "off-by-one fix" cannot silently recalibrate.
    expect(r.ret20Cut).toBe(25);
    expect(r.qualifying).toBe(4);
    expect(r.picks.map((p) => p.symbol)).toEqual(["S0", "S1", "S2", "S3"]);
    // The bottom third is still excluded — the ranking is doing real work.
    expect(r.picks.map((p) => p.symbol)).not.toContain("S5");
  });

  it("skips names whose screen inputs could not be measured", () => {
    const stocks = [
      stock("A"), stock("B"), stock("C"),
      stock("D", { ret20: null }), stock("E", { atr: null }),
    ];
    const r = evaluateEntryScreen(detail(stocks), score());
    expect(r.picks.map((p) => p.symbol)).not.toContain("D");
    expect(r.picks.map((p) => p.symbol)).not.toContain("E");
  });

  it("returns picks sorted by basket strength", () => {
    const stocks = [10, 30, 20, 40].map((v, i) => stock(`S${i}`, { ret20: v }));
    const r = evaluateEntryScreen(detail(stocks), score());
    const rets = r.picks.map((p) => p.ret20AtStart as number);
    expect(rets).toEqual([...rets].sort((a, b) => b - a));
  });
});
