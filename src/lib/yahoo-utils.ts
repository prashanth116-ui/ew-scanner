/**
 * Shared Yahoo Finance utilities.
 * SERVER-ONLY: Extracted from prerun/data.ts and squeeze-fetch.ts to avoid duplication.
 */

import "server-only";

/** Fetch with an AbortController timeout. */
export function fetchWithTimeout(url: string, init: RequestInit, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/** Retry wrapper: retries on timeout/5xx with exponential backoff. */
export async function fetchWithRetry(
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

// ── Request-scoped Yahoo chart cache ──
// 5-min TTL — keeps chart data warm across all confluence scan batches.
// Chart data (weekly/monthly candles) doesn't change within a scan session.
const _chartCache = new Map<string, { data: unknown; ts: number }>();
const CHART_CACHE_TTL = 1_800_000; // 30 minutes — daily/weekly chart data is stable within this window

/** Cache key for Yahoo chart requests. */
function chartCacheKey(ticker: string, range: string, interval: string): string {
  return `${ticker}:${range}:${interval}`;
}

/** Get cached chart response if fresh. */
export function getCachedChart(ticker: string, range: string, interval: string): unknown | null {
  const key = chartCacheKey(ticker, range, interval);
  const entry = _chartCache.get(key);
  if (entry && Date.now() - entry.ts < CHART_CACHE_TTL) return entry.data;
  if (entry) _chartCache.delete(key);
  return null;
}

/** Store chart response in cache. */
export function setCachedChart(ticker: string, range: string, interval: string, data: unknown): void {
  const key = chartCacheKey(ticker, range, interval);
  _chartCache.set(key, { data, ts: Date.now() });
}

// ── In-flight request deduplication for chart fetches ──
// When multiple scanners request the same chart simultaneously (e.g. EW + PreRun
// both need AAPL:5y:1wk), return the same in-flight Promise instead of firing
// duplicate HTTP requests.
const _pendingCharts = new Map<string, Promise<unknown>>();

/**
 * Deduplicated chart fetch: checks result cache, then in-flight map, then calls fetcher.
 * Prevents duplicate HTTP requests when multiple scanners request the same chart concurrently.
 */
export function deduplicatedChartFetch(
  ticker: string,
  range: string,
  interval: string,
  fetcher: () => Promise<unknown>,
): Promise<unknown> {
  // 1. Check result cache
  const cached = getCachedChart(ticker, range, interval);
  if (cached) return Promise.resolve(cached);

  // 2. Check in-flight requests
  const key = chartCacheKey(ticker, range, interval);
  const pending = _pendingCharts.get(key);
  if (pending) return pending;

  // 3. Start new fetch, store the Promise
  const promise = fetcher()
    .then((data) => {
      if (data != null) {
        setCachedChart(ticker, range, interval, data);
      }
      return data;
    })
    .finally(() => {
      _pendingCharts.delete(key);
    });

  _pendingCharts.set(key, promise);
  return promise;
}

/** Extract raw numeric value from Yahoo Finance API responses (handles {raw: N} wrapper). */
export function extractRaw(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "object" && "raw" in (val as Record<string, unknown>)) {
    return (val as { raw: number }).raw;
  }
  return null;
}
