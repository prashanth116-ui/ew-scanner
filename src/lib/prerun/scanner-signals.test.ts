import { describe, it, expect } from "vitest";
import { classifyAlertState, scoreTransitionWithStructure, NO_STRUCTURE, type StructureInput } from "./transition-scoring";
import { determineTradeRead } from "./inflection-scoring";
import type { PreRunStockData } from "./types";

/**
 * Alert-state and trade-read semantics for the Transition and Inflection scanners.
 * These guard the two behaviours the audit found inverted: TRIGGERED firing on a
 * self-satisfying trigger level, and the strongest Inflection setups being excluded
 * from primary-signal status by branch ordering.
 */

describe("classifyAlertState", () => {
  // Price 100, trigger 98 (already cleared), 2% ATR
  const cleared = (opts: Partial<{ confirmed: boolean; extended: boolean; score: number }> = {}) =>
    classifyAlertState(
      "EARLY_EXPANSION",
      opts.score ?? 60,
      98,
      100,
      2,
      90,
      opts.confirmed ?? true,
      opts.extended ?? false,
    );

  it("triggers on a cleared level with participation on the break bar", () => {
    expect(cleared()).toBe("TRIGGERED");
  });

  it("holds at READY when the break had no participation", () => {
    // The core regression: a break with no volume expansion and a weak close is not
    // a trigger. Previously any cleared level with score >= 40 returned TRIGGERED.
    expect(cleared({ confirmed: false })).toBe("READY");
  });

  it("never triggers an extended name even with a confirmed break", () => {
    expect(cleared({ extended: true })).not.toBe("TRIGGERED");
  });

  it("never triggers the EXTENDED state itself", () => {
    const result = classifyAlertState("EXTENDED", 80, 98, 100, 2, 90, true, false);
    expect(result).not.toBe("TRIGGERED");
  });

  it("invalidates when price breaks the structural invalidation level", () => {
    // Bullish state, strong score, confirmed break — but price is below invalidation
    const result = classifyAlertState("BULLISH_BOS", 70, 98, 100, 2, 105, true, false);
    expect(result).toBe("INVALIDATED");
  });

  it("reads READY when an overhead trigger is within 2 ATR", () => {
    // Trigger 103 vs price 100 = 3% away; 2 ATR = 4%
    const result = classifyAlertState("BULLISH_CHOCH", 40, 103, 100, 2, 90, false, false);
    expect(result).toBe("READY");
  });

  it("reads ARMED when the overhead trigger is out of range", () => {
    // Trigger 120 vs price 100 = 20% away, far beyond 2 ATR
    const result = classifyAlertState("BULLISH_CHOCH", 40, 120, 100, 2, 90, false, false);
    expect(result).toBe("ARMED");
  });

  it("reads WATCH for early states with no trigger level", () => {
    expect(classifyAlertState("ACCUMULATION", 40, null, 100, 2, null, false, false)).toBe("WATCH");
  });

  it("invalidates MARKDOWN", () => {
    expect(classifyAlertState("MARKDOWN", 60, 98, 100, 2, null, true, false)).toBe("INVALIDATED");
  });
});

describe("determineTradeRead", () => {
  it("returns STARTER for strong early accumulation", () => {
    // The inversion this guards: BE >= 60 previously short-circuited to ADD_ON,
    // and isPrimarySignal requires STARTER — so the best setups could never be primary.
    expect(determineTradeRead("EARLY_ACCUMULATION", 55, 65, false)).toBe("STARTER_POSITION_CANDIDATE");
  });

  it("scores adjacent BE values consistently", () => {
    const below = determineTradeRead("EARLY_ACCUMULATION", 55, 59, false);
    const above = determineTradeRead("EARLY_ACCUMULATION", 55, 61, false);
    expect(above).toBe(below);
  });

  it("returns STARTER for a qualifying INFLECTION stage", () => {
    expect(determineTradeRead("INFLECTION", 45, 30, false)).toBe("STARTER_POSITION_CANDIDATE");
  });

  it("reserves ADD_ON for moves already underway", () => {
    expect(determineTradeRead("EXPANSION", 55, 65, false)).toBe("ADD_ON_CONFIRMATION");
  });

  it("returns ADD_ON for strong buyer emergence below the STARTER score floor", () => {
    expect(determineTradeRead("EARLY_ACCUMULATION", 35, 65, false)).toBe("ADD_ON_CONFIRMATION");
  });

  it("avoids extended names regardless of stage", () => {
    expect(determineTradeRead("EARLY_ACCUMULATION", 60, 70, true)).toBe("AVOID");
  });

  it("avoids distribution", () => {
    expect(determineTradeRead("DISTRIBUTION", 60, 70, false)).toBe("AVOID");
  });

  it("watches seller exhaustion", () => {
    expect(determineTradeRead("SELLER_EXHAUSTION", 60, 70, false)).toBe("WATCH");
  });
});

/**
 * The pre-structure fix. Before V3 the Transition engine charged a zero across 25% of the
 * composite when no ChoCH or BOS had printed, so a stock at the moment of maximum
 * opportunity — supply done, demand emerging, structure about to flip — could never rank
 * highly. Structure slots now drop out of the denominator until a break exists.
 */
