import { describe, it, expect } from "vitest";
import {
  SECTOR_UNIVERSE,
  PRIMARY_SECTOR,
  findUnpinnedContested,
  getSectorForSymbol,
  getSectorETFForSymbol,
} from "./sector-universe";

describe("canonical sector assignment", () => {
  it("pins every symbol that appears in more than one basket", () => {
    // A symbol in 2+ baskets with no pin resolves by declaration order, which
    // means reordering the file silently reassigns it. Pin it instead.
    expect(findUnpinnedContested()).toEqual([]);
  });

  it("only pins symbols to a basket that actually lists them", () => {
    const listedIn = new Map<string, Set<string>>();
    for (const sector of SECTOR_UNIVERSE) {
      for (const stock of sector.stocks) {
        const set = listedIn.get(stock.symbol) ?? new Set<string>();
        set.add(sector.id);
        listedIn.set(stock.symbol, set);
      }
    }
    const orphanPins = Object.entries(PRIMARY_SECTOR).filter(
      ([symbol, sectorId]) => !listedIn.get(symbol)?.has(sectorId)
    );
    expect(orphanPins).toEqual([]);
  });

  it("pins only to sector ids that exist", () => {
    const ids = new Set(SECTOR_UNIVERSE.map((s) => s.id));
    const unknown = Object.entries(PRIMARY_SECTOR).filter(([, id]) => !ids.has(id));
    expect(unknown).toEqual([]);
  });

  it("resolves every pinned symbol to its pinned sector", () => {
    const byId = new Map(SECTOR_UNIVERSE.map((s) => [s.id, s]));
    for (const [symbol, sectorId] of Object.entries(PRIMARY_SECTOR)) {
      expect(getSectorForSymbol(symbol)).toBe(byId.get(sectorId)!.displayName);
    }
  });

  it("keeps mega-caps in the sector they are actually in", () => {
    // Regression guards for assignments that were previously decided by file
    // order — AAPL in particular resolved to Software & Cloud.
    expect(getSectorETFForSymbol("AAPL")).toBe("XLK");
    expect(getSectorETFForSymbol("NVDA")).toBe("SMH");
    expect(getSectorETFForSymbol("AMZN")).toBe("XLY");
    expect(getSectorETFForSymbol("MSFT")).toBe("IGV");
    expect(getSectorETFForSymbol("GOOGL")).toBe("XLC");
  });
});

describe("breadth viability", () => {
  it("flags stock-bearing baskets that cannot reach the breadth minimum", () => {
    // Below BREADTH_MIN_CONSTITUENTS (5) a basket reports breadthPct: null and
    // the composite reweights. That is intended, but it should be a known list
    // rather than a surprise — update this when membership changes.
    const thin = SECTOR_UNIVERSE.filter(
      (s) => s.stocks.length > 0 && s.stocks.length < 5
    ).map((s) => s.etf);
    expect(thin).toEqual(["UFO"]);
  });
});
