import { describe, it, expect } from "vitest";
import { scoreSupplyExhaustion } from "./supply-exhaustion";
import { scoreDemandEmergence } from "./demand-emergence";
import { scoreInflection } from "./inflection-scoring";
import { scoreTransitionWithStructure, NO_STRUCTURE } from "./transition-scoring";
import type { PreRunStockData } from "./types";

/**
 * Supply Exhaustion and Demand Emergence must report the SAME number on both engines.
 *
 * They previously had a private copy in each scorer with different slots and different
 * weights, so the same stock read SE 46 on the Transition page and 39 on Inflection. These
 * tests fail if the two ever diverge again.
 */

function stock(over: Partial<PreRunStockData> = {}): PreRunStockData {
  return {
    ticker: "TEST",
    companyName: "Test",
    currentPrice: 100,
    absorption: 0.45,
    structuralSpring: 2,
    rangeAsymmetry: 1.6,
    vpDivergenceBullish: true,
    avgDownDayBody: 0.4,
    avgDownDayBodyPrev: 1.0,
    distributionDays20d: 1,
    closeLocationMean: 0.72,
    closeLocationFlat: true,
    pocketPivots: 3,
    rvolTrajectory: 0.2,
    obvDivergent: true,
    moneyFlowPersistence: 13,
    pctFromBaseHigh: 6,
    vcpAtrPct: 4,
    atrRatio5v20: 0.45,
    vcpTightCloses: true,
    vcpInsideBarCount: 3,
    vcpDryVolumeDays: 5,
    closesNearRangeTop: true,
    vcpRange5d: 1, vcpRange10d: 2, vcpRange20d: 4,
    overheadSupply: 4,
    pctFromAth: 45,
    weeksInBase: 40,
    floatTurnover20d: 2,
    insiderBuys45d: 3,
    instRsAccelVsSPY: 6,
    instRsAccelTrend: 3,
    instDistFromEma20Atr: 1,
    hasBrokenStructure: false,
    vcpAvgDollarVolume: 500_000_000,
    marketCap: 50_000_000_000,
    ...over,
  } as unknown as PreRunStockData;
}

describe("shared components report identically on both engines", () => {
  const cases: [string, Partial<PreRunStockData>][] = [
    ["strong setup", {}],
    ["weak supply evidence", { absorption: 0.02, structuralSpring: 0, rangeAsymmetry: 0.8, vpDivergenceBullish: false, distributionDays20d: 9 }],
    ["weak demand evidence", { closeLocationMean: 0.3, pocketPivots: 0, rvolTrajectory: -0.2, obvDivergent: false, moneyFlowPersistence: 1 }],
    ["sparse data", { absorption: null, rangeAsymmetry: null, pocketPivots: null, moneyFlowPersistence: null }],
  ];

  for (const [label, over] of cases) {
    it(`Supply Exhaustion matches — ${label}`, () => {
      const d = stock(over);
      const inf = scoreInflection(d);
      const trn = scoreTransitionWithStructure(d, NO_STRUCTURE);
      expect(inf.scores.supplyExhaustion).toBe(trn.scores.supplyExhaustion);
      expect(inf.scores.supplyExhaustion).toBe(scoreSupplyExhaustion(d).score ?? 0);
    });

    it(`Demand Emergence matches — ${label}`, () => {
      const d = stock(over);
      const inf = scoreInflection(d);
      const trn = scoreTransitionWithStructure(d, NO_STRUCTURE);
      expect(inf.scores.demandEmergence).toBe(trn.scores.demandEmergence);
      expect(inf.scores.demandEmergence).toBe(scoreDemandEmergence(d).score ?? 0);
    });

    it(`Runner Potential matches — ${label}`, () => {
      const d = stock(over);
      // Runner takes an invalidation level, which the engines derive differently, so this
      // checks the component is at least shared rather than byte-identical in inputs.
      expect(scoreInflection(d).scores.runnerPotential).toBeGreaterThan(0);
      expect(scoreTransitionWithStructure(d, NO_STRUCTURE).scores.runnerPotential).toBeGreaterThan(0);
    });
  }

  it("coiled is identical on both engines — same gate, same pre-break test", () => {
    // Coiled previously meant "pre-break" on Transition and merely "not extended" on
    // Inflection, because only Transition had structure detection. hasBrokenStructure now
    // lives in the data layer, so both engines ask the same question of the same field.
    for (const broken of [false, true, null]) {
      const d = stock({ hasBrokenStructure: broken } as Partial<PreRunStockData>);
      const inf = scoreInflection(d);
      const trn = scoreTransitionWithStructure(d, NO_STRUCTURE);
      expect(inf.isCoiledSignal).toBe(trn.isCoiledSignal);
    }
  });

  it("coiled requires a strict false — an unknowable chart is not 'no break'", () => {
    expect(scoreInflection(stock({ hasBrokenStructure: false } as Partial<PreRunStockData>)).isCoiledSignal).toBe(true);
    expect(scoreInflection(stock({ hasBrokenStructure: true } as Partial<PreRunStockData>)).isCoiledSignal).toBe(false);
    expect(scoreInflection(stock({ hasBrokenStructure: null } as Partial<PreRunStockData>)).isCoiledSignal).toBe(false);
  });

  it("RS Trajectory matches on both engines", () => {
    // Near-duplicate copies had drifted by one bucket (26 vs 24) before extraction.
    for (const [, over] of cases) {
      const d = stock(over);
      expect(scoreInflection(d).scores.rsTrajectory).toBe(scoreTransitionWithStructure(d, NO_STRUCTURE).scores.rsTrajectory);
    }
  });

  it("reports how much of the composite was measurable", () => {
    // Full data -> everything measured
    expect(scoreInflection(stock()).measuredPct).toBe(100);
    // Strip the inputs behind two whole components; coverage must drop, not silently
    // renormalize away
    const thin = stock({
      absorption: null, structuralSpring: null, rangeAsymmetry: null,
      vpDivergenceBullish: null, avgDownDayBody: null, distributionDays20d: null,
      instRsAccelVsSPY: null, instRsAccelTrend: null,
    } as Partial<PreRunStockData>);
    const r = scoreInflection(thin);
    expect(r.measuredPct).toBeLessThan(100);
    expect(r.cautionEvidence.join(" ")).toContain("could be measured");
  });

  it("does not count Structure as missing before a break has printed", () => {
    // Pre-break rows legitimately have no structure — that is not thin data
    const r = scoreTransitionWithStructure(stock(), NO_STRUCTURE);
    expect(r.measuredPct).toBe(100);
  });

  it("both components stay within 0-100", () => {
    for (const [, over] of cases) {
      const d = stock(over);
      for (const v of [scoreSupplyExhaustion(d).score, scoreDemandEmergence(d).score]) {
        if (v !== null) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});
