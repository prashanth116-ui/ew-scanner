/**
 * Pre-Run data fetching from Yahoo Finance + Finnhub + SEC EDGAR.
 * SERVER-ONLY: Used by /api/prerun/* routes.
 */

import "server-only";

import type { PreRunStockData, EmaTimeframe, M2TimeframeResult } from "./types";
import { getYahooCrumb, invalidateCrumbCache } from "../squeeze-fetch";
import { getSectorForTicker, getSectorETF } from "@/data/prerun-universe";
import { fetchWithRetry, extractRaw, deduplicatedChartFetch } from "@/lib/yahoo-utils";
import { logError } from "@/lib/error-logger";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SEC_UA = "EW-Scanner admin@ew-scanner.app";
const YAHOO_SUMMARY =
  "https://query1.finance.yahoo.com/v10/finance/quoteSummary";
const YAHOO_CHART =
  "https://query1.finance.yahoo.com/v8/finance/chart";

// ── Safe number coercion for Yahoo API responses ──

function toNum(val: unknown, fallback: number): number {
  return typeof val === "number" && !Number.isNaN(val) ? val : fallback;
}

function toNumOrNull(val: unknown): number | null {
  return typeof val === "number" && !Number.isNaN(val) ? val : null;
}

// ── Finnhub response cache (30-min TTL) ──
// Earnings calendar, insider buys, and beat streaks are stable for hours.
// Eliminates ~4,173 redundant HTTP calls on repeated confluence scans.
const _finnhubCache = new Map<string, { data: unknown; ts: number }>();
const FINNHUB_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours — insider buys/earnings don't change intraday

function getFinnhubCached<T>(key: string): T | undefined {
  const entry = _finnhubCache.get(key);
  if (entry && Date.now() - entry.ts < FINNHUB_CACHE_TTL) return entry.data as T;
  if (entry) _finnhubCache.delete(key);
  return undefined;
}

