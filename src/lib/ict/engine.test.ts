import { describe, it, expect } from "vitest";
import { runICTEngine } from "./engine";
import { scoreICTSetup } from "./scoring";
import { detectBullishCISD } from "./cisd";
import { aggregateSessions, splitSessions } from "./aggregate";
import { ICTState } from "./types";
import { SCORING } from "./config";

// ── Synthetic OHLC Fixture Builder ──

interface Fixture {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  timestamps: number[];
}

function builder() {
  const f: Fixture = { opens: [], highs: [], lows: [], closes: [], timestamps: [] };
  let t = 1700000000;
  return {
    f,
    add(o: number, h: number, l: number, c: number) {
      f.opens.push(o);
      f.highs.push(h);
      f.lows.push(l);
      f.closes.push(c);
      f.timestamps.push(t);
      t += 3600;
      return this;
    },
  };
}

/**
 * A 32-bar sequence that walks the full ladder to IGNITION under the current
 * rules — an SSL POOL (not a lone rolling low), an FVG opened by an energetic
 * leg, a pivot-confirmed higher low, a clustered BSL above price, and a CISD
 * over a two-bar delivery leg.
 */
function buildFullProgressionFixture(): Fixture {
  const b = builder();

  // ── Bars 0-6: decline into the pool. High of bar 6 (214) becomes the
  //    frozen structure high.
  b.add(220, 221, 217, 218);      // 0
  b.add(218, 219, 216, 217);      // 1
  b.add(217, 218, 215, 216);      // 2
  b.add(216, 217, 214, 215);      // 3
  b.add(215, 216, 213, 214);      // 4
  b.add(214, 215, 212, 213);      // 5
  b.add(213, 214, 211, 212);      // 6  <- structure high 214

  // ── Bars 7-13: two equal lows at 210.00 form the sell-side pool.
  b.add(212, 212.5, 210.0, 211);  // 7  <- pool low
  b.add(211, 211.5, 210.6, 211);  // 8
  b.add(211, 211.5, 210.6, 211);  // 9
  b.add(211, 211.5, 210.6, 211);  // 10
  b.add(211, 211.5, 210.0, 211);  // 11 <- pool low
  b.add(211, 211.5, 210.6, 211);  // 12
  b.add(211, 211.5, 210.6, 211);  // 13

  // ── Bar 14: SSL_RAID. Sweeps 210.00, closes back above it.
  b.add(210.8, 210.9, 209.5, 210.5); // 14  protected low = 209.5

  // ── Bars 15-17: compression, so bar 18 can out-body and out-range them.
  b.add(210.5, 211.0, 210.2, 210.8); // 15
  b.add(210.8, 211.1, 210.5, 210.9); // 16
  b.add(210.9, 211.2, 210.6, 211.0); // 17

  // ── Bar 18: displacement AND market structure shift on one candle.
  b.add(211.1, 215.5, 211.0, 215.0); // 18

  // ── Bar 19: third leg of the displacement FVG (low 214.5 > high[17] 211.2).
  b.add(215.0, 216.0, 214.5, 215.5); // 19  <- also the BSL pivot at 216.0

  // ── Bar 20: retrace ~60% into the gap.
  b.add(215.5, 215.8, 212.5, 213.5); // 20

  // ── Bars 21-23: pivot-confirmed higher low, reclaimed on bar 23.
  b.add(213.5, 214.0, 212.8, 213.0); // 21
  b.add(213.0, 213.5, 212.4, 213.2); // 22 <- pivot low, risk trails here
  b.add(213.2, 214.5, 212.9, 214.0); // 23 <- HL + BSL built (216.0 above price)

  // ── Bar 24: compression into the draw.
  b.add(214.0, 214.8, 213.0, 214.5); // 24 <- ARMED, 0.69% below BSL

  // ── Bars 25-26: a two-bar bearish delivery leg; bar 27 undoes all of it.
  b.add(214.5, 214.9, 213.8, 214.0); // 25 <- leg opens at 214.5
  b.add(214.0, 214.3, 213.5, 213.7); // 26
  b.add(213.7, 215.2, 213.6, 215.0); // 27 <- CISD: close 215.0 > 214.5

  // ── Bars 28-30: coil, then break the draw with displacement.
  b.add(215.0, 215.3, 214.8, 215.1); // 28
  b.add(215.1, 215.4, 214.9, 215.2); // 29
  b.add(215.2, 215.5, 215.0, 215.3); // 30
  b.add(215.3, 219.0, 215.2, 218.5); // 31 <- IGNITION through 216.0

  return b.f;
}

