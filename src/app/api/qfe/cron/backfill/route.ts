/**
 * QFE Forward Return Backfill Cron.
 * Computes 1d, 5d, and 10d forward returns for past QFE scans.
 * Runs daily after market close to update historical accuracy data.
 *
 * Schedule: 02:45 UTC (10:45 PM ET, after all other crons)
 */

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchYahooChart } from "@/lib/prerun/data";
import {
  loadQFEDailyDates,
  loadQFEPendingForwardReturns,
  updateQFEForwardReturns,
} from "@/lib/supabase/persistence";

export const maxDuration = 120;

const LOOKBACKS: { days: number; column: "fwd_1d_pct" | "fwd_5d_pct" | "fwd_10d_pct" }[] = [
  { days: 1, column: "fwd_1d_pct" },
  { days: 5, column: "fwd_5d_pct" },
  { days: 10, column: "fwd_10d_pct" },
];

function tradingDaysAgo(fromDate: Date, tradingDays: number): string {
  // Approximate: each trading day ≈ 1.4 calendar days
  const calendarDays = Math.ceil(tradingDays * 1.5) + 2; // generous buffer
  const d = new Date(fromDate);
  d.setDate(d.getDate() - calendarDays);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const today = new Date();
    const dates = await loadQFEDailyDates(14); // last 14 scan dates

    let totalUpdated = 0;
    const details: string[] = [];

    for (const lookback of LOOKBACKS) {
      // Find scan dates that are at least N trading days old
      const cutoffDate = tradingDaysAgo(today, lookback.days);
      const eligibleDates = dates.filter((d) => d <= cutoffDate);

      for (const scanDate of eligibleDates) {
        // Time guard: stop if running too long
        if (Date.now() - startTime > 100_000) break;

        const pending = await loadQFEPendingForwardReturns(scanDate, lookback.column);
        if (pending.length === 0) continue;

        // Fetch current prices for all pending tickers (batch via Yahoo chart)
        const updates: { scan_date: string; ticker: string; fwd_pct: number }[] = [];

        // Process in batches of 10
        for (let i = 0; i < pending.length; i += 10) {
          const batch = pending.slice(i, i + 10);
          const results = await Promise.allSettled(
            batch.map(async (row) => {
              const chart = await fetchYahooChart(row.ticker, "5d", "1d");
              if (!chart || chart.closes.length === 0) return null;
              const currentPrice = chart.closes[chart.closes.length - 1];
              if (row.price <= 0 || currentPrice <= 0) return null;
              const fwdPct = ((currentPrice - row.price) / row.price) * 100;
              return { scan_date: row.scan_date, ticker: row.ticker, fwd_pct: Math.round(fwdPct * 100) / 100 };
            }),
          );

          for (const r of results) {
            if (r.status === "fulfilled" && r.value) {
              updates.push(r.value);
            }
          }
        }

        if (updates.length > 0) {
          const n = await updateQFEForwardReturns(updates, lookback.column);
          totalUpdated += n;
          details.push(`${scanDate} ${lookback.column}: ${n}/${pending.length}`);
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json({
      ok: true,
      totalUpdated,
      details,
      elapsed: `${elapsed}s`,
    });
  } catch (err) {
    logError("api/qfe/cron/backfill", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backfill failed" },
      { status: 500 },
    );
  }
}
