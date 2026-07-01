import { NextRequest, NextResponse } from "next/server";
import {
  loadPreRunDaily,
  loadPreRunDailyDates,
  loadPreRunDailyMulti,
} from "@/lib/supabase/persistence";

const PRESET_FLAG_MAP: Record<string, string> = {
  sndk: "is_sndk",
  early_mover: "is_early_mover",
  pullback: "is_pullback",
  leading: "is_leading",
  stealth: "is_stealth",
  early_plus: "is_early_plus",
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // GET ?dates=true → return available scan dates
  if (searchParams.get("dates") === "true") {
    const dates = await loadPreRunDailyDates(14);
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

  const preset = searchParams.get("preset");
  const flagKey = preset ? PRESET_FLAG_MAP[preset] : null;

  let results = await loadPreRunDaily(date);

  // Filter by preset flag if specified
  if (flagKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    results = results.filter((r) => (r as any)[flagKey] === true);
  }

  // Load all available dates to compute streaks + deltas
  const allDates = await loadPreRunDailyDates(14);
  const currentIdx = allDates.indexOf(date);
  const prevDate = currentIdx >= 0 && currentIdx < allDates.length - 1 ? allDates[currentIdx + 1] : null;

  // Load multi-day data for streak computation
  const datesForStreaks = allDates.slice(currentIdx);
  const multiDayRows = await loadPreRunDailyMulti(datesForStreaks);

  // Build lookup: date → ticker → row (for O(1) access)
  const rowByDateTicker = new Map<string, Map<string, (typeof multiDayRows)[number]>>();
  for (const r of multiDayRows) {
    let tickerMap = rowByDateTicker.get(r.scan_date);
    if (!tickerMap) {
      tickerMap = new Map();
      rowByDateTicker.set(r.scan_date, tickerMap);
    }
    tickerMap.set(r.ticker, r);
  }

  // Build per-ticker streak: consecutive days appearing (ending at selected date)
  const streaks: Record<string, number> = {};
  const currentTickers = new Set(results.map((r) => r.ticker));
  for (const ticker of currentTickers) {
    let streak = 0;
    for (const d of datesForStreaks) {
      const row = rowByDateTicker.get(d)?.get(ticker);
      if (row) {
        // If preset filter active, check that the ticker qualified for this preset on that date
        if (flagKey) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((row as any)[flagKey] === true) {
            streak++;
          } else {
            break;
          }
        } else {
          streak++;
        }
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
        prevScores.set(r.ticker, r.final_score);
      }
    }
    for (const r of results) {
      const prev = prevScores.get(r.ticker);
      if (prev !== undefined) {
        deltas[r.ticker] = r.final_score - prev;
      }
    }
  }

  // Build "dropped" list: tickers in previous day but not in selected date
  const dropped: Array<{ ticker: string; prev_score: number }> = [];
  if (prevDate) {
    for (const r of multiDayRows) {
      if (r.scan_date === prevDate && !currentTickers.has(r.ticker)) {
        // If preset filter active, only show dropped tickers that qualified for the preset yesterday
        if (flagKey) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((r as any)[flagKey] !== true) continue;
        }
        dropped.push({ ticker: r.ticker, prev_score: r.final_score });
      }
    }
    dropped.sort((a, b) => b.prev_score - a.prev_score);
  }

  return NextResponse.json({
    date,
    preset: preset ?? null,
    count: results.length,
    results,
    streaks,
    deltas,
    dropped,
  });
}