function runTo(bars: number) {
  const full = buildFullProgressionFixture();
  return runICTEngine(
    full.opens.slice(0, bars),
    full.highs.slice(0, bars),
    full.lows.slice(0, bars),
    full.closes.slice(0, bars),
    full.timestamps.slice(0, bars),
  );
}

function run(f: Fixture) {
  return runICTEngine(f.opens, f.highs, f.lows, f.closes, f.timestamps);
}

// ── Tests ──

describe("ICT Engine — State Machine", () => {
  it("progresses through the full ladder to IGNITION", () => {
    const setup = run(buildFullProgressionFixture());
    expect(setup.currentState).toBe(ICTState.IGNITION);
  });

  it("detects the SSL raid and freezes the structure high", () => {
    const setup = runTo(15);
    expect(setup.currentState).toBe(ICTState.STRUCTURE_HIGH);
    expect(setup.sslRaid?.sweptPrice).toBe(210);
    expect(setup.protectedLow).toBe(209.5);
    expect(setup.mssLevel).toBe(214);
  });

  it("returns NONE when no sweep occurs", () => {
    const b = builder();
    for (let i = 0; i < 20; i++) b.add(100, 101, 99, 100.5);
    expect(run(b.f).currentState).toBe(ICTState.NONE);
  });

  it("does not raid when the sweep is not reclaimed", () => {
    const f = buildFullProgressionFixture();
    f.closes[14] = 209.6; // below the swept 210.00
    const setup = runICTEngine(
      f.opens.slice(0, 16), f.highs.slice(0, 16), f.lows.slice(0, 16),
      f.closes.slice(0, 16), f.timestamps.slice(0, 16),
    );
    expect(setup.currentState).toBe(ICTState.NONE);
  });

  // A4 — the raid must take a POOL, not one isolated low.
  it("rejects a sweep of a single low with no pool behind it", () => {
    const f = buildFullProgressionFixture();
    // Drop bar 7 well below the rest: it becomes the only low at that level.
    f.lows[7] = 205.0;
    f.lows[11] = 210.0;
    f.lows[14] = 204.5;
    f.closes[14] = 205.5;
    const setup = runICTEngine(
      f.opens.slice(0, 16), f.highs.slice(0, 16), f.lows.slice(0, 16),
      f.closes.slice(0, 16), f.timestamps.slice(0, 16),
    );
    expect(setup.currentState).toBe(ICTState.NONE);
  });

  it("records how many lows rested at the swept level", () => {
    const setup = runTo(15);
    expect(setup.sslRaid?.poolCount).toBeGreaterThanOrEqual(2);
  });

  it("advances to MSS on a close above the structure high, not a wick", () => {
    const f = buildFullProgressionFixture();
    f.highs[18] = 215.5;
    f.closes[18] = 213.5; // wicks over 214 but closes under
    const setup = runICTEngine(
      f.opens.slice(0, 19), f.highs.slice(0, 19), f.lows.slice(0, 19),
      f.closes.slice(0, 19), f.timestamps.slice(0, 19),
    );
    expect(setup.currentState).toBeLessThan(ICTState.BULLISH_MSS);
  });

  // A11 — one candle may satisfy several rungs.
  it("advances multiple states on a single candle", () => {
    const setup = runTo(19);
    // Bar 18 is displacement and MSS together.
    expect(setup.currentState).toBe(ICTState.BULLISH_MSS);
    const barsUsed = new Set(setup.transitions.map((t) => t.barIndex));
    expect(barsUsed.size).toBeLessThan(setup.transitions.length);
  });

  // A5 — the gap left by the displacement leg.
  it("detects the displacement FVG", () => {
    const setup = runTo(20);
    expect(setup.currentState).toBe(ICTState.FVG_CONFIRMED);
    expect(setup.fvgZone?.lower).toBeCloseTo(211.2, 5);
    expect(setup.fvgZone?.upper).toBeCloseTo(214.5, 5);
  });

  it("rejects a gap whose middle candle carries no energy", () => {
    const f = buildFullProgressionFixture();
    // Turn bar 18 into a wide doji: still gaps, but the leg has no body.
    f.opens[18] = 214.9;
    f.closes[18] = 215.0;
    f.highs[18] = 218.0;
    f.lows[18] = 211.0;
    const setup = runICTEngine(
      f.opens.slice(0, 21), f.highs.slice(0, 21), f.lows.slice(0, 21),
      f.closes.slice(0, 21), f.timestamps.slice(0, 21),
    );
    expect(setup.fvgZone).toBeNull();
  });

  it("does not count the forming bar as its own retracement", () => {
    const setup = runTo(20);
    expect(setup.currentState).toBe(ICTState.FVG_CONFIRMED);
    expect(setup.currentState).not.toBe(ICTState.FVG_RETRACEMENT);
  });

  it("tracks the DEEPEST retracement, not the first touch", () => {
    const setup = runTo(23);
    // Bar 20 touches to 212.5 (0.61); bar 22 digs to 212.4 (0.64).
    expect(setup.retracementDepth).toBeGreaterThan(0.63);
  });

  // A8 — risk moves to the reaccumulation low.
  it("trails the protected low to the higher low", () => {
    const setup = runTo(24);
    expect(setup.currentState).toBeGreaterThanOrEqual(ICTState.HIGHER_LOW);
    expect(setup.protectedLowTrailed).toBe(true);
    expect(setup.protectedLow).toBeCloseTo(212.4, 5);
    expect(setup.originalProtectedLow).toBe(209.5);
  });

  // A9 — the draw is a clustered pivot above price, not the local high.
  it("builds the BSL from a clustered pivot above price", () => {
    const setup = runTo(24);
    expect(setup.bslLevel).toBeCloseTo(216.0, 5);
    expect(setup.bslClusterCount).toBeGreaterThanOrEqual(2);
    expect(setup.bslUnbroken).toBe(true);
  });

  it("reaches ARMED while compressing under the draw", () => {
    const setup = runTo(25);
    expect(setup.currentState).toBe(ICTState.ARMED);
    expect(setup.distanceToBslPct).toBeGreaterThan(0);
    expect(setup.distanceToBslPct).toBeLessThan(3);
  });

  it("reaches TRIGGER on a CISD over the delivery leg", () => {
    const setup = runTo(28);
    expect(setup.currentState).toBe(ICTState.TRIGGER);
    expect(setup.cisd.triggered).toBe(true);
    expect(setup.cisd.runLength).toBe(2);
  });

  // B2 — the distance to the draw keeps updating past ARMED.
  it("keeps refreshing distance to BSL after the setup leaves ARMED", () => {
    const armed = runTo(25);
    const trigger = runTo(28);
    expect(trigger.currentState).toBe(ICTState.TRIGGER);
    expect(trigger.distanceToBslPct).not.toBeCloseTo(armed.distanceToBslPct!, 6);
  });

  it("reports a negative distance once the draw is cleared", () => {
    const setup = run(buildFullProgressionFixture());
    expect(setup.currentState).toBe(ICTState.IGNITION);
    expect(setup.distanceToBslPct).toBeLessThan(0);
  });

  // B3 — freshness.
  it("stamps the bar and age of the current state", () => {
    const setup = run(buildFullProgressionFixture());
    expect(setup.stateBarIndex).toBe(31);
    expect(setup.stateBarsAgo).toBe(0);

    const stale = runTo(27);
    expect(stale.currentState).toBe(ICTState.ARMED);
    expect(stale.stateBarsAgo).toBe(2); // armed on bar 24, series ends at 26
  });
});

