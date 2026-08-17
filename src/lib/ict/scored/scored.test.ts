import { describe, it, expect } from "vitest";

import {
  ramp,
  detectSSLRaid,
  detectDisplacement,
  detectMSS,
  detectFVG,
  detectBSL,
  detectCompression,
  countConsecutiveExpansion,
  findInvalidation,
} from "./detectors";
import { assessICT } from "./assess";
import { WEIGHTS } from "./config";
import type { CandleSeries } from "./types";

// ── Fixture helpers ──

/** Flat baseline: every bar opens and closes at `base`, range `base` ± 0.5. */
function mkSeries(n: number, base = 100): CandleSeries {
  return {
    opens: Array(n).fill(base),
    highs: Array(n).fill(base + 0.5),
    lows: Array(n).fill(base - 0.5),
    closes: Array(n).fill(base),
    timestamps: Array.from({ length: n }, (_, i) => i * 86400),
  };
}

function set(s: CandleSeries, i: number, o: number, h: number, l: number, c: number): void {
  s.opens[i] = o;
  s.highs[i] = h;
  s.lows[i] = l;
  s.closes[i] = c;
}

/**
 * A textbook bullish sequence in 45 bars:
 *   bar 30  SSL raid (sweeps 99.5, reclaims)
 *   bar 31  displacement
 *   bar 31  MSS (same candle clears the frozen structure high)
 *   bar 33  FVG 104.2 - 105.0
 *   bar 34-37 pullback into the gap
 *   bar 38  higher low + reclaim
 *   bar 39-44 tightening beneath ~106.5
 */
function buildCleanSetup(): CandleSeries {
  const s = mkSeries(45, 100);

  set(s, 30, 100.0, 100.3, 98.0, 100.2); // SSL raid + reclaim
  set(s, 31, 100.2, 104.2, 100.0, 104.0); // displacement + MSS
  set(s, 32, 104.0, 105.2, 103.9, 105.0);
  set(s, 33, 105.0, 106.5, 105.0, 106.0); // FVG: low 105.0 > high[31] 104.2

  set(s, 34, 106.0, 106.2, 105.0, 105.2);
  set(s, 35, 105.2, 105.4, 104.6, 104.8);
  set(s, 36, 104.8, 105.0, 104.5, 104.9);
  set(s, 37, 104.9, 105.1, 104.4, 104.7); // pivot low 104.4
  set(s, 38, 104.7, 105.6, 104.6, 105.5); // higher low + close > high[37]

  // Tightening under a repeated 106.5 high — builds the BSL cluster.
  set(s, 39, 105.5, 106.5, 105.3, 106.1);
  set(s, 40, 106.1, 106.5, 105.6, 106.2);
  set(s, 41, 106.2, 106.4, 105.9, 106.1);
  set(s, 42, 106.1, 106.5, 106.0, 106.3);
  set(s, 43, 106.3, 106.4, 106.1, 106.2);
  set(s, 44, 106.2, 106.4, 106.15, 106.3);

  return s;
}

// ── ramp ──

describe("ramp", () => {
  it("clamps below the floor and above the ceiling", () => {
    expect(ramp(-5, 0, 10)).toBe(0);
    expect(ramp(15, 0, 10)).toBe(1);
  });

  it("interpolates linearly between", () => {
    expect(ramp(5, 0, 10)).toBeCloseTo(0.5);
  });

  it("returns 0 for a degenerate band rather than dividing by zero", () => {
    expect(ramp(5, 10, 10)).toBe(0);
    expect(Number.isNaN(ramp(5, 10, 10))).toBe(false);
  });
});

// ── SSL raid ──

