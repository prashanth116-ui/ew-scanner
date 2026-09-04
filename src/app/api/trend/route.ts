import { NextRequest, NextResponse } from "next/server";
import {
  loadComponentTrend,
  loadInflectionDailyDates,
  loadTransitionDailyDates,
  type TrendRow,
} from "@/lib/supabase/persistence";

/** Upper bound on the window. The scan tables purge at 14 days, so asking for more
 *  returns the same rows while widening the query for nothing. */
const MAX_DAYS = 14;

export interface TrendMatrixRow {
  ticker: string;
  sector: string | null;
  /** Price on the most recent date in the window that carries a row. */
  price: number;
  /** How many of the window's dates carry a row. Absence is data, so it is reported. */
  present: number;
  /** Keyed by scan_date. A missing key means the scanner produced no row that day. */
  byDate: Record<string, { se: number; dmd: number; ovr: number; label: string }>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const engineParam = searchParams.get("engine") ?? "inflection";
  if (engineParam !== "inflection" && engineParam !== "transition") {
    return NextResponse.json(
      { error: "Invalid ?engine — use inflection or transition" },
      { status: 400 },
    );
  }
  const engine = engineParam;

  const rawDays = Number(searchParams.get("days") ?? "7");
  const days = Number.isFinite(rawDays)
    ? Math.min(Math.max(Math.trunc(rawDays), 2), MAX_DAYS)
    : 7;

  const allDates =
    engine === "inflection"
      ? await loadInflectionDailyDates(MAX_DAYS)
      : await loadTransitionDailyDates(MAX_DAYS);

  // loadDates returns newest-first. Take the most recent `days`, then present
  // oldest-first so the matrix reads left-to-right in time.
  const dates = allDates.slice(0, days).reverse();
  if (dates.length === 0) {
    return NextResponse.json({ engine, dates: [], rows: [] });
  }

  const rows: TrendRow[] = await loadComponentTrend(engine, dates);

  // loadComponentTrend orders scan_date descending, so the first row seen for a ticker
  // is its most recent — which is the price and sector worth keeping.
  const byTicker = new Map<string, TrendMatrixRow>();
  for (const r of rows) {
    let entry = byTicker.get(r.ticker);
    if (!entry) {
      entry = {
        ticker: r.ticker,
        sector: r.sector,
        price: r.price,
        present: 0,
        byDate: {},
      };
      byTicker.set(r.ticker, entry);
    }
    entry.byDate[r.scan_date] = {
      se: r.se_score,
      dmd: r.demand_score,
      ovr: r.overall_score,
      label: r.label,
    };
    if (r.sector && !entry.sector) entry.sector = r.sector;
  }

  for (const entry of byTicker.values()) {
    entry.present = Object.keys(entry.byDate).length;
  }

  return NextResponse.json({
    engine,
    dates,
    rows: [...byTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker)),
  });
}
