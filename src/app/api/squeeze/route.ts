import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTicker } from "@/lib/api-utils";
import { fetchSqueezeData, fetchBulkFTDMap } from "@/lib/squeeze/fetch";
import { recordSIHistoryBatch } from "@/lib/supabase/persistence";
import { fetchSITrendBatch } from "@/lib/supabase/query";
import { normalizeSiPercent, computeSITrend } from "@/lib/squeeze/scoring";

export async function GET(request: NextRequest) {
  const rl = rateLimit(`squeeze:${getClientKey(request)}`, 200, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const ticker = validateTicker(request.nextUrl.searchParams.get("ticker"));
  if (!ticker) {
    return NextResponse.json(
      { error: "Invalid or missing ticker" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchSqueezeData(ticker);
    if (!data) {
      return NextResponse.json(
        { error: "No summary data" },
        { status: 404 }
      );
    }

    // Merge FTD data from bulk cache (single SEC download, 24h cache)
    const ftdMap = await fetchBulkFTDMap();
    if (ftdMap.size > 0) {
      data.ftdShares = ftdMap.get(ticker.toUpperCase()) ?? null;
    }

    // Record SI history and fetch trend (fire-and-forget for recording)
    const reportDate = new Date().toISOString().slice(0, 10);
    const siPct = normalizeSiPercent(data.shortPercentOfFloat);
    if (siPct > 0) {
      recordSIHistoryBatch([{
        ticker: data.ticker,
        report_date: reportDate,
        si_percent: siPct,
        days_to_cover: data.shortRatio ?? undefined,
        shares_short: data.sharesShort ?? undefined,
        float_shares: data.floatShares ?? undefined,
        current_price: data.currentPrice ?? undefined,
      }]).catch(() => {/* ignore persistence errors */});
    }

    // Fetch SI trend from history
    try {
      const trends = await fetchSITrendBatch([ticker.toUpperCase()], 3);
      const points = trends[ticker.toUpperCase()] ?? [];
      if (points.length >= 2) {
        const { direction } = computeSITrend(points.map(p => p.si_percent).reverse());
        data.siTrend = direction;
      } else {
        data.siTrend = null;
      }
    } catch {
      data.siTrend = null;
    }

    return NextResponse.json(data);
  } catch (err) {
    logError("api/squeeze", err, { ticker });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 }
    );
  }
}