describe("detectSSLRaid", () => {
  it("finds a sweep that reclaims the swept level", () => {
    const s = mkSeries(12);
    set(s, 10, 100, 100.6, 99.0, 100.4); // sweeps 99.5, closes back above

    const hit = detectSSLRaid(s, 10, 30);
    expect(hit).not.toBeNull();
    expect(hit!.barIndex).toBe(10);
    expect(hit!.sweptLevel).toBeCloseTo(99.5);
    expect(hit!.raidLow).toBeCloseTo(99.0);
    expect(hit!.reclaimed).toBe(true);
    expect(hit!.quality).toBeGreaterThan(0.5);
  });

  it("still reports an unreclaimed sweep, graded well below a reclaim", () => {
    const s = mkSeries(12);
    set(s, 10, 100, 100.2, 99.0, 99.2); // sweeps but closes below

    const hit = detectSSLRaid(s, 10, 30);
    expect(hit).not.toBeNull();
    expect(hit!.reclaimed).toBe(false);
    expect(hit!.quality).toBeLessThan(0.5);
  });

  it("returns null when no low is taken", () => {
    expect(detectSSLRaid(mkSeries(12), 10, 30)).toBeNull();
  });

  it("returns the most recent raid, not the oldest", () => {
    const s = mkSeries(20);
    set(s, 11, 100, 100.6, 99.0, 100.4);
    set(s, 18, 100, 100.6, 98.0, 100.4);

    expect(detectSSLRaid(s, 19, 30)!.barIndex).toBe(18);
  });
});

// ── Displacement ──

describe("detectDisplacement", () => {
  it("finds a dominant expanding bullish candle", () => {
    const s = mkSeries(6);
    set(s, 4, 100, 103.2, 99.8, 103.0);

    const hit = detectDisplacement(s, 4, 30);
    expect(hit).not.toBeNull();
    expect(hit!.barIndex).toBe(4);
    expect(hit!.bodyRatio).toBeGreaterThan(0.6);
    expect(hit!.quality).toBeGreaterThan(0.5);
  });

  it("rejects a wide candle with a small body", () => {
    const s = mkSeries(6);
    set(s, 4, 100, 105, 99, 101); // body 1 of range 6

    expect(detectDisplacement(s, 4, 30)).toBeNull();
  });

  it("rejects a candle that does not close above the prior high", () => {
    const s = mkSeries(6);
    set(s, 4, 99, 100.4, 98.9, 100.3); // prior high is 100.5

    expect(detectDisplacement(s, 4, 30)).toBeNull();
  });

  it("rejects a bearish candle however large", () => {
    const s = mkSeries(6);
    set(s, 4, 103, 103.2, 99.8, 100.0);

    expect(detectDisplacement(s, 4, 30)).toBeNull();
  });
});

// ── MSS ──

describe("detectMSS", () => {
  it("freezes the structure high at the anchor and takes the first close above it", () => {
    const s = mkSeries(20);
    for (let i = 2; i < 10; i++) s.highs[i] = 101;
    set(s, 12, 100, 100.4, 99.6, 100.0); // not yet above 101
    set(s, 14, 100, 102.5, 99.9, 102.0); // first close above

    const hit = detectMSS(s, 19, 30, 10);
    expect(hit).not.toBeNull();
    expect(hit!.barIndex).toBe(14);
    expect(hit!.structureHigh).toBeCloseTo(101);
    expect(hit!.anchored).toBe(true);
  });

  it("grades an unanchored shift below an anchored one", () => {
    const s = mkSeries(20);
    set(s, 15, 100, 102.5, 99.9, 102.0);

    const anchored = detectMSS(s, 19, 30, 10);
    const rolling = detectMSS(s, 19, 30, null);

    expect(rolling).not.toBeNull();
    expect(rolling!.anchored).toBe(false);
    expect(anchored!.quality).toBeGreaterThan(rolling!.quality);
  });
});

// ── FVG ──

describe("detectFVG", () => {
  it("records the zone between high[i-2] and low[i]", () => {
    const s = mkSeries(10);
    set(s, 4, 100, 100.5, 99.5, 100.0);
    set(s, 5, 100, 102.0, 100.0, 101.8);
    set(s, 6, 102, 103.0, 101.0, 102.5); // low 101.0 > high[4] 100.5

    const hit = detectFVG(s, 6, 30, 0);
    expect(hit).not.toBeNull();
    expect(hit!.lower).toBeCloseTo(100.5);
    expect(hit!.upper).toBeCloseTo(101.0);
    expect(hit!.filled).toBe(false);
  });

  it("measures retracement back into the zone", () => {
    const s = mkSeries(10);
    set(s, 4, 100, 100.5, 99.5, 100.0);
    set(s, 5, 100, 102.0, 100.0, 101.8);
    set(s, 6, 102, 103.0, 101.0, 102.5); // zone 100.5 - 101.0, height 0.5
    set(s, 7, 102, 102.2, 100.75, 101.5); // dips to 100.75 = 50% of the zone

    const hit = detectFVG(s, 7, 30, 0);
    expect(hit!.retracedFraction).toBeCloseTo(0.5, 1);
    expect(hit!.filled).toBe(false);
  });

  it("flags a zone that price traded fully through", () => {
    const s = mkSeries(10);
    set(s, 4, 100, 100.5, 99.5, 100.0);
    set(s, 5, 100, 102.0, 100.0, 101.8);
    set(s, 6, 102, 103.0, 101.0, 102.5);
    set(s, 7, 102, 102.2, 100.0, 100.2); // straight through the zone

    const hit = detectFVG(s, 7, 30, 0);
    expect(hit!.filled).toBe(true);
    expect(hit!.retracedFraction).toBe(1);
  });
});

