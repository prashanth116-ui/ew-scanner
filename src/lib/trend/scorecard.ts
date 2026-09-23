import "server-only";
import { loadComponentHistoryAll } from "@/lib/supabase/persistence";
import {
  scoreTrend,
  priceState,
  summarize,
  collapseToEpisodes,
  collapseEpisodes,
  compositionMatchedControl,
  FORWARD_SCANS,
  SETUP_WINDOW,
  type BucketStat,
  type PriceState,
} from "./outcomes";

export { FORWARD_SCANS, SETUP_WINDOW };

/**
 * Measured track record of the signals the trend page displays.
 *
 * The page carried an editorial claim in its UI - a badge plus an emerald row tint on
 * "Seller Exhaustion and Demand both rising" - that nothing had ever checked. Measured, it
 * returned -0.30% forward 5-scan excess against a -0.33% price-flat control. The badge was
 * not backwards; it was uninformative, because the component trend largely restates the
 * price move underneath it.
 *
 * Rather than swap one unvalidated claim for another, the page now reports what each
 * signal has actually done. Every bucket is graded against a PRICE-COMPOSITION-MATCHED
 * control rather than against the whole cohort, because grading against the cohort is
 * exactly the mistake that made these signals look meaningful in the first place.
 */

/**
 * Minimum episodes before a bucket is treated as readable.
 *
 * Under this the mean is dominated by one or two names and reads as precision the sample
 * cannot support. A thin bucket is reported AS thin rather than hidden, so the reader can
 * tell "no edge" from "not enough data" - those are different answers.
 */
export const MIN_EPISODES = 30;

export interface SignalRecord {
  key: string;
  label: string;
  /** What the page shows for this signal, so the scorecard and the UI cannot drift. */
  description: string;
  stat: BucketStat | null;
  /** The price-composition-matched control: names whose price moved the same way over the
   *  window, regardless of what their score did, blended to match this signal's own mix of
   *  price states. */
  control: { meanExcess: number; n: number } | null;
  /** meanExcess minus the control's, in percentage points. This is the only number on the
   *  row that is about the SIGNAL rather than about the tape. */
  incrementPp: number | null;
  thin: boolean;
  /** How this signal's episodes split across price states, so a reader can see when a
   *  signal is really just a price filter wearing a component's name. */
  priceMix: Record<PriceState, number>;
}

export interface Scorecard {
  engine: "inflection" | "transition";
  scannerVersion: number | null;
  forwardScans: number;
  setupWindow: number;
  dateFrom: string | null;
  dateTo: string | null;
  scanDates: number;
  signals: SignalRecord[];
  /** Plain-language limits, rendered verbatim by the page. A scorecard that reports
   *  numbers without them invites exactly the overreading it exists to prevent. */
  caveats: string[];
}

interface SetupContext {
  overall: number[];
  se: number[];
  demand: number[];
  priceState: PriceState;
  isCoiled: boolean;
  isStronger: boolean;
}

interface Bucketer {
  key: string;
  label: string;
  description: string;
  test: (ctx: SetupContext) => boolean;
}

const delta = (xs: number[]): number => xs[xs.length - 1] - xs[0];

const SIGNALS: Bucketer[] = [
  {
    key: "bothRising",
    label: "Both rising",
    description: "Seller Exhaustion and Buyer Demand both improved across the window",
    test: (c) => delta(c.se) > 0 && delta(c.demand) > 0,
  },
  {
    key: "scoreRising",
    label: "Overall rising",
    description: "Overall score sloping up across the window",
    test: (c) => scoreTrend(c.overall) === "RISING",
  },
  {
    key: "scoreFalling",
    label: "Overall falling",
    description: "Overall score sloping down across the window",
    test: (c) => scoreTrend(c.overall) === "FALLING",
  },
  {
    key: "accum",
    label: "Price down, score up",
    description: "Price fell while Seller Exhaustion rose - accumulation under a falling price",
    test: (c) => c.priceState === "DOWN" && delta(c.se) >= 5,
  },
  {
    key: "diverging",
    label: "Price up, score down",
    description: "Price rose while Seller Exhaustion fell - the tape improved, the evidence decayed",
    test: (c) => c.priceState === "UP" && delta(c.se) <= -5,
  },
  {
    key: "coiled",
    label: "Coiled",
    description: "Supply exhausted, compressed, real Runner Potential, not yet moving",
    test: (c) => c.isCoiled,
  },
  {
    key: "stronger",
    label: "Stronger signal",
    description: "The higher-conviction tier on the latest scan in the window",
    test: (c) => c.isStronger,
  },
];

interface Observation {
  barIndex: number;
  excess: number;
  priceState: PriceState;
}

type Entries = Map<string, Observation[]>;

function push(
  buckets: Map<string, Entries>,
  key: string,
  ticker: string,
  observation: Observation,
): void {
  let entries = buckets.get(key);
  if (!entries) {
    entries = new Map();
    buckets.set(key, entries);
  }
  const list = entries.get(ticker);
  if (list) list.push(observation);
  else entries.set(ticker, [observation]);
}

