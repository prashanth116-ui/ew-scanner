/**
 * ICT Data Fetching — OHLC for every scanned timeframe.
 * SERVER-ONLY: Used by /api/ict/* routes.
 *
 * 3 Yahoo API calls per ticker:
 *   1. 2y:1h   → native 1h, plus session-bucketed 4h
 *   2. 1y:1d   → native daily
 *   3. 5y:1wk  → native weekly
 *
 * 8h and 12h are gone. A US equity RTH session is 6.5 hours, so neither candle
 * exists without merging bars across days — which is exactly what the old
 * index-based aggregation did, silently. Dropping them also removes one API
 * call (the pre/post chart that only fed 12h).
 */

import "server-only";

import { fetchYahooChart } from "@/lib/prerun/data";
import { aggregateSessions } from "./aggregate";
import type { Timeframe } from "./config";

export interface OHLCData {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  timestamps: number[];
}

export interface MultiTFData {
  /** Per-timeframe OHLC data. Null if fetch/aggregation failed. */
  timeframes: Record<Timeframe, OHLCData | null>;
  /** Current price from the most recent 1d close. */
  currentPrice: number | null;
}

/** Minimum bars before a timeframe is worth running the state machine on. */
const MIN_BARS: Record<Timeframe, number> = {
  "1h": 60,
  "4h": 30,
  "1d": 40,
  "1wk": 30,
};

/**
 * Fetch OHLC data for all timeframes.
 *
 * | Timeframe | Yahoo Call                     | Aggregation                  |
 * |-----------|--------------------------------|------------------------------|
 * | 1h        | fetchYahooChart(t,"2y","1h")   | none (native)                |
 * | 4h        | same 1h chart (shared)         | aggregateSessions(…, 4)      |
 * | 1d        | fetchYahooChart(t,"1y","1d")   | none (native)                |
 * | 1wk       | fetchYahooChart(t,"5y","1wk")  | none (native)                |
 */
export async function fetchICTData(ticker: string): Promise<MultiTFData> {
  const [chart1h, chart1d, chart1wk] = await Promise.all([
    fetchYahooChart(ticker, "2y", "1h"),
    // 1y rather than 3mo: the BSL draw scans a 40-bar window and the coherence
    // budget runs to 45 daily bars, both of which a 63-bar chart truncates.
    fetchYahooChart(ticker, "1y", "1d"),
    fetchYahooChart(ticker, "5y", "1wk"),
  ]);

  const currentPrice = chart1d?.closes?.[chart1d.closes.length - 1] ?? null;

  const take = (
    chart: OHLCData | null | undefined,
    tf: Timeframe,
  ): OHLCData | null => {
    if (!chart || chart.closes.length < MIN_BARS[tf]) return null;
    return {
      opens: chart.opens,
      highs: chart.highs,
      lows: chart.lows,
      closes: chart.closes,
      timestamps: chart.timestamps,
    };
  };

  const tf1h = take(chart1h, "1h");
  const tf4h = chart1h ? take(aggregateSessions(chart1h, 4), "4h") : null;

  return {
    timeframes: {
      "1h": tf1h,
      "4h": tf4h,
      "1d": take(chart1d, "1d"),
      "1wk": take(chart1wk, "1wk"),
    },
    currentPrice,
  };
}
