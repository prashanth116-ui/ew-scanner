import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only (no-op in tests)
vi.mock("server-only", () => ({}));

// Mock the storage module
vi.mock("./storage", () => ({
  loadDiscoveredTickers: vi.fn(),
}));

// Mock the promotion module
vi.mock("./promotion", () => ({
  loadPromotedTickers: vi.fn(),
}));

import { mergeWithDiscovered, isDiscoveredTicker } from "./merge";
import { loadDiscoveredTickers } from "./storage";
import { loadPromotedTickers } from "./promotion";
import type { DiscoveredTicker } from "./types";
import type { PromotedTicker } from "./promotion";

const mockLoad = vi.mocked(loadDiscoveredTickers);
const mockLoadPromoted = vi.mocked(loadPromotedTickers);

function makeTicker(overrides: Partial<DiscoveredTicker> = {}): DiscoveredTicker {
  return {
    symbol: "PENG-USD",
    name: "Pudgy Penguins",
    asset_class: "crypto",
    source: "coingecko_trending",
    price_change_pct: 45.2,
    volume: 500_000_000,
    market_cap: 1_000_000_000,
    price_at_discovery: 0.032,
    ...overrides,
  };
}

function makePromoted(overrides: Partial<PromotedTicker> = {}): PromotedTicker {
  return {
    id: "uuid-1",
    symbol: "PROMO",
    name: "Promo Corp",
    asset_class: "stock",
    sector: "Technology",
    promoted_at: "2026-01-01T00:00:00Z",
    last_qualified_at: "2026-06-01T00:00:00Z",
    best_score: 18,
    best_verdict: "KEEP",
    source: "discovery",
    expires_at: "2026-12-01T00:00:00Z",
    ...overrides,
  };
}