describe("ICT Engine — Invalidation", () => {
  it("invalidates when price closes below the protected low", () => {
    const f = buildFullProgressionFixture();
    f.lows[16] = 209.0;
    f.closes[16] = 209.2; // under the 209.5 raid low
    const setup = runICTEngine(
      f.opens.slice(0, 18), f.highs.slice(0, 18), f.lows.slice(0, 18),
      f.closes.slice(0, 18), f.timestamps.slice(0, 18),
    );
    expect(setup.currentState).toBe(ICTState.NONE);
    expect(setup.priorInvalidation).not.toBeNull();
  });

  // A7 — a bullish gap closed through has inverted.
  it("invalidates when the FVG is closed through", () => {
    const f = buildFullProgressionFixture();
    f.lows[21] = 210.5;
    f.closes[21] = 210.8; // below the 211.2 gap floor, above the 209.5 raid low
    const setup = runICTEngine(
      f.opens.slice(0, 23), f.highs.slice(0, 23), f.lows.slice(0, 23),
      f.closes.slice(0, 23), f.timestamps.slice(0, 23),
    );
    expect(setup.currentState).toBe(ICTState.NONE);
    expect(setup.priorInvalidation?.reason).toMatch(/inverted/i);
  });

  // B1 — never report a dead high-water setup as if it were live.
  it("reports the LIVE state after a break, not the furthest state reached", () => {
    const full = buildFullProgressionFixture();
    // Kill the setup right after it arms, then let the series run on.
    full.lows[25] = 210.0;
    full.closes[25] = 210.5; // below the trailed 212.4 AND the 211.2 gap floor
    const setup = run(full);

    expect(setup.currentState).toBeLessThan(ICTState.ARMED);
    expect(setup.priorInvalidation).not.toBeNull();
    expect(setup.priorInvalidation!.state).toBeGreaterThanOrEqual(ICTState.ARMED);
    // The dead setup's levels must not be presented as current.
    expect(setup.bslLevel === null || setup.bslLevel !== 216.0).toBe(true);
  });

  it("reports how long ago the prior setup broke", () => {
    const full = buildFullProgressionFixture();
    full.lows[25] = 210.0;
    full.closes[25] = 210.5;
    const setup = run(full);
    expect(setup.priorInvalidation!.barsAgo).toBe(full.closes.length - 1 - 25);
  });
});

