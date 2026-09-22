/**
 * Nightly cron: recompute forward-return hit rates for the daily scanners.
 * Schedule: 03:20 UTC Tue-Sat (after every scanner has persisted for the day).
 *
 * Separate from `/api/cron/outcomes`, which scores ew/squeeze/confluence/prerun against
 * stored targets from `signal_outcomes`. Inflection and Transition have no targets, and
 * they are the only two daily tables that retain more than 14 days — so they are the only
 * ones that can be measured over a 30-day horizon at all.
 *
 * Params (manual runs):
 *   ?engine=inflection|transition   limit to one engine
 *   ?lookback=90                    signal window in days
 *   ?dryRun=true                    compute and return without writing
 */

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { upsertHitRates } from "@/lib/supabase/persistence";
import {
  computeDailyHitRates,
  DAILY_ENGINES,
  type DailyEngine,
  type HitRateRow,
} from "@/lib/backtest/daily-hit-rates";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const only = params.get("engine") as DailyEngine | null;
  const lookback = Math.min(Number(params.get("lookback")) || 90, 365);
  const dryRun = params.get("dryRun") === "true";

  const engines = only && DAILY_ENGINES.includes(only) ? [only] : DAILY_ENGINES;

  try {
    const rows: HitRateRow[] = [];
    const perEngine: Record<string, unknown> = {};

    for (const engine of engines) {
      const result = await computeDailyHitRates(engine, lookback);
      rows.push(...result.rows);
      perEngine[engine] = {
        buckets: result.rows.length,
        signalsRead: result.signalsRead,
        tickersPriced: result.tickersPriced,
        droppedThinBuckets: result.droppedThinBuckets,
      };
    }

    const written = dryRun ? false : await upsertHitRates(rows);
    if (!dryRun && !written && rows.length > 0) {
      return NextResponse.json(
        { error: "upsert failed", buckets: rows.length, perEngine },
        { status: 500 }
      );
    }

    // Headline: the benchmark-relative read for each engine's highest-conviction tier.
    const headline = rows
      .filter((r) => r.signal_strength === "stronger" && r.mode === null)
      .map((r) => ({
        scanner: r.scanner,
        period_days: r.period_days,
        n: r.total_signals,
        avg_excess_return_pct: r.avg_excess_return_pct,
        win_rate_vs_benchmark: r.win_rate_vs_benchmark,
        sample: `${r.sample_start_date} -> ${r.sample_end_date}`,
      }));

    return NextResponse.json({
      ok: true,
      dryRun,
      lookbackDays: lookback,
      bucketsWritten: dryRun ? 0 : rows.length,
      perEngine,
      headline,
    });
  } catch (err) {
    logError("cron/hit-rates", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
