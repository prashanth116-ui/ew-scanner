/**
 * Session-aware candle aggregation for the ICT engine.
 *
 * Deliberately free of `server-only` so it stays unit-testable; the fetch that
 * feeds it (data.ts) is the server-only half.
 *
 * WHY NOT the shared aggregate4hOHLC: that helper groups every N bars by index
 * from the start of the series, with no reference to the clock. A US equity RTH
 * day is 6.5 hourly bars, so groups of 4 walk across day boundaries and a
 * single "4h candle" ends up straddling two sessions. It also starts at
 * `i = n-1` and steps by N, silently discarding the trailing partial group —
 * on a 12-hour bucket that dropped up to a day and a half of the most recent
 * price. Both behaviours are fine for the calibrated PreRun 4h scanner that
 * helper serves, and neither is acceptable for a framework built on session
 * structure, so this is a separate function rather than a change to that one.
 */

export interface OHLCSeries {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  timestamps: number[];
}

/**
 * Gap (seconds) above which two consecutive intraday bars are treated as
 * belonging to different sessions. Hourly bars sit 3600s apart inside a
 * session; the shortest real overnight break is several hours.
 */
export const SESSION_GAP_SECONDS = 4 * 3600;

/**
 * Split bar indices into sessions using time gaps rather than a timezone
 * conversion — no Intl call per bar, and correct across DST.
 */
export function splitSessions(timestamps: number[]): number[][] {
  const sessions: number[][] = [];
  let current: number[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    if (current.length > 0 && timestamps[i] - timestamps[i - 1] > SESSION_GAP_SECONDS) {
      sessions.push(current);
      current = [];
    }
    current.push(i);
  }
  if (current.length > 0) sessions.push(current);

  return sessions;
}

/**
 * Aggregate hourly bars into buckets of `barsPerBucket`, never merging across
 * a session boundary and never discarding the trailing partial bucket.
 *
 * A 6.5-hour RTH day at barsPerBucket=4 yields two candles (4 bars + 3 bars),
 * which is the honest reading of "4h" for US equities.
 */
export function aggregateSessions(series: OHLCSeries, barsPerBucket: number): OHLCSeries | null {
  if (barsPerBucket < 1) return null;
  const n = series.closes.length;
  if (n === 0) return null;

  const out: OHLCSeries = { opens: [], highs: [], lows: [], closes: [], timestamps: [] };

  for (const session of splitSessions(series.timestamps)) {
    for (let s = 0; s < session.length; s += barsPerBucket) {
      const group = session.slice(s, s + barsPerBucket);
      const first = group[0];
      const last = group[group.length - 1];

      let hi = series.highs[first];
      let lo = series.lows[first];
      for (const idx of group) {
        if (series.highs[idx] > hi) hi = series.highs[idx];
        if (series.lows[idx] < lo) lo = series.lows[idx];
      }

      out.opens.push(series.opens[first]);
      out.highs.push(hi);
      out.lows.push(lo);
      out.closes.push(series.closes[last]);
      out.timestamps.push(series.timestamps[last]);
    }
  }

  return out.closes.length > 0 ? out : null;
}
