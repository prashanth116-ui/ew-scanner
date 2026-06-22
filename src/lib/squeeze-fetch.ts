/**
 * Direct Yahoo Finance squeeze data fetcher.
 * SERVER-ONLY: Used by /api/squeeze and /api/squeeze-alert.
 */

import "server-only";

import type { SqueezeData } from "./ew-types";
import { extractRaw } from "@/lib/yahoo-utils";

const YAHOO_SUMMARY =
  "https://query1.finance.yahoo.com/v10/finance/quoteSummary";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── Yahoo Crumb/Cookie Cache ──
let cachedCrumb: string | null = null;
let cachedCookie: string | null = null;
let crumbFetchedAt = 0;
const CRUMB_TTL = 30 * 60 * 1000; // 30 min

export async function getYahooCrumb(): Promise<{
  crumb: string;
  cookie: string;
} | null> {
  const now = Date.now();
  if (cachedCrumb && cachedCookie && now - crumbFetchedAt < CRUMB_TTL) {
    return { crumb: cachedCrumb, cookie: cachedCookie };
  }

  try {
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });

    const setCookies = cookieRes.headers.getSetCookie?.() ?? [];
    const cookie = setCookies
      .map((c) => c.split(";")[0].trim())
      .join("; ");

    if (!cookie) return null;

    const crumbRes = await fetch(
      "https://query2.finance.yahoo.com/v1/test/getcrumb",
      { headers: { "User-Agent": UA, Cookie: cookie } }
    );

    if (!crumbRes.ok) return null;
    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes("error")) return null;

    cachedCrumb = crumb;
    cachedCookie = cookie;
    crumbFetchedAt = now;

    return { crumb, cookie };
  } catch {
    return null;
  }
}

export function invalidateCrumbCache(): void {
  cachedCrumb = null;
  cachedCookie = null;
  crumbFetchedAt = 0;
}

function parseSqueezeData(
  ticker: string,
  data: Record<string, unknown>
): SqueezeData | null {
  const result = (
    data as { quoteSummary?: { result?: Record<string, unknown>[] } }
  )?.quoteSummary?.result?.[0];

  if (!result) return null;

  const stats = (result.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const price = (result.price ?? {}) as Record<string, unknown>;
  const detail = (result.summaryDetail ?? {}) as Record<string, unknown>;

  return {
    ticker: ticker.toUpperCase(),
    name:
      (price.shortName as string) ??
      (price.longName as string) ??
      ticker.toUpperCase(),
    shortPercentOfFloat: extractRaw(stats.shortPercentOfFloat),
    shortRatio: extractRaw(stats.shortRatio),
    sharesShort: extractRaw(stats.sharesShort),
    floatShares: extractRaw(stats.floatShares),
    sharesOutstanding: extractRaw(stats.sharesOutstanding),
    dateShortInterest: extractRaw(stats.dateShortInterest),
    currentVolume: extractRaw(price.regularMarketVolume),
    avgVolume3Month: extractRaw(price.averageDailyVolume3Month),
    currentPrice: extractRaw(price.regularMarketPrice),
    marketCap: extractRaw(price.marketCap),
    fiftyTwoWeekLow: extractRaw(detail.fiftyTwoWeekLow),
    fiftyTwoWeekHigh: extractRaw(detail.fiftyTwoWeekHigh),
    heldPercentInsiders: extractRaw(stats.heldPercentInsiders),
    heldPercentInstitutions: extractRaw(stats.heldPercentInstitutions),
    sma50: extractRaw(detail.fiftyDayAverage),
  };
}

/** Fetch squeeze data for a single ticker directly from Yahoo Finance. */
export async function fetchSqueezeData(
  ticker: string
): Promise<SqueezeData | null> {
  const auth = await getYahooCrumb();
  if (!auth) return null;

  const url = `${YAHOO_SUMMARY}/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,price,summaryDetail&crumb=${encodeURIComponent(auth.crumb)}`;
  let res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: auth.cookie },
  });

  // If 401, invalidate and retry once
  if (res.status === 401) {
    invalidateCrumbCache();
    const retryAuth = await getYahooCrumb();
    if (!retryAuth) return null;

    const retryUrl = `${YAHOO_SUMMARY}/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,price,summaryDetail&crumb=${encodeURIComponent(retryAuth.crumb)}`;
    res = await fetch(retryUrl, {
      headers: { "User-Agent": UA, Cookie: retryAuth.cookie },
    });
  }

  if (!res.ok) return null;
  const data = await res.json();
  return parseSqueezeData(ticker, data);
}

