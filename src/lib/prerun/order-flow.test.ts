import { describe, it, expect } from "vitest";
import {
  calcAbsorption,
  calcCloseLocation,
  calcPocketPivots,
  calcStructuralSpring,
  calcRangeAsymmetry,
  calcOverheadSupply,
} from "./data";
import { weightedComposite, nullNeutralScore } from "./score-slot";

/**
 * Order-flow primitives. Each replaces a lagging input in the Inflection or Transition
 * scanner, so the tests focus on the property that makes it leading — that it responds to
 * participant behaviour rather than to smoothed price.
 */

/** Build n bars of flat price with controllable per-bar range and volume. */
function series(n: number, opts: {
  base?: number;
  rangeFor?: (i: number) => number;
  volFor?: (i: number) => number;
  closeFor?: (i: number) => number;
  clvFor?: (i: number) => number;
} = {}) {
  const base = opts.base ?? 100;
  const highs: number[] = [], lows: number[] = [], closes: number[] = [], volumes: number[] = [];
  for (let i = 0; i < n; i++) {
    const close = opts.closeFor ? opts.closeFor(i) : base;
    const range = opts.rangeFor ? opts.rangeFor(i) : 2;
    const clv = opts.clvFor ? opts.clvFor(i) : 0.5;
    const low = close - range * clv;
    const high = low + range;
    highs.push(high); lows.push(low); closes.push(close);
    volumes.push(opts.volFor ? opts.volFor(i) : 1_000_000);
  }
  return { highs, lows, closes, volumes };
}

describe("calcAbsorption", () => {
  it("scores high when down bars carry heavy volume and tiny range", () => {
    // Alternating up/down closes; every down bar gets 2x volume and a very small range
    const s = series(40, {
      closeFor: (i) => (i % 2 === 0 ? 100 : 99),          // odd bars close lower
      rangeFor: (i) => (i % 2 === 1 ? 0.4 : 4),            // down bars tight, up bars wide
      volFor: (i) => (i % 2 === 1 ? 2_000_000 : 800_000),  // down bars heavy
    });
    const result = calcAbsorption(s.highs, s.lows, s.closes, s.volumes);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0.8);
  });

  it("scores low when down bars are wide and quiet", () => {
    const s = series(40, {
      closeFor: (i) => (i % 2 === 0 ? 100 : 99),
      rangeFor: (i) => (i % 2 === 1 ? 5 : 1),
      volFor: (i) => (i % 2 === 1 ? 500_000 : 1_500_000),
    });
    const result = calcAbsorption(s.highs, s.lows, s.closes, s.volumes);
    expect(result).toBe(0);
  });

  it("returns null when there are too few down bars to characterise", () => {
    const s = series(40, { closeFor: (i) => 100 + i });     // monotonic advance, no down bars
    expect(calcAbsorption(s.highs, s.lows, s.closes, s.volumes)).toBeNull();
  });
});

describe("calcCloseLocation", () => {
  it("reports strong close location with flat price", () => {
    const s = series(20, { clvFor: () => 0.9 });            // closes near the high every bar
    const result = calcCloseLocation(s.highs, s.lows, s.closes);
    expect(result).not.toBeNull();
    expect(result!.mean).toBeCloseTo(0.9, 5);
    expect(result!.flatPrice).toBe(true);
  });

  it("reports weak close location when price closes on its lows", () => {
    const s = series(20, { clvFor: () => 0.1 });
    expect(calcCloseLocation(s.highs, s.lows, s.closes)!.mean).toBeCloseTo(0.1, 5);
  });

  it("flags price as not flat once it has advanced beyond the threshold", () => {
    const s = series(20, { closeFor: (i) => 100 + i });      // ~+10% over the window
    expect(calcCloseLocation(s.highs, s.lows, s.closes)!.flatPrice).toBe(false);
  });
});

describe("calcPocketPivots", () => {
  it("counts an up day whose volume beats every recent down day", () => {
    const closes: number[] = [];
    const volumes: number[] = [];
    for (let i = 0; i < 30; i++) {
      closes.push(i % 2 === 0 ? 100 : 99);                   // alternating, down days on odd
      volumes.push(1_000_000);
    }
    // Final bar: up close on volume far above any down-day volume
    closes.push(101);
    volumes.push(5_000_000);
    expect(calcPocketPivots(closes, volumes)).toBe(1);
  });

  it("does not count an up day on ordinary volume", () => {
    const closes: number[] = [];
    const volumes: number[] = [];
    for (let i = 0; i < 30; i++) {
      closes.push(i % 2 === 0 ? 100 : 99);
      volumes.push(2_000_000);                                // down days are heavy
    }
    closes.push(101);
    volumes.push(1_000_000);                                  // up day is light
    expect(calcPocketPivots(closes, volumes)).toBe(0);
  });
});