// ── BSL ──

describe("detectBSL", () => {
  it("counts highs clustered at the pool level", () => {
    const s = mkSeries(12);
    s.highs[3] = 105;
    s.highs[7] = 105;

    const hit = detectBSL(s, 10);
    expect(hit).not.toBeNull();
    expect(hit!.level).toBeCloseTo(105);
    expect(hit!.clusterCount).toBe(2);
  });

  it("reports a lone spike high with a low grade rather than nothing", () => {
    const s = mkSeries(12);
    s.highs[5] = 110;

    const hit = detectBSL(s, 10);
    expect(hit).not.toBeNull();
    expect(hit!.clusterCount).toBe(1);
    expect(hit!.quality).toBe(0); // floor of the count band — real, but worthless
  });
});

// ── Compression ──

describe("detectCompression", () => {
  it("reports NO contraction when ranges are unchanged", () => {
    // Regression test for the TOS v1.3 bug: it compared a 4-bar max against a
    // 6-bar max, so equal ranges still registered as contraction.
    const hit = detectCompression(mkSeries(20), 19, null);
    expect(hit).not.toBeNull();
    expect(hit!.contractionRatio).toBeCloseTo(1.0);
  });

  it("detects a genuinely tightening range", () => {
    const s = mkSeries(20);
    for (let i = 12; i <= 15; i++) set(s, i, 100, 102, 98, 100); // wide prior block
    for (let i = 16; i <= 19; i++) set(s, i, 100, 100.4, 99.6, 100); // tight current block

    const hit = detectCompression(s, 19, null);
    expect(hit!.contractionRatio).toBeLessThan(0.5);
    expect(hit!.quality).toBeGreaterThan(0);
  });

  it("scores proximity to the pool overhead", () => {
    const s = mkSeries(20);
    const near = detectCompression(s, 19, 101)!; // ~1% away
    const far = detectCompression(s, 19, 130)!; // ~23% away

    expect(near.quality).toBeGreaterThan(far.quality);
  });
});

// ── Risk helpers ──

describe("risk helpers", () => {
  it("finds the bar that closed through the protected low", () => {
    const s = mkSeries(10);
    set(s, 7, 100, 100.2, 97.0, 97.5);

    expect(findInvalidation(s, 3, 9, 98)).toBe(7);
    expect(findInvalidation(s, 3, 9, 95)).toBeNull();
  });

  it("counts consecutive bullish expanding candles", () => {
    const s = mkSeries(10);
    set(s, 7, 100, 101.0, 99.8, 100.8);
    set(s, 8, 100.8, 102.5, 100.6, 102.3);
    set(s, 9, 102.3, 105.0, 102.0, 104.8);

    expect(countConsecutiveExpansion(s, 9)).toBe(3);
    expect(countConsecutiveExpansion(mkSeries(10), 9)).toBe(0);
  });
});

// ── Assessment ──

