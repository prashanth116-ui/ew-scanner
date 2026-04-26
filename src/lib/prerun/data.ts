/**
 * Pre-Run data fetching from Yahoo Finance + Finnhub.
 * SERVER-ONLY: Used by /api/prerun/* routes.
 */

import "server-only";

import type { PreRunStockData } from "./types";
import { getYahooCrumb, invalidateCrumbCache } from "../squeeze-fetch";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const YAHOO_SUMMARY =
  "https://query1.finance.yahoo.com/v10/finance/quoteSummary";
const YAHOO_CHART =
  "https://query1.finance.yahoo.com/v8/finance/chart";

function extractRaw(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "object" && "raw" in (val as Record<string, unknown>)) {
    return (val as { raw: number }).raw;
  }
  return null;
}

/** Fetch quoteSummary modules from Yahoo Finance. */
async function fetchYahooSummary(
  ticker: string,
  modules: string[]
): Promise<Record<string, unknown> | null> {
  const auth = await getYahooCrumb();
  if (!auth) return null;

  const url = `${YAHOO_SUMMARY}/${encodeURIComponent(ticker)}?modules=${modules.join(",")}&crumb=${encodeURIComponent(auth.crumb)}`;
  let res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: auth.cookie },
  });

  if (res.status === 401) {
    invalidateCrumbCache();
    const retryAuth = await getYahooCrumb();
    if (!retryAuth) return null;
    const retryUrl = `${YAHOO_SUMMARY}/${encodeURIComponent(ticker)}?modules=${modules.join(",")}&crumb=${encodeURIComponent(retryAuth.crumb)}`;
    res = await fetch(retryUrl, {
      headers: { "User-Agent": UA, Cookie: retryAuth.cookie },
    });
  }

  if (!res.ok) return null;

  const data = await res.json();
  const result = (
    data as { quoteSummary?: { result?: Record<string, unknown>[] } }
  )?.quoteSummary?.result?.[0];
  return result ?? null;
}

/** Fetch price chart data for volume analysis + SMA calc. */
async function fetchYahooChart(
  ticker: string,
  range = "3mo",
  interval = "1d"
): Promise<{
  closes: number[];
  volumes: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  timestamps: number[];
} | null> {
  const auth = await getYahooCrumb();
  if (!auth) return null;

  const url = `${YAHOO_CHART}/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&crumb=${encodeURIComponent(auth.crumb)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: auth.cookie },
  });
  if (!res.ok) return null;

  const data = await res.json();
  const chart = (data as {
    chart?: {
      result?: {
        timestamp?: number[];
        indicators?: {
          quote?: {
            close?: (number | null)[];
            volume?: (number | null)[];
            open?: (number | null)[];
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
    closes: (q.close ?? []).map((v) => v ?? 0),
    volumes: (q.volume ?? []).map((v) => v ?? 0),
    opens: (q.open ?? []).map((v) => v ?? 0),
    highs: (q.high ?? []).map((v) => v ?? 0),
    lows: (q.low ?? []).map((v) => v ?? 0),
  };
}

/** Fetch short interest from Finnhub (if key available). */
async function fetchFinnhubShortInterest(
  ticker: string
): Promise<number | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  try {
    const url = `https://finnhub.io/api/v1/stock/short-interest?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      data?: { shortInterest?: number; avgDailyShareTraded?: number }[];
    };
    const latest = data?.data?.[0];
    if (!latest?.shortInterest || !latest.avgDailyShareTraded) return null;

    // Approximate short % of float from short interest / avg volume ratio
    return null; // Finnhub free tier may not have percentage directly
  } catch {
    return null;
  }
}

