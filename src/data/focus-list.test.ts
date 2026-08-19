import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { FOCUS_LIST, isFocusTicker } from "./focus-list";
import { buildScanUniverse } from "./index-tiers";

describe("membership", () => {
  it("recognises a listed ticker", () => {
    expect(isFocusTicker([...FOCUS_LIST][0])).toBe(true);
  });

  it("rejects an unlisted ticker", () => {
    expect(isFocusTicker("NOT_A_REAL_TICKER")).toBe(false);
  });

  it("is a shortlist, not a second universe", () => {
    // A soft ceiling, raised from 120 to 150 on 2026-08-18 when the list grew past it.
    // The number is not sacred; the point is that it should require a decision to pass,
    // not drift. At ~130 of a ~480-name universe this is closer to a tradeable universe
    // than a shortlist — which is defensible, since only names SCORING tonight reach the
    // FOCUS section. If that section routinely runs past ~20 names, the list is too big
    // and the answer is to cut, not to raise this again.
    expect(FOCUS_LIST.size).toBeGreaterThan(20);
    expect(FOCUS_LIST.size).toBeLessThan(150);
  });
});

describe("reachability", () => {
  it("only lists tickers the crons actually scan", () => {
    // A focus name outside the scan universe can never produce a hit, so it would sit in
    // the list looking active while being structurally invisible. This is the failure
    // mode to guard: adding a ticker here does NOT add it to the universe.
    const universe = new Set(buildScanUniverse());
    const unreachable = [...FOCUS_LIST].filter((t) => !universe.has(t));
    expect(unreachable).toEqual([]);
  });
});

describe("hygiene", () => {
  const source = fs.readFileSync(
    new URL("./focus-list.ts", import.meta.url),
    "utf8",
  );
  const listed = [...source.matchAll(/^ {2}"([A-Z.\-]+)",/gm)].map((m) => m[1]);

  it("has no duplicate entries", () => {
    // A Set swallows duplicates silently, so the check has to read the source text.
    const seen = new Set<string>();
    const dupes = listed.filter((t) => (seen.has(t) ? true : (seen.add(t), false)));
    expect(dupes).toEqual([]);
  });

  it("parses every listed ticker into the exported set", () => {
    // Catches a typo'd entry that lands outside the array, or a stale regex here.
    expect(listed.length).toBe(FOCUS_LIST.size);
  });

  it("uses the dotted share-class form the rest of the codebase uses", () => {
    // toYahooSymbol() rewrites dotted to dashed on the way out; a dashed symbol stored
    // internally fails silently with an undefined price rather than an error.
    expect([...FOCUS_LIST].filter((t) => t.includes("-"))).toEqual([]);
  });
});
