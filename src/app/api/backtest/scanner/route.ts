/**
 * Scanner backtest — evaluates persisted daily rows against forward returns.
 *
 * Reads what each scanner ACTUALLY scored on each scan date rather than re-scoring
 * history from live data. That matters for two reasons:
 *
 *   1. No lookahead. Re-scoring a past date via fetchPreRunData(ticker, "1d", date)
 *      truncates the chart correctly, but quote and fundamental fields — institutional
 *      ownership, insider buys, float, market cap — are fetched as of now. Institutional
 *      Participation is 15% of the Inflection composite, so the recomputed score was
 *      partly built from data that did not exist on the signal date.
 *   2. Transition becomes backtestable at all. Its structure fields (state, alert state,
 *      trigger level) are already persisted; nothing re-derives them.
 *
 * The tradeoff is window length: both daily tables purge at 14 days, so the study window
 * is bounded by retention, not by the requested range. The response reports the actual
 * dates found so a short window is visible rather than silent.
 *
 * GET /api/backtest/scanner?engine=inflection&days=14&minScore=40
 * GET /api/backtest/scanner?engine=transition&days=14&alertState=TRIGGERED,READY
 */

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchYahooChart } from "@/lib/prerun/data";
import {
  loadInflectionDaily,
  loadInflectionDailyDates,
  loadTransitionDaily,
  loadTransitionDailyDates,
} from "@/lib/supabase/persistence";
import type { InflectionDailyRecord, TransitionDailyRecord } from "@/lib/supabase/persistence";

export const maxDuration = 300;

type Engine = "inflection" | "transition";

/** Forward horizons, in trading bars. */
const HORIZONS = [1, 3, 5, 10] as const;

interface SignalRow {
  ticker: string;
  date: string;
  price: number;
  score: number;
  /** stage (inflection) or state (transition) */
  primaryBucket: string;
  /** trade read (inflection) or alert state (transition) */
  secondaryBucket: string;
  isPrimary: boolean;
  isStronger: boolean;
  returns: Record<string, number | null>;
  maxFavorable5d: number | null;
  maxAdverse5d: number | null;
}

interface BucketStats {
  bucket: string;
  signals: number;
  avgReturn5d: number | null;
  medianReturn5d: number | null;
  winRate5d: number | null;
  avgMaxFavorable5d: number | null;
  avgMaxAdverse5d: number | null;
  /** Average 5d return minus the cohort-wide average — the only number that says
   *  whether this bucket adds anything over taking every signal. */
  edgeVsAll5d: number | null;
}

// ── Forward returns ──

interface Chart {
  timestamps: number[];
  closes: number[];
  highs: number[];
  lows: number[];
}

/** Index of the bar on (or first after) a scan date. */
function findBarIndex(chart: Chart, date: string): number {
  const ts = new Date(date + "T23:59:59Z").getTime() / 1000;
  for (let i = 0; i < chart.timestamps.length; i++) {
    if (chart.timestamps[i] >= ts - 86_400 && chart.timestamps[i] <= ts) return i;
  }
  return -1;
}

function computeForward(chart: Chart, idx: number): Pick<SignalRow, "returns" | "maxFavorable5d" | "maxAdverse5d"> | null {
  const entry = chart.closes[idx];
  if (!entry || entry <= 0) return null;

  const returns: Record<string, number | null> = {};
  let anyForward = false;
  for (const h of HORIZONS) {
    const i = idx + h;
    const p = i < chart.closes.length ? chart.closes[i] : null;
    if (p && p > 0) {
      returns[`d${h}`] = ((p - entry) / entry) * 100;
      anyForward = true;
    } else {
      returns[`d${h}`] = null;
    }
  }
  if (!anyForward) return null;

  let maxFav = 0;
  let maxAdv = 0;
  for (let d = 1; d <= 5; d++) {
    const i = idx + d;
    if (i >= chart.highs.length) break;
    const hi = chart.highs[i];
    const lo = chart.lows[i];
    if (hi > 0) maxFav = Math.max(maxFav, ((hi - entry) / entry) * 100);
    if (lo > 0) maxAdv = Math.min(maxAdv, ((lo - entry) / entry) * 100);
  }

  return { returns, maxFavorable5d: maxFav, maxAdverse5d: maxAdv };
}

