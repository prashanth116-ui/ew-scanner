import { describe, it, expect } from "vitest";
import { classifyAlertState } from "./transition-scoring";
import { determineTradeRead } from "./inflection-scoring";

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
