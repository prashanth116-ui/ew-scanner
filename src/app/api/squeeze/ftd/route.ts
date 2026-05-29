/**
 * API route for FTD T+35 calendar data.
 * GET: Fetch upcoming FTD settlements for tickers or all tracked.
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { fetchUpcomingFTDs, fetchFTDsForTickers } from "@/lib/supabase/query";

export async function GET(request: NextRequest) {
  const rl = rateLimit(`squeeze-ftd:${getClientKey(request)}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  try {
    const { searchParams } = new URL(request.url);
    const tickers = searchParams.get("tickers");
    const days = parseInt(searchParams.get("days") ?? "14", 10);

    let ftds;
    if (tickers) {
      const tickerList = tickers.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
      ftds = await fetchFTDsForTickers(tickerList, days);
    } else {
      ftds = await fetchUpcomingFTDs(days);
    }

    // Group by week
    const weeks = new Map<string, typeof ftds>();
    for (const ftd of ftds) {
      const date = new Date(ftd.settlement_deadline);
      const day = date.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(date);
      monday.setDate(monday.getDate() + diff);
      const weekKey = monday.toISOString().slice(0, 10);

      if (!weeks.has(weekKey)) weeks.set(weekKey, []);
      weeks.get(weekKey)!.push(ftd);
    }

    const calendar = Array.from(weeks.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, entries]) => ({
        weekStart,
        entries,
        totalShares: entries.reduce((sum, e) => sum + e.ftd_shares, 0),
      }));

    return NextResponse.json({ calendar, total: ftds.length });
  } catch (err) {
    logError("api/squeeze/ftd", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
