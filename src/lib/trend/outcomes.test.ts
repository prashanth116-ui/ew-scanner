import { describe, it, expect } from "vitest";
import {
  slope,
  scoreTrend,
  priceState,
  summarize,
  collapseToEpisodes,
  compositionMatchedControl,
  worstMeasured,
  SCORE_SLOPE_BAND,
  PRICE_STATE_PCT,
  type PriceState,
  type BucketStat,
} from "./outcomes";

describe("slope / scoreTrend", () => {
  it("reads a non-monotonic series the endpoint difference cannot", () => {
    // The case that motivated moving off first-vs-last: 20 -> 60 -> 20 differences to
    // exactly 0, which reads as "nothing happened" for a series that round-tripped.
    const series = [20, 40, 60, 40, 20];
    expect(series[series.length - 1] - series[0]).toBe(0);
    expect(slope(series)).toBe(0); // symmetric, so the slope agrees here
    // ...but a series that ENDS lower than it peaked does not:
    const fading = [20, 45, 60, 50, 30];
    expect(fading[fading.length - 1] - fading[0]).toBe(10); // endpoints say "up"
    expect(slope(fading)).toBeGreaterThan(0);
    const rolling = [60, 70, 55, 40, 30];
    expect(slope(rolling)).toBeLessThan(-SCORE_SLOPE_BAND);
    expect(scoreTrend(rolling)).toBe("FALLING");
  });

  it("treats a series inside the band as flat", () => {
    expect(scoreTrend([50, 51, 50, 51, 50])).toBe("FLAT");
    expect(scoreTrend([10, 20, 30, 40, 50])).toBe("RISING");
  });

  it("refuses to call a direction on fewer than three points", () => {
    expect(scoreTrend([10, 90])).toBeNull();
    expect(scoreTrend([])).toBeNull();
  });

  it("is zero for a flat series and for a single point", () => {
    expect(slope([5, 5, 5, 5])).toBe(0);
    expect(slope([5])).toBe(0);
  });
});

describe("priceState", () => {
  it("buckets on the same band the divergence chips already use", () => {
    expect(priceState(PRICE_STATE_PCT)).toBe("UP");
    expect(priceState(-PRICE_STATE_PCT)).toBe("DOWN");
    expect(priceState(0)).toBe("FLAT");
    expect(priceState(2.9)).toBe("FLAT");
  });

  it("returns null rather than guessing when the move is unmeasurable", () => {
    expect(priceState(null)).toBeNull();
    expect(priceState(NaN)).toBeNull();
  });
});

describe("collapseToEpisodes", () => {
  /**
   * Migration 035's rule. A name held in a bucket for ten consecutive scans contributed
   * ten overlapping forward windows measuring one move, which weights the mean toward
   * names that persist in the scan — the ones already working.
   */
  it("keeps one observation per contiguous run", () => {
    const entries = new Map([
      // One unbroken 4-scan run: one episode, the first.
      ["AAA", [
        { barIndex: 10, excess: 1 },
        { barIndex: 11, excess: 2 },
        { barIndex: 12, excess: 3 },
        { barIndex: 13, excess: 4 },
      ]],
    ]);
    expect(collapseToEpisodes(entries)).toEqual([1]);
  });

  it("counts a re-entry after a gap as a new episode", () => {
    const entries = new Map([
      ["BBB", [
        { barIndex: 1, excess: 10 },
        { barIndex: 2, excess: 11 },
        // gap at 3
        { barIndex: 4, excess: 20 },
      ]],
    ]);
    expect(collapseToEpisodes(entries).sort((a, b) => a - b)).toEqual([10, 20]);
  });

  it("does not depend on input order", () => {
    const shuffled = new Map([
      ["CCC", [
        { barIndex: 12, excess: 3 },
        { barIndex: 10, excess: 1 },
        { barIndex: 11, excess: 2 },
      ]],
    ]);
    expect(collapseToEpisodes(shuffled)).toEqual([1]);
  });

  it("collapses each ticker independently", () => {
    const entries = new Map([
      ["AAA", [{ barIndex: 5, excess: 1 }, { barIndex: 6, excess: 2 }]],
      ["BBB", [{ barIndex: 5, excess: 7 }, { barIndex: 6, excess: 8 }]],
    ]);
    expect(collapseToEpisodes(entries).sort((a, b) => a - b)).toEqual([1, 7]);
  });

  it("materially shrinks n for a persistent cohort, which is the point", () => {
    // Twenty names each held for ten straight scans: 200 ticker-days, 20 episodes.
    const entries = new Map(
      Array.from({ length: 20 }, (_, t) => [
        `T${t}`,
        Array.from({ length: 10 }, (_, i) => ({ barIndex: i, excess: t })),
      ] as const),
    );
    expect(collapseToEpisodes(entries)).toHaveLength(20);
  });
});