describe("calcStructuralSpring", () => {
  /** Range-bound series with a swing low at index 10, undercut near the end and reclaimed. */
  function springSeries(undercutVolume: number) {
    const lows: number[] = [], closes: number[] = [], volumes: number[] = [];
    for (let i = 0; i < 40; i++) {
      lows.push(i === 10 ? 95 : 97 + (i % 3));
      closes.push(100 + (i % 2));
      volumes.push(1_000_000);
    }
    // Undercut the index-10 swing low at bar 35, then reclaim and hold
    lows[35] = 93;
    closes[35] = 94;
    volumes[35] = undercutVolume;
    closes[36] = 99;
    for (let i = 37; i < 40; i++) closes[i] = 101;
    return { lows, closes, volumes };
  }

  it("scores 2 for an undercut on expansion volume that is reclaimed and held", () => {
    const s = springSeries(2_000_000);
    expect(calcStructuralSpring(s.lows, s.closes, s.volumes)).toBe(2);
  });

  it("scores 1 for the same reclaim on ordinary volume", () => {
    const s = springSeries(900_000);
    expect(calcStructuralSpring(s.lows, s.closes, s.volumes)).toBe(1);
  });

  it("works below a 50-day average, where the SMA50-based predecessor returned nothing", () => {
    // Stair-step downtrend: a steady decline with a local trough every 6 bars, so real swing
    // lows exist. Price sits far below any 50-bar mean throughout, which is exactly the state
    // in which the old SMA50-referenced version returned nothing at all.
    const lows: number[] = [], closes: number[] = [], volumes: number[] = [];
    for (let i = 0; i < 40; i++) {
      lows.push(200 - i * 2 + (i % 6 === 0 ? 0 : 8));
      closes.push(202 - i * 2);
      volumes.push(1_000_000);
    }
    // Most recent swing low confirmed before bar 33 is index 30, at 140.
    lows[35] = 130;                                  // undercut it
    closes[35] = 132;
    volumes[35] = 2_000_000;                         // on expansion volume
    for (let i = 36; i < 40; i++) closes[i] = 145;   // reclaimed and holding above 140

    expect(calcStructuralSpring(lows, closes, volumes)).toBe(2);
  });
});

describe("calcRangeAsymmetry", () => {
  it("exceeds 1 when up bars are wider than down bars", () => {
    const s = series(30, {
      closeFor: (i) => (i % 2 === 0 ? 100 : 99),
      rangeFor: (i) => (i % 2 === 0 ? 4 : 1),   // up bars wide, down bars tight
    });
    const result = calcRangeAsymmetry(s.highs, s.lows, s.closes);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(1);
  });

  it("falls below 1 when down bars dominate the range", () => {
    const s = series(30, {
      closeFor: (i) => (i % 2 === 0 ? 100 : 99),
      rangeFor: (i) => (i % 2 === 0 ? 1 : 4),
    });
    expect(calcRangeAsymmetry(s.highs, s.lows, s.closes)!).toBeLessThan(1);
  });
});

describe("calcOverheadSupply", () => {
  const highs = Array.from({ length: 52 }, (_, i) => (i < 26 ? 210 : 110));
  const lows = Array.from({ length: 52 }, (_, i) => (i < 26 ? 190 : 90));
  const volumes = Array.from({ length: 52 }, () => 1_000_000);

  it("reports heavy overhead when most volume traded above current price", () => {
    // Half the year traded around 200, half around 100; price now 100
    const result = calcOverheadSupply(highs, lows, volumes, 100);
    expect(result).toBeCloseTo(50, 1);
  });

  it("reports clean air when price is above everything", () => {
    expect(calcOverheadSupply(highs, lows, volumes, 500)).toBe(0);
  });

  it("returns null with too little history", () => {
    expect(calcOverheadSupply(highs.slice(0, 10), lows.slice(0, 10), volumes.slice(0, 10), 100)).toBeNull();
  });
});

describe("weightedComposite", () => {
  it("redistributes weight when a component cannot be measured", () => {
    // 80 at weight .25 and 40 at weight .25, with a third component unmeasurable.
    // Correct answer is the average of the two available (60), not (80+40+0)/3 = 40.
    expect(weightedComposite([
      { score: 80, weight: 0.25 },
      { score: 40, weight: 0.25 },
      { score: null, weight: 0.50 },
    ])).toBe(60);
  });

  it("matches a plain weighted average when everything is present", () => {
    expect(weightedComposite([
      { score: 100, weight: 0.5 },
      { score: 0, weight: 0.5 },
    ])).toBe(50);
  });

  it("does not let an unmeasurable component drag the score toward zero", () => {
    const withNull = weightedComposite([{ score: 70, weight: 0.75 }, { score: null, weight: 0.25 }]);
    const withZero = weightedComposite([{ score: 70, weight: 0.75 }, { score: 0, weight: 0.25 }]);
    expect(withNull).toBe(70);
    expect(withZero).toBeLessThan(withNull);
  });

  it("returns 0 only when nothing at all is measurable", () => {
    expect(weightedComposite([{ score: null, weight: 1 }])).toBe(0);
    expect(weightedComposite([])).toBe(0);
  });
});

describe("nullNeutralScore", () => {
  it("returns null when no slot has data", () => {
    expect(nullNeutralScore([{ label: "a", earned: 0, possible: 0, hasData: false }])).toBeNull();
  });

  it("scores only the slots that have data", () => {
    expect(nullNeutralScore([
      { label: "a", earned: 10, possible: 10, hasData: true },
      { label: "b", earned: 0, possible: 50, hasData: false },
    ])).toBe(100);
  });

  it("distinguishes a measured zero from no data", () => {
    expect(nullNeutralScore([{ label: "a", earned: 0, possible: 20, hasData: true }])).toBe(0);
  });
});