export async function computeScorecard(
  engine: "inflection" | "transition",
): Promise<Scorecard> {
  const rows = await loadComponentHistoryAll(engine);

  // Scope to the newest scanner_version present, never blending. V2 rows carry
  // runner_score: 0 and a different component definition, so "rising" is not the same
  // predicate across the boundary. This mirrors computeDailyHitRates().
  const versions = [
    ...new Set(rows.map((r) => r.scanner_version).filter((v): v is number => v !== null)),
  ];
  const scannerVersion = versions.length ? Math.max(...versions) : null;
  const scoped =
    scannerVersion === null ? rows : rows.filter((r) => r.scanner_version === scannerVersion);

  const dates = [...new Set(scoped.map((r) => r.scan_date))].sort();

  type Row = (typeof scoped)[number];
  const byTicker = new Map<string, Map<string, Row>>();
  for (const r of scoped) {
    let series = byTicker.get(r.ticker);
    if (!series) {
      series = new Map();
      byTicker.set(r.ticker, series);
    }
    series.set(r.scan_date, r);
  }

  const buckets = new Map<string, Entries>();

  for (let di = SETUP_WINDOW - 1; di + FORWARD_SCANS < dates.length; di++) {
    const window = dates.slice(di - SETUP_WINDOW + 1, di + 1);
    const anchor = dates[di];
    const exit = dates[di + FORWARD_SCANS];

    // The cohort mean for this anchor is the benchmark. An absolute return is
    // uninterpretable without the tape - the same reason scanner_hit_rates reports
    // avg_excess_return_pct rather than avg_return_pct.
    const forward: Array<{ ticker: string; ret: number }> = [];
    for (const [ticker, series] of byTicker) {
      const a = series.get(anchor);
      const b = series.get(exit);
      if (a && b && a.price > 0) {
        forward.push({ ticker, ret: ((b.price - a.price) / a.price) * 100 });
      }
    }
    if (forward.length < 20) continue;
    const cohortMean = forward.reduce((s, f) => s + f.ret, 0) / forward.length;

    for (const { ticker, ret } of forward) {
      const series = byTicker.get(ticker)!;
      const cells = window.map((d) => series.get(d)).filter((c): c is Row => !!c);
      if (cells.length < 3) continue;

      const first = cells[0];
      const last = cells[cells.length - 1];
      if (first.price <= 0) continue;
      const pricePct = ((last.price - first.price) / first.price) * 100;
      const ps = priceState(pricePct);
      if (!ps) continue;

      const excess = ret - cohortMean;
      const ctx: SetupContext = {
        overall: cells.map((c) => c.overall_score),
        se: cells.map((c) => c.se_score),
        demand: cells.map((c) => c.demand_score),
        priceState: ps,
        isCoiled: last.is_coiled,
        isStronger: last.is_stronger,
      };

      const observation: Observation = { barIndex: di, excess, priceState: ps };
      push(buckets, `control:${ps}`, ticker, observation);
      for (const sig of SIGNALS) {
        if (sig.test(ctx)) push(buckets, sig.key, ticker, observation);
      }
    }
  }

  // Each price state gets its own episode-collapsed control. There is deliberately no
  // "all names" control: every name is in that bucket on every scan, so collapsing it to
  // contiguous runs keeps only each ticker's first appearance — a biased subsample whose
  // mean is an artefact of when a name entered the scan, not the cohort.
  const controlByState = new Map<PriceState, BucketStat | null>();
  for (const state of ["UP", "FLAT", "DOWN"] as const) {
    const entries = buckets.get(`control:${state}`);
    controlByState.set(state, entries ? summarize(collapseToEpisodes(entries)) : null);
  }

  const signals: SignalRecord[] = SIGNALS.map((sig) => {
    const entries = buckets.get(sig.key);
    const episodes = entries ? collapseEpisodes(entries) : [];
    const stat = summarize(episodes.map((e) => e.excess));
    const control = compositionMatchedControl(
      episodes.map((e) => e.priceState),
      controlByState,
    );
    const priceMix: Record<PriceState, number> = { UP: 0, FLAT: 0, DOWN: 0 };
    for (const e of episodes) priceMix[e.priceState]++;

    return {
      key: sig.key,
      label: sig.label,
      description: sig.description,
      stat,
      control,
      incrementPp: stat && control ? stat.meanExcess - control.meanExcess : null,
      thin: !stat || stat.n < MIN_EPISODES,
      priceMix,
    };
  });

  return {
    engine,
    scannerVersion,
    forwardScans: FORWARD_SCANS,
    setupWindow: SETUP_WINDOW,
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
    scanDates: dates.length,
    signals,
    caveats: [
      `Forward ${FORWARD_SCANS} scans, excess vs that day's cohort mean, episode-collapsed: a name held in a bucket counts once, not once per scan.`,
      `Scanner v${scannerVersion ?? "?"} only, ${dates.length} scan dates from ${dates[0] ?? "?"}. That is one market regime, which is not enough to call any of these settled.`,
      "Graded against a price-composition-matched control: each price state carries its own control, blended to match how the signal's own episodes split across them. There is deliberately no all-names control — every name is in it on every scan, so collapsing that to episodes keeps only first appearances and its mean is an artefact of when names entered the scan.",
      "The increment is the only column about the signal itself. On this sample every increment is small and several flip sign between horizons and between the two engines, which is what noise looks like.",
      "Survivorship: a forward return needs the name still in the scan at exit, so names that collapsed out are missing. This flatters the falling buckets and leaves the rising buckets conservative.",
    ],
  };
}
