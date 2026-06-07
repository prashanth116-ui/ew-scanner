import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { getAllSectorSymbols } from "@/data/sector-universe";
import { upsertInstitutionalCache } from "@/lib/supabase/persistence";
import { fetchWithRetry } from "@/lib/yahoo-utils";

export const maxDuration = 120;

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

async function runRefresh(request: NextRequest) {
  // Simple auth check — require a secret header for cron jobs
  const authHeader = request.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const symbols = getAllSectorSymbols().slice(0, 200); // Top 200 stocks
    const records: { symbol: string; institutional_pct: number | null }[] = [];

    // Batch fetch in groups of 10 to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((sym) => fetchInstitutionalPct(sym))
      );

      for (let j = 0; j < batch.length; j++) {
        const r = results[j];
        records.push({
          symbol: batch[j],
          institutional_pct: r.status === "fulfilled" ? r.value : null,
        });
      }

      // Rate limit: 200ms between batches
      if (i + batchSize < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    const upserted = await upsertInstitutionalCache(records);

    return NextResponse.json({
      success: true,
      processed: records.length,
      upserted,
      withData: records.filter((r) => r.institutional_pct != null).length,
    });
  } catch (err) {
    logError("api/sector-rotation/institutional-refresh", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 500 }
    );
  }
}

async function fetchInstitutionalPct(symbol: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=majorHoldersBreakdown`;
  try {
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": UA },
    }, { timeout: 8000, retries: 1 });

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
