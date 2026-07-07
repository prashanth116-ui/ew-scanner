/**
 * Yahoo Finance data fetching for pre-market checklist.
 * SERVER-ONLY: Fetches futures (ES, NQ, RTY, YM, CL, GC) and VIX data.
 *
 * NOTE: ^TICK, ^TRIN, ^ADD permanently return 404 on Yahoo Finance.
 * Breadth is computed from sector rotation data in the API route instead.
 */

import "server-only";

import { fetchWithRetry } from "@/lib/yahoo-utils";
import type { FuturesSnapshot, InternalsSnapshot, VixData } from "./types";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Module-level cache with 2-min TTL (pre-market data changes frequently)
let _cache: { data: { futures: FuturesSnapshot[]; internals: InternalsSnapshot; vixData: VixData | null }; ts: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

const FUTURES_SYMBOLS = [
  { symbol: "ES=F", name: "S&P 500 E-mini" },
  { symbol: "NQ=F", name: "Nasdaq 100 E-mini" },
  { symbol: "RTY=F", name: "Russell 2000 E-mini" },
  { symbol: "YM=F", name: "Dow E-mini" },
  { symbol: "CL=F", name: "Crude Oil WTI" },
  { symbol: "GC=F", name: "Gold" },
];

interface YahooQuote {
  price: number;
  change: number;
  changePct: number;
  volume: number;
  timestamp: number;
  previousClose: number;
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
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;
    if (prevClose == null || prevClose === 0) return null;
    const change = price - prevClose;
    const changePct = (change / prevClose) * 100;
    const volume = meta.regularMarketVolume ?? 0;
    const timestamp = (meta.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000;

    return { price, change, changePct, volume, timestamp, previousClose: prevClose };
  } catch {
    return null;
  }
}

export async function fetchPremarketData(): Promise<{
  futures: FuturesSnapshot[];
  internals: InternalsSnapshot;
  vixData: VixData | null;
}> {
  // Return cached data if fresh
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return _cache.data;
  }

  // Fetch futures + VIX in parallel (internals removed — ^TICK/^TRIN/^ADD are dead)
  const [futuresResults, vixQuote] = await Promise.all([
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
    fetchQuote("^VIX"),
  ]);

  const futures = futuresResults.filter((f): f is FuturesSnapshot => f !== null);

  // Legacy internals — always null (kept for backward compat with scoring.ts checklist)
  const internals: InternalsSnapshot = {
    addLine: null,
    tick: null,
    trin: null,
  };

  // VIX with daily change (chartPreviousClose gives us yesterday's close)
  const vixData: VixData | null = vixQuote
    ? {
        level: vixQuote.price,
        previousClose: vixQuote.previousClose,
        change: vixQuote.change,
        changePct: vixQuote.changePct,
      }
    : null;

  const data = { futures, internals, vixData };
  // Only cache when all 4 equity futures successfully fetched — partial results
  // would corrupt bias calculations for subsequent callers within the 2-min TTL.
  const equitySymbols = ["ES=F", "NQ=F", "RTY=F", "YM=F"];
  const hasAllEquity = equitySymbols.every((sym) => futures.some((f) => f.symbol === sym));
  if (hasAllEquity) {
    _cache = { data, ts: Date.now() };
  }
  return data;
}
