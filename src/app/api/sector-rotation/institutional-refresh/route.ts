import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { getAllSectorSymbols } from "@/data/sector-universe";
import { upsertInstitutionalCache } from "@/lib/supabase/persistence";
import { getYahooCrumb, invalidateCrumbCache } from "@/lib/squeeze-fetch";
import { fetchWithRetry } from "@/lib/yahoo-utils";

export const maxDuration = 300;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Weekly cron endpoint to refresh institutional ownership cache.
 * Fetches quoteSummary for top stocks and upserts into Supabase.
 * Trigger: Vercel cron (GET) or manual POST.
 */
export async function GET(request: NextRequest) {
  return runRefresh(request);
}

export async function POST(request: NextRequest) {
  return runRefresh(request);
}

async function runRefresh(_request: NextRequest) {
  try {
    // Get Yahoo crumb + cookie for authenticated requests
    let auth = await getYahooCrumb();
    if (!auth) {
      return NextResponse.json(
        { error: "Failed to obtain Yahoo session" },
        { status: 502 }
      );
    }

    const symbols = getAllSectorSymbols(); // All ~1400 stocks
    const records: { symbol: string; institutional_pct: number | null }[] = [];
    let authFailures = 0;

    // Batch fetch in groups of 10 with 200ms delay
    const batchSize = 10;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((sym) => fetchInstitutionalPct(sym, auth!.crumb, auth!.cookie))
      );

      for (let j = 0; j < batch.length; j++) {
        const r = results[j];
        if (r.status === "fulfilled") {
          if (r.value === "AUTH_FAIL") {
            authFailures++;
            records.push({ symbol: batch[j], institutional_pct: null });
          } else {
            records.push({ symbol: batch[j], institutional_pct: r.value });
          }
        } else {
          records.push({ symbol: batch[j], institutional_pct: null });
        }
      }

      // If too many auth failures, refresh crumb and retry
      if (authFailures >= 3 && i < symbols.length / 2) {
        invalidateCrumbCache();
        const freshAuth = await getYahooCrumb();
        if (freshAuth) {
          auth = freshAuth;
          authFailures = 0;
        }
      }

      // Rate limit: 200ms between batches
      if (i + batchSize < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    const withData = records.filter((r) => r.institutional_pct != null);
    const upserted = withData.length > 0 ? await upsertInstitutionalCache(records) : 0;

    return NextResponse.json({
      success: true,
      processed: records.length,
      upserted,
      withData: withData.length,
    });
  } catch (err) {
    logError("api/sector-rotation/institutional-refresh", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 500 }
    );
  }
}

async function fetchInstitutionalPct(
  symbol: string,
  crumb: string,
  cookie: string
): Promise<number | null | "AUTH_FAIL"> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=majorHoldersBreakdown&crumb=${encodeURIComponent(crumb)}`;
  try {
    const res = await fetchWithRetry(
      url,
      { headers: { "User-Agent": UA, Cookie: cookie } },
      { timeout: 8000, retries: 1 }
    );

    if (res.status === 401) return "AUTH_FAIL";
    if (!res.ok) return null;

    const data = await res.json();
    const breakdown =
      data?.quoteSummary?.result?.[0]?.majorHoldersBreakdown;
    if (!breakdown) return null;

    const pct = breakdown.institutionsPercentHeld?.raw;
    return typeof pct === "number" ? Math.round(pct * 10000) / 100 : null;
  } catch {
    return null;
  }
}