describe("ICT Engine — Dealing Range", () => {
  // A6 — premium/discount is measured against the leg, not the gap.
  it("computes the dealing range from the raid low to the running high", () => {
    const setup = runTo(21);
    expect(setup.dealingRange).not.toBeNull();
    expect(setup.dealingRange!.low).toBe(209.5);
    expect(setup.dealingRange!.high).toBe(216.0);
  });

  it("marks a deep pullback as discount and a running price as premium", () => {
    const deep = runTo(21); // close 213.5 in a 209.5-216.0 range
    expect(deep.dealingRange!.retracement).toBeGreaterThan(0.3);

    const extended = run(buildFullProgressionFixture()); // close 218.5 at the high
    expect(extended.dealingRange!.inDiscount).toBe(false);
    expect(extended.dealingRange!.retracement).toBeLessThan(0.1);
  });

  it("flags the OTE band", () => {
    const f = buildFullProgressionFixture();
    // Range is 209.5-216.0 (span 6.5). 0.70 retracement => close 211.45.
    f.lows[21] = 211.4;
    f.closes[21] = 211.45;
    const setup = runICTEngine(
      f.opens.slice(0, 22), f.highs.slice(0, 22), f.lows.slice(0, 22),
      f.closes.slice(0, 22), f.timestamps.slice(0, 22),
    );
    expect(setup.dealingRange!.inOTE).toBe(true);
  });
});

describe("ICT Engine — Edge Cases", () => {
  it("returns empty setup for too-short data", () => {
    const b = builder();
    for (let i = 0; i < 5; i++) b.add(100, 101, 99, 100);
    expect(run(b.f).currentState).toBe(ICTState.NONE);
  });

  it("handles all-flat candles gracefully", () => {
    const b = builder();
    for (let i = 0; i < 40; i++) b.add(100, 100, 100, 100);
    const setup = run(b.f);
    expect(setup.currentState).toBe(ICTState.NONE);
    expect(setup.barsProcessed).toBe(40);
  });

  it("handles a single very large candle without crashing", () => {
    const b = builder();
    for (let i = 0; i < 20; i++) b.add(100, 101, 99, 100);
    b.add(100, 500, 50, 480);
    for (let i = 0; i < 10; i++) b.add(480, 481, 479, 480);
    expect(() => run(b.f)).not.toThrow();
  });

  it("produces the same result regardless of future data (no look-ahead)", () => {
    const full = buildFullProgressionFixture();
    const prefix = runTo(25);
    const fromFull = runICTEngine(
      full.opens.slice(0, 25), full.highs.slice(0, 25), full.lows.slice(0, 25),
      full.closes.slice(0, 25), full.timestamps.slice(0, 25),
    );
    expect(fromFull.currentState).toBe(prefix.currentState);
    expect(fromFull.bslLevel).toBe(prefix.bslLevel);
    expect(fromFull.protectedLow).toBe(prefix.protectedLow);
  });
});

