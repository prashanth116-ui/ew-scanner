import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only (no-op in tests)
vi.mock("server-only", () => ({}));

// Mock the storage module
vi.mock("./storage", () => ({
  loadDiscoveredTickers: vi.fn(),
}));

import { mergeWithDiscovered, isDiscoveredTicker } from "./merge";
import { loadDiscoveredTickers } from "./storage";
import type { DiscoveredTicker } from "./types";

const mockLoad = vi.mocked(loadDiscoveredTickers);

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

describe("mergeWithDiscovered", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
