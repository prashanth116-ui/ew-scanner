/**
 * Catalyst Scanner data fetching from Yahoo Finance.
 * SERVER-ONLY: Uses deduplicatedChartFetch and fetchWithRetry from yahoo-utils.
 */

import "server-only";

import { fetchWithRetry, deduplicatedChartFetch, extractRaw } from "@/lib/yahoo-utils";
import { getYahooCrumb, invalidateCrumbCache } from "@/lib/squeeze-fetch";
import type { CatalystRawData, ETFPriceData } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const YAHOO_SUMMARY = "https://query1.finance.yahoo.com/v10/finance/quoteSummary";
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

// ── Safe number coercion ──

function toNum(val: unknown, fallback: number): number {
  return typeof val === "number" && !Number.isNaN(val) ? val : fallback;
}

/** Last Observation Carried Forward — fill nulls with previous value. */
function locf(arr: (number | null)[]): number[] {
  const out: number[] = [];
  let last = 0;
  for (const v of arr) {
    if (v !== null && v !== undefined) last = v;
    out.push(last);
  }
  return out;
}

/** Fetch quoteSummary modules from Yahoo Finance. */
async function fetchYahooSummary(
  ticker: string,
  modules: string[]
): Promise<Record<string, unknown> | null> {
  const auth = await getYahooCrumb();
  if (!auth) return null;

  const url = `${YAHOO_SUMMARY}/${encodeURIComponent(ticker)}?modules=${modules.join(",")}&crumb=${encodeURIComponent(auth.crumb)}`;
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      headers: { "User-Agent": UA, Cookie: auth.cookie },
    });
  } catch {
    return null;
  }

  if (res.status === 401) {
    invalidateCrumbCache();
    const retryAuth = await getYahooCrumb();
    if (!retryAuth) return null;
    const retryUrl = `${YAHOO_SUMMARY}/${encodeURIComponent(ticker)}?modules=${modules.join(",")}&crumb=${encodeURIComponent(retryAuth.crumb)}`;
    try {
      res = await fetchWithRetry(retryUrl, {
        headers: { "User-Agent": UA, Cookie: retryAuth.cookie },
      });
    } catch {
      return null;
    }
  }

  if (!res.ok) return null;

  const data = await res.json();
  const result = (
    data as { quoteSummary?: { result?: Record<string, unknown>[] } }
  )?.quoteSummary?.result?.[0];
  return result ?? null;
}

/** Fetch chart data (OHLCV + timestamps) from Yahoo Finance. */
async function fetchYahooChart(
  ticker: string,
  range = "3mo",
  interval = "1d"
): Promise<{
  closes: number[];
  volumes: number[];
  highs: number[];
  lows: number[];
  timestamps: number[];
} | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;

  try {
    data = await deduplicatedChartFetch(ticker, range, interval, async () => {
      const auth = await getYahooCrumb();
      if (!auth) return null;

      const url = `${YAHOO_CHART}/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&crumb=${encodeURIComponent(auth.crumb)}`;
      let res: Response;
      try {
        res = await fetchWithRetry(url, {
          headers: { "User-Agent": UA, Cookie: auth.cookie },
        });
      } catch {
        return null;
      }
      if (!res.ok) return null;
      return await res.json();
    });
  } catch {
    return null;
  }

  if (!data) return null;

  const chart = (data as {
    chart?: {
      result?: {
        timestamp?: number[];
        indicators?: {
          quote?: {
            close?: (number | null)[];
            volume?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
          }[];
        };
      }[];
    };
  })?.chart?.result?.[0];

  if (!chart?.timestamp || !chart.indicators?.quote?.[0]) return null;
  const q = chart.indicators.quote[0];

  return {
    timestamps: chart.timestamp,
    closes: locf(q.close ?? []),
    volumes: (q.volume ?? []).map((v) => v ?? 0),
    highs: locf(q.high ?? []),
    lows: locf(q.low ?? []),
  };
}

/** Compute simple moving average from last N values of closes. */
function computeSMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Fetch all catalyst data for a single ticker.
 * Combines chart data (3mo daily) with quoteSummary for fundamentals.
 */