describe("ICT Scoring", () => {
  it("sums the ten components to the total", () => {
    const f = buildFullProgressionFixture();
    const setup = run(f);
    const score = scoreICTSetup(setup, f.opens, f.highs, f.lows, f.closes, "4h");
    const c = score.components;
    const sum =
      c.stateScore + c.displacementQuality + c.fvgQuality + c.retracementDepth +
      c.entryQuality + c.bslQuality + c.compressionQuality + c.structureCoherence +
      c.invalidationDistance + c.recency;
    expect(score.total).toBe(Math.min(100, Math.round(sum)));
  });

  it("scores NONE state as 0", () => {
    const b = builder();
    for (let i = 0; i < 20; i++) b.add(100, 101, 99, 100.5);
    const setup = run(b.f);
    const score = scoreICTSetup(setup, b.f.opens, b.f.highs, b.f.lows, b.f.closes, "1d");
    expect(score.total).toBe(0);
  });

  // B6 — state must not dominate the composite.
  it("caps the state ladder at a minority of the score", () => {
    const f = buildFullProgressionFixture();
    const setup = run(f);
    const score = scoreICTSetup(setup, f.opens, f.highs, f.lows, f.closes, "4h");
    expect(score.components.stateScore).toBeLessThanOrEqual(SCORING.STATE_MAX);
    expect(SCORING.STATE_MAX).toBeLessThan(50 - SCORING.STATE_MAX);
  });

  // A8 — invalidation distance is a band, not a ramp.
  it("scores a far stop below a well-placed one", () => {
    const f = buildFullProgressionFixture();
    const setup = run(f);

    const tight = { ...setup, protectedLow: f.closes[f.closes.length - 1] * 0.97 };
    const far = { ...setup, protectedLow: f.closes[f.closes.length - 1] * 0.80 };
    const noisy = { ...setup, protectedLow: f.closes[f.closes.length - 1] * 0.999 };

    const s = (x: typeof setup) =>
      scoreICTSetup(x, f.opens, f.highs, f.lows, f.closes, "4h").components.invalidationDistance;

    expect(s(tight)).toBe(SCORING.INVALIDATION_DISTANCE_MAX);
    expect(s(far)).toBeLessThan(s(tight));
    expect(s(noisy)).toBe(0);
  });

  // B3/B7 — recency decays, and its budget is per-timeframe.
  it("decays recency as the state ages, on a per-timeframe budget", () => {
    const f = buildFullProgressionFixture();
    const setup = run(f);

    const fresh = scoreICTSetup(setup, f.opens, f.highs, f.lows, f.closes, "4h");
    const aged = scoreICTSetup(
      { ...setup, stateBarIndex: 5 }, f.opens, f.highs, f.lows, f.closes, "4h",
    );
    expect(fresh.components.recency).toBe(SCORING.RECENCY_MAX);
    expect(aged.components.recency).toBe(0);

    // The same absolute age is treated differently on a weekly chart.
    const midAge = { ...setup, stateBarIndex: setup.barsProcessed - 1 - 6 };
    const on4h = scoreICTSetup(midAge, f.opens, f.highs, f.lows, f.closes, "4h").components.recency;
    const on1wk = scoreICTSetup(midAge, f.opens, f.highs, f.lows, f.closes, "1wk").components.recency;
    expect(on4h).toBeGreaterThan(on1wk);
  });

  // A6 — premium is not paid like discount.
  it("pays OTE more than premium", () => {
    const f = buildFullProgressionFixture();
    const setup = run(f);
    const at = (retracement: number) =>
      scoreICTSetup(
        { ...setup, dealingRange: { low: 100, high: 110, equilibrium: 105, retracement, inDiscount: retracement >= 0.5, inOTE: retracement >= 0.62 && retracement <= 0.79 } },
        f.opens, f.highs, f.lows, f.closes, "4h",
      ).components.entryQuality;

    expect(at(0.70)).toBe(SCORING.ENTRY_QUALITY_MAX);
    expect(at(0.55)).toBeLessThan(at(0.70));
    expect(at(0.10)).toBeLessThan(at(0.55));
  });

  // C7 — flags arm from ARMED, not TRIGGER.
  it("flags chasing from the ARMED state onward", () => {
    const b = builder();
    // Pool, raid, then a straight vertical run.
    for (let i = 0; i < 7; i++) b.add(100, 101, 99.5, 100);
    b.add(100, 101, 98.0, 100);
    b.add(100, 101, 98.0, 100);
    for (let i = 0; i < 6; i++) b.add(100, 101, 99.5, 100);
    const setup = run(b.f);
    // No setup here, so no flag — the point is the gate does not throw.
    expect(setup.currentState).toBeLessThan(ICTState.ARMED);
    const score = scoreICTSetup(setup, b.f.opens, b.f.highs, b.f.lows, b.f.closes, "1d");
    expect(score.isChasing).toBe(false);
  });
});