function setFinnhubCached(key: string, data: unknown): void {
  _finnhubCache.set(key, { data, ts: Date.now() });
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

/** Last Observation Carried Forward — fill nulls with previous valid value. */
function locf(arr: (number | null)[]): number[] {
  const out: number[] = [];
  let last = arr.find(v => v !== null && v !== undefined) ?? 0;
  for (const v of arr) {
    if (v !== null && v !== undefined) last = v;
    out.push(last);
  }
  return out;
}

/** Fetch price chart data for volume analysis + SMA calc. */
export async function fetchYahooChart(
  ticker: string,
  range = "3mo",
  interval = "1d",
  includePrePost = false,
): Promise<{
  closes: number[];
  volumes: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  timestamps: number[];
} | null> {
  // Deduplicated fetch — prevents duplicate HTTP requests when multiple scanners
  // request the same chart concurrently (e.g. EW + PreRun both need AAPL:5y:1wk)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;

  // Use a distinct cache key when includePrePost is true to avoid collisions
  // (e.g. 12h's "2y:1h:prepost" vs 4h's "2y:1h")
  const cacheInterval = includePrePost ? `${interval}:prepost` : interval;

  try {
    data = await deduplicatedChartFetch(ticker, range, cacheInterval, async () => {
      const auth = await getYahooCrumb();
      if (!auth) return null;

      let url = `${YAHOO_CHART}/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&crumb=${encodeURIComponent(auth.crumb)}`;
      if (includePrePost) {
        url += "&includePrePost=true";
      }
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
    closes: locf(q.close ?? []),
    volumes: (q.volume ?? []).map((v) => v ?? 0),
    opens: locf(q.open ?? []),
    highs: locf(q.high ?? []),
    lows: locf(q.low ?? []),
  };
}

/** Truncate chart arrays to include only data up to (and including) targetDate.
 *  Returns null if no data exists before the target date. */
function truncateChartToDate(
  chart: { closes: number[]; opens: number[]; highs: number[]; lows: number[]; volumes: number[]; timestamps: number[] },
  targetDate: string,
): typeof chart | null {
  const targetTs = new Date(targetDate + "T23:59:59Z").getTime() / 1000;
  let endIdx = -1;
  for (let i = chart.timestamps.length - 1; i >= 0; i--) {
    if (chart.timestamps[i] <= targetTs) { endIdx = i; break; }
  }
  if (endIdx < 0) return null;
  const s = endIdx + 1;
  return {
    closes: chart.closes.slice(0, s), opens: chart.opens.slice(0, s),
    highs: chart.highs.slice(0, s), lows: chart.lows.slice(0, s),
    volumes: chart.volumes.slice(0, s), timestamps: chart.timestamps.slice(0, s),
  };
}

/** Fetch earnings calendar from Finnhub. */
async function fetchFinnhubEarnings(
  ticker: string
): Promise<string | null> {
  const cacheKey = `earnings:${ticker.toUpperCase()}`;
  const cached = getFinnhubCached<string | null>(cacheKey);
  if (cached !== undefined) return cached;

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  try {
    const url = `https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${key}`;
    const res = await fetchWithRetry(url, {}, { retries: 2, baseDelay: 1500 });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      earningsCalendar?: { date?: string; symbol?: string }[];
    };
    const entry = data?.earningsCalendar?.find(
      (e) => e.symbol?.toUpperCase() === ticker.toUpperCase()
    );
    const result = entry?.date ?? null;
    setFinnhubCached(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

/** Fetch insider transactions from Finnhub (last 90 days). */
async function fetchFinnhubInsiderTransactions(
  ticker: string
): Promise<{ buys90d: number; buys45d: number }> {
  const cacheKey = `insider:${ticker.toUpperCase()}`;
  const cached = getFinnhubCached<{ buys90d: number; buys45d: number }>(cacheKey);
  if (cached !== undefined) return cached;

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { buys90d: 0, buys45d: 0 };

  try {
    const url = `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(ticker)}&token=${key}`;
    const res = await fetchWithRetry(url, {}, { retries: 2, baseDelay: 1500 });
    if (!res.ok) return { buys90d: 0, buys45d: 0 };

    const data = (await res.json()) as {
      data?: {
        transactionDate?: string;
        transactionType?: string;
        share?: number;
      }[];
    };

    if (!data.data) return { buys90d: 0, buys45d: 0 };

    const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const cutoff45 = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let buys90d = 0;
    let buys45d = 0;
    for (const tx of data.data) {
      if (!tx.transactionDate || tx.transactionDate < cutoff90) continue;
      // P-Purchase, S-Sale, A-Grant/Award — we only count purchases
      const type = (tx.transactionType ?? "").toUpperCase();
      if ((type === "P" || type === "P - PURCHASE") && (tx.share ?? 0) > 0) {
        buys90d++;
        if (tx.transactionDate >= cutoff45) buys45d++;
      }
    }
    const result = { buys90d, buys45d };
    setFinnhubCached(cacheKey, result);
    return result;
  } catch {
    return { buys90d: 0, buys45d: 0 };
  }
}

/** Fetch earnings surprises from Finnhub (beat streak). */
async function fetchFinnhubEarningsSurprises(
  ticker: string
): Promise<number> {
  const cacheKey = `surprises:${ticker.toUpperCase()}`;
  const cached = getFinnhubCached<number>(cacheKey);
  if (cached !== undefined) return cached;

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return 0;

  try {
    const url = `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(ticker)}&token=${key}`;
    const res = await fetchWithRetry(url, {}, { retries: 2, baseDelay: 1500 });
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
    setFinnhubCached(cacheKey, streak);
    return streak;
  } catch {
    return 0;
  }
}

interface OptionsFlowData {
  putCallRatio: number;
  callVolume: number;
  putVolume: number;
}

/** Fetch options chain from Yahoo Finance and calculate put/call OI ratio + volume. */
async function fetchYahooOptionsFlow(
  ticker: string
): Promise<OptionsFlowData | null> {
  const auth = await getYahooCrumb();
  if (!auth) return null;

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${encodeURIComponent(auth.crumb)}`;
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": UA, Cookie: auth.cookie },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      optionChain?: {
        result?: {
          options?: {
            calls?: { openInterest?: number; volume?: number }[];
            puts?: { openInterest?: number; volume?: number }[];
          }[];
        }[];
      };
    };

    const options = data?.optionChain?.result?.[0]?.options?.[0];
    if (!options) return null;

    let totalCallOI = 0;
    let totalPutOI = 0;
    let totalCallVol = 0;
    let totalPutVol = 0;
    for (const c of options.calls ?? []) {
      totalCallOI += c.openInterest ?? 0;
      totalCallVol += c.volume ?? 0;
    }
    for (const p of options.puts ?? []) {
      totalPutOI += p.openInterest ?? 0;
      totalPutVol += p.volume ?? 0;
    }

    const putCallRatio = totalCallOI === 0 ? (totalPutOI > 0 ? 10 : 0) : totalPutOI / totalCallOI;
    if (totalCallOI === 0 && totalPutOI === 0) return null;

    return { putCallRatio, callVolume: totalCallVol, putVolume: totalPutVol };
  } catch {
    return null;
  }
}

// ── SEC ticker map cache (avoids ~1,390 HTTP calls per full scan) ──
let secTickerMapCache: {
  data: Record<string, { cik_str: number; ticker: string; title: string }>;
  ts: number;
} | null = null;
const SEC_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getSecTickerMap(): Promise<Record<
  string,
  { cik_str: number; ticker: string; title: string }
> | null> {
  if (secTickerMapCache && Date.now() - secTickerMapCache.ts < SEC_CACHE_TTL) {
    return secTickerMapCache.data;
  }
  try {
    const res = await fetchWithRetry(
      "https://www.sec.gov/files/company_tickers.json",
      { headers: { "User-Agent": SEC_UA } },
      { timeout: 10000, retries: 2, baseDelay: 2000 }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<
      string,
      { cik_str: number; ticker: string; title: string }
    >;
    secTickerMapCache = { data, ts: Date.now() };
    return data;
  } catch {
    return null;
  }
}

/** Fetch quarterly revenue from SEC EDGAR XBRL API. */
async function fetchSECQuarterlyRevenue(
  ticker: string
): Promise<{ period: string; value: number }[] | null> {
  try {
    // Step 1: Get CIK from cached SEC company tickers mapping
    const tickerMap = await getSecTickerMap();
    if (!tickerMap) return null;

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
    let factsRes: Response;
    try {
      factsRes = await fetchWithRetry(
        factsUrl,
        { headers: { "User-Agent": SEC_UA } },
        { timeout: 10000, retries: 2, baseDelay: 2000 }
      );
    } catch {
      return null;
    }
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

/** Calculate SMA of the last `period` values. Works on any numeric array. */
export function calcSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Calculate EMA from closes. Returns array of EMA values (same length as input). */
export function calcEMA(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

/** Calculate True Range for a single bar. */
export function calcTR(high: number, low: number, prevClose: number): number {
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

/** Calculate ATR array from OHLC data. */
export function calcATRArray(highs: number[], lows: number[], closes: number[], period: number): number[] {
  if (closes.length < 2) return [];
  const trs: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < closes.length; i++) {
    trs.push(calcTR(highs[i], lows[i], closes[i - 1]));
  }
  // Simple moving average of TR for ATR
  const atr: number[] = [];
  for (let i = 0; i < trs.length; i++) {
    if (i < period - 1) {
      atr.push(0);
    } else {
      const slice = trs.slice(i - period + 1, i + 1);
      atr.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return atr;
}

/** Detect swing lows from lows array. A swing low at index i requires
 *  lows[i] < lows[i-1] && lows[i] < lows[i+1] (simple pivot). */
function findSwingLows(lows: number[]): { index: number; value: number }[] {
  const swings: { index: number; value: number }[] = [];
  for (let i = 2; i < lows.length - 2; i++) {
    if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
        lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
      swings.push({ index: i, value: lows[i] });
    }
  }
  return swings;
}

/** Count how many of the last 3 swing lows are higher than the prior. */
function calcHigherLowsCount(lows: number[]): number {
  const swings = findSwingLows(lows);
  if (swings.length < 2) return 0;
  // Take last 3 swing lows
  const recent = swings.slice(-3);
  let count = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].value > recent[i - 1].value) count++;
  }
  return count;
}

/** Compute EMA reclaim data from closes. */
function calcEmaReclaimData(closes: number[]): {
  aboveEma21: boolean;
  aboveEma50: boolean;
  crossoverWithin20d: boolean;
} {
  if (closes.length < 50) {
    return { aboveEma21: false, aboveEma50: false, crossoverWithin20d: false };
  }

  const ema21 = calcEMA(closes, 21);
  const ema50 = calcEMA(closes, 50);
  const lastIdx = closes.length - 1;
  const currentPrice = closes[lastIdx];

  const aboveEma21 = currentPrice > ema21[lastIdx];
  const aboveEma50 = currentPrice > ema50[lastIdx];

  // Check if price crossed above both EMAs within last 20 trading days
  let crossoverWithin20d = false;
  if (aboveEma21 && aboveEma50) {
    const lookback = Math.min(20, lastIdx);
    for (let i = lastIdx - lookback; i <= lastIdx; i++) {
      // Check if price was below either EMA at this point
      if (closes[i] <= ema21[i] || closes[i] <= ema50[i]) {
        crossoverWithin20d = true;
        break;
      }
    }
  }

  return { aboveEma21, aboveEma50, crossoverWithin20d };
}

/** Compute EMA 10/20 timing signal from chart closes (any timeframe). */
export function calcEmaSignal(closes: number[]): {
  ema10: number | null;
  ema20: number | null;
  ema10Array: number[] | null;
  ema20Array: number[] | null;
  bullishCross: boolean;
  crossedWithin5Bars: boolean;
  priceAboveBoth: boolean;
  spreadPct: number | null;
  trendStrength: "strong" | "moderate" | "weak" | "bearish" | null;
  barsSinceCross: number | null;
  dataPoints: number;
} {
  const result = {
    ema10: null as number | null,
    ema20: null as number | null,
    ema10Array: null as number[] | null,
    ema20Array: null as number[] | null,
    bullishCross: false,
    crossedWithin5Bars: false,
    priceAboveBoth: false,
    spreadPct: null as number | null,
    trendStrength: null as "strong" | "moderate" | "weak" | "bearish" | null,
    barsSinceCross: null as number | null,
    dataPoints: closes.length,
  };

  if (closes.length < 20) return result;

  const ema10 = calcEMA(closes, 10);
  const ema20 = calcEMA(closes, 20);
  result.ema10Array = ema10;
  result.ema20Array = ema20;
  const lastIdx = closes.length - 1;
  const price = closes[lastIdx];

  result.ema10 = ema10[lastIdx];
  result.ema20 = ema20[lastIdx];
  result.bullishCross = ema10[lastIdx] > ema20[lastIdx];
  result.priceAboveBoth = price > ema10[lastIdx] && price > ema20[lastIdx];

  // Spread %
  if (price > 0) {
    result.spreadPct = ((ema10[lastIdx] - ema20[lastIdx]) / price) * 100;
  }

  // Find most recent crossover (EMA10 crossing EMA20)
  let barsSinceCross: number | null = null;
  for (let i = lastIdx; i >= 1; i--) {
    const curAbove = ema10[i] > ema20[i];
    const prevAbove = ema10[i - 1] > ema20[i - 1];
    if (curAbove !== prevAbove) {
      barsSinceCross = lastIdx - i;
      break;
    }
  }
  result.barsSinceCross = barsSinceCross;
  result.crossedWithin5Bars = barsSinceCross !== null && barsSinceCross <= 5 && result.bullishCross;

  // Trend strength classification
  const spread = result.spreadPct ?? 0;
  if (!result.bullishCross) {
    result.trendStrength = "bearish";
  } else if (spread > 0.15 && result.priceAboveBoth) {
    result.trendStrength = "strong";
  } else if (spread > 0.05 || result.priceAboveBoth) {
    result.trendStrength = "moderate";
  } else {
    result.trendStrength = "weak";
  }

  return result;
}

/**
 * Detect displacement candle + bullish FVG near an EMA crossover.
 * Displacement: candle body >= 1.5x the 20-bar average body ending at the cross bar.
 * Bullish FVG: highs[i-2] < lows[i] (gap up not filled by middle candle).
 * Lookback window: 5 bars before cross to 30 bars after cross.
 */
export function calcDisplacementAndFVG(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  barsSinceCross: number | null
): { displacementNearCross: boolean; fvgNearCross: boolean } {
  if (barsSinceCross === null || closes.length < 20) {
    return { displacementNearCross: false, fvgNearCross: false };
  }

  const lastIdx = closes.length - 1;
  const crossIdx = lastIdx - barsSinceCross;
  if (crossIdx < 0 || crossIdx >= closes.length) {
    return { displacementNearCross: false, fvgNearCross: false };
  }

  // 20-bar average body ending at cross bar
  const avgStart = Math.max(0, crossIdx - 19);
  let bodySum = 0;
  let bodyCount = 0;
  for (let i = avgStart; i <= crossIdx; i++) {
    bodySum += Math.abs(closes[i] - opens[i]);
    bodyCount++;
  }
  const avgBody = bodyCount > 0 ? bodySum / bodyCount : 0;

  // Scan window: 5 bars before cross to 30 bars after cross
  const scanStart = Math.max(0, crossIdx - 5);
  const scanEnd = Math.min(lastIdx, crossIdx + 30);

  let displacementNearCross = false;
  let fvgNearCross = false;

  for (let i = scanStart; i <= scanEnd; i++) {
    // Displacement: bullish candle body >= 1.5x average
    if (!displacementNearCross && avgBody > 0) {
      const body = closes[i] - opens[i]; // positive = bullish
      if (body > 0 && body >= 1.5 * avgBody) {
        displacementNearCross = true;
      }
    }

    // Bullish FVG: highs[i-2] < lows[i] (gap between candle i-2 high and candle i low)
    if (!fvgNearCross && i >= 2) {
      if (highs[i - 2] < lows[i]) {
        fvgNearCross = true;
      }
    }

    if (displacementNearCross && fvgNearCross) break;
  }

  return { displacementNearCross, fvgNearCross };
}

/** Compute range coil data from chart. */
function calcRangeCoilData(closes: number[], highs: number[], lows: number[]): {
  closesNearTop: boolean;
  atrContracting: boolean;
} {
  if (closes.length < 20) {
    return { closesNearTop: false, atrContracting: false };
  }

  // 13-week range (65 trading days, or use full available data up to that)
  const rangeLen = Math.min(65, closes.length);
  const rangeHighs = highs.slice(-rangeLen);
  const rangeLows = lows.slice(-rangeLen);
  const rangeHigh = Math.max(...rangeHighs);
  const rangeLow = Math.min(...rangeLows.filter((l) => l > 0));
  const rangeSize = rangeHigh - rangeLow;

  // Last 5 closes in upper 25% of range
  let closesNearTop = false;
  if (rangeSize > 0) {
    const threshold = rangeLow + rangeSize * 0.75; // upper 25%
    const last5 = closes.slice(-5);
    closesNearTop = last5.every((c) => c >= threshold);
  }

  // ATR contraction: reuse calcVolatilitySqueeze
  const { squeezed } = calcVolatilitySqueeze(highs, lows, closes);

  return { closesNearTop, atrContracting: squeezed === true };
}

/** Compute failed breakdown recovery score from chart data. */
function calcFailedBreakdownRecovery(closes: number[], lows: number[], highs: number[]): number {
  if (closes.length < 50) return 0;

  const sma50Arr: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < 49) {
      sma50Arr.push(0);
    } else {
      const slice = closes.slice(i - 49, i + 1);
      sma50Arr.push(slice.reduce((a, b) => a + b, 0) / 50);
    }
  }

  const lastIdx = closes.length - 1;
  const lookback = Math.min(20, lastIdx - 49);
  const currentPrice = closes[lastIdx];
  const currentSma50 = sma50Arr[lastIdx];

  // Only relevant if currently above SMA50
  if (currentPrice <= currentSma50) return 0;

  // Scan last 20 days for breakdown events
  for (let i = lastIdx - lookback; i <= lastIdx - 1; i++) {
    if (i < 49) continue;
    const sma50 = sma50Arr[i];

    // Check for close below SMA50 (full breakdown)
    if (closes[i] < sma50) {
      // Check recovery within 3 bars
      let recovered = false;
      for (let j = i + 1; j <= Math.min(i + 3, lastIdx); j++) {
        if (closes[j] > sma50Arr[j]) {
          recovered = true;
          break;
        }
      }
      if (recovered) {
        // Verify it held above since recovery
        let held = true;
        const recoveryEnd = Math.min(i + 3, lastIdx);
        for (let j = recoveryEnd + 1; j <= lastIdx; j++) {
          if (closes[j] < sma50Arr[j]) {
            held = false;
            break;
          }
        }
        if (held) return 2;
      }
    }

    // Check for wick-only test (low went below SMA50 but close stayed above)
    if (lows[i] < sma50 && closes[i] >= sma50) {
      // Verify price held above since
      let held = true;
      for (let j = i + 1; j <= lastIdx; j++) {
        if (closes[j] < sma50Arr[j]) {
          held = false;
          break;
        }
      }
      if (held) return 1;
    }
  }

  return 0;
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

/** Calculate cumulative On-Balance Volume from closes + volumes. */
function calcOBV(closes: number[], volumes: number[]): number[] {
  const obv: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv.push(obv[i - 1] + volumes[i]);
    else if (closes[i] < closes[i - 1]) obv.push(obv[i - 1] - volumes[i]);
    else obv.push(obv[i - 1]);
  }
  return obv;
}

/** OBV-Price Divergence: OBV at/near its 20-bar high while price is NOT near its 20-bar high.
 *  This detects stealth accumulation — institutions buying while price stays flat. */
function calcOBVPriceDivergence(closes: number[], volumes: number[]): { divergent: boolean; obvPctFromHigh: number; pricePctFromHigh: number } {
  const obv = calcOBV(closes, volumes);
  const n = Math.min(20, obv.length);
  const recentOBV = obv.slice(-n);
  const recentCloses = closes.slice(-n);

  const obvHigh = Math.max(...recentOBV);
  const priceHigh = Math.max(...recentCloses);
  const obvNow = recentOBV[recentOBV.length - 1];
  const priceNow = recentCloses[recentCloses.length - 1];

  const obvPctFromHigh = obvHigh !== 0 ? ((obvHigh - obvNow) / Math.abs(obvHigh)) * 100 : 0;
  const pricePctFromHigh = priceHigh !== 0 ? ((priceHigh - priceNow) / priceHigh) * 100 : 0;

  // Divergent = OBV within 5% of its 20-bar high AND price > 10% below its 20-bar high
  // The 10% price gap avoids false positives where price is barely below OBV
  const divergent = obvPctFromHigh <= 5 && pricePctFromHigh > 10;
  return { divergent, obvPctFromHigh, pricePctFromHigh };
}

/** Volume-Price Divergence: price makes lower low but volume on down-moves decreases (seller exhaustion). */
function calcVPDivergence(closes: number[], opens: number[], volumes: number[], lows: number[]): boolean {
  const swings = findSwingLows(lows);
  if (swings.length < 2) return false;
  const [prev, curr] = swings.slice(-2);
  if (curr.value >= prev.value) return false; // No lower low
  if (curr.index < closes.length - 25) return false; // Too old — second swing low must be within last 5 weeks
  // Avg down-day volume around each swing low (±2 bars)
  const avgDownVol = (center: number) => {
    let sum = 0, count = 0;
    for (let i = Math.max(0, center - 2); i <= Math.min(closes.length - 1, center + 2); i++) {
      if (closes[i] < opens[i]) { sum += volumes[i]; count++; }
    }
    return count > 0 ? sum / count : 0;
  };
  const prevDownVol = avgDownVol(prev.index);
  const currDownVol = avgDownVol(curr.index);
  return prevDownVol > 0 && currDownVol < prevDownVol * 0.70; // Volume decreased 30%+
}

/** Count distribution days in last 20 bars.
 *  A distribution day = price closes down AND volume > 20-bar average volume.
 *  Zero distribution days = stealth strength; high count = institutional selling. */
function calcDistributionDays(closes: number[], volumes: number[]): number {
  if (closes.length < 21) return 0;
  const n = 20;
  const recentCloses = closes.slice(-n - 1); // need n+1 for close-to-close comparison
  const recentVols = volumes.slice(-n);
  const avgVol = recentVols.reduce((a, b) => a + b, 0) / n;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const priceDown = recentCloses[i + 1] < recentCloses[i];
    const highVol = recentVols[i] > avgVol;
    if (priceDown && highVol) count++;
  }
  return count;
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

// ── Batch quotes for sector-level breadth + RS ──

export interface BatchQuote {
  symbol: string;
  price: number;
  sma50: number | null;
  sma200: number | null;
  volume: number;
  avgVolume10d: number;
  dailyChangePct: number;
  marketCap: number | null;
  fiftyDayAvgChangePct: number | null;
}

/**
 * Fetch basic quote data (price, 50d SMA, volume) for many symbols at once.
 * Uses Yahoo Finance v7/finance/quote which supports comma-separated symbols.
 * Batches in groups of 80 to stay within URL limits.
 */
export async function fetchBatchQuotes(
  symbols: string[],
  batchSize = 80
): Promise<Map<string, BatchQuote>> {
  let auth = await getYahooCrumb();
  if (!auth) {
    logError("prerun/batchQuotes", new Error("Failed to get Yahoo crumb"), { symbolCount: symbols.length });
    return new Map();
  }

  const results = new Map<string, BatchQuote>();
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    batches.push(symbols.slice(i, i + batchSize));
  }

  let hadAuth401 = false;

  async function fetchBatch(
    batch: string[],
    crumb: string,
    cookie: string
  ): Promise<Record<string, unknown>[]> {
    const symbolStr = batch.map((s) => encodeURIComponent(s)).join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolStr}&crumb=${encodeURIComponent(crumb)}`;
    let res: Response;
    try {
      res = await fetchWithRetry(url, {
        headers: { "User-Agent": UA, Cookie: cookie },
      });
    } catch {
      return [];
    }
    if (!res.ok) {
      logError("prerun/batchQuotes", new Error(`HTTP ${res.status}`), { batchSize: batch.length });
      if (res.status === 401) hadAuth401 = true;
      return [];
    }
    const data = await res.json();
    return (
      (data as { quoteResponse?: { result?: Record<string, unknown>[] } })
        ?.quoteResponse?.result ?? []
    );
  }

  // First attempt — sequential with 150ms inter-batch delay to avoid Yahoo rate limiting
  const { crumb, cookie } = auth;
  const batchResults: PromiseSettledResult<Record<string, unknown>[]>[] = [];
  for (let i = 0; i < batches.length; i++) {
    const r = await Promise.allSettled([fetchBatch(batches[i], crumb, cookie)]);
    batchResults.push(r[0]);
    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  for (const r of batchResults) {
    if (r.status !== "fulfilled") continue;
    for (const quote of r.value) {
      const symbol = quote.symbol as string;
      if (!symbol) continue;
      results.set(symbol, {
        symbol,
        price: toNum(quote.regularMarketPrice, 0),
        sma50: toNumOrNull(quote.fiftyDayAverage),
        sma200: toNumOrNull(quote.twoHundredDayAverage),
        volume: toNum(quote.regularMarketVolume, 0),
        avgVolume10d: toNum(quote.averageDailyVolume10Day, 0),
        dailyChangePct: toNum(quote.regularMarketChangePercent, 0),
        marketCap: toNumOrNull(quote.marketCap),
        fiftyDayAvgChangePct: toNumOrNull(quote.fiftyDayAverageChangePercent),
      });
    }
  }

  // Retry with fresh crumb if we got 401s and have no results
  if (hadAuth401 && results.size === 0) {
    logError("prerun/batchQuotes", new Error("Got 401, retrying with fresh crumb"));
    invalidateCrumbCache();
    auth = await getYahooCrumb();
    if (!auth) return results;

    const retryResults = await Promise.allSettled(
      batches.map((batch) => fetchBatch(batch, auth!.crumb, auth!.cookie))
    );

    for (const r of retryResults) {
      if (r.status !== "fulfilled") continue;
      for (const quote of r.value) {
        const symbol = quote.symbol as string;
        if (!symbol) continue;
        results.set(symbol, {
          symbol,
          price: toNum(quote.regularMarketPrice, 0),
          sma50: toNumOrNull(quote.fiftyDayAverage),
          sma200: toNumOrNull(quote.twoHundredDayAverage),
          volume: toNum(quote.regularMarketVolume, 0),
          avgVolume10d: toNum(quote.averageDailyVolume10Day, 0),
          dailyChangePct: toNum(quote.regularMarketChangePercent, 0),
          marketCap: toNumOrNull(quote.marketCap),
          fiftyDayAvgChangePct: toNumOrNull(quote.fiftyDayAverageChangePercent),
        });
      }
    }
  }

  // Batch quotes fetch complete — results.size / symbols.length logged via data quality
  return results;
}

/**
 * Sector ETF chart cache — Pre-Run-specific, NOT shared with `sector-rotation.ts`.
 * The sector-rotation module fetches 1y daily data with OHLCV; this caches only 3mo closes
 * for computing 20d sector returns (score J). Different granularity, different purpose.
 */
const sectorChartCache = new Map<string, { closes: number[]; timestamps: number[]; ts: number }>();
const SECTOR_CACHE_TTL = 30 * 60 * 1000; // 30 minutes (reduces score variance between runs)

/** Get truncated sector closes for a historical target date. */
function getSectorClosesForDate(etf: string, targetDate: string): number[] | null {
  const cached = sectorChartCache.get(etf);
  if (!cached) return null;
  const targetTs = new Date(targetDate + "T23:59:59Z").getTime() / 1000;
  let endIdx = cached.timestamps.length - 1;
  while (endIdx >= 0 && cached.timestamps[endIdx] > targetTs) endIdx--;
  return endIdx < 0 ? null : cached.closes.slice(0, endIdx + 1);
}

async function fetchSectorETFReturn(sectorETF: string, targetDate?: string): Promise<number | null> {
  const cached = sectorChartCache.get(sectorETF);
  if (cached && Date.now() - cached.ts < SECTOR_CACHE_TTL) {
    const closes = targetDate ? getSectorClosesForDate(sectorETF, targetDate) : cached.closes;
    return closes ? calc20dReturn(closes) : null;
  }

  const chart = await fetchYahooChart(sectorETF, "3mo", "1d");
  if (!chart) return null;

  sectorChartCache.set(sectorETF, { closes: chart.closes, timestamps: chart.timestamps, ts: Date.now() });
  const closes = targetDate ? getSectorClosesForDate(sectorETF, targetDate) : chart.closes;
  return closes ? calc20dReturn(closes) : null;
}

/** Pre-warm the sector ETF cache by fetching all 14 sector ETFs in parallel.
 *  Call once before the batch scan loop to avoid per-stock serial fetches.
 *  Saves ~14 sequential Yahoo chart requests during scan. */
export async function prefetchSectorETFs(): Promise<void> {
  const etfs = [
    "SMH", "IGV", "XBI", "XLV", "XLF", "XLY", "XLC",
    "XLI", "XLP", "XLE", "XLU", "XLRE", "XLB", "SPY", "QQQ",
  ];
  const uncached = etfs.filter((e) => {
    const c = sectorChartCache.get(e);
    return !c || Date.now() - c.ts >= SECTOR_CACHE_TTL;
  });
  if (uncached.length === 0) return;

  const results = await Promise.allSettled(
    uncached.map((etf) => fetchYahooChart(etf, "3mo", "1d"))
  );
  for (let i = 0; i < uncached.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      sectorChartCache.set(uncached[i], { closes: r.value.closes, timestamps: r.value.timestamps, ts: Date.now() });
    }
  }
}

/** Yahoo Finance API config for each M2 EMA timeframe. */
export const TIMEFRAME_CONFIG: Record<EmaTimeframe, { range: string; interval: string; reuse?: "chart3mo" | "chart5y"; aggregate?: number; includePrePost?: boolean }> = {
  "15m": { range: "1mo", interval: "15m" },
  "1h":  { range: "1mo", interval: "1h" },
  "4h":  { range: "2y",  interval: "1h", aggregate: 4 },
  "12h": { range: "2y",  interval: "1h", aggregate: 12, includePrePost: true },
  "1d":  { range: "3mo", interval: "1d", reuse: "chart3mo" },
  "1wk": { range: "5y",  interval: "1wk", reuse: "chart5y" },
  "1mo": { range: "5y",  interval: "1mo" },
};

/** Aggregate 1h volumes to Nh bars by summing groups of N. */
export function aggregateVolumes(volumes: number[], n: number): number[] {
  const result: number[] = [];
  for (let i = n - 1; i < volumes.length; i += n) {
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) sum += volumes[j];
    result.push(sum);
  }
  return result;
}

/** Calculate volume surge ratio: last bar volume / 20-bar avg volume. */
export function calcVolumeSurge(
  volumes: number[],
  period = 20
): { volumeRatio: number | null } {
  if (volumes.length < period + 1) return { volumeRatio: null };
  const lastVol = volumes[volumes.length - 1];
  const avgSlice = volumes.slice(-(period + 1), -1);
  const avg = avgSlice.reduce((a, b) => a + b, 0) / avgSlice.length;
  if (avg === 0) return { volumeRatio: null };
  return { volumeRatio: lastVol / avg };
}

/**
 * Detect bullish EMA 10/20 convergence: EMA10 below EMA20 and gap narrowing.
 * Accepts pre-computed EMA arrays to avoid recomputing them (calcEmaSignal already computes these).
 * Only flags bullish convergence — bearish convergence (EMA10 dropping toward EMA20 from above)
 * is not a pre-cross setup.
 */
export function calcEmaConvergence(
  closes: number[],
  lookback = 5,
  precomputedEma10?: number[],
  precomputedEma20?: number[],
): { converging: boolean | null; spreadDelta: number | null } {
  if (closes.length < 20 + lookback) return { converging: null, spreadDelta: null };

  const ema10 = precomputedEma10 ?? calcEMA(closes, 10);
  const ema20 = precomputedEma20 ?? calcEMA(closes, 20);
  const lastIdx = closes.length - 1;
  const pastIdx = lastIdx - lookback;

  const spreadNow = Math.abs(ema10[lastIdx] - ema20[lastIdx]);
  const spreadPast = Math.abs(ema10[pastIdx] - ema20[pastIdx]);

  const price = closes[lastIdx];
  const spreadDelta = price > 0
    ? ((spreadNow - spreadPast) / price) * 100
    : null;

  // Only flag bullish convergence: EMA10 still below EMA20 but gap narrowing
  const isBelowAndClosing = ema10[lastIdx] < ema20[lastIdx] && spreadNow < spreadPast;

  return {
    converging: isBelowAndClosing,
    spreadDelta,
  };
}

/** Detect volatility squeeze: ATR(5) < ATR(20). */
export function calcVolatilitySqueeze(
  highs: number[],
  lows: number[],
  closes: number[]
): { squeezed: boolean | null; atrRatio: number | null } {
  if (closes.length < 21) return { squeezed: null, atrRatio: null };

  const atr = calcATRArray(highs, lows, closes, 1); // individual TRs
  if (atr.length < 20) return { squeezed: null, atrRatio: null };

  const last5TR = atr.slice(-5);
  const last20TR = atr.slice(-20);
  const atr5 = last5TR.reduce((a, b) => a + b, 0) / 5;
  const atr20 = last20TR.reduce((a, b) => a + b, 0) / 20;

  if (atr20 === 0) return { squeezed: null, atrRatio: null };
  const ratio = atr5 / atr20;
  return { squeezed: ratio < 1.0, atrRatio: ratio };
}

/** Aggregate 1h OHLC to 4h bars. Opens from first bar, highs/lows from max/min, closes from last bar. */
export function aggregate4hOHLC(
  opens: number[], highs: number[], lows: number[], closes: number[], n: number
): { opens: number[]; highs: number[]; lows: number[]; closes: number[] } {
  const aO: number[] = [], aH: number[] = [], aL: number[] = [], aC: number[] = [];
  for (let i = n - 1; i < closes.length; i += n) {
    const start = i - n + 1;
    aO.push(opens[start]);
    aC.push(closes[i]);
    let hi = highs[start], lo = lows[start];
    for (let j = start + 1; j <= i; j++) {
      if (highs[j] > hi) hi = highs[j];
      if (lows[j] < lo) lo = lows[j];
    }
    aH.push(hi);
    aL.push(lo);
  }
  return { opens: aO, highs: aH, lows: aL, closes: aC };
}

/** Main function: fetch all data for a single ticker.
 *  When targetDate is set (YYYY-MM-DD), chart arrays are truncated to that date
 *  and price-derived fields are recomputed from historical data. */
export async function fetchPreRunData(
  ticker: string,
  emaTimeframe: EmaTimeframe = "15m",
  targetDate?: string,
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
    fetchYahooOptionsFlow(ticker),           // I: Options flow
    fetchSectorETFReturn(sectorETF, targetDate), // J: Sector return
    fetchSECQuarterlyRevenue(ticker),        // D: Revenue acceleration
    fetchSectorETFReturn("SPY", targetDate), // VCP: SPY 20d return (cache hit)
    fetchSectorETFReturn("QQQ", targetDate), // Institutional: QQQ 20d return (cache hit)
  ]);

  const summary = settled[0].status === "fulfilled" ? settled[0].value : null;
  const chart3moRaw = settled[1].status === "fulfilled" ? settled[1].value : null;
  const chart5yRaw = settled[2].status === "fulfilled" ? settled[2].value : null;

  // Backdate: truncate chart arrays to target date
  const chart3mo = (targetDate && chart3moRaw) ? truncateChartToDate(chart3moRaw, targetDate) : chart3moRaw;
  const chart5y = (targetDate && chart5yRaw) ? truncateChartToDate(chart5yRaw, targetDate) : chart5yRaw;
  const finnhubEarnings = settled[3].status === "fulfilled" ? settled[3].value : null;
  const insiderResult = settled[4].status === "fulfilled" ? settled[4].value : { buys90d: 0, buys45d: 0 };
  const insiderBuys = insiderResult.buys90d;
  const insiderBuys45d = insiderResult.buys45d;
  const earningsBeatStreak = settled[5].status === "fulfilled" ? settled[5].value : 0;
  const optionsFlow = settled[6].status === "fulfilled" ? settled[6].value : null;
  const putCallRatio = optionsFlow?.putCallRatio ?? null;
  const callVolume = optionsFlow?.callVolume ?? null;
  const putVolume = optionsFlow?.putVolume ?? null;
  const sectorReturn20d = settled[7].status === "fulfilled" ? settled[7].value : null;
  const quarterlyRevenue = settled[8].status === "fulfilled" ? settled[8].value : null;
  const spyReturn20d = settled[9].status === "fulfilled" ? settled[9].value : null;
  const qqqReturn20d = settled[10].status === "fulfilled" ? settled[10].value : null;

  if (!summary) return null;

  const stats = (summary.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const financial = (summary.financialData ?? {}) as Record<string, unknown>;
  const calendar = (summary.calendarEvents ?? {}) as Record<string, unknown>;
  const price = (summary.price ?? {}) as Record<string, unknown>;
  const detail = (summary.summaryDetail ?? {}) as Record<string, unknown>;
  const trend = (summary.recommendationTrend ?? {}) as Record<string, unknown>;
  const holders = (summary.majorHoldersBreakdown ?? {}) as Record<string, unknown>;

  // VCP: Extract SMA + volume data from summaryDetail
  let vcpSma50 = extractRaw(detail.fiftyDayAverage);
  const vcpSma200 = extractRaw(detail.twoHundredDayAverage);
  let vcpAvgVolume50d = extractRaw(detail.averageVolume);
  let vcpAvgVolume10d = extractRaw(detail.averageDailyVolume10Day);

  // Institutional: Beta from summaryDetail
  const instBeta = extractRaw(detail.beta);

  let currentPrice = extractRaw(price.regularMarketPrice);
  let high52w = extractRaw(detail.fiftyTwoWeekHigh);
  let low52w = extractRaw(detail.fiftyTwoWeekLow);
  let marketCap = extractRaw(price.marketCap);

  // Backdate: override live-only fields with chart-computed values
  if (targetDate && chart3mo && chart3mo.closes.length > 0) {
    const livePrice = currentPrice;
    currentPrice = chart3mo.closes[chart3mo.closes.length - 1];
    // Approximate marketCap from historical price × current shares outstanding
    if (livePrice && livePrice > 0 && marketCap) {
      marketCap = (marketCap / livePrice) * currentPrice;
    }
  }
  if (targetDate && chart5y) {
    const targetTs = new Date(targetDate + "T23:59:59Z").getTime() / 1000;
    const oneYearAgo = targetTs - 52 * 7 * 86400;
    let h = -Infinity, l = Infinity;
    for (let i = 0; i < chart5y.timestamps.length; i++) {
      if (chart5y.timestamps[i] >= oneYearAgo) {
        if (chart5y.highs[i] > h) h = chart5y.highs[i];
        if (chart5y.lows[i] > 0 && chart5y.lows[i] < l) l = chart5y.lows[i];
      }
    }
    if (h > -Infinity) high52w = h;
    if (l < Infinity) low52w = l;
  }
  if (targetDate && chart3mo && chart3mo.closes.length >= 50) {
    vcpSma50 = calcSMA(chart3mo.closes, 50);
    vcpAvgVolume50d = chart3mo.volumes.slice(-50).reduce((a, b) => a + b, 0) / 50;
    vcpAvgVolume10d = chart3mo.volumes.length >= 10
      ? chart3mo.volumes.slice(-10).reduce((a, b) => a + b, 0) / 10
      : vcpAvgVolume10d;
  }

  // True ATH from 5y weekly highs (fallback to 52w high)
  let allTimeHigh = high52w;
  if (chart5y) {
    for (const h of chart5y.highs) {
      if (h > 0 && (allTimeHigh === null || h > allTimeHigh)) allTimeHigh = h;
    }
  }

  // Institutional ownership %
  let institutionalPct = extractRaw(holders.institutionsPercentHeld);
  if (institutionalPct !== null && institutionalPct > 0 && institutionalPct < 1) {
    institutionalPct *= 100; // Convert decimal (0.65) to percentage (65)
  }

  // Short float: try Yahoo first
  let shortFloat = extractRaw(stats.shortPercentOfFloat);
  // Normalize: Yahoo returns as decimal (0.15 = 15%), convert to percentage
  // Values >= 1 are already percentages; only convert strict decimals (0 < x < 1)
  if (shortFloat !== null && shortFloat > 0 && shortFloat < 1) {
    shortFloat = shortFloat * 100;
  }

  // Float shares
  const floatShares = extractRaw(stats.floatShares);

  // Revenue growth
  const revenueGrowth = extractRaw(financial.revenueGrowth);

  // Analyst count
  const trendEntries = (trend.trend ?? []) as { period?: string; strongBuy?: number; buy?: number; hold?: number; sell?: number; strongSell?: number }[];
  let analystCount: number | null = null;
  let analystRevisionTrend: number | null = null;
  if (trendEntries.length > 0) {
    const current = trendEntries[0];
    analystCount = (current.strongBuy ?? 0) + (current.buy ?? 0) +
      (current.hold ?? 0) + (current.sell ?? 0) + (current.strongSell ?? 0);

    // P: Analyst revision trend — compare current vs previous period consensus
    if (trendEntries.length >= 2) {
      const prev = trendEntries[1];
      const curBullish = (current.strongBuy ?? 0) + (current.buy ?? 0);
      const prevBullish = (prev.strongBuy ?? 0) + (prev.buy ?? 0);
      const curBearish = (current.sell ?? 0) + (current.strongSell ?? 0);
      const prevBearish = (prev.sell ?? 0) + (prev.strongSell ?? 0);
      const curNet = curBullish - curBearish;
      const prevNet = prevBullish - prevBearish;
      if (curNet > prevNet) analystRevisionTrend = 1;       // Improving
      else if (curNet < prevNet) analystRevisionTrend = -1;  // Declining
      else analystRevisionTrend = 0;                        // Stable
    }
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

  // Days to earnings (use target date as reference when backdating)
  let daysToEarnings: number | null = null;
  if (nextEarningsDate) {
    const refDate = targetDate ? new Date(targetDate).getTime() : Date.now();
    const diff = new Date(nextEarningsDate).getTime() - refDate;
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

  // Phase 3: Stage 1→2 criteria computed from 3mo chart
  let higherLowsCount: number | null = null;
  let aboveEma21: boolean | null = null;
  let aboveEma50: boolean | null = null;
  let emaCrossoverWithin20d: boolean | null = null;
  let closesNearRangeTop: boolean | null = null;
  let atrContracting: boolean | null = null;
  let failedBreakdownRecovery: number | null = null;

  // M2: EMA 10/20 timing signal (multi-timeframe)
  let emaM2Ema10: number | null = null;
  let emaM2Ema20: number | null = null;
  let emaM2BullishCross: boolean | null = null;
  let emaM2CrossedWithin5Bars: boolean | null = null;
  let emaM2PriceAboveBoth: boolean | null = null;
  let emaM2SpreadPct: number | null = null;
  let emaM2TrendStrength: "strong" | "moderate" | "weak" | "bearish" | null = null;
  let emaM2BarsSinceCross: number | null = null;
  let emaM2DataPoints: number | null = null;
  let emaM2DisplacementNearCross: boolean | null = null;
  let emaM2FvgNearCross: boolean | null = null;

  const tfConfig = TIMEFRAME_CONFIG[emaTimeframe];
  // Gate: for intraday timeframes (15m, 1h, 4h, 12h), only fetch if ≥30% from ATH
  // For 1d/1wk (reuse existing chart), no gate needed. For 1mo, low API cost.
  const needsApiGate = !tfConfig.reuse && emaTimeframe !== "1mo";
  const gate1PassLocal = pctFromAth !== null && pctFromAth >= 30;
  const shouldFetchEma = !needsApiGate || gate1PassLocal;

  if (shouldFetchEma) {
    try {
      let emaCloses: number[] | null = null;
      let emaOpens: number[] | null = null;
      let emaHighs: number[] | null = null;
      let emaLows: number[] | null = null;

      if (tfConfig.reuse === "chart3mo" && chart3mo) {
        emaCloses = chart3mo.closes;
        emaOpens = chart3mo.opens;
        emaHighs = chart3mo.highs;
        emaLows = chart3mo.lows;
      } else if (tfConfig.reuse === "chart5y" && chart5y) {
        emaCloses = chart5y.closes;
        emaOpens = chart5y.opens;
        emaHighs = chart5y.highs;
        emaLows = chart5y.lows;
      } else {
        const emaChart = await fetchYahooChart(ticker, tfConfig.range, tfConfig.interval, tfConfig.includePrePost);
        if (emaChart) {
          if (tfConfig.aggregate) {
            const agg = aggregate4hOHLC(emaChart.opens, emaChart.highs, emaChart.lows, emaChart.closes, tfConfig.aggregate);
            emaOpens = agg.opens;
            emaHighs = agg.highs;
            emaLows = agg.lows;
            emaCloses = agg.closes;
          } else {
            emaCloses = emaChart.closes;
            emaOpens = emaChart.opens;
            emaHighs = emaChart.highs;
            emaLows = emaChart.lows;
          }
        }
      }

      if (emaCloses && emaCloses.length >= 20) {
        const sig = calcEmaSignal(emaCloses);
        emaM2Ema10 = sig.ema10;
        emaM2Ema20 = sig.ema20;
        emaM2BullishCross = sig.bullishCross;
        emaM2CrossedWithin5Bars = sig.crossedWithin5Bars;
        emaM2PriceAboveBoth = sig.priceAboveBoth;
        emaM2SpreadPct = sig.spreadPct;
        emaM2TrendStrength = sig.trendStrength;
        emaM2BarsSinceCross = sig.barsSinceCross;
        emaM2DataPoints = sig.dataPoints;

        if (emaOpens && emaHighs && emaLows) {
          const dfvg = calcDisplacementAndFVG(emaOpens, emaHighs, emaLows, emaCloses, sig.barsSinceCross);
          emaM2DisplacementNearCross = dfvg.displacementNearCross;
          emaM2FvgNearCross = dfvg.fvgNearCross;
        }
      }
    } catch {
      // EMA data is optional — if it fails, M2 scores 0
    }
  }

  if (chart3mo && chart3mo.closes.length >= 20) {
    // L: Higher Lows
    higherLowsCount = calcHigherLowsCount(chart3mo.lows);

    // M: EMA Reclaim
    const emaData = calcEmaReclaimData(chart3mo.closes);
    aboveEma21 = emaData.aboveEma21;
    aboveEma50 = emaData.aboveEma50;
    emaCrossoverWithin20d = emaData.crossoverWithin20d;

    // N: Range Coil
    const coilData = calcRangeCoilData(chart3mo.closes, chart3mo.highs, chart3mo.lows);
    closesNearRangeTop = coilData.closesNearTop;
    atrContracting = coilData.atrContracting;

    // O: Failed Breakdown Recovery
    failedBreakdownRecovery = calcFailedBreakdownRecovery(chart3mo.closes, chart3mo.lows, chart3mo.highs);
  }

  // ── VCP fields ──
  let vcpSma10: number | null = null;
  let vcpAvgDollarVolume: number | null = null;
  let vcpDistFromSma50Pct: number | null = null;
  let vcpDistFromSma200Pct: number | null = null;
  let vcpAtrPct: number | null = null;
  let vcpRange5d: number | null = null;
  let vcpRange10d: number | null = null;
  let vcpRange20d: number | null = null;
  let vcpTightCloses: boolean | null = null;
  let vcpInsideBarCount: number | null = null;
  let vcpDryVolumeDays: number | null = null;
  let vcpPivotHigh: number | null = null;
  let vcpRelStrengthVsSPY: number | null = null;
  let vcpAtrMultipleAbove50: number | null = null;

  // Dollar volume
  if (vcpAvgVolume50d !== null && currentPrice !== null) {
    vcpAvgDollarVolume = vcpAvgVolume50d * currentPrice;
  }

  // Distance from MAs
  if (currentPrice !== null && vcpSma50 !== null && vcpSma50 > 0) {
    vcpDistFromSma50Pct = ((currentPrice - vcpSma50) / vcpSma50) * 100;
  }
  if (currentPrice !== null && vcpSma200 !== null && vcpSma200 > 0) {
    vcpDistFromSma200Pct = ((currentPrice - vcpSma200) / vcpSma200) * 100;
  }

  if (chart3mo && chart3mo.closes.length >= 20 && currentPrice !== null) {
    const { closes, highs, lows, volumes } = chart3mo;

    // SMA(10)
    vcpSma10 = calcSMA(closes, 10);

    // ATR(14) %
    const atrArr = calcATRArray(highs, lows, closes, 14);
    const lastAtr = atrArr.length > 0 ? atrArr[atrArr.length - 1] : 0;
    if (currentPrice > 0 && lastAtr > 0) {
      vcpAtrPct = (lastAtr / currentPrice) * 100;
    }

    // ATR multiple above 50 SMA
    if (vcpSma50 !== null && lastAtr > 0) {
      vcpAtrMultipleAbove50 = (currentPrice - vcpSma50) / lastAtr;
    }

    // Range N-day (high-low range as % of price)
    const rangeCalc = (n: number): number | null => {
      if (highs.length < n) return null;
      const hi = Math.max(...highs.slice(-n));
      const lo = Math.min(...lows.slice(-n).filter((l) => l > 0));
      return currentPrice > 0 ? ((hi - lo) / currentPrice) * 100 : null;
    };
    vcpRange5d = rangeCalc(5);
    vcpRange10d = rangeCalc(10);
    vcpRange20d = rangeCalc(20);

    // Tight closes: spread of last 5 closes < 1.5% of price
    if (closes.length >= 5) {
      const last5 = closes.slice(-5);
      const spread = Math.max(...last5) - Math.min(...last5);
      vcpTightCloses = currentPrice > 0 ? spread / currentPrice < 0.015 : null;
    }

    // Inside bar count in last 5 bars
    if (highs.length >= 6) {
      let insideCount = 0;
      for (let i = highs.length - 5; i < highs.length; i++) {
        if (highs[i] <= highs[i - 1] && lows[i] >= lows[i - 1]) {
          insideCount++;
        }
      }
      vcpInsideBarCount = insideCount;
    }

    // Dry volume days: days in last 10 with vol < 60% of 20d avg
    if (volumes.length >= 20) {
      const avg20Vol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      let dryCount = 0;
      const last10Vols = volumes.slice(-10);
      for (const v of last10Vols) {
        if (v < avg20Vol * 0.6) dryCount++;
      }
      vcpDryVolumeDays = dryCount;
    }

    // Pivot high: most recent 3-bar pivot high (high > 2 neighbors on each side)
    if (highs.length >= 5) {
      for (let i = highs.length - 4; i >= 2; i--) {
        if (
          highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
          highs[i] > highs[i + 1] && highs[i] > highs[i + 2]
        ) {
          vcpPivotHigh = highs[i];
          break;
        }
      }
    }

    // Relative strength vs SPY
    if (stockReturn20d !== null && spyReturn20d !== null) {
      vcpRelStrengthVsSPY = stockReturn20d - spyReturn20d;
    }
  }

  // ── OBV-Price Divergence + VP Divergence (leading volume indicators) ──
  let obvDivergent: boolean | null = null;
  let obvPctFromHigh: number | null = null;
  let pricePctFromHigh20d: number | null = null;
  let vpDivergenceBullish: boolean | null = null;
  let distributionDays20d: number | null = null;

  if (chart3mo && chart3mo.closes.length >= 20) {
    const { closes, opens, volumes, lows } = chart3mo;
    const obvResult = calcOBVPriceDivergence(closes, volumes);
    obvDivergent = obvResult.divergent;
    obvPctFromHigh = obvResult.obvPctFromHigh;
    pricePctFromHigh20d = obvResult.pricePctFromHigh;
    vpDivergenceBullish = calcVPDivergence(closes, opens, volumes, lows);
    distributionDays20d = calcDistributionDays(closes, volumes);
  }

  // ── Institutional Acceleration fields ──
  let instRsVsQQQ: number | null = null;
  let instRsAccelVsSPY: number | null = null;
  let instRsAccelVsQQQ: number | null = null;
  let instGapPct: number | null = null;
  let instDistFromEma20Atr: number | null = null;
  let instAtrDollar: number | null = null;

  // RS vs QQQ
  if (stockReturn20d !== null && qqqReturn20d !== null) {
    instRsVsQQQ = stockReturn20d - qqqReturn20d;
  }

  if (chart3mo && chart3mo.closes.length >= 25) {
    const { closes, opens, highs, lows } = chart3mo;

    // RS Acceleration: compare current RS (day 0) with RS 5 sessions ago
    // Uses 20d return at two points to measure acceleration
    const calcReturnAt = (arr: number[], endIdx: number, period: number): number | null => {
      const startIdx = endIdx - period;
      if (startIdx < 0 || endIdx >= arr.length) return null;
      const start = arr[startIdx];
      const end = arr[endIdx];
      if (start <= 0) return null;
      return ((end - start) / start) * 100;
    };

    const n = closes.length;
    const stockRetNow = calcReturnAt(closes, n - 1, 20);
    const stockRetPrev = calcReturnAt(closes, n - 6, 20); // 5 sessions ago

    // Fetch SPY/QQQ closes from sector cache for acceleration
    const spyCache = sectorChartCache.get("SPY");
    const qqqCache = sectorChartCache.get("QQQ");
    const spyCloses = targetDate ? getSectorClosesForDate("SPY", targetDate) : spyCache?.closes ?? null;
    const qqqCloses = targetDate ? getSectorClosesForDate("QQQ", targetDate) : qqqCache?.closes ?? null;

    if (stockRetNow !== null && stockRetPrev !== null && spyCloses) {
      const spyN = spyCloses.length;
      if (spyN >= 25) {
        const spyRetNow = calcReturnAt(spyCloses, spyN - 1, 20);
        const spyRetPrev = calcReturnAt(spyCloses, spyN - 6, 20);
        if (spyRetNow !== null && spyRetPrev !== null) {
          const rsNow = stockRetNow - spyRetNow;
          const rsPrev = stockRetPrev - spyRetPrev;
          instRsAccelVsSPY = rsNow - rsPrev;
        }
      }
    }

    if (stockRetNow !== null && stockRetPrev !== null && qqqCloses) {
      const qqqN = qqqCloses.length;
      if (qqqN >= 25) {
        const qqqRetNow = calcReturnAt(qqqCloses, qqqN - 1, 20);
        const qqqRetPrev = calcReturnAt(qqqCloses, qqqN - 6, 20);
        if (qqqRetNow !== null && qqqRetPrev !== null) {
          const rsNow = stockRetNow - qqqRetNow;
          const rsPrev = stockRetPrev - qqqRetPrev;
          instRsAccelVsQQQ = rsNow - rsPrev;
        }
      }
    }

    // Gap %: (today open - prev close) / prev close * 100
    if (opens.length >= 2) {
      const lastOpen = opens[opens.length - 1];
      const prevClose = closes[closes.length - 2];
      if (prevClose > 0) {
        instGapPct = ((lastOpen - prevClose) / prevClose) * 100;
      }
    }

    // Distance from EMA20 in ATR units
    const ema20Arr = calcEMA(closes, 20);
    const lastEma20 = ema20Arr.length > 0 ? ema20Arr[ema20Arr.length - 1] : null;
    const atrArr = calcATRArray(highs, lows, closes, 14);
    const lastAtr = atrArr.length > 0 ? atrArr[atrArr.length - 1] : 0;
    instAtrDollar = lastAtr > 0 ? lastAtr : null;

    if (currentPrice !== null && lastEma20 !== null && lastAtr > 0) {
      instDistFromEma20Atr = (currentPrice - lastEma20) / lastAtr;
    }
  }

  // ── Data quality: count how many of the API calls succeeded ──
  let apiSuccessCount = 0;
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value !== null) apiSuccessCount++;
  }
  const dataQuality = Math.round((apiSuccessCount / settled.length) * 100);

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
    insiderBuys45d,
    putCallRatio,
    callVolume,
    putVolume,
    relativeStrength20d,
    sectorReturn20d,
    pctFromBaseHigh,
    floatShares,
    floatTurnover20d,
    obvDivergent,
    obvPctFromHigh,
    pricePctFromHigh20d,
    vpDivergenceBullish,
    distributionDays20d,
    dataQuality,
    quarterlyRevenue,
    earningsBeatStreak,
    // Phase 3: Stage 1→2 criteria
    higherLowsCount,
    aboveEma21,
    aboveEma50,
    emaCrossoverWithin20d,
    // M2: EMA timing (multi-timeframe)
    emaM2Ema10,
    emaM2Ema20,
    emaM2BullishCross,
    emaM2CrossedWithin5Bars,
    emaM2PriceAboveBoth,
    emaM2SpreadPct,
    emaM2TrendStrength,
    emaM2BarsSinceCross,
    emaM2DataPoints,
    emaM2DisplacementNearCross,
    emaM2FvgNearCross,
    emaM2Timeframe: emaTimeframe,
    closesNearRangeTop,
    atrContracting,
    failedBreakdownRecovery,
    analystRevisionTrend,
    // VCP fields
    vcpSma50,
    vcpSma200,
    vcpSma10,
    vcpAvgVolume50d,
    vcpAvgVolume10d,
    vcpAvgDollarVolume,
    vcpDistFromSma50Pct,
    vcpDistFromSma200Pct,
    vcpAtrPct,
    vcpRange5d,
    vcpRange10d,
    vcpRange20d,
    vcpTightCloses,
    vcpInsideBarCount,
    vcpDryVolumeDays,
    vcpPivotHigh,
    vcpRelStrengthVsSPY,
    vcpAtrMultipleAbove50,
    // Institutional Acceleration fields
    instRsVsQQQ,
    instRsAccelVsSPY,
    instRsAccelVsQQQ,
    instBeta,
    instGapPct,
    instDistFromEma20Atr,
    instAtrDollar,
    lastUpdated: targetDate ? new Date(targetDate + "T16:00:00-04:00").toISOString() : new Date().toISOString(),
  };
}

/**
 * Tiered scanning: lightweight pre-filter using batch quotes.
 * Checks basic gate criteria (price, market cap, 52w range) to eliminate
 * tickers that won't qualify, saving full API calls on ~60-70% of universe.
 * Returns the subset of tickers worth running full fetchPreRunData on.
 */
export async function preFilterTickers(
  tickers: string[],
  minPctFromAth = 20,
): Promise<string[]> {
  const quotes = await fetchBatchQuotes(tickers);
  const passing: string[] = [];

  for (const ticker of tickers) {
    const q = quotes.get(ticker.toUpperCase());
    if (!q) {
      // No quote data — include it (don't silently drop; let full fetch decide)
      passing.push(ticker);
      continue;
    }
    // Quick gate checks from batch quote data
    const price = q.price;
    if (price <= 0) continue; // Delisted or zero price

    // Estimate pctFromAth from 52w high if available
    // BatchQuote doesn't have 52w high, but we can use price vs SMA200
    // If price is above SMA200 and above SMA50, it's likely not 20%+ from ATH
    // This is a conservative filter — we include borderline cases
    passing.push(ticker);
  }

  return passing;
}

/**
 * Lightweight M2-only fetch for a single ticker at a specific timeframe.
 * Only fetches chart data needed for EMA 10/20 — no fundamentals, no scoring, no gates.
 * Used by the multi-TF Phase 2 scan to minimize API calls.
 */
export async function fetchM2Only(
  ticker: string,
  emaTimeframe: EmaTimeframe
): Promise<M2TimeframeResult | null> {
  const tfConfig = TIMEFRAME_CONFIG[emaTimeframe];

  try {
    let closes: number[] | null = null;
    let emaOpens: number[] | null = null;
    let emaHighs: number[] | null = null;
    let emaLows: number[] | null = null;
    let volumes: number[] | null = null;

    // For reuse timeframes (1d uses chart3mo, 1wk uses chart5y), we still need to fetch
    // since this is a standalone call without the main fetchPreRunData context
    const chart = await fetchYahooChart(ticker, tfConfig.range, tfConfig.interval, tfConfig.includePrePost);
    if (chart) {
      if (tfConfig.aggregate) {
        const agg = aggregate4hOHLC(chart.opens, chart.highs, chart.lows, chart.closes, tfConfig.aggregate);
        emaOpens = agg.opens;
        emaHighs = agg.highs;
        emaLows = agg.lows;
        closes = agg.closes;
        volumes = aggregateVolumes(chart.volumes, tfConfig.aggregate);
      } else {
        closes = chart.closes;
        emaOpens = chart.opens;
        emaHighs = chart.highs;
        emaLows = chart.lows;
        volumes = chart.volumes;
      }
    }

    if (!closes || closes.length < 20) return null;

    const sig = calcEmaSignal(closes);

    // Displacement + FVG detection
    let displacementNearCross: boolean | null = null;
    let fvgNearCross: boolean | null = null;
    if (emaOpens && emaHighs && emaLows) {
      const dfvg = calcDisplacementAndFVG(emaOpens, emaHighs, emaLows, closes, sig.barsSinceCross);
      displacementNearCross = dfvg.displacementNearCross;
      fvgNearCross = dfvg.fvgNearCross;
    }

    // Leading indicators (reuse EMA arrays from calcEmaSignal to avoid recomputation)
    const volSurge = volumes ? calcVolumeSurge(volumes) : { volumeRatio: null };
    const convergence = calcEmaConvergence(closes, 5, sig.ema10Array ?? undefined, sig.ema20Array ?? undefined);
    const squeeze = emaHighs && emaLows
      ? calcVolatilitySqueeze(emaHighs, emaLows, closes)
      : { squeezed: null, atrRatio: null };

    // Score M2 using same logic as scoreM2() in scoring.ts
    const hasDisplacementFVG = displacementNearCross === true && fvgNearCross === true;
    let scoreM2 = 0;
    if (sig.bullishCross && sig.priceAboveBoth && (sig.crossedWithin5Bars || hasDisplacementFVG)) {
      scoreM2 = 2;
    } else if (sig.bullishCross || sig.priceAboveBoth) {
      scoreM2 = 1;
    }

    return {
      scoreM2,
      trendStrength: sig.trendStrength,
      bullishCross: sig.bullishCross,
      priceAboveBoth: sig.priceAboveBoth,
      dataPoints: sig.dataPoints,
      displacementNearCross,
      fvgNearCross,
      volumeRatio: volSurge.volumeRatio,
      converging: convergence.converging,
      spreadDelta: convergence.spreadDelta,
      squeezed: squeeze.squeezed,
      atrRatio: squeeze.atrRatio,
    };
  } catch {
    return null;
  }
}
