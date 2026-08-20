import { describe, it, expect } from "vitest";
import { enrichStocks, type StockInput } from "./stock-enrichment";
import { buildEnrichedMap } from "./confluence";
import { SECTOR_UNIVERSE, getSectorForSymbol } from "@/data/sector-universe";

/**
 * A symbol listed in N baskets produces N enrichment rows, one per basket, each
 * carrying that basket's quadrant/composite/acceleration/stealth. That is
 * deliberate. What is not deliberate is a symbol-keyed consumer picking one of
 * them by accident: `enrichStocks` sorts HIGH → MEDIUM → WATCH before returning,
 * so an unfiltered `map.set()` loop keeps the *weakest* read of that symbol.
 */

function input(over: Partial<StockInput> & Pick<StockInput, "symbol" | "sector" | "sectorEtf">): StockInput {
  return {
    shortName: over.symbol,
    price: 250,
    sma50: 200,
    sma200: 180,
    volume: 20_000_000,
    avgVolume10d: 15_000_000,
    marketCap: 600_000_000_000,
    institutionalPct: 45,
    ret20d: 12,
    etfRet20d: 4,
    sectorQuadrant: "LEADING",
    sectorComposite: 80,
    sectorAcceleration: 5,
    sectorStealth: false,
    isCanonicalSector: true,
    ...over,
  };
}

describe("multi-basket enrichment rows", () => {
  it("still emits one row per basket", () => {
    const { passed } = enrichStocks([
      input({ symbol: "ORCL", sector: "Software & Cloud", sectorEtf: "IGV" }),
      input({ symbol: "ORCL", sector: "Technology", sectorEtf: "XLK", isCanonicalSector: false }),
      input({ symbol: "ORCL", sector: "AI & Robotics", sectorEtf: "AIQ", isCanonicalSector: false }),
    ]);
    expect(passed.filter((s) => s.symbol === "ORCL")).toHaveLength(3);
    expect(passed.filter((s) => s.isCanonicalSector)).toHaveLength(1);
  });

  it("resolves a symbol-keyed lookup to the canonical row, not the last-sorted one", () => {
    // enrichStocks returns HIGH → MEDIUM → WATCH, so the row a `map.set()` loop
    // keeps is the weakest. Make the canonical basket the *strongest* read here:
    // it sorts first, and an unfiltered collapse would discard it for a weaker one.
    const { passed } = enrichStocks([
      input({ symbol: "ORCL", sector: "Software & Cloud", sectorEtf: "IGV" }),
      input({
        symbol: "ORCL", sector: "Technology", sectorEtf: "XLK", isCanonicalSector: false,
        sectorQuadrant: "LAGGING", sectorComposite: 30, sectorAcceleration: -6, etfRet20d: 40,
      }),
      input({
        symbol: "ORCL", sector: "AI & Robotics", sectorEtf: "AIQ", isCanonicalSector: false,
        sectorQuadrant: "WEAKENING", sectorComposite: 25, sectorAcceleration: -8, etfRet20d: 40,
      }),
    ]);

    const canonical = passed.find((s) => s.isCanonicalSector)!;
    expect(canonical.sector).toBe("Software & Cloud");
    // Precondition: the reads genuinely differ, or this test proves nothing.
    const convictions = new Set(passed.map((s) => s.conviction));
    expect(convictions.size).toBeGreaterThan(1);
    expect(passed[passed.length - 1].isCanonicalSector).toBe(false);

    const map = buildEnrichedMap({ passed });
    expect(map.get("ORCL")).toEqual({ conviction: canonical.conviction, category: canonical.category });
  });

  it("treats a row with no flag as canonical (crypto, pre-flag snapshots)", () => {
    const map = buildEnrichedMap({
      passed: [{ symbol: "BTC-USD", conviction: "HIGH", category: "LEADER" }],
    });
    expect(map.get("BTC-USD")?.conviction).toBe("HIGH");
  });

  it("marks exactly one basket canonical for every multi-listed symbol", () => {
    // Guards the producer's predicate in sector-rotation.ts against a basket
    // displayName drifting out of sync with PRIMARY_SECTOR.
    const listings = new Map<string, string[]>();
    for (const sector of SECTOR_UNIVERSE) {
      for (const stock of sector.stocks) {
        listings.set(stock.symbol, [...(listings.get(stock.symbol) ?? []), sector.displayName]);
      }
    }
    const orphans = [...listings]
      .map(([symbol, names]) => ({
        symbol,
        canonicalHits: names.filter((n) => n === getSectorForSymbol(symbol)).length,
      }))
      .filter((r) => r.canonicalHits !== 1);
    expect(orphans).toEqual([]);
  });
});
