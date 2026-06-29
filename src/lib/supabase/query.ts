/**
 * Supabase read functions for scanner data.
 * All reads return null/empty on failure — UI shows "Insufficient data" gracefully.
 */

import "server-only";

import { createClient } from "./server";

// ── Types ──

export interface HitRateData {
  scanner: string;
  mode: string | null;
  signal_strength: string | null;
  period_days: number;
  total_signals: number;
  hit_count: number;
  hit_rate: number;
  avg_return_pct: number;
  avg_max_drawdown_pct: number;
  computed_at: string;
}

export interface SITrendPoint {
  report_date: string;
  si_percent: number;
  days_to_cover: number | null;
  current_price: number | null;
}

export interface SectorHistoryPoint {
  snapshot_date: string;
  sector: string;
  etf_symbol: string;
  rs_ratio: number | null;
  rs_momentum: number | null;
  quadrant: string;
  momentum_score: number | null;
}

export interface FTDSettlement {
  ticker: string;
  failure_date: string;
  settlement_deadline: string;
  ftd_shares: number;
  ftd_pct_float: number | null;
}

export interface PendingSignal {
  id: string;
  scanner: string;
  ticker: string;
  signal_date: string;
  price_at_signal: number;
  mode: string | null;
  target1: number | null;
  target2: number | null;
  target3: number | null;
  invalidation: number | null;
}

// ── Read Functions ──

/** Fetch pre-computed hit rates for a scanner/mode combination. */
export async function fetchHitRates(
  scanner: string,
  mode?: string,
  signalStrength?: string
): Promise<HitRateData[]> {
  try {
    const supabase = await createClient();
    if (!supabase) return [];

    let query = supabase
      .from("scanner_hit_rates")
      .select("*")
      .eq("scanner", scanner);

    if (mode) query = query.eq("mode", mode);
    if (signalStrength) query = query.eq("signal_strength", signalStrength);

    const { data, error } = await query.order("period_days", { ascending: true });

    if (error) {
      console.error("[query] fetchHitRates error:", error.message);
      return [];
    }
    return (data ?? []) as HitRateData[];
  } catch (err) {
    console.error("[query] fetchHitRates exception:", err);
    return [];
  }
}

/** Fetch SI% trend for a ticker (last N entries, newest first). */
export async function fetchSITrend(ticker: string, limit = 5): Promise<SITrendPoint[]> {
  try {
    const supabase = await createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("si_history")
      .select("report_date, si_percent, days_to_cover, current_price")
      .eq("ticker", ticker)
      .order("report_date", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[query] fetchSITrend error:", error.message);
      return [];
    }
    return (data ?? []) as SITrendPoint[];
  } catch (err) {
    console.error("[query] fetchSITrend exception:", err);
    return [];
  }
}

/** Fetch SI% trends for multiple tickers at once. */
export async function fetchSITrendBatch(
  tickers: string[],
  limit = 3
): Promise<Record<string, SITrendPoint[]>> {
  if (tickers.length === 0) return {};

  try {
    const supabase = await createClient();
    if (!supabase) return {};

    const { data, error } = await supabase
      .from("si_history")
      .select("ticker, report_date, si_percent, days_to_cover, current_price")
      .in("ticker", tickers)
      .order("report_date", { ascending: false });

    if (error) {
      console.error("[query] fetchSITrendBatch error:", error.message);
      return {};
    }

    const grouped: Record<string, SITrendPoint[]> = {};
    for (const row of data ?? []) {
      const t = (row as { ticker: string }).ticker;
      if (!grouped[t]) grouped[t] = [];
      if (grouped[t].length < limit) {
        grouped[t].push(row as SITrendPoint);
      }
    }
    return grouped;
  } catch (err) {
    console.error("[query] fetchSITrendBatch exception:", err);
    return {};
  }
}

/** Fetch sector rotation history (last N snapshots for a sector). */
export async function fetchSectorHistory(sector: string, limit = 12): Promise<SectorHistoryPoint[]> {
  try {
    const supabase = await createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("sector_snapshots")
      .select("snapshot_date, sector, etf_symbol, rs_ratio, rs_momentum, quadrant, momentum_score")
      .eq("sector", sector)
      .order("snapshot_date", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[query] fetchSectorHistory error:", error.message);
      return [];
    }
    return (data ?? []) as SectorHistoryPoint[];
  } catch (err) {
    console.error("[query] fetchSectorHistory exception:", err);
    return [];
  }
}