describe("compositionMatchedControl", () => {
  const controls = new Map<PriceState, BucketStat | null>([
    ["UP", { n: 100, meanExcess: -1.5, medianExcess: -1.5, posRate: 0.35 }],
    ["FLAT", { n: 200, meanExcess: -0.3, medianExcess: -0.3, posRate: 0.44 }],
    ["DOWN", { n: 100, meanExcess: +1.8, medianExcess: +1.8, posRate: 0.6 }],
  ]);

  it("reduces to the single state's control when a signal lives in one price state", () => {
    const c = compositionMatchedControl(["DOWN", "DOWN", "DOWN"], controls)!;
    expect(c.meanExcess).toBeCloseTo(1.8);
  });

  it("weights by the signal's own mix, not by the control bucket sizes", () => {
    // 3 UP : 1 DOWN  ->  (3*-1.5 + 1*1.8) / 4 = -0.675
    const c = compositionMatchedControl(["UP", "UP", "UP", "DOWN"], controls)!;
    expect(c.meanExcess).toBeCloseTo(-0.675);
    // Bucket sizes are 100 and 100 here, so a size-weighted blend would give +0.15 —
    // the point is that the SIGNAL's composition drives it, not the control's.
    expect(c.meanExcess).not.toBeCloseTo(0.15);
  });

  it("is the defence against the degenerate all-names control", () => {
    /**
     * A signal spread evenly across price states must be graded near the cohort mean,
     * which is ~0 by construction. The bug this replaced compared such signals against an
     * episode-collapsed "all names" bucket whose mean was -0.75%, manufacturing ~+0.45pp
     * of edge for a signal that had none.
     */
     const even: PriceState[] = [];
     for (let i = 0; i < 100; i++) even.push("UP", "FLAT", "FLAT", "DOWN");
     const c = compositionMatchedControl(even, controls)!;
     // (-1.5 + -0.3 + -0.3 + 1.8) / 4 = -0.075, i.e. essentially the cohort mean.
     expect(c.meanExcess).toBeCloseTo(-0.075);
     expect(Math.abs(c.meanExcess)).toBeLessThan(0.5);
  });

  it("returns null with no episodes rather than a zero that reads as a measurement", () => {
    expect(compositionMatchedControl([], controls)).toBeNull();
  });

  it("skips states that have no control instead of counting them as zero", () => {
    const partial = new Map<PriceState, BucketStat | null>([
      ["UP", { n: 10, meanExcess: -2, medianExcess: -2, posRate: 0.3 }],
      ["DOWN", null],
    ]);
    const c = compositionMatchedControl(["UP", "DOWN"], partial)!;
    expect(c.meanExcess).toBeCloseTo(-2);
    expect(c.n).toBe(10);
  });
});

describe("summarize", () => {
  it("reports mean, median and positive rate", () => {
    const s = summarize([-2, -1, 1, 4])!;
    expect(s.n).toBe(4);
    expect(s.meanExcess).toBeCloseTo(0.5);
    expect(s.posRate).toBeCloseTo(0.5);
  });

  it("returns null for an empty bucket rather than a zero that reads as a measurement", () => {
    expect(summarize([])).toBeNull();
  });
});

describe("worstMeasured", () => {
  it("takes the minimum, so one thin scan condemns the series", () => {
    // The mean would report 91 here and hide the day whose composite renormalized over
    // most of its components — which is the only day worth looking at.
    expect(worstMeasured([100, 100, 55, 100, 100])).toBe(55);
  });

  it("skips unrecorded scans rather than reading them as zero", () => {
    expect(worstMeasured([100, null, 90])).toBe(90);
  });

  it("returns null when nothing in the window recorded coverage", () => {
    // Every archive window is this shape: component_history does not store measured_pct
    // (migration 033). Zero would report the whole archive as maximally thin and 100
    // would assert full coverage nobody measured, so the only honest answer is unknown —
    // and the page disables the control rather than filtering on a guess.
    expect(worstMeasured([null, null, null])).toBeNull();
    expect(worstMeasured([])).toBeNull();
  });

  it("does not treat a legitimate zero as missing", () => {
    expect(worstMeasured([null, 0, 80])).toBe(0);
  });
});
