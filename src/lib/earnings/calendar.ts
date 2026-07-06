/**
 * Bulk earnings calendar via Finnhub.
 * SERVER-ONLY: Used by /api/earnings/calendar.
 *
 * One API call returns ALL earnings for a date range — no per-ticker iteration.
 * Cached in-memory for 4 hours (earnings dates rarely change intra-day).
 */

import "server-only";

export interface CalendarEntry {
  date: string; // YYYY-MM-DD
  symbol: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  hour: string; // "bmo" | "amc" | "dmh" | ""
  quarter: number | null;
  year: number | null;
}

// ── In-memory cache (4h TTL) ──
const _cache = new Map<string, { data: CalendarEntry[]; ts: number }>();
const CACHE_TTL = 4 * 60 * 60 * 1000;

function getCached(key: string): CalendarEntry[] | null {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  if (entry) _cache.delete(key);
  return null;
}

function setCache(key: string, data: CalendarEntry[]): void {
  _cache.set(key, { data, ts: Date.now() });
  // Evict old entries (keep cache bounded)
  if (_cache.size > 50) {
    const now = Date.now();
    for (const [k, v] of _cache) {
      if (now - v.ts > CACHE_TTL) _cache.delete(k);
    }
  }
}

/**
 * Fetch earnings calendar from Finnhub for a date range.
 * Returns null if FINNHUB_API_KEY is not configured.
 */
export async function fetchEarningsCalendar(
  from: string,
  to: string
): Promise<CalendarEntry[] | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  const cacheKey = `cal:${from}:${to}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${key}`;

  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 14400 } }); // 4h ISR cache
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const data = (await res.json()) as {
    earningsCalendar?: Record<string, unknown>[];
  };

  const entries: CalendarEntry[] = (data.earningsCalendar ?? []).map((e) => ({
    date: (e.date as string) ?? "",
    symbol: (e.symbol as string) ?? "",
    epsEstimate: typeof e.epsEstimate === "number" ? e.epsEstimate : null,
    epsActual: typeof e.epsActual === "number" ? e.epsActual : null,
    revenueEstimate:
      typeof e.revenueEstimate === "number" ? e.revenueEstimate : null,
    revenueActual:
      typeof e.revenueActual === "number" ? e.revenueActual : null,
    hour: (e.hour as string) ?? "",
    quarter: typeof e.quarter === "number" ? e.quarter : null,
    year: typeof e.year === "number" ? e.year : null,
  }));

  // Sort by date, then by hour (bmo first), then by symbol
  entries.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    const hourOrder: Record<string, number> = {
      bmo: 0,
      dmh: 1,
      amc: 2,
      "": 3,
    };
    const h = (hourOrder[a.hour] ?? 3) - (hourOrder[b.hour] ?? 3);
    if (h !== 0) return h;
    return a.symbol.localeCompare(b.symbol);
  });

  setCache(cacheKey, entries);
  return entries;
}