describe("assessICT", () => {
  it("returns an empty assessment for a series that is too short", () => {
    const a = assessICT(mkSeries(10));
    expect(a.score).toBe(0);
    expect(a.grade).toBe("NONE");
    expect(a.ingredientsFound).toBe(0);
  });

  it("scores a clean sequence and finds most ingredients", () => {
    const a = assessICT(buildCleanSetup());

    expect(a.detections.ssl).not.toBeNull();
    expect(a.detections.displacement).not.toBeNull();
    expect(a.detections.mss).not.toBeNull();
    expect(a.detections.fvg).not.toBeNull();
    expect(a.ingredientsFound).toBeGreaterThanOrEqual(6);
    expect(a.score).toBeGreaterThan(50);
    expect(a.flags.invalidated).toBe(false);
  });

  it("orders the sequence chronologically", () => {
    const d = assessICT(buildCleanSetup()).detections;

    // Older events carry a larger barsAgo.
    expect(d.ssl!.barsAgo).toBeGreaterThan(d.displacement!.barsAgo);
    expect(d.displacement!.barsAgo).toBeGreaterThanOrEqual(d.fvg!.barsAgo);
    expect(a_coherence()).toBeGreaterThan(0.5);

    function a_coherence(): number {
      return assessICT(buildCleanSetup()).coherenceRatio;
    }
  });

  // ── The architectural guarantee this rewrite exists for ──

  it("does NOT zero the earlier components when the pool overhead is weak", () => {
    // A lone spike high instead of a cluster. Under the state machine in
    // engine.ts this stalled at BSL_BUILT and every component above it scored
    // zero. Here the displacement is graded on its own merits regardless.
    const s = buildCleanSetup();
    set(s, 41, 106.2, 112.0, 105.9, 106.1); // one lone spike, nothing clustered at it

    const a = assessICT(s);
    expect(a.detections.bsl!.clusterCount).toBe(1);
    expect(a.components.bsl).toBe(0);
    expect(a.components.displacement).toBeGreaterThan(0);
    expect(a.components.ssl).toBeGreaterThan(0);
    expect(a.score).toBeGreaterThan(30);
  });

  it("penalizes and flags a setup whose protected low was broken", () => {
    // The bug still live in production: engine.ts marks this invalidated but
    // the flag is dropped before persistence, so a dead setup renders as live.
    const clean = assessICT(buildCleanSetup());

    const broken = buildCleanSetup();
    set(broken, 42, 106.1, 106.3, 97.0, 97.5); // closes below the 98.0 raid low

    const a = assessICT(broken);
    expect(a.flags.invalidated).toBe(true);
    expect(a.penalties.some((p) => p.reason.includes("protected low"))).toBe(true);
    expect(a.score).toBeLessThan(clean.score);
  });

  it("flags chasing after consecutive expansion candles", () => {
    const s = buildCleanSetup();
    set(s, 42, 106.1, 107.5, 106.0, 107.3);
    set(s, 43, 107.3, 109.5, 107.1, 109.3);
    set(s, 44, 109.3, 112.5, 109.0, 112.3);

    const a = assessICT(s);
    expect(a.flags.chasing).toBe(true);
    expect(a.penalties.some((p) => p.reason.includes("chasing"))).toBe(true);
  });

  it("withholds PRIME from clean structure that is not yet coiled", () => {
    // Full sweep/displacement/MSS/FVG structure but no clustered pool overhead
    // and no coil. Scores high on structure alone; must not read as ready.
    const s = buildCleanSetup();
    set(s, 41, 106.2, 112.0, 105.9, 106.1);

    const a = assessICT(s);
    expect(a.components.bsl + a.components.compression).toBeLessThan(10);
    expect(a.score).toBeGreaterThanOrEqual(70);
    expect(a.grade).toBe("BUILDING");
  });

  it("grades an invalidated setup NONE however well it scored", () => {
    const broken = buildCleanSetup();
    set(broken, 42, 106.1, 106.3, 97.0, 97.5);

    const a = assessICT(broken);
    expect(a.flags.invalidated).toBe(true);
    expect(a.grade).toBe("NONE");
    expect(a.score).toBeGreaterThan(0); // score stays visible for inspection
  });

  it("never returns a score outside 0..100", () => {
    const broken = buildCleanSetup();
    set(broken, 40, 106.1, 106.3, 90.0, 90.5);
    set(broken, 44, 90.0, 90.2, 88.0, 88.1);

    const a = assessICT(broken);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
  });

  it("emits one evidence line per ingredient found, plus the sequence line", () => {
    const a = assessICT(buildCleanSetup());
    expect(a.evidence.length).toBe(a.ingredientsFound + 1);
  });
});

// ── Config invariant ──

describe("config", () => {
  it("component weights total 100", () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});
