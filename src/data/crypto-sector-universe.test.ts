import { describe, it, expect } from "vitest";
import {
  CRYPTO_UNIVERSE,
  CRYPTO_PRIMARY_SECTOR,
  findUnpinnedContestedCrypto,
  getCryptoSectorForSymbol,
  getCryptoSectorProxyForSymbol,
} from "./crypto-sector-universe";

describe("canonical crypto basket assignment", () => {
  it("pins every token that appears in more than one basket", () => {
    // An unpinned overlap resolves by declaration order, so reordering the file
    // silently rescores the token against a different basket. Pin it instead.
    expect(findUnpinnedContestedCrypto()).toEqual([]);
  });

  it("only pins tokens to a basket that actually lists them", () => {
    const listedIn = new Map<string, Set<string>>();
    for (const sector of CRYPTO_UNIVERSE) {
      for (const stock of sector.stocks) {
        const set = listedIn.get(stock.symbol) ?? new Set<string>();
        set.add(sector.id);
        listedIn.set(stock.symbol, set);
      }
    }
    const broken = Object.entries(CRYPTO_PRIMARY_SECTOR).filter(
      ([symbol, sectorId]) => !listedIn.get(symbol)?.has(sectorId),
    );
    expect(broken).toEqual([]);
  });

  it("pins each basket's proxy token to that basket", () => {
    // The proxy is the basket's benchmark. Scoring it under a different basket
    // means the basket is measured against a token it does not own.
    const misfiled = CRYPTO_UNIVERSE.filter(
      (s) => s.stocks.some((st) => st.symbol === s.etf) && getCryptoSectorForSymbol(s.etf) !== s.displayName,
    ).map((s) => ({ basket: s.id, proxy: s.etf, resolvesTo: getCryptoSectorForSymbol(s.etf) }));
    expect(misfiled).toEqual([]);
  });

  it("resolves every listed token to exactly one basket", () => {
    const listings = new Map<string, string[]>();
    for (const sector of CRYPTO_UNIVERSE) {
      for (const stock of sector.stocks) {
        listings.set(stock.symbol, [...(listings.get(stock.symbol) ?? []), sector.displayName]);
      }
    }
    const orphans = [...listings]
      .map(([symbol, names]) => ({
        symbol,
        canonicalHits: names.filter((n) => n === getCryptoSectorForSymbol(symbol)).length,
      }))
      .filter((r) => r.canonicalHits !== 1);
    expect(orphans).toEqual([]);
  });

  it("returns the canonical basket's proxy, not a contested basket's", () => {
    // LINK is listed in rwa but is infra's proxy; before the pin table it
    // resolved to rwa on declaration order and reported ONDO as its proxy.
    expect(getCryptoSectorForSymbol("LINK-USD")).toBe("Infrastructure");
    expect(getCryptoSectorProxyForSymbol("LINK-USD")).toBe("LINK-USD");
    expect(getCryptoSectorForSymbol("IMX-USD")).toBe("Gaming & Metaverse");
  });

  it("leaves uncontested tokens unpinned", () => {
    const counts = new Map<string, number>();
    for (const sector of CRYPTO_UNIVERSE)
      for (const stock of sector.stocks) counts.set(stock.symbol, (counts.get(stock.symbol) ?? 0) + 1);
    const overPinned = Object.keys(CRYPTO_PRIMARY_SECTOR).filter((s) => (counts.get(s) ?? 0) < 2);
    expect(overPinned).toEqual([]);
  });
});