// ── Aggregation ──

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(v: number | null, dp = 2): number | null {
  return v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp;
}

function summarize(rows: SignalRow[], bucket: string, baseline: number | null): BucketStats {
  const r5 = rows.map((r) => r.returns.d5).filter((v): v is number => v !== null);
  const avg5 = mean(r5);
  return {
    bucket,
    signals: rows.length,
    avgReturn5d: round(avg5),
    medianReturn5d: round(median(r5)),
    winRate5d: r5.length > 0 ? round((r5.filter((v) => v > 0).length / r5.length) * 100, 1) : null,
    avgMaxFavorable5d: round(mean(rows.map((r) => r.maxFavorable5d).filter((v): v is number => v !== null))),
    avgMaxAdverse5d: round(mean(rows.map((r) => r.maxAdverse5d).filter((v): v is number => v !== null))),
    edgeVsAll5d: avg5 !== null && baseline !== null ? round(avg5 - baseline) : null,
  };
}

function groupBy(rows: SignalRow[], key: (r: SignalRow) => string, baseline: number | null): BucketStats[] {
  const groups = new Map<string, SignalRow[]>();
  for (const r of rows) {
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return [...groups.entries()]
    .map(([k, v]) => summarize(v, k, baseline))
    .sort((a, b) => (b.avgReturn5d ?? -999) - (a.avgReturn5d ?? -999));
}

const SCORE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "25-34", min: 25, max: 35 },
  { label: "35-44", min: 35, max: 45 },
  { label: "45-54", min: 45, max: 55 },
  { label: "55-64", min: 55, max: 65 },
  { label: "65+", min: 65, max: Infinity },
];

function scoreBucket(score: number): string {
  return SCORE_BUCKETS.find((b) => score >= b.min && score < b.max)?.label ?? "<25";
}

// ── Row normalization ──

function fromInflection(r: InflectionDailyRecord): Omit<SignalRow, "returns" | "maxFavorable5d" | "maxAdverse5d"> {
  return {
    ticker: r.ticker,
    date: r.scan_date,
    price: r.price,
    score: r.overall_score,
    primaryBucket: r.stage,
    secondaryBucket: r.trade_read,
    isPrimary: r.is_primary,
    isStronger: r.is_stronger,
  };
}

function fromTransition(r: TransitionDailyRecord): Omit<SignalRow, "returns" | "maxFavorable5d" | "maxAdverse5d"> {
  return {
    ticker: r.ticker,
    date: r.scan_date,
    price: r.price,
    score: r.overall_score,
    primaryBucket: r.state,
    secondaryBucket: r.alert_state,
    isPrimary: r.is_primary,
    isStronger: r.is_stronger,
  };
}

