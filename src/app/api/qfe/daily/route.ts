import { NextRequest, NextResponse } from "next/server";
import {
  loadQFEDaily,
  loadQFEDailyDates,
  loadQFEDailyMulti,
} from "@/lib/supabase/persistence";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // GET ?dates=true → return available scan dates
  if (searchParams.get("dates") === "true") {
    const dates = await loadQFEDailyDates(14);
    return NextResponse.json({ dates });
  }

  // GET ?date=YYYY-MM-DD → return results for that date
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json(
      { error: "Missing ?date=YYYY-MM-DD or ?dates=true" },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const results = await loadQFEDaily(date);

  // Load all available dates to compute streaks + deltas
  const allDates = await loadQFEDailyDates(14);
  const currentIdx = allDates.indexOf(date);
  const prevDate = currentIdx >= 0 && currentIdx < allDates.length - 1 ? allDates[currentIdx + 1] : null;

  const datesForStreaks = allDates.slice(currentIdx);
  const multiDayRows = await loadQFEDailyMulti(datesForStreaks);

  // Build lookup: date → Set<ticker> for O(1) access
  const tickersByDate = new Map<string, Set<string>>();
  for (const r of multiDayRows) {
    let s = tickersByDate.get(r.scan_date);
    if (!s) {
      s = new Set();
      tickersByDate.set(r.scan_date, s);
    }
    s.add(r.ticker);
  }

  // Build per-ticker streak
  const streaks: Record<string, number> = {};
  const currentTickers = new Set(results.map((r) => r.ticker));
  for (const ticker of currentTickers) {
    let streak = 0;
    for (const d of datesForStreaks) {
      if (tickersByDate.get(d)?.has(ticker)) {
        streak++;
      } else {
        break;
      }
    }
    streaks[ticker] = streak;
  }

  // Build score delta vs previous day
  const deltas: Record<string, number> = {};
  if (prevDate) {
    const prevScores = new Map<string, number>();
    for (const r of multiDayRows) {
      if (r.scan_date === prevDate) {
        prevScores.set(r.ticker, r.qfe_score);
      }
    }
    for (const r of results) {
      const prev = prevScores.get(r.ticker);
      if (prev !== undefined) {
        deltas[r.ticker] = r.qfe_score - prev;
      }
    }
  }

  // Build "dropped" list
  const dropped: Array<{ ticker: string; prev_score: number; prev_rating: string }> = [];
  if (prevDate) {
    for (const r of multiDayRows) {
      if (r.scan_date === prevDate && !currentTickers.has(r.ticker)) {
        dropped.push({ ticker: r.ticker, prev_score: r.qfe_score, prev_rating: r.rating });
      }
    }
    dropped.sort((a, b) => b.prev_score - a.prev_score);
  }

  // Extract market environment detail from first row (same for all rows on a date)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marketEnvDetail = results.length > 0 ? (results[0] as any).market_env_detail ?? null : null;

  return NextResponse.json({
    date,
    count: results.length,
    results,
    streaks,
    deltas,
    dropped,
    marketEnvDetail,
  });
}
