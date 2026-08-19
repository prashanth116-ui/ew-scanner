import { describe, it, expect } from "vitest";
import { formatHuntReport } from "./format";
import type { HuntReport, HuntName } from "./hunt-report";

const name = (over: Partial<HuntName> = {}): HuntName => ({
  ticker: "TEST", isFocus: false, runner: 60, se: 40, demand: 30,
  score: 45, label: "SELLER_EXHAUSTION", catalyst: null, ...over,
});

const report = (over: Partial<HuntReport> = {}): HuntReport => ({
  scanDate: "2026-08-19", coiled: [], ready: [], loaded: [], research: [], ...over,
});

describe("formatHuntReport", () => {
  it("orders the sections the way you act on them", () => {
    const out = formatHuntReport(report({
      coiled: [name({ ticker: "AAA" })],
      ready: [name({ ticker: "BBB", alertState: "READY" })],
      loaded: [name({ ticker: "CCC" })],
    }), "Wed, Aug 19");
    expect(out.indexOf("COILED")).toBeLessThan(out.indexOf("READY"));
    expect(out.indexOf("READY")).toBeLessThan(out.indexOf("LOADED"));
  });

  it("says plainly that LOADED is not an entry signal", () => {
    // The single most misreadable section — low demand is its defining feature.
    const out = formatHuntReport(report({ loaded: [name()] }), "d");
    expect(out).toContain("NOT an entry");
  });

  it("stars focus names", () => {
    const out = formatHuntReport(report({ coiled: [name({ ticker: "MDB", isFocus: true })] }), "d");
    expect(out).toContain("★<b>MDB</b>");
  });

  it("shows a catalyst countdown, and TODAY at zero", () => {
    const cat = (daysUntil: number) => ({
      ticker: "X", event_date: "2026-08-19", event_type: "Earnings", daysUntil,
    });
    expect(formatHuntReport(report({ coiled: [name({ catalyst: cat(3) })] }), "d")).toContain("⚡3d");
    expect(formatHuntReport(report({ coiled: [name({ catalyst: cat(0) })] }), "d")).toContain("⚡TODAY");
  });

  it("marks a loaded name with no known catalyst as the thing to research", () => {
    const out = formatHuntReport(report({ loaded: [name()] }), "d");
    expect(out).toContain("no known catalyst");
  });

  it("caps each section and says how many were withheld", () => {
    const many = Array.from({ length: 30 }, (_, i) => name({ ticker: `T${i}` }));
    const out = formatHuntReport(report({ coiled: many }), "d");
    expect(out).toContain("COILED (30)");
    expect(out).toContain("+18 more");
  });

  it("treats an empty night as a valid answer rather than a failure", () => {
    // An empty screen should not read as a broken scanner, or the temptation is to
    // force a trade to justify having looked.
    const out = formatHuntReport(report(), "d");
    expect(out).toContain("valid answer");
  });

  it("omits sections that have nothing in them", () => {
    const out = formatHuntReport(report({ coiled: [name()] }), "d");
    expect(out).not.toContain("READY / TRIGGERED");
    expect(out).not.toContain("HOMEWORK");
  });

  it("lists homework separately from the loaded section", () => {
    const n = name({ ticker: "MRNA", isFocus: true });
    const out = formatHuntReport(report({ loaded: [n], research: [n] }), "d");
    expect(out).toContain("HOMEWORK");
    expect(out).toContain("go find one");
  });

  it("drops numbers that were not measured rather than printing zero", () => {
    // A missing runner score is unknown, not a runner score of nothing.
    const out = formatHuntReport(report({ coiled: [name({ runner: null, demand: null })] }), "d");
    expect(out).toContain("se40");
    expect(out).not.toContain("R0");
    expect(out).not.toContain("d0");
  });
});
