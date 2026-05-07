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

/** Retry wrapper: retries on timeout/5xx with exponential backoff. */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { timeout = 15000, retries = 2, baseDelay = 1000 } = {}
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeout);
      // Retry on 429 (rate limit) and 5xx (server errors)
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
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
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      headers: { "User-Agent": UA, Cookie: auth.cookie },
    });
  } catch {
    return null;
  }
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
    const res = await fetchWithRetry(url, {}, { retries: 2, baseDelay: 1500 });
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
    const res = await fetchWithRetry(url, {}, { retries: 2, baseDelay: 1500 });
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
    const res = await fetchWithRetry(url, {
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
    let tickerMapRes: Response;
    try {
      tickerMapRes = await fetchWithRetry(
        "https://www.sec.gov/files/company_tickers.json",
        { headers: { "User-Agent": SEC_UA } },
        { timeout: 10000, retries: 2, baseDelay: 2000 }
      );
    } catch {
      return null;
    }
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

/** Calculate SMA from closes. */
export function calcSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Calculate EMA from closes. Returns array of EMA values (same length as input). */
function calcEMA(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

/** Calculate True Range for a single bar. */
function calcTR(high: number, low: number, prevClose: number): number {
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

/** Calculate ATR array from OHLC data. */
function calcATRArray(highs: number[], lows: number[], closes: number[], period: number): number[] {
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

  // ATR contraction: 5-day ATR < 20-day ATR
  const atrFull = calcATRArray(highs, lows, closes, 1); // individual TRs
  let atrContracting = false;
  if (atrFull.length >= 20) {
    const last5TR = atrFull.slice(-5);
    const last20TR = atrFull.slice(-20);
    const atr5 = last5TR.reduce((a, b) => a + b, 0) / 5;
    const atr20 = last20TR.reduce((a, b) => a + b, 0) / 20;
    atrContracting = atr5 < atr20;
  }

  return { closesNearTop, atrContracting };
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
  volume: number;
  avgVolume10d: number;
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
    console.error("[fetchBatchQuotes] Failed to get Yahoo crumb — returning empty");
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
      console.error(`[fetchBatchQuotes] HTTP ${res.status} for batch of ${batch.length} symbols`);
      if (res.status === 401) hadAuth401 = true;
      return [];
    }
    const data = await res.json();
    return (
      (data as { quoteResponse?: { result?: Record<string, unknown>[] } })
        ?.quoteResponse?.result ?? []
    );
  }

  // First attempt
  const { crumb, cookie } = auth;
  const batchResults = await Promise.allSettled(
    batches.map((batch) => fetchBatch(batch, crumb, cookie))
  );

  for (const r of batchResults) {
    if (r.status !== "fulfilled") continue;
    for (const quote of r.value) {
      const symbol = quote.symbol as string;
      if (!symbol) continue;
      results.set(symbol, {
        symbol,
        price: (quote.regularMarketPrice as number) ?? 0,
        sma50: (quote.fiftyDayAverage as number) ?? null,
        volume: (quote.regularMarketVolume as number) ?? 0,
        avgVolume10d: (quote.averageDailyVolume10Day as number) ?? 0,
      });
    }
  }

  // Retry with fresh crumb if we got 401s and have no results
  if (hadAuth401 && results.size === 0) {
    console.warn("[fetchBatchQuotes] Got 401, retrying with fresh crumb...");
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
          price: (quote.regularMarketPrice as number) ?? 0,
          sma50: (quote.fiftyDayAverage as number) ?? null,
          volume: (quote.regularMarketVolume as number) ?? 0,
          avgVolume10d: (quote.averageDailyVolume10Day as number) ?? 0,
        });
      }
    }
  }

  console.log(`[fetchBatchQuotes] Fetched ${results.size}/${symbols.length} stock quotes`);
  return results;
}

// ── Sector ETF chart cache (shared across tickers in same scan) ──

const sectorChartCache = new Map<string, { closes: number[]; ts: number }>();
const SECTOR_CACHE_TTL = 30 * 60 * 1000; // 30 minutes (reduces score variance between runs)

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

  // Phase 3: Stage 1→2 criteria computed from 3mo chart
  let higherLowsCount: number | null = null;
  let aboveEma21: boolean | null = null;
  let aboveEma50: boolean | null = null;
  let emaCrossoverWithin20d: boolean | null = null;
  let closesNearRangeTop: boolean | null = null;
  let atrContracting: boolean | null = null;
  let failedBreakdownRecovery: number | null = null;

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
    // Phase 3: Stage 1→2 criteria
    higherLowsCount,
    aboveEma21,
    aboveEma50,
    emaCrossoverWithin20d,
    closesNearRangeTop,
    atrContracting,
    failedBreakdownRecovery,
    lastUpdated: new Date().toISOString(),
  };
}
