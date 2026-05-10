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
// Short TTL (60s) — prevents duplicate chart fetches when confluence runs
// EW + Pre-Run in parallel for the same ticker (both need 5y weekly chart).
const _chartCache = new Map<string, { data: unknown; ts: number }>();
const CHART_CACHE_TTL = 60_000; // 60 seconds

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

/** Extract raw numeric value from Yahoo Finance API responses (handles {raw: N} wrapper). */
export function extractRaw(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "object" && "raw" in (val as Record<string, unknown>)) {
    return (val as { raw: number }).raw;
  }
  return null;
}
