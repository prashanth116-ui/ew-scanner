/**
 * Forward-return hit rates for the two daily scanners that retain history.
 *
 * `/api/cron/outcomes` already computes hit rates for ew/squeeze/confluence/prerun, but it
 * reads `signal_outcomes` and scores a signal on whether it hit a stored target. Inflection
 * and Transition emit no targets — they emit a state plus conviction flags — so they were
 * absent from `scanner_hit_rates` entirely. This fills that gap.
 *
 * Three things this is deliberate about:
 *
 * 1. **Prices come from Yahoo, not from the scanner table.** The table only holds a ticker
 *    on days it qualified, so reading the exit price from it would silently restrict the
 *    sample to names that kept qualifying — survivorship bias pointed the wrong way.
 *
 * 2. **Entry is the close ON scan_date, not the `price` column.** That column carries the
 *    PRIOR session's close (the 01:45/01:55 UTC cron reads yesterday's bar), so using it
 *    as an entry would book a gain nobody could have taken. The alert lands pre-market, so
 *    the close of that same session is the first realistic fill.
 *
 * 3. **Truncated windows are dropped, not counted short.** A 30-day bucket that quietly
 *    includes 9-day-old signals reads as a horizon result when it is really a mix.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { fetchWithRetry, toYahooSymbol } from "@/lib/yahoo-utils";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Benchmark every bucket is measured against. */
export const BENCHMARK = "SPY";

/** Holding horizons, in CALENDAR days (see migration 034 comment on period_days). */
export const PERIODS = [7, 14, 30] as const;

/** Below this, a bucket is noise. Matches the existing threshold in cron/outcomes. */
export const MIN_SAMPLE = 5;

const ENGINES = {
  inflection: { table: "inflection_daily", bucketCol: "stage" },
  transition: { table: "transition_daily", bucketCol: "state" },
} as const;

export type DailyEngine = keyof typeof ENGINES;

export interface HitRateRow {
  scanner: string;
  mode: string | null;
  signal_strength: string | null;
  period_days: number;
  total_signals: number;
  hit_count: number;
  hit_rate: number;
  avg_return_pct: number;
  avg_max_drawdown_pct: number;
  median_return_pct: number;
  benchmark_return_pct: number;
  avg_excess_return_pct: number;
  win_rate_vs_benchmark: number;
  sample_start_date: string;
  sample_end_date: string;
  source: string;
}

interface SignalRow {
  ticker: string;
  scan_date: string;
  is_primary: boolean | null;
  is_stronger: boolean | null;
  bucket: string | null;
}

interface Bar {
  d: string;
  c: number;
  l: number;
}

interface Outcome {
  ret: number;
  excess: number;
  drawdown: number;
  benchmark: number;
  scanDate: string;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Load one engine's signals since `since` (inclusive). */
async function loadSignals(engine: DailyEngine, since: string): Promise<SignalRow[]> {
  const { table, bucketCol } = ENGINES[engine];
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from(table)
    .select(`ticker,scan_date,is_primary,is_stronger,${bucketCol}`)
    .gte("scan_date", since)
    .order("scan_date", { ascending: true });

  if (error) {
    console.error(`[daily-hit-rates] load ${table} error:`, error.message);
    return [];
  }

  return (data ?? []).map((r: Record<string, unknown>) => ({
    ticker: String(r.ticker),
    scan_date: String(r.scan_date),
    is_primary: (r.is_primary as boolean | null) ?? null,
    is_stronger: (r.is_stronger as boolean | null) ?? null,
    bucket: (r[bucketCol] as string | null) ?? null,
  }));
}

/** Fetch 6mo daily bars for each ticker. Failures are skipped, not fatal. */
async function loadBars(tickers: string[]): Promise<Map<string, Bar[]>> {
  const out = new Map<string, Bar[]>();
  const BATCH = 10;

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (ticker) => {
        try {
          const url = `${YAHOO_CHART}/${toYahooSymbol(ticker)}?range=6mo&interval=1d`;
          const res = await fetchWithRetry(url, { headers: { "User-Agent": UA } }, {
            timeout: 10000,
            retries: 1,
          });
          if (!res.ok) return;
          const json = await res.json();
          const result = json?.chart?.result?.[0];
          const ts: number[] | undefined = result?.timestamp;
          const q = result?.indicators?.quote?.[0];
          if (!ts || !q) return;

          const bars: Bar[] = [];
          for (let k = 0; k < ts.length; k++) {
            const c = q.close?.[k];
            if (c == null) continue;
            bars.push({
              d: new Date(ts[k] * 1000).toISOString().slice(0, 10),
              c,
              l: q.low?.[k] ?? c,
            });
          }
          if (bars.length) out.set(ticker, bars);
        } catch {
          // Skip ticker; a missing series just shrinks the sample.
        }
      })
    );
    if (i + BATCH < tickers.length) await new Promise((r) => setTimeout(r, 400));
  }

  return out;
}

/**
 * Return over [first close on/after `from`, last close on/before `from + periodDays`].
 * Null when the window has not fully elapsed — a partial window is not a horizon result.
 */
