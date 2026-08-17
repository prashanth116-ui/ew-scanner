import { describe, it, expect } from "vitest";
import {
  findSwingHighs,
  detectChoCH,
  computeTriggerLevel,
  evaluateBreakConfirmation,
  type SwingPivot,
} from "./market-structure";

/**
 * Synthetic series with two confirmed 3-bar swing highs — index 6 at 110 and index 14
 * at 105 (a lower high, so ChoCH has downtrend context). The rally sits at the very end
 * so no third pivot can confirm, keeping index 14 as the level to break.
 */
const HIGHS = [
  98, 99, 100, 101, 102, 103,
  110,
  103, 102, 101, 100, 99, 100, 101,
  105,
  101, 100, 99, 100, 102, 104, 106,
];
const LOWS = HIGHS.map((h) => h - 2);

/** Closes that break above the 105 pivot at index 20 and hold into the final bar. */
const CLOSES_HOLDING = [
  97, 98, 99, 100, 101, 102,
  109,
  102, 101, 100, 99, 98, 99, 100,
  104,
  100, 99, 98, 99, 101, 105.5, 106,
];
/** Same break, but price falls back below the broken level on the final bar. */
const CLOSES_FAILED = [...CLOSES_HOLDING.slice(0, 21), 101];

describe("findSwingHighs", () => {
  it("finds the two confirmed 3-bar pivots and ignores the unconfirmed tail", () => {
    const swings = findSwingHighs(HIGHS, 3);
    expect(swings).toEqual([
      { index: 6, value: 110 },
      { index: 14, value: 105 },
    ]);
  });
});

describe("detectChoCH", () => {
  it("detects a break above the most recent swing high after a lower high", () => {
    const result = detectChoCH(HIGHS, LOWS, CLOSES_HOLDING, 3);
    expect(result.detected).toBe(true);
    expect(result.brokenLevel).toBe(105);
    expect(result.breakIndex).toBe(20);
    expect(result.barsAgo).toBe(1);
  });

  it("reports holding when the latest close is still above the broken level", () => {
    expect(detectChoCH(HIGHS, LOWS, CLOSES_HOLDING, 3).holding).toBe(true);
  });

  it("reports NOT holding when price has fallen back through the broken level", () => {
    const result = detectChoCH(HIGHS, LOWS, CLOSES_FAILED, 3);
    // The break still happened — the distinction is whether it survived
    expect(result.detected).toBe(true);
    expect(result.holding).toBe(false);
  });

  it("returns no detection when prior structure shows no lower high", () => {
    // Ascending pivots only — no downtrend context, so no change of character
    const risingHighs = [
      98, 99, 100, 101, 102, 103,
      105,
      101, 100, 99, 100, 101, 102, 103,
      110,
      104, 103, 102, 103, 105, 107, 112,
    ];
    const result = detectChoCH(risingHighs, risingHighs.map((h) => h - 2), CLOSES_HOLDING, 3);
    expect(result.detected).toBe(false);
    expect(result.holding).toBe(false);
  });
});

describe("computeTriggerLevel", () => {
  const swings: SwingPivot[] = [
    { index: 6, value: 110 },
    { index: 14, value: 105 },
  ];

  it("returns the NEAREST overhead pivot when price sits below both", () => {
    expect(computeTriggerLevel(swings, 103, 22)).toBe(105);
  });

  it("does not return a level price has already cleared", () => {
    // The regression this guards: ChoCH is defined as a close above the most recent
    // swing high, so returning that pivot made every ChoCH self-triggering.
    const trigger = computeTriggerLevel(swings, 106, 22);
    expect(trigger).toBe(110);
    expect(trigger!).toBeGreaterThan(106);
  });

  it("falls back to the highest recent pivot once price has cleared everything", () => {
    expect(computeTriggerLevel(swings, 115, 22)).toBe(110);
  });

  it("ignores pivots older than the lookback window", () => {
    // Window of 5 bars from a 22-bar series excludes both pivots
    expect(computeTriggerLevel(swings, 103, 22, 5)).toBe(105);
  });

  it("returns the last pivot when price is unavailable", () => {
    expect(computeTriggerLevel(swings, null, 22)).toBe(105);
  });

  it("returns null with no pivots at all", () => {
    expect(computeTriggerLevel([], 100, 22)).toBeNull();
  });
});

describe("evaluateBreakConfirmation", () => {
  const highs = [100, 101, 102];
  const lows = [98, 99, 100];
  const closes = [99, 100, 101.8];
  const volumes = [1_000_000, 1_000_000, 2_000_000];

  it("confirms on volume expansion", () => {
    const r = evaluateBreakConfirmation(2, highs, lows, closes, volumes, 1_000_000);
    expect(r.confirmed).toBe(true);
    expect(r.volumeRatio).toBe(2);
  });

  it("confirms on a strong close even when volume is quiet", () => {
    const quiet = [1_000_000, 1_000_000, 900_000];
    const r = evaluateBreakConfirmation(2, highs, lows, closes, quiet, 1_000_000);
    expect(r.confirmed).toBe(true);
    expect(r.closeLocation).toBeCloseTo(0.9, 5);
  });

  it("does not confirm a quiet break that closes mid-range", () => {
    const midClose = [99, 100, 101];
    const quiet = [1_000_000, 1_000_000, 900_000];
    const r = evaluateBreakConfirmation(2, highs, lows, midClose, quiet, 1_000_000);
    expect(r.confirmed).toBe(false);
    expect(r.closeLocation).toBeCloseTo(0.5, 5);
  });

  it("returns unconfirmed with no break index", () => {
    const r = evaluateBreakConfirmation(null, highs, lows, closes, volumes, 1_000_000);
    expect(r.confirmed).toBe(false);
    expect(r.volumeRatio).toBeNull();
    expect(r.closeLocation).toBeNull();
  });

  it("still evaluates close location when average volume is unavailable", () => {
    const r = evaluateBreakConfirmation(2, highs, lows, closes, volumes, null);
    expect(r.volumeRatio).toBeNull();
    expect(r.confirmed).toBe(true);
  });
});
