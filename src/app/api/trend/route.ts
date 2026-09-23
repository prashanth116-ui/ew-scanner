import { NextRequest, NextResponse } from "next/server";
import {
  loadComponentTrend,
  loadComponentHistory,
  loadComponentHistoryDates,
  loadLatestSectorQuadrants,
  loadInflectionDailyDates,
  loadTransitionDailyDates,
  loadEngineTickersForDate,
  type TrendRow,
} from "@/lib/supabase/persistence";
import { FORWARD_SCANS, worstMeasured } from "@/lib/trend/outcomes";

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
  /**
   * Share of the composite that was measurable on this scan, 0-100. Null on archive
   * windows, which do not record it.
   *
   * Per-cell rather than per-row because a thin scan is a property of a DAY, not of a
   * ticker: the failure it exists to expose is one chart fetch dropping out of one cron
   * run and moving that day's score by 18 points at an unchanged price. Rolled up to the
   * row it would be indistinguishable from a name that is thin every day.
   */
  mp: number | null;
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
  /**
   * Worst coverage across the window, so one thin scan is enough to flag the series.
   * Null when nothing in the window recorded coverage (archive) — which is not the same
   * as 100 and must not filter like it.
   */
  measuredMin: number | null;
  /** Scored on the window's last scan. False means the name has since left the scan —
   *  on a 90-scan window most rows are in that state, and nothing else distinguishes
   *  them from a live one. */
  live: boolean;
  /** Scored on the window's FIRST scan. With `live`, separates a name entering the scan
   *  from one that has been there throughout. */
  fromStart: boolean;
  /** Also scored by the other engine on the anchor scan. */
  crossEngine: boolean;
  /** Keyed by scan_date. A missing key means the scanner produced no row that day. */
  byDate: Record<string, TrendCell>;
  /**
   * What happened AFTER the window, as excess return against the cohort mean over the
   * same forward scans. Null unless the window is anchored far enough in the past for the
   * outcome to exist — see `outcome` on the response.
   *
   * This is the page's feedback loop. Without it the matrix could display a signal for a
   * month with nothing ever checking whether the signal was worth displaying, which is
   * exactly what happened to the "both rising" badge.
   */
  fwdExcess: number | null;
  fwdReturn: number | null;
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

  /** Anchor the window's last scan to a past date, so the forward outcome exists. */
  const asOf = searchParams.get("asOf");

  // Inside retention the scan tables are authoritative and always current. Beyond it they
  // are empty, so the archive is the only source. Choosing per-request keeps one source per
  // response rather than stitching two together and having to reconcile disagreements.
  const fromArchive = days > SCAN_RETENTION_DAYS;

  /**
   * Floor on how many scan dates to list, independent of the window.
   *
   * The page offers these as anchors, so a request for a 7-scan window still needs a
   * usable set to choose from — sized to the window alone the picker would open with two
   * entries in it. Bounded rather than unbounded because loadDistinctScanDates pages
   * through ROWS to find distinct dates: at ~300 rows a scan, asking for the full archive
   * costs tens of round trips on every page load to populate a dropdown.
   */
  const ANCHOR_DATE_LIMIT = 30;

  // The window needs its own dates plus room for the forward scans past the anchor.
  const dateLimit = Math.min(MAX_DAYS, Math.max(days + FORWARD_SCANS, ANCHOR_DATE_LIMIT));
  const allDates = fromArchive
    ? await loadComponentHistoryDates(engine, dateLimit)
    : engine === "inflection"
      ? await loadInflectionDailyDates(dateLimit)
      : await loadTransitionDailyDates(dateLimit);

  if (allDates.length === 0) {
    return NextResponse.json({
      engine,
      source: fromArchive ? "archive" : "scan",
      dates: [],
      rows: [],
      availableDates: [],
    });
  }

  // loadDates returns newest-first; work oldest-first so the matrix reads left-to-right in
  // time and the forward buffer is simply "the dates after the anchor".
  const ascending = [...allDates].reverse();

  // Snap to the last scan at or before `asOf` rather than demanding an exact match — the
  // caller is picking from a calendar, and weekends and holidays are not scan dates.
  let anchorIdx = ascending.length - 1;
  if (asOf) {
    const idx = ascending.findLastIndex((d) => d <= asOf);
    if (idx >= 0) anchorIdx = idx;
  }

  const windowDates = ascending.slice(Math.max(0, anchorIdx - days + 1), anchorIdx + 1);
  const forwardDates = ascending.slice(anchorIdx + 1, anchorIdx + 1 + FORWARD_SCANS);
  // A partial forward buffer would measure a shorter holding period than it claims, so the
  // outcome is reported only when the full span exists.
  const hasOutcome = forwardDates.length === FORWARD_SCANS;

  const loadDates = hasOutcome ? [...windowDates, ...forwardDates] : windowDates;

  // The other engine's board on the anchor scan, for the cross-engine filter. Fetched
  // here rather than by a second request from the page: it is one date of one column, and
  // issuing it in parallel costs nothing while a client round trip would.
  const otherEngine = engine === "inflection" ? "transition" : "inflection";
  const anchorScanDate = windowDates[windowDates.length - 1];

  const [allRows, quadrants, crossTickers]: [TrendRow[], Record<string, string>, string[]] =
    await Promise.all([
      fromArchive
        ? loadComponentHistory(engine, loadDates)
        : loadComponentTrend(engine, loadDates),
      loadLatestSectorQuadrants(),
      loadEngineTickersForDate(otherEngine, anchorScanDate, fromArchive),
    ]);
  const crossSet = new Set(crossTickers);

  const windowSet = new Set(windowDates);
  const windowRows = allRows.filter((r) => windowSet.has(r.scan_date));

  /**
   * Scope to the newest scanner_version in the window. NEVER blend.
   *
   * V2 rows carry runner_score: 0 and a different definition of every other component, so
   * a row spanning the 2026-08-18 boundary put two incompatible measurements in one series,
   * differenced them into one `Chg` number, and ranked them on one percentile ramp. At the
   * time of writing days=30 reached 2026-08-13 and days=90 reached 2026-08-04, so both
   * blended silently. This mirrors computeDailyHitRates(), which scopes the same way.
   *
   * The dropped dates are reported rather than quietly removed: a 30-scan request that
   * returns 26 columns has to say why, or it looks like missing data.
   */
  const versions = [
    ...new Set(windowRows.map((r) => r.scanner_version).filter((v): v is number => v !== null)),
  ];
  const scannerVersion = versions.length ? Math.max(...versions) : null;
  const scopedRows =
    scannerVersion === null
      ? windowRows
      : windowRows.filter((r) => r.scanner_version === scannerVersion);

  const keptDates = new Set(scopedRows.map((r) => r.scan_date));
  const dates = windowDates.filter((d) => keptDates.has(d));
  const excludedDates = windowDates.filter((d) => !keptDates.has(d));

  if (dates.length === 0) {
    return NextResponse.json({
      engine,
      source: fromArchive ? "archive" : "scan",
      dates: [],
      rows: [],
      scannerVersion,
      excludedDates,
      availableDates: ascending,
    });
  }

  // loadComponentTrend orders scan_date descending, so the first row seen for a ticker
  // is its most recent — which is the price, sector and flag set worth keeping.
  const byTicker = new Map<string, TrendMatrixRow>();
  for (const r of scopedRows) {
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
        measuredMin: null,
        live: false,
        fromStart: false,
        crossEngine: crossSet.has(r.ticker),
        byDate: {},
        fwdExcess: null,
        fwdReturn: null,
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
      mp: r.measured_pct,
    };
    if (r.sector && !entry.sector) entry.sector = r.sector;
  }

  const firstScanDate = dates[0];
  const lastScanDate = dates[dates.length - 1];
  for (const entry of byTicker.values()) {
    entry.present = Object.keys(entry.byDate).length;
    entry.live = entry.byDate[lastScanDate] !== undefined;
    entry.fromStart = entry.byDate[firstScanDate] !== undefined;

    entry.measuredMin = worstMeasured(Object.values(entry.byDate).map((c) => c.mp));
  }

  /**
   * Forward outcome, anchor close to exit close, as excess over the cohort mean.
   *
   * Excess rather than raw, for the reason the hit-rate tables already insist on: an
   * absolute return says nothing without the tape. The cohort is every name the scanner
   * scored on the anchor date and still scored at exit — deliberately the whole cohort,
   * not the user's filtered view, so narrowing the table cannot move the benchmark.
   *
   * Exit rows are read unscoped by version. Only `price` is taken from them, which no
   * recalibration changes.
   */
  let outcome: { anchorDate: string; exitDate: string; forwardScans: number; cohort: number } | null = null;
  if (hasOutcome) {
    const anchorDate = windowDates[windowDates.length - 1];
    const exitDate = forwardDates[forwardDates.length - 1];
    const priceAt = new Map<string, Map<string, number>>();
    for (const r of allRows) {
      if (r.scan_date !== anchorDate && r.scan_date !== exitDate) continue;
      let m = priceAt.get(r.ticker);
      if (!m) {
        m = new Map();
        priceAt.set(r.ticker, m);
      }
      m.set(r.scan_date, r.price);
    }

    const returns = new Map<string, number>();
    for (const [ticker, m] of priceAt) {
      const a = m.get(anchorDate);
      const b = m.get(exitDate);
      if (a !== undefined && b !== undefined && a > 0) {
        returns.set(ticker, ((b - a) / a) * 100);
      }
    }

    if (returns.size >= 20) {
      const cohortMean = [...returns.values()].reduce((s, v) => s + v, 0) / returns.size;
      for (const entry of byTicker.values()) {
        const ret = returns.get(entry.ticker);
        if (ret === undefined) continue;
        entry.fwdReturn = ret;
        entry.fwdExcess = ret - cohortMean;
      }
      outcome = { anchorDate, exitDate, forwardScans: FORWARD_SCANS, cohort: returns.size };
    }
  }

  return NextResponse.json({
    engine,
    source: fromArchive ? "archive" : "scan",
    // Current RRG quadrant per sector name, so the page can group stocks by where their
    // sector sits without every row carrying a duplicate of it.
    quadrants,
    scannerVersion,
    excludedDates,
    /**
     * Whether coverage is knowable for this window at all. False on archive windows, where
     * the page must DISABLE the coverage filter rather than let it silently match nothing.
     */
    measuredAvailable: !fromArchive,
    /** The other engine, and how many of its names the anchor scan carried — so the page
     *  can label the cross-engine filter and say when the other board was empty. */
    crossEngineName: otherEngine,
    crossEngineCount: crossTickers.length,
    /** Every scan date available, so the page can offer anchors without a second request. */
    availableDates: ascending,
    outcome,
    dates,
    rows: [...byTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker)),
  });
}