describe("mergeWithDiscovered", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPromoted.mockResolvedValue([]);
  });

  it("adds discovered tickers to static list", async () => {
    mockLoad.mockResolvedValue([
      makeTicker({ symbol: "PENG-USD" }),
      makeTicker({ symbol: "BRETT-USD", price_change_pct: 30 }),
    ]);

    const result = await mergeWithDiscovered(["BTC-USD", "ETH-USD"], "crypto");

    expect(result.symbols).toEqual(["BTC-USD", "ETH-USD", "PENG-USD", "BRETT-USD"]);
    expect(result.discoveredCount).toBe(2);
    expect(result.discoveredSymbols.has("PENG-USD")).toBe(true);
    expect(result.discoveredSymbols.has("BRETT-USD")).toBe(true);
  });

  it("deduplicates case-insensitively against static list", async () => {
    mockLoad.mockResolvedValue([
      makeTicker({ symbol: "BTC-USD" }), // Already in static
      makeTicker({ symbol: "PENG-USD" }),
    ]);

    const result = await mergeWithDiscovered(["btc-usd", "ETH-USD"], "crypto");

    expect(result.symbols).toEqual(["btc-usd", "ETH-USD", "PENG-USD"]);
    expect(result.discoveredCount).toBe(1);
  });

  it("respects maxDiscovered cap", async () => {
    mockLoad.mockResolvedValue([
      makeTicker({ symbol: "A-USD", price_change_pct: 10 }),
      makeTicker({ symbol: "B-USD", price_change_pct: 20 }),
      makeTicker({ symbol: "C-USD", price_change_pct: 30 }),
    ]);

    const result = await mergeWithDiscovered([], "crypto", { maxDiscovered: 2 });

    expect(result.symbols).toHaveLength(2);
    expect(result.discoveredCount).toBe(2);
    // Sorted by absolute price change descending
    expect(result.symbols[0]).toBe("C-USD");
    expect(result.symbols[1]).toBe("B-USD");
  });

  it("filters by minPriceChangePct", async () => {
    mockLoad.mockResolvedValue([
      makeTicker({ symbol: "SMALL-USD", price_change_pct: 5 }),
      makeTicker({ symbol: "BIG-USD", price_change_pct: 25 }),
      makeTicker({ symbol: "NEG-USD", price_change_pct: -30 }),
    ]);

    const result = await mergeWithDiscovered([], "crypto", { minPriceChangePct: 10 });

    expect(result.symbols).toEqual(["NEG-USD", "BIG-USD"]);
    expect(result.discoveredCount).toBe(2);
  });

  it("returns static list unchanged on Supabase error", async () => {
    mockLoad.mockRejectedValue(new Error("Supabase down"));

    const staticList = ["BTC-USD", "ETH-USD"];
    const result = await mergeWithDiscovered(staticList, "crypto");

    expect(result.symbols).toEqual(staticList);
    expect(result.discoveredCount).toBe(0);
    expect(result.discoveredSymbols.size).toBe(0);
    expect(result.promotedCount).toBe(0);
    expect(result.promotedSymbols.size).toBe(0);
  });

  it("handles empty discovered list", async () => {
    mockLoad.mockResolvedValue([]);

    const result = await mergeWithDiscovered(["BTC-USD"], "crypto");

    expect(result.symbols).toEqual(["BTC-USD"]);
    expect(result.discoveredCount).toBe(0);
  });

  it("handles null price_change_pct gracefully", async () => {
    mockLoad.mockResolvedValue([
      makeTicker({ symbol: "NULL-USD", price_change_pct: null }),
      makeTicker({ symbol: "OK-USD", price_change_pct: 50 }),
    ]);

    const result = await mergeWithDiscovered([], "crypto");

    expect(result.symbols).toContain("NULL-USD");
    expect(result.symbols).toContain("OK-USD");
    expect(result.discoveredCount).toBe(2);
  });

  // ── Promoted ticker tests ──

  it("includes promoted tickers in merge result", async () => {
    mockLoad.mockResolvedValue([]);
    mockLoadPromoted.mockResolvedValue([
      makePromoted({ symbol: "PROMO1" }),
      makePromoted({ symbol: "PROMO2", best_score: 22 }),
    ]);

    const result = await mergeWithDiscovered(["AAPL", "MSFT"], "stock");

    expect(result.symbols).toEqual(["AAPL", "MSFT", "PROMO1", "PROMO2"]);
    expect(result.promotedCount).toBe(2);
    expect(result.promotedSymbols.has("PROMO1")).toBe(true);
    expect(result.promotedSymbols.has("PROMO2")).toBe(true);
    expect(result.discoveredCount).toBe(0);
  });

  it("deduplicates promoted tickers against static universe", async () => {
    mockLoad.mockResolvedValue([]);
    mockLoadPromoted.mockResolvedValue([
      makePromoted({ symbol: "AAPL" }), // Already in static
      makePromoted({ symbol: "NEWCO" }),
    ]);

    const result = await mergeWithDiscovered(["AAPL", "MSFT"], "stock");

    expect(result.symbols).toEqual(["AAPL", "MSFT", "NEWCO"]);
    expect(result.promotedCount).toBe(1);
    expect(result.promotedSymbols.has("NEWCO")).toBe(true);
    expect(result.promotedSymbols.has("AAPL")).toBe(false);
  });

  it("promoted tickers are not counted against maxDiscovered cap", async () => {
    mockLoad.mockResolvedValue([
      makeTicker({ symbol: "DISC1", asset_class: "stock", price_change_pct: 50 }),
      makeTicker({ symbol: "DISC2", asset_class: "stock", price_change_pct: 40 }),
      makeTicker({ symbol: "DISC3", asset_class: "stock", price_change_pct: 30 }),
    ]);
    mockLoadPromoted.mockResolvedValue([
      makePromoted({ symbol: "PROMO1" }),
      makePromoted({ symbol: "PROMO2" }),
    ]);

    const result = await mergeWithDiscovered([], "stock", { maxDiscovered: 2 });

    // 2 promoted (uncapped) + 2 discovered (capped at maxDiscovered=2)
    expect(result.promotedCount).toBe(2);
    expect(result.discoveredCount).toBe(2);
    expect(result.symbols).toHaveLength(4);
    expect(result.symbols).toContain("PROMO1");
    expect(result.symbols).toContain("PROMO2");
  });

  it("deduplicates discovered against promoted (promoted wins)", async () => {
    mockLoad.mockResolvedValue([
      makeTicker({ symbol: "OVERLAP", asset_class: "stock", price_change_pct: 60 }),
      makeTicker({ symbol: "UNIQUE", asset_class: "stock", price_change_pct: 40 }),
    ]);
    mockLoadPromoted.mockResolvedValue([
      makePromoted({ symbol: "OVERLAP" }),
    ]);

    const result = await mergeWithDiscovered([], "stock");

    // OVERLAP comes from promoted, not discovered
    expect(result.promotedSymbols.has("OVERLAP")).toBe(true);
    expect(result.discoveredSymbols.has("OVERLAP")).toBe(false);
    expect(result.discoveredSymbols.has("UNIQUE")).toBe(true);
    expect(result.symbols).toEqual(["OVERLAP", "UNIQUE"]);
  });

  it("includes promotedSymbols and promotedCount in result", async () => {
    mockLoad.mockResolvedValue([]);
    mockLoadPromoted.mockResolvedValue([makePromoted({ symbol: "ABC" })]);

    const result = await mergeWithDiscovered(["XYZ"], "stock");

    expect(result).toHaveProperty("promotedSymbols");
    expect(result).toHaveProperty("promotedCount");
    expect(result.promotedSymbols).toBeInstanceOf(Set);
    expect(result.promotedCount).toBe(1);
  });

  it("returns empty promoted fields on error", async () => {
    mockLoad.mockRejectedValue(new Error("fail"));

    const result = await mergeWithDiscovered(["BTC-USD"], "crypto");

    expect(result.promotedSymbols.size).toBe(0);
    expect(result.promotedCount).toBe(0);
  });
});

describe("isDiscoveredTicker", () => {
  it("returns true for discovered symbols", () => {
    const set = new Set(["PENG-USD", "BRETT-USD"]);
    expect(isDiscoveredTicker("PENG-USD", set)).toBe(true);
  });

  it("returns false for non-discovered symbols", () => {
    const set = new Set(["PENG-USD"]);
    expect(isDiscoveredTicker("BTC-USD", set)).toBe(false);
  });
});
