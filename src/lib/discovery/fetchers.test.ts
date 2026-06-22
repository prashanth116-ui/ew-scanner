import { describe, it, expect, vi } from "vitest";

// Mock server-only (no-op in tests)
vi.mock("server-only", () => ({}));

// Mock fetchWithRetry to avoid real HTTP calls
vi.mock("@/lib/yahoo-utils", () => ({
  fetchWithRetry: vi.fn(),
}));

import { coingeckoIdToYahoo, fetchCoinGeckoTrending, fetchCoinGeckoTopVolume, fetchPolygonMovers } from "./fetchers";
import { fetchWithRetry } from "@/lib/yahoo-utils";

const mockFetch = vi.mocked(fetchWithRetry);

describe("coingeckoIdToYahoo", () => {
  it("maps known coins correctly", () => {
    expect(coingeckoIdToYahoo("bitcoin", "btc")).toBe("BTC-USD");
    expect(coingeckoIdToYahoo("ethereum", "eth")).toBe("ETH-USD");
    expect(coingeckoIdToYahoo("solana", "sol")).toBe("SOL-USD");
    expect(coingeckoIdToYahoo("dogecoin", "doge")).toBe("DOGE-USD");
    expect(coingeckoIdToYahoo("uniswap", "uni")).toBe("UNI7083-USD");
    expect(coingeckoIdToYahoo("pepe", "pepe")).toBe("PEPE24478-USD");
    expect(coingeckoIdToYahoo("polygon", "pol")).toBe("POL28321-USD");
    expect(coingeckoIdToYahoo("pengu", "peng")).toBe("PENG-USD");
  });

  it("falls back to SYMBOL-USD for unknown coins", () => {
    expect(coingeckoIdToYahoo("unknown-coin-xyz", "xyz")).toBe("XYZ-USD");
    expect(coingeckoIdToYahoo("new-meme", "meme")).toBe("MEME-USD");
  });

  it("uppercases fallback symbol", () => {
    expect(coingeckoIdToYahoo("something", "abc")).toBe("ABC-USD");
  });
});

describe("fetchCoinGeckoTrending", () => {
  it("parses trending response correctly", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        coins: [
          {
            item: {
              id: "pengu",
              symbol: "peng",
              name: "Pudgy Penguins",
              data: {
                price_change_percentage_24h: { usd: 42.5 },
                total_volume: "$500,000,000",
                market_cap: "$1,000,000,000",
                price: 0.032,
              },
            },
          },
          {
            item: {
              id: "unknown-new-coin",
              symbol: "newc",
              name: "New Coin",
              data: {
                price_change_percentage_24h: { usd: 15.3 },
              },
            },
          },
        ],
      }),
    } as Response);

    const result = await fetchCoinGeckoTrending();

    expect(result).toHaveLength(2);
    expect(result[0].symbol).toBe("PENG-USD");
    expect(result[0].name).toBe("Pudgy Penguins");
    expect(result[0].asset_class).toBe("crypto");
    expect(result[0].source).toBe("coingecko_trending");
    expect(result[0].price_change_pct).toBe(42.5);
    expect(result[0].price_at_discovery).toBe(0.032);

    expect(result[1].symbol).toBe("NEWC-USD");
    expect(result[1].volume).toBeNull();
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as Response);

    await expect(fetchCoinGeckoTrending()).rejects.toThrow("CoinGecko trending: 429");
  });

  it("handles empty coins array", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ coins: [] }),
    } as Response);

    const result = await fetchCoinGeckoTrending();
    expect(result).toHaveLength(0);
  });
});

describe("fetchCoinGeckoTopVolume", () => {
  it("filters coins with >20% price change", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 65000, market_cap: 1e12, total_volume: 5e10, price_change_percentage_24h: 5 },
        { id: "pengu", symbol: "peng", name: "Pudgy Penguins", current_price: 0.05, market_cap: 5e8, total_volume: 2e9, price_change_percentage_24h: 45.3 },
        { id: "unknown-pump", symbol: "pump", name: "Pump Token", current_price: 1.2, market_cap: 1e8, total_volume: 5e8, price_change_percentage_24h: -25 },
      ],
    } as Response);

    const result = await fetchCoinGeckoTopVolume();

    expect(result).toHaveLength(2);
    expect(result[0].symbol).toBe("PENG-USD");
    expect(result[0].price_change_pct).toBe(45.3);
    expect(result[1].symbol).toBe("PUMP-USD");
    expect(result[1].price_change_pct).toBe(-25);
  });
});

describe("fetchPolygonMovers", () => {
  it("filters stocks with >10% change", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tickers: [
          { ticker: "AAPL", todaysChangePerc: 5, todaysChange: 8, updated: 1, day: { v: 1e6, c: 175 } },
          { ticker: "GME", todaysChangePerc: 25.5, todaysChange: 5, updated: 1, day: { v: 5e7, c: 25 } },
          { ticker: "AMC", todaysChangePerc: 15, todaysChange: 1, updated: 1, day: { v: 3e7, c: 8 } },
        ],
      }),
    } as Response);

    const result = await fetchPolygonMovers("test-key");

    expect(result).toHaveLength(2);
    expect(result[0].symbol).toBe("GME");
    expect(result[0].asset_class).toBe("stock");
    expect(result[0].source).toBe("polygon_movers");
    expect(result[0].price_change_pct).toBe(25.5);
    expect(result[1].symbol).toBe("AMC");
  });
});