/** Fetch all sector snapshots for a given date. */
export async function fetchSectorSnapshotByDate(
  date: string
): Promise<SectorHistoryPoint[]> {
  try {
    const supabase = await createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("sector_snapshots")
      .select("snapshot_date, sector, etf_symbol, rs_ratio, rs_momentum, quadrant, momentum_score")
      .eq("snapshot_date", date);

    if (error) {
      console.error("[query] fetchSectorSnapshotByDate error:", error.message);
      return [];
    }
    return (data ?? []) as SectorHistoryPoint[];
  } catch (err) {
    console.error("[query] fetchSectorSnapshotByDate exception:", err);
    return [];
  }
}

/** Fetch upcoming FTD settlements within N days. */
export async function fetchUpcomingFTDs(withinDays = 14): Promise<FTDSettlement[]> {
  try {
    const supabase = await createClient();
    if (!supabase) return [];

    const today = new Date().toISOString().slice(0, 10);
    const futureDate = new Date(Date.now() + withinDays * 86400000).toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("ftd_settlements")
      .select("ticker, failure_date, settlement_deadline, ftd_shares, ftd_pct_float")
      .gte("settlement_deadline", today)
      .lte("settlement_deadline", futureDate)
      .order("settlement_deadline", { ascending: true });

    if (error) {
      console.error("[query] fetchUpcomingFTDs error:", error.message);
      return [];
    }
    return (data ?? []) as FTDSettlement[];
  } catch (err) {
    console.error("[query] fetchUpcomingFTDs exception:", err);
    return [];
  }
}

/** Fetch FTD settlements for specific tickers. */
export async function fetchFTDsForTickers(
  tickers: string[],
  withinDays = 14
): Promise<FTDSettlement[]> {
  if (tickers.length === 0) return [];

  try {
    const supabase = await createClient();
    if (!supabase) return [];

    const today = new Date().toISOString().slice(0, 10);
    const futureDate = new Date(Date.now() + withinDays * 86400000).toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("ftd_settlements")
      .select("ticker, failure_date, settlement_deadline, ftd_shares, ftd_pct_float")
      .in("ticker", tickers)
      .gte("settlement_deadline", today)
      .lte("settlement_deadline", futureDate)
      .order("settlement_deadline", { ascending: true });

    if (error) {
      console.error("[query] fetchFTDsForTickers error:", error.message);
      return [];
    }
    return (data ?? []) as FTDSettlement[];
  } catch (err) {
    console.error("[query] fetchFTDsForTickers exception:", err);
    return [];
  }
}

/** Fetch pending signals that need outcome updates. */
export async function fetchPendingSignals(
  scanner?: string,
  olderThanDays = 7
): Promise<PendingSignal[]> {
  try {
    const supabase = await createClient();
    if (!supabase) return [];

    const cutoffDate = new Date(Date.now() - olderThanDays * 86400000).toISOString().slice(0, 10);

    let query = supabase
      .from("signal_outcomes")
      .select("id, scanner, ticker, signal_date, price_at_signal, mode, target1, target2, target3, invalidation")
      .lte("signal_date", cutoffDate)
      .is("price_7d", null);

    if (scanner) query = query.eq("scanner", scanner);

    const { data, error } = await query.limit(100);

    if (error) {
      console.error("[query] fetchPendingSignals error:", error.message);
      return [];
    }
    return (data ?? []) as PendingSignal[];
  } catch (err) {
    console.error("[query] fetchPendingSignals exception:", err);
    return [];
  }
}

