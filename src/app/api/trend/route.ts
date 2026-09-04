import { NextRequest, NextResponse } from "next/server";
import {
  loadComponentTrend,
  loadComponentHistory,
  loadComponentHistoryDates,
  loadLatestSectorQuadrants,
  loadInflectionDailyDates,
  loadTransitionDailyDates,
  type TrendRow,
} from "@/lib/supabase/persistence";

/**
 * Upper bound on the window.
 *
 * Matches RETENTION_DAYS in the Inflection and Transition crons, which is 90 — not the
 * `retentionDays = 14` default on purgeOld*Daily, which no caller uses. This was capped at
 * 14 on the mistaken reading of that default, which hid a month of retained history behind
 * a limit the data never had.
 *
 * Past 90 days the scan tables really are purged, and the request falls through to the
 * never-purged component_history archive instead.
 */
const SCAN_RETENTION_DAYS = 90;

/**
 * The archive is unbounded, so the ceiling has to sit above retention or the branch below
 * is unreachable and the archive is dead code — which is exactly what MAX_DAYS = 90 made
 * it, since `days` is clamped to MAX_DAYS before being compared against retention.
 * Two years is well past anything the page will ask for and bounds the query regardless.
 */
const MAX_DAYS = 730;

/** One scan's components for one ticker. Keys are short because this object repeats
 *  per ticker per date and the payload is already dates x universe. */
export interface TrendCell {
  /** Close the scan was computed from, so price can be trended alongside the scores. */
  px: number;
  se: number;
  dmd: number;
  cmp: number;
  run: number;
  rs: number;
  ovr: number;
  /** Transition only. Null on Inflection, which has no Structure component. */
  str: number | null;
  /** stage (inflection) or state (transition). */
  label: string;
}

export interface TrendMatrixRow {
  ticker: string;
  sector: string | null;
  /** Price on the most recent date in the window that carries a row. */
  price: number;
  /** How many of the window's dates carry a row. Absence is data, so it is reported. */
  present: number;
  /** Flags from the most recent row in the window. These describe a moment, not a
   *  window, so exposing a series of them would invite averaging something that
   *  cannot be averaged — they are filters, not trends. */
  read: string;
  stage: string;
  isCoiled: boolean;
  isPrimary: boolean;
  isStronger: boolean;
  extensionRisk: boolean;
  /** Keyed by scan_date. A missing key means the scanner produced no row that day. */
  byDate: Record<string, TrendCell>;
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

  // Inside retention the scan tables are authoritative and always current. Beyond it they
  // are empty, so the archive is the only source. Choosing per-request keeps one source per
  // response rather than stitching two together and having to reconcile disagreements.
  const fromArchive = days > SCAN_RETENTION_DAYS;

  const allDates = fromArchive
    ? await loadComponentHistoryDates(engine, days)
    : engine === "inflection"
      ? await loadInflectionDailyDates(days)
      : await loadTransitionDailyDates(days);

  // loadDates returns newest-first. Take the most recent `days`, then present
  // oldest-first so the matrix reads left-to-right in time.
  const dates = allDates.slice(0, days).reverse();
  if (dates.length === 0) {
    return NextResponse.json({ engine, dates: [], rows: [], source: fromArchive ? "archive" : "scan" });
  }

  const [rows, quadrants]: [TrendRow[], Record<string, string>] = await Promise.all([
    fromArchive ? loadComponentHistory(engine, dates) : loadComponentTrend(engine, dates),
    loadLatestSectorQuadrants(),
  ]);

  // loadComponentTrend orders scan_date descending, so the first row seen for a ticker
  // is its most recent — which is the price, sector and flag set worth keeping.
  const byTicker = new Map<string, TrendMatrixRow>();
  for (const r of rows) {
    let entry = byTicker.get(r.ticker);
    if (!entry) {
      entry = {
        ticker: r.ticker,
        sector: r.sector,
        price: r.price,
        present: 0,
        read: r.read,
        stage: r.label,
        isCoiled: r.is_coiled,
        isPrimary: r.is_primary,
        isStronger: r.is_stronger,
        extensionRisk: r.extension_risk,
        byDate: {},
      };
      byTicker.set(r.ticker, entry);
    }
    entry.byDate[r.scan_date] = {
      px: r.price,
      se: r.se_score,
      dmd: r.demand_score,
      cmp: r.compression_score,
      run: r.runner_score,
      rs: r.rs_score,
      ovr: r.overall_score,
      str: r.structure_score,
      label: r.label,
    };
    if (r.sector && !entry.sector) entry.sector = r.sector;
  }

  for (const entry of byTicker.values()) {
    entry.present = Object.keys(entry.byDate).length;
  }

  return NextResponse.json({
    engine,
    source: fromArchive ? "archive" : "scan",
    // Current RRG quadrant per sector name, so the page can group stocks by where their
    // sector sits without every row carrying a duplicate of it.
    quadrants,
    dates,
    rows: [...byTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker)),
  });
}
