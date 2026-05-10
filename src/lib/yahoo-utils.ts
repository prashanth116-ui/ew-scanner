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

/** Extract raw numeric value from Yahoo Finance API responses (handles {raw: N} wrapper). */
export function extractRaw(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "object" && "raw" in (val as Record<string, unknown>)) {
    return (val as { raw: number }).raw;
  }
  return null;
}