/** Fetch signals with outcomes for hit rate computation. */
export async function fetchCompletedSignals(
  scanner: string,
  mode?: string,
  limit = 500
): Promise<Array<{
  scanner: string;
  mode: string | null;
  signal_strength: string | null;
  signal_date: string;
  price_at_signal: number;
  price_7d: number | null;
  price_30d: number | null;
  hit_target1: boolean | null;
  hit_target2: boolean | null;
  hit_target3: boolean | null;
  hit_invalidation: boolean | null;
  max_gain_pct: number | null;
  max_drawdown_pct: number | null;
}>> {
  try {
    const supabase = await createClient();
    if (!supabase) return [];

    let query = supabase
      .from("signal_outcomes")
      .select("scanner, mode, signal_strength, signal_date, price_at_signal, price_7d, price_30d, hit_target1, hit_target2, hit_target3, hit_invalidation, max_gain_pct, max_drawdown_pct")
      .eq("scanner", scanner)
      .not("price_7d", "is", null);

    if (mode) query = query.eq("mode", mode);

    const { data, error } = await query
      .order("signal_date", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[query] fetchCompletedSignals error:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("[query] fetchCompletedSignals exception:", err);
    return [];
  }
}

/** Fetch the most recent nightly prerun scan signals from signal_outcomes. */
export async function fetchLatestPrerunSignals(): Promise<{
  date: string | null;
  signals: { ticker: string; verdict: string; score: number; price: number; daysToEarnings: number | null; nextEarningsDate: string | null; rs20d: number | null }[];
}> {
  try {
    const supabase = await createClient();
    if (!supabase) return { date: null, signals: [] };

    // Get the most recent prerun scan date
    const { data: latest, error: latestErr } = await supabase
      .from("signal_outcomes")
      .select("signal_date")
      .eq("scanner", "prerun")
      .order("signal_date", { ascending: false })
      .limit(1);

    if (latestErr) {
      console.error("[query] fetchLatestPrerunSignals date error:", latestErr.message);
      return { date: null, signals: [] };
    }

    const date = latest?.[0]?.signal_date ?? null;
    if (!date) return { date: null, signals: [] };

    // Fetch all signals for that date
    const { data: rows, error: rowsErr } = await supabase
      .from("signal_outcomes")
      .select("ticker, signal_strength, score, price_at_signal, days_to_earnings, next_earnings_date, relative_strength_20d")
      .eq("scanner", "prerun")
      .eq("signal_date", date)
      .order("score", { ascending: false });

    if (rowsErr) {
      console.error("[query] fetchLatestPrerunSignals rows error:", rowsErr.message);
      return { date: null, signals: [] };
    }

    return {
      date,
      signals: (rows ?? []).map((r) => ({
        ticker: r.ticker,
        verdict: r.signal_strength ?? "WATCH",
        score: r.score ?? 0,
        price: r.price_at_signal,
        daysToEarnings: r.days_to_earnings ?? null,
        nextEarningsDate: r.next_earnings_date ?? null,
        rs20d: r.relative_strength_20d ?? null,
      })),
    };
  } catch (err) {
    console.error("[query] fetchLatestPrerunSignals exception:", err);
    return { date: null, signals: [] };
  }
}

/** Fetch the full nightly scan results (all tickers, not just qualifying). */
export async function fetchLatestNightlyScan(): Promise<{
  date: string | null;
  signals: { ticker: string; verdict: string; score: number; price: number; daysToEarnings: number | null; nextEarningsDate: string | null; rs20d: number | null }[];
}> {
  try {
    const supabase = await createClient();
    if (!supabase) return { date: null, signals: [] };

    // Get the most recent nightly-full scan date
    const { data: latest, error: latestErr } = await supabase
      .from("signal_outcomes")
      .select("signal_date")
      .eq("scanner", "prerun")
      .eq("mode", "nightly-full")
      .order("signal_date", { ascending: false })
      .limit(1);

    if (latestErr) {
      console.error("[query] fetchLatestNightlyScan date error:", latestErr.message);
      return { date: null, signals: [] };
    }

    const date = latest?.[0]?.signal_date ?? null;
    if (!date) return { date: null, signals: [] };

    // Fetch all signals for that date (paginate — could be 1,390+ rows)
    const allRows: { ticker: string; signal_strength: string | null; score: number | null; price_at_signal: number; days_to_earnings: number | null; next_earnings_date: string | null; relative_strength_20d: number | null }[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data: rows, error: rowsErr } = await supabase
        .from("signal_outcomes")
        .select("ticker, signal_strength, score, price_at_signal, days_to_earnings, next_earnings_date, relative_strength_20d")
        .eq("scanner", "prerun")
        .eq("mode", "nightly-full")
        .eq("signal_date", date)
        .order("score", { ascending: false })
        .range(from, from + pageSize - 1);

      if (rowsErr) {
        console.error("[query] fetchLatestNightlyScan rows error:", rowsErr.message);
        break;
      }

      if (!rows || rows.length === 0) break;
      allRows.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return {
      date,
      signals: allRows.map((r) => ({
        ticker: r.ticker,
        verdict: r.signal_strength ?? "WATCH",
        score: r.score ?? 0,
        price: r.price_at_signal,
        daysToEarnings: r.days_to_earnings ?? null,
        nextEarningsDate: r.next_earnings_date ?? null,
        rs20d: r.relative_strength_20d ?? null,
      })),
    };
  } catch (err) {
    console.error("[query] fetchLatestNightlyScan exception:", err);
    return { date: null, signals: [] };
  }
}

/** Fetch last N sector history entries where sector entered a specific quadrant. */
export async function fetchQuadrantEntries(
  sector: string,
  quadrant: string,
  limit = 5
): Promise<SectorHistoryPoint[]> {
  try {
    const supabase = await createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("sector_snapshots")
      .select("snapshot_date, sector, etf_symbol, rs_ratio, rs_momentum, quadrant, momentum_score")
      .eq("sector", sector)
      .eq("quadrant", quadrant)
      .order("snapshot_date", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[query] fetchQuadrantEntries error:", error.message);
      return [];
    }
    return (data ?? []) as SectorHistoryPoint[];
  } catch (err) {
    console.error("[query] fetchQuadrantEntries exception:", err);
    return [];
  }
}