describe("pre-structure scoring", () => {
  /** A stock with strong accumulation evidence and no structural break yet. */
  function coiledStock(): PreRunStockData {
    return {
      ticker: "TEST",
      companyName: "Test",
      currentPrice: 100,
      // Supply exhaustion — strong
      absorption: 0.45,
      structuralSpring: 2,
      rangeAsymmetry: 1.6,
      vpDivergenceBullish: true,
      // Demand emergence — strong
      closeLocationMean: 0.72,
      closeLocationFlat: true,
      pocketPivots: 3,
      rvolTrajectory: 0.2,
      obvDivergent: true,
      moneyFlowPersistence: 13,
      // Compression — strong
      atrRatio5v20: 0.45,
      vcpTightCloses: true,
      vcpInsideBarCount: 3,
      closesNearRangeTop: true,
      // Runner potential — strong
      overheadSupply: 4,
      vcpAtrPct: 5,
      pctFromAth: 45,
      weeksInBase: 40,
      floatTurnover20d: 2,
      insiderBuys45d: 3,
      // RS — strong
      instRsAccelVsSPY: 6,
      instRsAccelTrend: 3,
      // Not extended
      instDistFromEma20Atr: 1,
    } as unknown as PreRunStockData;
  }

  const preBreak: StructureInput = {
    ...NO_STRUCTURE,
    structureAvailable: true,   // we looked; nothing has printed yet
    higherLowCount: 2,
    structureBias: "neutral",
    invalidationLevel: 92,
  };

  it("lets a coiled pre-breakout stock score highly", () => {
    const result = scoreTransitionWithStructure(coiledStock(), preBreak);
    // Everything except structure is strong, so the composite should reflect that
    expect(result.scores.overallScore).toBeGreaterThan(70);
  });

  it("reports the structure component as zero without dragging the composite down", () => {
    const result = scoreTransitionWithStructure(coiledStock(), preBreak);
    expect(result.scores.structure).toBe(0);
    // The score is NOT the naive 0.25*0 + rest — structure's weight is redistributed
    expect(result.scores.overallScore).toBeGreaterThan(
      result.scores.supplyExhaustion * 0.15 +
      result.scores.demandEmergence * 0.20 +
      result.scores.compression * 0.10 +
      result.scores.runnerPotential * 0.20 +
      result.scores.rsTrajectory * 0.10,
    );
  });

  it("keeps a pre-breakout stock in an early state despite the high score", () => {
    // Score says "how good is the evidence"; state says "where in the cycle".
    // A high score with no break must not read as a confirmed structural flip.
    const result = scoreTransitionWithStructure(coiledStock(), preBreak);
    expect(["ACCUMULATION", "DEMAND_INCREASING", "SELLING_EXHAUSTION"]).toContain(result.state);
    expect(result.isPrimarySignal).toBe(false);
  });

  it("still charges a failed break as negative evidence", () => {
    const failed: StructureInput = {
      ...preBreak,
      chochDetected: true,
      chochHolding: false,     // broke, then fell back through
      chochBarsAgo: 4,
    };
    const held: StructureInput = { ...failed, chochHolding: true };

    const failedResult = scoreTransitionWithStructure(coiledStock(), failed);
    const heldResult = scoreTransitionWithStructure(coiledStock(), held);

    expect(failedResult.scores.structure).toBeLessThan(heldResult.scores.structure);
    expect(failedResult.scores.overallScore).toBeLessThan(heldResult.scores.overallScore);
  });


  it("flags a coiled pre-break setup", () => {
    // The tier that answers "catch it before the move": full setup, no break yet.
    const result = scoreTransitionWithStructure(coiledStock(), preBreak);
    expect(result.isCoiledSignal).toBe(true);
    expect(result.isPrimarySignal).toBe(false);   // no break, so not primary
    expect(result.bullishEvidence.join(" ")).toContain("Coiled");
  });

  it("does not flag coiled once the break has printed", () => {
    const broken: StructureInput = {
      ...preBreak,
      chochDetected: true,
      chochHolding: true,
      chochBarsAgo: 3,
    };
    expect(scoreTransitionWithStructure(coiledStock(), broken).isCoiledSignal).toBe(false);
  });

  it("does not flag coiled on a stock that cannot move", () => {
    // Same accumulation evidence, no runner potential
    const dud = { ...coiledStock(), vcpAtrPct: 1.1, overheadSupply: 55, floatTurnover20d: 0.1,
                  pctFromAth: 3, weeksInBase: 1 } as unknown as PreRunStockData;
    expect(scoreTransitionWithStructure(dud, preBreak).isCoiledSignal).toBe(false);
  });

  it("flags rows scored with no usable OHLC", () => {
    const result = scoreTransitionWithStructure(coiledStock(), NO_STRUCTURE);
    expect(result.structureAvailable).toBe(false);
    expect(result.isPrimarySignal).toBe(false);
  });
});
