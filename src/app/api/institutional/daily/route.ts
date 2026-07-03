import { NextRequest, NextResponse } from "next/server";
import {
  loadInstitutionalDaily,
  loadInstitutionalDailyDates,
  loadInstitutionalDailyMulti,
} from "@/lib/supabase/persistence";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // GET ?dates=true → return available scan dates
  if (searchParams.get("dates") === "true") {
    const dates = await loadInstitutionalDailyDates(14);
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

  const results = await loadInstitutionalDaily(date);

  // Load all available dates to compute streaks + deltas
  const allDates = await loadInstitutionalDailyDates(14);
  const currentIdx = allDates.indexOf(date);
  const prevDate = currentIdx >= 0 && currentIdx < allDates.length - 1 ? allDates[currentIdx + 1] : null;

  const datesForStreaks = allDates.slice(currentIdx);
  const multiDayRows = await loadInstitutionalDailyMulti(datesForStreaks);

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
        prevScores.set(r.ticker, r.composite_score);
      }
    }
    for (const r of results) {
      const prev = prevScores.get(r.ticker);
      if (prev !== undefined) {
        deltas[r.ticker] = r.composite_score - prev;
      }
    }
  }

  // Build "dropped" list
  const dropped: Array<{ ticker: string; prev_score: number }> = [];
  if (prevDate) {
    for (const r of multiDayRows) {
      if (r.scan_date === prevDate && !currentTickers.has(r.ticker)) {
        dropped.push({ ticker: r.ticker, prev_score: r.composite_score });
      }
    }
    dropped.sort((a, b) => b.prev_score - a.prev_score);
  }

  return NextResponse.json({
    date,
    count: results.length,
    results,
    streaks,
    deltas,
    dropped,
  }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120" },
  });
}
