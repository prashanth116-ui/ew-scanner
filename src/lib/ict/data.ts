/**
 * ICT Data Fetching — OHLC for 5 timeframes.
 * SERVER-ONLY: Used by /api/ict/* routes.
 *
 * 3 Yahoo API calls per ticker max:
 *   1. 2y:1h   → aggregated into 4h, 8h, 12h
 *   2. 3mo:1d  → native daily
 *   3. 5y:1wk  → native weekly
 */

import "server-only";

import { fetchYahooChart, aggregate4hOHLC } from "@/lib/prerun/data";
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

/**
 * Fetch OHLC data for all 5 timeframes.
 *
 * | Timeframe | Yahoo Call               | Aggregation              |
 * |-----------|--------------------------|--------------------------|
 * | 4h        | fetchYahooChart(t,"2y","1h")    | aggregate4hOHLC(…, 4)    |
 * | 8h        | same 1h chart (shared)          | aggregate4hOHLC(…, 8)    |
 * | 12h       | fetchYahooChart(t,"2y","1h",true)| aggregate4hOHLC(…, 12)  |
 * | 1d        | fetchYahooChart(t,"3mo","1d")   | none (native)            |
 * | 1wk       | fetchYahooChart(t,"5y","1wk")   | none (native)            |
 */
export async function fetchICTData(ticker: string): Promise<MultiTFData> {
  // Fire all 3 API calls in parallel
  const [chart1h, chart1hPre, chart1d, chart1wk] = await Promise.all([
    fetchYahooChart(ticker, "2y", "1h"),
    fetchYahooChart(ticker, "2y", "1h", true),
    fetchYahooChart(ticker, "3mo", "1d"),
    fetchYahooChart(ticker, "5y", "1wk"),
  ]);

  const currentPrice = chart1d?.closes?.[chart1d.closes.length - 1] ?? null;

  // ── 4h and 8h from regular 1h chart ──
  let tf4h: OHLCData | null = null;
  let tf8h: OHLCData | null = null;

  if (chart1h && chart1h.closes.length >= 8) {
    const agg4 = aggregate4hOHLC(chart1h.opens, chart1h.highs, chart1h.lows, chart1h.closes, 4);
    tf4h = {
      opens: agg4.opens,
      highs: agg4.highs,
      lows: agg4.lows,
      closes: agg4.closes,
      timestamps: aggregateTimestamps(chart1h.timestamps, 4),
    };

    const agg8 = aggregate4hOHLC(chart1h.opens, chart1h.highs, chart1h.lows, chart1h.closes, 8);
    tf8h = {
      opens: agg8.opens,
      highs: agg8.highs,
      lows: agg8.lows,
      closes: agg8.closes,
      timestamps: aggregateTimestamps(chart1h.timestamps, 8),
    };
  }

  // ── 12h from pre/post 1h chart ──
  let tf12h: OHLCData | null = null;
  const source12h = chart1hPre ?? chart1h; // fallback to regular if pre/post fails
  if (source12h && source12h.closes.length >= 12) {
    const agg12 = aggregate4hOHLC(source12h.opens, source12h.highs, source12h.lows, source12h.closes, 12);
    tf12h = {
      opens: agg12.opens,
      highs: agg12.highs,
      lows: agg12.lows,
      closes: agg12.closes,
      timestamps: aggregateTimestamps(source12h.timestamps, 12),
    };
  }

  // ── 1d native ──
  let tf1d: OHLCData | null = null;
  if (chart1d && chart1d.closes.length >= 15) {
    tf1d = {
      opens: chart1d.opens,
      highs: chart1d.highs,
      lows: chart1d.lows,
      closes: chart1d.closes,
      timestamps: chart1d.timestamps,
    };
  }

  // ── 1wk native ──
  let tf1wk: OHLCData | null = null;
  if (chart1wk && chart1wk.closes.length >= 15) {
    tf1wk = {
      opens: chart1wk.opens,
      highs: chart1wk.highs,
      lows: chart1wk.lows,
      closes: chart1wk.closes,
      timestamps: chart1wk.timestamps,
    };
  }

  return {
    timeframes: {
      "4h": tf4h,
      "8h": tf8h,
      "12h": tf12h,
      "1d": tf1d,
      "1wk": tf1wk,
    },
    currentPrice,
  };
}

/**
 * Aggregate timestamps by taking the last timestamp in each N-bar group.
 * Mirrors aggregate4hOHLC's close-taking logic.
 */
function aggregateTimestamps(timestamps: number[], n: number): number[] {
  const result: number[] = [];
  for (let i = n - 1; i < timestamps.length; i += n) {
    result.push(timestamps[i]);
  }
  return result;
}
