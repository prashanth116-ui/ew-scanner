import { describe, it, expect } from "vitest";
import { computeRotationTurn, rotationTurnReason, rotationTurnBadge, TURN_STAGE_ORDER, type RotationTurn } from "./rotation-turn";
import { ROTATION_TURN } from "./config";

/**
 * Synthetic series, because the point of these tests is the dating logic, not a
 * particular market. Dates are business-day-ish sequential strings — the detector only
 * ever indexes them, never parses them, so gaps are irrelevant.
 */
function dates(n: number): string[] {
  const out: string[] = [];
  let y = 2026, m = 1, d = 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    d++;
    if (d > 28) { d = 1; m++; if (m > 12) { m = 1; y++; } }
  }
  return out;
}

/** Benchmark held flat at 100 so the RS line equals the sector series. */
const flatBench = (n: number) => new Array(n).fill(100);

describe("computeRotationTurn", () => {
  it("returns NONE for a series too short to date a turn", () => {
    const n = ROTATION_TURN.SLOW_SMA + ROTATION_TURN.LOOKBACK_BARS - 1;
    const t = computeRotationTurn(dates(n), new Array(n).fill(100), flatBench(n), "LAGGING");
    expect(t.stage).toBe("NONE");
    expect(t.turnDate).toBeNull();
  });

  it("dates the turn on the session the RS line reclaimed its fast SMA", () => {
    // 150 sessions down, then a sharp 8-session recovery. The reclaim lands inside the
    // recovery, and that session — not the low — must be the reported turn.
    const n = 160;
    const closes: number[] = [];
    for (let i = 0; i < 152; i++) closes.push(200 - i);          // grind down to 48
    for (let i = 0; i < 8; i++) closes.push(48 + (i + 1) * 6);   // rip back to 96
    const d = dates(n);
    const t = computeRotationTurn(d, closes, flatBench(n), "WEAKENING");

    expect(t.direction).toBe("UP");
    expect(t.stage === "TURN_DETECTED" || t.stage === "TURN_CONFIRMED").toBe(true);
    expect(t.turnDate).not.toBeNull();
    // The low is bar 151; the turn must be after it and before the last bar.
    expect(d.indexOf(t.turnDate as string)).toBeGreaterThan(151);
    expect(t.rsLowDate).toBe(d[151]);
    expect(t.legLowDate).toBe(d[151]);
    expect(t.barsSinceTurn).toBeGreaterThanOrEqual(0);
    expect(t.heldSessions).toBeGreaterThanOrEqual(1);
  });

  it("separates the retrospective RS low from the actionable turn date", () => {
    const n = 160;
    const closes: number[] = [];
    for (let i = 0; i < 152; i++) closes.push(200 - i);
    for (let i = 0; i < 8; i++) closes.push(48 + (i + 1) * 6);
    const t = computeRotationTurn(dates(n), closes, flatBench(n), "WEAKENING");
    // This is the whole honesty claim of the module: the low is not the trigger.
    expect(t.rsLowDate).not.toBe(t.turnDate);
  });

  it("mirrors for a downside turn", () => {
    const n = 160;
    const closes: number[] = [];
    for (let i = 0; i < 152; i++) closes.push(100 + i);          // grind up
    for (let i = 0; i < 8; i++) closes.push(252 - (i + 1) * 8);  // break down
    const t = computeRotationTurn(dates(n), closes, flatBench(n), "LEADING");
    expect(t.direction).toBe("DOWN");
    expect(t.turnDate).not.toBeNull();
    expect(t.distanceFromFastPct).toBeGreaterThan(0); // signed by direction, so positive
  });

  it("counts prior failed reclaims rather than hiding them", () => {
    // A chop pattern that pokes above and falls back repeatedly, then holds.
    const n = 170;
    const closes: number[] = [];
    for (let i = 0; i < 100; i++) closes.push(150 - i * 0.5);       // slow decline
    for (let c = 0; c < 4; c++) {                                    // four false starts
      for (let i = 0; i < 6; i++) closes.push(100 + i * 2);
      for (let i = 0; i < 6; i++) closes.push(112 - i * 3);
    }
    for (let i = 0; i < 22; i++) closes.push(94 + i * 4);            // the one that holds
    const t = computeRotationTurn(dates(closes.length), closes, flatBench(closes.length), "WEAKENING");
    expect(t.direction).toBe("UP");
    expect(t.priorFailedAttempts).toBeGreaterThan(0);
    expect(n).toBeGreaterThan(0);
  });

  it("flags a turn older than MAX_TURN_AGE_BARS as stale", () => {
    // Long, uninterrupted advance: the reclaim is far in the past.
    const n = 200;
    const closes: number[] = [];
    for (let i = 0; i < 60; i++) closes.push(100 - i * 0.5);
    for (let i = 0; i < 140; i++) closes.push(70 + i * 2);
    const t = computeRotationTurn(dates(closes.length), closes, flatBench(closes.length), "LEADING");
    expect(t.barsSinceTurn).toBeGreaterThan(ROTATION_TURN.MAX_TURN_AGE_BARS);
    expect(t.stale).toBe(true);
  });

  it("separates the excursion low from the leg low when they differ", () => {
    // Deep low, a recovery that clears the fast SMA, a shallower pullback under it, then
    // a second reclaim. The turn must be dated off the SHALLOW low, not the deep one —
    // this is the SMH 09-14-vs-07-29 distinction.
    const closes: number[] = [];
    for (let i = 0; i < 120; i++) closes.push(180 - i);          // down to 61
    const deepLowIdx = closes.length - 1;
    for (let i = 0; i < 30; i++) closes.push(61 + i * 3);        // up to 148, clears fast SMA
    for (let i = 0; i < 8; i++) closes.push(148 - i * 5);        // shallow pullback under it
    const shallowLowIdx = closes.length - 1;
    for (let i = 0; i < 6; i++) closes.push(113 + i * 7);        // second reclaim
    const d = dates(closes.length);

    const t = computeRotationTurn(d, closes, flatBench(closes.length), "LEADING");
    expect(t.direction).toBe("UP");
    expect(t.rsLowDate).toBe(d[shallowLowIdx]);
    expect(t.rsLowDate).not.toBe(d[deepLowIdx]);
    // The leg low still reaches back to the deep one, so both facts stay available.
    expect(d.indexOf(t.legLowDate as string)).toBeLessThan(shallowLowIdx);
  });

  it("never reports a negative quadrant lag", () => {
    // The invariant the first cut broke: a quadrant that entered the bucket BEFORE the
    // turn was never late, and reporting that as "agreed -39 sessions later" (IGV on the
    // 2026-09-21 board) made the field unreadable. Asserted across shapes and all four
    // caller quadrants rather than against one synthetic, because which shape lands in
    // the already-aligned branch depends on calcRRG, not on this module.
    const shapes: number[][] = [];
    // long advance, dip under the fast SMA, reclaim
    shapes.push([
      ...Array.from({ length: 140 }, (_, i) => 100 + i * 1.5),
      ...Array.from({ length: 9 }, (_, i) => 310 - i * 6),
      ...Array.from({ length: 5 }, (_, i) => 256 + i * 9),
    ]);
    // long decline, pop above, fade
    shapes.push([
      ...Array.from({ length: 140 }, (_, i) => 300 - i * 1.5),
      ...Array.from({ length: 9 }, (_, i) => 90 + i * 5),
      ...Array.from({ length: 5 }, (_, i) => 135 - i * 7),
    ]);
    // choppy sideways
    shapes.push(Array.from({ length: 160 }, (_, i) => 100 + Math.sin(i / 4) * 8 + Math.cos(i / 11) * 4));

    const quadrants = ["LEADING", "WEAKENING", "LAGGING", "IMPROVING"] as const;
    for (const closes of shapes) {
      for (const q of quadrants) {
        const t = computeRotationTurn(dates(closes.length), closes, flatBench(closes.length), q);
        if (t.quadrantLagBars !== null) expect(t.quadrantLagBars).toBeGreaterThanOrEqual(0);
        // The two fields must never both claim to describe the same thing.
        if (t.quadrantAlreadyAligned) expect(t.quadrantLagBars).toBeNull();
      }
    }
  });

  it("reports TURN_FORMING while the RS line is still under its fast SMA", () => {
    // Decline, then two rising sessions that close the gap to the 20d without reaching it.
    // This is the SMH 2026-09-16 shape and the only state that fires before a reclaim.
    const closes: number[] = [];
    for (let i = 0; i < 150; i++) closes.push(200 - i);   // long decline to 51
    closes.push(52.2);                                    // up, gap narrows
    closes.push(53.8);                                    // up again, gap narrows again
    const d = dates(closes.length);
    const t = computeRotationTurn(d, closes, flatBench(closes.length), "WEAKENING");

    expect(t.stage).toBe("TURN_FORMING");
    expect(t.direction).toBe("UP");
    expect(t.formingDate).not.toBeNull();
    expect(t.barsSinceForming).not.toBeNull();
    // No reclaim has printed, so there is no turn and no lag. A consumer must not be able
    // to read a forming setup as a completed one.
    expect(t.turnDate).toBeNull();
    expect(t.confirmedDate).toBeNull();
    expect(t.quadrantLagBars).toBeNull();
    // Still below the fast SMA, so the distance is negative here (unlike completed turns,
    // where it is sign-flipped by direction).
    expect(t.distanceFromFastPct).toBeLessThan(0);
    expect(rotationTurnReason(t)).toContain("watchlist only");
    expect(rotationTurnBadge(t).tone).toBe("forming");
  });

  it("does not report TURN_FORMING when the RS line rises but the gap widens", () => {
    // Rising, but slower than its own falling SMA is catching up — the gap does not close.
    // Rising alone must not qualify, or the stage fires through every downtrend.
    const closes: number[] = [];
    for (let i = 0; i < 150; i++) closes.push(400 - i * 2);  // steep decline
    closes.push(100.05);
    closes.push(100.1);
    const t = computeRotationTurn(dates(closes.length), closes, flatBench(closes.length), "WEAKENING");
    expect(t.stage).not.toBe("TURN_FORMING");
  });

  it("drops the forming date once a reclaim prints", () => {
    // Forming, then the reclaim. turnDate takes over and formingDate is cleared so there
    // is exactly one date to read.
    const closes: number[] = [];
    for (let i = 0; i < 150; i++) closes.push(200 - i);
    for (let i = 0; i < 12; i++) closes.push(51 + (i + 1) * 5);
    const t = computeRotationTurn(dates(closes.length), closes, flatBench(closes.length), "WEAKENING");
    expect(t.stage === "TURN_DETECTED" || t.stage === "TURN_CONFIRMED").toBe(true);
    expect(t.turnDate).not.toBeNull();
    expect(t.formingDate).toBeNull();
    expect(t.barsSinceForming).toBeNull();
  });

  it("orders the stages so consumers can compare progress", () => {
    expect(TURN_STAGE_ORDER.NONE).toBeLessThan(TURN_STAGE_ORDER.TURN_FORMING);
    expect(TURN_STAGE_ORDER.TURN_FORMING).toBeLessThan(TURN_STAGE_ORDER.TURN_DETECTED);
    expect(TURN_STAGE_ORDER.TURN_DETECTED).toBeLessThan(TURN_STAGE_ORDER.TURN_CONFIRMED);
    expect(TURN_STAGE_ORDER.TURN_CONFIRMED).toBeLessThan(TURN_STAGE_ORDER.QUADRANT_CONFIRMED);
  });

  it("renders an already-aligned quadrant without implying the label kept up", () => {
    // Display branch exercised directly — see the real-data board, where IGV, ARKK, KRE,
    // IYT, IWM and EEM all land here.
    const aligned: RotationTurn = {
      stage: "QUADRANT_CONFIRMED",
      direction: "UP",
      rsLowDate: "2026-09-14",
      legLowDate: "2026-07-29",
      formingDate: null,
      barsSinceForming: null,
      turnDate: "2026-09-17",
      confirmedDate: "2026-09-18",
      quadrantDate: "2026-07-27",
      barsSinceTurn: 2,
      quadrantLagBars: null,
      quadrantAlreadyAligned: true,
      heldSessions: 3,
      priorFailedAttempts: 4,
      stale: false,
      distanceFromFastPct: 5.3,
    };
    expect(rotationTurnReason(aligned)).toContain("already aligned since 2026-07-27");
    expect(rotationTurnReason(aligned)).not.toContain("later");
    expect(rotationTurnBadge(aligned).label).toContain("quadrant aligned");
    expect(rotationTurnBadge(aligned).label).not.toContain("+0");
  });

  it("reports quadrantLagBars as null while the quadrant disagrees", () => {
    // Fresh upside reclaim, but the caller's quadrant still says WEAKENING — exactly the
    // SMH-on-09-17 state. The lag is unknown, not zero.
    const n = 160;
    const closes: number[] = [];
    for (let i = 0; i < 155; i++) closes.push(200 - i);
    for (let i = 0; i < 5; i++) closes.push(45 + (i + 1) * 8);
    const t = computeRotationTurn(dates(n), closes, flatBench(n), "WEAKENING");
    expect(t.direction).toBe("UP");
    expect(t.quadrantDate).toBeNull();
    expect(t.quadrantLagBars).toBeNull();
    expect(t.quadrantAlreadyAligned).toBe(false);
    expect(rotationTurnReason(t)).toContain("quadrant has not caught up");
  });

  it("never reports a bull turn while the RS line is under its fast SMA", () => {
    const n = 160;
    const closes: number[] = [];
    for (let i = 0; i < n; i++) closes.push(200 - i); // monotonic decline, no reclaim
    const t = computeRotationTurn(dates(n), closes, flatBench(n), "LAGGING");
    expect(t.direction).toBe("DOWN");
  });

  it("tolerates a zero benchmark close without producing NaN dates", () => {
    const n = 160;
    const closes = new Array(n).fill(100).map((v, i) => v + Math.sin(i / 5) * 10);
    const bench = flatBench(n);
    bench[80] = 0; // data error
    const t = computeRotationTurn(dates(n), closes, bench, "IMPROVING");
    expect(Number.isFinite(t.distanceFromFastPct)).toBe(true);
    if (t.turnDate) expect(t.turnDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("badge and reason stay renderable for a NONE turn", () => {
    const n = 10;
    const t = computeRotationTurn(dates(n), new Array(n).fill(100), flatBench(n), "LAGGING");
    expect(rotationTurnBadge(t)).toEqual({ label: "—", tone: "none" });
    expect(rotationTurnReason(t)).toBe("No relative-strength turn in progress");
  });
});

/**
 * The case that motivated the module, replayed from the real SMH/SPY closes of
 * 2026-09-08..2026-09-21 preceded by enough synthetic history to fill the SMAs.
 *
 * Asserting the exact dates is the regression guard: the RS line bottomed 09-14 and
 * reclaimed the 20d SMA on 09-17, while the RRG quadrant did not print LEADING until
 * 09-21. If a future change to the SMA periods or hold rule moves `turnDate` onto 09-21,
 * the module has stopped doing the one thing it exists for.
 */
describe("computeRotationTurn — SMH September 2026", () => {
  const SMH = [569.41, 572.93, 584.83, 589.12, 587.82, 594.07, 569.77, 560.92, 562.65, 560.42, 546.80, 555.82, 555.77, 573.00, 553.11, 556.63, 545.22, 550.48, 552.60, 567.01, 573.73, 574.29, 560.28, 568.53, 541.50, 542.11, 545.56, 560.61, 573.00, 596.03];
  const SPY = [773.03, 770.56, 772.49, 777.88, 776.34, 772.67, 767.45, 769.06, 762.60, 765.72, 763.47, 765.91, 766.08, 771.10, 769.35, 767.05, 761.78, 765.16, 773.17, 770.19, 765.96, 762.40, 757.83, 764.29, 760.88, 757.39, 754.05, 762.60, 761.69, 773.50];
  const REAL_DATES = ["2026-08-10","2026-08-11","2026-08-12","2026-08-13","2026-08-14","2026-08-17","2026-08-18","2026-08-19","2026-08-20","2026-08-21","2026-08-24","2026-08-25","2026-08-26","2026-08-27","2026-08-28","2026-08-31","2026-09-01","2026-09-02","2026-09-03","2026-09-04","2026-09-08","2026-09-09","2026-09-10","2026-09-11","2026-09-14","2026-09-15","2026-09-16","2026-09-17","2026-09-18","2026-09-21"];

  it("dates the turn at 09-17, the RS low at 09-14, and not at the 09-21 quadrant flip", () => {
    // Pad with a flat-RS prologue so the 20d and 50d SMAs are defined across the real
    // window without inventing a trend that would shift the reclaim.
    const pad = ROTATION_TURN.SLOW_SMA + ROTATION_TURN.LOOKBACK_BARS;
    const padDates = dates(pad);
    const etf = [...new Array(pad).fill(SMH[0]), ...SMH];
    const bench = [...new Array(pad).fill(SPY[0]), ...SPY];
    const allDates = [...padDates, ...REAL_DATES];

    const t = computeRotationTurn(allDates, etf, bench, "LEADING");

    expect(t.direction).toBe("UP");
    expect(t.turnDate).toBe("2026-09-17");
    // The low the reclaim came off, which is the date the rotation is remembered by.
    expect(t.rsLowDate).toBe("2026-09-14");
    expect(t.barsSinceTurn).toBe(2);
    // The label the user was shown; the turn beat it by two sessions on this padding.
    expect(t.turnDate! < "2026-09-21").toBe(true);
  });
});
