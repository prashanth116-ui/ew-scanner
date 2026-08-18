import { describe, it, expect } from "vitest";
import { skipAsNonScorer, PROBATION_CYCLE } from "./scan-gate";
import { passesUniverseQualityGates } from "./scoring";
import { ADDITIONAL_MEMBERS, isIndexMember } from "@/data/index-tiers";
import type { PreRunStockData } from "./types";

/**
 * Two infrastructure gates that silently removed real candidates. Both were found by
 * re-scoring MU and SNDK over a two-week window and asking why neither had ever been
 * persisted, when the engines rated both READY.
 */

function stock(over: Partial<PreRunStockData> = {}): PreRunStockData {
  return {
    currentPrice: 500,
    marketCap: 200_000_000_000,
    vcpAvgDollarVolume: 45_000_000_000,
    dataQuality: 90,
    maxAtrPct60d: 8,
    ...over,
  } as unknown as PreRunStockData;
}

describe("skipAsNonScorer", () => {
  const seen = new Set(["AAPL"]);

  it("skips a no-history ticker on most days, but not forever", () => {
    // The lockout must be temporary. A permanent skip is self-sealing: no scan -> no score
    // -> no history -> no scan. MU sat locked out that way even after the bug that emptied
    // its history was fixed.
    const days = Array.from({ length: PROBATION_CYCLE * 2 }, (_, i) =>
      new Date(Date.UTC(2026, 7, 1 + i)));
    const scanned = days.filter((d) => !skipAsNonScorer("ZZZZ", true, seen, d));
    expect(scanned.length).toBeGreaterThan(0);
    expect(scanned.length).toBeLessThan(days.length);
  });

  it("re-tests every no-history ticker within one cycle", () => {
    const days = Array.from({ length: PROBATION_CYCLE }, (_, i) =>
      new Date(Date.UTC(2026, 7, 10 + i)));
    for (const t of ["MU", "ZZZZ", "AAAA", "QQQQ", "WXYZ"]) {
      const scanned = days.some((d) => !skipAsNonScorer(t, true, seen, d));
      expect(scanned, `${t} never scanned within a full cycle`).toBe(true);
    }
  });

  it("scans every day once a ticker has scored even once", () => {
    const withHistory = new Set(["AAPL", "MU"]);
    const days = Array.from({ length: PROBATION_CYCLE * 2 }, (_, i) =>
      new Date(Date.UTC(2026, 7, 1 + i)));
    expect(days.every((d) => !skipAsNonScorer("MU", true, withHistory, d))).toBe(true);
  });

  it("does not skip a ticker that has scored", () => {
    expect(skipAsNonScorer("AAPL", true, seen)).toBe(false);
  });

  it("never skips a hand-curated ADDITIONAL_MEMBER on any day", () => {
    // The circular lockout: no history -> never scanned -> never scores -> no history.
    // SNDK was added to the universe and could never enter under the old gate.
    const additional = [...ADDITIONAL_MEMBERS][0];
    expect(seen.has(additional)).toBe(false);
    const days = Array.from({ length: PROBATION_CYCLE * 2 }, (_, i) =>
      new Date(Date.UTC(2026, 7, 1 + i)));
    expect(days.every((d) => !skipAsNonScorer(additional, true, seen, d))).toBe(true);
    expect(days.every((d) => !skipAsNonScorer("SNDK", true, seen, d))).toBe(true);
  });

  it("is inert until the scored set is large enough to trust", () => {
    expect(skipAsNonScorer("ZZZZ", false, new Set())).toBe(false);
  });
});

describe("passesUniverseQualityGates — market cap", () => {
  it("passes an index member whose market cap is unknown", () => {
    // MU failed this on every day of a two-week window at $45B/day volume, because a null
    // mcap was coalesced to 0 and index membership was never consulted.
    expect(isIndexMember("MU")).toBe(true);
    expect(passesUniverseQualityGates(stock({ marketCap: null }), "MU")).toBe(true);
  });

  it("still rejects an index member that is genuinely small", () => {
    expect(passesUniverseQualityGates(stock({ marketCap: 2_000_000_000 }), "MU")).toBe(false);
  });

  it("rejects a non-member with an unknown market cap", () => {
    expect(passesUniverseQualityGates(stock({ marketCap: null }), "ZZZZ")).toBe(false);
  });

  it("keeps ADDITIONAL_MEMBERS exempt from the mcap gate entirely", () => {
    expect(passesUniverseQualityGates(stock({ marketCap: 500_000_000 }), "SNDK")).toBe(true);
  });

  it("still enforces the other gates", () => {
    expect(passesUniverseQualityGates(stock({ currentPrice: 5 }), "MU")).toBe(false);
    expect(passesUniverseQualityGates(stock({ vcpAvgDollarVolume: 1_000_000 }), "MU")).toBe(false);
    expect(passesUniverseQualityGates(stock({ maxAtrPct60d: 0.5 }), "MU")).toBe(false);
  });
});
