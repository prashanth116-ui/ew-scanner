/**
 * Pre-Run data fetching from Yahoo Finance + Finnhub + SEC EDGAR.
 * SERVER-ONLY: Used by /api/prerun/* routes.
 */

import "server-only";

import type { PreRunStockData } from "./types";
import { getYahooCrumb, invalidateCrumbCache } from "../squeeze-fetch";
import { getSectorForTicker, getSectorETF } from "@/data/prerun-universe";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SEC_UA = "EW-Scanner admin@ew-scanner.app";
const YAHOO_SUMMARY =
  "https://query1.finance.yahoo.com/v10/finance/quoteSummary";
const YAHOO_CHART =
  "https://query1.finance.yahoo.com/v8/finance/chart";

function fetchWithTimeout(url: string, init: RequestInit, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

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
  let res = await fetchWithTimeout(url, {
    headers: { "User-Agent": UA, Cookie: auth.cookie },
  });

  if (res.status === 401) {
    invalidateCrumbCache();
    const retryAuth = await getYahooCrumb();
    if (!retryAuth) return null;
    const retryUrl = `${YAHOO_SUMMARY}/${encodeURIComponent(ticker)}?modules=${modules.join(",")}&crumb=${encodeURIComponent(retryAuth.crumb)}`;
    res = await fetchWithTimeout(retryUrl, {
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
export async function fetchYahooChart(
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
  const res = await fetchWithTimeout(url, {
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
    const res = await fetchWithTimeout(url, {});
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

/** Fetch insider transactions from Finnhub (last 90 days). */
async function fetchFinnhubInsiderTransactions(
  ticker: string
): Promise<number> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return 0;

  try {
    const url = `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(ticker)}&token=${key}`;
    const res = await fetchWithTimeout(url, {});
    if (!res.ok) return 0;

    const data = (await res.json()) as {
      data?: {
        transactionDate?: string;
        transactionType?: string;
        share?: number;
      }[];
    };

    if (!data.data) return 0;

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let buyCount = 0;
    for (const tx of data.data) {
      if (!tx.transactionDate || tx.transactionDate < cutoff) continue;
      // P-Purchase, S-Sale, A-Grant/Award — we only count purchases
      const type = (tx.transactionType ?? "").toUpperCase();
      if ((type === "P" || type === "P - PURCHASE") && (tx.share ?? 0) > 0) {
        buyCount++;
      }
    }
    return buyCount;
  } catch {
    return 0;
  }
}

/** Fetch earnings surprises from Finnhub (beat streak). */
async function fetchFinnhubEarningsSurprises(
  ticker: string
): Promise<number> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return 0;

  try {
    const url = `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(ticker)}&token=${key}`;
    const res = await fetchWithTimeout(url, {});
    if (!res.ok) return 0;

    const data = (await res.json()) as {
      actual?: number;
      estimate?: number;
      period?: string;
      surprise?: number;
    }[];

    if (!Array.isArray(data) || data.length === 0) return 0;

    // Sort by period descending (most recent first)
    const sorted = [...data].sort((a, b) => (b.period ?? "").localeCompare(a.period ?? ""));

    let streak = 0;
    for (const entry of sorted) {
      if (entry.actual != null && entry.estimate != null && entry.actual > entry.estimate) {
        streak++;
      } else {
        break; // Streak broken
      }
    }
    return streak;
  } catch {
    return 0;
  }
}

/** Fetch options chain from Yahoo Finance and calculate put/call OI ratio. */
async function fetchYahooPutCallRatio(
  ticker: string
): Promise<number | null> {
  const auth = await getYahooCrumb();
  if (!auth) return null;

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${encodeURIComponent(auth.crumb)}`;
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": UA, Cookie: auth.cookie },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      optionChain?: {
        result?: {
          options?: {
            calls?: { openInterest?: number }[];
            puts?: { openInterest?: number }[];
          }[];
        }[];
      };
    };

    const options = data?.optionChain?.result?.[0]?.options?.[0];
    if (!options) return null;

    let totalCallOI = 0;
    let totalPutOI = 0;
    for (const c of options.calls ?? []) totalCallOI += c.openInterest ?? 0;
    for (const p of options.puts ?? []) totalPutOI += p.openInterest ?? 0;

    if (totalCallOI === 0) return totalPutOI > 0 ? 10 : null; // All puts, very bearish
    return totalPutOI / totalCallOI;
  } catch {
    return null;
  }
}

/** Fetch quarterly revenue from SEC EDGAR XBRL API. */
async function fetchSECQuarterlyRevenue(
  ticker: string
): Promise<{ period: string; value: number }[] | null> {
  try {
    // Step 1: Get CIK from SEC company tickers mapping
    const tickerMapRes = await fetchWithTimeout(
      "https://www.sec.gov/files/company_tickers.json",
      { headers: { "User-Agent": SEC_UA } },
      10000
    );
    if (!tickerMapRes.ok) return null;

    const tickerMap = (await tickerMapRes.json()) as Record<
      string,
      { cik_str: number; ticker: string; title: string }
    >;

    let cik: string | null = null;
    for (const entry of Object.values(tickerMap)) {
      if (entry.ticker.toUpperCase() === ticker.toUpperCase()) {
        cik = String(entry.cik_str).padStart(10, "0");
        break;
      }
    }
    if (!cik) return null;

    // Step 2: Fetch company facts
    const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const factsRes = await fetchWithTimeout(
      factsUrl,
      { headers: { "User-Agent": SEC_UA } },
      10000
    );
    if (!factsRes.ok) return null;

    const facts = (await factsRes.json()) as {
      facts?: {
        "us-gaap"?: Record<
          string,
          {
            units?: Record<
              string,
              { val: number; end: string; form: string; fp: string }[]
            >;
          }
        >;
      };
    };

    // Try common revenue field names
    const gaap = facts?.facts?.["us-gaap"];
    if (!gaap) return null;

    const revenueKeys = [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "SalesRevenueNet",
      "SalesRevenueGoodsNet",
    ];

    for (const key of revenueKeys) {
      const concept = gaap[key];
      if (!concept?.units) continue;

      const usd = concept.units["USD"];
      if (!usd || usd.length === 0) continue;

      // Filter to 10-Q filings (quarterly), last 8 quarters
      const quarterly = usd
        .filter((e) => e.form === "10-Q" || e.form === "10-K")
        .sort((a, b) => a.end.localeCompare(b.end))
        .slice(-8);

      if (quarterly.length >= 2) {
        return quarterly.map((q) => ({
          period: q.end,
          value: q.val,
        }));
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Calculate SMA from closes. */
export function calcSMA(closes: number[], period: number): number | null {
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
  ath: number
): number {
  // Find last time price was near ATH (within 5%)
  const threshold = ath * 0.95;
  let lastNearAth = -1;
  for (let i = highs.length - 1; i >= 0; i--) {
    if (highs[i] >= threshold) {
      lastNearAth = i;
      break;
    }
  }
  if (lastNearAth < 0) return timestamps.length; // Never near ATH in chart — use full chart length (weekly data = weeks)
  const now = timestamps[timestamps.length - 1] ?? Date.now() / 1000;
  const then = timestamps[lastNearAth];
  return Math.floor((now - then) / (7 * 24 * 60 * 60));
}

/** Calculate 20-day return from chart closes. */
export function calc20dReturn(closes: number[]): number | null {
  if (closes.length < 20) return null;
  const recent = closes[closes.length - 1];
  const past = closes[closes.length - 20];
  if (!past || past === 0) return null;
  return ((recent - past) / past) * 100;
}

// ── Sector ETF chart cache (shared across tickers in same scan) ──

const sectorChartCache = new Map<string, { closes: number[]; ts: number }>();
const SECTOR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchSectorETFReturn(sectorETF: string): Promise<number | null> {
  const cached = sectorChartCache.get(sectorETF);
  if (cached && Date.now() - cached.ts < SECTOR_CACHE_TTL) {
    return calc20dReturn(cached.closes);
  }

  const chart = await fetchYahooChart(sectorETF, "3mo", "1d");
  if (!chart) return null;

  sectorChartCache.set(sectorETF, { closes: chart.closes, ts: Date.now() });
  return calc20dReturn(chart.closes);
}

/** Main function: fetch all data for a single ticker. */
export async function fetchPreRunData(
  ticker: string
): Promise<PreRunStockData | null> {
  // Fetch Yahoo summary + 3mo chart + 5y chart + Finnhub data in parallel
  // Use allSettled so a timeout on any source doesn't crash the entire ticker
  const sectorETF = getSectorETF(getSectorForTicker(ticker));

  const settled = await Promise.allSettled([
    fetchYahooSummary(ticker, [
      "defaultKeyStatistics",
      "financialData",
      "calendarEvents",
      "recommendationTrend",
      "price",
      "summaryDetail",
      "majorHoldersBreakdown",
    ]),
    fetchYahooChart(ticker, "3mo", "1d"),   // SMA20 + volume
    fetchYahooChart(ticker, "5y", "1wk"),   // True ATH
    fetchFinnhubEarnings(ticker),
    fetchFinnhubInsiderTransactions(ticker), // H: Insider buying
    fetchFinnhubEarningsSurprises(ticker),   // D: Beat streak
    fetchYahooPutCallRatio(ticker),          // I: Options flow
    fetchSectorETFReturn(sectorETF),         // J: Sector return
    fetchSECQuarterlyRevenue(ticker),        // D: Revenue acceleration
  ]);

  const summary = settled[0].status === "fulfilled" ? settled[0].value : null;
  const chart3mo = settled[1].status === "fulfilled" ? settled[1].value : null;
  const chart5y = settled[2].status === "fulfilled" ? settled[2].value : null;
  const finnhubEarnings = settled[3].status === "fulfilled" ? settled[3].value : null;
  const insiderBuys = settled[4].status === "fulfilled" ? settled[4].value : 0;
  const earningsBeatStreak = settled[5].status === "fulfilled" ? settled[5].value : 0;
  const putCallRatio = settled[6].status === "fulfilled" ? settled[6].value : null;
  const sectorReturn20d = settled[7].status === "fulfilled" ? settled[7].value : null;
  const quarterlyRevenue = settled[8].status === "fulfilled" ? settled[8].value : null;

  if (!summary) return null;

  const stats = (summary.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const financial = (summary.financialData ?? {}) as Record<string, unknown>;
  const calendar = (summary.calendarEvents ?? {}) as Record<string, unknown>;
  const price = (summary.price ?? {}) as Record<string, unknown>;
  const detail = (summary.summaryDetail ?? {}) as Record<string, unknown>;
  const trend = (summary.recommendationTrend ?? {}) as Record<string, unknown>;
  const holders = (summary.majorHoldersBreakdown ?? {}) as Record<string, unknown>;

  const currentPrice = extractRaw(price.regularMarketPrice);
  const high52w = extractRaw(detail.fiftyTwoWeekHigh);
  const low52w = extractRaw(detail.fiftyTwoWeekLow);
  const marketCap = extractRaw(price.marketCap);

  // True ATH from 5y weekly highs (fallback to 52w high)
  let allTimeHigh = high52w;
  if (chart5y) {
    for (const h of chart5y.highs) {
      if (h > 0 && (allTimeHigh === null || h > allTimeHigh)) allTimeHigh = h;
    }
  }

  // Institutional ownership %
  let institutionalPct = extractRaw(holders.institutionsPercentHeld);
  if (institutionalPct !== null && institutionalPct <= 1) {
    institutionalPct *= 100; // Convert decimal (0.65) to percentage (65)
  }

  // Short float: try Yahoo first
  let shortFloat = extractRaw(stats.shortPercentOfFloat);
  // Normalize: Yahoo returns as decimal (0.15 = 15%), convert to percentage
  // Yahoo's decimal format is always < 1; values >= 1 are already percentages
  if (shortFloat !== null && shortFloat < 1) {
    shortFloat = shortFloat * 100;
  }

  // Float shares
  const floatShares = extractRaw(stats.floatShares);

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

  // Calculate from 3mo chart data
  const sma20 = chart3mo ? calcSMA(chart3mo.closes, 20) : null;
  const volAccum = chart3mo
    ? calcVolumeAccumulation(chart3mo.closes, chart3mo.opens, chart3mo.volumes)
    : { avgUp: 0, avgDown: 0 };

  // Float turnover: cumulative 20d volume / float
  let floatTurnover20d: number | null = null;
  if (chart3mo && floatShares && floatShares > 0) {
    const recentVols = chart3mo.volumes.slice(-20);
    const cumVol = recentVols.reduce((a, b) => a + b, 0);
    floatTurnover20d = cumVol / floatShares;
  }

  // Base high from 3mo chart (resistance level)
  let baseHigh: number | null = null;
  if (chart3mo && chart3mo.highs.length > 0) {
    baseHigh = Math.max(...chart3mo.highs.filter((h) => h > 0));
  }

  // % from base high
  let pctFromBaseHigh: number | null = null;
  if (currentPrice !== null && baseHigh !== null && baseHigh > 0) {
    pctFromBaseHigh = ((baseHigh - currentPrice) / baseHigh) * 100;
  }

  // Relative strength: stock 20d return minus sector ETF 20d return
  let relativeStrength20d: number | null = null;
  const stockReturn20d = chart3mo ? calc20dReturn(chart3mo.closes) : null;
  if (stockReturn20d !== null && sectorReturn20d !== null) {
    relativeStrength20d = stockReturn20d - sectorReturn20d;
  }

  // Weeks in base from 5y weekly data
  const weeksInBase = (chart5y && allTimeHigh)
    ? calcWeeksInBase(chart5y.highs, chart5y.timestamps, allTimeHigh)
    : null;

  // % from ATH (use true ATH, not 52w high)
  const pctFromAth =
    currentPrice !== null && allTimeHigh !== null && allTimeHigh > 0
      ? ((1 - currentPrice / allTimeHigh) * 100)
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
    allTimeHigh,
    weeksInBase,
    institutionalPct,
    // New fields
    insiderBuys90d: insiderBuys,
    putCallRatio,
    relativeStrength20d,
    sectorReturn20d,
    pctFromBaseHigh,
    floatShares,
    floatTurnover20d,
    quarterlyRevenue,
    earningsBeatStreak,
    lastUpdated: new Date().toISOString(),
  };
}