function windowReturn(
  bars: Bar[],
  from: string,
  periodDays: number
): { ret: number; drawdown: number } | null {
  const entryIdx = bars.findIndex((b) => b.d >= from);
  if (entryIdx < 0) return null;

  const limit = addDays(from, periodDays);
  if (bars[bars.length - 1].d < limit) return null; // window still open

  let exitIdx = -1;
  for (let i = entryIdx + 1; i < bars.length; i++) {
    if (bars[i].d <= limit) exitIdx = i;
    else break;
  }
  if (exitIdx < 0) return null;

  const entry = bars[entryIdx].c;
  let low = entry;
  for (let i = entryIdx; i <= exitIdx; i++) low = Math.min(low, bars[i].l);

  return {
    ret: (bars[exitIdx].c / entry - 1) * 100,
    drawdown: (low / entry - 1) * 100,
  };
}

function aggregate(
  scanner: string,
  mode: string | null,
  strength: string | null,
  periodDays: number,
  outcomes: Outcome[]
): HitRateRow | null {
  if (outcomes.length < MIN_SAMPLE) return null;

  const rets = outcomes.map((o) => o.ret);
  const dates = outcomes.map((o) => o.scanDate).sort();

  return {
    scanner,
    mode,
    signal_strength: strength,
    period_days: periodDays,
    total_signals: outcomes.length,
    hit_count: rets.filter((r) => r > 0).length,
    hit_rate: Math.round((rets.filter((r) => r > 0).length / rets.length) * 1000) / 1000,
    avg_return_pct: round2(rets.reduce((a, b) => a + b, 0) / rets.length),
    avg_max_drawdown_pct: round2(
      outcomes.reduce((a, b) => a + b.drawdown, 0) / outcomes.length
    ),
    median_return_pct: round2(median(rets)),
    benchmark_return_pct: round2(
      outcomes.reduce((a, b) => a + b.benchmark, 0) / outcomes.length
    ),
    avg_excess_return_pct: round2(
      outcomes.reduce((a, b) => a + b.excess, 0) / outcomes.length
    ),
    win_rate_vs_benchmark:
      Math.round((outcomes.filter((o) => o.excess > 0).length / outcomes.length) * 1000) /
      1000,
    sample_start_date: dates[0],
    sample_end_date: dates[dates.length - 1],
    source: "daily_table",
  };
}

export interface ComputeResult {
  rows: HitRateRow[];
  /** Buckets dropped for having fewer than MIN_SAMPLE complete windows. Never silent. */
  droppedThinBuckets: number;
  signalsRead: number;
  tickersPriced: number;
}

/**
 * Compute hit rates for one daily engine.
 * `lookbackDays` bounds how far back signals are taken from; the longest period still has
 * to have fully elapsed, so the effective signal window is shorter than the lookback.
 */
export async function computeDailyHitRates(
  engine: DailyEngine,
  lookbackDays = 90
): Promise<ComputeResult> {
  const since = addDays(new Date().toISOString().slice(0, 10), -lookbackDays);
  const signals = await loadSignals(engine, since);
  if (signals.length === 0) {
    return { rows: [], droppedThinBuckets: 0, signalsRead: 0, tickersPriced: 0 };
  }

  const tickers = [...new Set(signals.map((s) => s.ticker))];
  const bars = await loadBars([...tickers, BENCHMARK]);
  const benchBars = bars.get(BENCHMARK);
  if (!benchBars) {
    console.error("[daily-hit-rates] benchmark series unavailable; aborting");
    return { rows: [], droppedThinBuckets: 0, signalsRead: signals.length, tickersPriced: 0 };
  }

  const rows: HitRateRow[] = [];
  let dropped = 0;

  for (const periodDays of PERIODS) {
    // Benchmark return is identical for every signal sharing a scan_date — cache per date.
    const benchByDate = new Map<string, number | null>();
    const benchFor = (d: string): number | null => {
      if (!benchByDate.has(d)) {
        const w = windowReturn(benchBars, d, periodDays);
        benchByDate.set(d, w ? w.ret : null);
      }
      return benchByDate.get(d)!;
    };

    // strength bucket -> state bucket -> outcomes
    const buckets = new Map<string, Map<string, Outcome[]>>();
    const push = (strength: string, mode: string, o: Outcome) => {
      if (!buckets.has(strength)) buckets.set(strength, new Map());
      const m = buckets.get(strength)!;
      if (!m.has(mode)) m.set(mode, []);
      m.get(mode)!.push(o);
    };

    for (const s of signals) {
      const series = bars.get(s.ticker);
      if (!series) continue;
      const w = windowReturn(series, s.scan_date, periodDays);
      if (!w) continue;
      const bench = benchFor(s.scan_date);
      if (bench == null) continue;

      const o: Outcome = {
        ret: w.ret,
        drawdown: w.drawdown,
        benchmark: bench,
        excess: w.ret - bench,
        scanDate: s.scan_date,
      };

      // A signal lands in every strength tier it qualifies for, so "all" stays the full
      // cohort and "stronger" is readable as a subset of "primary" rather than disjoint.
      push("all", "all", o);
      if (s.bucket) push("all", s.bucket, o);
      if (s.is_primary) push("primary", "all", o);
      if (s.is_stronger) push("stronger", "all", o);
    }

    for (const [strength, modes] of buckets) {
      for (const [mode, outcomes] of modes) {
        const row = aggregate(
          engine,
          mode === "all" ? null : mode,
          strength === "all" ? null : strength,
          periodDays,
          outcomes
        );
        if (row) rows.push(row);
        else dropped++;
      }
    }
  }

  return {
    rows,
    droppedThinBuckets: dropped,
    signalsRead: signals.length,
    tickersPriced: bars.size - 1, // exclude the benchmark
  };
}

export const DAILY_ENGINES = Object.keys(ENGINES) as DailyEngine[];