// ── Route ──

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const engine = (params.get("engine") ?? "inflection") as Engine;
    if (engine !== "inflection" && engine !== "transition") {
      return NextResponse.json({ error: "engine must be 'inflection' or 'transition'" }, { status: 400 });
    }

    const days = Math.min(Math.max(Number(params.get("days") ?? 14), 1), 60);
    const minScore = Number(params.get("minScore") ?? 0);
    const bucketFilter = params.get("alertState") ?? params.get("tradeRead");
    const allowedBuckets = bucketFilter ? new Set(bucketFilter.split(",").map((s) => s.trim())) : null;

    // 1. Which scan dates actually exist (bounded by table retention, not by the request)
    const dates = engine === "inflection"
      ? await loadInflectionDailyDates(days)
      : await loadTransitionDailyDates(days);

    if (dates.length === 0) {
      return NextResponse.json({ error: "No persisted scan dates found for this engine" }, { status: 404 });
    }

    // 2. Load every row for those dates
    const perDate = await Promise.all(
      dates.map((d) => (engine === "inflection" ? loadInflectionDaily(d) : loadTransitionDaily(d))),
    );

    const base: Omit<SignalRow, "returns" | "maxFavorable5d" | "maxAdverse5d">[] = [];
    for (const rows of perDate) {
      for (const r of rows) {
        const normalized = engine === "inflection"
          ? fromInflection(r as InflectionDailyRecord)
          : fromTransition(r as TransitionDailyRecord);
        if (normalized.score < minScore) continue;
        if (allowedBuckets && !allowedBuckets.has(normalized.secondaryBucket)) continue;
        base.push(normalized);
      }
    }

    if (base.length === 0) {
      return NextResponse.json({ engine, dates, signals: 0, message: "No rows matched the filters" });
    }

    // 3. Charts — request-scoped, one fetch per distinct ticker.
    //    A module-level cache would be shared across concurrent backtests on a warm
    //    lambda, where one request clearing it silently shrinks another's sample.
    const tickers = [...new Set(base.map((r) => r.ticker))];
    const charts = new Map<string, Chart | null>();
    const CHART_BATCH = 20;
    for (let i = 0; i < tickers.length; i += CHART_BATCH) {
      const batch = tickers.slice(i, i + CHART_BATCH);
      const settled = await Promise.allSettled(batch.map((t) => fetchYahooChart(t, "6mo", "1d")));
      batch.forEach((t, j) => {
        const s = settled[j];
        charts.set(t, s.status === "fulfilled" && s.value ? s.value : null);
      });
      if (i + CHART_BATCH < tickers.length) await new Promise((r) => setTimeout(r, 200));
    }

    // 4. Join forward returns onto each persisted signal
    const signals: SignalRow[] = [];
    let missingChart = 0;
    let missingBar = 0;
    let noForward = 0;

    for (const b of base) {
      const chart = charts.get(b.ticker);
      if (!chart) { missingChart++; continue; }
      const idx = findBarIndex(chart, b.date);
      if (idx < 0) { missingBar++; continue; }
      const fwd = computeForward(chart, idx);
      if (!fwd) { noForward++; continue; }
      signals.push({ ...b, ...fwd });
    }

    if (signals.length === 0) {
      return NextResponse.json({
        engine, dates, signals: 0,
        message: "No signals had forward data — the most recent scan dates have no bars after them yet",
        skipped: { missingChart, missingBar, noForward },
      });
    }

    // 5. Aggregate. Baseline = every signal in the cohort, so each bucket's edge is
    //    measured against taking the whole scanner rather than against zero.
    const all5d = signals.map((s) => s.returns.d5).filter((v): v is number => v !== null);
    const baseline = mean(all5d);

    const overall = summarize(signals, "ALL", baseline);
    const byHorizon = Object.fromEntries(
      HORIZONS.map((h) => {
        const vals = signals.map((s) => s.returns[`d${h}`]).filter((v): v is number => v !== null);
        return [`d${h}`, {
          signals: vals.length,
          avgReturn: round(mean(vals)),
          medianReturn: round(median(vals)),
          winRate: vals.length > 0 ? round((vals.filter((v) => v > 0).length / vals.length) * 100, 1) : null,
        }];
      }),
    );

    return NextResponse.json({
      engine,
      window: {
        datesRequested: days,
        datesFound: dates.length,
        dates,
        note: "Study window is bounded by the 14-day purge on the daily tables, not by the requested range.",
      },
      filters: { minScore, buckets: allowedBuckets ? [...allowedBuckets] : null },
      lookahead: "none — scores are read from persisted rows, not recomputed",
      counts: {
        rowsLoaded: base.length,
        signalsEvaluated: signals.length,
        skipped: { missingChart, missingBar, noForward },
        tickers: tickers.length,
      },
      overall,
      byHorizon,
      byState: groupBy(signals, (s) => s.primaryBucket, baseline),
      byAlert: groupBy(signals, (s) => s.secondaryBucket, baseline),
      byScoreBucket: groupBy(signals, (s) => scoreBucket(s.score), baseline),
      byFlag: [
        summarize(signals.filter((s) => s.isPrimary), "isPrimarySignal", baseline),
        summarize(signals.filter((s) => s.isStronger), "isStrongerSignal", baseline),
        summarize(signals.filter((s) => !s.isPrimary), "notPrimary", baseline),
      ],
    });
  } catch (err) {
    logError("api/backtest/scanner", err);
    const message = err instanceof Error ? err.message : "Backtest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