// ── Bulk FTD Cache ──
let cachedFtdMap: Map<string, number> | null = null;
let ftdCacheTime = 0;
const FTD_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

/**
 * Download the SEC FTD file once and cache it for 24 hours.
 * Returns Map<SYMBOL, totalFtdShares> for all tickers in the file.
 * Returns empty map on failure — never blocks scan.
 */
export async function fetchBulkFTDMap(): Promise<Map<string, number>> {
  if (cachedFtdMap && Date.now() - ftdCacheTime < FTD_CACHE_TTL) return cachedFtdMap;

  const SEC_UA = "EW-Scanner admin@ew-scanner.app";
  const now = new Date();

  const months = [
    { y: now.getFullYear(), m: now.getMonth() + 1 },
    { y: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), m: now.getMonth() === 0 ? 12 : now.getMonth() },
  ];

  for (const { y, m } of months) {
    const half1 = `cnsfails${y}${String(m).padStart(2, "0")}a.txt`;
    const half2 = `cnsfails${y}${String(m).padStart(2, "0")}b.txt`;

    for (const filename of [half2, half1]) {
      try {
        const url = `https://www.sec.gov/files/data/fails-deliver-data/${filename}`;
        const res = await fetch(url, {
          headers: { "User-Agent": SEC_UA },
        });
        if (!res.ok) continue;

        const text = await res.text();
        const map = new Map<string, number>();

        for (const line of text.split("\n")) {
          const fields = line.split("|");
          if (fields.length >= 4) {
            const symbol = fields[2]?.trim().toUpperCase();
            if (!symbol || symbol === "SYMBOL") continue;
            const qty = parseInt(fields[3], 10);
            if (!isNaN(qty) && qty > 0) {
              map.set(symbol, (map.get(symbol) ?? 0) + qty);
            }
          }
        }

        if (map.size > 0) {
          cachedFtdMap = map;
          ftdCacheTime = Date.now();
          return map;
        }
      } catch {
        continue;
      }
    }
  }

  // Return empty map on failure — never blocks scan
  return new Map();
}

/**
 * Fetch SEC Failures-to-Deliver (FTD) share count for a ticker.
 * SEC publishes pipe-delimited text files twice monthly (~2 week lag).
 * Returns total FTD shares across all settlement dates in the file, or null on failure.
 */
export async function fetchSECFtdShares(ticker: string): Promise<number | null> {
  const SEC_UA = "EW-Scanner admin@ew-scanner.app";
  const now = new Date();

  // Try current month first, then previous month (SEC files have ~2 week lag)
  const months = [
    { y: now.getFullYear(), m: now.getMonth() + 1 },
    { y: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), m: now.getMonth() === 0 ? 12 : now.getMonth() },
  ];

  for (const { y, m } of months) {
    const half1 = `cnsfails${y}${String(m).padStart(2, "0")}a.txt`;
    const half2 = `cnsfails${y}${String(m).padStart(2, "0")}b.txt`;

    for (const filename of [half2, half1]) {
      try {
        const url = `https://www.sec.gov/files/data/fails-deliver-data/${filename}`;
        const res = await fetch(url, {
          headers: { "User-Agent": SEC_UA },
        });
        if (!res.ok) continue;

        const text = await res.text();
        const upperTicker = ticker.toUpperCase();
        let totalShares = 0;
        let found = false;

        for (const line of text.split("\n")) {
          const fields = line.split("|");
          // Format: SETTLEMENT DATE|CUSIP|SYMBOL|QUANTITY (FAILS)|DESCRIPTION|PRICE
          if (fields.length >= 4 && fields[2]?.trim().toUpperCase() === upperTicker) {
            const qty = parseInt(fields[3], 10);
            if (!isNaN(qty) && qty > 0) {
              totalShares += qty;
              found = true;
            }
          }
        }

        if (found) return totalShares;
      } catch {
        continue;
      }
    }
  }

  return null;
}
