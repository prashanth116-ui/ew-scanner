import { describe, it, expect } from "vitest";
import { slotBreakdown, nullNeutralScore, type ScoreSlot } from "./score-slot";
import { scoreDemandEmergence } from "./demand-emergence";
import { scoreRunnerPotential } from "./runner-potential";
import type { PreRunStockData } from "./types";

describe("slotBreakdown", () => {
  it("reports the percentage each slot earned", () => {
    const slots: ScoreSlot[] = [
      { label: "pocket_pivots", earned: 12, possible: 24, hasData: true },
    ];
    expect(slotBreakdown(slots)[0]).toEqual({
      label: "pocket_pivots",
      earned: 12,
      possible: 24,
      hasData: true,
      pct: 50,
    });
  });

  it("keeps a measured zero distinct from unmeasurable", () => {
    // This is the whole point. Collapsing both to 0 downstream reintroduces the bug
    // nullNeutralScore exists to prevent — "demand is absent" vs "demand is unknown".
    const [measured, missing] = slotBreakdown([
      { label: "a", earned: 0, possible: 24, hasData: true },
      { label: "b", earned: 0, possible: 0, hasData: false },
    ]);
    expect(measured.pct).toBe(0);
    expect(measured.hasData).toBe(true);
    expect(missing.pct).toBeNull();
    expect(missing.hasData).toBe(false);
  });

  it("does not divide by zero when a slot has no possible points", () => {
    expect(slotBreakdown([{ label: "a", earned: 0, possible: 0, hasData: true }])[0].pct).toBeNull();
  });
});

describe("slots stay consistent with the score they explain", () => {
  // A breakdown that disagrees with its own component score is worse than no breakdown —
  // it would send you looking for a cause that is not there.
  const base = {
    closeLocationMean: 0.7, closeLocationFlat: true, pocketPivots: 2,
    rvolTrajectory: 0.2, obvDivergent: true, moneyFlowPersistence: 14,
    vcpAtrPct: 4, overheadSupply: 10, currentPrice: 100,
  } as unknown as PreRunStockData;

  it("demand slots reproduce demand_score", () => {
    const r = scoreDemandEmergence(base);
    const rebuilt = nullNeutralScore(
      r.slots.map((s) => ({ label: s.label, earned: s.earned, possible: s.possible, hasData: s.hasData }))
    );
    expect(rebuilt).toBe(r.score);
  });

  it("runner slots reproduce runner_score", () => {
    const r = scoreRunnerPotential(base, null);
    const rebuilt = nullNeutralScore(
      r.slots.map((s) => ({ label: s.label, earned: s.earned, possible: s.possible, hasData: s.hasData }))
    );
    expect(rebuilt).toBe(r.score);
  });

  it("labels every slot, with no duplicates inside a component", () => {
    // A duplicate label makes a slot unaddressable in a query.
    for (const r of [scoreDemandEmergence(base), scoreRunnerPotential(base, null)]) {
      const labels = r.slots.map((s) => s.label);
      expect(labels.every((l) => l.length > 0)).toBe(true);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});
