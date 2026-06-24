/**
 * Yahoo Finance data fetching for pre-market checklist.
 * SERVER-ONLY: Fetches futures (ES, NQ, RTY) and market internals (TICK, TRIN, ADD).
 */

import "server-only";

import { fetchWithRetry } from "@/lib/yahoo-utils";
import type { FuturesSnapshot, InternalsSnapshot } from "./types";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Module-level cache with 2-min TTL (pre-market data changes frequently)
let _cache: { data: { futures: FuturesSnapshot[]; internals: InternalsSnapshot }; ts: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

const FUTURES_SYMBOLS = [
  { symbol: "ES=F", name: "S&P 500 E-mini" },
  { symbol: "NQ=F", name: "Nasdaq 100 E-mini" },
  { symbol: "RTY=F", name: "Russell 2000 E-mini" },
  { symbol: "CL=F", name: "Crude Oil WTI" },
  { symbol: "GC=F", name: "Gold" },
];

const INTERNALS_SYMBOLS = {
  add: "^ADD",
  tick: "^TICK",
  trin: "^TRIN",
};

interface YahooQuote {
  price: number;
  change: number;
  changePct: number;
  volume: number;
  timestamp: number;
}

async function fetchQuote(symbol: string): Promise<YahooQuote | null> {
  try {
    const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": UA },
    }, { timeout: 10000, retries: 1 });

    if (!res.ok) return null;
    const json = await res.json();

    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice ?? meta.previousClose ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - prevClose;
    const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;
    const volume = meta.regularMarketVolume ?? 0;
    const timestamp = (meta.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000;

    return { price, change, changePct, volume, timestamp };
  } catch {
    return null;
  }
}

export async function fetchPremarketData(): Promise<{
  futures: FuturesSnapshot[];
  internals: InternalsSnapshot;
}> {
  // Return cached data if fresh
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return _cache.data;
  }

  // Fetch all symbols in parallel
  const [futuresResults, addResult, tickResult, trinResult] = await Promise.all([
    Promise.all(FUTURES_SYMBOLS.map(async (f) => {
      const quote = await fetchQuote(f.symbol);
      if (!quote) return null;
      return {
        symbol: f.symbol,
        name: f.name,
        price: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        volume: quote.volume,
        timestamp: quote.timestamp,
      } satisfies FuturesSnapshot;
    })),
    fetchQuote(INTERNALS_SYMBOLS.add),
    fetchQuote(INTERNALS_SYMBOLS.tick),
    fetchQuote(INTERNALS_SYMBOLS.trin),
  ]);

  const futures = futuresResults.filter((f): f is FuturesSnapshot => f !== null);

  const internals: InternalsSnapshot = {
    addLine: addResult?.price ?? null,
    tick: tickResult?.price ?? null,
    trin: trinResult?.price ?? null,
  };

  const data = { futures, internals };
  _cache = { data, ts: Date.now() };
  return data;
}