export async function fetchCatalystData(
  symbol: string
): Promise<CatalystRawData | null> {
  // Fetch chart and summary in parallel
  const [chartData, summary] = await Promise.all([
    fetchYahooChart(symbol, "3mo", "1d"),
    fetchYahooSummary(symbol, ["price", "defaultKeyStatistics", "financialData", "summaryDetail"]),
  ]);

  if (!chartData || !summary) return null;

  const { closes, volumes, highs, lows } = chartData;
  if (closes.length < 2) return null;

  const currentPrice = closes[closes.length - 1];

  // Extract summary data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const price = summary.price as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyStats = summary.defaultKeyStatistics as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const financialData = summary.financialData as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryDetail = summary.summaryDetail as Record<string, any> | undefined;

  // 52-week high/low — prefer summaryDetail, then keyStats, then compute from chart
  const chartHigh = highs.length > 0 ? Math.max(...highs) : currentPrice;
  const chartLow = lows.length > 0 ? Math.min(...lows.filter((l) => l > 0)) : currentPrice;
  const fiftyTwoWeekHigh = toNum(
    extractRaw(summaryDetail?.fiftyTwoWeekHigh) ?? extractRaw(keyStats?.fiftyTwoWeekHigh),
    chartHigh
  );
  const fiftyTwoWeekLow = toNum(
    extractRaw(summaryDetail?.fiftyTwoWeekLow) ?? extractRaw(keyStats?.fiftyTwoWeekLow),
    chartLow
  );

  // Short interest
  const shortPercentFloat = toNum(extractRaw(keyStats?.shortPercentOfFloat), 0) * 100;

  // Analyst target
  const analystTarget = toNum(extractRaw(financialData?.targetMeanPrice), currentPrice);

  // Volume averages (5d and 20d)
  const vol5d = volumes.length >= 5
    ? volumes.slice(-5).reduce((a, b) => a + b, 0) / 5
    : volumes.reduce((a, b) => a + b, 0) / (volumes.length || 1);
  const vol20d = volumes.length >= 20
    ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
    : volumes.reduce((a, b) => a + b, 0) / (volumes.length || 1);

  // YTD change — use Yahoo's ytdReturn or regularMarketChangePercent, fall back to chart
  const yahooYtdReturn = extractRaw(keyStats?.ytdReturn);
  let ytdChange: number;
  if (yahooYtdReturn !== null) {
    ytdChange = yahooYtdReturn * 100;
  } else {
    // Fall back to chart-based computation
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const firstTradingIdx = chartData.timestamps.findIndex(
      (ts) => ts * 1000 >= yearStart.getTime()
    );
    const ytdBasePrice = firstTradingIdx >= 0 ? closes[firstTradingIdx] : closes[0];
    ytdChange = ytdBasePrice > 0
      ? ((currentPrice - ytdBasePrice) / ytdBasePrice) * 100
      : 0;
  }

  // 5d change
  const price5dAgo = closes.length >= 6 ? closes[closes.length - 6] : closes[0];
  const change5d = price5dAgo > 0
    ? ((currentPrice - price5dAgo) / price5dAgo) * 100
    : 0;

  // 1d change
  const price1dAgo = closes.length >= 2 ? closes[closes.length - 2] : closes[0];
  const change1d = price1dAgo > 0
    ? ((currentPrice - price1dAgo) / price1dAgo) * 100
    : 0;

  // SMA 50 — prefer summaryDetail, fall back to chart computation
  const sma50 = toNum(
    extractRaw(summaryDetail?.fiftyDayAverage),
    computeSMA(closes, Math.min(50, closes.length))
  );

  // SMA 200 — must come from summaryDetail (3mo chart too short for 200-day)
  const sma200 = toNum(
    extractRaw(summaryDetail?.twoHundredDayAverage),
    currentPrice // fallback to current price if unavailable (neutral for scoring)
  );

  return {
    symbol,
    price: currentPrice,
    ytdChange,
    change5d,
    change1d,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    shortPercentFloat,
    analystTarget,
    volume5dAvg: vol5d,
    volume20dAvg: vol20d,
    closes,
    sma50,
    sma200,
  };
}

/**
 * Batch fetch catalyst data for multiple tickers.
 * Fetches in batches of 10 with 500ms delay between batches.
 */
export async function fetchBatchCatalystData(
  symbols: string[],
  batchSize = 10,
  batchDelay = 500
): Promise<Map<string, CatalystRawData>> {
  const results = new Map<string, CatalystRawData>();

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);

    const settled = await Promise.allSettled(
      batch.map(async (symbol) => {
        const data = await fetchCatalystData(symbol);
        return { symbol, data };
      })
    );

    for (const r of settled) {
      if (r.status === "fulfilled" && r.value.data) {
        results.set(r.value.symbol, r.value.data);
      }
    }

    // Delay between batches
    if (i + batchSize < symbols.length) {
      await new Promise((r) => setTimeout(r, batchDelay));
    }
  }

  return results;
}

/**
 * Fetch 20-day price data for a sector ETF (for momentum scoring).
 */
export async function fetchLayerETFData(
  etfSymbol: string
): Promise<ETFPriceData | null> {
  const chartData = await fetchYahooChart(etfSymbol, "1mo", "1d");
  if (!chartData || chartData.closes.length < 2) return null;

  const closes = chartData.closes.slice(-20);
  const high20d = Math.max(...closes);
  const currentPrice = closes[closes.length - 1];

  return {
    symbol: etfSymbol,
    closes,
    high20d,
    currentPrice,
  };
}

/**
 * Batch fetch ETF data for all unique sector ETFs.
 */
export async function fetchAllETFData(
  etfSymbols: string[]
): Promise<Map<string, ETFPriceData>> {
  const results = new Map<string, ETFPriceData>();

  const settled = await Promise.allSettled(
    etfSymbols.map(async (symbol) => {
      const data = await fetchLayerETFData(symbol);
      return { symbol, data };
    })
  );

  for (const r of settled) {
    if (r.status === "fulfilled" && r.value.data) {
      results.set(r.value.symbol, r.value.data);
    }
  }

  return results;
}