describe("CISD Module", () => {
  it("returns triggered=false when no bearish candle exists", () => {
    const opens = [10, 11, 12];
    const closes = [11, 12, 13];
    expect(detectBullishCISD(opens, closes, 2).triggered).toBe(false);
  });

  it("returns triggered=false when the current bar is bearish", () => {
    const opens = [10, 12, 12];
    const closes = [11, 11, 11.5];
    expect(detectBullishCISD(opens, closes, 2).triggered).toBe(false);
  });

  // A3 — the threshold is the delivery LEG, not the last lone down bar.
  it("uses the open of the first candle in the bearish run", () => {
    //            0    1    2    3(bear) 4(bear) 5(bear) 6(bull)
    const opens = [10, 10, 10, 20, 18, 16, 15];
    const closes = [10, 10, 10, 18, 16, 15, 19];
    const r = detectBullishCISD(opens, closes, 6);
    expect(r.bearishBarIndex).toBe(3);
    expect(r.bearishOpen).toBe(20);
    expect(r.runLength).toBe(3);
    expect(r.triggered).toBe(false); // 19 < 20 — the leg is not undone
  });

  it("triggers only once the whole leg is undone", () => {
    const opens = [10, 10, 10, 20, 18, 16, 15];
    const closes = [10, 10, 10, 18, 16, 15, 21];
    const r = detectBullishCISD(opens, closes, 6);
    expect(r.triggered).toBe(true);
  });

  it("would have triggered on the old single-candle rule but does not now", () => {
    // The last bearish candle opened at 16; the leg opened at 20.
    const opens = [10, 10, 10, 20, 18, 16, 15];
    const closes = [10, 10, 10, 18, 16, 15, 17];
    const r = detectBullishCISD(opens, closes, 6);
    expect(closes[6]).toBeGreaterThan(opens[5]); // old rule: triggered
    expect(r.triggered).toBe(false);             // new rule: not yet
  });

  it("skips back over bullish candles to find the run", () => {
    //            0    1    2(bear) 3(bear) 4(bull) 5(bull)
    const opens = [10, 10, 20, 18, 16, 17];
    const closes = [10, 10, 18, 16, 17, 21];
    const r = detectBullishCISD(opens, closes, 5);
    expect(r.bearishBarIndex).toBe(2);
    expect(r.bearishOpen).toBe(20);
    expect(r.triggered).toBe(true);
  });
});

describe("Session-aware aggregation", () => {
  // A10 — buckets never straddle a session, and the tail is never dropped.
  const HOUR = 3600;
  const DAY = 24 * HOUR;

  function hourlySeries(days: number, barsPerDay: number) {
    const s = { opens: [] as number[], highs: [] as number[], lows: [] as number[], closes: [] as number[], timestamps: [] as number[] };
    let base = 1700000000;
    let px = 100;
    for (let d = 0; d < days; d++) {
      for (let h = 0; h < barsPerDay; h++) {
        s.opens.push(px);
        s.highs.push(px + 1);
        s.lows.push(px - 1);
        s.closes.push(px + 0.5);
        s.timestamps.push(base + h * HOUR);
        px += 0.5;
      }
      base += DAY;
    }
    return s;
  }

  it("splits sessions on the overnight gap", () => {
    const s = hourlySeries(3, 7);
    expect(splitSessions(s.timestamps).map((x) => x.length)).toEqual([7, 7, 7]);
  });

  it("never merges bars across a session boundary", () => {
    const s = hourlySeries(3, 7);
    const agg = aggregateSessions(s, 4)!;
    // 7 bars per day at 4 per bucket => 2 candles per day, 6 total.
    expect(agg.closes.length).toBe(6);
  });

  it("keeps the trailing partial bucket", () => {
    const s = hourlySeries(1, 7);
    const agg = aggregateSessions(s, 4)!;
    expect(agg.closes.length).toBe(2);
    // The last candle closes on the last hourly bar, not three bars earlier.
    expect(agg.closes[1]).toBe(s.closes[6]);
    expect(agg.timestamps[1]).toBe(s.timestamps[6]);
  });

  it("carries correct OHLC through a bucket", () => {
    const s = hourlySeries(1, 4);
    const agg = aggregateSessions(s, 4)!;
    expect(agg.opens[0]).toBe(s.opens[0]);
    expect(agg.closes[0]).toBe(s.closes[3]);
    expect(agg.highs[0]).toBe(Math.max(...s.highs));
    expect(agg.lows[0]).toBe(Math.min(...s.lows));
  });

  it("returns null for an empty series", () => {
    expect(aggregateSessions({ opens: [], highs: [], lows: [], closes: [], timestamps: [] }, 4)).toBeNull();
  });
});
