import { describe, it, expect } from "vitest";
import { scoreRunnerPotential } from "./runner-potential";
import { buildRegimeGate, NEUTRAL_GATE } from "./regime-gate";
import type { PreRunStockData } from "./types";

/** Minimal stub — Runner Potential reads only these five inputs, and every slot is
 *  null-neutral, so anything not set simply drops out of the denominator. */
function make(over: Partial<PreRunStockData> = {}): PreRunStockData {
  return {
    overheadSupply: null,
    vcpAtrPct: null,
    pctFromAth: null,
    weeksInBase: null,
    floatTurnover20d: null,
    insiderBuys45d: null,
    insiderBuys90d: null,
    ...over,
  } as unknown as PreRunStockData;
}

describe("scoreRunnerPotential", () => {
  it("scores a high-potential name near the top", () => {
    const result = scoreRunnerPotential(make({
      overheadSupply: 3,        // clean air
      vcpAtrPct: 5.5,           // high daily range
      pctFromAth: 45,           // deep base
      weeksInBase: 40,          // held a long time
      floatTurnover20d: 2.0,    // rotating fast
      insiderBuys45d: 3,        // cluster
    }));
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.evidence.join(" ")).toContain("Clean air overhead");
  });

  it("scores a structurally un-runnable name near the bottom", () => {
    const result = scoreRunnerPotential(make({
      overheadSupply: 55,       // multiple ceilings
      vcpAtrPct: 1.2,           // cannot move
      pctFromAth: 3,            // no base
      weeksInBase: 2,
      floatTurnover20d: 0.1,
      insiderBuys90d: 0,
    }));
    expect(result.score).toBeLessThan(15);
    expect(result.caution.join(" ")).toContain("too little daily range");
  });

  it("separates two names that would score identically on setup quality", () => {
    // Same base depth and duration; the difference is range and overhead supply,
    // which is precisely what the old engines could not see.
    const runner = scoreRunnerPotential(make({
      pctFromAth: 35, weeksInBase: 30, overheadSupply: 6, vcpAtrPct: 4.5, floatTurnover20d: 1.6,
    }));
    const dud = scoreRunnerPotential(make({
      pctFromAth: 35, weeksInBase: 30, overheadSupply: 48, vcpAtrPct: 1.4, floatTurnover20d: 0.2,
    }));
    expect(runner.score - dud.score).toBeGreaterThan(40);
  });

  it("excludes missing inputs rather than scoring them zero", () => {
    // ATR alone, everything else null — should reflect the ATR slot, not be dragged down
    const result = scoreRunnerPotential(make({ vcpAtrPct: 5 }));
    expect(result.score).toBe(100);
  });

  it("returns 0 when nothing is measurable", () => {
    expect(scoreRunnerPotential(make()).score).toBe(0);
  });
});

describe("buildRegimeGate", () => {
  it("does not gate a risk-on tape", () => {
    expect(buildRegimeGate("RISK_ON", 100)).toEqual(NEUTRAL_GATE);
  });

  it("gates risk-off hardest", () => {
    const off = buildRegimeGate("RISK_OFF", 100);
    const mixed = buildRegimeGate("MIXED", 100);
    expect(off.scorePenalty).toBe(10);
    expect(mixed.scorePenalty).toBe(5);
    expect(off.scorePenalty).toBeGreaterThan(mixed.scorePenalty);
  });

  it("scales the penalty by regime confidence", () => {
    expect(buildRegimeGate("RISK_OFF", 50).scorePenalty).toBe(5);
    expect(buildRegimeGate("RISK_OFF", 0)).toEqual(NEUTRAL_GATE);
  });

  it("is neutral when regime is unavailable", () => {
    expect(buildRegimeGate(null)).toEqual(NEUTRAL_GATE);
  });

  it("carries a label whenever it gates", () => {
    expect(buildRegimeGate("RISK_OFF", 100).label).toContain("Risk-off");
    expect(NEUTRAL_GATE.label).toBe("");
  });
});