/** Fetch earnings calendar from Finnhub. */
async function fetchFinnhubEarnings(
  ticker: string
): Promise<string | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  try {
    const url = `https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      earningsCalendar?: { date?: string; symbol?: string }[];
    };
    const entry = data?.earningsCalendar?.find(
      (e) => e.symbol?.toUpperCase() === ticker.toUpperCase()
    );
    return entry?.date ?? null;
  } catch {
    return null;
  }
}

/** Calculate SMA from closes. */
function calcSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Calculate volume accumulation pattern. */
function calcVolumeAccumulation(
  closes: number[],
  opens: number[],
  volumes: number[]
): { avgUp: number; avgDown: number } {
  const n = Math.min(closes.length, 20);
  const recent = closes.slice(-n);
  const recentOpens = opens.slice(-n);
  const recentVols = volumes.slice(-n);

  let upVolSum = 0, upCount = 0;
  let downVolSum = 0, downCount = 0;

  for (let i = 0; i < n; i++) {
    if (recent[i] > recentOpens[i]) {
      upVolSum += recentVols[i];
      upCount++;
    } else if (recent[i] < recentOpens[i]) {
      downVolSum += recentVols[i];
      downCount++;
    }
  }

  return {
    avgUp: upCount > 0 ? upVolSum / upCount : 0,
    avgDown: downCount > 0 ? downVolSum / downCount : 0,
  };
}

/** Calculate weeks in base (how long price has been below ATH). */
function calcWeeksInBase(
  highs: number[],
  timestamps: number[],
  high52w: number
): number {
  // Find last time price was near ATH (within 5%)
  const threshold = high52w * 0.95;
  let lastNearAth = -1;
  for (let i = highs.length - 1; i >= 0; i--) {
    if (highs[i] >= threshold) {
      lastNearAth = i;
      break;
    }
  }
  if (lastNearAth < 0) return Math.floor(timestamps.length / 5); // Approximate from chart length
  const now = timestamps[timestamps.length - 1] ?? Date.now() / 1000;
  const then = timestamps[lastNearAth];
  return Math.floor((now - then) / (7 * 24 * 60 * 60));
}

/** Main function: fetch all data for a single ticker. */
export async function fetchPreRunData(
  ticker: string
): Promise<PreRunStockData | null> {
  // Fetch Yahoo summary + chart in parallel
  const [summary, chart, finnhubEarnings] = await Promise.all([
    fetchYahooSummary(ticker, [
      "defaultKeyStatistics",
      "financialData",
      "calendarEvents",
      "recommendationTrend",
      "price",
      "summaryDetail",
    ]),
    fetchYahooChart(ticker, "3mo", "1d"),
    fetchFinnhubEarnings(ticker),
  ]);

  if (!summary) return null;

  const stats = (summary.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const financial = (summary.financialData ?? {}) as Record<string, unknown>;
  const calendar = (summary.calendarEvents ?? {}) as Record<string, unknown>;
  const price = (summary.price ?? {}) as Record<string, unknown>;
  const detail = (summary.summaryDetail ?? {}) as Record<string, unknown>;
  const trend = (summary.recommendationTrend ?? {}) as Record<string, unknown>;

  const currentPrice = extractRaw(price.regularMarketPrice);
  const high52w = extractRaw(detail.fiftyTwoWeekHigh);
  const low52w = extractRaw(detail.fiftyTwoWeekLow);
  const marketCap = extractRaw(price.marketCap);

  // Short float: try Yahoo first
  let shortFloat = extractRaw(stats.shortPercentOfFloat);
  // Normalize: Yahoo returns as decimal (0.15 = 15%), convert to percentage
  if (shortFloat !== null && shortFloat < 1) {
    shortFloat = shortFloat * 100;
  }

  // Revenue growth
  const revenueGrowth = extractRaw(financial.revenueGrowth);

  // Analyst count
  const trendEntries = (trend.trend ?? []) as { period?: string; strongBuy?: number; buy?: number; hold?: number; sell?: number; strongSell?: number }[];
  let analystCount: number | null = null;
  if (trendEntries.length > 0) {
    const current = trendEntries[0];
    analystCount = (current.strongBuy ?? 0) + (current.buy ?? 0) +
      (current.hold ?? 0) + (current.sell ?? 0) + (current.strongSell ?? 0);
  }

  // Earnings date
  const earningsDates = (calendar.earnings ?? {}) as Record<string, unknown>;
  const earningsDateArr = (earningsDates.earningsDate ?? []) as { raw?: number }[];
  let nextEarningsDate: string | null = null;
  if (earningsDateArr.length > 0 && earningsDateArr[0].raw) {
    nextEarningsDate = new Date(earningsDateArr[0].raw * 1000)
      .toISOString()
      .slice(0, 10);
  }
  // Use Finnhub earnings if Yahoo doesn't have it
  if (!nextEarningsDate && finnhubEarnings) {
    nextEarningsDate = finnhubEarnings;
  }

  // Days to earnings
  let daysToEarnings: number | null = null;
  if (nextEarningsDate) {
    const diff = new Date(nextEarningsDate).getTime() - Date.now();
    daysToEarnings = Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  // Calculate from chart data
  const sma20 = chart ? calcSMA(chart.closes, 20) : null;
  const volAccum = chart
    ? calcVolumeAccumulation(chart.closes, chart.opens, chart.volumes)
    : { avgUp: 0, avgDown: 0 };

  // % from ATH
  const pctFromAth =
    currentPrice !== null && high52w !== null && high52w > 0
      ? ((1 - currentPrice / high52w) * 100)
      : null;

  return {
    ticker: ticker.toUpperCase(),
    companyName:
      (price.shortName as string) ??
      (price.longName as string) ??
      ticker.toUpperCase(),
    currentPrice,
    high52w,
    low52w,
    pctFromAth,
    marketCap,
    shortFloat,
    nextEarningsDate,
    daysToEarnings,
    revenueGrowthYoY: revenueGrowth !== null ? revenueGrowth * 100 : null,
    analystCount,
    sma20,
    avgVolumeUpDays: volAccum.avgUp,
    avgVolumeDownDays: volAccum.avgDown,
    lastUpdated: new Date().toISOString(),
  };
}
