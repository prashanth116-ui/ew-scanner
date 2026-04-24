/**
 * Direct Yahoo Finance squeeze data fetcher.
 * SERVER-ONLY: Used by /api/squeeze and /api/squeeze-alert.
 */

import "server-only";

import type { SqueezeData } from "./ew-types";

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

function extractRaw(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "object" && "raw" in (val as Record<string, unknown>)) {
    return (val as { raw: number }).raw;
  }
  return null;
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
